const express = require('express');
const cors = require('cors');
const db = require('../src/db-client');
const { generateToken, verifyToken } = require('../src/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Helper: Ensure auxiliary tables exist on startup
async function initTables() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS store_config (
        \`key\` VARCHAR(255) PRIMARY KEY,
        \`value\` TEXT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(100) NOT NULL,
        customer_email VARCHAR(255),
        total DECIMAL(12, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_code VARCHAR(255) NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        quantity DECIMAL(10, 2) NOT NULL,
        unit_price DECIMAL(12, 2) NOT NULL,
        total_price DECIMAL(12, 2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Insert initial default configs if empty
    const rows = await db.query('SELECT 1 FROM store_config LIMIT 1');
    if (rows.length === 0) {
      const defaults = [
        ['min_purchase', '5000'],
        ['discount_qty_1', '10'],
        ['discount_qty_2', '20'],
        ['store_hours', 'Lunes a Viernes: 09:00 a 18:00 hs'],
        ['store_address', 'Av. Principal 1234, Ciudad'],
        ['store_maps_url', 'https://maps.google.com'],
        ['whatsapp_number', '5491100000000'],
        ['instagram_url', 'https://instagram.com'],
        ['facebook_url', 'https://facebook.com']
      ];
      for (const [k, v] of defaults) {
        await db.query('INSERT IGNORE INTO store_config (`key`, `value`) VALUES (?, ?)', [k, v]);
      }
    }
  } catch (err) {
    console.error('Error initializing tables:', err);
  }
}

// Lazy initialization check
let tablesInitialized = false;
app.use(async (req, res, next) => {
  if (!tablesInitialized) {
    await initTables();
    tablesInitialized = true;
  }
  next();
});

// 1. GET /api/categories
app.get('/api/categories', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT DISTINCT product_type_path 
      FROM product_catalog_sync 
      WHERE product_type_path IS NOT NULL AND product_type_path != '' 
      ORDER BY product_type_path ASC
    `);
    const categories = rows.map(r => r.product_type_path);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar categorías', detail: err.message });
  }
});

// 2. GET /api/products?category=X&search=Y
app.get('/api/products', async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = `
      SELECT 
        id, 
        product_code, 
        product_name, 
        price AS local_price, 
        product_image_b_format_url, 
        product_type_path, 
        stock, 
        description, 
        brand 
      FROM product_catalog_sync 
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      params.push(category);
      query += ` AND product_type_path = ?`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (LOWER(product_name) LIKE LOWER(?) OR LOWER(product_code) LIKE LOWER(?))`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY product_name ASC LIMIT 100`;

    const rows = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar productos', detail: err.message });
  }
});

// 3. GET /api/config
app.get('/api/config', async (req, res) => {
  try {
    const rows = await db.query('SELECT `key`, `value` FROM store_config');
    const configObj = {};
    rows.forEach(r => {
      configObj[r.key] = r.value;
    });
    res.json(configObj);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener configuraciones', detail: err.message });
  }
});

// PUT /api/config (Protected)
app.put('/api/config', verifyToken, async (req, res) => {
  try {
    const configs = req.body;
    for (const [key, value] of Object.entries(configs)) {
      await db.query(`
        INSERT INTO store_config (\`key\`, \`value\`)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)
      `, [key, String(value)]);
    }
    res.json({ message: 'Configuraciones actualizadas exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar configuraciones', detail: err.message });
  }
});

// 4. POST /api/orders
app.post('/api/orders', async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { customer_name, customer_phone, customer_email, items } = req.body;

    if (!customer_name || !customer_phone || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Datos incompletos para procesar la orden' });
    }

    // Get store config for rules
    const [configRows] = await connection.execute('SELECT `key`, `value` FROM store_config');
    const config = {};
    configRows.forEach(r => { config[r.key] = r.value; });

    const minPurchase = parseFloat(config.min_purchase || '0');
    const discount1 = parseFloat(config.discount_qty_1 || '0');
    const discount2 = parseFloat(config.discount_qty_2 || '0');

    let calculatedTotal = 0;
    const processedItems = [];

    for (const item of items) {
      const [pRows] = await connection.execute('SELECT product_code, product_name, price FROM product_catalog_sync WHERE id = ? OR product_code = ?', [item.id || 0, item.product_code || '']);
      if (pRows.length === 0) continue;

      const product = pRows[0];
      const basePrice = parseFloat(product.price || 0);
      const qty = parseFloat(item.quantity || 1);

      let unitPrice = basePrice;
      if (qty >= 10 && discount2 > 0) {
        unitPrice = basePrice * (1 - discount2 / 100);
      } else if (qty >= 5 && discount1 > 0) {
        unitPrice = basePrice * (1 - discount1 / 100);
      }

      const itemTotal = unitPrice * qty;
      calculatedTotal += itemTotal;

      processedItems.push({
        product_code: product.product_code,
        product_name: product.product_name,
        quantity: qty,
        unit_price: unitPrice,
        total_price: itemTotal
      });
    }

    if (calculatedTotal < minPurchase) {
      connection.release();
      return res.status(400).json({ 
        error: `El monto total ($${calculatedTotal.toFixed(2)}) no alcanza el mínimo de compra ($${minPurchase.toFixed(2)})` 
      });
    }

    await connection.beginTransaction();

    const [orderRes] = await connection.execute(`
      INSERT INTO orders (customer_name, customer_phone, customer_email, total, status)
      VALUES (?, ?, ?, ?, 'pending')
    `, [customer_name, customer_phone, customer_email || null, calculatedTotal]);

    const orderId = orderRes.insertId;

    for (const pItem of processedItems) {
      await connection.execute(`
        INSERT INTO order_items (order_id, product_code, product_name, quantity, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [orderId, pItem.product_code, pItem.product_name, pItem.quantity, pItem.unit_price, pItem.total_price]);
    }

    await connection.commit();
    connection.release();

    res.json({
      message: 'Orden creada exitosamente',
      order_id: orderId,
      total: calculatedTotal,
      items: processedItems,
      whatsapp_number: config.whatsapp_number || ''
    });
  } catch (err) {
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: 'Error al procesar la orden', detail: err.message });
  }
});

// 5. POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD || '!39o.129mAacasu1048x$.';

  if (password === adminPass) {
    const token = generateToken({ role: 'admin' });
    return res.json({ token, message: 'Autenticación exitosa' });
  } else {
    return res.status(401).json({ error: 'Contraseña de administrador incorrecta' });
  }
});

module.exports = app;

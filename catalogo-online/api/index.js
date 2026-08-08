const express = require('express');
const cors = require('cors');
const db = require('../src/postgres-client');
const { generateToken, verifyToken } = require('../src/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Helper: Ensure auxiliary tables exist on startup
async function initTables() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS store_config (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(100) NOT NULL,
        customer_email VARCHAR(255),
        total NUMERIC(12, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_code VARCHAR(255) NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        quantity NUMERIC(10, 2) NOT NULL,
        unit_price NUMERIC(12, 2) NOT NULL,
        total_price NUMERIC(12, 2) NOT NULL
      );
    `);

    // Insert initial default configs if empty
    const { rowCount } = await db.query('SELECT 1 FROM store_config LIMIT 1');
    if (rowCount === 0) {
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
        await db.query('INSERT INTO store_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, v]);
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
    const result = await db.query(`
      SELECT DISTINCT product_type_path 
      FROM product_catalog_sync 
      WHERE product_type_path IS NOT NULL AND product_type_path != '' 
      ORDER BY product_type_path ASC
    `);
    const categories = result.rows.map(r => r.product_type_path);
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
      query += ` AND product_type_path = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (LOWER(product_name) LIKE LOWER($${params.length}) OR LOWER(product_code) LIKE LOWER($${params.length}))`;
    }

    query += ` ORDER BY product_name ASC LIMIT 100`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar productos', detail: err.message });
  }
});

// 3. GET /api/config
app.get('/api/config', async (req, res) => {
  try {
    const result = await db.query('SELECT key, value FROM store_config');
    const configObj = {};
    result.rows.forEach(r => {
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
    const configs = req.body; // { key: value, ... }
    for (const [key, value] of Object.entries(configs)) {
      await db.query(`
        INSERT INTO store_config (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `, [key, String(value)]);
    }
    res.json({ message: 'Configuraciones actualizadas exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar configuraciones', detail: err.message });
  }
});

// 4. POST /api/orders
app.post('/api/orders', async (req, res) => {
  const client = await db.getClient();
  try {
    const { customer_name, customer_phone, customer_email, items } = req.body;

    if (!customer_name || !customer_phone || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Datos incompletos para procesar la orden' });
    }

    // Get store config for rules
    const configRes = await client.query('SELECT key, value FROM store_config');
    const config = {};
    configRes.rows.forEach(r => { config[r.key] = r.value; });

    const minPurchase = parseFloat(config.min_purchase || '0');
    const discount1 = parseFloat(config.discount_qty_1 || '0'); // +5 units
    const discount2 = parseFloat(config.discount_qty_2 || '0'); // +10 units

    let calculatedTotal = 0;
    const processedItems = [];

    // Fetch products to validate prices
    for (const item of items) {
      const pRes = await client.query('SELECT product_code, product_name, price FROM product_catalog_sync WHERE id = $1 OR product_code = $2', [item.id || 0, item.product_code || '']);
      if (pRes.rowCount === 0) continue;

      const product = pRes.rows[0];
      const basePrice = parseFloat(product.price || 0);
      const qty = parseFloat(item.quantity || 1);

      // Apply wholesale discounts
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
      return res.status(400).json({ 
        error: `El monto total ($${calculatedTotal.toFixed(2)}) no alcanza el mínimo de compra ($${minPurchase.toFixed(2)})` 
      });
    }

    // Begin SQL Transaction
    await client.query('BEGIN');

    const orderRes = await client.query(`
      INSERT INTO orders (customer_name, customer_phone, customer_email, total, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING id, created_at
    `, [customer_name, customer_phone, customer_email || null, calculatedTotal]);

    const orderId = orderRes.rows[0].id;

    for (const pItem of processedItems) {
      await client.query(`
        INSERT INTO order_items (order_id, product_code, product_name, quantity, unit_price, total_price)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [orderId, pItem.product_code, pItem.product_name, pItem.quantity, pItem.unit_price, pItem.total_price]);
    }

    await client.query('COMMIT');

    res.json({
      message: 'Orden creada exitosamente',
      order_id: orderId,
      total: calculatedTotal,
      items: processedItems,
      whatsapp_number: config.whatsapp_number || ''
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Error al procesar la orden', detail: err.message });
  } finally {
    client.release();
  }
});

// 5. POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

  if (password === adminPass) {
    const token = generateToken({ role: 'admin' });
    return res.json({ token, message: 'Autenticación exitosa' });
  } else {
    return res.status(401).json({ error: 'Contraseña de administrador incorrecta' });
  }
});

module.exports = app;

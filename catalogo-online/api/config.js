const db = require('../src/db-client');
const { verifyToken } = require('../src/auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const rows = await db.query('SELECT `key`, `value` FROM store_config');
      const configObj = {};
      rows.forEach(r => { configObj[r.key] = r.value; });
      return res.status(200).json(configObj);
    } catch (err) {
      return res.status(200).json({
        min_purchase: '15000',
        discount_qty_1: '10',
        discount_qty_2: '20'
      });
    }
  }

  if (req.method === 'PUT') {
    return verifyToken(req, res, async () => {
      try {
        const configs = req.body;
        for (const [key, value] of Object.entries(configs)) {
          await db.query(`
            INSERT INTO store_config (\`key\`, \`value\`)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)
          `, [key, String(value)]);
        }
        res.status(200).json({ message: 'Configuraciones actualizadas' });
      } catch (err) {
        res.status(500).json({ error: 'Error al actualizar', detail: err.message });
      }
    });
  }

  res.status(405).end();
};

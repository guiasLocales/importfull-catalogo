const db = require('../src/db-client');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const rows = await db.query('SELECT COUNT(*) AS total FROM product_catalog_sync');
    const sample = await db.query('SELECT product_name, price FROM product_catalog_sync WHERE price > 0 LIMIT 5');
    
    res.status(200).json({
      status: 'SUCCESS',
      total_products: rows[0].total,
      sample_products_with_price_column: sample,
      host_connected: process.env.DB_HOST || process.env.Host || '34.55.226.178'
    });
  } catch (err) {
    res.status(500).json({
      status: 'ERROR',
      message: err.message,
      code: err.code,
      host_attempted: process.env.DB_HOST || process.env.Host || '34.55.226.178'
    });
  }
};

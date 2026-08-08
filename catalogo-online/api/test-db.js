const db = require('../src/db-client');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    const rows = await db.query('SELECT COUNT(*) AS total FROM product_catalog_sync');
    const sample = await db.query('SELECT product_name, price FROM product_catalog_sync WHERE price IS NOT NULL AND price > 0 LIMIT 5');
    
    res.status(200).json({
      status: 'SUCCESS',
      total_products: rows[0].total,
      sample_products_with_price_column: sample
    });
  } catch (err) {
    res.status(200).json({
      status: 'DATABASE_ERROR',
      error_message: err.message,
      error_code: err.code,
      error_errno: err.errno,
      error_syscall: err.syscall
    });
  }
};

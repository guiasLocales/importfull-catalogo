const db = require('../src/db-client');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const rows = await db.query(`
      SELECT DISTINCT product_type_path 
      FROM product_catalog_sync 
      WHERE product_type_path IS NOT NULL AND product_type_path != '' 
      ORDER BY product_type_path ASC
    `);
    const categories = rows.map(r => r.product_type_path);
    res.status(200).json(categories);
  } catch (err) {
    console.error('Categories Query Error:', err);
    res.status(200).json(["BAZAR","BELLEZA","BIJOUTERIE","COTILLON","DESCARTABLE","ELECTRONICA","FERRETERIA","INDUMENTARIA","JUGUETERIA","LIBRERIA","NAVIDAD","TELEFONIA"]);
  }
};

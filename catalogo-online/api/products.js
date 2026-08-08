const db = require('../src/db-client');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

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
      params.push(`%${category}%`);
      query += ` AND LOWER(product_type_path) LIKE LOWER(?)`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (LOWER(product_name) LIKE LOWER(?) OR LOWER(product_code) LIKE LOWER(?))`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY product_name ASC LIMIT 250`;

    const rows = await db.query(query, params);
    res.status(200).json(rows);
  } catch (err) {
    console.error('Products Query Error:', err);
    res.status(200).json([]);
  }
};

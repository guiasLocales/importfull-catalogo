const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { category, search } = req.query;

  let sql = "SELECT id, product_code, product_name, price AS local_price, product_image_b_format_url, product_type_path, stock, description, brand, meli_id FROM product_catalog_sync WHERE price IS NOT NULL AND price > 0 AND stock IS NOT NULL AND stock > 0";

  if (category) {
    const cleanCat = category.replace(/'/g, "''").toLowerCase();
    sql += ` AND LOWER(product_type_path) LIKE '%${cleanCat}%'`;
  }
  if (search) {
    const cleanSearch = search.replace(/'/g, "''").toLowerCase();
    sql += ` AND (LOWER(product_name) LIKE '%${cleanSearch}%' OR LOWER(product_code) LIKE '%${cleanSearch}%')`;
  }

  sql += " ORDER BY product_name ASC LIMIT 5000";

  const targetUrl = `https://inventory-app-418609185384.us-central1.run.app/api/test-db-query?query=${encodeURIComponent(sql)}`;

  https.get(targetUrl, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.status === 'success' && Array.isArray(json.rows)) {
          return res.status(200).json(json.rows);
        }
        res.status(200).json([]);
      } catch (e) {
        res.status(200).json([]);
      }
    });
  }).on('error', (err) => {
    console.error('Error fetching live products with meli_id:', err);
    res.status(200).json([]);
  });
};

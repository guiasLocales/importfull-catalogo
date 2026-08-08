const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = "SELECT DISTINCT product_type_path FROM product_catalog_sync WHERE product_type_path IS NOT NULL AND product_type_path != '' ORDER BY product_type_path ASC";
  const targetUrl = `https://inventory-app-418609185384.us-central1.run.app/api/test-db-query?query=${encodeURIComponent(sql)}`;

  https.get(targetUrl, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.status === 'success' && Array.isArray(json.rows)) {
          const categories = json.rows.map(r => r.product_type_path);
          return res.status(200).json(categories);
        }
        res.status(200).json(["BAZAR","BELLEZA","BIJOUTERIE","COTILLON","DESCARTABLE","ELECTRONICA","FERRETERIA","INDUMENTARIA","JUGUETERIA","LIBRERIA","NAVIDAD","TELEFONIA"]);
      } catch (e) {
        res.status(200).json(["BAZAR","BELLEZA","BIJOUTERIE","COTILLON","DESCARTABLE","ELECTRONICA","FERRETERIA","INDUMENTARIA","JUGUETERIA","LIBRERIA","NAVIDAD","TELEFONIA"]);
      }
    });
  }).on('error', (err) => {
    res.status(200).json(["BAZAR","BELLEZA","BIJOUTERIE","COTILLON","DESCARTABLE","ELECTRONICA","FERRETERIA","INDUMENTARIA","JUGUETERIA","LIBRERIA","NAVIDAD","TELEFONIA"]);
  });
};

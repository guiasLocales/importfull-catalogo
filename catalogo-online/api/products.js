const http = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { category, search } = req.query;
  let url = 'https://inventory-app-418609185384.us-central1.run.app/api/public/products?';
  if (category) url += `category=${encodeURIComponent(category)}&`;
  if (search) url += `search=${encodeURIComponent(search)}`;

  http.get(url, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const products = JSON.parse(data);
        res.status(200).json(products);
      } catch (e) {
        res.status(200).json([]);
      }
    });
  }).on('error', () => {
    res.status(200).json([]);
  });
};

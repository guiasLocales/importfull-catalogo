const http = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const cloudRunUrl = 'https://inventory-app-418609185384.us-central1.run.app/api/public/categories';

  http.get(cloudRunUrl, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const categories = JSON.parse(data);
        res.status(200).json(categories);
      } catch (e) {
        res.status(200).json(["BAZAR","BELLEZA","BIJOUTERIE","COTILLON","DESCARTABLE","ELECTRONICA","FERRETERIA","INDUMENTARIA","JUGUETERIA","LIBRERIA","NAVIDAD","TELEFONIA"]);
      }
    });
  }).on('error', () => {
    res.status(200).json(["BAZAR","BELLEZA","BIJOUTERIE","COTILLON","DESCARTABLE","ELECTRONICA","FERRETERIA","INDUMENTARIA","JUGUETERIA","LIBRERIA","NAVIDAD","TELEFONIA"]);
  });
};

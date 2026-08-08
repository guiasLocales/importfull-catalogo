const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return new Promise((resolve) => {
      https.get('https://inventory-app-418609185384.us-central1.run.app/api/public/config', (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => { data += chunk; });
        apiRes.on('end', () => {
          try {
            const json = JSON.parse(data);
            res.status(200).json(json);
            resolve();
          } catch (e) {
            res.status(200).json({ min_purchase: '15000', whatsapp_number: '5493513082238' });
            resolve();
          }
        });
      }).on('error', () => {
        res.status(200).json({ min_purchase: '15000', whatsapp_number: '5493513082238' });
        resolve();
      });
    });
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    return new Promise((resolve) => {
      let bodyData = req.body;
      if (typeof bodyData === 'string') {
        try { bodyData = JSON.parse(bodyData); } catch (e) {}
      }

      const payloadData = JSON.stringify(bodyData || {});
      const options = {
        hostname: 'inventory-app-418609185384.us-central1.run.app',
        port: 443,
        path: '/api/public/config',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payloadData)
        }
      };

      const postReq = https.request(options, (apiRes) => {
        let responseBody = '';
        apiRes.on('data', chunk => { responseBody += chunk; });
        apiRes.on('end', () => {
          res.status(200).json({ message: 'Configuraciones guardadas exitosamente', cloudResponse: responseBody });
          resolve();
        });
      });

      postReq.on('error', (e) => {
        res.status(500).json({ error: 'Error al enviar configuraciones', detail: e.message });
        resolve();
      });

      postReq.write(payloadData);
      postReq.end();
    });
  }

  return res.status(405).end();
};

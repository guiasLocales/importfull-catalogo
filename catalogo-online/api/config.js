const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    https.get('https://inventory-app-418609185384.us-central1.run.app/api/public/config', (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => { data += chunk; });
      apiRes.on('end', () => {
        try {
          const json = JSON.parse(data);
          return res.status(200).json(json);
        } catch (e) {
          return res.status(200).json({ min_purchase: '15000', whatsapp_number: '5493513082238' });
        }
      });
    }).on('error', () => {
      return res.status(200).json({ min_purchase: '15000', whatsapp_number: '5493513082238' });
    });
    return;
  }

  if (req.method === 'PUT') {
    const authHeader = req.headers.authorization || '';
    if (!authHeader || (!authHeader.includes('admin_session_') && !authHeader.includes('Bearer'))) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    try {
      const payloadData = JSON.stringify(req.body || {});
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
          return res.status(200).json({ message: 'Configuraciones guardadas exitosamente' });
        });
      });

      postReq.on('error', (e) => {
        return res.status(500).json({ error: 'Error al enviar configuraciones', detail: e.message });
      });

      postReq.write(payloadData);
      postReq.end();
    } catch (err) {
      return res.status(500).json({ error: 'Error al procesar configuraciones', detail: err.message });
    }
    return;
  }

  return res.status(405).end();
};

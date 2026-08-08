const https = require('https');

function execCloudRunQuery(sql) {
  return new Promise((resolve) => {
    const targetUrl = `https://inventory-app-418609185384.us-central1.run.app/api/test-db-query?query=${encodeURIComponent(sql)}`;
    https.get(targetUrl, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => { data += chunk; });
      apiRes.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'success' && Array.isArray(json.rows)) {
            return resolve({ success: true, rows: json.rows });
          }
          resolve({ success: false, rows: [] });
        } catch (e) {
          resolve({ success: false, rows: [] });
        }
      });
    }).on('error', () => {
      resolve({ success: false, rows: [] });
    });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const result = await execCloudRunQuery('SELECT `key`, `value` FROM store_config');
    const configObj = {
      min_purchase: '15000',
      whatsapp_number: '5493513082238'
    };

    if (result.success && Array.isArray(result.rows)) {
      result.rows.forEach(r => {
        if (r.key && r.value !== undefined) {
          configObj[r.key] = r.value;
        }
      });
    }
    return res.status(200).json(configObj);
  }

  if (req.method === 'PUT') {
    const authHeader = req.headers.authorization || '';
    if (!authHeader || (!authHeader.includes('admin_session_') && !authHeader.includes('Bearer'))) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    try {
      const configs = req.body || {};
      for (const [key, value] of Object.entries(configs)) {
        if (!key) continue;
        const cleanKey = key.replace(/'/g, "''");
        const cleanVal = String(value || '').replace(/'/g, "''");
        
        const sql = `INSERT INTO store_config (\`key\`, \`value\`) VALUES ('${cleanKey}', '${cleanVal}') ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`;
        await execCloudRunQuery(sql);
      }
      return res.status(200).json({ message: 'Configuraciones actualizadas exitosamente' });
    } catch (err) {
      return res.status(500).json({ error: 'Error al actualizar configuraciones', detail: err.message });
    }
  }

  return res.status(405).end();
};

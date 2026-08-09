const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join('/tmp', 'store_config.json');

let inMemoryConfig = {
  min_purchase: '15000',
  whatsapp_number: '5493513082238',
  store_address: 'Pasteur 320, Balvanera, CABA',
  store_hours: 'Lunes a sábados: 09:00 a 21:30 hs. • Domingos: 10:00 a 20:00 hs.'
};

function getActiveConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      return { ...inMemoryConfig, ...JSON.parse(raw) };
    }
  } catch (e) {}
  return inMemoryConfig;
}

function updateActiveConfig(newData) {
  try {
    const current = getActiveConfig();
    const merged = { ...current, ...newData };
    inMemoryConfig = merged;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged), 'utf8');
    return merged;
  } catch (e) {
    inMemoryConfig = { ...inMemoryConfig, ...newData };
    return inMemoryConfig;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json(getActiveConfig());
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      let bodyData = req.body;
      if (typeof bodyData === 'string') {
        try { bodyData = JSON.parse(bodyData); } catch (e) {}
      }

      if (bodyData && typeof bodyData === 'object') {
        const saved = updateActiveConfig(bodyData);
        return res.status(200).json({ 
          message: 'Configuraciones guardadas exitosamente',
          config: saved
        });
      }

      return res.status(200).json({ message: 'No data received', config: getActiveConfig() });
    } catch (err) {
      return res.status(500).json({ error: 'Error al procesar configuraciones' });
    }
  }

  return res.status(405).end();
};

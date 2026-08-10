const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join('/tmp', 'store_config.json');

const defaultLogoLight = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 90'><rect x='5' y='5' width='80' height='80' rx='16' fill='%23f97316'/><text x='45' y='60' font-family='sans-serif' font-weight='900' font-size='46' fill='%23ffffff' text-anchor='middle'>IF</text><text x='110' y='58' font-family='sans-serif' font-weight='800' font-size='40' fill='%230f172a'>IMPORT <tspan fill='%23f97316'>FULL</tspan></text></svg>";

const defaultLogoDark = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 90'><rect x='5' y='5' width='80' height='80' rx='16' fill='%23f97316'/><text x='45' y='60' font-family='sans-serif' font-weight='900' font-size='46' fill='%23ffffff' text-anchor='middle'>IF</text><text x='110' y='58' font-family='sans-serif' font-weight='800' font-size='40' fill='%23ffffff'>IMPORT <tspan fill='%23f97316'>FULL</tspan></text></svg>";

let inMemoryConfig = {
  logo_light_url: defaultLogoLight,
  logo_dark_url: defaultLogoDark,
  min_purchase: '15000',
  whatsapp_number: '5493513082238',
  store_address: 'Pasteur 320, Balvanera, CABA',
  store_hours: 'Lunes a sábados: 09:00 a 21:30 hs. • Domingos: 10:00 a 20:00 hs.'
};

function getActiveConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...inMemoryConfig,
        ...parsed,
        logo_light_url: (parsed.logo_light_url && parsed.logo_light_url.trim() !== '') ? parsed.logo_light_url : defaultLogoLight,
        logo_dark_url: (parsed.logo_dark_url && parsed.logo_dark_url.trim() !== '') ? parsed.logo_dark_url : defaultLogoDark
      };
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

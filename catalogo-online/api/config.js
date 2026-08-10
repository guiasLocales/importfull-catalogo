const fs = require('fs');
const path = require('path');
const http = require('https');

const CONFIG_PATH = path.join('/tmp', 'store_config.json');
const CLOUD_RUN_CONFIG_URL = 'https://inventory-app-418609185384.us-central1.run.app/api/public/config';

const defaultLogoLight = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 90'><rect x='5' y='5' width='80' height='80' rx='16' fill='%23f97316'/><text x='45' y='60' font-family='sans-serif' font-weight='900' font-size='46' fill='%23ffffff' text-anchor='middle'>IF</text><text x='110' y='58' font-family='sans-serif' font-weight='800' font-size='40' fill='%230f172a'>IMPORT <tspan fill='%23f97316'>FULL</tspan></text></svg>";

const defaultLogoDark = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 90'><rect x='5' y='5' width='80' height='80' rx='16' fill='%23f97316'/><text x='45' y='60' font-family='sans-serif' font-weight='900' font-size='46' fill='%23ffffff' text-anchor='middle'>IF</text><text x='110' y='58' font-family='sans-serif' font-weight='800' font-size='40' fill='%23ffffff'>IMPORT <tspan fill='%23f97316'>FULL</tspan></text></svg>";

const defaultCategoryImages = {
  cat_img_BAZAR: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80',
  cat_img_BELLEZA: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&q=80',
  cat_img_JUGUETERIA: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=600&q=80',
  cat_img_BIJOUTERIE: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=600&q=80',
  cat_img_ELECTRONICA: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
  cat_img_LIBRERIA: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80',
  cat_img_COTILLON: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=600&q=80',
  cat_img_FERRETERIA: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
  cat_img_INDUMENTARIA: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=600&q=80',
  cat_img_NAVIDAD: 'https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=600&q=80',
  cat_img_TELEFONIA: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80',
  cat_img_DESCARTABLE: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80'
};

let inMemoryConfig = {
  logo_light_url: defaultLogoLight,
  logo_dark_url: defaultLogoDark,
  min_purchase: '15000',
  whatsapp_number: '5493513082238',
  whatsapp_message_template: 'Hola! Quiero realizar un pedido en IMPORT FULL:\n\n*Cliente:* {nombre}\n*Dirección:* {direccion}\n\n*Detalle del Pedido:*\n{productos}\n\n*Total Estimado:* ${total}',
  store_address: 'Pasteur 320, Balvanera, CABA',
  store_hours: 'Lunes a sábados: 09:00 a 21:30 hs. • Domingos: 10:00 a 20:00 hs.',
  instagram_url: '',
  facebook_url: '',
  website_url: 'https://guiaslocales.com.ar',
  ...defaultCategoryImages
};

async function fetchFromDatabase() {
  try {
    const res = await fetch(CLOUD_RUN_CONFIG_URL);
    if (res.ok) {
      const remote = await res.json();
      if (remote && typeof remote === 'object' && Object.keys(remote).length > 0) {
        inMemoryConfig = { ...inMemoryConfig, ...remote };
        try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(inMemoryConfig), 'utf8'); } catch (e) {}
      }
    }
  } catch (e) {}
}

async function saveToDatabase(data) {
  try {
    await fetch(CLOUD_RUN_CONFIG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (e) {}
}

function getActiveConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...inMemoryConfig,
        ...parsed
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
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged), 'utf8'); } catch (e) {}
    saveToDatabase(merged);
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
    await fetchFromDatabase();
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
          message: 'Configuraciones guardadas permanentemente',
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

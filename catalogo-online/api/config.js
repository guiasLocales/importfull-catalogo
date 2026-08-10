const fs = require('fs');
const path = require('path');
const http = require('https');

const CONFIG_PATH = path.join('/tmp', 'store_config.json');
const CLOUD_RUN_CONFIG_URL = 'https://inventory-app-418609185384.us-central1.run.app/api/public/config';

const defaultLogoLight = "/images/logo.webp";
const defaultLogoDark = "/images/lodo dark.png";

const defaultCategoryImages = {
  cat_img_BAZAR: '/images/bazar.avif',
  cat_img_BELLEZA: '/images/belleza.avif',
  cat_img_JUGUETERIA: '/images/jugueteria.avif',
  cat_img_BIJOUTERIE: '/images/bijouterie.avif',
  cat_img_ELECTRONICA: '/images/electronica.avif',
  cat_img_LIBRERIA: '/images/1920 (10).avif',
  cat_img_COTILLON: '/images/cotillon.avif',
  cat_img_FERRETERIA: '/images/ferreteria.avif',
  cat_img_INDUMENTARIA: '/images/1920 (10).avif',
  cat_img_NAVIDAD: '/images/navidad.avif',
  cat_img_TELEFONIA: '/images/telefonia.avif',
  cat_img_DESCARTABLE: '/images/descartables.avif'
};

let inMemoryConfig = {
  logo_light_url: defaultLogoLight,
  logo_dark_url: defaultLogoDark,
  min_purchase: '15000',
  whatsapp_number: '543518103011',
  whatsapp_message_template: 'Hola! Quiero realizar un pedido en IMPORT FULL:\n\n*Cliente:* {nombre}\n*Dirección:* {direccion}\n\n*Detalle del Pedido:*\n{productos}\n\n*Total Estimado:* ${total}',
  store_address: 'Luis de Góngora 627, B° Alta Córdoba, Córdoba Capital',
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

let globalStoreConfig = {
  min_purchase: '15000',
  whatsapp_number: '5493513082238',
  store_address: 'Pasteur 320, Balvanera, CABA',
  store_hours: 'Lunes a Viernes de 9:00 a 18:00 hs. Sábados de 9:00 a 13:00 hs.'
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json(globalStoreConfig);
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      let bodyData = req.body;
      if (typeof bodyData === 'string') {
        try { bodyData = JSON.parse(bodyData); } catch (e) {}
      }

      if (bodyData && typeof bodyData === 'object') {
        globalStoreConfig = { ...globalStoreConfig, ...bodyData };
      }

      return res.status(200).json({ 
        message: 'Configuraciones guardadas exitosamente',
        config: globalStoreConfig
      });
    } catch (err) {
      return res.status(500).json({ error: 'Error al procesar configuraciones' });
    }
  }

  return res.status(405).end();
};

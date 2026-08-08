const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_admin_key_default_change_me';

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token requerido' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = {
  generateToken,
  verifyToken
};

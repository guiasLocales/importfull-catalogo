const mysql = require('mysql2/promise');

const pool = mysql.createPool(
  process.env.DATABASE_URL || {
    host: process.env.DB_HOST || '34.55.226.178',
    user: process.env.DB_USER || 'leandro_guias',
    password: process.env.DB_PASSWORD || '!39o.129mAacasu1048x$.',
    database: process.env.DB_NAME || 'app_import',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false }
  }
);

module.exports = {
  query: async (sql, params) => {
    const [rows] = await pool.execute(sql, params);
    return rows;
  },
  pool
};

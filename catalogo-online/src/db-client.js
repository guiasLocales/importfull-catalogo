const mysql = require('mysql2/promise');

const host = process.env.DB_HOST || process.env.Host || '34.55.226.178';
const user = process.env.DB_USER || process.env.User || 'leandro_guias';
const password = process.env.DB_PASSWORD || '!39o.129mAacasu1048x$.';
const database = process.env.DB_NAME || 'app_import';

const pool = mysql.createPool({
  host,
  user,
  password,
  database,
  port: 3306,
  waitForConnections: true,
  connectionLimit: 5,
  connectTimeout: 10000,
  ssl: false
});

module.exports = {
  query: async (sql, params) => {
    const [rows] = await pool.execute(sql, params);
    return rows;
  },
  pool
};

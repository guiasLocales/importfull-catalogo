const mysql = require('mysql2/promise');

async function query(sql, params) {
  const host = process.env.DB_HOST || process.env.Host || '34.55.226.178';
  const user = process.env.DB_USER || process.env.User || 'leandro_guias';
  const password = process.env.DB_PASSWORD || '!39o.129mAacasu1048x$.';
  const database = process.env.DB_NAME || 'app_import';

  const connection = await mysql.createConnection({
    host,
    user,
    password,
    database,
    port: 3306,
    connectTimeout: 12000,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const [rows] = await connection.execute(sql, params);
    await connection.end();
    return rows;
  } catch (err) {
    try { await connection.end(); } catch (e) {}
    throw err;
  }
}

module.exports = { query };

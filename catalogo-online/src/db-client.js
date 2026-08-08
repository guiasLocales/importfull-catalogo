const mysql = require('mysql2/promise');

const connectionUri = process.env.DATABASE_URL || 'mysql://leandro_guias:!39o.129mAacasu1048x$.@34.55.226.178:3306/app_import';

async function query(sql, params) {
  let connection;
  try {
    connection = await mysql.createConnection(connectionUri);
    const [rows] = await connection.execute(sql, params);
    await connection.end();
    return rows;
  } catch (err) {
    if (connection) {
      try { await connection.end(); } catch (e) {}
    }
    throw err;
  }
}

module.exports = { query };

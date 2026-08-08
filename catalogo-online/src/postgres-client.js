const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect()
};

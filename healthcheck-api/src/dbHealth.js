const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

let pool;

function getMissingDbConfig() {
  const missing = [];

  if (!DB_CONFIG.host) missing.push('DB_HOST');
  if (!DB_CONFIG.user) missing.push('DB_USER');
  if (!DB_CONFIG.password) missing.push('DB_PASSWORD');
  if (!DB_CONFIG.database) missing.push('DB_NAME');

  return missing;
}

function getPool() {
  if (pool) return pool;

  const missing = getMissingDbConfig();

  if (missing.length) {
    throw new Error(`missing env: ${missing.join(', ')}`);
  }

  pool = mysql.createPool({
    ...DB_CONFIG,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  return pool;
}

async function checkDbHealth() {
  const missing = getMissingDbConfig();

  if (missing.length) {
    return { status: 'error', message: `missing env: ${missing.join(', ')}` };
  }

  try {
    const conn = await getPool().getConnection();

    try {
      await conn.query('SELECT 1');
      return { status: 'ok' };
    } finally {
      conn.release();
    }
  } catch (err) {
    return {
      status: 'error',
      message: err.code || err.message,
    };
  }
}

module.exports = { checkDbHealth };

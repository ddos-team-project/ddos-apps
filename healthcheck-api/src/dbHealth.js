const mysql = require('mysql2/promise');

const DB_WRITER_CONFIG = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

const DB_READER_CONFIG = {
  host: process.env.DB_READER_HOST || process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

let writerPool;
let readerPool;

function getMissingDbConfig() {
  const missing = [];

  if (!DB_WRITER_CONFIG.host) missing.push('DB_HOST');
  if (!DB_WRITER_CONFIG.user) missing.push('DB_USER');
  if (!DB_WRITER_CONFIG.password) missing.push('DB_PASSWORD');
  if (!DB_WRITER_CONFIG.database) missing.push('DB_NAME');

  return missing;
}

function getWriterPool() {
  if (writerPool) return writerPool;

  const missing = getMissingDbConfig();

  if (missing.length) {
    throw new Error(`missing env: ${missing.join(', ')}`);
  }

  writerPool = mysql.createPool({
    ...DB_WRITER_CONFIG,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
  });

  return writerPool;
}

function getReaderPool() {
  if (readerPool) return readerPool;

  const missing = getMissingDbConfig();

  if (missing.length) {
    throw new Error(`missing env: ${missing.join(', ')}`);
  }

  readerPool = mysql.createPool({
    ...DB_READER_CONFIG,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
  });

  return readerPool;
}

// 기존 getPool은 writerPool로 대체 (하위 호환)
function getPool() {
  return getWriterPool();
}

async function checkDbHealth() {
  const missing = getMissingDbConfig();

  if (missing.length) {
    return { status: 'error', message: `missing env: ${missing.join(', ')}` };
  }

  try {
    const conn = await getWriterPool().getConnection();

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

module.exports = { checkDbHealth, getWriterPool, getReaderPool, getPool };

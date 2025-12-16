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

const DB_TOKYO_READER_CONFIG = {
  host: process.env.DB_TOKYO_READER_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

let writerPool;
let readerPool;
let tokyoReaderPool;

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

  const pool = mysql.createPool({
    ...DB_WRITER_CONFIG,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
  });

  // Aurora Global Database Write Forwarding 활성화
  // Secondary 클러스터에서 쓰기 시 Primary로 전달
  const originalGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = async function () {
    const conn = await originalGetConnection();
    try {
      await conn.query("SET aurora_replica_read_consistency = 'SESSION'");
    } catch (e) {
      // Primary 클러스터에서는 이 변수가 없을 수 있음
    }
    return conn;
  };

  writerPool = pool;
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

function getTokyoReaderPool() {
  if (tokyoReaderPool) return tokyoReaderPool;

  if (!DB_TOKYO_READER_CONFIG.host) {
    throw new Error('missing env: DB_TOKYO_READER_HOST');
  }

  const missing = getMissingDbConfig();
  if (missing.length) {
    throw new Error(`missing env: ${missing.join(', ')}`);
  }

  tokyoReaderPool = mysql.createPool({
    ...DB_TOKYO_READER_CONFIG,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    connectTimeout: 10000,
  });

  return tokyoReaderPool;
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

module.exports = { checkDbHealth, getWriterPool, getReaderPool, getTokyoReaderPool, getPool };

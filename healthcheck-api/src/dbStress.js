const { getWriterPool } = require('./dbHealth');

const TABLE_NAME = 'stress_test_logs';

/**
 * 스트레스 테스트용 테이블 생성 (없으면)
 */
async function ensureTable(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        test_id VARCHAR(36) NOT NULL,
        data VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_test_id (test_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB
    `);
  } finally {
    conn.release();
  }
}

/**
 * 대량 INSERT 수행
 */
async function runWriteStress(pool, testId, count) {
  const batchSize = 100;
  const batches = Math.ceil(count / batchSize);
  let inserted = 0;

  for (let b = 0; b < batches; b++) {
    const currentBatch = Math.min(batchSize, count - inserted);
    const values = [];
    const placeholders = [];

    for (let i = 0; i < currentBatch; i++) {
      values.push(testId, `stress-data-${Date.now()}-${i}`);
      placeholders.push('(?, ?)');
    }

    const conn = await pool.getConnection();
    try {
      await conn.query(
        `INSERT INTO ${TABLE_NAME} (test_id, data) VALUES ${placeholders.join(', ')}`,
        values
      );
      inserted += currentBatch;
    } finally {
      conn.release();
    }
  }

  return inserted;
}

/**
 * 대량 SELECT 수행
 */
async function runReadStress(pool, count) {
  let reads = 0;

  for (let i = 0; i < count; i++) {
    const conn = await pool.getConnection();
    try {
      await conn.query(
        `SELECT * FROM ${TABLE_NAME} ORDER BY created_at DESC LIMIT 100`
      );
      reads++;
    } finally {
      conn.release();
    }
  }

  return reads;
}

/**
 * 혼합 작업 (Write 70%, Read 30%)
 */
async function runMixedStress(pool, testId, count) {
  const writeCount = Math.floor(count * 0.7);
  const readCount = count - writeCount;

  const writePromise = runWriteStress(pool, testId, writeCount);
  const readPromise = runReadStress(pool, readCount);

  const [writes, reads] = await Promise.all([writePromise, readPromise]);
  return { writes, reads };
}

/**
 * DB 스트레스 테스트 실행
 * @param {object} options - 테스트 옵션
 * @param {number} options.operations - 총 작업 수
 * @param {number} options.concurrency - 동시 실행 수
 * @param {string} options.type - write | read | mixed
 */
async function runDbStress({ operations = 1000, concurrency = 10, type = 'mixed' }) {
  const pool = getWriterPool();
  const testId = `stress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await ensureTable(pool);

  const startTime = Date.now();
  const opsPerWorker = Math.ceil(operations / concurrency);
  const workers = [];

  for (let i = 0; i < concurrency; i++) {
    const workerOps = Math.min(opsPerWorker, operations - i * opsPerWorker);
    if (workerOps <= 0) break;

    if (type === 'write') {
      workers.push(runWriteStress(pool, testId, workerOps));
    } else if (type === 'read') {
      workers.push(runReadStress(pool, workerOps));
    } else {
      workers.push(runMixedStress(pool, testId, workerOps));
    }
  }

  const results = await Promise.all(workers);
  const elapsed = Date.now() - startTime;

  let totalWrites = 0;
  let totalReads = 0;

  results.forEach((r) => {
    if (typeof r === 'number') {
      if (type === 'write') totalWrites += r;
      else totalReads += r;
    } else {
      totalWrites += r.writes || 0;
      totalReads += r.reads || 0;
    }
  });

  return {
    testId,
    type,
    operations,
    concurrency,
    totalWrites,
    totalReads,
    elapsedMs: elapsed,
    opsPerSecond: Math.round((totalWrites + totalReads) / (elapsed / 1000)),
  };
}

/**
 * 테스트 데이터 정리 (선택적)
 */
async function cleanupTestData(testId = null) {
  const pool = getWriterPool();
  const conn = await pool.getConnection();

  try {
    if (testId) {
      const [result] = await conn.query(`DELETE FROM ${TABLE_NAME} WHERE test_id = ?`, [testId]);
      return { deleted: result.affectedRows };
    } else {
      // 1시간 이상 된 데이터 삭제
      const [result] = await conn.query(
        `DELETE FROM ${TABLE_NAME} WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)`
      );
      return { deleted: result.affectedRows };
    }
  } finally {
    conn.release();
  }
}

module.exports = { runDbStress, cleanupTestData };

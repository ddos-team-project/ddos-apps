const { getWriterPool, getReaderPool } = require('./dbHealth');

const TABLE_NAME = 'rpo_test_markers';

/**
 * RPO 테스트용 테이블 생성
 */
async function ensureTable(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        marker_id VARCHAR(64) NOT NULL UNIQUE,
        write_timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_marker_id (marker_id)
      ) ENGINE=InnoDB
    `);
  } finally {
    conn.release();
  }
}

/**
 * 단일 복제 지연 측정
 * @returns {Promise<number>} 복제 지연 시간 (ms)
 */
async function measureReplicationLag() {
  const writerPool = getWriterPool();
  const readerPool = getReaderPool();

  const markerId = `rpo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const writeTimestamp = Date.now();

  // Writer에 데이터 쓰기
  const writerConn = await writerPool.getConnection();
  try {
    await writerConn.query(
      `INSERT INTO ${TABLE_NAME} (marker_id, write_timestamp) VALUES (?, ?)`,
      [markerId, writeTimestamp]
    );
  } finally {
    writerConn.release();
  }

  // Reader에서 읽기 시도 (최대 10초)
  const maxWait = 10000;
  const pollInterval = 5; // 5ms 간격으로 폴링
  const startPoll = Date.now();

  while (Date.now() - startPoll < maxWait) {
    const readerConn = await readerPool.getConnection();
    try {
      const [rows] = await readerConn.query(
        `SELECT write_timestamp FROM ${TABLE_NAME} WHERE marker_id = ?`,
        [markerId]
      );

      if (rows.length > 0) {
        const lagMs = Date.now() - writeTimestamp;
        // 테스트 데이터 정리 (Writer에서)
        const cleanConn = await writerPool.getConnection();
        try {
          await cleanConn.query(`DELETE FROM ${TABLE_NAME} WHERE marker_id = ?`, [markerId]);
        } finally {
          cleanConn.release();
        }
        return lagMs;
      }
    } finally {
      readerConn.release();
    }

    // 짧은 대기 후 재시도
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // 타임아웃 - 데이터 정리 후 에러
  const cleanConn = await writerPool.getConnection();
  try {
    await cleanConn.query(`DELETE FROM ${TABLE_NAME} WHERE marker_id = ?`, [markerId]);
  } finally {
    cleanConn.release();
  }

  throw new Error(`Replication timeout: data not replicated within ${maxWait}ms`);
}

/**
 * RPO 테스트 실행 (여러 번 측정하여 통계)
 * @param {number} iterations - 측정 횟수
 * @returns {Promise<object>} 측정 결과
 */
async function runRpoTest(iterations = 10) {
  const writerPool = getWriterPool();
  await ensureTable(writerPool);

  const results = [];
  const errors = [];

  for (let i = 0; i < iterations; i++) {
    try {
      const lag = await measureReplicationLag();
      results.push(lag);
    } catch (err) {
      errors.push(err.message);
    }

    // 각 측정 사이 짧은 간격
    if (i < iterations - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  if (results.length === 0) {
    return {
      status: 'error',
      message: 'All measurements failed',
      errors,
    };
  }

  const sorted = [...results].sort((a, b) => a - b);

  return {
    status: 'ok',
    iterations,
    successful: results.length,
    failed: errors.length,
    avgLagMs: Math.round(results.reduce((a, b) => a + b, 0) / results.length),
    minLagMs: sorted[0],
    maxLagMs: sorted[sorted.length - 1],
    medianLagMs: sorted[Math.floor(sorted.length / 2)],
    p95LagMs: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
    allLagsMs: results,
    errors: errors.length > 0 ? errors : undefined,
  };
}

module.exports = { runRpoTest };

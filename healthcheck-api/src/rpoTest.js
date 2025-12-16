const { getWriterPool, getReaderPool, getTokyoReaderPool } = require('./dbHealth');

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

/**
 * 크로스 리전 복제 지연 측정 (Seoul Writer → Tokyo Reader)
 * @returns {Promise<number>} 복제 지연 시간 (ms)
 */
async function measureGlobalReplicationLag() {
  const writerPool = getWriterPool();
  const tokyoReaderPool = getTokyoReaderPool();

  const markerId = `global-rpo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const writeTimestamp = Date.now();

  // Seoul Writer에 데이터 쓰기
  const writerConn = await writerPool.getConnection();
  try {
    await writerConn.query(
      `INSERT INTO ${TABLE_NAME} (marker_id, write_timestamp) VALUES (?, ?)`,
      [markerId, writeTimestamp]
    );
  } finally {
    writerConn.release();
  }

  // Tokyo Reader에서 읽기 시도 (최대 30초 - 크로스리전은 더 오래 걸릴 수 있음)
  const maxWait = 30000;
  const pollInterval = 10; // 10ms 간격으로 폴링
  const startPoll = Date.now();

  while (Date.now() - startPoll < maxWait) {
    const readerConn = await tokyoReaderPool.getConnection();
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

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // 타임아웃 - 데이터 정리 후 에러
  const cleanConn = await writerPool.getConnection();
  try {
    await cleanConn.query(`DELETE FROM ${TABLE_NAME} WHERE marker_id = ?`, [markerId]);
  } finally {
    cleanConn.release();
  }

  throw new Error(`Global replication timeout: data not replicated to Tokyo within ${maxWait}ms`);
}

/**
 * 크로스 리전 RPO 테스트 실행 (Seoul → Tokyo)
 * @param {number} iterations - 측정 횟수
 * @returns {Promise<object>} 측정 결과
 */
async function runGlobalRpoTest(iterations = 5) {
  const writerPool = getWriterPool();
  await ensureTable(writerPool);

  const results = [];
  const errors = [];

  for (let i = 0; i < iterations; i++) {
    try {
      const lag = await measureGlobalReplicationLag();
      results.push(lag);
      console.log(`[GLOBAL-RPO] Iteration ${i + 1}/${iterations}: ${lag}ms`);
    } catch (err) {
      errors.push(err.message);
      console.error(`[GLOBAL-RPO] Iteration ${i + 1}/${iterations} failed: ${err.message}`);
    }

    // 각 측정 사이 간격 (크로스리전은 좀 더 여유있게)
    if (i < iterations - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (results.length === 0) {
    return {
      status: 'error',
      message: 'All global replication measurements failed',
      errors,
    };
  }

  const sorted = [...results].sort((a, b) => a - b);

  return {
    status: 'ok',
    type: 'global',
    route: 'Seoul Writer → Tokyo Reader',
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

/**
 * 마커 쓰기 (Cross-Region 테스트용)
 * @returns {Promise<{markerId: string, writeTimestamp: number}>}
 */
async function writeMarker() {
  const writerPool = getWriterPool();
  await ensureTable(writerPool);

  const markerId = `cross-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const writeTimestamp = Date.now();

  const conn = await writerPool.getConnection();
  try {
    await conn.query(
      `INSERT INTO ${TABLE_NAME} (marker_id, write_timestamp) VALUES (?, ?)`,
      [markerId, writeTimestamp]
    );
  } finally {
    conn.release();
  }

  return { markerId, writeTimestamp };
}

/**
 * 마커 읽기 (Cross-Region 테스트용)
 * @param {string} markerId
 * @returns {Promise<{found: boolean, writeTimestamp?: number}>}
 */
async function readMarker(markerId) {
  const readerPool = getReaderPool();

  const conn = await readerPool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT write_timestamp FROM ${TABLE_NAME} WHERE marker_id = ?`,
      [markerId]
    );

    if (rows.length > 0) {
      return { found: true, writeTimestamp: rows[0].write_timestamp };
    }
    return { found: false };
  } finally {
    conn.release();
  }
}

/**
 * 마커 삭제 (Cross-Region 테스트용)
 * @param {string} markerId
 * @returns {Promise<{deleted: boolean}>}
 */
async function deleteMarker(markerId) {
  const writerPool = getWriterPool();

  const conn = await writerPool.getConnection();
  try {
    const [result] = await conn.query(
      `DELETE FROM ${TABLE_NAME} WHERE marker_id = ?`,
      [markerId]
    );
    return { deleted: result.affectedRows > 0 };
  } finally {
    conn.release();
  }
}

module.exports = { runRpoTest, runGlobalRpoTest, writeMarker, readMarker, deleteMarker };

/**
 * 페일오버 테스트 모듈
 *
 * 목적: 6개 메트릭 측정을 위한 가벼운 읽기/쓰기 API
 * - CPU 부하 없이 단순 DB 쿼리만 수행
 * - 오토스케일링 트리거 방지
 *
 * 측정 메트릭:
 * 1. Seoul Health Check (Route53)
 * 2. Tokyo Health Check (Route53)
 * 3. Seoul 요청 수/오류 (ALB RequestCount, HTTPCode_Target_5XX_Count)
 * 4. Tokyo 요청 수/오류 (ALB RequestCount, HTTPCode_Target_5XX_Count)
 * 5. Seoul 응답 시간 p95 (ALB TargetResponseTime)
 * 6. Tokyo 응답 시간 p95 (ALB TargetResponseTime)
 */

const { getWriterPool, getReaderPool } = require('./dbHealth');

const TABLE_NAME = 'failover_traffic';

/**
 * 테이블 생성 (없으면)
 */
async function ensureTable(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        marker VARCHAR(64) NOT NULL,
        region VARCHAR(16) NOT NULL,
        created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_marker (marker),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB
    `);
  } finally {
    conn.release();
  }
}

/**
 * DB 읽기 - 가벼운 SELECT 쿼리
 * Write Forwarding OFF 상태에서도 성공해야 함
 */
async function performRead() {
  const pool = getReaderPool();
  const conn = await pool.getConnection();

  try {
    const [rows] = await conn.query('SELECT 1 as ping');
    return {
      status: 'success',
      type: 'read',
      data: rows[0],
    };
  } finally {
    conn.release();
  }
}

/**
 * DB 쓰기 - 가벼운 INSERT 쿼리
 * Write Forwarding OFF 시 도쿄에서 에러 발생해야 함
 */
async function performWrite(region) {
  const pool = getWriterPool();
  await ensureTable(pool);

  const conn = await pool.getConnection();
  const marker = `${region}-${Date.now()}`;

  try {
    await conn.query(
      `INSERT INTO ${TABLE_NAME} (marker, region) VALUES (?, ?)`,
      [marker, region]
    );

    return {
      status: 'success',
      type: 'write',
      marker,
    };
  } finally {
    conn.release();
  }
}

/**
 * 오래된 테스트 데이터 정리 (10분 이상)
 */
async function cleanupOldData() {
  try {
    const pool = getWriterPool();
    const conn = await pool.getConnection();

    try {
      const [result] = await conn.query(
        `DELETE FROM ${TABLE_NAME} WHERE created_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`
      );
      return { deleted: result.affectedRows };
    } finally {
      conn.release();
    }
  } catch (err) {
    return { deleted: 0, error: err.message };
  }
}

module.exports = {
  performRead,
  performWrite,
  cleanupOldData,
};

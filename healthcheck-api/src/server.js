const express = require('express');
const cors = require('cors');
const fsModule = require('fs');
const path = require('path');
const { getLocation } = require('./instanceLocation');
const { checkDbHealth, getWriterPool, getReaderPool, getTokyoReaderPool } = require('./dbHealth');
const { runCpuStress } = require('./cpuStress');
const { runDbStress, cleanupTestData } = require('./dbStress');
const { runRpoTest, runGlobalRpoTest, writeMarker, readMarker, deleteMarker } = require('./rpoTest');

const app = express();
app.use(express.json());

app.use(cors({
  origin: 'https://infra.ddos.io.kr',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

const PORT = process.env.PORT || 3000;
const SERVICE_NAME = process.env.SERVICE_NAME || 'ddos-noncore-api';
const APP_ENV = process.env.APP_ENV || 'dev';
const IDC_HOST = process.env.IDC_HOST || '192.168.0.10';
const IDC_PORT = process.env.IDC_PORT || '3000';
const ALLOW_STRESS = process.env.ALLOW_STRESS === 'true';

const LOG_DIR = '/tmp/transaction-logs';
if (!fsModule.existsSync(LOG_DIR)) {
  fsModule.mkdirSync(LOG_DIR, { recursive: true });
}

const testLogs = new Map();

app.get('/health', async (req, res) => {
  const dbStatus = await checkDbHealth();
  const location = await getLocation();
  res.json({
    status: dbStatus.status === 'ok' ? 'ok' : 'degraded',
    service: SERVICE_NAME,
    env: APP_ENV,
    location,
    db: dbStatus,
    uptimeMs: Math.round(process.uptime() * 1000),
    timestamp: new Date().toISOString(),
  });
});

app.get('/ping', async (req, res) => {
  const location = await getLocation();
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    env: APP_ENV,
    location,
    timestamp: new Date().toISOString(),
  });
});

// 트랜잭션 시뮬레이션 (피크 트래픽 테스트용) - 실제 서비스와 유사한 DB 작업 포함
app.post('/transaction', async (req, res) => {
  const startTime = Date.now();
  const { testId, requestId, amount, userId } = req.body;
  const location = await getLocation();
  const currentRequestId = requestId || 'req-' + Date.now();

  let dbWriteTime = 0;
  let dbReadTime = 0;
  let status = 'success';
  let errorMessage = null;

  try {
    const pool = getWriterPool();

    // 1. 트랜잭션 로그 INSERT (실제 서비스: 주문/결제 기록 저장)
    const writeStart = Date.now();
    await pool.query(
      `INSERT INTO transaction_logs
       (test_id, request_id, user_id, amount, instance_id, region, az, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [testId, currentRequestId, userId || 'user-' + Math.floor(Math.random() * 10000),
       amount || Math.floor(Math.random() * 100000), location.instanceId, location.region, location.az]
    );
    dbWriteTime = Date.now() - writeStart;

    // 2. 집계 쿼리 SELECT (실제 서비스: 잔액 조회, 재고 확인 등)
    const readStart = Date.now();
    const [rows] = await pool.query(
      `SELECT COUNT(*) as total_count, SUM(amount) as total_amount
       FROM transaction_logs WHERE test_id = ?`,
      [testId]
    );
    dbReadTime = Date.now() - readStart;

    // 3. 간단한 비즈니스 로직 (데이터 검증/변환)
    const summary = {
      totalCount: rows[0].total_count,
      totalAmount: rows[0].total_amount || 0,
    };

  } catch (err) {
    status = 'error';
    errorMessage = err.message;
  }

  const timestamp = new Date().toISOString();
  const actualProcessingTime = Date.now() - startTime;

  // 파일 로그 기록 (기존 호환성 유지)
  if (testId) {
    const logEntry = {
      timestamp,
      testId,
      requestId: currentRequestId,
      status,
      processingMs: actualProcessingTime,
      instanceId: location.instanceId,
      region: location.region,
      az: location.az,
    };

    if (!testLogs.has(testId)) {
      testLogs.set(testId, []);
    }
    testLogs.get(testId).push(logEntry);

    const logFile = path.join(LOG_DIR, testId + '.csv');
    const csvLine = [logEntry.timestamp, logEntry.testId, logEntry.requestId, logEntry.status, logEntry.processingMs, logEntry.instanceId, logEntry.region, logEntry.az].join(',') + '\n';

    if (!fsModule.existsSync(logFile)) {
      fsModule.writeFileSync(logFile, 'timestamp,test_id,request_id,status,processing_ms,instance_id,region,az\n');
    }
    fsModule.appendFileSync(logFile, csvLine);
  }

  res.json({
    status,
    testId,
    requestId: currentRequestId,
    processingMs: actualProcessingTime,
    dbWriteMs: dbWriteTime,
    dbReadMs: dbReadTime,
    location,
    timestamp,
    ...(errorMessage && { error: errorMessage }),
  });
});

// 테스트 로그 조회
app.get('/test-logs', async (req, res) => {
  const { testId, format = 'json' } = req.query;

  if (!testId) {
    const tests = [];
    if (fsModule.existsSync(LOG_DIR)) {
      const files = fsModule.readdirSync(LOG_DIR).filter(f => f.endsWith('.csv'));
      for (const file of files) {
        const id = file.replace('.csv', '');
        const stats = fsModule.statSync(path.join(LOG_DIR, file));
        tests.push({ testId: id, size: stats.size, createdAt: stats.birthtime });
      }
    }
    return res.json({ status: 'ok', tests });
  }

  const logFile = path.join(LOG_DIR, testId + '.csv');
  if (!fsModule.existsSync(logFile)) {
    return res.status(404).json({ status: 'error', error: 'Test logs not found' });
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=' + testId + '.csv');
    return res.sendFile(logFile);
  }

  const content = fsModule.readFileSync(logFile, 'utf8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  const logs = lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
  });

  res.json({ status: 'ok', testId, totalRequests: logs.length, logs });
});

// 테스트 로그 삭제
app.delete('/test-logs', async (req, res) => {
  const { testId } = req.query;
  if (!testId) {
    return res.status(400).json({ status: 'error', error: 'testId required' });
  }
  const logFile = path.join(LOG_DIR, testId + '.csv');
  if (fsModule.existsSync(logFile)) {
    fsModule.unlinkSync(logFile);
  }
  testLogs.delete(testId);
  res.json({ status: 'ok', message: 'Logs deleted' });
});

// 테스트 통계
app.get('/test-stats', async (req, res) => {
  const { testId } = req.query;
  if (!testId) {
    return res.status(400).json({ status: 'error', error: 'testId required' });
  }
  const logFile = path.join(LOG_DIR, testId + '.csv');
  if (!fsModule.existsSync(logFile)) {
    return res.status(404).json({ status: 'error', error: 'Test logs not found' });
  }

  const content = fsModule.readFileSync(logFile, 'utf8');
  const lines = content.trim().split('\n').slice(1);
  const stats = {
    totalRequests: lines.length,
    successCount: 0,
    failCount: 0,
    avgProcessingMs: 0,
    minProcessingMs: Infinity,
    maxProcessingMs: 0,
    instanceDistribution: {},
  };
  let totalMs = 0;

  for (const line of lines) {
    const parts = line.split(',');
    const status = parts[3];
    const ms = parseInt(parts[4], 10);
    const instanceId = parts[5];

    if (status === 'success') stats.successCount++;
    else stats.failCount++;

    totalMs += ms;
    stats.minProcessingMs = Math.min(stats.minProcessingMs, ms);
    stats.maxProcessingMs = Math.max(stats.maxProcessingMs, ms);
    stats.instanceDistribution[instanceId] = (stats.instanceDistribution[instanceId] || 0) + 1;
  }

  stats.avgProcessingMs = Math.round(totalMs / lines.length);
  if (stats.minProcessingMs === Infinity) stats.minProcessingMs = 0;

  res.json({ status: 'ok', testId, stats });
});

// DB 정보 조회
app.get('/db-info', async (req, res) => {
  const location = await getLocation();
  const checkConn = async (getPool) => {
    try {
      const pool = getPool();
      const conn = await pool.getConnection();
      await conn.query('SELECT 1');
      conn.release();
      return { status: 'ok' };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  };

  const writer = {
    host: process.env.DB_HOST || null,
    ...(process.env.DB_HOST ? await checkConn(getWriterPool) : { status: 'not_configured' }),
  };
  const reader = {
    host: process.env.DB_READER_HOST || process.env.DB_HOST || null,
    ...(process.env.DB_HOST ? await checkConn(getReaderPool) : { status: 'not_configured' }),
  };
  let tokyoReader = { host: null, status: 'not_configured' };
  if (process.env.DB_TOKYO_READER_HOST) {
    tokyoReader = { host: process.env.DB_TOKYO_READER_HOST, ...await checkConn(getTokyoReaderPool) };
  }

  res.json({
    status: 'ok',
    location,
    databases: { writer, reader, tokyoReader },
    timestamp: new Date().toISOString(),
  });
});

// CPU 부하 테스트
app.get('/stress', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'stress endpoint disabled' });
  }
  const seconds = Number(req.query.seconds || 10);
  const intensity = req.query.intensity ? Number(req.query.intensity) : null;
  if (Number.isNaN(seconds) || seconds <= 0 || seconds > 300) {
    return res.status(400).json({ status: 'bad_request', message: 'seconds must be 1-300' });
  }
  const location = await getLocation();
  try {
    const result = await runCpuStress(seconds, intensity);
    res.json({ status: 'ok', ...result, service: SERVICE_NAME, env: APP_ENV, location, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message, location, timestamp: new Date().toISOString() });
  }
});

// DB 부하 테스트
app.post('/db-stress', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'db-stress endpoint disabled' });
  }
  const { operations = 1000, concurrency = 10, type = 'mixed' } = req.body;
  if (!['write', 'read', 'mixed'].includes(type)) {
    return res.status(400).json({ status: 'bad_request', message: 'type must be write, read, or mixed' });
  }
  const location = await getLocation();
  try {
    const result = await runDbStress({ operations, concurrency, type });
    res.json({ status: 'ok', ...result, location, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message, location, timestamp: new Date().toISOString() });
  }
});

app.post('/db-cleanup', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'db-cleanup endpoint disabled' });
  }
  try {
    const result = await cleanupTestData(req.body.testId);
    res.json({ status: 'ok', ...result });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.post('/rpo-test', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'rpo-test endpoint disabled' });
  }
  const { iterations = 10 } = req.body;
  const location = await getLocation();
  try {
    const result = await runRpoTest(iterations);
    res.json({ ...result, writerHost: process.env.DB_HOST, readerHost: process.env.DB_READER_HOST || process.env.DB_HOST, location, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message, location, timestamp: new Date().toISOString() });
  }
});

app.post('/global-rpo-test', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'global-rpo-test endpoint disabled' });
  }
  const { iterations = 5 } = req.body;
  const location = await getLocation();
  try {
    const result = await runGlobalRpoTest(iterations);
    res.json({ ...result, seoulWriterHost: process.env.DB_HOST, tokyoReaderHost: process.env.DB_TOKYO_READER_HOST, sourceLocation: location, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message, sourceLocation: location, timestamp: new Date().toISOString() });
  }
});

app.post('/write-marker', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'write-marker endpoint disabled' });
  }
  const location = await getLocation();
  try {
    const result = await writeMarker();
    res.json({ status: 'ok', ...result, location, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message, location, timestamp: new Date().toISOString() });
  }
});

app.get('/read-marker', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ status: 'bad_request', message: 'id required' });
  const location = await getLocation();
  try {
    const result = await readMarker(id);
    res.json({ status: 'ok', ...result, location, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message, location, timestamp: new Date().toISOString() });
  }
});

app.delete('/delete-marker', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ status: 'bad_request', message: 'id required' });
  const location = await getLocation();
  try {
    const result = await deleteMarker(id);
    res.json({ status: 'ok', ...result, location, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message, location, timestamp: new Date().toISOString() });
  }
});

app.get('/idc-health', async (req, res) => {
  const location = await getLocation();
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`http://${IDC_HOST}:${IDC_PORT}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await response.json();
    res.json({ status: 'ok', source: 'aws', sourceLocation: location, target: 'idc', targetHost: IDC_HOST, idc: data, latencyMs: Date.now() - start, timestamp: new Date().toISOString() });
  } catch (error) {
    res.json({ status: 'error', source: 'aws', sourceLocation: location, target: 'idc', targetHost: IDC_HOST, error: error.name === 'AbortError' ? 'Connection timeout (5s)' : error.message, latencyMs: Date.now() - start, timestamp: new Date().toISOString() });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

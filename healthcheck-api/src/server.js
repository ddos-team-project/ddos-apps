const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const { getLocation } = require('./instanceLocation');
const { checkDbHealth, getWriterPool, getReaderPool, getTokyoReaderPool } = require('./dbHealth');
const { runCpuStress } = require('./cpuStress');
const { runDbStress, cleanupTestData } = require('./dbStress');
const { runRpoTest, runGlobalRpoTest, writeMarker, readMarker, deleteMarker } = require('./rpoTest');

const execAsync = promisify(exec);
const app = express();
app.use(express.json());

app.use(cors({
  origin: 'https://infra.ddos.io.kr',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));

const PORT = process.env.PORT || 3000;
const SERVICE_NAME = process.env.SERVICE_NAME || 'ddos-noncore-api';
const APP_ENV = process.env.APP_ENV || 'dev';
const IDC_HOST = process.env.IDC_HOST || '192.168.0.10';
const IDC_PORT = process.env.IDC_PORT || '3000';
const ALLOW_STRESS = process.env.ALLOW_STRESS === 'true';

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

// DB 정보 조회
app.get('/db-info', async (req, res) => {
  const location = await getLocation();

  const checkConnection = async (getPool, name) => {
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
    ...(process.env.DB_HOST ? await checkConnection(getWriterPool, 'writer') : { status: 'not_configured' }),
  };

  const reader = {
    host: process.env.DB_READER_HOST || process.env.DB_HOST || null,
    ...(process.env.DB_HOST ? await checkConnection(getReaderPool, 'reader') : { status: 'not_configured' }),
  };

  let tokyoReader = { host: null, status: 'not_configured' };
  if (process.env.DB_TOKYO_READER_HOST) {
    tokyoReader = {
      host: process.env.DB_TOKYO_READER_HOST,
      ...await checkConnection(getTokyoReaderPool, 'tokyoReader'),
    };
  }

  res.json({
    status: 'ok',
    location,
    databases: {
      writer,
      reader,
      tokyoReader,
    },
    timestamp: new Date().toISOString(),
  });
});

// CPU 부하 테스트 (Worker Threads 기반 멀티코어) - 내부용, 부하테스트에서 호출
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
    console.log(`[CPU-STRESS] Starting: ${seconds}s, intensity: ${intensity || 'all cores'}`);
    const result = await runCpuStress(seconds, intensity);

    res.json({
      status: 'ok',
      ...result,
      service: SERVICE_NAME,
      env: APP_ENV,
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CPU-STRESS] Error:', error.message);
    res.status(500).json({
      status: 'error',
      error: error.message,
      location,
      timestamp: new Date().toISOString(),
    });
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

  if (operations < 10 || operations > 10000) {
    return res.status(400).json({ status: 'bad_request', message: 'operations must be 10-10000' });
  }

  if (concurrency < 1 || concurrency > 50) {
    return res.status(400).json({ status: 'bad_request', message: 'concurrency must be 1-50' });
  }

  const location = await getLocation();

  try {
    console.log(`[DB-STRESS] Starting: ${operations} ops, concurrency: ${concurrency}, type: ${type}`);
    const result = await runDbStress({ operations, concurrency, type });

    res.json({
      status: 'ok',
      ...result,
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[DB-STRESS] Error:', error.message);
    res.status(500).json({
      status: 'error',
      error: error.message,
      location,
      timestamp: new Date().toISOString(),
    });
  }
});

// DB 테스트 데이터 정리
app.post('/db-cleanup', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'db-cleanup endpoint disabled' });
  }

  const { testId } = req.body;

  try {
    const result = await cleanupTestData(testId);
    res.json({ status: 'ok', ...result });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// RPO 테스트 (복제 지연 측정)
app.post('/rpo-test', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'rpo-test endpoint disabled' });
  }

  const { iterations = 10 } = req.body;

  if (iterations < 1 || iterations > 100) {
    return res.status(400).json({ status: 'bad_request', message: 'iterations must be 1-100' });
  }

  const location = await getLocation();
  const readerHost = process.env.DB_READER_HOST || process.env.DB_HOST;

  try {
    console.log(`[RPO-TEST] Starting: ${iterations} iterations`);
    const result = await runRpoTest(iterations);

    res.json({
      ...result,
      writerHost: process.env.DB_HOST,
      readerHost,
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[RPO-TEST] Error:', error.message);
    res.status(500).json({
      status: 'error',
      error: error.message,
      location,
      timestamp: new Date().toISOString(),
    });
  }
});

// Global RPO 테스트 (Seoul → Tokyo 크로스 리전 복제 지연 측정)
app.post('/global-rpo-test', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'global-rpo-test endpoint disabled' });
  }

  const { iterations = 5 } = req.body;

  if (iterations < 1 || iterations > 50) {
    return res.status(400).json({ status: 'bad_request', message: 'iterations must be 1-50' });
  }

  const location = await getLocation();

  try {
    console.log(`[GLOBAL-RPO-TEST] Starting: ${iterations} iterations (Seoul → Tokyo)`);
    const result = await runGlobalRpoTest(iterations);

    res.json({
      ...result,
      seoulWriterHost: process.env.DB_HOST,
      tokyoReaderHost: process.env.DB_TOKYO_READER_HOST,
      sourceLocation: location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[GLOBAL-RPO-TEST] Error:', error.message);
    res.status(500).json({
      status: 'error',
      error: error.message,
      sourceLocation: location,
      timestamp: new Date().toISOString(),
    });
  }
});

// Cross-Region 마커 API (클라이언트에서 Seoul Write → Tokyo Read 테스트용)
app.post('/write-marker', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'write-marker endpoint disabled' });
  }

  const location = await getLocation();

  try {
    const result = await writeMarker();
    res.json({
      status: 'ok',
      ...result,
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      location,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/read-marker', async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ status: 'bad_request', message: 'id query parameter required' });
  }

  const location = await getLocation();

  try {
    const result = await readMarker(id);
    res.json({
      status: 'ok',
      ...result,
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      location,
      timestamp: new Date().toISOString(),
    });
  }
});

app.delete('/delete-marker', async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ status: 'bad_request', message: 'id query parameter required' });
  }

  const location = await getLocation();

  try {
    const result = await deleteMarker(id);
    res.json({
      status: 'ok',
      ...result,
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      location,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/idc-health', async (req, res) => {
  const location = await getLocation();
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://${IDC_HOST}:${IDC_PORT}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    res.json({
      status: 'ok',
      source: 'aws',
      sourceLocation: location,
      target: 'idc',
      targetHost: IDC_HOST,
      idc: data,
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.json({
      status: 'error',
      source: 'aws',
      sourceLocation: location,
      target: 'idc',
      targetHost: IDC_HOST,
      error: error.name === 'AbortError' ? 'Connection timeout (5s)' : error.message,
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  }
});

// 부하 테스트 엔드포인트 (각 리전별 서브도메인)
const SEOUL_ALB_URL = process.env.SEOUL_ALB_URL || 'https://seoul.tier1.ddos.io.kr';
const TOKYO_ALB_URL = process.env.TOKYO_ALB_URL || 'https://tokyo.tier1.ddos.io.kr';

app.post('/load-test', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({
      status: 'error',
      error: '부하 테스트가 비활성화되어 있습니다. ALLOW_STRESS=true 설정이 필요합니다.',
    });
  }

  const { target = 'seoul', requests = 1000, concurrency = 50, mode = 'light' } = req.body;

  // 입력 유효성 검사
  if (!['seoul', 'tokyo'].includes(target)) {
    return res.status(400).json({ status: 'error', error: 'target은 seoul 또는 tokyo여야 합니다.' });
  }

  if (!['light', 'heavy'].includes(mode)) {
    return res.status(400).json({ status: 'error', error: 'mode는 light 또는 heavy여야 합니다.' });
  }

  if (requests < 100 || requests > 50000) {
    return res.status(400).json({ status: 'error', error: 'requests는 100~50000 사이여야 합니다.' });
  }

  if (concurrency < 1 || concurrency > 500) {
    return res.status(400).json({ status: 'error', error: 'concurrency는 1~500 사이여야 합니다.' });
  }

  const targetUrl = target === 'seoul' ? SEOUL_ALB_URL : TOKYO_ALB_URL;
  const location = await getLocation();

  // mode에 따라 엔드포인트 결정
  const endpoint = mode === 'heavy' ? '/stress?seconds=5' : '/ping';

  try {
    // ab 명령어 실행
    const command = `ab -n ${requests} -c ${concurrency} -s 30 "${targetUrl}${endpoint}" 2>&1`;
    console.log(`[LOAD-TEST] Running (${mode}): ${command}`);

    const { stdout } = await execAsync(command, { timeout: 300000 }); // 5분 타임아웃

    // ab 출력 파싱
    const result = parseAbOutput(stdout);

    res.json({
      status: 'ok',
      target,
      targetUrl,
      mode,
      endpoint,
      sourceLocation: location,
      ...result,
      raw: stdout,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[LOAD-TEST] Error:', error.message);
    res.json({
      status: 'error',
      error: error.message,
      sourceLocation: location,
      timestamp: new Date().toISOString(),
    });
  }
});

// ab 출력 파싱 함수
function parseAbOutput(output) {
  const result = {};

  // 총 요청 수
  const completeMatch = output.match(/Complete requests:\s+(\d+)/);
  if (completeMatch) result.completedRequests = parseInt(completeMatch[1], 10);

  // 실패한 요청 수
  const failedMatch = output.match(/Failed requests:\s+(\d+)/);
  if (failedMatch) result.failedRequests = parseInt(failedMatch[1], 10);

  // 총 요청 수 (설정값)
  const totalMatch = output.match(/Concurrency Level:\s+\d+[\s\S]*?Complete requests:\s+(\d+)/);
  if (totalMatch) result.totalRequests = parseInt(totalMatch[1], 10);

  // 초당 요청 수 (RPS)
  const rpsMatch = output.match(/Requests per second:\s+([\d.]+)/);
  if (rpsMatch) result.requestsPerSecond = parseFloat(rpsMatch[1]);

  // 평균 응답 시간 (ms)
  const avgTimeMatch = output.match(/Time per request:\s+([\d.]+)\s+\[ms\]\s+\(mean\)/);
  if (avgTimeMatch) result.avgResponseTime = parseFloat(avgTimeMatch[1]);

  // 총 소요 시간
  const totalTimeMatch = output.match(/Time taken for tests:\s+([\d.]+)\s+seconds/);
  if (totalTimeMatch) result.totalTime = parseFloat(totalTimeMatch[1]);

  // 최소/최대 응답 시간
  const minMaxMatch = output.match(/Total:\s+(\d+)\s+(\d+)\s+[\d.]+\s+(\d+)\s+(\d+)/);
  if (minMaxMatch) {
    result.minResponseTime = parseInt(minMaxMatch[1], 10);
    result.maxResponseTime = parseInt(minMaxMatch[4], 10);
  }

  return result;
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

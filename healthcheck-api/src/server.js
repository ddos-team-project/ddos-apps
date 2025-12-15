const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const { getLocation } = require('./instanceLocation');
const { checkDbHealth } = require('./dbHealth');

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

app.get('/stress', async (req, res) => {
  const ALLOW_STRESS = process.env.ALLOW_STRESS === 'true';

  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'stress endpoint disabled' });
  }

  const seconds = Number(req.query.seconds || 10);

  if (Number.isNaN(seconds) || seconds <= 0) {
    return res.status(400).json({ status: 'bad_request', message: 'seconds must be > 0' });
  }

  const location = await getLocation();
  const start = Date.now();
  const end = start + seconds * 1000;

  while (Date.now() < end) {
    Math.sqrt(Math.random());
  }

  res.json({
    status: 'ok',
    elapsed_ms: Date.now() - start,
    service: SERVICE_NAME,
    env: APP_ENV,
    location,
  });
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

// 부하 테스트 엔드포인트
const ALLOW_LOAD_TEST = process.env.ALLOW_STRESS === 'true';
const SEOUL_ALB_URL = process.env.SEOUL_ALB_URL || 'https://tier1.ddos.io.kr';
const TOKYO_ALB_URL = process.env.TOKYO_ALB_URL || 'https://tier1.ddos.io.kr';

app.post('/load-test', async (req, res) => {
  if (!ALLOW_LOAD_TEST) {
    return res.status(403).json({
      status: 'error',
      error: '부하 테스트가 비활성화되어 있습니다. ALLOW_LOAD_TEST=true 설정이 필요합니다.',
    });
  }

  const { target = 'seoul', requests = 1000, concurrency = 50 } = req.body;

  // 입력 유효성 검사
  if (!['seoul', 'tokyo'].includes(target)) {
    return res.status(400).json({ status: 'error', error: 'target은 seoul 또는 tokyo여야 합니다.' });
  }

  if (requests < 100 || requests > 50000) {
    return res.status(400).json({ status: 'error', error: 'requests는 100~50000 사이여야 합니다.' });
  }

  if (concurrency < 1 || concurrency > 500) {
    return res.status(400).json({ status: 'error', error: 'concurrency는 1~500 사이여야 합니다.' });
  }

  const targetUrl = target === 'seoul' ? SEOUL_ALB_URL : TOKYO_ALB_URL;
  const location = await getLocation();

  try {
    // ab 명령어 실행
    const command = `ab -n ${requests} -c ${concurrency} -s 30 ${targetUrl}/ping 2>&1`;
    console.log(`[LOAD-TEST] Running: ${command}`);

    const { stdout } = await execAsync(command, { timeout: 300000 }); // 5분 타임아웃

    // ab 출력 파싱
    const result = parseAbOutput(stdout);

    res.json({
      status: 'ok',
      target,
      targetUrl,
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

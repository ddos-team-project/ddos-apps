const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { promisify } = require('util');
const { exec } = require('child_process');
const fsModule = require('fs');
const path = require('path');

// 비동기 pbkdf2 (libuv 스레드 풀에서 병렬 실행)
const pbkdf2Async = promisify(crypto.pbkdf2);
const { getLocation } = require('./instanceLocation');
const { checkDbHealth, getWriterPool, getReaderPool, getTokyoReaderPool } = require('./dbHealth');
const { runCpuStress } = require('./cpuStress');
const { runDbStress, cleanupTestData } = require('./dbStress');
const { runRpoTest, runGlobalRpoTest, writeMarker, readMarker, deleteMarker } = require('./rpoTest');
const { startBackgroundLoad, stopBackgroundLoad, getBackgroundLoadStatus } = require('./backgroundLoad');
const { performRead, performWrite, cleanupOldData } = require('./failoverTest');

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

// 실행 중인 부하 테스트 프로세스 추적
const runningLoadTests = new Map();

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

// 로그 저장 헬퍼 함수
const saveTransactionLog = (testId, requestId, status, processingMs, location, errorMsg = null) => {
  if (!testId) return;

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    testId,
    requestId: requestId || 'req-' + Date.now(),
    status,
    processingMs,
    instanceId: location.instanceId,
    region: location.region,
    az: location.az,
    error: errorMsg,
  };

  if (!testLogs.has(testId)) {
    testLogs.set(testId, []);
  }
  testLogs.get(testId).push(logEntry);

  const logFile = path.join(LOG_DIR, testId + '.csv');
  const csvLine = [logEntry.timestamp, logEntry.testId, logEntry.requestId, logEntry.status, logEntry.processingMs, logEntry.instanceId, logEntry.region, logEntry.az, errorMsg || ''].join(',') + '\n';

  if (!fsModule.existsSync(logFile)) {
    fsModule.writeFileSync(logFile, 'timestamp,test_id,request_id,status,processing_ms,instance_id,region,az,error\n');
  }
  fsModule.appendFileSync(logFile, csvLine);
};

// 강도별 iterations 배율 설정
// light: 10%, medium: 30%, heavy: 100%
const INTENSITY_MULTIPLIERS = {
  light: 0.1,
  medium: 0.3,
  heavy: 1.0,
};

// 금융권 거래 처리 시뮬레이션 (요청 1개당 내부 10~15회 처리)
// intensity 파라미터: 'light' (10%), 'medium' (30%), 'heavy' (100%)
app.post('/transaction', async (req, res) => {
  const startTime = Date.now();
  const { testId, requestId, intensity = 'medium' } = req.body;
  let location = { region: 'unknown', az: 'unknown', instanceId: 'unknown' };
  const steps = []; // 각 단계별 처리 시간 기록

  // 강도 배율 적용 (기본값: medium = 30%)
  const multiplier = INTENSITY_MULTIPLIERS[intensity] || 0.3;

  // 내부 처리 헬퍼 함수
  const processStep = async (stepName, iterations = 10000) => {
    const stepStart = Date.now();
    await pbkdf2Async(stepName + Date.now(), 'step-salt', iterations, 32, 'sha512');
    steps.push({ step: stepName, ms: Date.now() - stepStart });
  };

  try {
    location = await getLocation();

    // === 금융 거래 내부 처리 시뮬레이션 (10~15단계) ===

    // 1. 요청 토큰 검증 (JWT 검증 시뮬레이션)
    await processStep('token_validation', 15000);

    // 2. 사용자 인증 확인 (세션/권한 확인)
    await processStep('auth_check', 12000);

    // 3. 출금 계좌 정보 조회 (DB SELECT 시뮬레이션)
    await processStep('sender_account_lookup', 10000);

    // 4. 출금 계좌 잔액 확인 (DB SELECT + 계산)
    await processStep('balance_check', 12000);

    // 5. 일일 이체 한도 검증 (DB SELECT + 계산)
    await processStep('daily_limit_check', 10000);

    // 6. 수취인 계좌 검증 (타행 조회 시뮬레이션)
    await processStep('receiver_account_validation', 15000);

    // 7. 사기 탐지 검증 (FDS 시뮬레이션)
    await processStep('fraud_detection', 18000);

    // 8. 거래 유효성 최종 검증
    await processStep('transaction_validation', 10000);

    // 9. 출금 처리 (DB UPDATE)
    await processStep('withdraw_process', 12000);

    // 10. 입금 처리 (DB UPDATE)
    await processStep('deposit_process', 12000);

    // 11. 수수료 계산 및 처리
    await processStep('fee_calculation', 8000);

    // 12. 거래 로그 기록 (DB INSERT)
    await processStep('transaction_logging', 10000);

    // 13. 알림 발송 준비 (암호화)
    await processStep('notification_prepare', 10000);

    // 14. 최종 거래 서명 생성
    await processStep('final_signature', 15000);

    const processingMs = Date.now() - startTime;

    // 성공 로그 저장
    saveTransactionLog(testId, requestId, 'success', processingMs, location);

    res.json({
      status: 'success',
      testId,
      requestId: requestId || 'req-' + Date.now(),
      processingMs,
      stepsCount: steps.length,
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const processingMs = Date.now() - startTime;

    // 실패 로그 저장
    saveTransactionLog(testId, requestId, 'failed', processingMs, location, error.message);

    res.status(500).json({
      status: 'failed',
      testId,
      requestId: requestId || 'req-' + Date.now(),
      processingMs,
      stepsCompleted: steps.length,
      location,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
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

// 백그라운드 CPU 부하 (Warm-up) - 실제 서비스 환경 시뮬레이션
app.post('/warm-up', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'warm-up endpoint disabled' });
  }

  const { targetCpu = 60, cores = 1 } = req.body;
  const location = await getLocation();

  try {
    const result = await startBackgroundLoad(targetCpu, cores);
    res.json({
      ...result,
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message, location, timestamp: new Date().toISOString() });
  }
});

app.delete('/warm-up', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'warm-up endpoint disabled' });
  }

  const location = await getLocation();

  try {
    const result = await stopBackgroundLoad();
    res.json({
      ...result,
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message, location, timestamp: new Date().toISOString() });
  }
});

app.get('/warm-up', async (req, res) => {
  const location = await getLocation();
  const status = getBackgroundLoadStatus();

  res.json({
    ...status,
    location,
    timestamp: new Date().toISOString(),
  });
});

// 서버사이드 부하 테스트 (ab 사용) - DNS 캐싱 우회를 위한 랜덤 서브도메인 사용
app.post('/load-test', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'load-test endpoint disabled' });
  }

  const location = await getLocation();
  const { tps = 22, duration = 60, testId, intensity = 'medium' } = req.body;

  // 총 요청 수 = TPS × duration
  const totalRequests = tps * duration;
  const concurrency = Math.min(tps, 100); // 동시 연결 수 (최대 100)

  // 10개의 ab 프로세스를 병렬 실행, 각각 다른 랜덤 서브도메인 사용
  // → DNS 쿼리 10회 → Route53 가중치(80:20) 분산 적용
  const numProcesses = 10;
  const requestsPerProcess = Math.ceil(totalRequests / numProcesses);
  const concurrencyPerProcess = Math.max(1, Math.ceil(concurrency / numProcesses));

  // 각 프로세스마다 다른 랜덤 서브도메인으로 ab 명령 생성
  const abCommands = [];
  const timestamp = Date.now();
  for (let i = 0; i < numProcesses; i++) {
    const randomPrefix = 'load-' + timestamp + '-' + i + '-' + Math.random().toString(36).substring(7);
    const targetUrl = 'https://' + randomPrefix + '.tier1.ddos.io.kr/transaction';
    abCommands.push('ab -n ' + requestsPerProcess + ' -c ' + concurrencyPerProcess + " -T 'application/json' -p /tmp/ab-post-data.json -s 30 \"" + targetUrl + '" 2>&1');
  }

  // 모든 ab 명령을 병렬 실행
  const abCommand = abCommands.join(' & ') + ' & wait';

  // POST 데이터 파일 생성
  const loadTestId = testId || ('load-' + Date.now());
  const postData = JSON.stringify({ testId: loadTestId, intensity });

  try {
    fsModule.writeFileSync('/tmp/ab-post-data.json', postData);

    console.log('[LOAD-TEST] Starting: ' + numProcesses + ' parallel processes');

    const childProcess = exec(abCommand, { timeout: (duration + 120) * 1000, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      // 테스트 완료 시 맵에서 제거
      runningLoadTests.delete(loadTestId);
      
      console.log('[LOAD-TEST] Completed: ' + loadTestId);
    });

    // 실행 중인 테스트 추적
    runningLoadTests.set(loadTestId, {
      process: childProcess,
      startTime: new Date().toISOString(),
      config: { tps, duration, totalRequests, concurrency },
    });

    // 즉시 응답 (테스트는 백그라운드에서 실행)
    res.json({
      status: 'started',
      testId: loadTestId,
      message: 'Load test started: ' + totalRequests + ' requests with ' + numProcesses + ' parallel processes',
      config: { tps, duration, totalRequests, concurrency, numProcesses },
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

// 부하 테스트 중단
app.post('/load-test/stop', async (req, res) => {
  if (!ALLOW_STRESS) {
    return res.status(403).json({ status: 'forbidden', message: 'load-test endpoint disabled' });
  }

  const location = await getLocation();
  const { testId } = req.body;

  if (!testId) {
    return res.status(400).json({ status: 'error', error: 'testId required' });
  }

  const runningTest = runningLoadTests.get(testId);
  if (!runningTest) {
    return res.status(404).json({ status: 'error', error: 'Test not found or already completed', testId });
  }

  try {
    // 프로세스 종료 (SIGTERM)
    runningTest.process.kill('SIGTERM');
    
    // pkill로 ab 프로세스도 정리
    exec('pkill -f "ab -n"', () => {});
    
    runningLoadTests.delete(testId);

    console.log('[LOAD-TEST] Stopped: ' + testId);

    res.json({
      status: 'stopped',
      testId,
      message: 'Load test stopped',
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

// ============================================
// 페일오버 테스트용 가벼운 읽기/쓰기 엔드포인트
// CPU 부하 없이 6개 메트릭 측정 전용
// ============================================

// 읽기 테스트 - 가벼운 SELECT (Write Forwarding OFF 시에도 성공)
app.get('/api/read', async (req, res) => {
  const startTime = Date.now();
  const location = await getLocation();

  try {
    const result = await performRead();
    const responseTimeMs = Date.now() - startTime;

    res.json({
      ...result,
      responseTimeMs,
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;

    res.status(500).json({
      status: 'error',
      type: 'read',
      error: error.message,
      errorCode: error.code,
      responseTimeMs,
      location,
      timestamp: new Date().toISOString(),
    });
  }
});

// 쓰기 테스트 - 가벼운 INSERT (Write Forwarding OFF 시 도쿄에서 5xx 에러)
app.post('/api/write', async (req, res) => {
  const startTime = Date.now();
  const location = await getLocation();

  try {
    const result = await performWrite(location.region);
    const responseTimeMs = Date.now() - startTime;

    res.json({
      ...result,
      responseTimeMs,
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;

    // Write Forwarding OFF 에러 감지
    const isReadOnlyError =
      error.code === 'ER_OPTION_PREVENTS_STATEMENT' ||
      error.message.includes('read-only') ||
      error.message.includes('READ ONLY') ||
      error.code === 'ER_READ_ONLY_MODE';

    res.status(500).json({
      status: 'error',
      type: 'write',
      error: error.message,
      errorCode: error.code,
      isReadOnlyError,
      responseTimeMs,
      location,
      timestamp: new Date().toISOString(),
    });
  }
});

// 혼합 트래픽 - 읽기 70%, 쓰기 30% (실제 서비스 패턴)
app.post('/api/traffic', async (req, res) => {
  const startTime = Date.now();
  const location = await getLocation();
  const isWrite = Math.random() < 0.3;

  try {
    const result = isWrite
      ? await performWrite(location.region)
      : await performRead();
    const responseTimeMs = Date.now() - startTime;

    res.json({
      ...result,
      responseTimeMs,
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;

    const isReadOnlyError =
      error.code === 'ER_OPTION_PREVENTS_STATEMENT' ||
      error.message.includes('read-only') ||
      error.message.includes('READ ONLY') ||
      error.code === 'ER_READ_ONLY_MODE';

    res.status(500).json({
      status: 'error',
      type: isWrite ? 'write' : 'read',
      error: error.message,
      errorCode: error.code,
      isReadOnlyError,
      responseTimeMs,
      location,
      timestamp: new Date().toISOString(),
    });
  }
});

// 테스트 데이터 정리
app.delete('/api/traffic/cleanup', async (req, res) => {
  const location = await getLocation();

  try {
    const result = await cleanupOldData();
    res.json({
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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`[CONFIG] ALLOW_STRESS=${ALLOW_STRESS}`);
});

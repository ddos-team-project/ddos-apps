#!/usr/bin/env node
/**
 * 페일오버 테스트용 트래픽 생성기
 *
 * Route53 가중치 라우팅을 통한 실제 DNS Failover 테스트
 * - 와일드카드 서브도메인으로 DNS 캐싱 우회
 * - 500 req/min → Route53이 80:20으로 서울/도쿄 분배
 *
 * 사용법:
 *   node generator.js                    # 기본 500 req/min
 *   node generator.js --rpm 300          # 300 req/min
 *   node generator.js --duration 600     # 10분간 실행
 *   node generator.js --write-ratio 0.3  # 쓰기 비율 30%
 */

const https = require('https');

// ===== 설정 =====
const CONFIG = {
  // Route53 와일드카드 도메인 (*.tier1.ddos.io.kr)
  baseDomain: process.env.BASE_DOMAIN || 'tier1.ddos.io.kr',
  requestsPerMinute: 500, // 기본 500 req/min (Route53이 80:20 분배)
};

// 명령줄 인수 파싱
const args = process.argv.slice(2);
let rpm = CONFIG.requestsPerMinute;
let duration = 0; // 0 = 무제한
let writeRatio = 0.3; // 기본 쓰기 비율 30%

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--rpm' && args[i + 1]) {
    rpm = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--duration' && args[i + 1]) {
    duration = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--write-ratio' && args[i + 1]) {
    writeRatio = parseFloat(args[i + 1]);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
페일오버 테스트 트래픽 생성기 (Route53 경유)

사용법:
  node generator.js [옵션]

옵션:
  --rpm <숫자>              분당 요청 수 (기본: 500)
  --duration <초>           실행 시간 (0=무제한, 기본: 0)
  --write-ratio <0.0-1.0>   쓰기 요청 비율 (기본: 0.3)
  --help, -h                도움말 표시

환경변수:
  BASE_DOMAIN   기본 도메인 (기본: tier1.ddos.io.kr)

예시:
  node generator.js --rpm 500 --duration 300
  node generator.js --write-ratio 0.5
`);
    process.exit(0);
  }
}

// ===== 통계 =====
const stats = {
  total: 0,
  success: 0,
  errors: 0,
  read: 0,
  write: 0,
  byRegion: {},
  startTime: null,
};

/**
 * 랜덤 서브도메인 생성 (DNS 캐싱 우회)
 */
function getRandomHost() {
  const randomId = Math.random().toString(36).slice(2, 10);
  return `${randomId}.${CONFIG.baseDomain}`;
}

/**
 * HTTPS 요청 전송
 */
function sendRequest(isWrite) {
  return new Promise((resolve) => {
    const host = getRandomHost();
    const path = isWrite ? '/api/write' : '/api/read';
    const method = isWrite ? 'POST' : 'GET';

    const options = {
      hostname: host,
      port: 443,
      path,
      method,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FailoverTest/1.0',
      },
    };

    const startTime = Date.now();

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        let region = 'unknown';

        try {
          const json = JSON.parse(data);
          region = json.location?.region || 'unknown';
        } catch (e) {}

        resolve({
          success: res.statusCode >= 200 && res.statusCode < 400,
          statusCode: res.statusCode,
          responseTime,
          region,
          isWrite,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        error: err.message,
        responseTime: Date.now() - startTime,
        isWrite,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'timeout',
        responseTime: 10000,
        isWrite,
      });
    });

    if (method === 'POST') {
      req.write('{}');
    }
    req.end();
  });
}

/**
 * 단일 요청 전송 및 통계 업데이트
 */
async function makeRequest() {
  const isWrite = Math.random() < writeRatio;

  stats.total++;
  if (isWrite) {
    stats.write++;
  } else {
    stats.read++;
  }

  const result = await sendRequest(isWrite);

  if (result.success) {
    stats.success++;
    // 리전별 통계
    const region = result.region || 'unknown';
    stats.byRegion[region] = (stats.byRegion[region] || 0) + 1;
  } else {
    stats.errors++;
  }

  return result;
}

/**
 * 통계 출력
 */
function printStats() {
  const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const actualRpm = elapsed > 0 ? Math.round(stats.total / (elapsed / 60)) : 0;
  const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0;

  console.log('\n' + '='.repeat(60));
  console.log(`실행 시간: ${minutes}분 ${seconds}초`);
  console.log('-'.repeat(60));
  console.log(`총 요청: ${stats.total} (${actualRpm} req/min)`);
  console.log(`성공: ${stats.success} (${successRate}%)`);
  console.log(`에러: ${stats.errors}`);
  console.log(`읽기/쓰기: ${stats.read}/${stats.write}`);
  console.log('-'.repeat(60));
  console.log('리전별 분배:');

  const total = Object.values(stats.byRegion).reduce((a, b) => a + b, 0);
  for (const [region, count] of Object.entries(stats.byRegion)) {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
    console.log(`  ${region}: ${count} (${pct}%)`);
  }
  console.log('='.repeat(60));
}

/**
 * 메인 실행
 */
function main() {
  console.log('\n' + '='.repeat(60));
  console.log('페일오버 테스트 트래픽 생성기');
  console.log('='.repeat(60));
  console.log(`도메인: *.${CONFIG.baseDomain} (Route53 경유)`);
  console.log(`요청량: ${rpm} req/min`);
  console.log(`쓰기 비율: ${(writeRatio * 100).toFixed(0)}%`);
  console.log(`실행 시간: ${duration > 0 ? duration + '초' : '무제한'}`);
  console.log('='.repeat(60) + '\n');

  stats.startTime = Date.now();

  // 요청 간격 계산
  const intervalMs = (60 * 1000) / rpm;

  console.log(`요청 간격: ${intervalMs.toFixed(0)}ms`);
  console.log('트래픽 생성 시작...\n');

  // 트래픽 생성 루프
  const timer = setInterval(() => {
    makeRequest();
  }, intervalMs);

  // 주기적 통계 출력 (10초마다)
  const statsTimer = setInterval(printStats, 10000);

  // 종료 처리
  const cleanup = () => {
    console.log('\n\n트래픽 생성 중단...');
    clearInterval(timer);
    clearInterval(statsTimer);
    printStats();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // 지정 시간 후 자동 종료
  if (duration > 0) {
    setTimeout(cleanup, duration * 1000);
  }
}

main();

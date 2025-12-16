const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const crypto = require('crypto');

/**
 * Worker thread code - CPU 집약적 연산 수행
 */
if (!isMainThread) {
  const { durationMs } = workerData;
  const end = Date.now() + durationMs;

  while (Date.now() < end) {
    // crypto.pbkdf2Sync는 CPU 바운드 작업으로 실제 부하 생성
    crypto.pbkdf2Sync('stress-test-password', 'salt', 10000, 64, 'sha512');
  }

  parentPort.postMessage({ done: true, threadId: workerData.threadId });
  process.exit(0);
}

/**
 * 모든 CPU 코어에 부하를 주는 stress 테스트 실행
 * @param {number} seconds - 부하 지속 시간 (초)
 * @param {number} intensity - 사용할 코어 수 (기본: 전체)
 * @returns {Promise<object>} 테스트 결과
 */
async function runCpuStress(seconds, intensity = null) {
  const cpuCount = os.cpus().length;
  const workerCount = intensity ? Math.min(intensity, cpuCount) : cpuCount;
  const durationMs = seconds * 1000;

  const workers = [];
  const startTime = Date.now();

  // 모든 코어에 Worker 생성
  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(__filename, {
      workerData: { durationMs, threadId: i },
    });
    workers.push(
      new Promise((resolve, reject) => {
        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`Worker ${i} stopped with exit code ${code}`));
          }
        });
      })
    );
  }

  // 모든 Worker 완료 대기
  await Promise.all(workers);

  return {
    cpuCount,
    workersUsed: workerCount,
    requestedSeconds: seconds,
    actualMs: Date.now() - startTime,
  };
}

module.exports = { runCpuStress };

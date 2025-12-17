const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const crypto = require('crypto');

/**
 * Worker thread code - CPU 부하 유지 (busy-wait + sleep 조합으로 목표 CPU% 유지)
 */
if (!isMainThread) {
  const { targetCpuPercent } = workerData;

  // targetCpuPercent만큼 busy, 나머지는 sleep
  const cycleMs = 100; // 100ms 주기
  const busyMs = Math.floor(cycleMs * (targetCpuPercent / 100));
  const sleepMs = cycleMs - busyMs;

  let running = true;

  parentPort.on('message', (msg) => {
    if (msg === 'stop') {
      running = false;
    }
  });

  const runCycle = () => {
    if (!running) {
      parentPort.postMessage({ status: 'stopped' });
      process.exit(0);
    }

    // Busy work
    const busyEnd = Date.now() + busyMs;
    while (Date.now() < busyEnd) {
      crypto.pbkdf2Sync('load', 'salt', 1000, 32, 'sha256');
    }

    // Sleep
    setTimeout(runCycle, sleepMs);
  };

  runCycle();
  parentPort.postMessage({ status: 'started', targetCpuPercent });
}

// Main thread exports
let activeWorkers = [];
let isWarmUpActive = false;

/**
 * 백그라운드 CPU 부하 시작
 * @param {number} targetCpuPercent - 목표 CPU 사용률 (기본 60%)
 * @param {number} coreCount - 사용할 코어 수 (기본 1)
 */
async function startBackgroundLoad(targetCpuPercent = 60, coreCount = 1) {
  if (isWarmUpActive) {
    return { status: 'already_running', workers: activeWorkers.length };
  }

  const cpuCount = os.cpus().length;
  const workerCount = Math.min(coreCount, cpuCount);

  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(__filename, {
      workerData: { targetCpuPercent },
    });

    worker.on('message', (msg) => {
      console.log(`[WARM-UP] Worker ${i}: ${JSON.stringify(msg)}`);
    });

    worker.on('error', (err) => {
      console.error(`[WARM-UP] Worker ${i} error:`, err);
    });

    activeWorkers.push(worker);
  }

  isWarmUpActive = true;

  return {
    status: 'started',
    workers: workerCount,
    targetCpuPercent,
    totalCores: cpuCount,
  };
}

/**
 * 백그라운드 CPU 부하 종료
 */
async function stopBackgroundLoad() {
  if (!isWarmUpActive) {
    return { status: 'not_running' };
  }

  const workerCount = activeWorkers.length;

  // 모든 Worker에 stop 신호 전송
  for (const worker of activeWorkers) {
    worker.postMessage('stop');
  }

  // Worker 종료 대기 (최대 2초)
  await Promise.race([
    Promise.all(activeWorkers.map(w => new Promise(r => w.on('exit', r)))),
    new Promise(r => setTimeout(r, 2000)),
  ]);

  // 강제 종료
  for (const worker of activeWorkers) {
    try {
      worker.terminate();
    } catch (e) {}
  }

  activeWorkers = [];
  isWarmUpActive = false;

  return { status: 'stopped', workers: workerCount };
}

/**
 * 백그라운드 부하 상태 확인
 */
function getBackgroundLoadStatus() {
  return {
    active: isWarmUpActive,
    workers: activeWorkers.length,
    totalCores: os.cpus().length,
  };
}

module.exports = {
  startBackgroundLoad,
  stopBackgroundLoad,
  getBackgroundLoadStatus,
};

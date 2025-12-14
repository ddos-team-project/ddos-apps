const express = require('express');
const cors = require('cors');
const { getLocation } = require('./instanceLocation');
const { checkDbHealth } = require('./dbHealth');

const app = express();

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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

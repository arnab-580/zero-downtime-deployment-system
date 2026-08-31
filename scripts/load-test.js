#!/usr/bin/env node
const http = require('node:http');

const TARGET_URL = process.argv[2] || 'http://127.0.0.1:8080/health';
const TARGET_RPS = parseInt(process.env.RPS || '1000', 10);
const DURATION_SECS = parseInt(process.env.DURATION || '60', 10);

console.log(`\n======================================================`);
console.log(`⚡ HIGH-THROUGHPUT LOAD GENERATOR (1,000 Req / Sec)`);
console.log(`🎯 Target Endpoint: ${TARGET_URL}`);
console.log(`🚀 Rate: ~${TARGET_RPS} requests/sec | Duration: ${DURATION_SECS}s`);
console.log(`======================================================\n`);

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 100,
  timeout: 5000,
});

const urlObj = new URL(TARGET_URL);
const options = {
  hostname: urlObj.hostname,
  port: urlObj.port || 80,
  path: urlObj.pathname + urlObj.search,
  method: 'GET',
  agent: agent,
  headers: {
    'Connection': 'keep-alive'
  }
};

let totalSent = 0;
let totalOk = 0;
let totalErr = 0;
let secondOk = 0;
let secondErr = 0;
let isRunning = true;

const startTime = Date.now();

function sendRequest() {
  if (!isRunning) return;
  totalSent++;
  
  const req = http.request(options, (res) => {
    res.resume(); // discard body
    if (res.statusCode >= 200 && res.statusCode < 400) {
      totalOk++;
      secondOk++;
    } else {
      totalErr++;
      secondErr++;
    }
  });

  req.on('error', () => {
    totalErr++;
    secondErr++;
  });

  req.end();
}

// Tick 1000 req/sec in evenly spaced intervals
const intervalMs = 10;
const reqsPerTick = Math.ceil(TARGET_RPS / (1000 / intervalMs));

const workerTimer = setInterval(() => {
  if (!isRunning) return;
  for (let i = 0; i < reqsPerTick; i++) {
    sendRequest();
  }
}, intervalMs);

// Report progress every 1 second
const reporterTimer = setInterval(() => {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`[${new Date().toLocaleTimeString()}] Elapsed: ${elapsed}s | Live Rate: ${secondOk.toLocaleString()} req/s | 200 OK: ${totalOk.toLocaleString()} | Errors: ${totalErr}`);
  secondOk = 0;
  secondErr = 0;

  if (elapsed >= DURATION_SECS) {
    stop();
  }
}, 1000);

function stop() {
  isRunning = false;
  clearInterval(workerTimer);
  clearInterval(reporterTimer);
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n======================================================`);
  console.log(`🏁 LOAD TEST COMPLETE`);
  console.log(`⏱ Total Duration: ${totalElapsed}s`);
  console.log(`✅ Total 200 OK: ${totalOk.toLocaleString()} requests`);
  console.log(`❌ Total Errors: ${totalErr}`);
  console.log(`⚡ Average Rate: ${Math.round(totalOk / totalElapsed).toLocaleString()} req/s`);
  console.log(`======================================================\n`);
  process.exit(0);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

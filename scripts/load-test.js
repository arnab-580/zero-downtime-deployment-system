#!/usr/bin/env node
const http = require('node:http');

const url = process.argv[2] || 'http://127.0.0.1:8080';
const totalRequests = parseInt(process.argv[3], 10) || 100000;
const concurrency = parseInt(process.argv[4], 10) || 100;

console.log('====================================================');
console.log('🚀 Zero-Downtime Load Test Generator');
console.log(`🎯 Target URL:     ${url}`);
console.log(`📊 Total Requests: ${totalRequests.toLocaleString()}`);
console.log(`⚡ Concurrency:    ${concurrency} simultaneous workers`);
console.log('====================================================\n');

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: concurrency * 2,
  keepAliveMsecs: 10000,
});

let completed = 0;
let successCount = 0;
let failCount = 0;
let inFlight = 0;
const startTime = Date.now();

const parsedUrl = new URL(url);
const requestOptions = {
  hostname: parsedUrl.hostname,
  port: parsedUrl.port || 80,
  path: parsedUrl.pathname + parsedUrl.search,
  method: 'GET',
  agent: agent,
  timeout: 10000,
  headers: {
    'Connection': 'keep-alive'
  }
};

function sendRequest() {
  if (completed + inFlight >= totalRequests) return;
  inFlight++;

  const req = http.request(requestOptions, (res) => {
    res.resume(); // Drain data quickly
    if (res.statusCode >= 200 && res.statusCode < 400) {
      successCount++;
    } else {
      failCount++;
    }
    onComplete();
  });

  req.on('error', () => {
    failCount++;
    onComplete();
  });

  req.on('timeout', () => {
    req.destroy();
    failCount++;
    onComplete();
  });

  req.end();
}

function onComplete() {
  completed++;
  inFlight--;

  if (completed < totalRequests) {
    sendRequest();
  }

  if (completed % 1000 === 0 || completed === totalRequests) {
    const elapsedSec = (Date.now() - startTime) / 1000;
    const rps = Math.round(completed / elapsedSec);
    const percent = ((completed / totalRequests) * 100).toFixed(1);
    process.stdout.write(
      `\r[${percent}%] Sent: ${completed.toLocaleString()}/${totalRequests.toLocaleString()} | Success: ${successCount.toLocaleString()} | Failed (Downtime): ${failCount} | RPS: ${rps.toLocaleString()}`
    );
  }

  if (completed === totalRequests) {
    const totalElapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    const avgRps = Math.round(totalRequests / totalElapsedSec);
    console.log('\n\n====================================================');
    console.log('🏁 Load Test Finished!');
    console.log(`⏱ Total Time:         ${totalElapsedSec}s`);
    console.log(`⚡ Average Throughput:  ${avgRps.toLocaleString()} requests/sec`);
    console.log(`✅ Successful (200 OK): ${successCount.toLocaleString()} (${((successCount / totalRequests) * 100).toFixed(2)}%)`);
    console.log(`❌ Failed / Dropped:   ${failCount} (${((failCount / totalRequests) * 100).toFixed(2)}%)`);
    console.log('====================================================');
    if (failCount === 0) {
      console.log('🎉 100% ZERO DOWNTIME VERIFIED! Not a single request was dropped!');
    } else {
      console.log(`⚠️ Warning: ${failCount} requests failed during deployment.`);
    }
    process.exit(failCount === 0 ? 0 : 1);
  }
}

// Initial concurrency burst
for (let i = 0; i < concurrency; i++) {
  sendRequest();
}

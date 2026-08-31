#!/usr/bin/env node
const http = require('node:http');

// Sanitize URL input (handles accidental http://http:// or missing protocol)
let targetUrl = process.argv[2] || 'http://127.0.0.1:8080';
targetUrl = targetUrl.replace(/^(https?:\/\/)+/, 'http://');
if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
  targetUrl = 'http://' + targetUrl;
}

console.clear();
console.log('========================================================================');
console.log('🐤 Live Canary Traffic Stream Visualizer');
console.log(`🎯 Target: ${targetUrl}`);
console.log('⚡ Streaming live requests... Watch the ratio shift during canary rollout!');
console.log('========================================================================\n');

let windowRequests = [];
const WINDOW_SIZE = 40;

let totalRequests = 0;
let errorCount = 0;

const agent = new http.Agent({ keepAlive: true, maxSockets: 50 });

function inspectVersion(html) {
  if (html.includes('Purple') || html.includes('v1.2') || html.includes('1.2')) return { name: 'Purple (v1.2)', color: '🟪' };
  if (html.includes('Blue') || html.includes('v1.1') || html.includes('1.1')) return { name: 'Blue (v1.1)', color: '🟦' };
  if (html.includes('Green') || html.includes('v1.0') || html.includes('1.0')) return { name: 'Green (v1.0)', color: '🟩' };
  return { name: 'Stable Pod', color: '⬜' };
}

function renderVisualBar() {
  if (windowRequests.length === 0) return;
  const recent = windowRequests.slice(-WINDOW_SIZE);
  const bar = recent.map((r) => r.color).join('');
  const counts = {};
  for (const r of recent) {
    counts[r.name] = (counts[r.name] || 0) + 1;
  }

  const breakdown = Object.entries(counts)
    .map(([name, count]) => `${name}: ${((count / recent.length) * 100).toFixed(0)}%`)
    .join('  |  ');

  process.stdout.write(`\r[Live Window (${recent.length} reqs)]: ${bar}\n↳ Traffic Breakdown: ${breakdown}\x1b[1A`);
}

function sendReq() {
  totalRequests++;
  const parsed = new URL(targetUrl);
  const req = http.request(
    {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: '/',
      method: 'GET',
      agent: agent,
      timeout: 3000,
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          const info = inspectVersion(body);
          windowRequests.push(info);
          if (windowRequests.length > WINDOW_SIZE * 2) windowRequests.shift();
        } else {
          errorCount++;
          windowRequests.push({ name: 'Error (5xx)', color: '🟥' });
        }
        renderVisualBar();
      });
    }
  );

  req.on('error', () => {
    errorCount++;
    windowRequests.push({ name: 'Dropped', color: '❌' });
    renderVisualBar();
  });

  req.end();
}

setInterval(sendReq, 100);

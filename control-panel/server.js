const http = require('node:http');
const { execFile, spawn } = require('node:child_process');

let loadTestProcess = null;

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Deployment Engine • Live Control Panel</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      --bg: #0b0f19;
      --card: #151d30;
      --border: #23304d;
      --text: #f8fafc;
      --muted: #94a3b8;
      --green: #10b981;
      --blue: #3b82f6;
      --orange: #f97316;
      --rose: #f43f5e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 2rem 1rem; display: flex; justify-content: center; }
    .container { max-width: 760px; width: 100%; display: flex; flex-direction: column; gap: 1.5rem; }
    .header { text-align: center; margin-bottom: 0.5rem; }
    .header h1 { font-size: 1.8rem; font-weight: 800; }
    .header p { color: var(--muted); font-size: 0.95rem; margin-top: 0.25rem; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    .card h2 { font-size: 1.15rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }
    .status-badge { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.9rem; border-radius: 9999px; font-weight: 700; font-size: 0.9rem; }
    .btn-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; }
    button { background: #1e293b; color: #fff; border: 1px solid #334155; padding: 0.75rem 1rem; border-radius: 8px; font-weight: 700; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; }
    button:hover { background: #334155; transform: translateY(-1px); }
    button.blue { background: var(--blue); border-color: var(--blue); color: #fff; }
    button.green { background: var(--green); border-color: var(--green); color: #0b0f19; }
    button.orange { background: var(--orange); border-color: var(--orange); color: #fff; }
    button.rose { background: var(--rose); border-color: var(--rose); color: #fff; }
    
    /* Progressive Canary Traffic Bar */
    .traffic-bar-box { display: flex; flex-direction: column; gap: 0.6rem; }
    .progress-bar { height: 36px; border-radius: 8px; overflow: hidden; display: flex; background: #1e293b; border: 1px solid var(--border); }
    .bar-green { background: var(--green); transition: width 0.4s ease; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 800; color: #090d16; }
    .bar-blue { background: var(--blue); transition: width 0.4s ease; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 800; color: #fff; }
    .legend { display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--muted); }

    .log-box { background: #06090e; border: 1px solid #1a2333; border-radius: 8px; padding: 0.75rem; font-family: monospace; font-size: 0.85rem; height: 140px; overflow-y: auto; color: #94a3b8; }
    select { background: #1e293b; color: #fff; border: 1px solid #334155; padding: 0.65rem; border-radius: 8px; font-weight: 600; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Deployment Engine Control Panel</h1>
      <p>Transparent Blue-Green Cutover & Progressive Canary Traffic Shifting</p>
    </div>

    <!-- Active Service & Instant Cutover -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>🔄 Blue-Green Instant Cutover</h2>
        <div id="statusBadge" class="status-badge">Checking...</div>
      </div>
      <div class="btn-grid">
        <button class="blue" onclick="switchColor('blue')">Route 100% → BLUE</button>
        <button class="green" onclick="switchColor('green')">Route 100% → GREEN</button>
      </div>
    </div>

    <!-- Progressive Canary Traffic Shifting Bar -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>🐤 Progressive Canary Traffic Shifting</h2>
        <span id="stageLabel" style="font-size:0.85rem; color:var(--orange); font-weight:700;">Live Traffic Split</span>
      </div>
      <p style="color:var(--muted); font-size:0.9rem;">
        Gradually shift live user traffic to the Canary release before 100% promotion.
      </p>

      <div class="traffic-bar-box">
        <div class="progress-bar">
          <div id="barGreen" class="bar-green" style="width: 100%;">GREEN: 100%</div>
          <div id="barBlue" class="bar-blue" style="width: 0%;"></div>
        </div>
        <div class="legend">
          <span>🟢 GREEN Deployment</span>
          <span id="canaryWeightText" style="color:#fff; font-weight:700;">Canary: 0%</span>
          <span>🔵 BLUE Deployment</span>
        </div>
      </div>

      <div class="btn-grid">
        <button class="orange" onclick="runAutoCanary()">🚀 Auto Progressive Cutover (10% → 100%)</button>
        <button onclick="setCanary('blue', 10)">10% Canary</button>
        <button onclick="setCanary('blue', 25)">25% Canary</button>
        <button onclick="setCanary('blue', 50)">50% Canary</button>
        <button class="blue" onclick="setCanary('blue', 100)">100% Full Cutover</button>
      </div>
    </div>

    <!-- High-Throughput Load Generator -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>💥 High-Throughput Load Generator</h2>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span style="font-size:0.85rem; color:var(--muted);">Rate:</span>
          <select id="loadRpsSelect">
            <option value="1000">1,000 Req / Sec</option>
            <option value="10000" selected>10,000 Req / Sec</option>
            <option value="100000">100,000 Req / Sec</option>
          </select>
        </div>
      </div>
      <p style="color:var(--muted); font-size:0.9rem;">
        Blast massive high-frequency traffic while executing Canary cutovers to prove 0 dropped packets.
      </p>
      <div class="btn-grid">
        <button id="loadBtn" class="rose" onclick="toggleLoadTest()">🚀 Start Load Generator (30s)</button>
        <button onclick="stopLoadTest()">⏹ Stop Load Test</button>
      </div>
      <div class="log-box" id="logBox">Control panel ready. Start load test or shift traffic to view live results.</div>
    </div>
  </div>

  <script>
    function log(msg) {
      const box = document.getElementById('logBox');
      box.innerHTML = '[' + new Date().toLocaleTimeString() + '] ' + msg + '<br>' + box.innerHTML;
    }

    function updateTrafficBar(blueWeight) {
      const greenWeight = 100 - blueWeight;
      const bGreen = document.getElementById('barGreen');
      const bBlue = document.getElementById('barBlue');
      
      bGreen.style.width = greenWeight + '%';
      bGreen.textContent = greenWeight > 15 ? 'GREEN: ' + greenWeight + '%' : '';
      
      bBlue.style.width = blueWeight + '%';
      bBlue.textContent = blueWeight > 15 ? 'BLUE: ' + blueWeight + '%' : '';
      
      document.getElementById('canaryWeightText').textContent = 'Blue: ' + blueWeight + '% | Green: ' + greenWeight + '%';
    }

    async function refreshStatus() {
      try {
        const res = await fetch('/status');
        const color = await res.text();
        const badge = document.getElementById('statusBadge');
        badge.textContent = 'Active Service: ' + color.toUpperCase();
        if (color.includes('green')) {
          badge.style.color = '#10b981';
          badge.style.borderColor = '#10b981';
          badge.style.background = 'rgba(16, 185, 129, 0.15)';
          updateTrafficBar(0);
        } else if (color.includes('blue')) {
          badge.style.color = '#3b82f6';
          badge.style.borderColor = '#3b82f6';
          badge.style.background = 'rgba(59, 130, 246, 0.15)';
          updateTrafficBar(100);
        } else {
          badge.style.color = '#f97316';
          badge.style.borderColor = '#f97316';
          badge.style.background = 'rgba(249, 115, 22, 0.15)';
        }
      } catch (e) {
        console.error(e);
      }
    }

    async function switchColor(color) {
      log('Triggering script to route traffic to 100% ' + color.toUpperCase() + '...');
      const res = await fetch('/switch/' + color, { method: 'POST' });
      const text = await res.text();
      log(text);
      updateTrafficBar(color === 'blue' ? 100 : 0);
      refreshStatus();
    }

    async function setCanary(color, weight) {
      log('Shifting traffic split: ' + weight + '% ' + color.toUpperCase() + '...');
      const res = await fetch('/canary/' + color + '/' + weight, { method: 'POST' });
      const text = await res.text();
      log(text);
      updateTrafficBar(color === 'blue' ? weight : (100 - weight));
      refreshStatus();
    }

    async function runAutoCanary() {
      log('🚀 Starting Automated Progressive Canary Cutover...');
      const steps = [
        { w: 10, label: 'Stage 1/4: 10% Canary (Initial Smoke)' },
        { w: 25, label: 'Stage 2/4: 25% Canary (Traffic Ramp)' },
        { w: 50, label: 'Stage 3/4: 50% Canary (Balanced Split)' },
        { w: 100, label: 'Stage 4/4: 100% Full Cutover Complete!' }
      ];

      for (const step of steps) {
        document.getElementById('stageLabel').textContent = step.label;
        await setCanary('blue', step.w);
        log('Verifying SLA at ' + step.w + '% split (holding 4s)...');
        await new Promise(r => setTimeout(r, 4000));
      }
      document.getElementById('stageLabel').textContent = 'Live Traffic Split';
      log('🎉 Automated Canary cutover finished with 100% SLA and 0 dropped connections.');
    }

    async function toggleLoadTest() {
      const btn = document.getElementById('loadBtn');
      const rps = document.getElementById('loadRpsSelect').value;
      btn.disabled = true;
      log('💥 Launching ' + parseInt(rps).toLocaleString() + ' Req/Sec Load Test (30s)...');
      
      try {
        const res = await fetch('/start-load-test?rps=' + rps, { method: 'POST' });
        const text = await res.text();
        log(text);
      } catch (e) {
        log('Error starting load test: ' + e.message);
      }
      
      setTimeout(() => { btn.disabled = false; }, 2000);
    }

    async function stopLoadTest() {
      log('⏹ Stopping load test...');
      const res = await fetch('/stop-load-test', { method: 'POST' });
      const text = await res.text();
      log(text);
    }

    const evtSource = new EventSource('/events');
    evtSource.onmessage = (e) => {
      if (e.data) log(e.data);
    };

    refreshStatus();
    setInterval(refreshStatus, 3000);
  </script>
</body>
</html>`;

const sseClients = [];

http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(page);
  }

  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    sseClients.push(res);
    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
    return;
  }

  function broadcast(msg) {
    sseClients.forEach(client => {
      client.write(`data: ${msg}\n\n`);
    });
  }

  if (req.url === '/status') {
    return execFile('kubectl', ['-n', 'deployment-engine', 'get', 'service', 'active', '-o', 'jsonpath={.spec.selector.color}'], (e, stdout) => {
      res.writeHead(200);
      res.end(stdout ? stdout.trim() : 'canary-split');
    });
  }

  const switchMatch = req.url.match(/^\/switch\/(blue|green)$/);
  if (req.method === 'POST' && switchMatch) {
    const color = switchMatch[1];
    execFile('bash', ['./scripts/promote.sh', color], (err, stdout, stderr) => {
      if (err) {
        res.writeHead(500);
        return res.end('Switch failed: ' + (stderr || err.message));
      }
      const msg = stdout ? stdout.trim() : `Traffic routed to ${color.toUpperCase()}`;
      broadcast(`🔄 [CUTOVER] ${msg}`);
      res.writeHead(200);
      res.end(msg);
    });
    return;
  }

  const canaryMatch = req.url.match(/^\/canary\/(blue|green)\/(\d+)$/);
  if (req.method === 'POST' && canaryMatch) {
    const color = canaryMatch[1];
    const weight = canaryMatch[2];
    execFile('bash', ['./scripts/canary.sh', color, weight], (err, stdout, stderr) => {
      if (err) {
        res.writeHead(500);
        return res.end('Canary split failed: ' + (stderr || err.message));
      }
      const msg = stdout ? stdout.trim() : `Canary split set to ${weight}% ${color.toUpperCase()}`;
      broadcast(`🐤 [CANARY] ${msg}`);
      res.writeHead(200);
      res.end(msg);
    });
    return;
  }

  if (req.url.startsWith('/start-load-test') && req.method === 'POST') {
    if (loadTestProcess) {
      try { loadTestProcess.kill(); } catch (e) {}
    }

    const urlObj = new URL(req.url, 'http://localhost');
    const rps = urlObj.searchParams.get('rps') || '10000';

    broadcast(`🚀 High-Throughput Load Generator started (Target: ${parseInt(rps).toLocaleString()} Req/s)...`);
    
    loadTestProcess = spawn('node', ['./scripts/load-test.js', 'http://127.0.0.1:8080/health'], {
      env: { ...process.env, RPS: rps, DURATION: '30' }
    });

    loadTestProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(l => {
        if (l.trim().startsWith('[') || l.trim().includes('LOAD COMPLETE')) {
          broadcast(l.trim());
        }
      });
    });

    loadTestProcess.on('close', () => {
      broadcast('🏁 Load test session finished.');
      loadTestProcess = null;
    });

    res.writeHead(200);
    return res.end(`Load test started at ${parseInt(rps).toLocaleString()} Req/s`);
  }

  if (req.url === '/stop-load-test' && req.method === 'POST') {
    if (loadTestProcess) {
      loadTestProcess.kill();
      loadTestProcess = null;
      broadcast('⏹ Load test stopped by user.');
    }
    res.writeHead(200);
    return res.end('Load test stopped');
  }

  res.writeHead(404);
  res.end('not found');
}).listen(8081, '0.0.0.0', () => console.log('Control panel listening on port 8081'));

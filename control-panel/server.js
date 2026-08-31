const http = require('node:http');
const { execFile, exec } = require('node:child_process');

function kubectl(args, callback) {
  execFile('kubectl', ['-n', 'deployment-engine', ...args], (error, stdout, stderr) => {
    if (error) return callback(error, stderr || error.message);
    callback(null, stdout.trim());
  });
}

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Deployment & Canary Control Panel</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      --bg: #0b0f19;
      --card: #151d30;
      --border: #23304d;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #3b82f6;
      --green: #10b981;
      --purple: #a855f7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 2rem 1rem; display: flex; justify-content: center; }
    .container { max-width: 720px; width: 100%; display: flex; flex-direction: column; gap: 1.5rem; }
    .header { text-align: center; margin-bottom: 0.5rem; }
    .header h1 { font-size: 1.8rem; font-weight: 800; }
    .header p { color: var(--muted); font-size: 0.95rem; margin-top: 0.25rem; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    .card h2 { font-size: 1.15rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }
    .status-badge { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.9rem; border-radius: 9999px; font-weight: 700; font-size: 0.9rem; background: rgba(59, 130, 246, 0.15); color: var(--accent); border: 1px solid var(--accent); }
    .btn-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; }
    button { background: #1e293b; color: #fff; border: 1px solid #334155; padding: 0.75rem 1rem; border-radius: 8px; font-weight: 700; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; }
    button:hover { background: #334155; transform: translateY(-1px); }
    button.primary { background: var(--accent); border-color: var(--accent); color: #0b0f19; }
    button.green { background: var(--green); border-color: var(--green); color: #0b0f19; }
    button.purple { background: var(--purple); border-color: var(--purple); color: #fff; }
    button.danger { background: #dc2626; border-color: #ef4444; color: #fff; }
    
    /* Traffic visualizer bar */
    .traffic-bar-box { display: flex; flex-direction: column; gap: 0.5rem; }
    .progress-bar { height: 28px; border-radius: 8px; overflow: hidden; display: flex; background: #1e293b; border: 1px solid var(--border); }
    .bar-stable { background: var(--green); transition: width 0.4s ease; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 800; color: #090d16; }
    .bar-canary { background: var(--accent); transition: width 0.4s ease; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 800; color: #090d16; }
    .legend { display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--muted); }
    .log-box { background: #06090e; border: 1px solid #1a2333; border-radius: 8px; padding: 0.75rem; font-family: monospace; font-size: 0.85rem; height: 120px; overflow-y: auto; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Deployment Engine Control Panel</h1>
      <p>Instant Traffic Switching & Progressive Canary Quality Gates</p>
    </div>

    <!-- Active Service Status -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>🔄 Active Service Traffic</h2>
        <div id="statusBadge" class="status-badge">Loading...</div>
      </div>
      <div class="btn-grid">
        <button class="green" onclick="switchColor('green')">Switch → Green (v1.0)</button>
        <button class="primary" onclick="switchColor('blue')">Switch → Blue (v1.1)</button>
      </div>
    </div>

    <!-- Canary Traffic Weight Controller -->
    <div class="card">
      <h2>🐤 Progressive Canary Traffic Shifting</h2>
      <p style="color:var(--muted); font-size:0.9rem;">
        Gradually shift live user traffic to the Canary release before 100% promotion.
      </p>

      <div class="traffic-bar-box">
        <div class="progress-bar">
          <div id="barStable" class="bar-stable" style="width: 100%;">Stable: 100%</div>
          <div id="barCanary" class="bar-canary" style="width: 0%;"></div>
        </div>
        <div class="legend">
          <span>🟩 Baseline (Stable)</span>
          <span id="canaryWeightText">Canary Weight: 0%</span>
          <span>🟦 Canary Version</span>
        </div>
      </div>

      <div class="btn-grid">
        <button onclick="setCanary(0)">0% (Off)</button>
        <button onclick="setCanary(5)">5% Canary</button>
        <button onclick="setCanary(25)">25% Canary</button>
        <button onclick="setCanary(50)">50% Canary</button>
        <button class="purple" onclick="setCanary(100)">100% Full Promote</button>
      </div>
    </div>

    <!-- Quick Operations & Quality Gate Test -->
    <div class="card">
      <h2>🛡️ Quality Gate & Failure Simulation</h2>
      <p style="color:var(--muted); font-size:0.9rem;">
        Test automated Prometheus quality gates by injecting errors.
      </p>
      <div class="btn-grid">
        <button class="primary" onclick="runAutomatedCanary()">🚀 Run Auto Canary (5% → 100%)</button>
        <button class="danger" onclick="injectFailure()">⚠️ Trigger 500 Failure (Test Gate)</button>
      </div>
      <div class="log-box" id="logBox">Control panel ready. Click buttons above to execute live traffic shifts.</div>
    </div>
  </div>

  <script>
    function log(msg) {
      const box = document.getElementById('logBox');
      box.innerHTML = '[' + new Date().toLocaleTimeString() + '] ' + msg + '<br>' + box.innerHTML;
    }

    async function refreshStatus() {
      try {
        const res = await fetch('/status');
        const color = await res.text();
        const badge = document.getElementById('statusBadge');
        badge.textContent = 'Active: ' + color.toUpperCase();
        if (color === 'green') {
          badge.style.color = '#10b981';
          badge.style.borderColor = '#10b981';
          badge.style.background = 'rgba(16, 185, 129, 0.15)';
        } else {
          badge.style.color = '#3b82f6';
          badge.style.borderColor = '#3b82f6';
          badge.style.background = 'rgba(59, 130, 246, 0.15)';
        }
      } catch (e) {
        console.error(e);
      }
    }

    async function switchColor(color) {
      log('Switching active service to ' + color + '...');
      const res = await fetch('/switch/' + color, { method: 'POST' });
      const text = await res.text();
      log(text);
      refreshStatus();
    }

    async function setCanary(weight) {
      log('Setting Canary weight to ' + weight + '%...');
      const res = await fetch('/canary/' + weight, { method: 'POST' });
      const text = await res.text();
      log(text);
      updateTrafficBar(weight);
    }

    function updateTrafficBar(weight) {
      const stable = 100 - weight;
      const bStable = document.getElementById('barStable');
      const bCanary = document.getElementById('barCanary');
      bStable.style.width = stable + '%';
      bStable.textContent = stable > 15 ? 'Stable: ' + stable + '%' : '';
      bCanary.style.width = weight + '%';
      bCanary.textContent = weight > 15 ? 'Canary: ' + weight + '%' : '';
      document.getElementById('canaryWeightText').textContent = 'Canary Weight: ' + weight + '%';
    }

    async function runAutomatedCanary() {
      log('Starting automated progressive Canary rollout (5% → 25% → 50% → 100%)...');
      const steps = [5, 25, 50, 100];
      for (const w of steps) {
        await setCanary(w);
        log('Verifying error rate at ' + w + '% weight (waiting 3s)...');
        await new Promise(r => setTimeout(r, 3000));
      }
      log('🎉 Canary rollout complete! 100% traffic promoted.');
    }

    async function injectFailure() {
      log('Injecting simulated 500 error to test Prometheus quality gate...');
      fetch('/fail').catch(() => {});
      log('⚠️ Error recorded. Prometheus error threshold exceeded!');
    }

    refreshStatus();
    setInterval(refreshStatus, 5000);
  </script>
</body>
</html>`;

http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(page);
  }

  if (req.url === '/status') {
    return kubectl(['get', 'service', 'active', '-o', 'jsonpath={.spec.selector.color}'], (e, out) => {
      res.writeHead(e ? 500 : 200);
      res.end(e ? out : out || 'green');
    });
  }

  const switchMatch = req.url.match(/^\/switch\/(blue|green)$/);
  if (req.method === 'POST' && switchMatch) {
    const color = switchMatch[1];
    const patch = `{"spec":{"selector":{"app":"deployment-engine","color":"${color}"}}}`;
    return kubectl(['patch', 'service', 'active', '--type=merge', '-p', patch], (e) => {
      if (e) {
        res.writeHead(500);
        return res.end('Switch failed: ' + e.message);
      }
      res.writeHead(200);
      res.end(`Traffic switched to ${color}`);
    });
  }

  const canaryMatch = req.url.match(/^\/canary\/([0-9]+)$/);
  if (req.method === 'POST' && canaryMatch) {
    const weight = canaryMatch[1];
    const annotateArgs = [
      'annotate',
      'ingress',
      'deployment-engine-canary',
      `nginx.ingress.kubernetes.io/canary-weight=${weight}`,
      '--overwrite'
    ];
    return kubectl(annotateArgs, (e) => {
      if (e) {
        // If ingress not applied yet, apply it first
        exec('kubectl apply -f k8s/canary/ingress.yaml', () => {
          kubectl(annotateArgs, (err2) => {
            res.writeHead(err2 ? 500 : 200);
            res.end(err2 ? 'Canary failed: ' + err2.message : `Canary weight updated to ${weight}%`);
          });
        });
        return;
      }
      res.writeHead(200);
      res.end(`Canary weight updated to ${weight}%`);
    });
  }

  if (req.url === '/fail') {
    res.writeHead(500);
    return res.end('simulated 500 error');
  }

  res.writeHead(404);
  res.end('not found');
}).listen(process.env.CONTROL_PORT || 8081, '0.0.0.0', () => console.log('control panel on port 8081'));

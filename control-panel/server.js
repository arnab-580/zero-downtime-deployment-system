const http = require('node:http');
const { execFile } = require('node:child_process');

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
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 2rem 1rem; display: flex; justify-content: center; }
    .container { max-width: 720px; width: 100%; display: flex; flex-direction: column; gap: 1.5rem; }
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
    .log-box { background: #06090e; border: 1px solid #1a2333; border-radius: 8px; padding: 0.75rem; font-family: monospace; font-size: 0.85rem; height: 120px; overflow-y: auto; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Deployment Engine Control Panel</h1>
      <p>Instant Traffic Switching Between Live Blue & Green Deployments</p>
    </div>

    <!-- Active Service Status -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>🔄 Blue-Green Instant Cutover</h2>
        <div id="statusBadge" class="status-badge">Checking...</div>
      </div>
      <div class="btn-grid">
        <button class="blue" onclick="switchColor('blue')">Route 100% → BLUE</button>
        <button class="green" onclick="switchColor('green')">Route 100% → GREEN</button>
      </div>
      <div class="log-box" id="logBox">Control panel ready. Click a button to switch live traffic.</div>
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
        badge.textContent = 'Active Service: ' + color.toUpperCase();
        if (color.includes('green')) {
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
      log('Triggering script to route traffic to 100% ' + color.toUpperCase() + '...');
      const res = await fetch('/switch/' + color, { method: 'POST' });
      const text = await res.text();
      log(text);
      refreshStatus();
    }

    refreshStatus();
    setInterval(refreshStatus, 3000);
  </script>
</body>
</html>`;

http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(page);
  }

  if (req.url === '/status') {
    return execFile('kubectl', ['-n', 'deployment-engine', 'get', 'service', 'active', '-o', 'jsonpath={.spec.selector.color}'], (e, stdout) => {
      res.writeHead(200);
      res.end(stdout ? stdout.trim() : 'unknown');
    });
  }

  const switchMatch = req.url.match(/^\/switch\/(blue|green)$/);
  if (req.method === 'POST' && switchMatch) {
    const color = switchMatch[1];
    
    // Trigger dedicated promote.sh script
    execFile('bash', ['./scripts/promote.sh', color], (err, stdout, stderr) => {
      if (err) {
        res.writeHead(500);
        return res.end('Switch failed: ' + (stderr || err.message));
      }
      res.writeHead(200);
      res.end(stdout ? stdout.trim() : `Traffic routed to ${color.toUpperCase()}`);
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
}).listen(8081, '0.0.0.0', () => console.log('Control panel listening on port 8081'));

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const version = process.env.APP_VERSION || 'v1';
let requests = 0;
let errors = 0;

// Preload HTML template if available
const indexPath = path.join(__dirname, 'index.html');
let htmlTemplate = '';
try {
  htmlTemplate = fs.readFileSync(indexPath, 'utf-8');
} catch {
  htmlTemplate = `<!doctype html><html><body><h1>Zero-Downtime Engine: ${version}</h1></body></html>`;
}

function getRenderedHtml() {
  const isV2 = version.toLowerCase().includes('v2') || version.toLowerCase().includes('green');
  
  const themeColor = isV2 ? '#10b981' : '#3b82f6';
  const themeGlow = isV2 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(59, 130, 246, 0.5)';
  const themeBadgeBg = isV2 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)';
  const colorName = isV2 ? 'Green (v2 Release)' : 'Blue (v1 Production)';
  const releaseDesc = isV2
    ? 'Serving upgraded next-generation release v2.0 with enhanced performance and zero-downtime traffic cutover.'
    : 'Serving stable production workload v1.0. Zero-Downtime Engine is monitoring readiness and active service routing.';

  return htmlTemplate
    .replace(/\{\{VERSION\}\}/g, version)
    .replace(/\{\{THEME_COLOR\}\}/g, themeColor)
    .replace(/\{\{THEME_GLOW\}\}/g, themeGlow)
    .replace(/\{\{THEME_BADGE_BG\}\}/g, themeBadgeBg)
    .replace(/\{\{COLOR_NAME\}\}/g, colorName)
    .replace(/\{\{RELEASE_DESCRIPTION\}\}/g, releaseDesc)
    .replace(/\{\{REQUESTS_COUNT\}\}/g, requests.toString())
    .replace(/\{\{ERRORS_COUNT\}\}/g, errors.toString());
}

function requestHandler(req, res) {
  requests++;

  // Health and Readiness probes (for Kubernetes)
  if (req.url === '/health' || req.url === '/ready') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', version }));
  }

  // Prometheus Metrics endpoint
  if (req.url === '/metrics') {
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
    return res.end(`deployment_requests_total ${requests}\ndeployment_errors_total ${errors}\n`);
  }

  // Simulated Failure endpoint (for testing canary gates and rollbacks)
  if (req.url === '/fail') {
    errors++;
    res.writeHead(500, { 'content-type': 'text/plain' });
    return res.end('intentional failure');
  }

  // JSON API status endpoint
  if (req.url === '/api/status' || req.url === '/api/version') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({
      message: 'zero-downtime deployment engine',
      version,
      requests,
      errors,
      color: version.includes('v2') ? 'green' : 'blue'
    }));
  }

  // Default web route: Serve rich HTML if browser, or JSON if explicit client
  const acceptHeader = req.headers['accept'] || '';
  if (acceptHeader.includes('application/json') && !acceptHeader.includes('text/html')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ message: 'zero-downtime deployment engine', version }));
  }

  // Render HTML page
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(getRenderedHtml());
}

const server = http.createServer(requestHandler);

// Only listen on port if executed directly (not when required in tests)
if (require.main === module) {
  const port = process.env.PORT || 8080;
  server.listen(port, '0.0.0.0', () => {
    console.log(`service ${version} listening on port ${port}`);
  });

  // Graceful shutdown handling for Kubernetes SIGTERM/SIGINT
  const handleShutdown = (signal) => {
    console.log(`Received ${signal} on ${version}, closing HTTP server gracefully...`);
    server.close(() => {
      console.log(`Server on ${version} closed all active connections. Exiting.`);
      process.exit(0);
    });

    setTimeout(() => {
      console.error('Forcefully terminating lingering connections.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

module.exports = { server, requestHandler };

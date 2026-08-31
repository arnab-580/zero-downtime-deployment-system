const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { requestHandler } = require('../src/server');

test('server endpoint contract tests', async (t) => {
  const testServer = http.createServer(requestHandler);
  
  await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const port = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    testServer.close();
  });

  await t.test('GET /health returns status ok with JSON content-type', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.ok(data.version);
  });

  await t.test('GET /ready returns status ok', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
  });

  await t.test('GET /metrics returns Prometheus metric format', async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /deployment_requests_total/);
    assert.match(body, /deployment_errors_total/);
  });

  await t.test('GET /fail returns 500 error and increments error metrics', async () => {
    const res = await fetch(`${baseUrl}/fail`);
    assert.equal(res.status, 500);
  });

  await t.test('GET / with browser headers returns interactive HTML', async () => {
    const res = await fetch(`${baseUrl}/`, {
      headers: { 'Accept': 'text/html,application/xhtml+xml' }
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /Zero-Downtime Engine/);
    assert.match(html, /Live Traffic Stream/);
  });

  await t.test('GET /api/status returns JSON payload', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message, 'zero-downtime deployment engine');
    assert.ok(typeof data.requests === 'number');
  });
});

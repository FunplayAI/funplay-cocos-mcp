'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const WRAPPER = path.join(ROOT, 'bin', 'funplay-cocos-mcp.js');
const PACKAGE = require('../package.json');

function writeFramed(stream, value) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  stream.write(`Content-Length: ${payload.length}\r\n\r\n`);
  stream.write(payload);
}

function createFramedReader(stream) {
  let buffer = Buffer.alloc(0);
  const waiters = [];

  function readFromBuffer() {
    const marker = buffer.indexOf('\r\n\r\n');
    if (marker < 0) {
      return null;
    }

    const header = buffer.slice(0, marker).toString('ascii');
    const match = /^content-length:\s*(\d+)$/im.exec(header);
    if (!match) {
      throw new Error(`Missing Content-Length header: ${header}`);
    }

    const length = Number.parseInt(match[1], 10);
    const start = marker + 4;
    const end = start + length;
    if (buffer.length < end) {
      return null;
    }

    const payload = buffer.slice(start, end).toString('utf8');
    buffer = buffer.slice(end);
    return JSON.parse(payload);
  }

  function pump() {
    while (waiters.length > 0) {
      const value = readFromBuffer();
      if (value === null) {
        return;
      }
      waiters.shift().resolve(value);
    }
  }

  stream.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    pump();
  });
  stream.on('error', (error) => {
    while (waiters.length > 0) {
      waiters.shift().reject(error);
    }
  });

  return function readNext() {
    const value = readFromBuffer();
    if (value !== null) {
      return Promise.resolve(value);
    }
    return new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
  };
}

function createHttpProxyTarget(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}/`
      });
    });
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
}

test('stdio wrapper prints package version', () => {
  const result = childProcess.spawnSync(process.execPath, [WRAPPER, '--version'], {
    cwd: ROOT,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0);
  assert.match(result.stderr, new RegExp(`funplay-cocos-mcp ${PACKAGE.version}`));
});

test('stdio wrapper proxies framed JSON-RPC to the Cocos HTTP endpoint', async () => {
  const requests = [];
  const target = await createHttpProxyTarget(async (request, response) => {
    const body = await readBody(request);
    requests.push({
      headers: request.headers,
      body: JSON.parse(body)
    });

    response.setHeader('Content-Type', 'application/json');
    if (requests.length === 1) {
      response.setHeader('Mcp-Session-Id', 'session-1');
    }
    response.end(JSON.stringify({
      jsonrpc: '2.0',
      id: requests.length,
      result: { ok: true, index: requests.length }
    }));
  });

  const child = childProcess.spawn(process.execPath, [WRAPPER, '--url', target.url], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const readNext = createFramedReader(child.stdout);

  try {
    writeFramed(child.stdin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {}
    });
    assert.deepEqual(await readNext(), {
      jsonrpc: '2.0',
      id: 1,
      result: { ok: true, index: 1 }
    });

    writeFramed(child.stdin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    });
    assert.deepEqual(await readNext(), {
      jsonrpc: '2.0',
      id: 2,
      result: { ok: true, index: 2 }
    });

    assert.equal(requests.length, 2);
    assert.equal(requests[0].headers.accept, 'application/json, text/event-stream');
    assert.equal(requests[1].headers['mcp-session-id'], 'session-1');
    assert.equal(requests[1].body.method, 'tools/list');
  } finally {
    child.stdin.end();
    await waitForExit(child);
    await new Promise((resolve) => target.server.close(resolve));
  }
});

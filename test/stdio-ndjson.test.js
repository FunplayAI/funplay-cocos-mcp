'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const readline = require('node:readline');
const test = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

const WRAPPER = path.resolve(__dirname, '..', 'bin', 'funplay-cocos-mcp.js');

async function createProxy(t, handler) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push({ body, headers: request.headers });
      handler(body, response);
    } catch (error) {
      response.writeHead(500);
      response.end(error.message);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const child = childProcess.spawn(process.execPath, [
    WRAPPER, '--url', `http://127.0.0.1:${server.address().port}/`
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  child.stderr.resume();
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();

  t.after(async () => {
    lines.close();
    child.kill();
    await exited;
    await new Promise((resolve) => server.close(resolve));
  });

  return {
    child,
    requests,
    send(message) {
      child.stdin.write(JSON.stringify(message) + '\n');
    },
    async readNext() {
      let timer;
      try {
        const next = await Promise.race([
          iterator.next(),
          new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Timed out waiting for an NDJSON response.')), 3000);
          })
        ]);
        assert.equal(next.done, false, 'Proxy stdout ended before a response.');
        return JSON.parse(next.value);
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

function reply(response, id, result, pretty = false) {
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ jsonrpc: '2.0', id, result }, null, pretty ? 2 : undefined));
}

test('stdio wrapper accepts NDJSON initialization, notifications, and subsequent requests', async (t) => {
  const proxy = await createProxy(t, (body, response) => {
    if (body.method === 'initialize') {
      response.setHeader('Mcp-Session-Id', 'ndjson-session');
      reply(response, body.id, {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'test-server', version: '1.0.0' }
      });
    } else if (body.method === 'notifications/initialized') {
      response.writeHead(202);
      response.end();
    } else {
      reply(response, body.id, { tools: [] });
    }
  });

  proxy.send({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2025-11-25', capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  });
  assert.equal((await proxy.readNext()).result.protocolVersion, '2025-11-25');
  proxy.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  proxy.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(await proxy.readNext(), { jsonrpc: '2.0', id: 2, result: { tools: [] } });
  assert.equal(proxy.requests.length, 3);
  assert.equal(proxy.requests[0].headers.accept, 'application/json, text/event-stream');
  assert.equal(proxy.requests[1].headers['mcp-session-id'], 'ndjson-session');
  assert.equal(proxy.requests[2].headers['mcp-session-id'], 'ndjson-session');
});

test('stdio wrapper preserves UTF-8 across split and coalesced NDJSON input', async (t) => {
  const proxy = await createProxy(t, (body, response) => reply(response, body.id, body.params.arguments));
  const message = (id, text) => ({
    jsonrpc: '2.0', id, method: 'tools/call',
    params: { name: 'echo', arguments: { text } }
  });
  const first = Buffer.from(JSON.stringify(message(1, '创建中文节点 🎮')) + '\r\n', 'utf8');
  const second = Buffer.from(JSON.stringify(message(2, '你好')) + '\n', 'utf8');
  const split = first.indexOf(Buffer.from('创', 'utf8')) + 1;
  proxy.child.stdin.write(first.subarray(0, split));
  await delay(20);
  proxy.child.stdin.write(Buffer.concat([first.subarray(split), second]));

  assert.deepEqual((await proxy.readNext()).result, { text: '创建中文节点 🎮' });
  assert.deepEqual((await proxy.readNext()).result, { text: '你好' });
  assert.equal(proxy.requests[0].body.params.arguments.text, '创建中文节点 🎮');
  assert.equal(proxy.requests[1].body.params.arguments.text, '你好');
});

test('stdio wrapper emits a single NDJSON line for formatted HTTP JSON responses', async (t) => {
  const proxy = await createProxy(t, (body, response) => reply(response, body.id, { text: '你好\nworld' }, true));
  proxy.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(await proxy.readNext(), {
    jsonrpc: '2.0', id: 1, result: { text: '你好\nworld' }
  });
});

test('stdio wrapper reports malformed NDJSON and continues reading', async (t) => {
  const proxy = await createProxy(t, (body, response) => reply(response, body.id, {}));
  proxy.child.stdin.write('{invalid json}\n');
  assert.deepEqual(await proxy.readNext(), {
    jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' }
  });
  assert.equal(proxy.requests.length, 0);
  proxy.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal((await proxy.readNext()).id, 1);
});

test('stdio wrapper reports HTTP failures using NDJSON framing', async (t) => {
  const proxy = await createProxy(t, (body, response) => {
    response.writeHead(503);
    response.end('unavailable');
  });
  proxy.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const result = await proxy.readNext();
  assert.equal(result.id, 1);
  assert.equal(result.error.code, -32000);
  assert.match(result.error.message, /HTTP 503/);
});

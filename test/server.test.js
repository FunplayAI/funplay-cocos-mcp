'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
  MCP_PROTOCOL_VERSION,
  McpServer,
  SUPPORTED_PROTOCOL_VERSIONS,
} = require('../lib/server');

function createServer(toolRegistry = {}, config = {}, options = {}) {
  return new McpServer({
    config: { host: '127.0.0.1', port: 8765, ...config },
    toolRegistry: {
      listTools: () => [],
      callTool: async () => 'ok',
      ...toolRegistry,
    },
    resourceProvider: {
      listResources: () => [],
      listResourceTemplates: () => [],
      readResource: async () => ({ contents: [] }),
    },
    promptProvider: {
      listPrompts: () => [],
      getPrompt: () => ({ messages: [] }),
    },
    interactionLog: { add() {} },
    runtimeLog: { add() {} },
    serverName: options.serverName || 'test-server',
    serverVersion: options.serverVersion || '0.0.0-test',
    projectName: options.projectName || 'test-project',
    projectIdentity: options.projectIdentity || 'test-project-id',
  });
}

function httpJson(port, payload, headers = {}) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    request.on('error', reject);
    request.end(body);
  });
}

function httpGet(port, path = '/', headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'GET',
        path,
        headers,
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    request.on('error', reject);
    request.end();
  });
}

test('initialize negotiates the current MCP protocol version by default', async () => {
  const server = createServer();
  const response = await server.handleRpcRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {},
  });

  assert.equal(response.result.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.equal(response.result.serverInfo.name, 'test-server');
  assert.equal(response.result.funplay.projectIdentity, 'test-project-id');
});

test('initialize can negotiate an older supported MCP protocol version', async () => {
  const server = createServer();
  const olderVersion = SUPPORTED_PROTOCOL_VERSIONS[SUPPORTED_PROTOCOL_VERSIONS.length - 1];
  const response = await server.handleRpcRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: olderVersion },
  });

  assert.equal(response.result.protocolVersion, olderVersion);
});

test('tool execution failures are returned as MCP tool errors', async () => {
  const server = createServer({
    callTool: async () => {
      throw new Error('bad arguments');
    },
  });

  const response = await server.handleRpcRequest({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'example', arguments: {} },
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result.isError, true);
  assert.deepEqual(response.result.content, [{ type: 'text', text: 'bad arguments' }]);
});

test('tool object results include structuredContent', async () => {
  const value = { ok: true, count: 2 };
  const server = createServer({
    callToolDetailed: async () => ({
      value,
      text: JSON.stringify(value, null, 2),
    }),
  });

  const response = await server.handleRpcRequest({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'example', arguments: {} },
  });

  assert.deepEqual(response.result.structuredContent, value);
  assert.equal(response.result.content[0].type, 'text');
});

test('screenshot responses include native pixels plus small calibration text and structured data', async () => {
  const value = { ok: true, data: { captureId: 'capture_test', geometry: { image: { width: 100, height: 50 } } } };
  const server = createServer({ callToolDetailed: async () => ({
    value, text: 'data:image/png;base64,AAAA', metadataText: JSON.stringify(value),
  }) });
  const response = await server.handleRpcRequest({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'capture_editor_screenshot' } });
  assert.deepEqual(response.result.content[0], { type: 'image', data: 'AAAA', mimeType: 'image/png' });
  assert.deepEqual(JSON.parse(response.result.content[1].text), value);
  assert.deepEqual(response.result.structuredContent, value);
  assert.equal(JSON.stringify(response.result.structuredContent).includes('AAAA'), false);
});

test('structuredContent sanitizes circular values', async () => {
  const value = { ok: true };
  value.self = value;
  const server = createServer({
    callToolDetailed: async () => ({
      value,
      text: '{ "ok": true, "self": "[Circular]" }',
    }),
  });

  const response = await server.handleRpcRequest({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'example', arguments: {} },
  });

  assert.deepEqual(response.result.structuredContent, { ok: true, self: '[Circular]' });
});

test('unsupported protocol version headers are rejected when present after initialize', () => {
  const server = createServer();
  const response = server.validateProtocolVersionHeader(
    { headers: { 'mcp-protocol-version': '1999-01-01' } },
    { jsonrpc: '2.0', id: 3, method: 'tools/list' }
  );

  assert.equal(response.error.code, -32600);
  assert.match(response.error.message, /Unsupported MCP protocol version/);
});

test('streamable HTTP Accept headers must allow json and event-stream', () => {
  const server = createServer();

  assert.equal(server.validateAcceptHeader({ headers: { accept: 'application/json, text/event-stream' } }), null);
  assert.equal(server.validateAcceptHeader({ headers: { accept: '*/*' } }), null);

  const response = server.validateAcceptHeader({ headers: { accept: 'application/json' } });
  assert.equal(response.error.code, -32600);
  assert.match(response.error.message, /Accept header/);
});

test('JSON-RPC responses and notifications are classified for 202 handling', () => {
  const server = createServer();

  assert.equal(server.classifyJsonRpcMessage({ jsonrpc: '2.0', id: 1, result: {} }), 'response');
  assert.equal(server.classifyJsonRpcMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }), 'notification');
  assert.equal(server.classifyJsonRpcMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), 'request');
});

test('session validation requires a known session when enabled', () => {
  const server = createServer({}, { enableSessions: true });
  server.sessions.add('abc123');

  assert.equal(
    server.validateSession(
      { headers: { 'mcp-session-id': 'abc123' } },
      { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    ),
    null
  );

  const missing = server.validateSession(
    { headers: {} },
    { jsonrpc: '2.0', id: 1, method: 'tools/list' }
  );
  assert.equal(missing.statusCode, 400);

  const unknown = server.validateSession(
    { headers: { 'mcp-session-id': 'nope' } },
    { jsonrpc: '2.0', id: 1, method: 'tools/list' }
  );
  assert.equal(unknown.statusCode, 404);
});

test('HTTP notifications return 202 Accepted with no body', async () => {
  const server = createServer({}, { port: 0 });
  await server.start();
  try {
    const response = await httpJson(server.getPort(), {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    assert.equal(response.statusCode, 202);
    assert.equal(response.body, '');
  } finally {
    await server.stop();
  }
});

test('HTTP GET /tools returns debug tool metadata and curl examples', async () => {
  const server = createServer({
    listTools: () => [
      {
        name: 'get_project_info',
        description: 'Return project info.',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
    listToolCatalog: () => [
      {
        name: 'get_project_info',
        description: 'Return project info.',
        category: 'project',
        profile: 'core',
        enabled: true,
      },
    ],
  }, { port: 0 });
  await server.start();
  try {
    const response = await httpGet(server.getPort(), '/tools?catalog=1');
    const payload = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.name, 'test-server');
    assert.equal(payload.version, '0.0.0-test');
    assert.equal(payload.count, 1);
    assert.equal(payload.tools[0].category, 'project');
    assert.match(payload.examples.health, /curl http:\/\/127\.0\.0\.1:\d+\/health/);
    assert.match(payload.examples.tools, /curl http:\/\/127\.0\.0\.1:\d+\/tools/);
  } finally {
    await server.stop();
  }
});

test('HTTP GET /health returns project identity metadata', async () => {
  const server = createServer({}, { port: 0 }, { projectIdentity: 'health-project-id' });
  await server.start();
  try {
    const response = await httpGet(server.getPort(), '/health');
    const payload = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.projectName, 'test-project');
    assert.equal(payload.projectIdentity, 'health-project-id');
  } finally {
    await server.stop();
  }
});

test('start attaches to an existing same-project listener on the configured port', async () => {
  const owner = createServer({}, { port: 0 }, { projectIdentity: 'same-project' });
  await owner.start();
  const attached = createServer({}, { port: owner.getPort() }, { projectIdentity: 'same-project' });

  try {
    await attached.start();

    assert.equal(attached.isRunning(), true);
    assert.equal(attached.getPort(), owner.getPort());
    assert.equal(attached.getAttachInfo().projectIdentity, 'same-project');

    await attached.stop();
    assert.equal(attached.isRunning(), false);

    const response = await httpGet(owner.getPort(), '/health');
    assert.equal(response.statusCode, 200);
  } finally {
    if (attached.isRunning()) {
      await attached.stop();
    }
    await owner.stop();
  }
});

test('start falls back instead of attaching to a different project listener', async () => {
  const owner = createServer({}, { port: 0 }, { projectIdentity: 'owner-project' });
  await owner.start();
  const contender = createServer({}, { port: owner.getPort() }, { projectIdentity: 'other-project' });

  try {
    await contender.start();

    assert.equal(contender.isRunning(), true);
    assert.notEqual(contender.getPort(), owner.getPort());
    assert.equal(contender.getAttachInfo(), null);
    assert.equal(contender.getPortFallbackInfo().requestedPort, owner.getPort());
  } finally {
    if (contender.isRunning()) {
      await contender.stop();
    }
    await owner.stop();
  }
});

test('HTTP initialize can return an optional session id when sessions are enabled', async () => {
  const server = createServer({}, { port: 0, enableSessions: true });
  await server.start();
  try {
    const response = await httpJson(server.getPort(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: MCP_PROTOCOL_VERSION },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers['mcp-session-id'], /^[\x21-\x7e]+$/);
  } finally {
    await server.stop();
  }
});

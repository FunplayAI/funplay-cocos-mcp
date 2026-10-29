'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { McpServer } = require('../lib/server');
const { serverUrl, projectEndpoint, CONTEXT_META_KEY } = require('../lib/project-context');

function fixture(t, identity = 'project-a', instanceId = 'editor-a') {
  const calls = [];
  const server = new McpServer({ config: { host: '127.0.0.1', port: 0, enableConsoleLogging: false },
    projectIdentity: identity, projectPath: '/fixture/' + identity, instanceId,
    serverName: 'fixture', serverVersion: 'test',
    toolRegistry: { listTools: () => [
      { name: 'read', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
      { name: 'write', inputSchema: { type: 'object' }, annotations: { readOnlyHint: false } },
      { name: 'unknown-annotations', inputSchema: { type: 'object' } },
    ], callTool: async (name, args) => { calls.push({ name, args }); return 'ok'; } },
    resourceProvider: {}, promptProvider: {},
  });
  t.after(() => server.stop());
  return { server, calls };
}

async function rpc(server, pathname, message, headers = {}) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, ...message });
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.getPort(), path: pathname, method: 'POST',
      headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}
const call = (name, args = {}, meta) => ({ method: 'tools/call', params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) } });

test('generated URLs are project scoped, preserve IPv6 authorities, and keep context-free compatibility', () => {
  const url = serverUrl({ host: '::1', port: 8765, projectPath: '/one' });
  assert.match(url, /^http:\/\/\[::1\]:8765\/mcp\/project\/[0-9a-f]{24}\/$/);
  assert.notEqual(url, serverUrl({ host: '::1', port: 8765, projectPath: '/two' }));
  assert.equal(serverUrl({ host: 'localhost', port: 8765 }), 'http://localhost:8765/');
});

test('initialize reports structural project/process identity and read-only legacy calls remain compatible', async (t) => {
  const { server } = fixture(t);
  await server.start();
  const initialized = (await rpc(server, '/', { method: 'initialize' })).body.result;
  assert.equal(initialized.funplay.context.project_id, 'project-a');
  assert.equal(initialized.funplay.context.project_path, '/fixture/project-a');
  assert.equal(initialized.funplay.context.instance_id, 'editor-a');
  assert.equal(initialized.funplay.context.expected_context, 'project-a:editor-a');
  assert.equal(initialized.funplay.routingVersion, 1);
  assert.match(initialized.instructions, /not authentication/);
  const response = await rpc(server, '/mcp/', call('read'));
  assert.equal(response.body.result.content[0].text, 'ok');
  assert.deepEqual(response.body.result._meta[CONTEXT_META_KEY], initialized.funplay.context);
  const tools = (await rpc(server, '/', { method: 'tools/list' })).body.result.tools;
  assert.equal(tools[1].inputSchema.properties.expected_context.type, 'string');
});

test('legacy writes require an independently verified pin; stale, wrong and conflicting pins execute nothing', async (t) => {
  const { server, calls } = fixture(t);
  await server.start();
  for (const [message, expected] of [
    [call('write'), 'PROJECT_CONTEXT_REQUIRED'],
    [call('unknown-annotations'), 'PROJECT_CONTEXT_REQUIRED'],
    [call('write', { expected_context: 'project-b:editor-a' }), 'PROJECT_CONTEXT_MISMATCH'],
    [call('write', { expected_context: 'project-a:editor-old' }), 'EDITOR_INSTANCE_CHANGED'],
    [call('write', { expected_context: 'project-a:editor-a' }, { expected_context: 'project-b:editor-a' }), 'PROJECT_CONTEXT_MISMATCH'],
    [call('write', { expected_context: {} }), 'PROJECT_CONTEXT_MISMATCH'],
  ]) {
    const response = await rpc(server, '/', message);
    assert.equal(response.body.error.data.code, expected);
  }
  assert.equal(calls.length, 0);
  await rpc(server, '/', call('write', { expected_context: 'project-a:editor-a', value: 3 }));
  await rpc(server, '/mcp', call('write', { value: 4 }, { expected_context: 'project-a:editor-a' }));
  assert.deepEqual(calls, [{ name: 'write', args: { value: 3 } }, { name: 'write', args: { value: 4 } }]);
});

test('scoped writes work without extra arguments; a wrong project or unknown path never dispatches a tool', async (t) => {
  const { server, calls } = fixture(t);
  await server.start();
  assert.ok((await rpc(server, projectEndpoint('project-a'), call('write'))).body.result);
  for (const pathname of ['/mcp/project/project-b/', '/mcp/project/project-a/extra', '/unrelated', '/mcp/project/project-a%2fother/']) {
    const response = await rpc(server, pathname, call('write'));
    assert.ok(response.status === 409 || response.status === 404);
  }
  assert.equal(calls.length, 1);
  const stale = await rpc(server, projectEndpoint('project-a'), call('write', {}, { expected_context: 'project-a:old' }));
  assert.equal(stale.body.error.data.code, 'EDITOR_INSTANCE_CHANGED');
  assert.equal(calls.length, 1);
});

test('process pins differ across Editors and an attached listener reports the owning Editor identity', async (t) => {
  const { server: owner } = fixture(t, 'same-project', 'owner-instance');
  await owner.start();
  const { server: other } = fixture(t, 'same-project', 'other-instance');
  other.config.port = owner.getPort();
  await other.start();
  assert.equal(other.getProjectContext().instance_id, 'owner-instance');
  assert.equal(other.getProjectContext().expected_context, 'same-project:owner-instance');
  await other.stop();
  assert.equal(owner.isRunning(), true);
});

test('a stale listener cannot act on a changed active project even with its formerly valid scoped URL', async (t) => {
  const { server, calls } = fixture(t);
  await server.start();
  server.getActiveContext = () => ({ ...server.context, project_id: 'new-project', project_path: '/new-project' });
  for (const message of [{ method: 'initialize' }, call('write'), call('read')]) {
    const response = await rpc(server, projectEndpoint('project-a'), message);
    assert.equal(response.body.error.data.code, 'PROJECT_CONTEXT_MISMATCH');
  }
  server.getActiveContext = () => { throw new Error('Editor unavailable'); };
  assert.equal((await rpc(server, '/', call('write'))).body.error.data.code, 'PROJECT_CONTEXT_UNAVAILABLE');
  assert.equal(calls.length, 0);
});

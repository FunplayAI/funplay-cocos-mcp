'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const test = require('node:test');
const config = require('../lib/config');
const clients = require('../lib/client-config');
const { createPanel } = require('../panel/shared');

const UNAVAILABLE_HOST = '203.0.113.254';

function fixture(t, settings = {}, env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-server-recovery-'));
  const file = path.join(root, 'funplay-cocos-mcp.config.json');
  fs.writeFileSync(file, JSON.stringify({ ...config.DEFAULTS, port: config.getProjectPort(root), portMode: 'fixed', enableConsoleLogging: false, ...settings }));
  const entry = require.resolve('../browser');
  const sourceRequire = createRequire(entry);
  const opened = [];
  const editor = { Panel: { open: (id) => opened.push(id) } };
  const clientOptions = { homePath: path.join(root, 'client-home'), env: {} };
  const sandbox = {
    __filename: entry, module: { exports: {} }, global: { Editor: editor }, Editor: editor,
    process, setTimeout, clearTimeout, console,
    require(name) {
      if (name === './lib/config') return {
        ...config,
        loadConfig: () => config.loadConfig({ projectPath: root, env }),
        getProjectPath: () => root,
        getProjectName: () => path.basename(root),
        getProjectPort: () => config.getProjectPort(root),
        getProjectIdentity: () => config.getProjectIdentity(root),
      };
      if (name === './lib/client-config') return {
        ...clients,
        buildTargets: (value) => clients.buildTargets(value, clientOptions),
        getTargetStatuses: (value) => clients.getTargetStatuses(value, clientOptions),
      };
      return sourceRequire(name);
    },
  };
  const Service = vm.runInNewContext(fs.readFileSync(entry, 'utf8') + '\nExtensionService;', sandbox, { filename: entry });
  const service = new Service();
  let updateChecks = 0;
  service.autoCheckUpdates = async () => { updateChecks++; };
  t.after(async () => {
    await service.stopServer();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, file, service, opened, updateChecks: () => updateChecks };
}

function health(port) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}/health`, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
    });
    request.on('error', reject);
  });
}

test('unavailable Host does not reject extension load or disable its panels (#26)', async (t) => {
  const { file, service, opened, updateChecks } = fixture(t, { host: UNAVAILABLE_HOST });
  const original = fs.readFileSync(file, 'utf8');
  const status = await service.load();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(status.running, false);
  assert.equal(status.host, UNAVAILABLE_HOST);
  assert.equal(status.startError.code, 'EADDRNOTAVAIL');
  assert.equal(status.startError.host, UNAVAILABLE_HOST);
  assert.equal(service.getPanelState().status.startError.message, status.startError.message);
  service.openPanel('settings');
  service.openPanel('default');
  assert.deepEqual(opened, ['funplay-cocos-mcp.settings', 'funplay-cocos-mcp']);
  assert.equal(updateChecks(), 1);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.ok(service.runtimeLog.list().some((item) => item.level === 'error' && /EADDRNOTAVAIL/.test(item.message)));
});

test('manual startup still rejects with the original error and can recover without reloading the extension', async (t) => {
  const { file, service } = fixture(t, { host: UNAVAILABLE_HOST, autostart: false });
  await service.load();
  assert.equal(service.getStatus().startError, null);
  await assert.rejects(service.startServer(), { code: 'EADDRNOTAVAIL' });
  assert.equal(service.getStatus().running, false);
  assert.equal(service.getStatus().startError.code, 'EADDRNOTAVAIL');
  const saved = await service.saveConfig({ host: ' 127.0.0.1 ' });
  assert.equal(saved.status.host, '127.0.0.1');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).host, '127.0.0.1');
  const recovered = await service.startServer();
  assert.equal(recovered.running, true);
  assert.equal(recovered.startError, null);
  assert.equal((await health(recovered.port)).ok, true);
});

test('failed Host change stops only MCP; saved settings and recovery UI remain available', async (t) => {
  const { file, service } = fixture(t);
  await service.load();
  assert.equal(service.getStatus().running, true);
  await assert.rejects(service.saveConfig({ host: UNAVAILABLE_HOST }), { code: 'EADDRNOTAVAIL' });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).host, UNAVAILABLE_HOST);
  const failed = service.getPanelState();
  assert.equal(failed.status.running, false);
  assert.equal(failed.status.startError.host, UNAVAILABLE_HOST);
  await service.saveConfig({ host: '127.0.0.1' });
  assert.equal((await service.restartServer()).running, true);
  assert.equal(service.getStatus().startError, null);
});

test('invalid Host edits never overwrite settings or stop a healthy listener', async (t) => {
  const { file, service } = fixture(t);
  await service.load();
  const original = fs.readFileSync(file, 'utf8');
  const server = service.server;
  for (const host of ['', '  ', null, 123, 'http://127.0.0.1', '127.0.0.1:8765', 'localhost/path']) {
    await assert.rejects(service.saveConfig({ host }), /Host/);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    assert.equal(service.server, server);
    assert.equal(service.getStatus().running, true);
  }
});

test('environment Host override remains visible and cannot be silently replaced by a saved edit', async (t) => {
  const { file, service } = fixture(t, { host: '127.0.0.1', autostart: false }, { COCOS_MCP_HOST: UNAVAILABLE_HOST });
  await service.load();
  const original = fs.readFileSync(file, 'utf8');
  assert.equal(service.getPanelState().config.hostSource, 'environment');
  await assert.rejects(service.saveConfig({ host: 'localhost' }), /COCOS_MCP_HOST/);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  await service.saveConfig({ enableConsoleLogging: false, language: 'zh' });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).host, '127.0.0.1');
  assert.equal(service.getStatus().host, UNAVAILABLE_HOST);
});

function panelFixture(t, handler) {
  const previous = global.Editor;
  const calls = [];
  global.Editor = { Panel: { define: (value) => value }, Message: { request: async (pkg, name, ...args) => {
    calls.push({ name, args });
    return handler(name, ...args);
  } } };
  t.after(() => { global.Editor = previous; });
  const definition = createPanel('dashboard');
  const panel = { ...definition.methods, language: 'zh', state: { config: {}, status: {} },
    $: { hostInput: { value: '127.0.0.1', setAttribute() {}, removeAttribute() {} },
      applyHostBtn: { setAttribute() {}, removeAttribute() {} }, hostHint: {}, serverError: {} },
    async refresh() { this.state = await global.Editor.Message.request('', 'get-panel-state'); },
    showNotice(message, level) { this.notice = { message, level }; },
  };
  return { panel, definition, calls };
}

test('dashboard exposes Host repair and a persistent, localized startup error', (t) => {
  const { panel, definition } = panelFixture(t, () => ({}));
  assert.match(definition.template, /id="hostInput"/);
  assert.match(definition.template, /id="applyHostBtn"/);
  panel.state = { config: { host: UNAVAILABLE_HOST }, status: { startError: { host: UNAVAILABLE_HOST, port: 8765, code: 'EADDRNOTAVAIL', message: 'listen EADDRNOTAVAIL' } } };
  panel.renderServerConnection();
  assert.equal(panel.$.hostInput.value, UNAVAILABLE_HOST);
  assert.equal(panel.$.serverError.hidden, false);
  assert.match(panel.$.serverError.textContent, /EADDRNOTAVAIL/);
  assert.match(panel.$.serverError.textContent, /127\.0\.0\.1/);
  assert.match(panel.$.hostHint.textContent, /未认证/);
  panel.state.config.hostSource = 'environment';
  panel.renderServerConnection();
  assert.equal(panel.$.hostInput.disabled, true);
  assert.equal(panel.$.applyHostBtn.disabled, true);
  assert.match(panel.$.hostHint.textContent, /COCOS_MCP_HOST/);
  panel.state.status.startError = null;
  panel.renderServerConnection();
  assert.equal(panel.$.serverError.hidden, true);
});

for (const autostart of [true, false]) {
  test(`Apply Host saves only Host and respects autostart=${autostart}`, async (t) => {
    const saved = { config: { host: '127.0.0.1', autostart }, status: { running: false } };
    const { panel, calls } = panelFixture(t, () => saved);
    await panel.applyHost();
    assert.deepEqual(calls.map((entry) => entry.name), autostart
      ? ['save-config', 'start-server', 'get-panel-state'] : ['save-config', 'get-panel-state']);
    assert.deepEqual(calls[0].args, [{ host: '127.0.0.1' }]);
    assert.equal(panel.savingHost, false);
  });
}

test('Host apply failures refresh the saved startup error without reporting success', async (t) => {
  const state = { config: { host: UNAVAILABLE_HOST, autostart: true }, status: { running: false, startError: { code: 'EADDRNOTAVAIL', message: 'listen EADDRNOTAVAIL', host: UNAVAILABLE_HOST, port: 8765 } } };
  const { panel } = panelFixture(t, (name) => {
    if (name === 'start-server') throw new Error('listen EADDRNOTAVAIL');
    return state;
  });
  await panel.applyHost();
  assert.equal(panel.state.status.startError.code, 'EADDRNOTAVAIL');
  assert.equal(panel.notice.level, 'error');
  assert.equal(panel.$.serverError.hidden, false);
  assert.equal(panel.$.applyHostBtn.disabled, false);
});

test('Apply Host cannot start a second save while its first request is pending', async (t) => {
  let finish;
  const saved = { config: { host: '127.0.0.1', autostart: true }, status: { running: true } };
  const pending = new Promise((resolve) => { finish = resolve; });
  const { panel, calls } = panelFixture(t, (name) => name === 'save-config' ? pending : saved);
  const first = panel.applyHost();
  await panel.applyHost();
  assert.equal(calls.length, 1);
  assert.equal(panel.$.applyHostBtn.disabled, true);
  finish(saved);
  await first;
  assert.deepEqual(calls.map((entry) => entry.name), ['save-config', 'get-panel-state']);
  assert.equal(panel.$.applyHostBtn.disabled, false);
});

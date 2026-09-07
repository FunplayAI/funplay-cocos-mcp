'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const test = require('node:test');
const config = require('../lib/config');
const { McpServer } = require('../lib/server');
const { RuntimeLog } = require('../lib/runtime-log');
const { createPanel } = require('../panel/shared');

function project(t, settings = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-console-logging-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'funplay-cocos-mcp.config.json');
  fs.writeFileSync(file, JSON.stringify({ ...config.DEFAULTS, portMode: 'fixed', autostart: false, ...settings }));
  return { root, file };
}

// Exercise the real service class without exposing test-only exports or starting
// Cocos, and keep its console separate from Node's test runner.
function serviceFixture(root) {
  const file = require.resolve('../browser');
  const sourceRequire = createRequire(file);
  const printed = [];
  const sandbox = {
    __filename: file, module: { exports: {} }, global: {}, process, setTimeout, clearTimeout,
    console: Object.fromEntries(['log', 'warn', 'error'].map((level) => [level, (message) => printed.push({ level, message })])),
    require(name) {
      if (name === './lib/config') return {
        ...config,
        loadConfig: () => config.loadConfig({ projectPath: root, env: {} }),
        getProjectPath: () => root,
        getProjectName: () => path.basename(root),
        getProjectPort: () => config.getProjectPort(root),
        getProjectIdentity: () => config.getProjectIdentity(root),
      };
      return sourceRequire(name);
    },
  };
  const Service = vm.runInNewContext(fs.readFileSync(file, 'utf8') + '\nExtensionService;', sandbox, { filename: file });
  const service = new Service();
  service.autoCheckUpdates = async () => ({});
  return { service, printed, console: sandbox.console };
}

test('console logging defaults on, accepts only booleans, and is a live preference', (t) => {
  const { root, file } = project(t);
  for (const [stored, expected] of [[undefined, true], [false, false], [true, true], ['false', true], [null, true]]) {
    fs.writeFileSync(file, JSON.stringify({ enableConsoleLogging: stored }));
    assert.equal(config.loadConfig({ projectPath: root, env: {} }).enableConsoleLogging, expected);
  }
  assert.equal(config.hasRuntimeConfigChanges(config.DEFAULTS, { ...config.DEFAULTS, enableConsoleLogging: false }), false);
});

test('extension logging can be muted without suppressing diagnostics or project console messages', (t) => {
  const { root } = project(t);
  const { service, printed, console: targetConsole } = serviceFixture(root);
  service.config = { enableConsoleLogging: true };
  service.log('info', 'visible');
  service.config.enableConsoleLogging = false;
  for (const level of ['info', 'warn', 'error']) service.log(level, `muted ${level}`, { retained: true });
  assert.equal(printed.length, 1);
  assert.match(printed[0].message, /^\[Funplay Cocos MCP\] visible$/);
  assert.equal(service.runtimeLog.list().length, 4);
  assert.equal(service.runtimeLog.list()[0].details.retained, true);
  targetConsole.log('Project script log');
  assert.equal(printed[1].message, 'Project script log');
  service.config.enableConsoleLogging = true;
  service.log('error', 'visible again');
  assert.equal(printed[2].level, 'error');
});

test('a persisted mute applies from the first startup log and survives reopening', async (t) => {
  const { root } = project(t, { enableConsoleLogging: false });
  for (let i = 0; i < 2; i++) {
    const { service, printed } = serviceFixture(root);
    service.load();
    await Promise.resolve();
    assert.equal(service.config.enableConsoleLogging, false);
    assert.equal(printed.length, 0);
    assert.ok(service.runtimeLog.list().some((entry) => entry.message === 'Extension loading...'));
  }
});

test('saving the toggle updates both loggers without replacing the server, sessions or histories', async (t) => {
  const { root } = project(t);
  const { service } = serviceFixture(root);
  service.reloadRuntime();
  const serverConfig = service.config;
  const server = { config: serverConfig, sessions: new Set(['active-client']), isRunning: () => true };
  service.server = server;
  service.getPanelState = () => ({ config: service.config });
  service.reloadRuntime = service.startServer = service.stopServer = () => assert.fail('Logging changes must not restart or rebuild MCP');
  const tools = service.toolRegistry;
  const runtimeLog = service.runtimeLog;
  const activity = service.interactionLog;
  activity.add('get_editor_state', 'success', 'Keep this activity');
  const runtimeCount = runtimeLog.list().length;
  for (const enabled of [false, true]) {
    await service.saveConfig({ enableConsoleLogging: enabled });
    assert.equal(service.config.enableConsoleLogging, enabled);
    assert.equal(serverConfig.enableConsoleLogging, enabled);
    assert.equal(config.loadConfig({ projectPath: root, env: {} }).enableConsoleLogging, enabled);
    assert.equal(service.server, server);
    assert.deepEqual([...server.sessions], ['active-client']);
    assert.equal(service.toolRegistry, tools);
    assert.equal(service.interactionLog, activity);
    assert.equal(activity.list()[0].summary, 'Keep this activity');
    assert.equal(service.runtimeLog, runtimeLog);
    assert.equal(runtimeLog.list().length, runtimeCount);
  }
  await service.saveConfig({ language: 'zh' });
  assert.equal(service.config.enableConsoleLogging, true);
});

test('HTTP server printing switches live for info, warnings and errors while keeping runtime records', (t) => {
  const printed = [];
  for (const method of ['log', 'warn', 'error']) t.mock.method(console, method, (message) => printed.push({ method, message }));
  const runtimeLog = new RuntimeLog();
  const server = new McpServer({ config: { enableConsoleLogging: true }, runtimeLog });
  for (const level of ['info', 'warn', 'error']) server.log(level, `visible ${level}`);
  assert.equal(printed.length, 3);
  server.config.enableConsoleLogging = false;
  for (const level of ['info', 'warn', 'error']) server.log(level, `muted ${level}`);
  assert.equal(printed.length, 3);
  assert.equal(runtimeLog.list().length, 6);
  server.config.enableConsoleLogging = true;
  server.log('info', 'visible again');
  assert.equal(printed.length, 4);
  assert.match(printed[3].message, /^\[Funplay Cocos MCP Server\]/);
});

test('only Settings has the logging toggle; other pages preserve its saved value', (t) => {
  const previousEditor = global.Editor;
  global.Editor = { Panel: { define: (definition) => definition } };
  t.after(() => { global.Editor = previousEditor; });
  const definition = createPanel('settings');
  assert.match(definition.template, /id="consoleLoggingInput"/);
  for (const mode of ['dashboard', 'project-skills', 'tool-exposure']) assert.doesNotMatch(createPanel(mode).template, /id="consoleLoggingInput"/);
  const control = { value: false };
  const panel = { ...definition.methods, $: { consoleLoggingInput: control }, state: { config: { enableConsoleLogging: true } } };
  assert.equal(panel.collectConfig().enableConsoleLogging, false);
  let change;
  panel.on = (element, event, handler) => { if (element === control && event === 'change') change = handler; };
  let saved;
  panel.persistConfig = (options) => { saved = options; };
  panel.bindEvents();
  change();
  assert.deepEqual(saved, { showNotice: true });
  panel.$ = {};
  panel.state.config.enableConsoleLogging = false;
  assert.equal(panel.collectConfig().enableConsoleLogging, false);
  delete panel.state.config.enableConsoleLogging;
  assert.equal(panel.collectConfig().enableConsoleLogging, true);
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const test = require('node:test');
const { captureScriptExecution, SCRIPT_EXECUTION_PACKET, LOG_LIMITS } = require('../lib/script-execution');
const { createToolRegistry } = require('../lib/tool-registry');
const { InteractionLog } = require('../lib/interaction-log');

function consoleFixture() {
  const printed = [];
  const targetConsole = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map((method) => [method,
    (...values) => { printed.push({ method, values }); },
  ]));
  return { printed, targetConsole };
}

test('scoped console records ordered levels and formatted messages without replacing the real console', async () => {
  const { targetConsole, printed } = consoleFixture();
  const originalLog = console.log;
  const value = { done: true };
  const packet = await captureScriptExecution(async (scoped) => {
    scoped.log('Updated %d nodes', 2);
    scoped.info('Info');
    scoped.warn('Warning');
    scoped.error(new Error('Diagnostic error'));
    scoped.debug('Debug');
    targetConsole.log('Unrelated project log');
    return value;
  }, { context: 'editor', targetConsole });
  assert.equal(console.log, originalLog);
  assert.equal(packet.kind, SCRIPT_EXECUTION_PACKET);
  assert.equal(packet.value, value);
  assert.equal(packet.execution.context, 'editor');
  assert.ok(packet.execution.durationMs >= 0);
  assert.deepEqual(packet.execution.logs.map((entry) => entry.level), ['info', 'info', 'warn', 'error', 'debug']);
  assert.equal(packet.execution.logs[0].message, 'Updated 2 nodes');
  assert.equal(packet.execution.logs[3].message, 'Diagnostic error');
  assert.equal(printed.length, 6);
});

test('failures retain preceding logs, including non-Error throws', async () => {
  const { targetConsole } = consoleFixture();
  for (const error of [new Error('Failed'), 'Failed']) {
    const packet = await captureScriptExecution(async (scoped) => {
      scoped.warn('Before failure');
      throw error;
    }, { context: 'scene', targetConsole });
    assert.equal(packet.error.message, 'Failed');
    assert.equal(packet.execution.logs[0].message, 'Before failure');
    assert.equal(packet.value, undefined);
  }
});

test('concurrent, nested and post-completion messages never bleed into another invocation', async () => {
  const { targetConsole, printed } = consoleFixture();
  let release;
  let lateConsole;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = captureScriptExecution(async (scoped) => {
    scoped.log('A start');
    lateConsole = scoped;
    await gate;
    scoped.log('A end');
  }, { context: 'editor', targetConsole });
  const second = await captureScriptExecution(async (scoped) => {
    scoped.log('B');
    const inner = await captureScriptExecution(async (innerConsole) => innerConsole.log('Nested'), { context: 'scene', targetConsole });
    assert.equal(inner.execution.logs[0].message, 'Nested');
  }, { context: 'editor', targetConsole });
  release();
  const outer = await first;
  lateConsole.log('After completion');
  assert.deepEqual(outer.execution.logs.map((entry) => entry.message), ['A start', 'A end']);
  assert.deepEqual(second.execution.logs.map((entry) => entry.message), ['B']);
  assert.equal(printed.at(-1).values[0], 'After completion');
});

test('log capture is bounded, redacted and does not execute custom inspection or getters', async () => {
  const { targetConsole } = consoleFixture();
  let inspected = 0;
  const packet = await captureScriptExecution(async (scoped) => {
    scoped.log('token=private-token', { api_key: 'private-api-key', get value() { inspected++; return 'bad'; },
      [Symbol.for('nodejs.util.inspect.custom')]() { inspected++; return 'bad'; },
    });
    for (let i = 0; i < LOG_LIMITS.entries + 5; i++) scoped.log(`Line ${i}`);
  }, { context: 'editor', targetConsole });
  assert.equal(inspected, 0);
  assert.doesNotMatch(JSON.stringify(packet.execution), /private-/);
  assert.equal(packet.execution.logs.length, LOG_LIMITS.entries);
  assert.equal(packet.execution.logsOmitted, 6);
  const huge = await captureScriptExecution(async (scoped) => {
    for (let i = 0; i < 100; i++) scoped.log('x'.repeat(10000));
  }, { context: 'editor', targetConsole });
  assert.ok(huge.execution.logs.reduce((sum, entry) => sum + entry.message.length, 0) <= LOG_LIMITS.characters + 1);
  assert.ok(huge.execution.logsOmitted > 0);
});

// Load the actual Cocos entrypoints with a small editor/scene host. Script execution
// and registry result handling are real; there is no test-only production export.
function hosts(t) {
  const { targetConsole, printed } = consoleFixture();
  const root = path.resolve(__dirname, '..');
  const editorFile = path.join(root, 'browser.js');
  const editorRequire = createRequire(editorFile);
  const editor = { App: { path: root } };
  const sandbox = { __filename: editorFile, __dirname: root, module: { exports: {} },
    require: editorRequire, global: { Editor: editor }, Editor: editor, console: targetConsole,
    process, setTimeout, clearTimeout,
  };
  const Service = vm.runInNewContext(fs.readFileSync(editorFile, 'utf8') + '\nExtensionService;', sandbox, { filename: editorFile });
  const service = new Service();
  const sceneFile = path.join(root, 'scene.js');
  const sceneModule = { exports: {}, paths: [] };
  const cc = { Node: class {}, Vec3: class {}, Quat: class {}, Color: class {}, director: { getScene: () => ({ name: 'Smoke Scene' }) } };
  vm.runInNewContext(fs.readFileSync(sceneFile, 'utf8'), {
    module: sceneModule, exports: sceneModule.exports, Editor: editor, global: { Editor: editor },
    require: (name) => name === 'cc' ? cc : editorRequire(name), console: targetConsole,
  }, { filename: sceneFile });
  const config = { toolProfile: 'full', executeJavascriptSafetyChecks: false, enableConsoleLogging: false };
  const runtime = () => ({ config, projectPath: root });
  const history = new InteractionLog();
  const registry = createToolRegistry({ getRuntimeContext: runtime, interactionLog: history,
    sceneBridge: { call: async (method, payload) => JSON.parse(JSON.stringify(await sceneModule.exports.methods[method](payload))) },
    editorExecutor: (payload) => service.executeEditorScript(payload, runtime),
  });
  service.config = config;
  service.toolRegistry = registry;
  return { service, registry, history, printed, runtime, scene: sceneModule.exports.methods };
}

test('both native execution paths and compatibility aliases expose logs separately without changing return data', async (t) => {
  const { registry, history, printed } = hosts(t);
  for (const [tool, context] of [['execute_javascript', 'editor'], ['execute_javascript', 'scene'],
    ['execute_editor_script', 'editor'], ['execute_scene_script', 'scene']]) {
    const result = await registry.callToolDetailed(tool, { context, code: `
      console.log('Updated %d nodes', 2);
      console.warn('A recoverable warning');
      return { message: 'Completed', nodes: [{ name: 'A' }, { name: 'B' }], count: 2 };
    ` });
    const expected = { message: 'Completed', nodes: [{ name: 'A' }, { name: 'B' }], count: 2 };
    assert.deepEqual(JSON.parse(JSON.stringify(result.value.data)), context === 'scene'
      ? { ok: true, result: expected, sceneName: 'Smoke Scene' } : expected);
    assert.equal(result.value.execution.context, context);
    assert.equal(result.value.execution.logs[0].message, 'Updated 2 nodes');
    assert.equal(JSON.parse(result.text).execution.logs[1].level, 'warn');
    assert.equal(history.list()[0].execution.logs.length, 2);
    assert.equal(history.list()[0].status, 'success');
  }
  assert.equal(printed.length, 8); // Project-script printing is not disabled by the MCP preference.
});

test('errors cross scene IPC with logs, produce an error envelope and never show a successful return', async (t) => {
  const { registry, history } = hosts(t);
  for (const context of ['editor', 'scene']) {
    await assert.rejects(registry.callToolDetailed('execute_javascript', { context,
      code: 'console.info("Before the error"); throw new Error("Expected failure");',
    }), (error) => {
      assert.equal(error.toolEnvelope.ok, false);
      assert.equal(error.toolEnvelope.execution.logs[0].message, 'Before the error');
      assert.equal(error.message, 'Expected failure');
      return true;
    });
    assert.equal(history.list()[0].status, 'error');
    assert.equal(history.list()[0].preview, undefined);
    assert.equal(history.list()[0].execution.logs[0].message, 'Before the error');
  }
});

test('run/module exports receive the per-call console and legacy direct entrypoints stay compatible', async (t) => {
  const { registry, service, runtime, scene } = hosts(t);
  for (const context of ['editor', 'scene']) {
    for (const definition of ['async function run(env)', 'module.exports = async function(env)', 'module.exports.run = async function(env)']) {
      const result = await registry.callToolDetailed('execute_javascript', { context,
        code: `${definition} { env.console.log('Inside run'); return false; }`,
      });
      assert.equal(result.value.execution.logs[0].message, 'Inside run');
      assert.equal(context === 'scene' ? result.value.data.result : result.value.data, false);
    }
  }
  assert.equal(await service.executeEditorScript({ code: 'return 7;' }, runtime), 7);
  assert.deepEqual(JSON.parse(JSON.stringify(await scene.executeCode({ code: 'return 7;' }))), { ok: true, result: 7, sceneName: 'Smoke Scene' });
});

test('syntax errors still have an execution record, while image payload compatibility is preserved', async (t) => {
  const { registry } = hosts(t);
  await assert.rejects(registry.callToolDetailed('execute_javascript', { context: 'editor', code: 'return {;' }), (error) => {
    assert.equal(error.toolEnvelope.execution.logs.length, 0);
    return true;
  });
  const result = await registry.callToolDetailed('execute_javascript', { context: 'editor', code: 'console.log("Captured"); return "data:image/png;base64,AAAA";' });
  assert.equal(result.text, 'data:image/png;base64,AAAA');
  assert.equal(result.value.data.image, true);
  assert.equal(result.value.execution.logs[0].message, 'Captured');
});

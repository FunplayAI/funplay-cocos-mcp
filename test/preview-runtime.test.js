'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { runInNewContext } = require('node:vm');
const electronTools = require('../lib/electron-tools');
const { buildPreviewToolbarScript, controlPreviewToolbar } = require('../lib/preview-runtime');

function fixture(options = {}) {
  const engine = { running: false, paused: false, ...options.engine };
  const calls = [];
  const profile = { mode: options.mode || 'browser' };
  const vm = {
    currPlatform: profile.mode,
    gameView: { isPlay: engine.running, isPaused: engine.paused, isStep: false, ...options.toolbar },
    isPlaying: false,
    isLoading: false,
    async play() {
      if (this.isPlaying) return;
      calls.push(['play']);
      this.isPlaying = true;
      try {
        if (options.play) return await options.play(engine, this);
        engine.running = !this.gameView.isPlay;
        engine.paused = false;
        this.gameView.isPlay = engine.running;
        this.gameView.isPaused = false;
      } finally { this.isPlaying = false; }
    },
    async gameViewPause() {
      calls.push(['gameViewPause']);
      if (options.pause) return await options.pause(engine, this);
      engine.paused = !this.gameView.isPaused;
      this.gameView.isPaused = engine.paused;
    },
    async changePlatform(mode) {
      calls.push(['changePlatform', mode]);
      if (this.currPlatform === 'gameView' && this.gameView.isPlay && mode !== 'gameView') await this.play();
      this.currPlatform = mode;
    },
  };
  const panel = {
    getAttribute: () => options.src || '/Applications/Cocos/app.asar/builtin/preview/static/toolbar/middle.js',
    shadowRoot: { querySelector: (selector) => selector === '.preview-info-wrap' ? { __vue__: vm } : null },
  };
  const document = {
    querySelector: (selector) => selector === '#toolbar' && !options.missing
      ? { querySelectorAll: () => options.panels || [panel] } : null,
  };
  const Editor = {
    Message: { request: async (...args) => {
      assert.deepEqual(args, ['scene', 'editor-preview-call-method', 'isPause']);
      return engine.running ? engine.paused : options.stoppedValue;
    } },
    Profile: { setConfig: async (...args) => {
      calls.push(['setConfig', ...args]);
      profile.mode = args[2];
    } },
  };
  const run = (command) => runInNewContext(buildPreviewToolbarScript(command), { document, Editor, Symbol });
  return { run, engine, vm, calls, profile };
}

test('Game View starts through native toolbar, selects/persists its mode, and remains running on repeated start', async () => {
  const f = fixture({ stoppedValue: null });
  const first = await f.run({ action: 'start' });
  const second = await f.run({ action: 'start' });
  assert.equal(first.running, true);
  assert.equal(first.paused, false);
  assert.equal(first.toolbarSynchronized, true);
  assert.equal(first.busy, false);
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(f.profile.mode, 'gameView');
  assert.equal(f.calls.filter(([name]) => name === 'play').length, 1);
});

test('pause/resume use preview state and native pause handler, including manual pause and repeated calls', async () => {
  const f = fixture({ mode: 'gameView', engine: { running: true } });
  assert.equal((await f.run({ action: 'pause' })).paused, true);
  assert.equal((await f.run({ action: 'pause' })).changed, false);
  assert.equal((await f.run({ action: 'start' })).paused, true);
  assert.equal((await f.run({ action: 'resume' })).paused, false);
  assert.equal((await f.run({ action: 'resume' })).changed, false);
  // Simulate the user clicking the native pause control.
  await f.vm.gameViewPause();
  assert.equal((await f.run({ action: 'state' })).paused, true);
  assert.equal((await f.run({ action: 'resume' })).paused, false);
  assert.equal(f.calls.filter(([name]) => name === 'gameViewPause').length, 4);
  assert.equal(f.calls.some(([name]) => name === 'play'), false);
});

test('read-only state reports legacy toolbar mismatch without mutating it; next start repairs it without toggling preview', async () => {
  const f = fixture({ engine: { running: true, paused: true }, toolbar: { isPlay: false, isPaused: false } });
  const before = await f.run({ action: 'state' });
  assert.equal(before.scope, 'gameView');
  assert.equal(before.running, true);
  assert.equal(before.paused, true);
  assert.equal(before.toolbarSynchronized, false);
  assert.equal(f.vm.currPlatform, 'browser');
  assert.equal(f.vm.gameView.isPlay, false);
  assert.equal(f.calls.length, 0);
  const after = await f.run({ action: 'start' });
  assert.equal(after.toolbarSynchronized, true);
  assert.equal(after.paused, true);
  assert.equal(f.calls.some(([name]) => name === 'play'), false);
});

test('mode changes stop paused Game View using native play before persisting the new mode', async () => {
  const f = fixture({ mode: 'gameView', engine: { running: true, paused: true } });
  const result = await f.run({ action: 'set-mode', mode: 'simulator' });
  assert.equal(result.running, false);
  assert.equal(result.paused, false);
  assert.equal(result.toolbarSynchronized, true);
  assert.equal(f.profile.mode, 'simulator');
  assert.deepEqual(f.calls.map(([name]) => name), ['play', 'changePlatform', 'setConfig']);
});

test('mode changes repair and stop a preview started outside the toolbar', async () => {
  const f = fixture({ engine: { running: true }, toolbar: { isPlay: false } });
  const result = await f.run({ action: 'set-mode', mode: 'browser' });
  assert.equal(result.running, false);
  assert.equal(result.mode, 'browser');
  assert.equal(result.toolbarSynchronized, true);
});

test('stopped previews reject pause/resume without switching modes or touching any director', async () => {
  for (const mode of ['browser', 'gameView', 'simulator']) {
    const f = fixture({ mode });
    for (const action of ['pause', 'resume']) await assert.rejects(f.run({ action }), /Game View preview is not running/);
    assert.equal(f.calls.length, 0);
    assert.equal((await f.run({ action: 'state' })).running, false);
  }
});

test('rejected starts, pauses, resumes and stops do not report success', async () => {
  const refusedStart = fixture({ play: async () => {} });
  await assert.rejects(refusedStart.run({ action: 'start' }), /rejected the Game View start/);
  const refusedPause = fixture({ mode: 'gameView', engine: { running: true }, pause: async () => {} });
  await assert.rejects(refusedPause.run({ action: 'pause' }), /did not pause/);
  refusedPause.engine.paused = true;
  await assert.rejects(refusedPause.run({ action: 'resume' }), /did not resume/);
  const refusedStop = fixture({ mode: 'gameView', engine: { running: true }, play: async () => {} });
  await assert.rejects(refusedStop.run({ action: 'set-mode', mode: 'browser' }), /rejected the Game View stop/);
  assert.equal(refusedStop.profile.mode, 'gameView');
  assert.equal(refusedStop.vm.currPlatform, 'gameView');
});

test('native failures release the operation lock for a later retry', async () => {
  let reject = true;
  const f = fixture({ play: async (engine, vm) => {
    if (reject) throw new Error('compile failed');
    engine.running = true;
    vm.gameView.isPlay = true;
  } });
  await assert.rejects(f.run({ action: 'start' }), /compile failed/);
  reject = false;
  assert.equal((await f.run({ action: 'start' })).running, true);
});

test('busy toolbar and concurrent MCP commands cannot double-toggle preview', async () => {
  let complete;
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const f = fixture({ play: async (engine, vm) => {
    entered();
    await new Promise(resolve => { complete = resolve; });
    engine.running = true;
    vm.gameView.isPlay = true;
  } });
  f.vm.isLoading = true;
  await assert.rejects(f.run({ action: 'start' }), /toolbar is busy/);
  f.vm.isLoading = false;
  const first = f.run({ action: 'start' });
  await ready;
  await assert.rejects(f.run({ action: 'start' }), /toolbar is busy/);
  await assert.rejects(f.run({ action: 'set-mode', mode: 'browser' }), /toolbar is busy/);
  assert.equal((await f.run({ action: 'state' })).busy, true);
  complete();
  assert.equal((await first).running, true);
  assert.equal(f.calls.filter(([name]) => name === 'play').length, 1);
});

test('missing/incompatible toolbar fails closed and never uses an unrelated panel or debug global', async () => {
  for (const options of [{ missing: true }, { src: '/other/preview/middle.js' }, { panels: [] }, { toolbar: { isPlay: undefined } }]) {
    await assert.rejects(fixture(options).run({ action: 'start' }), /preview toolbar is unavailable/);
  }
  const f = fixture();
  f.vm.gameViewPause = null;
  await assert.rejects(f.run({ action: 'pause' }), /preview toolbar is unavailable/);
});

test('Windows toolbar source paths are accepted; malformed commands and unknown preview state are rejected', async () => {
  const f = fixture({ src: 'C:\\Cocos\\app.asar\\builtin\\preview\\static\\toolbar\\middle.js' });
  assert.equal((await f.run({ action: 'start' })).running, true);
  await assert.rejects(f.run({ action: 'set-mode', mode: 'unknown' }), /Unsupported preview toolbar command/);
  await assert.rejects(f.run({ action: 'eval' }), /Unsupported preview toolbar command/);
  await assert.rejects(fixture({ stoppedValue: { unsupported: true } }).run({ action: 'state' }), /unsupported Game View preview state/);
});

test('native window selection requires a unique main editor and ignores focused preview/DevTools', async (t) => {
  const other = { webContents: { getURL: () => 'file:///preview.html' } };
  const main = { webContents: { getURL: () => 'file:///C:/Cocos/static/windows/main.html#test' } };
  let windows = [other, main];
  t.mock.method(electronTools, 'getAllWindows', () => windows);
  t.mock.method(electronTools, 'executeJavaScript', async (window, script) => {
    assert.equal(window, main);
    assert.match(script, /"action":"state"/);
    return { running: false };
  });
  assert.deepEqual(await controlPreviewToolbar({ action: 'state' }), { running: false });
  for (const invalid of [[], [other], [main, main]]) {
    windows = invalid;
    await assert.rejects(controlPreviewToolbar({ action: 'state' }), /unique Cocos Creator main editor window/);
  }
});

test('legacy scene pause/resume entrypoints forward to preview tools and never pause the edit-scene director', async () => {
  const file = require.resolve('../scene');
  const sourceRequire = createRequire(file);
  const scene = { exports: {}, paths: [] };
  const requests = [];
  const cc = { director: {
    pause: () => assert.fail('Must not pause edit-scene director'),
    resume: () => assert.fail('Must not resume edit-scene director'),
  } };
  let reject = false;
  runInNewContext(fs.readFileSync(file, 'utf8'), {
    module: scene, exports: scene.exports,
    require: (name) => name === 'cc' ? cc : sourceRequire(name),
    Editor: { App: { path: '/cocos' }, Message: { request: async (channel, message, name) => {
      requests.push([channel, message, name]);
      return JSON.stringify(reject ? { ok: false, summary: 'Preview unavailable' }
        : { ok: true, data: { scope: 'gameView', running: true, paused: name === 'pause_runtime' } });
    } } },
  }, { filename: file });
  assert.equal((await scene.exports.methods.pauseRuntime()).paused, true);
  assert.equal((await scene.exports.methods.resumeRuntime()).paused, false);
  assert.deepEqual(requests, [
    ['funplay-cocos-mcp', 'call-tool', 'pause_runtime'],
    ['funplay-cocos-mcp', 'call-tool', 'resume_runtime'],
  ]);
  reject = true;
  await assert.rejects(scene.exports.methods.pauseRuntime(), /Preview unavailable/);
});

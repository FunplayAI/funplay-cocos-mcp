'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');
const electronTools = require('../lib/electron-tools');
const { capturePanelScreenshot, captureEditorWindowScreenshot } = require('../lib/screenshots');
const { CAPTURE_TTL_MS, MAX_CAPTURES, readVisualState, registerCapture, resolveImagePoints, pngDimensions } = require('../lib/visual-coordinates');
const { sendMouseClick, sendMouseDrag } = require('../lib/input');
const { createToolRegistry } = require('../lib/tool-registry');
const { McpServer } = require('../lib/server');

function png(width = 1200, height = 900) {
  const data = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data);
  data.writeUInt32BE(13, 8);
  data.write('IHDR', 12);
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-visual-coordinates-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const submitted = [];
  const view = { width: 1280, height: 720, devicePixelRatio: 2, documentEpoch: 10, complete: true,
    url: 'file:///editor/main.html', canvases: [{ id: 1, width: 800, height: 600 }], frames: [] };
  const bounds = { x: 100, y: 50, width: 400, height: 300 };
  const context = { uuid: 'scene-a' };
  let zoom = 1.5;
  let visible = true;
  let destroyed = false;
  let focusCount = 0;
  const screenBounds = { x: -1400, y: 33, width: 1920, height: 1080 };
  const window = {
    id: 71, getTitle: () => 'Cocos Creator', focus: () => { focusCount += 1; },
    getContentBounds: () => ({ ...screenBounds }),
    isVisible: () => visible, isMinimized: () => false, isDestroyed: () => destroyed,
    webContents: { id: 72, getZoomFactor: () => zoom, sendInputEvent: (event) => submitted.push({ ...event }) },
    capturePage: async (rect) => { assert.deepEqual(rect, { x: 150, y: 75, width: 600, height: 450 }); return { toPNG: () => png() }; },
  };
  t.mock.method(electronTools, 'executeJavaScript', async (target) => { assert.equal(target, window); return JSON.parse(JSON.stringify(view)); });
  t.mock.method(electronTools, 'getPanelBounds', async (target) => { assert.equal(target, window); return { ...bounds }; });
  t.mock.method(electronTools, 'pickWindow', () => window);
  const getContext = async () => ({ ...context });
  const capture = async () => {
    const state = await readVisualState(window, 'game', getContext);
    return registerCapture(window, png(), state, state, { panel: 'game', projectPath: root, getContext });
  };
  const options = (geometry, extra = {}) => ({ coordinateSpace: 'image-pixels', captureId: geometry.captureId, projectPath: root, ...extra });
  return {
    root, window, submitted, view, bounds, screenBounds, context, capture, options, getContext,
    focusCount: () => focusCount,
    setZoom: (value) => { zoom = value; }, setVisible: (value) => { visible = value; }, setDestroyed: (value) => { destroyed = value; },
  };
}

test('PNG dimensions come from actual encoded pixels, not an assumed DPR', () => {
  assert.deepEqual(pngDimensions(png(2300, 811)), { width: 2300, height: 811 });
  assert.throws(() => pngDimensions(Buffer.from('not a screenshot')), /PNG/);
  assert.throws(() => pngDimensions(png(0, 20)), /empty/);
});

test('cropped screenshot pixels map through exact crop origin, zoom and PNG size', async (t) => {
  const f = fixture(t);
  const geometry = await f.capture();
  assert.deepEqual(geometry.inputBounds, { x: 150, y: 75, width: 600, height: 450 });
  assert.equal(geometry.viewport.devicePixelRatio, 2);
  assert.equal(geometry.viewport.zoomFactor, 1.5);
  assert.equal(geometry.runtimeContentVerified, false);
  const resolved = await resolveImagePoints(f.options(geometry), [{ x: 600, y: 450 }, { x: 0, y: 0 }]);
  assert.deepEqual(resolved.points, [{ x: 450, y: 300 }, { x: 150, y: 75 }]);
});

test('screenshot capture keeps geometry and uses DIP cropping instead of unscaled CSS bounds', async (t) => {
  const f = fixture(t);
  const result = await capturePanelScreenshot(f.root, { panel: 'game', getContext: f.getContext });
  assert.equal(result.captureId, result.geometry.captureId);
  assert.deepEqual(result.geometry.image, { width: 1200, height: 900 });
  assert.ok(result.dataUri.startsWith('data:image/png;base64,'));
  assert.deepEqual(result.bounds, f.bounds);
  assert.ok(fs.existsSync(result.filePath));
});

test('whole-window capture has zero crop origin and preserves encoded dimensions', async (t) => {
  const f = fixture(t);
  f.window.capturePage = async (rect) => { assert.equal(rect, undefined); return { toPNG: () => png(3840, 2160) }; };
  const result = await captureEditorWindowScreenshot(f.root, { getContext: f.getContext });
  assert.deepEqual(result.geometry.inputBounds, { x: 0, y: 0, width: 1920, height: 1080 });
  assert.deepEqual((await resolveImagePoints(f.options(result.geometry), [{ x: 1920, y: 1080 }])).points, [{ x: 960, y: 540 }]);
});

for (const [name, change] of [
  ['window resize', (f) => { f.view.width += 1; }],
  ['DPR change', (f) => { f.view.devicePixelRatio = 1; }],
  ['zoom change', (f) => f.setZoom(1)],
  ['renderer reload', (f) => { f.view.documentEpoch += 1; }],
  ['canvas replacement', (f) => { f.view.canvases[0].id += 1; }],
  ['panel movement', (f) => { f.bounds.x += 1; }],
  ['editor scene switch', (f) => { f.context.uuid = 'scene-b'; }],
  ['hidden window', (f) => f.setVisible(false)],
  ['destroyed window', (f) => f.setDestroyed(true)],
]) {
  test(`calibrated input rejects ${name} without sending an event`, async (t) => {
    const f = fixture(t);
    const geometry = await f.capture();
    change(f);
    await assert.rejects(sendMouseClick(f.options(geometry, { x: 200, y: 300 })), (error) => {
      assert.equal(error.inputOutcome.inputSent, false);
      return true;
    });
    assert.equal(f.submitted.length, 0);
  });
}

test('wrong targets, projects and out-of-image coordinates never select a fallback window', async (t) => {
  const f = fixture(t);
  const geometry = await f.capture();
  for (const extra of [
    { captureId: 'unknown' }, { windowId: 99 }, { panel: 'scene' }, { windowKind: 'simulator' },
    { titleContains: 'another-project' }, { projectPath: `${f.root}-other` },
    { x: -1 }, { y: 900 }, { x: 1200 }, { x: NaN }, { y: Infinity },
  ]) {
    await assert.rejects(sendMouseClick(f.options(geometry, { x: 100, y: 100, ...extra })), (error) => {
      assert.equal(error.inputOutcome.inputSent, false);
      return true;
    });
  }
  assert.equal(f.submitted.length, 0);
  assert.equal(f.focusCount(), 0);
});

test('capture IDs expire rather than reusing a resized or unrelated screenshot', async (t) => {
  const f = fixture(t);
  const geometry = await f.capture();
  const later = Date.now() + CAPTURE_TTL_MS + 1;
  t.mock.method(Date, 'now', () => later);
  await assert.rejects(sendMouseClick(f.options(geometry, { x: 100, y: 100 })), /stale|expired/);
  assert.equal(f.submitted.length, 0);
});

test('capture receipts are bounded and evicted IDs cannot dispatch input', async (t) => {
  const f = fixture(t);
  const first = await f.capture();
  for (let index = 0; index < MAX_CAPTURES; index += 1) await f.capture();
  await assert.rejects(resolveImagePoints(f.options(first), [{ x: 1, y: 1 }]), /Unknown or expired/);
});

test('geometry drift during capture produces a non-interactive screenshot receipt', async (t) => {
  const f = fixture(t);
  const before = await readVisualState(f.window, 'game', f.getContext);
  f.bounds.width += 20;
  const after = await readVisualState(f.window, 'game', f.getContext);
  const geometry = registerCapture(f.window, png(), before, after, { panel: 'game', projectPath: f.root, getContext: f.getContext });
  assert.equal(geometry.interactive, false);
  await assert.rejects(sendMouseClick(f.options(geometry, { x: 10, y: 10 })), /changed during/);
  assert.equal(f.submitted.length, 0);
});

test('a calibrated click submits real events at the mapped point without claiming business success', async (t) => {
  const f = fixture(t);
  const geometry = await f.capture();
  const result = await sendMouseClick(f.options(geometry, { x: 600, y: 450 }));
  assert.deepEqual(f.submitted.map((event) => [event.type, event.x, event.y]), [
    ['mouseMove', 450, 300], ['mouseDown', 450, 300], ['mouseUp', 450, 300],
  ]);
  assert.equal(result.captureId, geometry.captureId);
  assert.equal(result.businessOutcomeVerified, false);
  assert.equal(result.eventsSubmitted, 3);
  assert.deepEqual(f.submitted.map((event) => [event.globalX, event.globalY]), [[-950, 333], [-950, 333], [-950, 333]]);
});

for (const button of ['left', 'middle', 'right']) {
  test(`native ${button} clicks preserve keyboard modifiers and use correct button flags`, async (t) => {
    const f = fixture(t);
    const geometry = await f.capture();
    await sendMouseClick(f.options(geometry, { x: 600, y: 450, button, modifiers: ['shift', 'alt', 'RIGHTBUTTONDOWN'] }));
    assert.deepEqual(f.submitted.map((event) => event.modifiers), [
      ['shift', 'alt'], ['shift', 'alt', `${button}buttondown`], ['shift', 'alt', `${button}buttondown`],
    ]);
  });
}

test('calibrated drag uses held-button flags and the current screen origin for every move', async (t) => {
  const f = fixture(t);
  const geometry = await f.capture();
  t.mock.method(electronTools, 'sleep', async () => { f.screenBounds.x += 10; });
  await sendMouseDrag(f.options(geometry, { startX: 0, startY: 0, endX: 600, endY: 450, button: 'middle', steps: 2, stepDelayMs: 1, modifiers: ['control'] }));
  assert.deepEqual(f.submitted.map((event) => event.modifiers), [
    ['control'], ['control', 'middlebuttondown'], ['control', 'middlebuttondown'],
    ['control', 'middlebuttondown'], ['control', 'middlebuttondown'],
  ]);
  assert.deepEqual(f.submitted.map((event) => [event.globalX, event.globalY]), [
    [-1250, 108], [-1250, 108], [-1090, 221], [-930, 333], [-930, 333],
  ]);
});

test('legacy clicks and drags also provide native screen coordinates without changing local points', async (t) => {
  const f = fixture(t);
  await sendMouseClick({ x: 40, y: 50, button: 'right' });
  await sendMouseDrag({ startX: 40, startY: 50, endX: 80, endY: 70, steps: 2 });
  assert.deepEqual(f.submitted.map((event) => [event.x, event.y, event.globalX, event.globalY]), [
    [40, 50, -1360, 83], [40, 50, -1360, 83], [40, 50, -1360, 83],
    [40, 50, -1360, 83], [40, 50, -1360, 83], [60, 60, -1340, 93],
    [80, 70, -1320, 103], [80, 70, -1320, 103],
  ]);
  assert.deepEqual(f.submitted.map((event) => event.modifiers), [
    [], ['rightbuttondown'], ['rightbuttondown'], [], ['leftbuttondown'],
    ['leftbuttondown'], ['leftbuttondown'], ['leftbuttondown'],
  ]);
});

test('unavailable native screen bounds reject before any mouse event is submitted', async (t) => {
  const f = fixture(t);
  const geometry = await f.capture();
  f.screenBounds.x = NaN;
  await assert.rejects(sendMouseClick(f.options(geometry, { x: 100, y: 100 })), (error) => {
    assert.equal(error.inputOutcome.code, 'INPUT_NOT_SENT');
    return true;
  });
  assert.equal(f.submitted.length, 0);
});

test('geometry is rechecked after focusing the window', async (t) => {
  const f = fixture(t);
  const geometry = await f.capture();
  f.window.focus = () => { f.bounds.x += 10; };
  await assert.rejects(sendMouseClick(f.options(geometry, { x: 100, y: 100 })), /changed since capture/);
  assert.equal(f.submitted.length, 0);
});

test('calibrated drag validates both endpoints and submits interpolated real events', async (t) => {
  const f = fixture(t);
  const geometry = await f.capture();
  await assert.rejects(sendMouseDrag(f.options(geometry, { startX: 10, startY: 10, endX: 1200, endY: 900 })), /inside/);
  assert.equal(f.submitted.length, 0);
  const result = await sendMouseDrag(f.options(geometry, { startX: 0, startY: 0, endX: 600, endY: 450, steps: 3 }));
  assert.deepEqual(result.from, { x: 150, y: 75 });
  assert.deepEqual(result.to, { x: 450, y: 300 });
  assert.equal(f.submitted.length, 6);
  assert.equal(f.submitted.at(-1).type, 'mouseUp');
});

test('failed dispatch releases a possibly held button and reports unknown delivery, never replaying', async (t) => {
  const f = fixture(t);
  const geometry = await f.capture();
  f.window.webContents.sendInputEvent = (event) => {
    f.submitted.push({ ...event });
    if (event.type === 'mouseDown') throw new Error('IPC lost during dispatch');
  };
  await assert.rejects(sendMouseClick(f.options(geometry, { x: 100, y: 100 })), (error) => {
    assert.equal(error.inputOutcome.code, 'INPUT_OUTCOME_UNKNOWN');
    assert.equal(error.inputOutcome.inputSent, null);
    assert.equal(error.inputOutcome.retrySafe, false);
    assert.equal(error.inputOutcome.releaseSubmitted, true);
    return true;
  });
  assert.deepEqual(f.submitted.map((event) => event.type), ['mouseMove', 'mouseDown', 'mouseUp']);
  assert.deepEqual(f.submitted.at(-1).modifiers, ['leftbuttondown']);
  assert.equal(f.submitted.at(-1).globalX, -1200);
  f.window.webContents.sendInputEvent = (event) => f.submitted.push(event);
  assert.equal((await sendMouseClick(f.options(geometry, { x: 100, y: 100 }))).sent, true);
});

test('a resized viewport during a delayed drag aborts safely and releases the last known point', async (t) => {
  const f = fixture(t);
  const geometry = await f.capture();
  t.mock.method(electronTools, 'sleep', async () => { f.view.width += 1; });
  await assert.rejects(sendMouseDrag(f.options(geometry, { startX: 0, startY: 0, endX: 600, endY: 450, stepDelayMs: 10 })), (error) => {
    assert.equal(error.inputOutcome.code, 'INPUT_OUTCOME_UNKNOWN');
    assert.equal(error.inputOutcome.releaseSubmitted, true);
    return true;
  });
  assert.deepEqual(f.submitted.map((event) => event.type), ['mouseMove', 'mouseDown', 'mouseUp']);
});

test('legacy window coordinates and panel-center offsets remain unchanged', async (t) => {
  const f = fixture(t);
  t.mock.method(electronTools, 'getPanelPoint', async (window, panel, x, y) => {
    assert.equal(window, f.window); assert.equal(panel, 'scene');
    return { x: 400 + x, y: 300 + y };
  });
  assert.deepEqual((await sendMouseClick({ x: 40, y: 50 })).point, { x: 40, y: 50 });
  assert.deepEqual((await sendMouseClick({ panel: 'scene', x: 10, y: -20 })).point, { x: 410, y: 280 });
  await assert.rejects(sendMouseClick({ captureId: 'anything', x: 10, y: 10 }), /requires coordinateSpace/);
});

test('screenshot filenames cannot escape the capture directory', async (t) => {
  const f = fixture(t);
  for (const fileName of ['../escape.png', '/tmp/image.png', 'nested/image.png', 'x.txt', 'x\0.png']) {
    await assert.rejects(capturePanelScreenshot(f.root, { fileName }), /plain PNG/);
  }
});

test('a screenshot filename cannot overwrite a symlink target, even inside the project', async (t) => {
  const f = fixture(t);
  const directory = path.join(f.root, 'temp/mcp-captures');
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(f.root, 'user-image.png');
  fs.writeFileSync(target, 'Keep the original image');
  fs.symlinkSync(target, path.join(directory, 'linked.png'));
  await assert.rejects(capturePanelScreenshot(f.root, { fileName: 'linked.png' }), /symbolic link/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'Keep the original image');
});

test('the screenshot destination is checked again after asynchronous capture', async (t) => {
  const f = fixture(t);
  const target = path.join(f.root, 'keep-image.png');
  fs.writeFileSync(target, 'Preserve this image');
  f.window.capturePage = async () => {
    fs.symlinkSync(target, path.join(f.root, 'temp/mcp-captures/changed.png'));
    return { toPNG: () => png() };
  };
  await assert.rejects(capturePanelScreenshot(f.root, { fileName: 'changed.png' }), /symbolic link/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'Preserve this image');
});

test('explicit missing Electron window IDs, kinds and titles never fall back to the first window', () => {
  const window = { id: 71, isDestroyed: () => false, isVisible: () => true, getTitle: () => 'Cocos Creator - Validation' };
  const module = { exports: {} };
  runInNewContext(fs.readFileSync(require.resolve('../lib/electron-tools'), 'utf8'), {
    module, require: (name) => {
      assert.equal(name, 'electron');
      return { BrowserWindow: { getAllWindows: () => [window], getFocusedWindow: () => window } };
    },
  });
  assert.equal(module.exports.pickWindow({ windowId: 71 }), window);
  assert.throws(() => module.exports.pickWindow({ windowId: 99 }), /unavailable/);
  assert.throws(() => module.exports.pickWindow({ windowId: '71' }), /integer/);
  assert.throws(() => module.exports.pickWindow({ windowKind: 'preview' }), /No BrowserWindow/);
  assert.throws(() => module.exports.pickWindow({ titleContains: 'another-project' }), /No BrowserWindow/);
});

test('calibrated operations in the same window cannot interleave held mouse buttons', async (t) => {
  const f = fixture(t);
  const geometry = await f.capture();
  let release;
  let notify;
  const started = new Promise((resolve) => { notify = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  t.mock.method(electronTools, 'sleep', async () => { notify(); await gate; });
  const drag = sendMouseDrag(f.options(geometry, { startX: 0, startY: 0, endX: 100, endY: 100, steps: 1, stepDelayMs: 10 }));
  await started;
  try {
    await assert.rejects(sendMouseClick(f.options(geometry, { x: 100, y: 100 })), (error) => {
      assert.match(error.message, /already active/);
      assert.equal(error.inputOutcome.inputSent, false);
      return true;
    });
    assert.deepEqual(f.submitted.map((event) => event.type), ['mouseMove', 'mouseDown']);
  } finally { release(); }
  assert.equal((await drag).sent, true);
  assert.equal((await sendMouseClick(f.options(geometry, { x: 100, y: 100 }))).sent, true);
});

test('a failed cleanup remains uncertain and its delivery metadata reaches native MCP text and structured results', async (t) => {
  const f = fixture(t);
  const geometry = await f.capture();
  f.window.webContents.sendInputEvent = (event) => {
    f.submitted.push(event);
    if (event.type !== 'mouseMove') throw new Error('Renderer input channel unavailable');
  };
  const registry = createToolRegistry({
    getRuntimeContext: () => ({ projectPath: f.root, config: { toolProfile: 'full' } }),
    getStatus: () => ({}), sceneBridge: { call: async () => ({}) },
    interactionLog: { add() {} }, runtimeLog: { add() {} },
  });
  const server = new McpServer({ toolRegistry: registry, config: {}, interactionLog: { add() {} }, runtimeLog: { add() {} } });
  const response = await server.handleRpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
    name: 'simulate_mouse_click', arguments: { coordinateSpace: 'image-pixels', captureId: geometry.captureId, x: 100, y: 100 },
  } });
  assert.equal(response.result.isError, true);
  const value = response.result.structuredContent;
  assert.equal(value.data.code, 'INPUT_OUTCOME_UNKNOWN');
  assert.equal(value.data.releaseSubmitted, false);
  assert.equal(value.data.retrySafe, false);
  assert.deepEqual(JSON.parse(response.result.content[0].text), value);
  assert.deepEqual(f.submitted.map((event) => event.type), ['mouseMove', 'mouseDown', 'mouseUp']);
});

test('the renderer geometry probe detects canvas replacement and bounded scans', async (t) => {
  const f = fixture(t);
  const rect = { left: 10, top: 20, width: 300, height: 200 };
  const canvas = { tagName: 'CANVAS', getBoundingClientRect: () => rect, width: 600, height: 400 };
  let nodes = [canvas];
  const renderer = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2, location: { href: 'file:///main.html' }, scrollX: 0, scrollY: 0,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) };
  const vm = { window: renderer, document: { querySelectorAll: () => nodes }, performance: { timeOrigin: 10 } };
  t.mock.method(electronTools, 'executeJavaScript', async (target, script) => runInNewContext(script, vm));
  const first = await readVisualState(f.window, null);
  assert.equal((await readVisualState(f.window, null)).signature, first.signature);
  nodes = [{ ...canvas }];
  assert.notEqual((await readVisualState(f.window, null)).signature, first.signature);
  nodes = Array.from({ length: 15001 }, () => ({ tagName: 'DIV' }));
  await assert.rejects(readVisualState(f.window, null), /Complete visible-window geometry/);
});

test('screenshot registry results retain calibration without duplicating Base64 in structured data or activity', async (t) => {
  const f = fixture(t);
  const activity = [];
  const registry = createToolRegistry({
    getRuntimeContext: () => ({ projectPath: f.root, config: { toolProfile: 'full' } }),
    getStatus: () => ({}), sceneBridge: { call: async (method, options) => {
      assert.equal(method, 'getSceneInfo');
      assert.deepEqual(options, { maxDepth: 1, includeComponents: false });
      return { uuid: 'scene-a', sceneName: 'Test' };
    } },
    interactionLog: { add: (...args) => activity.push(args) }, runtimeLog: { add() {} },
  });
  const result = await registry.callToolDetailed('capture_game_screenshot', { windowId: 71 });
  assert.ok(result.text.startsWith('data:image/png;base64,'));
  assert.equal(result.value.data.image, true);
  assert.equal(result.value.data.captureId, result.value.data.geometry.captureId);
  assert.deepEqual(result.value.data.geometry.editorScene, { uuid: 'scene-a', name: 'Test' });
  assert.ok(result.metadataText.includes(result.value.data.captureId));
  assert.equal(JSON.stringify(result.value).includes('base64'), false);
  assert.equal(JSON.stringify(activity).includes('base64'), false);
  const click = await registry.callToolDetailed('simulate_preview_input', {
    coordinateSpace: 'image-pixels', captureId: result.value.data.captureId, x: 600, y: 450,
  });
  assert.deepEqual(click.value.data.point, { x: 450, y: 300 });
});

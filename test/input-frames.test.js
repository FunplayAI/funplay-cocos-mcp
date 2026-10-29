'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { performance } = require('node:perf_hooks');
const { runInNewContext } = require('node:vm');
const electronTools = require('../lib/electron-tools');
const { readVisualState, registerCapture } = require('../lib/visual-coordinates');
const { sendMouseDrag, sendMouseClick, cancelFrameDrags } = require('../lib/input');
const { nextRendererFrame } = require('../lib/input-frames');
const { getProjectIdentity } = require('../lib/config');
const { projectContext, CONTEXT_META_KEY } = require('../lib/project-context');
const { createToolRegistry } = require('../lib/tool-registry');
const { McpServer } = require('../lib/server');

async function fixture(t, realClock = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-frame-input-'));
  const context = projectContext({ projectIdentity: getProjectIdentity(root), projectPath: root, instanceId: 'editor' });
  const owner = context.expected_context;
  let now = 0;
  let frame = 0;
  let focus = true;
  let paused = false;
  let frameGate;
  let native = false;
  let failDown = false;
  let failUp = false;
  let constantFrame = false;
  let onInput = () => {};
  const events = [];
  const view = { width: 640, height: 480, devicePixelRatio: 1, documentEpoch: 10, complete: true,
    url: 'file:///fixture.html', canvases: [{ id: 1, width: 640, height: 480 }], frames: [] };
  const window = { id: 801, isDestroyed: () => false, isVisible: () => true, isMinimized: () => false,
    focus() {}, getTitle: () => 'Cocos Preview', getContentBounds: () => ({ x: 0, y: 0, width: 640, height: 480 }),
    webContents: { id: 802, getZoomFactor: () => 1,
      getURL: () => native ? 'file:///editor/windows/main.html' : 'http://127.0.0.1/preview/',
      sendInputEvent(event) {
        events.push({ ...event, frame });
        onInput(event);
        if (failDown && event.type === 'mouseDown') throw new Error('dispatch uncertain');
        if (failUp && event.type === 'mouseUp') throw new Error('release uncertain');
      } },
  };
  if (!realClock) t.mock.method(performance, 'now', () => now);
  t.mock.method(electronTools, 'getAllWindows', () => [window]);
  t.mock.method(electronTools, 'pickWindow', () => window);
  t.mock.method(electronTools, 'getPanelBounds', async () => ({ x: 0, y: 0, width: 640, height: 480 }));
  t.mock.method(electronTools, 'executeJavaScript', async (target, script) => {
    assert.equal(target, window);
    if (script.includes('nextRendererFrame')) {
      if (frameGate) await frameGate;
      await new Promise((resolve) => realClock ? setTimeout(resolve, 5) : setImmediate(resolve));
      now += 17;
      if (!constantFrame) frame++;
      return { timestamp: frame * 17, epoch: view.documentEpoch, focused: focus };
    }
    if (script.includes('previewToolbarCommand')) return { running: true, paused, toolbarSynchronized: true };
    return JSON.parse(JSON.stringify(view));
  });
  const png = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(13, 8); png.write('IHDR', 12); png.writeUInt32BE(640, 16); png.writeUInt32BE(480, 20);
  const state = await readVisualState(window, 'game');
  const capture = registerCapture(window, png, state, state, { projectPath: root, panel: 'game', inputOwner: owner });
  const options = { projectPath: root, inputOwner: owner, projectContext: context, originatingTool: 'simulate_mouse_drag',
    timing: 'frame-paced', coordinateSpace: 'image-pixels', captureId: capture.captureId, panel: 'game',
    requestKey: 'gesture-1', startX: 10, startY: 20, endX: 310, endY: 120,
    durationMs: 100, pressHoldMs: 0, endHoldMs: 0, waitMs: 1000 };
  t.after(async () => {
    failUp = false;
    frameGate = null;
    await cancelFrameDrags(owner);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { owner, options, events, view, window,
    setFocus: (value) => { focus = value; }, setPaused: (value) => { paused = value; }, setNative: (value) => { native = value; },
    gate: (value) => { frameGate = value; }, failDown: (value) => { failDown = value; }, failUp: (value) => { failUp = value; },
    constantFrame: () => { constantFrame = true; },
    onInput: (handler) => { onInput = handler; },
    status: (extra = {}) => sendMouseDrag({ ...options, action: 'status', ...extra }),
  };
}

test('frame-paced drag separates down, movement, target hold and release without claiming game acceptance', async (t) => {
  const f = await fixture(t);
  const result = await sendMouseDrag(f.options);
  assert.equal(result.status, 'completed');
  assert.equal(result.cleanup, 'complete');
  assert.equal(result.nativeGameUpdateVerified, false);
  assert.equal(result.businessOutcomeVerified, false);
  assert.ok(result.observedRendererFrames >= 7);
  const down = f.events.find((event) => event.type === 'mouseDown');
  const moves = f.events.filter((event) => event.type === 'mouseMove');
  const up = f.events.find((event) => event.type === 'mouseUp');
  assert.ok(moves.slice(1).every((event) => event.frame > down.frame));
  assert.ok(moves.some((event) => event.x > 10 && event.x < 310));
  assert.ok(up.frame > moves.at(-1).frame);
  assert.deepEqual([up.x, up.y], [310, 120]);
  assert.ok(result.samples.some((sample) => sample.phase === 'pressed'));
  assert.ok(result.samples.some((sample) => sample.phase === 'released'));
});

test('duration uses actual elapsed monotonic time, not a synchronous interpolation count', async (t) => {
  const f = await fixture(t, true);
  const began = performance.now();
  const result = await sendMouseDrag({ ...f.options, durationMs: 50 });
  assert.equal(result.status, 'completed');
  assert.ok(performance.now() - began >= 50);
});

test('native focus handoff after Up keeps the completed receipt and never submits more input', async (t) => {
  const f = await fixture(t);
  let focusAttempts = 0;
  f.window.webContents.focus = () => { focusAttempts++; };
  f.onInput((event) => { if (event.type === 'mouseUp') f.setFocus(false); });
  const result = await sendMouseDrag(f.options);
  assert.equal(result.status, 'completed');
  assert.equal(result.cleanup, 'complete');
  assert.ok(result.samples.some((sample) => sample.phase === 'released' && sample.focused === false));
  assert.equal(f.events.at(-1).type, 'mouseUp');
  assert.equal(f.events.filter((event) => event.type === 'mouseUp').length, 1);
  assert.equal(focusAttempts, 1);
});

test('focus loss while held still interrupts the drag and releases its button', async (t) => {
  const f = await fixture(t);
  f.onInput((event) => { if (event.type === 'mouseDown') f.setFocus(false); });
  await assert.rejects(sendMouseDrag(f.options), (error) => {
    assert.equal(error.inputOutcome.cleanup, 'complete');
    assert.equal(error.inputOutcome.releaseSubmitted, true);
    return error.code === 'INPUT_FRAME_UNAVAILABLE';
  });
  assert.deepEqual(f.events.map((event) => event.type), ['mouseMove', 'mouseDown', 'mouseUp']);
});

test('focused native Game View accepts child focus without requiring the host document focus', async (t) => {
  const f = await fixture(t);
  f.setNative(true);
  f.setFocus(false);
  f.window.isFocused = () => true;
  const result = await sendMouseDrag(f.options);
  assert.equal(result.status, 'completed');
  assert.ok(result.samples.every((sample) => sample.windowFocused && !sample.focused));
  assert.equal(result.nativeGameUpdateVerified, false);
});

test('a native child focus exception never accepts a background OS window', async (t) => {
  const f = await fixture(t);
  f.setNative(true);
  f.window.isFocused = () => false;
  await assert.rejects(sendMouseDrag(f.options), /INPUT_FRAME_UNAVAILABLE/);
  assert.equal(f.events.length, 0);
});

test('retained identical starts recover the original receipt without replaying; changed arguments conflict', async (t) => {
  const f = await fixture(t);
  const result = await sendMouseDrag(f.options);
  const count = f.events.length;
  assert.equal((await sendMouseDrag({ ...f.options, waitMs: 0 })).jobId, result.jobId);
  assert.equal(f.events.length, count);
  await assert.rejects(sendMouseDrag({ ...f.options, endX: 311 }), /INPUT_REQUEST_KEY_CONFLICT/);
  const recovered = await sendMouseDrag({ projectPath: f.options.projectPath, inputOwner: f.owner,
    originatingTool: f.options.originatingTool, action: 'status', requestKey: f.options.requestKey });
  assert.equal(recovered.jobId, result.jobId);
  assert.equal(f.events.length, count);
});

test('cancel is idempotent, does not need coordinates, and late frame callbacks never replay the gesture', async (t) => {
  const f = await fixture(t);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  f.gate(gate);
  const started = await sendMouseDrag({ ...f.options, waitMs: 0 });
  assert.equal(started.status, 'running');
  const cancelOptions = { projectPath: f.options.projectPath, inputOwner: f.owner, originatingTool: f.options.originatingTool,
    action: 'cancel', jobId: started.jobId };
  const cancelled = await sendMouseDrag(cancelOptions);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cleanup, 'complete');
  const count = f.events.length;
  release();
  await new Promise((resolve) => setImmediate(resolve));
  await sendMouseDrag(cancelOptions);
  assert.equal(f.events.length, count);
});

test('jobs cannot be read or cancelled from another project, Editor session or originating tool', async (t) => {
  const f = await fixture(t);
  const result = await sendMouseDrag(f.options);
  for (const change of [{ inputOwner: 'another-editor' }, { projectPath: '/other' }, { originatingTool: 'simulate_preview_input' }]) {
    await assert.rejects(f.status({ jobId: result.jobId, ...change }), /INPUT_OWNER_MISMATCH/);
  }
});

test('invalid timing, missing keys, uncalibrated and non-finite points fail before dispatch', async (t) => {
  const f = await fixture(t);
  for (const change of [{ durationMs: 0 }, { durationMs: NaN }, { durationMs: 10001 }, { pressHoldMs: -1 },
    { requestKey: '' }, { requestKey: 'a b' }, { steps: 3 }, { stepDelayMs: 1 }, { coordinateSpace: 'legacy' },
    { endX: Infinity }, { button: 'invalid' }, { modifiers: [123] }, { waitMs: -1 }]) {
    await assert.rejects(sendMouseDrag({ ...f.options, ...change }));
  }
  assert.equal(f.events.length, 0);
});

test('focus or initial geometry failures produce no input and no silent legacy fallback', async (t) => {
  const f = await fixture(t);
  f.setFocus(false);
  await assert.rejects(sendMouseDrag(f.options), /INPUT_FRAME_UNAVAILABLE/);
  assert.equal(f.events.length, 0);
  f.setFocus(true);
  f.view.width++;
  await assert.rejects(sendMouseDrag({ ...f.options, requestKey: 'geometry' }), /changed since capture/);
  assert.equal(f.events.length, 0);
});

test('a stalled renderer after pressing attempts release and retains an uncertain result', async (t) => {
  const f = await fixture(t);
  f.constantFrame();
  await assert.rejects(sendMouseDrag(f.options), (error) => {
    assert.equal(error.inputOutcome.inputSent, null);
    assert.equal(error.inputOutcome.releaseSubmitted, true);
    assert.equal(error.inputOutcome.cleanup, 'complete');
    return true;
  });
  assert.equal(f.events.filter((event) => event.type === 'mouseDown').length, 1);
  assert.equal(f.events.filter((event) => event.type === 'mouseUp').length, 1);
});

test('a failed release keeps the window locked until explicit cleanup succeeds', async (t) => {
  const f = await fixture(t);
  f.failDown(true); f.failUp(true);
  let receipt;
  await assert.rejects(sendMouseDrag(f.options), (error) => { receipt = error.inputOutcome; return error.code === 'INPUT_CLEANUP_FAILED'; });
  await assert.rejects(sendMouseClick({ x: 10, y: 10 }), /already active/);
  await assert.rejects(sendMouseDrag({ ...f.options, action: 'cancel', jobId: receipt.jobId }), { code: 'INPUT_CLEANUP_FAILED' });
  f.failDown(false); f.failUp(false);
  const cleaned = await sendMouseDrag({ ...f.options, action: 'cancel', jobId: receipt.jobId });
  assert.equal(cleaned.cleanup, 'complete');
  assert.equal(cleaned.status, 'failed');
  await sendMouseClick({ x: 10, y: 10 });
});

test('native Game View pause is checked independently from its still-advancing UI renderer', async (t) => {
  const f = await fixture(t);
  f.setNative(true); f.setPaused(true);
  await assert.rejects(sendMouseDrag(f.options), /INPUT_PREVIEW_INTERRUPTED/);
  assert.equal(f.events.length, 0);
});

test('a pause or geometry change after Down releases the owned button instead of replaying', async (t) => {
  const f = await fixture(t);
  f.setNative(true);
  f.onInput((event) => { if (event.type === 'mouseDown') f.setPaused(true); });
  await assert.rejects(sendMouseDrag(f.options), (error) => {
    assert.equal(error.inputOutcome.releaseSubmitted, true);
    assert.equal(error.inputOutcome.cleanup, 'complete');
    return error.code === 'INPUT_PREVIEW_INTERRUPTED';
  });
  f.setPaused(false);
  f.onInput((event) => { if (event.type === 'mouseDown') f.view.width++; });
  await assert.rejects(sendMouseDrag({ ...f.options, requestKey: 'changed-geometry' }), (error) => {
    assert.equal(error.inputOutcome.releaseSubmitted, true);
    return true;
  });
  assert.equal(f.events.filter((event) => event.type === 'mouseDown').length, 2);
  assert.equal(f.events.filter((event) => event.type === 'mouseUp').length, 2);
});

test('extension shutdown cancels its own held drag; concurrent retained starts share one job', async (t) => {
  const f = await fixture(t);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  f.onInput((event) => { if (event.type === 'mouseDown') f.gate(gate); });
  const first = await sendMouseDrag({ ...f.options, waitMs: 0 });
  const second = await sendMouseDrag({ ...f.options, waitMs: 0 });
  assert.equal(first.jobId, second.jobId);
  for (let n = 0; n < 100 && !f.events.some((event) => event.type === 'mouseDown'); n++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(f.events.some((event) => event.type === 'mouseDown'));
  await cancelFrameDrags('another-owner');
  assert.equal((await f.status()).status, 'running');
  await cancelFrameDrags(f.owner);
  const receipt = await f.status();
  assert.equal(receipt.status, 'cancelled');
  assert.equal(receipt.releaseSubmitted, true);
  release();
  assert.equal(f.events.filter((event) => event.type === 'mouseDown').length, 1);
  assert.equal(f.events.filter((event) => event.type === 'mouseUp').length, 1);
});

test('a capture from an earlier Editor lifetime cannot be used to start a new gesture', async (t) => {
  const f = await fixture(t);
  await assert.rejects(sendMouseDrag({ ...f.options, inputOwner: 'new-editor', requestKey: 'stale-capture' }), /different Editor session/);
  assert.equal(f.events.length, 0);
});

test('bounded frame evidence retains phase milestones during a long movement', async (t) => {
  const f = await fixture(t);
  const result = await sendMouseDrag({ ...f.options, durationMs: 2500 });
  assert.ok(result.observedRendererFrames > 64);
  assert.equal(result.samples.length, 64);
  assert.ok(result.samplesOmitted > 0);
  for (const phase of ['preflight', 'pressed', 'moving', 'target-hold', 'released']) {
    assert.ok(result.samples.some((sample) => sample.phase === phase), phase);
  }
});

test('serialized renderer frame reader only observes an actual animation callback and cleans its timer', async () => {
  let callback;
  let cleared = false;
  const pending = runInNewContext(`(${nextRendererFrame.toString()})()`, {
    requestAnimationFrame: (handler) => { callback = handler; return 7; }, cancelAnimationFrame() {},
    setTimeout: () => 8, clearTimeout: (id) => { assert.equal(id, 8); cleared = true; },
    document: { hasFocus: () => true }, performance: { timeOrigin: 10 },
  });
  callback(17);
  assert.equal((await pending).timestamp, 17);
  assert.equal(cleared, true);
});

test('native MCP receipts carry structural identity, prevent spoofed owners and obey original tool exposure', async (t) => {
  const f = await fixture(t);
  const config = { toolProfile: 'full' };
  const context = f.options.projectContext;
  const registry = createToolRegistry({
    getRuntimeContext: () => ({ projectPath: f.options.projectPath, config, projectContext: context }),
    getStatus: () => ({}), sceneBridge: { call: async () => ({}) }, interactionLog: { add() {} }, runtimeLog: { add() {} },
  });
  const server = new McpServer({ config: {}, toolRegistry: registry, projectIdentity: context.project_id,
    projectPath: context.project_path, instanceId: context.instance_id });
  const call = (name, args) => server.handleRpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { scoped: true });
  const response = await call('simulate_mouse_drag', { ...f.options, inputOwner: 'spoofed', projectPath: '/wrong', originatingTool: 'simulate_preview_input' });
  assert.equal(response.result.isError, undefined);
  assert.equal(response.result.structuredContent.data.status, 'completed');
  assert.deepEqual(response.result.structuredContent.projectContext, context);
  assert.deepEqual(response.result.structuredContent.data.projectContext, context);
  assert.deepEqual(response.result._meta[CONTEXT_META_KEY], context);
  const jobId = response.result.structuredContent.data.jobId;
  const count = f.events.length;
  const foreign = await call('simulate_preview_input', { action: 'status', jobId, originatingTool: 'simulate_mouse_drag' });
  assert.equal(foreign.result.isError, true);
  config.disabledTools = ['simulate_mouse_drag'];
  const hidden = await call('simulate_mouse_drag', { action: 'status', jobId });
  assert.equal(hidden.result.isError, true);
  assert.match(hidden.result.content[0].text, /not exposed/);
  assert.equal(f.events.length, count);
});

test('malformed preview job actions/timing never fall through to an accidental click or key', async (t) => {
  const f = await fixture(t);
  const registry = createToolRegistry({ getRuntimeContext: () => ({ projectPath: f.options.projectPath, config: { toolProfile: 'full' } }),
    getStatus: () => ({}), sceneBridge: { call: async () => ({}) }, interactionLog: { add() {} }, runtimeLog: { add() {} } });
  for (const args of [{ mode: 'click', action: '' }, { mode: 'key', action: false }, { mode: 'click', timing: 'frame-paced' }, { action: '' }]) {
    await assert.rejects(registry.callToolDetailed('simulate_preview_input', args));
  }
  assert.equal(f.events.length, 0);
});

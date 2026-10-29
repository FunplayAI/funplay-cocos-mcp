'use strict';

const crypto = require('crypto');
const { performance } = require('perf_hooks');
const electronTools = require('./electron-tools');
const { getCaptureWindow, resolveImagePoints, acquireInputWindow } = require('./visual-coordinates');
const { controlPreviewToolbar } = require('./preview-runtime');

const MAX_RECEIPTS = 32;
const MAX_SAMPLES = 64;
const jobs = new Map();

// Serialized into the exact captured BrowserWindow. A renderer animation frame
// is NOT evidence of the native Game View's engine Update or game acceptance.
function nextRendererFrame() {
  return new Promise((resolve, reject) => {
    if (typeof requestAnimationFrame !== 'function' || typeof cancelAnimationFrame !== 'function') {
      reject(new Error('Renderer animation frames are unavailable.'));
      return;
    }
    let id;
    const timer = setTimeout(() => { cancelAnimationFrame(id); reject(new Error('Target renderer frame stalled.')); }, 1000);
    id = requestAnimationFrame((timestamp) => {
      clearTimeout(timer);
      try {
        resolve({ timestamp, epoch: performance.timeOrigin, focused: document.hasFocus(),
          source: 'target-renderer-animation-frame' });
      } catch (error) { reject(error); }
    });
  });
}

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function numberOption(options, name, fallback, min, max) {
  const value = options[name] === undefined ? fallback : options[name];
  if (!Number.isFinite(value) || value < min || value > max) throw fail('INVALID_INPUT_TIMING', `${name} must be ${min}..${max}.`);
  return value;
}

function ownerKey(options) {
  if (!options.inputOwner || !options.projectPath || !options.originatingTool) throw fail('INPUT_CONTEXT_REQUIRED', 'Input owner, project and originating tool are required.');
  return JSON.stringify([options.inputOwner, options.projectPath, options.originatingTool]);
}

function snapshot(job) {
  return { jobId: job.id, requestKey: job.requestKey, status: job.status, phase: job.phase,
    sent: job.status === 'completed', inputSent: job.status === 'completed' ? true : job.attempted ? null : false,
    eventsSubmitted: job.events, releaseSubmitted: job.releaseSubmitted, cleanup: job.cleanup,
    error: job.error ? { ...job.error } : null, windowId: job.window && job.window.id,
    captureId: job.options.captureId, coordinateSpace: 'image-pixels',
    durationMs: job.options.durationMs, pressHoldMs: job.options.pressHoldMs, endHoldMs: job.options.endHoldMs,
    elapsedMs: Math.round((job.finishedAt || performance.now()) - job.createdAt),
    observedRendererFrames: job.frameCount, samples: job.samples.map((item) => ({ ...item })),
    samplesOmitted: Math.max(0, job.frameCount - job.samples.length),
    frameEvidenceScope: 'target-renderer-animation-frame', nativeGameUpdateVerified: false, businessOutcomeVerified: false,
    projectContext: job.options.projectContext ? { ...job.options.projectContext } : null, originatingTool: job.options.originatingTool,
  };
}

async function bounded(job, operation) {
  if (job.abort.signal.aborted) throw fail('INPUT_CANCELLED', 'Gesture cancelled.');
  let timer;
  let abort;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((resolve, reject) => {
        abort = () => reject(fail('INPUT_CANCELLED', 'Gesture cancelled.'));
        job.abort.signal.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => reject(fail('INPUT_FRAME_TIMEOUT', 'Renderer or geometry observation timed out.')), Math.max(1, Math.min(1500, job.deadline - performance.now())));
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) job.abort.signal.removeEventListener('abort', abort);
  }
}

async function cleanup(job) {
  if (job.pressed) {
    try {
      if (!job.window.isDestroyed || !job.window.isDestroyed()) {
        job.emit({ type: 'mouseUp', ...job.lastPoint, button: job.options.button, clickCount: 1, modifiers: job.options.modifiers }, true);
        job.events++;
        job.releaseSubmitted = true;
      }
      job.pressed = false;
    } catch (error) {
      job.cleanup = 'failed';
      return;
    }
  }
  job.cleanup = 'complete';
  if (job.releaseLock) { job.releaseLock(); job.releaseLock = null; }
}

async function run(job, nativeMouseEvent) {
  const options = job.options;
  const pixels = [{ x: options.startX, y: options.startY }, { x: options.endX, y: options.endY }];
  job.emit = (event, held) => {
    job.attempted = true;
    job.window.webContents.sendInputEvent(nativeMouseEvent(job.window, event, held));
  };
  const submit = (type, point) => {
    if (job.abort.signal.aborted) throw fail('INPUT_CANCELLED', 'Gesture cancelled.');
    if (type === 'mouseDown') job.pressed = true; // May have arrived even if dispatch throws.
    job.lastPoint = point;
    job.emit({ type, ...point, button: options.button, clickCount: 1, modifiers: options.modifiers }, type !== 'mouseMove' || job.pressed);
    job.events++;
    if (type === 'mouseUp') { job.pressed = false; job.releaseSubmitted = true; }
  };
  const sample = async () => {
    if (performance.now() > job.deadline) throw fail('INPUT_DEADLINE_EXCEEDED', 'Gesture deadline exceeded.');
    const frame = await bounded(job, () => electronTools.executeJavaScript(job.window, `(${nextRendererFrame.toString()})()`));
    // Creator's native Game View can own focus inside the captured window
    // while its host document reports false. Require the OS window's focus
    // for native input; web targets still require their document's focus too.
    // After Up no further input is sent, so a focus handoff can be observed
    // without turning an otherwise finished gesture into failed delivery.
    const windowFocused = typeof job.window.isFocused === 'function'
      ? job.window.isFocused() === true : Boolean(frame && frame.focused === true);
    const inputFocused = windowFocused && Boolean(frame && (frame.focused === true || job.gameView));
    if (!frame || !Number.isFinite(frame.timestamp) || !Number.isFinite(frame.epoch)
      || (job.phase !== 'released' && !inputFocused)) {
      throw fail('INPUT_FRAME_UNAVAILABLE', 'A focused target window with advancing renderer frames is required. No background/focus policy was changed.');
    }
    if (job.lastFrame && (frame.epoch !== job.lastFrame.epoch || frame.timestamp <= job.lastFrame.timestamp)) {
      throw fail('INPUT_RENDERER_CHANGED', 'Renderer reloaded or its frame clock stopped advancing.');
    }
    await bounded(job, () => resolveImagePoints(options, pixels));
    if (job.gameView) {
      const preview = await bounded(job, () => controlPreviewToolbar({ action: 'state' }));
      if (!preview.running || preview.paused || !preview.toolbarSynchronized) throw fail('INPUT_PREVIEW_INTERRUPTED', 'Game View stopped, paused or changed state.');
    }
    job.lastFrame = frame;
    job.frameCount++;
    const evidence = { phase: job.phase, rendererTime: frame.timestamp, focused: frame.focused === true, windowFocused,
      elapsedMs: Math.round(performance.now() - job.createdAt), ...job.lastPoint };
    if (job.samples.length >= MAX_SAMPLES) {
      // Keep each phase's first/last witness even during long movements.
      const index = job.samples.findIndex((item, i, all) => i > 0 && i < all.length - 1
        && item.phase === all[i - 1].phase && item.phase === all[i + 1].phase);
      job.samples.splice(index < 0 ? 1 : index, 1);
    }
    job.samples.push(evidence);
    return frame;
  };
  const hold = async (ms, frames = 2) => {
    const began = performance.now();
    let count = 0;
    do { await sample(); count++; } while (count < frames || performance.now() - began < ms);
  };
  try {
    job.window = getCaptureWindow(options);
    job.releaseLock = acquireInputWindow(job.window);
    await bounded(job, () => resolveImagePoints(options, pixels));
    if (typeof job.window.focus === 'function') job.window.focus();
    // A native Game View can own keyboard focus inside the same window.
    // Focus the exact captured host once before input, never on later frames.
    if (typeof job.window.webContents.focus === 'function') job.window.webContents.focus();
    const resolved = await bounded(job, () => resolveImagePoints(options, pixels));
    const [start, end] = resolved.points;
    job.lastPoint = start;
    const url = typeof job.window.webContents.getURL === 'function' ? job.window.webContents.getURL() : '';
    job.gameView = resolved.panel === 'game' && /\/windows\/main\.html(?:[?#]|$)/i.test(url);
    job.phase = 'preflight';
    await sample(); // No input before frame, focus, geometry and preview checks pass.
    submit('mouseMove', start);
    submit('mouseDown', start);
    job.phase = 'pressed';
    await hold(options.pressHoldMs);
    job.phase = 'moving';
    const began = performance.now();
    let fraction;
    do {
      await sample();
      fraction = Math.min(1, (performance.now() - began) / options.durationMs);
      submit('mouseMove', { x: Math.round(start.x + (end.x - start.x) * fraction), y: Math.round(start.y + (end.y - start.y) * fraction) });
    } while (fraction < 1);
    job.phase = 'target-hold';
    await hold(options.endHoldMs);
    submit('mouseUp', end);
    job.phase = 'released';
    await hold(0);
    job.status = 'completed';
  } catch (error) {
    job.status = job.abort.signal.aborted ? 'cancelled' : 'failed';
    job.error = { code: error.code || 'INPUT_OUTCOME_UNKNOWN', message: error.message };
  } finally {
    await cleanup(job);
    if (job.cleanup === 'failed') {
      job.status = 'failed';
      job.error = { code: 'INPUT_CLEANUP_FAILED', message: 'Release could not be submitted. Cancel this job to retry cleanup; its window stays locked.' };
    }
    job.finishedAt = performance.now();
  }
}

async function waitReceipt(job, waitMs) {
  let timer;
  try {
    if (job.status === 'running' && waitMs > 0) await Promise.race([job.done, new Promise((resolve) => { timer = setTimeout(resolve, waitMs); })]);
    return snapshot(job);
  } finally { clearTimeout(timer); }
}

async function frameDrag(options, nativeMouseEvent) {
  const owner = ownerKey(options);
  const action = options.action || 'start';
  if (!['start', 'status', 'cancel'].includes(action)) throw fail('INVALID_INPUT_ACTION', 'Use start, status or cancel.');
  let job;
  if (options.jobId !== undefined) job = jobs.get(options.jobId);
  else if (options.requestKey) job = [...jobs.values()].find((item) => item.owner === owner && item.requestKey === options.requestKey);
  if (job && job.owner !== owner) throw fail('INPUT_OWNER_MISMATCH', 'This receipt belongs to another project, Editor session or originating tool.');
  if (action !== 'start') {
    if (!job) throw fail('INPUT_RECEIPT_NOT_FOUND', 'Receipt expired or belongs to another input tool/project. Do not replay a lost gesture.');
    if (action === 'cancel') {
      job.abort.abort();
      await job.done;
      if (job.cleanup === 'failed') await cleanup(job);
      if (job.cleanup === 'failed') {
        const error = fail('INPUT_CLEANUP_FAILED', 'Release still could not be submitted. The owned window remains locked.');
        error.inputOutcome = { ...snapshot(job), retrySafe: false };
        throw error;
      }
    }
    return snapshot(job);
  }
  if (options.jobId !== undefined) throw fail('INVALID_INPUT_ACTION', 'Use status or cancel with a jobId.');
  if (options.coordinateSpace !== 'image-pixels' || typeof options.captureId !== 'string' || !options.captureId || options.captureId.length > 128) throw fail('INPUT_CAPTURE_REQUIRED', 'Frame-paced dragging requires a fresh calibrated screenshot and image-pixels coordinates. Legacy coordinates remain available with legacy timing.');
  if (typeof options.requestKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(options.requestKey)) throw fail('INPUT_REQUEST_KEY_REQUIRED', 'Provide a unique requestKey (1..128 ASCII letters, digits, dot, colon, underscore or hyphen).');
  if (options.steps !== undefined || options.stepDelayMs !== undefined) throw fail('INVALID_INPUT_TIMING', 'Frame-paced timing uses durationMs/pressHoldMs/endHoldMs, not legacy steps or stepDelayMs.');
  const normalized = { projectPath: options.projectPath, inputOwner: options.inputOwner, originatingTool: options.originatingTool,
    projectContext: options.projectContext || null,
    captureId: options.captureId, coordinateSpace: 'image-pixels', windowId: options.windowId,
    windowKind: options.windowKind, titleContains: options.titleContains, panel: options.panel,
    startX: options.startX, startY: options.startY, endX: options.endX, endY: options.endY,
    durationMs: numberOption(options, 'durationMs', 600, 50, 10000),
    pressHoldMs: numberOption(options, 'pressHoldMs', 100, 0, 2000), endHoldMs: numberOption(options, 'endHoldMs', 100, 0, 2000),
    button: options.button || 'left', modifiers: options.modifiers || [] };
  if (!['left', 'right', 'middle'].includes(normalized.button) || !Array.isArray(normalized.modifiers)
    || normalized.modifiers.length > 16 || normalized.modifiers.some((item) => typeof item !== 'string' || item.length > 64)
    || ['panel', 'titleContains', 'windowKind'].some((key) => options[key] !== undefined && (typeof options[key] !== 'string' || options[key].length > 200))) throw fail('INVALID_INPUT_ARGUMENTS', 'Invalid mouse button, modifiers or target description.');
  normalized.modifiers = normalized.modifiers.slice();
  normalized.projectContext = normalized.projectContext ? { ...normalized.projectContext } : null;
  if (![options.startX, options.startY, options.endX, options.endY].every(Number.isFinite)) throw fail('INVALID_INPUT_ARGUMENTS', 'Finite start/end image coordinates are required.');
  const waitMs = numberOption(options, 'waitMs', 1200, 0, 15000);
  const fingerprint = JSON.stringify([options.captureId, options.windowId, options.windowKind, options.titleContains, options.panel,
    options.startX, options.startY, options.endX, options.endY, normalized.button, normalized.modifiers, normalized.durationMs, normalized.pressHoldMs, normalized.endHoldMs]);
  if (job) {
    if (job.fingerprint !== fingerprint) throw fail('INPUT_REQUEST_KEY_CONFLICT', 'The same requestKey cannot name different gesture arguments.');
  } else {
    if (jobs.size >= MAX_RECEIPTS) {
      const retired = [...jobs.values()].find((item) => item.status !== 'running' && item.cleanup !== 'failed');
      if (!retired) throw fail('INPUT_RECEIPTS_BUSY', 'All retained receipts are active or need cleanup.');
      jobs.delete(retired.id);
    }
    const createdAt = performance.now();
    job = { id: `input_${crypto.randomBytes(12).toString('hex')}`, owner, requestKey: options.requestKey, fingerprint,
      options: normalized, status: 'running', phase: 'queued', createdAt,
      deadline: createdAt + normalized.durationMs + normalized.pressHoldMs + normalized.endHoldMs + 5000,
      events: 0, attempted: false, pressed: false, releaseSubmitted: false, cleanup: 'pending', samples: [], frameCount: 0,
      abort: new AbortController() };
    jobs.set(job.id, job);
    job.done = run(job, nativeMouseEvent);
  }
  const receipt = await waitReceipt(job, waitMs);
  if (receipt.status === 'failed' || receipt.status === 'cancelled') {
    const error = new Error(receipt.error && receipt.error.message || 'Gesture cancelled.');
    error.code = receipt.error && receipt.error.code || 'INPUT_CANCELLED';
    error.inputOutcome = { ...receipt, retrySafe: !job.attempted };
    throw error;
  }
  return receipt;
}

async function cancelFrameDrags(owner) {
  const owned = [...jobs.values()].filter((job) => job.options.inputOwner === owner);
  for (const job of owned) job.abort.abort();
  await Promise.all(owned.map((job) => job.done));
  if (owned.some((job) => job.cleanup === 'failed')) throw fail('INPUT_CLEANUP_FAILED', 'An owned input job still needs release cleanup.');
}

module.exports = { frameDrag, cancelFrameDrags, nextRendererFrame, MAX_RECEIPTS };

'use strict';

const electronTools = require('./electron-tools');
const { acquireInputWindow, getCaptureWindow, resolveImagePoints } = require('./visual-coordinates');
const { frameDrag, cancelFrameDrags: cancelFrameJobs } = require('./input-frames');

// Keep ownership while a release is uncertain. Stop/restart retries only the
// owned release; it must never replay the original press or gesture.
const mouseGestures = new Set();

function normalizeButton(button) {
  const value = String(button || 'left').toLowerCase();
  return ['left', 'right', 'middle'].includes(value) ? value : 'left';
}

function normalizeModifiers(modifiers) {
  return Array.isArray(modifiers) ? modifiers.map((item) => String(item)) : [];
}

function nativeMouseEvent(window, event, held) {
  // Blink does not infer the pressed-button flags from `button`. Keep keyboard
  // modifiers, but derive mouse state from this gesture (including mouseUp's
  // changed button so Creator receives the correct `which` value).
  const modifiers = event.modifiers.filter((value) => !/^(left|middle|right)buttondown$/i.test(value));
  if (held) modifiers.push(`${event.button}buttondown`);
  const result = { ...event, modifiers };
  // Creator's Game View filters/forwards movement using screen coordinates.
  // Electron otherwise defaults these to (0, 0), dropping drag movement even
  // when the local client coordinates and button flags are correct.
  if (typeof window.getContentBounds === 'function') {
    const bounds = window.getContentBounds();
    if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
      throw new Error('The target window has unavailable screen bounds.');
    }
    result.globalX = Math.round(bounds.x + event.x);
    result.globalY = Math.round(bounds.y + event.y);
  }
  return result;
}

async function focusTarget(window, panel, x, y) {
  if (typeof window.focus === 'function') {
    window.focus();
  }
  if (panel) {
    return await electronTools.getPanelPoint(window, panel, x, y);
  }
  return { x: Math.floor(x || 0), y: Math.floor(y || 0) };
}

async function resolvePoint(window, panel, x, y) {
  if (panel) {
    return await electronTools.getPanelPoint(window, panel, x, y);
  }
  return { x: Math.floor(x || 0), y: Math.floor(y || 0) };
}

function mouseGesture(window, options) {
  const gesture = {
    window, inputOwner: options.inputOwner || '', releaseLock: acquireInputWindow(window),
    button: normalizeButton(options.button), modifiers: normalizeModifiers(options.modifiers),
    attempted: false, pressed: false, eventsSubmitted: 0, releaseSubmitted: false, cancelled: false,
  };
  mouseGestures.add(gesture);
  return gesture;
}

function submitMouse(gesture, event) {
  if (gesture.cancelled) throw new Error('INPUT_CANCELLED: Gesture cancelled during MCP shutdown.');
  const nativeEvent = nativeMouseEvent(gesture.window, event, event.type !== 'mouseMove' || gesture.pressed);
  gesture.attempted = true;
  gesture.lastPoint = { x: event.x, y: event.y };
  // Dispatch can throw after delivery; ownership starts before the attempt.
  if (event.type === 'mouseDown') gesture.pressed = true;
  gesture.window.webContents.sendInputEvent(nativeEvent);
  gesture.eventsSubmitted++;
  if (event.type === 'mouseUp') {
    gesture.pressed = false;
    gesture.releaseSubmitted = true;
  }
}

function unlockMouse(gesture) {
  if (!gesture || gesture.pressed) return;
  if (gesture.releaseLock) { gesture.releaseLock(); gesture.releaseLock = null; }
  mouseGestures.delete(gesture);
}

function releaseMouse(gesture) {
  if (gesture.pressed) {
    const window = gesture.window;
    if (!window.isDestroyed || !window.isDestroyed()) {
      window.webContents.sendInputEvent(nativeMouseEvent(window, {
        type: 'mouseUp', ...gesture.lastPoint, button: gesture.button, clickCount: 1, modifiers: gesture.modifiers,
      }, true));
      gesture.releaseSubmitted = true;
    }
    gesture.pressed = false;
  }
  unlockMouse(gesture);
}

function mouseFailure(error, gesture) {
  if (gesture) {
    try { releaseMouse(gesture); } catch (cleanupError) { /* Retain the window lock until owned cleanup succeeds. */ }
  }
  const attempted = Boolean(gesture && gesture.attempted);
  const locked = Boolean(gesture && gesture.pressed);
  error.inputOutcome = {
    code: attempted ? 'INPUT_OUTCOME_UNKNOWN' : 'INPUT_NOT_SENT',
    inputSent: attempted ? null : false,
    eventsSubmitted: gesture ? gesture.eventsSubmitted : 0,
    releaseSubmitted: Boolean(gesture && gesture.releaseSubmitted),
    cleanup: locked ? 'failed' : 'complete', windowLocked: locked,
    retrySafe: !attempted, businessOutcomeVerified: false,
  };
  if (locked) error.message += ' Release could not be submitted; the window stays locked. Stop/restart MCP to retry owned cleanup.';
  return error;
}

async function sendMouseClick(options = {}) {
  if (calibratedInput(options)) return await sendCalibratedMouse(options, false);
  return await sendLegacyMouse(options, false);
}

async function sendMouseDrag(options = {}) {
  if (options.timing === 'frame-paced' || options.action !== undefined) return await frameDrag(options, nativeMouseEvent);
  if (options.timing !== undefined && options.timing !== 'legacy') throw new Error('timing must be legacy or frame-paced.');
  if (calibratedInput(options)) return await sendCalibratedMouse(options, true);
  return await sendLegacyMouse(options, true);
}

async function sendLegacyMouse(options, drag) {
  let gesture;
  try {
    const window = electronTools.pickWindow(options);
    gesture = mouseGesture(window, options);
    const start = await focusTarget(window, options.panel, drag ? options.startX : options.x, drag ? options.startY : options.y);
    const end = drag ? await resolvePoint(window, options.panel, options.endX ?? 0, options.endY ?? 0) : start;
    const steps = Number.isFinite(options.steps) ? Math.max(1, Math.min(60, options.steps)) : 10;
    const clickCount = drag ? 1 : Number.isFinite(options.clickCount) ? Math.max(1, options.clickCount) : 1;
    const { button, modifiers } = gesture;
    submitMouse(gesture, { type: 'mouseMove', ...start, button, modifiers });
    submitMouse(gesture, { type: 'mouseDown', ...start, button, clickCount, modifiers });
    if (drag) {
      for (let step = 1; step <= steps; step += 1) {
        const x = Math.round(start.x + ((end.x - start.x) * step) / steps);
        const y = Math.round(start.y + ((end.y - start.y) * step) / steps);
        submitMouse(gesture, { type: 'mouseMove', x, y, button, modifiers });
        if (options.stepDelayMs) await electronTools.sleep(options.stepDelayMs);
      }
    }
    submitMouse(gesture, { type: 'mouseUp', ...end, button, clickCount, modifiers });
    return {
      sent: true, type: drag ? 'mouse_drag' : 'mouse_click',
      ...(drag ? { from: start, to: end, steps } : { point: start, button, clickCount }),
      windowTitle: typeof window.getTitle === 'function' ? window.getTitle() : '',
    };
  } catch (error) {
    throw mouseFailure(error, gesture);
  } finally { unlockMouse(gesture); }
}

async function sendKeyPress(options = {}) {
  if (options.coordinateSpace === 'image-pixels' || options.captureId) throw new Error('Screenshot calibration applies to mouse input, not key input.');
  const window = electronTools.pickWindow(options);
  if (typeof window.focus === 'function') {
    window.focus();
  }
  if (options.panel) {
    await electronTools.getPanelPoint(window, options.panel, 0, 0);
  }

  const keyCode = String(options.keyCode || '').trim();
  if (!keyCode) {
    throw new Error('keyCode is required.');
  }

  const modifiers = normalizeModifiers(options.modifiers);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  if (options.text) {
    window.webContents.sendInputEvent({ type: 'char', keyCode: String(options.text), modifiers });
  }
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });

  return {
    sent: true,
    type: 'key_press',
    keyCode,
    modifiers,
    windowTitle: typeof window.getTitle === 'function' ? window.getTitle() : '',
  };
}

async function sendKeyCombo(options = {}) {
  const modifiers = normalizeModifiers(options.modifiers);
  const keyCode = String(options.keyCode || '').trim();
  if (!keyCode) {
    throw new Error('keyCode is required.');
  }
  return await sendKeyPress({
    ...options,
    keyCode,
    modifiers,
  });
}

function calibratedInput(options) {
  const space = options.coordinateSpace || 'legacy';
  if (!['legacy', 'image-pixels'].includes(space)) throw new Error('coordinateSpace must be legacy or image-pixels.');
  if (space === 'legacy' && options.captureId) throw new Error('captureId requires coordinateSpace="image-pixels"; legacy offsets are not screenshot pixels.');
  return space === 'image-pixels';
}

async function sendCalibratedMouse(options, drag) {
  let window;
  let gesture;
  const button = normalizeButton(options.button);
  const modifiers = normalizeModifiers(options.modifiers);
  const submit = (event) => submitMouse(gesture, event);
  try {
    const steps = options.steps === undefined ? 10 : options.steps;
    const delay = options.stepDelayMs === undefined ? 0 : options.stepDelayMs;
    const clickCount = options.clickCount === undefined ? 1 : options.clickCount;
    if (!Number.isInteger(steps) || steps < 1 || steps > 60 || !Number.isInteger(delay) || delay < 0 || delay > 100 ||
        !Number.isInteger(clickCount) || clickCount < 1 || clickCount > 3) {
      throw new Error('Calibrated input requires steps 1..60, stepDelayMs 0..100, and clickCount 1..3.');
    }
    const pixels = drag ? [{ x: options.startX, y: options.startY }, { x: options.endX, y: options.endY }]
      : [{ x: options.x, y: options.y }];
    window = getCaptureWindow(options);
    gesture = mouseGesture(window, options);
    await resolveImagePoints(options, pixels); // Validate before moving focus.
    if (typeof window.focus === 'function') window.focus();
    const resolved = await resolveImagePoints(options, pixels); // Focus can resize/change the viewport.
    const start = resolved.points[0];
    const end = drag ? resolved.points[1] : start;
    submit({ type: 'mouseMove', ...start, button, modifiers });
    submit({ type: 'mouseDown', ...start, button, clickCount, modifiers });
    if (drag) {
      for (let step = 1; step <= steps; step += 1) {
        if (delay) {
          await electronTools.sleep(delay);
          await resolveImagePoints(options, pixels);
        }
        submit({ type: 'mouseMove', x: Math.round(start.x + (end.x - start.x) * step / steps),
          y: Math.round(start.y + (end.y - start.y) * step / steps), button, modifiers });
      }
    }
    submit({ type: 'mouseUp', ...end, button, clickCount, modifiers });
    return {
      sent: true, inputSent: true, outcome: 'events_submitted',
      type: drag ? 'mouse_drag' : 'mouse_click', captureId: resolved.captureId, coordinateSpace: 'image-pixels',
      ...(drag ? { from: start, to: end, steps } : { point: start, clickCount }),
      button, eventsSubmitted: gesture.eventsSubmitted,
      windowId: window.id, windowTitle: typeof window.getTitle === 'function' ? window.getTitle() : '',
      businessOutcomeVerified: false,
    };
  } catch (error) {
    throw mouseFailure(error, gesture);
  } finally {
    unlockMouse(gesture);
  }
}

async function cancelFrameDrags(owner) {
  let failure;
  try { await cancelFrameJobs(owner); } catch (error) { failure = error; }
  for (const gesture of [...mouseGestures]) {
    if (gesture.inputOwner !== owner) continue;
    gesture.cancelled = true;
    try { releaseMouse(gesture); } catch (error) {
      failure = new Error('INPUT_CLEANUP_FAILED: Release could not be submitted. The owned window stays locked; retry MCP stop/restart to clean up.');
      failure.code = 'INPUT_CLEANUP_FAILED';
    }
  }
  if (failure) throw failure;
}

module.exports = {
  listWindows: electronTools.listWindows,
  sendKeyCombo,
  sendKeyPress,
  sendMouseClick,
  sendMouseDrag,
  cancelFrameDrags,
};

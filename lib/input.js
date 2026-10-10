'use strict';

const electronTools = require('./electron-tools');
const { acquireInputWindow, getCaptureWindow, resolveImagePoints } = require('./visual-coordinates');

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

async function sendMouseClick(options = {}) {
  if (calibratedInput(options)) return await sendCalibratedMouse(options, false);
  const window = electronTools.pickWindow(options);
  const point = await focusTarget(window, options.panel, options.x, options.y);
  const button = normalizeButton(options.button);
  const clickCount = Number.isFinite(options.clickCount) ? Math.max(1, options.clickCount) : 1;
  const modifiers = normalizeModifiers(options.modifiers);

  window.webContents.sendInputEvent(nativeMouseEvent(window, {
    type: 'mouseMove',
    x: point.x,
    y: point.y,
    button,
    modifiers,
  }, false));
  window.webContents.sendInputEvent(nativeMouseEvent(window, {
    type: 'mouseDown',
    x: point.x,
    y: point.y,
    button,
    clickCount,
    modifiers,
  }, true));
  window.webContents.sendInputEvent(nativeMouseEvent(window, {
    type: 'mouseUp',
    x: point.x,
    y: point.y,
    button,
    clickCount,
    modifiers,
  }, true));

  return {
    sent: true,
    type: 'mouse_click',
    point,
    button,
    clickCount,
    windowTitle: typeof window.getTitle === 'function' ? window.getTitle() : '',
  };
}

async function sendMouseDrag(options = {}) {
  if (calibratedInput(options)) return await sendCalibratedMouse(options, true);
  const window = electronTools.pickWindow(options);
  const start = await focusTarget(window, options.panel, options.startX, options.startY);
  const end = await resolvePoint(window, options.panel, options.endX ?? 0, options.endY ?? 0);
  const steps = Number.isFinite(options.steps) ? Math.max(1, Math.min(60, options.steps)) : 10;
  const button = normalizeButton(options.button);
  const modifiers = normalizeModifiers(options.modifiers);

  window.webContents.sendInputEvent(nativeMouseEvent(window, { type: 'mouseMove', x: start.x, y: start.y, button, modifiers }, false));
  window.webContents.sendInputEvent(nativeMouseEvent(window, { type: 'mouseDown', x: start.x, y: start.y, button, clickCount: 1, modifiers }, true));
  for (let step = 1; step <= steps; step += 1) {
    const x = Math.round(start.x + ((end.x - start.x) * step) / steps);
    const y = Math.round(start.y + ((end.y - start.y) * step) / steps);
    window.webContents.sendInputEvent(nativeMouseEvent(window, { type: 'mouseMove', x, y, button, modifiers }, true));
    if (options.stepDelayMs) {
      await electronTools.sleep(options.stepDelayMs);
    }
  }
  window.webContents.sendInputEvent(nativeMouseEvent(window, { type: 'mouseUp', x: end.x, y: end.y, button, clickCount: 1, modifiers }, true));

  return {
    sent: true,
    type: 'mouse_drag',
    from: start,
    to: end,
    steps,
    windowTitle: typeof window.getTitle === 'function' ? window.getTitle() : '',
  };
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
  let releaseLock;
  let attempted = false;
  let downAttempted = false;
  let lastPoint;
  const submitted = [];
  const button = normalizeButton(options.button);
  const modifiers = normalizeModifiers(options.modifiers);
  const submit = (event) => {
    const nativeEvent = nativeMouseEvent(window, event, event.type !== 'mouseMove' || downAttempted);
    attempted = true;
    if (event.type === 'mouseDown') downAttempted = true;
    window.webContents.sendInputEvent(nativeEvent);
    submitted.push(event.type);
    lastPoint = { x: event.x, y: event.y };
    if (event.type === 'mouseUp') downAttempted = false;
  };
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
    releaseLock = acquireInputWindow(window);
    await resolveImagePoints(options, pixels); // Validate before moving focus.
    if (typeof window.focus === 'function') window.focus();
    const resolved = await resolveImagePoints(options, pixels); // Focus can resize/change the viewport.
    const start = resolved.points[0];
    const end = drag ? resolved.points[1] : start;
    lastPoint = start;
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
      button, eventsSubmitted: submitted.length,
      windowId: window.id, windowTitle: typeof window.getTitle === 'function' ? window.getTitle() : '',
      businessOutcomeVerified: false,
    };
  } catch (error) {
    let releaseSubmitted = false;
    if (downAttempted && window && lastPoint) {
      try {
        window.webContents.sendInputEvent(nativeMouseEvent(window, { type: 'mouseUp', ...lastPoint, button, clickCount: 1, modifiers }, true));
        releaseSubmitted = true;
      } catch (cleanupError) { /* Delivery stays unknown; never replay mouseDown or the gesture. */ }
    }
    error.inputOutcome = {
      code: attempted ? 'INPUT_OUTCOME_UNKNOWN' : 'INPUT_NOT_SENT',
      inputSent: attempted ? null : false,
      eventsSubmitted: submitted.length, releaseSubmitted,
      retrySafe: !attempted, businessOutcomeVerified: false,
    };
    throw error;
  } finally {
    if (releaseLock) releaseLock();
  }
}

module.exports = {
  listWindows: electronTools.listWindows,
  sendKeyCombo,
  sendKeyPress,
  sendMouseClick,
  sendMouseDrag,
};

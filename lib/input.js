'use strict';

const { getPanelPoint, listWindows, pickWindow, sleep } = require('./electron-tools');

function normalizeButton(button) {
  const value = String(button || 'left').toLowerCase();
  return ['left', 'right', 'middle'].includes(value) ? value : 'left';
}

function normalizeModifiers(modifiers) {
  return Array.isArray(modifiers) ? modifiers.map((item) => String(item)) : [];
}

async function focusTarget(window, panel, x, y) {
  if (typeof window.focus === 'function') {
    window.focus();
  }
  if (panel) {
    return await getPanelPoint(window, panel, x, y);
  }
  return { x: Math.floor(x || 0), y: Math.floor(y || 0) };
}

async function resolvePoint(window, panel, x, y) {
  if (panel) {
    return await getPanelPoint(window, panel, x, y);
  }
  return { x: Math.floor(x || 0), y: Math.floor(y || 0) };
}

async function sendMouseClick(options = {}) {
  const window = pickWindow(options);
  const point = await focusTarget(window, options.panel, options.x, options.y);
  const button = normalizeButton(options.button);
  const clickCount = Number.isFinite(options.clickCount) ? Math.max(1, options.clickCount) : 1;
  const modifiers = normalizeModifiers(options.modifiers);

  window.webContents.sendInputEvent({
    type: 'mouseMove',
    x: point.x,
    y: point.y,
    button,
    modifiers,
  });
  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: point.x,
    y: point.y,
    button,
    clickCount,
    modifiers,
  });
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: point.x,
    y: point.y,
    button,
    clickCount,
    modifiers,
  });

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
  const window = pickWindow(options);
  const start = await focusTarget(window, options.panel, options.startX, options.startY);
  const end = await resolvePoint(window, options.panel, options.endX ?? 0, options.endY ?? 0);
  const steps = Number.isFinite(options.steps) ? Math.max(1, Math.min(60, options.steps)) : 10;
  const button = normalizeButton(options.button);
  const modifiers = normalizeModifiers(options.modifiers);

  window.webContents.sendInputEvent({ type: 'mouseMove', x: start.x, y: start.y, button, modifiers });
  window.webContents.sendInputEvent({ type: 'mouseDown', x: start.x, y: start.y, button, clickCount: 1, modifiers });
  for (let step = 1; step <= steps; step += 1) {
    const x = Math.round(start.x + ((end.x - start.x) * step) / steps);
    const y = Math.round(start.y + ((end.y - start.y) * step) / steps);
    window.webContents.sendInputEvent({ type: 'mouseMove', x, y, button, modifiers });
    if (options.stepDelayMs) {
      await sleep(options.stepDelayMs);
    }
  }
  window.webContents.sendInputEvent({ type: 'mouseUp', x: end.x, y: end.y, button, clickCount: 1, modifiers });

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
  const window = pickWindow(options);
  if (typeof window.focus === 'function') {
    window.focus();
  }
  if (options.panel) {
    await getPanelPoint(window, options.panel, 0, 0);
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

module.exports = {
  listWindows,
  sendKeyCombo,
  sendKeyPress,
  sendMouseClick,
  sendMouseDrag,
};

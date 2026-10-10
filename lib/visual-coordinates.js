'use strict';

const crypto = require('crypto');
const path = require('path');
const electronTools = require('./electron-tools');

const CAPTURE_TTL_MS = 60000;
const MAX_CAPTURES = 32;
const captures = new Map();
const inputWindows = new WeakSet();

// Serialized into the target renderer. Read display geometry, not business data.
function windowGeometry() {
  const key = Symbol.for('funplay-cocos-mcp.visual-geometry');
  const state = window[key] || (window[key] = { ids: new WeakMap(), nextId: 1 });
  const identity = (node) => {
    if (!state.ids.has(node)) state.ids.set(node, state.nextId++);
    return state.ids.get(node);
  };
  const canvases = [];
  const frames = [];
  let visited = 0;
  let complete = true;
  const rectOf = (node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return null;
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  };
  const collect = (root) => {
    for (const node of root.querySelectorAll('*')) {
      if (++visited > 15000) { complete = false; return; }
      const tag = node.tagName && node.tagName.toLowerCase();
      if (tag === 'canvas') {
        const rect = rectOf(node);
        if (rect) {
          if (canvases.length >= 64) { complete = false; return; }
          canvases.push({ id: identity(node), rect, width: node.width, height: node.height });
        }
      } else if (tag === 'iframe' || tag === 'webview') {
        const rect = rectOf(node);
        if (rect) {
          if (frames.length >= 64) { complete = false; return; }
          let epoch = null;
          try { epoch = node.contentWindow.performance.timeOrigin; } catch (error) { /* Cross-origin frames are identified by element/src only. */ }
          frames.push({ id: identity(node), rect, src: node.getAttribute('src') || '', epoch });
        }
      }
      if (node.shadowRoot) collect(node.shadowRoot);
      if (!complete) return;
    }
  };
  collect(document);
  return {
    width: window.innerWidth, height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio, documentEpoch: performance.timeOrigin,
    scrollX: window.scrollX, scrollY: window.scrollY,
    url: window.location.href, canvases, frames, complete,
  };
}

function boundedRead(read) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Visual geometry query timed out. Recapture after the editor becomes responsive.')), 1500);
    Promise.resolve().then(read).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

function usableWindow(window) {
  if (!window || typeof window.isDestroyed === 'function' && window.isDestroyed()) throw new Error('The captured window is no longer available.');
  if (typeof window.isVisible === 'function' && !window.isVisible() ||
      typeof window.isMinimized === 'function' && window.isMinimized()) {
    throw new Error('A visible, non-minimized window is required for calibrated screenshots/input.');
  }
  if (!window.webContents || typeof window.webContents.isDestroyed === 'function' && window.webContents.isDestroyed()) {
    throw new Error('The captured renderer is no longer available.');
  }
}

async function readVisualState(window, panel, getContext) {
  usableWindow(window);
  const renderer = await boundedRead(() => electronTools.executeJavaScript(window, `(${windowGeometry.toString()})()`));
  if (!renderer || !Number.isFinite(renderer.width) || renderer.width <= 0 || !Number.isFinite(renderer.height) || renderer.height <= 0 || renderer.complete !== true) {
    throw new Error('Complete visible-window geometry is unavailable; calibrated input is not safe.');
  }
  const zoomFactor = typeof window.webContents.getZoomFactor === 'function' ? window.webContents.getZoomFactor() : 1;
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) throw new Error('The renderer zoom factor is unavailable.');
  const panelBounds = panel ? await boundedRead(() => electronTools.getPanelBounds(window, panel)) : null;
  const windowWidth = Math.round(renderer.width * zoomFactor);
  const windowHeight = Math.round(renderer.height * zoomFactor);
  const css = panelBounds || { x: 0, y: 0, width: renderer.width, height: renderer.height };
  if (![css.x, css.y, css.width, css.height].every(Number.isFinite) || css.width <= 0 || css.height <= 0) {
    throw new Error('The capture region has invalid geometry.');
  }
  // Electron capturePage/sendInputEvent use content coordinates; DOM bounds are zoomed CSS coordinates.
  const x = Math.max(0, Math.floor(css.x * zoomFactor));
  const y = Math.max(0, Math.floor(css.y * zoomFactor));
  const right = Math.min(windowWidth, Math.ceil((css.x + css.width) * zoomFactor));
  const bottom = Math.min(windowHeight, Math.ceil((css.y + css.height) * zoomFactor));
  if (right <= x || bottom <= y) throw new Error('The requested capture region is outside the visible window.');
  const inputBounds = { x, y, width: right - x, height: bottom - y };
  const context = getContext ? await boundedRead(getContext) : null;
  const signature = crypto.createHash('sha256').update(JSON.stringify({ renderer, zoomFactor, inputBounds, context })).digest('hex');
  return {
    signature, inputBounds, panelBounds,
    viewport: { width: windowWidth, height: windowHeight, cssWidth: renderer.width, cssHeight: renderer.height, devicePixelRatio: renderer.devicePixelRatio, zoomFactor },
    context,
  };
}

function pngDimensions(png) {
  if (!Buffer.isBuffer(png) || png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Screenshot did not contain a PNG with measurable dimensions.');
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (!width || !height) throw new Error('Screenshot PNG has empty dimensions.');
  return { width, height };
}

function registerCapture(window, png, before, after, options = {}) {
  const image = pngDimensions(png);
  const capturedAt = Date.now();
  for (const [id, entry] of captures) if (capturedAt - entry.createdAt > CAPTURE_TTL_MS) captures.delete(id);
  while (captures.size >= MAX_CAPTURES) captures.delete(captures.keys().next().value);
  const captureId = `capture_${crypto.randomBytes(12).toString('hex')}`;
  const interactive = before.signature === after.signature;
  const geometry = {
    schemaVersion: 1, captureId, capturedAt: new Date(capturedAt).toISOString(),
    coordinateSpace: 'image-pixels', origin: 'top-left',
    windowId: window.id, webContentsId: window.webContents.id,
    panel: options.panel || null, image, viewport: before.viewport,
    inputBounds: before.inputBounds,
    imageToWindowScale: { x: before.inputBounds.width / image.width, y: before.inputBounds.height / image.height },
    interactive, expiresAfterMs: CAPTURE_TTL_MS,
    reason: interactive ? null : 'geometry_changed_during_capture',
    editorScene: before.context,
    runtimeContentVerified: false,
  };
  captures.set(captureId, {
    window, webContents: window.webContents, geometry, createdAt: capturedAt,
    signature: before.signature, getContext: options.getContext,
    projectPath: options.projectPath ? path.resolve(options.projectPath) : '',
  });
  return geometry;
}

function captureRecord(options) {
  if (typeof options.captureId !== 'string' || !options.captureId) throw new Error('captureId is required for image-pixels input.');
  const record = captures.get(options.captureId);
  if (!record) throw new Error('Unknown or expired captureId. Capture a new screenshot; do not guess a target window.');
  if (Date.now() - record.createdAt > CAPTURE_TTL_MS) {
    captures.delete(options.captureId);
    throw new Error('The screenshot is stale. Capture a new screenshot before sending input.');
  }
  if (!record.geometry.interactive) throw new Error('Geometry changed during screenshot capture. Capture a new stable image.');
  if (record.projectPath && (!options.projectPath || path.resolve(options.projectPath) !== record.projectPath)) throw new Error('The screenshot belongs to a different project.');
  usableWindow(record.window);
  if (record.window.webContents !== record.webContents) throw new Error('The captured renderer was replaced. Recapture.');
  if (options.windowId !== undefined && options.windowId !== record.geometry.windowId) throw new Error('windowId does not match the screenshot.');
  if (options.panel && options.panel !== record.geometry.panel) throw new Error('panel does not match the screenshot.');
  if (options.titleContains && !String(record.window.getTitle()).toLowerCase().includes(String(options.titleContains).toLowerCase())) throw new Error('The target title does not match the screenshot window.');
  if (options.windowKind && options.windowKind !== 'focused' && options.windowKind !== electronTools.inferWindowKind(record.window.getTitle())) throw new Error('windowKind does not match the screenshot window. Use its windowId.');
  return record;
}

function getCaptureWindow(options) {
  return captureRecord(options).window;
}

async function resolveImagePoints(options, points) {
  const record = captureRecord(options);
  const geometry = record.geometry;
  const mapped = points.map((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x >= geometry.image.width || point.y >= geometry.image.height) {
      throw new Error('Image coordinates must be finite and inside the exact captured PNG.');
    }
    return {
      x: Math.min(geometry.inputBounds.x + geometry.inputBounds.width - 1, Math.floor(geometry.inputBounds.x + point.x * geometry.imageToWindowScale.x)),
      y: Math.min(geometry.inputBounds.y + geometry.inputBounds.height - 1, Math.floor(geometry.inputBounds.y + point.y * geometry.imageToWindowScale.y)),
    };
  });
  const state = await readVisualState(record.window, geometry.panel, record.getContext);
  captureRecord(options); // A long read or concurrent capture may have expired/evicted this receipt.
  if (state.signature !== record.signature) throw new Error('Window, viewport, renderer, panel, or editor scene changed since capture. Recapture before input.');
  return { window: record.window, points: mapped, captureId: geometry.captureId, coordinateSpace: 'image-pixels' };
}

function acquireInputWindow(window) {
  if (inputWindows.has(window)) throw new Error('A calibrated input operation is already active in this window.');
  inputWindows.add(window);
  return () => inputWindows.delete(window);
}

module.exports = {
  CAPTURE_TTL_MS, MAX_CAPTURES, acquireInputWindow, getCaptureWindow, pngDimensions,
  readVisualState, registerCapture, resolveImagePoints,
};

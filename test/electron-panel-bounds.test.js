'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { runInNewContext } = require('node:vm');
const { getPanelBounds } = require('../lib/electron-tools');

const WEBVIEW_SOURCE = 'packages://scene/static/template/3d-webview.html?url=';

function element(tag, attributes, rect, visible = true) {
  return {
    tagName: tag, id: attributes.id || '', className: attributes.class || '',
    textContent: attributes.text || '', visible,
    getAttribute: (name) => attributes[name] || null,
    getBoundingClientRect: () => ({ left: rect.x, top: rect.y, ...rect }),
  };
}

function nativeView(mode, rect, visible = true) {
  return element('WEBVIEW', {
    src: WEBVIEW_SOURCE + '/Creator/app.asar/builtin/scene/dist/script/3d/preload/web/' + mode + '.js',
  }, rect, visible);
}

async function bounds(panel, nodes) {
  const window = { webContents: { executeJavaScript: async (source) => {
    const result = runInNewContext(source, {
      URL,
      document: { querySelectorAll: () => nodes },
      window: { getComputedStyle: (node) => ({ display: node.visible ? 'block' : 'none', visibility: 'visible' }) },
    });
    return result && JSON.parse(JSON.stringify(result));
  } } };
  return getPanelBounds(window, panel);
}

test('Game View cropping selects the native preview WebView instead of its toolbar', async () => {
  const rect = { x: 369.5, y: 163.6953125, width: 640, height: 360 };
  const toolbar = element('DIV', { id: 'game-view-toolbar', text: 'game' }, { x: 313, y: 65, width: 753, height: 29 });
  const preview = nativeView('preview', rect);
  const panel = element('PANEL-FRAME', { name: 'scene' }, { x: 313, y: 65, width: 753, height: 528 });
  panel.shadowRoot = { querySelectorAll: () => [toolbar, preview] };
  const result = await bounds('game', [panel]);
  assert.deepEqual({ x: result.x, y: result.y, width: result.width, height: result.height }, rect);
  assert.equal(result.elementTag, 'WEBVIEW');
});

const windowsPreviewPath = String.raw`C:\Program Files\CocosCreator\resources\app.asar\builtin\scene\dist\script\3d\preload\web\preview.js`;
for (const [label, scriptPath] of [
  ['Windows', windowsPreviewPath],
  ['URL-encoded Windows', encodeURIComponent(windowsPreviewPath)],
]) {
  test(`Game View cropping accepts a ${label} preload path`, async () => {
    const rect = { x: 313, y: 95, width: 640, height: 360 };
    const hierarchy = element('DIV', { text: 'GameManager' }, { x: 0, y: 65, width: 312, height: 560 });
    const preview = element('WEBVIEW', { src: WEBVIEW_SOURCE + scriptPath }, rect);
    const result = await bounds('game', [hierarchy, preview]);
    assert.deepEqual({ x: result.x, y: result.y, width: result.width, height: result.height }, rect);
    assert.equal(result.text, 'native-game-viewport');
  });
}

test('Scene cropping chooses the edit viewport and excludes hidden or preview WebViews', async () => {
  const rect = { x: 313, y: 95, width: 753, height: 498 };
  const result = await bounds('scene', [
    nativeView('preview', { x: 369, y: 164, width: 640, height: 360 }),
    nativeView('preload', { x: 0, y: 0, width: 800, height: 600 }, false),
    nativeView('preload', rect),
  ]);
  assert.deepEqual({ x: result.x, y: result.y, width: result.width, height: result.height }, rect);
});

test('ambiguous native viewports reject rather than guessing a render surface', async () => {
  const rect = { x: 0, y: 0, width: 640, height: 360 };
  await assert.rejects(bounds('game', [nativeView('preview', rect), nativeView('preview', rect)]), /Multiple visible native/);
});

test('a hidden native Game View cannot fall back to its visible toolbar', async () => {
  const rect = { x: 30, y: 50, width: 640, height: 360 };
  const toolbar = element('DIV', { id: 'game-view-toolbar' }, { x: 30, y: 20, width: 640, height: 29 });
  await assert.rejects(bounds('game', [toolbar, nativeView('preview', rect, false)]), /not visible or ready/);
});

test('an inactive Game View cannot borrow the native Scene viewport', async () => {
  await assert.rejects(bounds('game', [nativeView('preload', { x: 30, y: 50, width: 640, height: 360 })]), /not visible or ready/);
});

test('a hidden Scene viewport cannot borrow the running Game View', async () => {
  const rect = { x: 30, y: 50, width: 640, height: 360 };
  await assert.rejects(bounds('scene', [nativeView('preload', rect, false), nativeView('preview', rect)]), /not visible or ready/);
});

test('non-native preview windows select the Cocos game canvas over larger editor elements', async () => {
  const rect = { x: 30, y: 20, width: 640, height: 360 };
  const hierarchy = element('DIV', { text: 'GameManager' }, { x: 0, y: 0, width: 900, height: 600 });
  const overlay = element('CANVAS', { id: 'gridCanvas' }, { x: 0, y: 0, width: 800, height: 600 });
  const canvas = element('CANVAS', { id: 'GameCanvas' }, rect);
  const result = await bounds('game', [hierarchy, overlay, canvas]);
  assert.deepEqual({ x: result.x, y: result.y, width: result.width, height: result.height }, rect);
});

test('game capture rejects a hierarchy match and unrelated canvas when the game viewport is missing', async () => {
  const hierarchy = element('DIV', { text: 'GameManager' }, { x: 1, y: 65, width: 310, height: 370 });
  const overlay = element('CANVAS', { id: 'gridCanvas' }, { x: 313, y: 95, width: 640, height: 360 });
  await assert.rejects(bounds('game', [hierarchy, overlay]), /Could not locate a visible Cocos Game View/);
});

test('panel discovery stops at its DOM budget instead of silently choosing a partial result', async () => {
  const node = element('DIV', {}, { x: 0, y: 0, width: 640, height: 360 });
  await assert.rejects(bounds('game', Array(15001).fill(node)), /DOM budget/);
});

'use strict';

function getElectron() {
  try {
    return require('electron');
  } catch (error) {
    throw new Error(`Electron APIs are unavailable: ${error.message}`);
  }
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function getAllWindows() {
  const electron = getElectron();
  const BrowserWindow = electron.BrowserWindow;
  if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') {
    throw new Error('Electron BrowserWindow API is unavailable.');
  }

  return BrowserWindow.getAllWindows().filter((window) => window && !window.isDestroyed());
}

function inferWindowKind(title) {
  const normalized = normalizeText(title);
  if (normalized.includes('simulator')) {
    return 'simulator';
  }
  if (normalized.includes('preview')) {
    return 'preview';
  }
  if (normalized.includes('cocos creator') || normalized.includes('cocos')) {
    return 'editor';
  }
  return 'unknown';
}

function listWindows() {
  return getAllWindows().map((window, index) => ({
    index,
    id: typeof window.id === 'number' ? window.id : index,
    title: typeof window.getTitle === 'function' ? window.getTitle() : '',
    bounds: typeof window.getBounds === 'function' ? window.getBounds() : null,
    visible: typeof window.isVisible === 'function' ? window.isVisible() : true,
    focused: typeof window.isFocused === 'function' ? window.isFocused() : false,
    kind: inferWindowKind(typeof window.getTitle === 'function' ? window.getTitle() : ''),
  }));
}

function pickWindow(options = {}) {
  const electron = getElectron();
  const BrowserWindow = electron.BrowserWindow;
  const windows = getAllWindows();
  if (!windows.length) {
    throw new Error('No Electron windows are available.');
  }

  const titleContains = normalizeText(options.titleContains);
  const windowKind = normalizeText(options.windowKind || 'focused');
  const focusedWindow = BrowserWindow.getFocusedWindow && BrowserWindow.getFocusedWindow();

  const titleMatches = (window) => {
    if (!titleContains) {
      return true;
    }
    return normalizeText(window.getTitle && window.getTitle()).includes(titleContains);
  };

  const kindMatches = (window) => {
    const kind = inferWindowKind(window.getTitle && window.getTitle());
    switch (windowKind) {
      case 'focused':
        return true;
      case 'editor':
      case 'simulator':
      case 'preview':
        return kind === windowKind;
      default:
        return true;
    }
  };

  const candidates = windows.filter((window) => kindMatches(window) && titleMatches(window));
  const target = (focusedWindow && candidates.includes(focusedWindow) && focusedWindow)
    || candidates.find((window) => typeof window.isVisible === 'function' ? window.isVisible() : true)
    || candidates[0]
    || windows[0];

  if (!target) {
    throw new Error(`No BrowserWindow matched windowKind='${windowKind}' titleContains='${titleContains}'.`);
  }

  return target;
}

async function executeJavaScript(window, script) {
  if (!window || !window.webContents || typeof window.webContents.executeJavaScript !== 'function') {
    throw new Error('Target window does not support webContents.executeJavaScript.');
  }
  return await window.webContents.executeJavaScript(script, true);
}

function buildPanelBoundsScript(panelName) {
  const panel = JSON.stringify(String(panelName || 'scene'));
  return `
    (() => {
      const panelName = ${panel}.toLowerCase();
      const results = [];

      const isVisible = (element) => {
        if (!element || typeof element.getBoundingClientRect !== 'function') return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 4 && rect.height > 4;
      };

      const textOf = (element) => {
        const parts = [
          element.getAttribute && element.getAttribute('name'),
          element.getAttribute && element.getAttribute('title'),
          element.id,
          element.className,
          element.textContent,
        ];
        return parts.filter(Boolean).join(' ').toLowerCase();
      };

      const collectAll = (root, bucket) => {
        if (!root) return;
        const nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (const node of nodes) {
          bucket.push(node);
          if (node.shadowRoot) {
            collectAll(node.shadowRoot, bucket);
          }
        }
      };

      const all = [];
      collectAll(document, all);

      const scoreElement = (element) => {
        const text = textOf(element);
        let score = 0;
        if (text.includes(panelName)) score += 100;
        if (text.includes('panel-frame')) score += 5;
        if (panelName === 'scene' && text.includes('game')) score -= 10;
        if (panelName === 'game' && text.includes('scene')) score -= 10;
        return score;
      };

      const largestChildRect = (element) => {
        const bucket = [element];
        if (element.shadowRoot) collectAll(element.shadowRoot, bucket);
        const children = bucket
          .filter((node) => isVisible(node))
          .map((node) => {
            const rect = node.getBoundingClientRect();
            const text = textOf(node);
            let score = rect.width * rect.height;
            if (node.tagName && node.tagName.toLowerCase() === 'canvas') score += 50000;
            if (text.includes(panelName)) score += 20000;
            if (text.includes('canvas') || text.includes('preview') || text.includes('viewport')) score += 10000;
            return { rect, score, tag: node.tagName || '', text };
          })
          .sort((a, b) => b.score - a.score);
        return children[0] || null;
      };

      const candidates = all
        .filter((element) => isVisible(element))
        .map((element) => {
          const panelScore = scoreElement(element);
          if (panelScore <= 0) return null;
          const rectInfo = largestChildRect(element) || { rect: element.getBoundingClientRect(), score: 0, tag: element.tagName || '', text: textOf(element) };
          return {
            score: panelScore + rectInfo.score,
            elementTag: element.tagName || '',
            rect: rectInfo.rect,
            text: textOf(element),
            innerTag: rectInfo.tag,
            innerText: rectInfo.text,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

      const fallbackCanvases = all
        .filter((element) => isVisible(element) && element.tagName && element.tagName.toLowerCase() === 'canvas')
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const text = textOf(element);
          let score = rect.width * rect.height;
          if (text.includes(panelName)) score += 50000;
          return { score, rect, elementTag: 'CANVAS', text, innerTag: 'CANVAS', innerText: text };
        })
        .sort((a, b) => b.score - a.score);

      const target = candidates[0] || fallbackCanvases[0];
      if (!target) return null;

      return {
        x: Math.max(0, Math.floor(target.rect.left)),
        y: Math.max(0, Math.floor(target.rect.top)),
        width: Math.max(1, Math.floor(target.rect.width)),
        height: Math.max(1, Math.floor(target.rect.height)),
        elementTag: target.elementTag,
        innerTag: target.innerTag,
        text: target.text,
        innerText: target.innerText,
      };
    })();
  `;
}

async function getPanelBounds(window, panelName) {
  const result = await executeJavaScript(window, buildPanelBoundsScript(panelName));
  if (!result || !result.width || !result.height) {
    throw new Error(`Could not locate a visible '${panelName}' panel in the target window.`);
  }
  return result;
}

function buildPanelFocusScript(panelName, offsetX, offsetY) {
  return `
    (() => {
      const panelName = ${JSON.stringify(String(panelName || 'scene').toLowerCase())};
      const offsetX = ${Number(offsetX || 0)};
      const offsetY = ${Number(offsetY || 0)};
      const isVisible = (element) => {
        if (!element || typeof element.getBoundingClientRect !== 'function') return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 4 && rect.height > 4;
      };
      const textOf = (element) => [
        element.getAttribute && element.getAttribute('name'),
        element.getAttribute && element.getAttribute('title'),
        element.id,
        element.className,
        element.textContent,
      ].filter(Boolean).join(' ').toLowerCase();
      const collectAll = (root, bucket) => {
        if (!root) return;
        const nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (const node of nodes) {
          bucket.push(node);
          if (node.shadowRoot) collectAll(node.shadowRoot, bucket);
        }
      };
      const all = [];
      collectAll(document, all);
      const target = all.find((element) => isVisible(element) && textOf(element).includes(panelName));
      const rect = target ? target.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const x = Math.floor(rect.left + rect.width / 2 + offsetX);
      const y = Math.floor(rect.top + rect.height / 2 + offsetY);
      const focusable = document.elementFromPoint(x, y) || target || document.body;
      if (focusable && typeof focusable.focus === 'function') focusable.focus();
      return { x, y };
    })();
  `;
}

async function getPanelPoint(window, panelName, offsetX, offsetY) {
  return await executeJavaScript(window, buildPanelFocusScript(panelName, offsetX, offsetY));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

module.exports = {
  executeJavaScript,
  getAllWindows,
  getPanelBounds,
  getPanelPoint,
  listWindows,
  pickWindow,
  sleep,
};

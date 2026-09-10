'use strict';

const electronTools = require('./electron-tools');

// This function is serialized into Creator's main renderer. Keep it self-contained.
async function previewToolbarCommand(command) {
  const toolbar = document.querySelector('#toolbar');
  const panels = toolbar ? Array.from(toolbar.querySelectorAll('ui-panel')) : [];
  const candidates = panels.filter((panel) => /\/builtin\/preview\/static\/toolbar\/middle\.js$/.test(
    String(panel.getAttribute('src') || '').replace(/\\/g, '/')
  ));
  const panel = candidates.length === 1 ? candidates[0] : null;
  const root = panel && (panel.shadowRoot || panel);
  const element = root && root.querySelector('.preview-info-wrap');
  const vm = element && element.__vue__;
  if (!vm || !vm.gameView || typeof vm.gameView.isPlay !== 'boolean'
    || typeof vm.gameView.isPaused !== 'boolean'
    || !['play', 'changePlatform', 'gameViewPause'].every((key) => typeof vm[key] === 'function')) {
    throw new Error('Compatible Cocos Creator preview toolbar is unavailable. Open the main editor window and retry; Game View cannot be controlled safely without its toolbar.');
  }
  if (!['state', 'start', 'set-mode', 'pause', 'resume'].includes(command.action)
    || (command.action === 'set-mode' && !['browser', 'gameView', 'simulator'].includes(command.mode))) {
    throw new Error('Unsupported preview toolbar command.');
  }

  const lock = Symbol.for('funplay-cocos-mcp.preview-operation');
  const busy = () => Boolean(vm[lock] || vm.isPlaying || vm.isLoading || vm.gameView.isStep);
  const readPreview = async () => {
    // Creator 3.8 returns undefined/null (depending on IPC context) when there
    // is no preview, otherwise the PreviewPlay manager's boolean pause state
    // (not the edit-scene director).
    const paused = await Editor.Message.request('scene', 'editor-preview-call-method', 'isPause');
    if (paused != null && typeof paused !== 'boolean') {
      throw new Error('Cocos Creator returned an unsupported Game View preview state.');
    }
    return { running: typeof paused === 'boolean', paused: paused === true };
  };
  const snapshot = (state) => ({
    scope: 'gameView',
    source: 'scene.editor-preview-call-method',
    mode: vm.currPlatform,
    ...state,
    busy: busy(),
    toolbarSynchronized: vm.gameView.isPlay === state.running
      && vm.gameView.isPaused === state.paused
      && (!state.running || vm.currPlatform === 'gameView'),
  });
  if (command.action === 'state') return snapshot(await readPreview());
  if (busy()) throw new Error('Cocos Creator preview toolbar is busy. Wait for the current preview operation to finish and retry.');

  vm[lock] = true;
  try {
    const previousMode = vm.currPlatform;
    const before = await readPreview();
    if (['pause', 'resume'].includes(command.action) && !before.running) {
      throw new Error('Game View preview is not running. Start run_project_preview with mode="gameView" first; browser and simulator previews are not controlled by this tool.');
    }

    const changeMode = async (mode) => {
      await vm.changePlatform(mode);
      // Creator's changePlatform starts this write without awaiting it. Wait
      // for persistence as well so subsequent MCP calls see the same mode.
      await Editor.Profile.setConfig('preview', 'preview.current.platform', mode, 'local');
      if (vm.currPlatform !== mode) throw new Error(`Cocos Creator did not select preview mode '${mode}'.`);
    };

    // Repair previews started by older MCP versions/direct scene messages.
    // Normal starts and pause changes below always use the native toolbar.
    if (before.running && vm.currPlatform !== 'gameView') await changeMode('gameView');
    vm.gameView.isPlay = before.running;
    vm.gameView.isPaused = before.paused;

    if (command.action === 'set-mode') {
      if (before.running && command.mode !== 'gameView') {
        await vm.play();
        if ((await readPreview()).running) {
          throw new Error('Cocos Creator rejected the Game View stop request; preview mode was not changed.');
        }
        vm.gameView.isPlay = false;
        vm.gameView.isPaused = false;
      }
      await changeMode(command.mode);
    } else if (command.action === 'start') {
      if (vm.currPlatform !== 'gameView') await changeMode('gameView');
      // play() is a toggle; never invoke it for an already running preview.
      if (!before.running) await vm.play();
    } else {
      const paused = command.action === 'pause';
      // gameViewPause() toggles the preview manager and its toolbar together.
      if (before.paused !== paused) await vm.gameViewPause();
    }

    const after = await readPreview();
    if (command.action === 'start' && !after.running) {
      throw new Error('Cocos Creator rejected the Game View start request.');
    }
    if (['pause', 'resume'].includes(command.action)
      && (!after.running || after.paused !== (command.action === 'pause'))) {
      throw new Error(`Cocos Creator did not ${command.action} the Game View preview.`);
    }
    const result = snapshot(after);
    if (!result.toolbarSynchronized) {
      throw new Error('Game View preview and toolbar state changed during the operation. Query get_runtime_state and retry.');
    }
    return {
      ...result,
      busy: Boolean(vm.isPlaying || vm.isLoading || vm.gameView.isStep),
      changed: previousMode !== vm.currPlatform || before.running !== after.running || before.paused !== after.paused,
    };
  } finally {
    delete vm[lock];
  }
}

function buildPreviewToolbarScript(command) {
  return `(${previewToolbarCommand.toString()})(${JSON.stringify(command)})`;
}

async function controlPreviewToolbar(command) {
  // Never fall back to the focused window: it may be a preview, inspector,
  // another panel, or DevTools rather than the project's main toolbar.
  const windows = electronTools.getAllWindows().filter((window) => {
    const url = window.webContents && typeof window.webContents.getURL === 'function'
      ? window.webContents.getURL() : '';
    return /^file:\/\/.*\/windows\/main\.html(?:[?#]|$)/i.test(url);
  });
  if (windows.length !== 1) {
    throw new Error('A unique Cocos Creator main editor window is required to control Game View preview.');
  }
  return await electronTools.executeJavaScript(windows[0], buildPreviewToolbarScript(command));
}

module.exports = { buildPreviewToolbarScript, controlPreviewToolbar };

'use strict';

const PREVIEW_PROFILE_PACKAGE = 'preview';
const PREVIEW_PROFILE_KEY = 'preview.current.platform';
const PREVIEW_PROFILE_SCOPE = 'local';
const PREVIEW_MODES = Object.freeze(['browser', 'gameView', 'simulator']);
const PREVIEW_MODE_DETAILS = Object.freeze({
  browser: Object.freeze({
    mode: 'browser',
    label: 'Browser Preview',
    description: 'Run the scene in the system browser and expose the preview URL.',
    hasUrl: true,
  }),
  gameView: Object.freeze({
    mode: 'gameView',
    label: 'Editor Preview',
    description: 'Run the scene inside the Cocos Creator Game View.',
    hasUrl: false,
  }),
  simulator: Object.freeze({
    mode: 'simulator',
    label: 'Simulator Preview',
    description: 'Run the scene in the Cocos native simulator.',
    hasUrl: false,
  }),
});

const PREVIEW_MODE_ALIASES = Object.freeze({
  browser: 'browser',
  web: 'browser',
  'browser-preview': 'browser',
  gameview: 'gameView',
  'game-view': 'gameView',
  editor: 'gameView',
  'editor-preview': 'gameView',
  simulator: 'simulator',
  native: 'simulator',
  'simulator-preview': 'simulator',
});

function hasEditorMessage() {
  return Boolean(global.Editor && Editor.Message);
}

function ensureEditorMessage() {
  if (!hasEditorMessage()) {
    throw new Error('Editor.Message is unavailable in this Cocos extension host.');
  }
}

async function requestEditorMessage(channel, method, ...args) {
  ensureEditorMessage();
  if (typeof Editor.Message.request !== 'function') {
    throw new Error('Editor.Message.request is unavailable in this Cocos extension host.');
  }
  return await Editor.Message.request(channel, method, ...args);
}

async function tryEditorRequests(candidates) {
  const attempts = [];
  for (const candidate of candidates) {
    const channel = candidate.channel;
    const method = candidate.method;
    const args = Array.isArray(candidate.args) ? candidate.args : [];
    try {
      const result = await requestEditorMessage(channel, method, ...args);
      return {
        ok: true,
        channel,
        method,
        result,
        attempts,
      };
    } catch (error) {
      attempts.push({ channel, method, error: error.message });
    }
  }

  const message = attempts.length
    ? attempts.map((attempt) => `${attempt.channel}.${attempt.method}: ${attempt.error}`).join('; ')
    : 'no editor message candidates were provided';
  const error = new Error(`No compatible Cocos editor message succeeded: ${message}`);
  error.attempts = attempts;
  throw error;
}

async function tryEditorRequestsStatus(candidates) {
  try {
    return await tryEditorRequests(candidates);
  } catch (error) {
    return {
      ok: false,
      available: false,
      attempts: error.attempts || [],
      error: error.message,
    };
  }
}

function normalizePreviewMode(value, options = {}) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw && options.allowEmpty === true) {
    return '';
  }

  const mode = PREVIEW_MODE_ALIASES[raw.toLowerCase()];
  if (!mode) {
    throw new Error(`Unsupported preview mode '${raw}'. Expected one of: ${PREVIEW_MODES.join(', ')}.`);
  }
  return mode;
}

function previewModeCatalog() {
  return PREVIEW_MODES.map((mode) => ({ ...PREVIEW_MODE_DETAILS[mode] }));
}

function ensurePreviewProfile() {
  if (
    !global.Editor ||
    !Editor.Profile ||
    typeof Editor.Profile.getConfig !== 'function' ||
    typeof Editor.Profile.setConfig !== 'function'
  ) {
    throw new Error('Editor.Profile.getConfig/setConfig is unavailable in this Cocos extension host.');
  }
}

async function queryPreviewUrl() {
  const result = await requestEditorMessage('preview', 'query-preview-url');
  return typeof result === 'string' ? result : '';
}

function normalizePreviewHostname(value) {
  return String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function isLoopbackPreviewHostname(value) {
  const hostname = normalizePreviewHostname(value);
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1') {
    return true;
  }

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return Boolean(ipv4 && ipv4.slice(1).every((part) => Number(part) <= 255) && Number(ipv4[1]) === 127);
}

function resolvePreviewUrls(value) {
  const reportedUrl = typeof value === 'string' ? value.trim() : '';
  const empty = {
    url: '',
    localUrl: '',
    networkUrl: '',
    reportedUrl: '',
    urlAvailable: false,
    urlWarning: '',
  };
  if (!reportedUrl) {
    return empty;
  }

  let parsed;
  try {
    parsed = new URL(reportedUrl);
  } catch (_error) {
    return {
      ...empty,
      url: reportedUrl,
      reportedUrl,
      urlAvailable: true,
      urlWarning: 'Cocos Creator returned a preview URL that is not an absolute HTTP(S) URL; the value was left unchanged.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ...empty,
      url: reportedUrl,
      reportedUrl,
      urlAvailable: true,
      urlWarning: `Cocos Creator returned an unsupported preview URL protocol '${parsed.protocol}'; the value was left unchanged.`,
    };
  }

  const loopback = isLoopbackPreviewHostname(parsed.hostname);
  const wildcard = ['0.0.0.0', '::'].includes(normalizePreviewHostname(parsed.hostname));
  let localUrl = reportedUrl;
  if (!loopback) {
    const local = new URL(parsed.href);
    local.hostname = 'localhost';
    localUrl = local.href;
  }

  return {
    url: localUrl,
    localUrl,
    networkUrl: loopback || wildcard ? '' : reportedUrl,
    reportedUrl,
    urlAvailable: true,
    urlWarning: '',
  };
}

async function getPreviewMode(options = {}) {
  ensurePreviewProfile();
  const storedValue = await Editor.Profile.getConfig(
    PREVIEW_PROFILE_PACKAGE,
    PREVIEW_PROFILE_KEY,
    PREVIEW_PROFILE_SCOPE
  );

  let mode = 'browser';
  let warning = '';
  try {
    mode = normalizePreviewMode(storedValue || 'browser');
  } catch (error) {
    warning = `${error.message} Falling back to browser.`;
  }

  let previewUrls = resolvePreviewUrls('');
  let urlError = '';
  if (mode === 'browser' && options.includeUrl !== false) {
    try {
      previewUrls = resolvePreviewUrls(await queryPreviewUrl());
    } catch (error) {
      urlError = error.message;
    }
  }

  return {
    mode,
    label: PREVIEW_MODE_DETAILS[mode].label,
    storedValue: storedValue == null ? '' : String(storedValue),
    supportedModes: previewModeCatalog(),
    ...previewUrls,
    warning,
    urlError,
  };
}

async function setPreviewMode(value) {
  ensurePreviewProfile();
  ensureEditorMessage();
  if (typeof Editor.Message.send !== 'function') {
    throw new Error('Editor.Message.send is unavailable in this Cocos extension host.');
  }

  const mode = normalizePreviewMode(value);
  const previous = await getPreviewMode({ includeUrl: false });
  let editorPreviewStop = null;
  let editorPreviewStopError = '';

  if (previous.mode === 'gameView' && mode !== 'gameView') {
    try {
      editorPreviewStop = await requestEditorMessage('scene', 'editor-preview-set-play', false);
    } catch (error) {
      editorPreviewStopError = error.message;
    }
  }

  await Editor.Profile.setConfig(
    PREVIEW_PROFILE_PACKAGE,
    PREVIEW_PROFILE_KEY,
    mode,
    PREVIEW_PROFILE_SCOPE
  );
  Editor.Message.send('preview', 'change-platform', mode);

  const current = await getPreviewMode({ includeUrl: false });
  if (current.mode !== mode) {
    throw new Error(`Cocos Creator did not persist preview mode '${mode}'. Current mode is '${current.mode}'.`);
  }

  return {
    changed: previous.mode !== mode,
    previousMode: previous.mode,
    mode,
    label: PREVIEW_MODE_DETAILS[mode].label,
    editorPreviewStop,
    editorPreviewStopError,
    supportedModes: previewModeCatalog(),
  };
}

async function runProjectPreview(options = {}) {
  const modeInput = options.mode == null ? options.platform : options.mode;
  if (options.mode != null && options.platform != null) {
    const mode = normalizePreviewMode(options.mode);
    const platform = normalizePreviewMode(options.platform);
    if (mode !== platform) {
      throw new Error(`Conflicting preview mode values: mode='${options.mode}', platform='${options.platform}'.`);
    }
  }

  let modeChange = null;
  let mode;
  if (modeInput == null || String(modeInput).trim() === '') {
    mode = (await getPreviewMode({ includeUrl: false })).mode;
  } else {
    mode = normalizePreviewMode(modeInput);
    modeChange = await setPreviewMode(mode);
  }

  const usedDeprecatedPlatform = options.mode == null && options.platform != null;
  if (mode === 'gameView') {
    const result = await requestEditorMessage('scene', 'editor-preview-set-play', true);
    if (result === false) {
      throw new Error('Cocos Creator rejected the editor preview start request.');
    }
    return {
      started: true,
      mode,
      label: PREVIEW_MODE_DETAILS[mode].label,
      method: 'scene.editor-preview-set-play',
      result,
      ...resolvePreviewUrls(''),
      urlError: '',
      modeChange,
      usedDeprecatedPlatform,
    };
  }

  const result = await requestEditorMessage('preview', 'open-terminal', undefined);
  let previewUrls = resolvePreviewUrls('');
  let urlError = '';
  if (mode === 'browser') {
    try {
      previewUrls = resolvePreviewUrls(await queryPreviewUrl());
    } catch (error) {
      urlError = error.message;
    }
  }

  return {
    started: true,
    mode,
    label: PREVIEW_MODE_DETAILS[mode].label,
    method: 'preview.open-terminal',
    result,
    ...previewUrls,
    urlError,
    modeChange,
    usedDeprecatedPlatform,
  };
}

async function openPanel(panelName) {
  const id = String(panelName || 'builder').trim();
  if (!id) {
    throw new Error('panelName is required.');
  }
  if (!global.Editor || !Editor.Panel || typeof Editor.Panel.open !== 'function') {
    throw new Error('Editor.Panel.open is unavailable in this Cocos extension host.');
  }
  const result = await Editor.Panel.open(id);
  return { opened: true, panelName: id, result };
}

function getEditorPreference(scope, key) {
  if (!global.Editor || !Editor.Profile) {
    throw new Error('Editor.Profile is unavailable in this Cocos extension host.');
  }
  const normalizedScope = String(scope || 'project').toLowerCase();
  const target = normalizedScope === 'global' ? Editor.Profile : Editor.Profile;
  const getters = normalizedScope === 'global'
    ? ['getConfig', 'getGlobal']
    : ['getProject', 'getConfig'];
  for (const getter of getters) {
    if (typeof target[getter] === 'function') {
      return target[getter](key);
    }
  }
  throw new Error('No compatible Editor.Profile getter is available.');
}

function setEditorPreference(scope, key, value) {
  if (!global.Editor || !Editor.Profile) {
    throw new Error('Editor.Profile is unavailable in this Cocos extension host.');
  }
  const normalizedScope = String(scope || 'project').toLowerCase();
  const target = Editor.Profile;
  const setters = normalizedScope === 'global'
    ? ['setConfig', 'setGlobal']
    : ['setProject', 'setConfig'];
  for (const setter of setters) {
    if (typeof target[setter] === 'function') {
      const result = target[setter](key, value);
      return { set: true, scope: normalizedScope, key, value, method: setter, result };
    }
  }
  throw new Error('No compatible Editor.Profile setter is available.');
}

function broadcastEditorMessage(options = {}) {
  ensureEditorMessage();
  const channel = String(options.channel || '').trim();
  const message = String(options.message || '').trim();
  if (!message) {
    throw new Error('message is required.');
  }
  const payload = options.payload === undefined ? {} : options.payload;
  if (channel && typeof Editor.Message.send === 'function') {
    const result = Editor.Message.send(channel, message, payload);
    return { sent: true, mode: 'send', channel, message, payload, result };
  }
  if (typeof Editor.Message.broadcast === 'function') {
    const result = Editor.Message.broadcast(message, payload);
    return { sent: true, mode: 'broadcast', message, payload, result };
  }
  throw new Error('Neither Editor.Message.send nor Editor.Message.broadcast is available.');
}

function createCocosProjectTools({ createSchema }) {
  return [
    {
      name: 'save_current_scene',
      profile: 'full',
      description: '[core] Save the currently open Cocos scene using available editor scene messages.',
      inputSchema: createSchema({}, []),
      handler: async () => {
        const result = await tryEditorRequests([
          { channel: 'scene', method: 'save-scene' },
          { channel: 'scene', method: 'save' },
        ]);
        return { saved: true, ...result };
      },
    },
    {
      name: 'open_build_panel',
      profile: 'full',
      description: '[core] Open the Cocos build panel, defaulting to the builder panel id.',
      inputSchema: createSchema(
        {
          panelName: { type: 'string', description: 'Panel id to open. Defaults to builder.' },
        },
        []
      ),
      handler: async (args) => openPanel(args.panelName || 'builder'),
    },
    {
      name: 'get_build_status',
      profile: 'core',
      description: '[specialist] Query Cocos build/preview status using known builder message variants.',
      inputSchema: createSchema({}, []),
      handler: async () => await tryEditorRequestsStatus([
        { channel: 'builder', method: 'query-build-status' },
        { channel: 'builder', method: 'get-build-status' },
        { channel: 'builder', method: 'query-build-tasks' },
      ]),
    },
    {
      name: 'get_preview_mode',
      profile: 'core',
      description: '[specialist] Query the active Cocos Creator preview mode. Browser results use a same-host loopback url/localUrl and preserve Creator\'s reported LAN address as networkUrl.',
      inputSchema: createSchema({}, []),
      handler: async () => await getPreviewMode(),
    },
    {
      name: 'set_preview_mode',
      profile: 'full',
      description: '[core] Switch Cocos Creator preview mode using the supported 3.8.x Preview profile and toolbar message.',
      inputSchema: createSchema(
        {
          mode: {
            type: 'string',
            enum: PREVIEW_MODES,
            description: 'Preview mode: browser, gameView (editor preview), or simulator.',
          },
        },
        ['mode']
      ),
      handler: async (args) => await setPreviewMode(args.mode),
    },
    {
      name: 'run_project_preview',
      profile: 'full',
      description: '[core] Start Cocos Creator 3.8.x preview in browser, editor Game View, or simulator mode. Browser results use a same-host loopback url/localUrl and preserve Creator\'s reported LAN address as networkUrl.',
      inputSchema: createSchema(
        {
          mode: {
            type: 'string',
            enum: PREVIEW_MODES,
            description: 'Preview mode: browser, gameView (editor preview), or simulator. Defaults to the current mode.',
          },
          platform: {
            type: 'string',
            enum: PREVIEW_MODES,
            description: 'Deprecated alias for mode. This selects preview mode, not a build target.',
          },
        },
        []
      ),
      handler: async (args) => await runProjectPreview(args),
    },
    {
      name: 'get_editor_preference',
      profile: 'full',
      description: '[core] Read a Cocos editor preference through Editor.Profile when available.',
      inputSchema: createSchema(
        {
          scope: { type: 'string', description: 'Preference scope: project or global. Defaults to project.' },
          key: { type: 'string', description: 'Preference key.' },
        },
        ['key']
      ),
      handler: async (args) => ({
        scope: args.scope || 'project',
        key: args.key,
        value: getEditorPreference(args.scope, args.key),
      }),
    },
    {
      name: 'set_editor_preference',
      profile: 'full',
      description: '[core] Write a Cocos editor preference through Editor.Profile when available.',
      inputSchema: createSchema(
        {
          scope: { type: 'string', description: 'Preference scope: project or global. Defaults to project.' },
          key: { type: 'string', description: 'Preference key.' },
          valueJson: { type: 'string', description: 'JSON encoded preference value.' },
        },
        ['key', 'valueJson']
      ),
      handler: async (args) => {
        let value;
        try {
          value = JSON.parse(args.valueJson);
        } catch (error) {
          throw new Error(`valueJson must be valid JSON: ${error.message}`);
        }
        return setEditorPreference(args.scope, args.key, value);
      },
    },
    {
      name: 'broadcast_editor_message',
      profile: 'full',
      description: '[core] Send or broadcast a Cocos editor message for advanced editor automation.',
      inputSchema: createSchema(
        {
          channel: { type: 'string', description: 'Optional Editor.Message channel for send().' },
          message: { type: 'string', description: 'Message name to send or broadcast.' },
          payload: { type: 'object', description: 'Optional JSON payload.' },
        },
        ['message']
      ),
      handler: async (args) => broadcastEditorMessage(args),
    },
  ];
}

module.exports = {
  PREVIEW_MODES,
  broadcastEditorMessage,
  createCocosProjectTools,
  getEditorPreference,
  getPreviewMode,
  normalizePreviewMode,
  resolvePreviewUrls,
  runProjectPreview,
  setEditorPreference,
  setPreviewMode,
  tryEditorRequests,
  tryEditorRequestsStatus,
};

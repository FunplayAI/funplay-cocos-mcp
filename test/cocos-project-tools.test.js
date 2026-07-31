'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  broadcastEditorMessage,
  getEditorPreference,
  getPreviewMode,
  normalizePreviewMode,
  resolvePreviewUrls,
  runProjectPreview,
  setEditorPreference,
  setPreviewMode,
  tryEditorRequests,
  tryEditorRequestsStatus,
} = require('../lib/tools/cocos-project');

test('tryEditorRequests returns the first successful editor message candidate', async () => {
  const calls = [];
  global.Editor = {
    Message: {
      request: async (channel, method, payload) => {
        calls.push({ channel, method, payload });
        if (method === 'bad') {
          throw new Error('nope');
        }
        return { ok: true };
      },
    },
  };

  try {
    const result = await tryEditorRequests([
      { channel: 'scene', method: 'bad' },
      { channel: 'scene', method: 'save-scene', args: [{ force: true }] },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.method, 'save-scene');
    assert.equal(calls.length, 2);
  } finally {
    delete global.Editor;
  }
});

test('tryEditorRequestsStatus returns an unavailable payload instead of throwing', async () => {
  global.Editor = {
    Message: {
      request: async () => {
        throw new Error('missing');
      },
    },
  };

  try {
    const result = await tryEditorRequestsStatus([{ channel: 'builder', method: 'query-build-status' }]);
    assert.equal(result.ok, false);
    assert.equal(result.available, false);
    assert.equal(result.attempts.length, 1);
  } finally {
    delete global.Editor;
  }
});

test('preference helpers and broadcast use available Editor APIs', () => {
  const sent = [];
  const store = new Map();
  global.Editor = {
    Message: {
      send(channel, message, payload) {
        sent.push({ channel, message, payload });
      },
    },
    Profile: {
      getProject(key) {
        return store.get(key);
      },
      setProject(key, value) {
        store.set(key, value);
      },
    },
  };

  try {
    setEditorPreference('project', 'preview.port', 7456);
    assert.equal(getEditorPreference('project', 'preview.port'), 7456);

    const result = broadcastEditorMessage({ channel: 'scene', message: 'custom-event', payload: { ok: true } });
    assert.equal(result.sent, true);
    assert.deepEqual(sent[0], { channel: 'scene', message: 'custom-event', payload: { ok: true } });
  } finally {
    delete global.Editor;
  }
});

test('normalizePreviewMode accepts documented modes and compatibility aliases', () => {
  assert.equal(normalizePreviewMode('browser'), 'browser');
  assert.equal(normalizePreviewMode('gameView'), 'gameView');
  assert.equal(normalizePreviewMode('editor'), 'gameView');
  assert.equal(normalizePreviewMode('native'), 'simulator');
  assert.throws(() => normalizePreviewMode('windows'), /Unsupported preview mode/);
});

test('resolvePreviewUrls separates same-host and LAN browser preview addresses', () => {
  const result = resolvePreviewUrls('http://192.168.16.119:7456/preview/?scene=main#ready');

  assert.deepEqual(result, {
    url: 'http://localhost:7456/preview/?scene=main#ready',
    localUrl: 'http://localhost:7456/preview/?scene=main#ready',
    networkUrl: 'http://192.168.16.119:7456/preview/?scene=main#ready',
    reportedUrl: 'http://192.168.16.119:7456/preview/?scene=main#ready',
    urlAvailable: true,
    urlWarning: '',
  });
});

test('resolvePreviewUrls preserves loopback URLs and normalizes wildcard hosts', () => {
  const loopback = resolvePreviewUrls('http://127.20.30.40:7456/');
  assert.equal(loopback.url, 'http://127.20.30.40:7456/');
  assert.equal(loopback.localUrl, loopback.url);
  assert.equal(loopback.networkUrl, '');

  const ipv6 = resolvePreviewUrls('http://[::1]:7456/');
  assert.equal(ipv6.url, 'http://[::1]:7456/');
  assert.equal(ipv6.networkUrl, '');

  const wildcard = resolvePreviewUrls('http://0.0.0.0:7456/');
  assert.equal(wildcard.url, 'http://localhost:7456/');
  assert.equal(wildcard.localUrl, wildcard.url);
  assert.equal(wildcard.networkUrl, '');
});

test('resolvePreviewUrls leaves unsupported or malformed values unchanged with a warning', () => {
  for (const value of ['preview://192.168.1.10:7456/', 'not a URL']) {
    const result = resolvePreviewUrls(value);
    assert.equal(result.url, value);
    assert.equal(result.localUrl, '');
    assert.equal(result.networkUrl, '');
    assert.equal(result.reportedUrl, value);
    assert.equal(result.urlAvailable, true);
    assert.notEqual(result.urlWarning, '');
  }

  assert.deepEqual(resolvePreviewUrls(''), {
    url: '',
    localUrl: '',
    networkUrl: '',
    reportedUrl: '',
    urlAvailable: false,
    urlWarning: '',
  });
});

test('getPreviewMode reads the Creator 3.8 preview profile and separates LAN browser URLs', async () => {
  const profileCalls = [];
  const messageCalls = [];
  global.Editor = {
    Message: {
      request: async (...args) => {
        messageCalls.push(args);
        return 'http://192.168.16.119:7456/';
      },
    },
    Profile: {
      getConfig: async (...args) => {
        profileCalls.push(args);
        return 'browser';
      },
      setConfig: async () => {},
    },
  };

  try {
    const result = await getPreviewMode();

    assert.deepEqual(profileCalls, [['preview', 'preview.current.platform', 'local']]);
    assert.deepEqual(messageCalls, [['preview', 'query-preview-url']]);
    assert.equal(result.mode, 'browser');
    assert.equal(result.url, 'http://localhost:7456/');
    assert.equal(result.localUrl, 'http://localhost:7456/');
    assert.equal(result.networkUrl, 'http://192.168.16.119:7456/');
    assert.equal(result.reportedUrl, 'http://192.168.16.119:7456/');
    assert.equal(result.urlAvailable, true);
    assert.equal(result.urlWarning, '');
    assert.deepEqual(result.supportedModes.map((item) => item.mode), ['browser', 'gameView', 'simulator']);
  } finally {
    delete global.Editor;
  }
});

test('setPreviewMode stops Game View, persists the profile, and broadcasts the platform change', async () => {
  let currentMode = 'gameView';
  const profileWrites = [];
  const requests = [];
  const sends = [];
  global.Editor = {
    Message: {
      request: async (...args) => {
        requests.push(args);
        return true;
      },
      send: (...args) => {
        sends.push(args);
      },
    },
    Profile: {
      getConfig: async () => currentMode,
      setConfig: async (...args) => {
        profileWrites.push(args);
        currentMode = args[2];
      },
    },
  };

  try {
    const result = await setPreviewMode('browser');

    assert.deepEqual(requests, [['scene', 'editor-preview-set-play', false]]);
    assert.deepEqual(profileWrites, [['preview', 'preview.current.platform', 'browser', 'local']]);
    assert.deepEqual(sends, [['preview', 'change-platform', 'browser']]);
    assert.equal(result.previousMode, 'gameView');
    assert.equal(result.mode, 'browser');
    assert.equal(result.changed, true);
  } finally {
    delete global.Editor;
  }
});

test('runProjectPreview starts browser preview and returns local and network URLs', async () => {
  let currentMode = 'browser';
  const requests = [];
  global.Editor = {
    Message: {
      request: async (...args) => {
        requests.push(args);
        if (args[0] === 'preview' && args[1] === 'query-preview-url') {
          return 'http://192.168.16.119:7456/';
        }
        return true;
      },
      send: () => {},
    },
    Profile: {
      getConfig: async () => currentMode,
      setConfig: async (_packageName, _key, value) => {
        currentMode = value;
      },
    },
  };

  try {
    const result = await runProjectPreview({ mode: 'browser' });

    assert.deepEqual(requests, [
      ['preview', 'open-terminal', undefined],
      ['preview', 'query-preview-url'],
    ]);
    assert.equal(result.started, true);
    assert.equal(result.mode, 'browser');
    assert.equal(result.method, 'preview.open-terminal');
    assert.equal(result.url, 'http://localhost:7456/');
    assert.equal(result.localUrl, 'http://localhost:7456/');
    assert.equal(result.networkUrl, 'http://192.168.16.119:7456/');
    assert.equal(result.reportedUrl, 'http://192.168.16.119:7456/');
    assert.equal(result.urlAvailable, true);
    assert.equal(result.urlWarning, '');
  } finally {
    delete global.Editor;
  }
});

test('runProjectPreview starts editor preview and supports the deprecated platform alias', async () => {
  let currentMode = 'browser';
  const requests = [];
  global.Editor = {
    Message: {
      request: async (...args) => {
        requests.push(args);
        return true;
      },
      send: () => {},
    },
    Profile: {
      getConfig: async () => currentMode,
      setConfig: async (_packageName, _key, value) => {
        currentMode = value;
      },
    },
  };

  try {
    const result = await runProjectPreview({ platform: 'gameView' });

    assert.deepEqual(requests, [['scene', 'editor-preview-set-play', true]]);
    assert.equal(result.mode, 'gameView');
    assert.equal(result.method, 'scene.editor-preview-set-play');
    assert.equal(result.usedDeprecatedPlatform, true);
  } finally {
    delete global.Editor;
  }
});

test('runProjectPreview rejects conflicting mode and platform values', async () => {
  await assert.rejects(
    () => runProjectPreview({ mode: 'browser', platform: 'simulator' }),
    /Conflicting preview mode values/
  );
});

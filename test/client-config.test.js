'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  buildTargets,
  configureTarget,
  formatTargetPreview,
  getTargetStatuses,
  SERVER_NAME,
} = require('../lib/client-config');

const CONFIG = {
  host: '127.0.0.1',
  port: 8765,
};

const OPENCODE_CONFIG = {
  host: '127.0.0.1',
  port: 8123,
};

function createTargetOptions(t, env = {}) {
  const homePath = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-client-config-'));
  t.after(() => fs.rmSync(homePath, { recursive: true, force: true }));
  return {
    homePath,
    env,
    platform: 'linux',
  };
}

test('Qoder and Kimi Code targets use their official user-level MCP files', (t) => {
  const options = createTargetOptions(t);
  const targets = buildTargets(CONFIG, options);
  const qoder = targets.find((target) => target.id === 'qoder');
  const kimi = targets.find((target) => target.id === 'kimi');

  assert.deepEqual(qoder, {
    id: 'qoder',
    name: 'Qoder',
    configPath: path.join(options.homePath, '.qoder', 'settings.json'),
    rootKey: 'mcpServers',
    entry: {
      type: 'http',
      url: 'http://127.0.0.1:8765/',
    },
  });
  assert.deepEqual(kimi, {
    id: 'kimi',
    name: 'Kimi Code',
    configPath: path.join(options.homePath, '.kimi-code', 'mcp.json'),
    rootKey: 'mcpServers',
    entry: {
      url: 'http://127.0.0.1:8765/',
    },
  });
});

test('Qoder and Kimi Code targets honor their documented config directory overrides', (t) => {
  const baseOptions = createTargetOptions(t);
  const qoderDirectory = path.join(baseOptions.homePath, 'custom-qoder');
  const kimiDirectory = path.join(baseOptions.homePath, 'custom-kimi');
  const options = {
    ...baseOptions,
    env: {
      QODER_CONFIG_DIR: qoderDirectory,
      KIMI_CODE_HOME: kimiDirectory,
    },
  };
  const targets = buildTargets(CONFIG, options);

  assert.equal(
    targets.find((target) => target.id === 'qoder').configPath,
    path.join(qoderDirectory, 'settings.json')
  );
  assert.equal(
    targets.find((target) => target.id === 'kimi').configPath,
    path.join(kimiDirectory, 'mcp.json')
  );
});

test('Qoder one-click configuration preserves existing settings and servers', (t) => {
  const options = createTargetOptions(t);
  const configPath = path.join(options.homePath, '.qoder', 'settings.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    language: 'Chinese',
    mcpServers: {
      existing: {
        command: 'existing-server',
      },
    },
  }), 'utf8');

  const result = configureTarget(CONFIG, 'qoder', options);
  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  assert.equal(result.configPath, configPath);
  assert.equal(written.language, 'Chinese');
  assert.equal(written.mcpServers.existing.command, 'existing-server');
  assert.deepEqual(written.mcpServers.funplay_cocos, {
    type: 'http',
    url: 'http://127.0.0.1:8765/',
  });
  assert.equal(
    getTargetStatuses(CONFIG, options).find((target) => target.id === 'qoder').configured,
    true
  );
  assert.equal(
    getTargetStatuses({ ...CONFIG, port: 9000 }, options)
      .find((target) => target.id === 'qoder').configured,
    false
  );
});

test('Kimi Code one-click configuration creates a user-level mcp.json', (t) => {
  const options = createTargetOptions(t);
  const result = configureTarget(CONFIG, 'kimi', options);
  const written = JSON.parse(fs.readFileSync(result.configPath, 'utf8'));

  assert.equal(result.configPath, path.join(options.homePath, '.kimi-code', 'mcp.json'));
  assert.deepEqual(written, {
    mcpServers: {
      funplay_cocos: {
        url: 'http://127.0.0.1:8765/',
      },
    },
  });
  assert.equal(
    getTargetStatuses(CONFIG, options).find((target) => target.id === 'kimi').configured,
    true
  );
});

test('OpenCode exposes a remote MCP target with its official root key', (t) => {
  const options = createTargetOptions(t);
  const targets = buildTargets(OPENCODE_CONFIG, options);
  const opencode = targets.find((target) => target.id === 'opencode');

  assert.ok(opencode, 'buildTargets must expose an OpenCode target');
  assert.equal(opencode.name, 'OpenCode');
  assert.equal(opencode.rootKey, 'mcp');
  assert.deepEqual(opencode.entry, {
    type: 'remote',
    url: 'http://127.0.0.1:8123/',
  });
});

test('OpenCode honors XDG_CONFIG_HOME for its opencode.json path', (t) => {
  const baseOptions = createTargetOptions(t);
  const xdgConfigHome = path.join(baseOptions.homePath, 'custom-xdg');
  const options = {
    ...baseOptions,
    env: {
      XDG_CONFIG_HOME: xdgConfigHome,
    },
  };
  const targets = buildTargets(OPENCODE_CONFIG, options);
  const opencode = targets.find((target) => target.id === 'opencode');

  assert.ok(opencode, 'buildTargets must expose an OpenCode target');
  assert.equal(opencode.configPath, path.join(xdgConfigHome, 'opencode', 'opencode.json'));
});

test('OpenCode uses ~/.config/opencode when XDG_CONFIG_HOME is unset', (t) => {
  const options = createTargetOptions(t);
  const targets = buildTargets(OPENCODE_CONFIG, options);
  const opencode = targets.find((target) => target.id === 'opencode');

  assert.ok(opencode, 'buildTargets must expose an OpenCode target');
  assert.equal(opencode.configPath, path.join(options.homePath, '.config', 'opencode', 'opencode.json'));
});

test('OpenCode prefers an existing opencode.jsonc over opencode.json', (t) => {
  const options = createTargetOptions(t);
  const dir = path.join(options.homePath, '.config', 'opencode');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'opencode.jsonc'), '{}\n', 'utf8');
  const targets = buildTargets(OPENCODE_CONFIG, options);
  const opencode = targets.find((target) => target.id === 'opencode');

  assert.ok(opencode, 'buildTargets must expose an OpenCode target');
  assert.equal(opencode.configPath, path.join(dir, 'opencode.jsonc'));
});

test('OpenCode configuration preview nests the remote entry under the mcp root', (t) => {
  const options = createTargetOptions(t);
  const targets = buildTargets(OPENCODE_CONFIG, options);
  const opencode = targets.find((target) => target.id === 'opencode');

  assert.ok(opencode, 'buildTargets must expose an OpenCode target');
  assert.deepEqual(JSON.parse(formatTargetPreview(opencode)), {
    mcp: {
      [SERVER_NAME]: {
        type: 'remote',
        url: 'http://127.0.0.1:8123/',
      },
    },
  });
});

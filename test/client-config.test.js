'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  buildTargets,
  configureTarget,
  getTargetStatuses,
} = require('../lib/client-config');

const CONFIG = {
  host: '127.0.0.1',
  port: 8765,
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

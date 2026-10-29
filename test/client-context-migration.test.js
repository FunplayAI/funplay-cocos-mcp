'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildTargets, configureTarget, getTargetStatuses } = require('../lib/client-config');
const { serverUrl } = require('../lib/project-context');

for (const id of ['claude_code', 'cursor', 'codex', 'vscode', 'trae', 'kiro', 'qoder', 'kimi', 'opencode', 'codebuddy', 'deepseek_harness']) {
  test(`${id}: owned old endpoints migrate explicitly and idempotently without being labeled configured`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-context-migration-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const config = { host: '127.0.0.1', port: 23456, projectPath: path.join(root, 'project') };
    fs.mkdirSync(config.projectPath);
    const options = { homePath: path.join(root, 'home'), env: {} };
    const initial = configureTarget(config, id, options);
    const legacy = serverUrl(config, config.port, '');
    const original = fs.readFileSync(initial.configPath, 'utf8').replaceAll(initial.url, legacy);
    fs.writeFileSync(initial.configPath, original);
    let state = getTargetStatuses(config, options).find((target) => target.id === id);
    assert.equal(state.configured, false);
    assert.equal(state.needsReconfigure, true);
    assert.equal(state.canReconfigure, false);
    assert.throws(() => configureTarget(config, id, options), /another endpoint/);
    assert.equal(fs.readFileSync(initial.configPath, 'utf8'), original);
    const owned = { ...config, clientConfigEntries: { [id]: { ...initial, url: legacy } } };
    state = getTargetStatuses(owned, options).find((target) => target.id === id);
    assert.equal(state.canReconfigure, true);
    configureTarget(owned, id, options);
    const updated = fs.readFileSync(initial.configPath, 'utf8');
    assert.ok(updated.includes(initial.url));
    assert.equal(getTargetStatuses(owned, options).find((target) => target.id === id).configured, true);
    configureTarget(owned, id, options);
    assert.equal(fs.readFileSync(initial.configPath, 'utf8'), updated);

    // An unreadable or ambiguous file is a visible review condition, never a
    // "not installed" invitation to overwrite it.
    fs.writeFileSync(initial.configPath, '{ malformed');
    state = getTargetStatuses(owned, options).find((target) => target.id === id);
    assert.ok(state.readError);
    assert.equal(state.configured, false);
  });
}

test('verified live-endpoint migration keeps custom headers/timeouts but never repoints foreign URLs', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-context-live-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = { host: '127.0.0.1', port: 23456, projectPath: root, migrateLegacy: true };
  const options = { homePath: path.join(root, 'home'), env: {} };
  const target = buildTargets(config, options).find((entry) => entry.id === 'codebuddy');
  const entry = { type: 'http', url: target.legacyUrl, headers: { 'X-Custom': 'keep' }, timeout: 9999 };
  fs.writeFileSync(target.configPath, JSON.stringify({ mcpServers: { [target.serverName]: entry, unrelated: { command: 'keep' } } }));
  configureTarget(config, target.id, options);
  const updated = JSON.parse(fs.readFileSync(target.configPath, 'utf8'));
  assert.deepEqual(updated.mcpServers[target.serverName], { ...entry, url: target.entry.url });
  assert.deepEqual(updated.mcpServers.unrelated, { command: 'keep' });
  updated.mcpServers[target.serverName].url = 'http://127.0.0.1:9999/';
  const original = JSON.stringify(updated);
  fs.writeFileSync(target.configPath, original);
  assert.throws(() => configureTarget(config, target.id, options), /another endpoint/);
  assert.equal(fs.readFileSync(target.configPath, 'utf8'), original);
});

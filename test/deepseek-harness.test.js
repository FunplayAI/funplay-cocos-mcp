'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { buildTargets, configureTarget, formatTargetPreview, getTargetStatuses } = require('../lib/client-config');
const { getSkillProjectPath, getSkillsDirectory } = require('../lib/skill-platforms');
const { getProjectSkillsState, updateBuiltInProjectSkill } = require('../lib/project-skills');
const { serverUrl } = require('../lib/project-context');

const CLIENT = 'deepseek_harness';

function fixture(t, name = 'cocos project') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-dsh-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectPath = path.join(root, name);
  fs.mkdirSync(projectPath, { recursive: true });
  const options = { homePath: path.join(root, 'home'), env: { DSH_HOME: path.join(root, 'custom-dsh-home') }, platform: process.platform };
  const config = { host: '127.0.0.1', port: 23456, projectPath };
  const target = buildTargets(config, options).find((item) => item.id === CLIENT);
  return { root, config, options, target };
}

function status(config, options) {
  return getTargetStatuses(config, options).find((item) => item.id === CLIENT);
}

test('DSH generates an explicit project overlay in official Cordis format, not a global mcp.json', (t) => {
  const { root, config, options, target } = fixture(t);
  fs.mkdirSync(path.join(root, '.git'));
  const preview = [{ insert: [{ id: target.serverName, name: '@deepseek-ai/dsh-mcp-client', config: {
    serverName: target.serverName, transport: 'streamable-http', url: serverUrl(config),
  } }] }];
  assert.equal(target.configPath, path.join(config.projectPath, '.dsh', 'funplay-cocos-mcp.patch.json'));
  assert.deepEqual(JSON.parse(formatTargetPreview(target)), preview);
  assert.match(target.serverName, /^[A-Za-z0-9_-]{1,32}$/);
  assert.equal(status(config, options).configured, false);
  const result = configureTarget(config, CLIENT, options);
  assert.deepEqual(JSON.parse(fs.readFileSync(target.configPath, 'utf8')), preview);
  assert.equal(status(config, options).configured, true);
  assert.equal(status(config, options).launchCommand, result.launchCommand);
  assert.match(result.launchCommand, /^dsh web --patch /);
  assert.ok(result.launchCommand.includes(target.configPath));
  assert.match(result.restartHint, /not loaded automatically/);
  for (const untouched of [options.homePath, options.env.DSH_HOME, path.join(root, '.dsh'), path.join(config.projectPath, '.mcp.json')]) {
    assert.equal(fs.existsSync(untouched), false);
  }
});

test('DSH requires project context and never writes relative to the extension process cwd', (t) => {
  const { options } = fixture(t);
  const config = { host: '127.0.0.1', port: 23456 };
  assert.equal(buildTargets(config, options).some((item) => item.id === CLIENT), false);
  assert.throws(() => configureTarget(config, CLIENT, options), /Unknown MCP client target/);
  assert.equal(fs.existsSync(options.homePath), false);
});

test('DSH preserves custom client options, permissions, and idempotence when updating an owned endpoint', (t) => {
  const { config, options, target } = fixture(t);
  const first = configureTarget(config, CLIENT, options);
  const patch = JSON.parse(fs.readFileSync(target.configPath, 'utf8'));
  patch[0].insert[0].config.headers = { 'X-Project': 'keep' };
  patch[0].insert[0].config.toolCallTimeoutMs = 90000;
  fs.writeFileSync(target.configPath, JSON.stringify(patch, null, 2) + '\n');
  fs.chmodSync(target.configPath, 0o640);
  const before = fs.readFileSync(target.configPath, 'utf8');
  configureTarget(config, CLIENT, options);
  assert.equal(fs.readFileSync(target.configPath, 'utf8'), before);
  const updated = { ...config, port: 24567, clientConfigEntries: { [CLIENT]: first } };
  configureTarget(updated, CLIENT, options);
  const entry = JSON.parse(fs.readFileSync(target.configPath, 'utf8'))[0].insert[0];
  assert.deepEqual(entry.config, { ...target.entry, url: serverUrl(updated), headers: { 'X-Project': 'keep' }, toolCallTimeoutMs: 90000 });
  if (process.platform !== 'win32') assert.equal(fs.statSync(target.configPath).mode & 0o777, 0o640);
  assert.equal(status(config, options).configured, false);
  assert.equal(status(updated, options).configured, true);
});

test('DSH rejects malformed, duplicate, unrelated, disabled and non-JSON overlays without changing them', (t) => {
  const { config, options, target } = fixture(t);
  configureTarget(config, CLIENT, options);
  const valid = JSON.parse(fs.readFileSync(target.configPath, 'utf8'));
  const entry = valid[0].insert[0];
  const cases = ['', '[]', '{}', '[{"insert":', '// not YAML\n[]', '- insert: []\n', '[{"insert":[],"insert":[]}]',
    JSON.stringify([{ insert: [entry, entry] }]),
    JSON.stringify([{ insert: [entry], id: 'another-target' }]),
    JSON.stringify([{ insert: [{ ...entry, id: 'unrelated' }] }]),
    JSON.stringify([{ insert: [{ ...entry, name: 'other-plugin' }] }]),
    JSON.stringify([{ insert: [{ ...entry, disabled: true }] }]),
    JSON.stringify([{ insert: [{ ...entry, config: { ...entry.config, transport: 'stdio' } }] }]),
    JSON.stringify([{ insert: [{ ...entry, config: { ...entry.config, serverName: 'other' } }] }]),
  ];
  for (const original of cases) {
    fs.writeFileSync(target.configPath, original);
    assert.equal(status(config, options).configured, false, original);
    assert.throws(() => configureTarget(config, CLIENT, options), undefined, original);
    assert.equal(fs.readFileSync(target.configPath, 'utf8'), original);
  }
});

test('DSH cannot overwrite a manually repointed entry or configure a temporary fallback port', (t) => {
  const { config, options, target } = fixture(t);
  configureTarget(config, CLIENT, options);
  const original = fs.readFileSync(target.configPath, 'utf8').replace('23456', '29999');
  fs.writeFileSync(target.configPath, original);
  assert.throws(() => configureTarget(config, CLIENT, options), /another endpoint/);
  assert.throws(() => configureTarget({ ...config, stablePort: 8765 }, CLIENT, options), /fallback/);
  assert.equal(fs.readFileSync(target.configPath, 'utf8'), original);
});

test('DSH launch hints safely quote POSIX paths containing spaces, quotes, dollar signs and backticks', { skip: process.platform === 'win32' }, (t) => {
  const { target } = fixture(t, "game's $variables `command` project");
  // Inspect the shell's argv, never execute dsh or interpolate the project name.
  const actual = execFileSync('/bin/sh', ['-c', `set -- ${target.launchCommand}; printf '%s' "$4"`], { encoding: 'utf8' });
  assert.equal(actual, target.configPath);
});

test('DSH launch hints quote apostrophes for Windows PowerShell', (t) => {
  const { config, options } = fixture(t, "game's project");
  const target = buildTargets(config, { ...options, platform: 'win32' }).find((item) => item.id === CLIENT);
  assert.equal(target.launchCommand, `dsh web --patch '${target.configPath.replace(/'/g, "''")}'`);
});

for (const gitMarker of ['directory', 'worktree-file', 'none']) {
  test(`DSH Skills follow the official nearest-Git-root rule (${gitMarker})`, (t) => {
    const { root, config } = fixture(t);
    if (gitMarker === 'directory') fs.mkdirSync(path.join(root, '.git'));
    if (gitMarker === 'worktree-file') fs.writeFileSync(path.join(root, '.git'), 'gitdir: elsewhere');
    const expected = gitMarker === 'none' ? config.projectPath : root;
    assert.equal(getSkillsDirectory({ clientId: CLIENT }), '.dsh/skills');
    assert.equal(getSkillProjectPath(config.projectPath, { clientId: CLIENT }), expected);
    const result = updateBuiltInProjectSkill(config.projectPath, { clientId: CLIENT });
    assert.ok(fs.existsSync(path.join(expected, result.write.path)));
    assert.equal(getProjectSkillsState(config.projectPath, { clientId: CLIENT }).projectPath, expected);
  });
}

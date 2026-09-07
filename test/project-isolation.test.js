'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadConfig, getProjectPort } = require('../lib/config');
const { getServerName, buildTargets, configureTarget, getTargetStatuses, formatTargetPreview } = require('../lib/client-config');
const { writeTextIfUnchanged } = require('../lib/atomic-file');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-isolation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectPath = path.join(root, 'project');
  fs.mkdirSync(projectPath);
  return { root, projectPath, options: { homePath: path.join(root, 'user'), env: {}, platform: 'linux' } };
}
const config = (projectPath, port = 23456) => ({ projectPath, host: '127.0.0.1', port });

test('new projects get deterministic ports; old files and explicit environment overrides keep their endpoints', (t) => {
  const { projectPath } = fixture(t);
  const initial = loadConfig({ projectPath, env: {} });
  assert.equal(initial.port, getProjectPort(projectPath));
  assert.ok(initial.port >= 20000 && initial.port < 30000);
  assert.equal(initial.portMode, 'project');
  assert.equal(loadConfig({ projectPath, env: {} }).port, initial.port);
  const file = path.join(projectPath, 'funplay-cocos-mcp.config.json');
  for (const [saved, port] of [[{}, 8765], [{ port: 9100 }, 9100], [{ portMode: 'project', port: 9100 }, initial.port]]) {
    fs.writeFileSync(file, JSON.stringify(saved));
    assert.equal(loadConfig({ projectPath, env: {} }).port, port);
  }
  const overridden = loadConfig({ projectPath, env: { COCOS_MCP_PORT: '9500' } });
  assert.equal(overridden.port, 9500);
  assert.equal(overridden.portMode, 'fixed');
});

test('project keys are stable, short, ASCII-safe and distinct for same-name project folders', (t) => {
  const { root } = fixture(t);
  const first = getServerName(config(path.join(root, 'one', '游戏')));
  const second = getServerName(config(path.join(root, 'two', '游戏')));
  assert.notEqual(first, second);
  assert.match(first, /^[a-z0-9-]+$/);
  assert.ok(getServerName(config(path.join(root, 'a'.repeat(100)))).length <= 25);
  assert.equal(first, getServerName(config(path.join(root, 'one', '游戏'))));
});

for (const targetId of ['cursor', 'qoder', 'kimi', 'codex']) {
  test(`${targetId} keeps two projects side by side and only updates an owned entry`, (t) => {
    const { root, projectPath, options } = fixture(t);
    const firstConfig = config(projectPath);
    const first = configureTarget(firstConfig, targetId, options);
    const secondConfig = config(path.join(root, 'other'), 24567);
    const second = configureTarget(secondConfig, targetId, options);
    assert.notEqual(first.serverName, second.serverName);
    const next = { ...firstConfig, port: 25555, clientConfigEntries: { [targetId]: first } };
    configureTarget(next, targetId, options);
    assert.equal(getTargetStatuses(next, options).find((entry) => entry.id === targetId).configured, true);
    assert.equal(getTargetStatuses(secondConfig, options).find((entry) => entry.id === targetId).configured, true);
    const before = fs.readFileSync(first.configPath, 'utf8');
    assert.throws(() => configureTarget({ ...firstConfig, port: 26666 }, targetId, options), /another endpoint/);
    assert.equal(fs.readFileSync(first.configPath, 'utf8'), before);
  });
}

test('Claude configuration uses the nearest Git root and preserves other projects and settings', (t) => {
  const { root, projectPath, options } = fixture(t);
  fs.mkdirSync(path.join(root, '.git'));
  const settings = path.join(options.homePath, '.claude.json');
  fs.mkdirSync(options.homePath, { recursive: true });
  fs.writeFileSync(settings, JSON.stringify({ theme: 'dark', projects: { '/other': { mcpServers: { manual: { command: 'keep' } } } } }));
  const result = configureTarget(config(projectPath), 'claude_code', options);
  const written = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal(written.projects[root].mcpServers[result.serverName].url, result.url);
  assert.equal(written.projects['/other'].mcpServers.manual.command, 'keep');
  assert.equal(written.theme, 'dark');
  assert.equal(written.mcpServers, undefined);
  const preview = JSON.parse(formatTargetPreview(buildTargets(config(projectPath), options)[0]));
  assert.equal(preview.projects[root].mcpServers[result.serverName].url, result.url);
});

test('migration only retires a verified, generated legacy entry at the active endpoint', (t) => {
  const { projectPath, options } = fixture(t);
  const file = path.join(options.homePath, '.cursor', 'mcp.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { funplay_cocos: { url: 'http://127.0.0.1:23456/' }, manual: { command: 'keep' } } }));
  configureTarget({ ...config(projectPath), migrateLegacy: true }, 'cursor', options);
  let written = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(written.mcpServers.funplay_cocos, undefined);
  assert.equal(written.mcpServers.manual.command, 'keep');
  written.mcpServers.funplay_cocos = { url: 'http://127.0.0.1:9999/' };
  fs.writeFileSync(file, JSON.stringify(written));
  configureTarget({ ...config(projectPath), migrateLegacy: true }, 'cursor', options);
  written = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(written.mcpServers.funplay_cocos.url, 'http://127.0.0.1:9999/');
});

test('malformed JSON, non-object containers and fallback endpoints never overwrite configuration', (t) => {
  const { projectPath, options } = fixture(t);
  const file = path.join(options.homePath, '.cursor', 'mcp.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const original of ['{ // comment\n}', '[]', '{"mcpServers":[]}']) {
    fs.writeFileSync(file, original);
    assert.throws(() => configureTarget(config(projectPath), 'cursor', options));
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  }
  assert.throws(() => configureTarget({ ...config(projectPath), stablePort: 8765 }, 'cursor', options), /fallback/);
});

test('atomic config writes reject stale content and preserve file mode', (t) => {
  const { root } = fixture(t);
  const file = path.join(root, 'config.json');
  fs.writeFileSync(file, 'changed', { mode: 0o600 });
  assert.throws(() => writeTextIfUnchanged(file, 'new', 'old'), /changed while editing/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'changed');
  writeTextIfUnchanged(file, 'new', 'changed');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.readdirSync(root).some((name) => name.endsWith('.tmp')), false);
});

test('copying a project config does not transfer ownership of the original client entry', (t) => {
  const { root, projectPath, options } = fixture(t);
  const original = configureTarget(config(projectPath), 'cursor', options);
  configureTarget({ ...config(path.join(root, 'copy'), 27777), clientConfigEntries: { cursor: original } }, 'cursor', options);
  assert.equal(getTargetStatuses(config(projectPath), options).find((entry) => entry.id === 'cursor').configured, true);
});

test('TOML updates preserve comments, custom options, nested tables and array-of-table boundaries', (t) => {
  const { projectPath, options } = fixture(t);
  const initial = configureTarget(config(projectPath), 'codex', options);
  const original = `# preferences\nmodel = "example"\n[ mcp_servers . "${initial.serverName}" ] # [a comment]\nurl = '${initial.url}'\nstartup_timeout_sec = 60\n[mcp_servers.${initial.serverName}.http_headers]\nCustom = "keep"\n[[skills.config]]\npath = "/some/skill"\nenabled = false\n`;
  fs.writeFileSync(initial.configPath, original);
  const updated = { ...config(projectPath, 28888), clientConfigEntries: { codex: initial } };
  configureTarget(updated, 'codex', options);
  const written = fs.readFileSync(initial.configPath, 'utf8');
  assert.match(written, /url = "http:\/\/127\.0\.0\.1:28888\/"/);
  assert.match(written, /startup_timeout_sec = 60/);
  assert.match(written, /Custom = "keep"/);
  assert.match(written, /\[\[skills.config\]\]\npath = "\/some\/skill"\nenabled = false/);
  assert.equal(written.match(/28888/g).length, 1);
});

test('legacy TOML entries with custom nested tables are not retired', (t) => {
  const { projectPath, options } = fixture(t);
  const target = buildTargets(config(projectPath), options).find((entry) => entry.id === 'codex');
  fs.mkdirSync(path.dirname(target.configPath), { recursive: true });
  const original = '[mcp_servers.funplay_cocos]\nurl = "http://127.0.0.1:23456/"\n[mcp_servers.funplay_cocos.http_headers]\nCustom = "keep"\n';
  fs.writeFileSync(target.configPath, original);
  configureTarget({ ...config(projectPath), migrateLegacy: true }, 'codex', options);
  assert.ok(fs.readFileSync(target.configPath, 'utf8').startsWith(original));
});

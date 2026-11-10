'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildTargets, configureTarget, formatTargetPreview, getTargetStatuses } = require('../lib/client-config');
const { parseJsonc } = require('../lib/jsonc');
const { SKILL_PLATFORMS, getSkillsDirectory } = require('../lib/skill-platforms');

function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-setup-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = { host: '127.0.0.1', port: 23456, projectPath: path.join(root, 'games', 'cocos') };
  fs.mkdirSync(config.projectPath, { recursive: true });
  const options = { homePath: path.join(root, 'home'), platform: 'linux', env: {}, ...overrides };
  const target = (id) => buildTargets(config, options).find((item) => item.id === id);
  const status = (id) => getTargetStatuses(config, options).find((item) => item.id === id);
  function write(id, content) {
    const file = target(id).configPath;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, { mode: 0o640 });
    return file;
  }
  return { root, config, options, target, status, write };
}

test('every one-click client also has an explicit Skills installation platform', (t) => {
  const { config, options } = fixture(t);
  assert.deepEqual(buildTargets(config, options).map((item) => item.id).sort(), SKILL_PLATFORMS.map((item) => item.id).sort());
  for (const [id, directory] of [['vscode', '.github/skills'], ['trae', '.trae/skills'], ['kiro', '.kiro/skills']]) {
    assert.equal(getSkillsDirectory({ clientId: id }), directory);
  }
});

test('Trae uses project MCP and Skills, leaves old global files alone, and requires project context', (t) => {
  const { config, options, target, status } = fixture(t);
  fs.mkdirSync(path.join(options.homePath, '.trae'), { recursive: true });
  const obsoleteFile = path.join(options.homePath, '.trae', 'mcp.json');
  fs.writeFileSync(obsoleteFile, '{"mcpServers":{"other":{"command":"keep"}}}');
  const original = fs.readFileSync(obsoleteFile, 'utf8');
  assert.equal(target('trae').configPath, path.join(config.projectPath, '.trae', 'mcp.json'));
  const result = configureTarget(config, 'trae', options);
  assert.equal(status('trae').configured, true);
  assert.equal(status('trae').setupHintKey, 'client.trae_project_hint');
  assert.equal(result.setupHintKey, 'client.trae_project_hint');
  assert.equal(fs.readFileSync(obsoleteFile, 'utf8'), original);
  const withoutProject = { ...config, projectPath: '' };
  assert.equal(buildTargets(withoutProject, options).some((item) => item.id === 'trae'), false);
  assert.throws(() => configureTarget(withoutProject, 'trae', options), /Unknown MCP client/);
});

for (const platform of ['darwin', 'linux', 'win32']) {
  test(`VS Code creates its canonical user-profile file on ${platform} before the directory exists`, (t) => {
    const { options, target, config, status } = fixture(t, { platform });
    const parts = platform === 'darwin' ? ['Library', 'Application Support', 'Code', 'User', 'mcp.json']
      : platform === 'win32' ? ['AppData', 'Roaming', 'Code', 'User', 'mcp.json'] : ['.config', 'Code', 'User', 'mcp.json'];
    const expected = path.join(options.homePath, ...parts);
    assert.equal(target('vscode').configPath, expected);
    assert.equal(fs.existsSync(path.dirname(expected)), false);
    configureTarget(config, 'vscode', options);
    assert.equal(status('vscode').configured, true);
    assert.equal(fs.existsSync(path.join(options.homePath, '.vscode')), false);
  });
}

test('VS Code respects Linux XDG, Windows APPDATA, and portable/appdata environment precedence', (t) => {
  const { root, config, options } = fixture(t);
  const resolve = (platform, env) => buildTargets(config, { ...options, platform, env }).find((item) => item.id === 'vscode').configPath;
  const custom = path.join(root, 'custom');
  assert.equal(resolve('linux', { XDG_CONFIG_HOME: custom }), path.join(custom, 'Code', 'User', 'mcp.json'));
  assert.equal(resolve('win32', { APPDATA: custom }), path.join(custom, 'Code', 'User', 'mcp.json'));
  assert.equal(resolve('darwin', { VSCODE_APPDATA: custom }), path.join(custom, 'Code', 'User', 'mcp.json'));
  assert.equal(resolve('linux', { VSCODE_PORTABLE: custom, VSCODE_APPDATA: '/ignored', XDG_CONFIG_HOME: '/ignored' }), path.join(custom, 'user-data', 'User', 'mcp.json'));
});

test('VS Code preserves JSONC comments, other servers, headers, newlines and file mode', (t) => {
  const { config, options, target, status, write } = fixture(t);
  const current = target('vscode');
  const original = '\uFEFF{\r\n\t// retained\r\n\t"servers": {\r\n\t\t"other": {"command":"keep",},\r\n\t},\r\n\t"inputs": [],\r\n}\r\n';
  const file = write('vscode', original);
  const record = configureTarget(config, 'vscode', options);
  const before = fs.readFileSync(file, 'utf8');
  assert.ok(before.startsWith('\uFEFF{\r\n\t// retained\r\n'));
  assert.ok(before.includes('"other": {"command":"keep",}'));
  assert.equal(status('vscode').configured, true);
  assert.equal(fs.statSync(file).mode & 0o777, 0o640);
  const customized = parseJsonc(before);
  customized.servers[current.serverName].headers = { 'X-Custom': 'keep' };
  fs.writeFileSync(file, JSON.stringify(customized));
  const changed = { ...config, port: 24567, clientConfigEntries: { vscode: record } };
  configureTarget(changed, 'vscode', options);
  assert.deepEqual(parseJsonc(fs.readFileSync(file, 'utf8')).servers[current.serverName].headers, { 'X-Custom': 'keep' });
});

test('Codex honors CODEX_HOME and accepts an empty MCP parent table with explicit children', (t) => {
  const { root, config, options } = fixture(t);
  options.env.CODEX_HOME = path.join(root, 'isolated-codex');
  const target = buildTargets(config, options).find((item) => item.id === 'codex');
  fs.mkdirSync(path.dirname(target.configPath), { recursive: true });
  const original = '# keep preferences\nmodel = "example"\n[mcp_servers] # parent\n# keep children\n[mcp_servers.other]\ncommand = "keep"\n';
  fs.writeFileSync(target.configPath, original);
  const first = configureTarget(config, 'codex', options);
  assert.equal(first.configPath, path.join(options.env.CODEX_HOME, 'config.toml'));
  assert.equal(fs.existsSync(path.join(options.homePath, '.codex')), false);
  const before = fs.readFileSync(target.configPath, 'utf8');
  assert.ok(before.startsWith(original));
  assert.equal(getTargetStatuses(config, options).find((item) => item.id === 'codex').configured, true);
  configureTarget(config, 'codex', options);
  assert.equal(fs.readFileSync(target.configPath, 'utf8'), before);
  const changed = { ...config, port: 24567, clientConfigEntries: { codex: first } };
  configureTarget(changed, 'codex', options);
  assert.equal(fs.readFileSync(target.configPath, 'utf8').replace(':24567/', ':23456/'), before);
});

test('Codex refuses duplicate parents and inline tables without rewriting them', (t) => {
  const { config, options, status, write } = fixture(t);
  for (const original of ['[mcp_servers]\n[mcp_servers]\n', '[mcp_servers]\nother = { url = "http://example.com" }\n']) {
    const file = write('codex', original);
    assert.equal(status('codex').configured, false);
    assert.ok(status('codex').readError);
    assert.throws(() => configureTarget(config, 'codex', options));
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  }
});

test('OpenCode preserves V2 nested servers, global timeout, custom remote options and comments', (t) => {
  const { config, options, target, status, write } = fixture(t);
  const current = target('opencode');
  const original = '// retained V2 configuration\n{"mcp":{"timeout":{"startup":10000},"servers":{"other":{"type":"local","command":["keep"]}}}}\n';
  const file = write('opencode', original);
  assert.deepEqual(JSON.parse(formatTargetPreview(current)), { mcp: { servers: { [current.serverName]: current.entry } } });
  const record = configureTarget(config, 'opencode', options);
  const saved = fs.readFileSync(file, 'utf8');
  assert.ok(saved.startsWith('// retained V2 configuration\n'));
  assert.equal(status('opencode').configured, true);
  const customized = parseJsonc(saved);
  assert.equal(customized.mcp[current.serverName], undefined);
  assert.deepEqual(customized.mcp.timeout, { startup: 10000 });
  assert.deepEqual(customized.mcp.servers.other, { type: 'local', command: ['keep'] });
  Object.assign(customized.mcp.servers[current.serverName], { headers: { 'X-Custom': 'keep' }, timeout: { execution: 60000 }, oauth: false });
  fs.writeFileSync(file, JSON.stringify(customized));
  const changed = { ...config, port: 24567, clientConfigEntries: { opencode: record } };
  configureTarget(changed, 'opencode', options);
  const updated = parseJsonc(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(updated.mcp.servers[current.serverName], { ...current.entry, url: record.url.replace(':23456/', ':24567/'), headers: { 'X-Custom': 'keep' }, timeout: { execution: 60000 }, oauth: false });
  const before = fs.readFileSync(file, 'utf8');
  configureTarget(changed, 'opencode', options);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('OpenCode recognizes V2 timeout-only config and retains V1 servers literally named servers/timeout', (t) => {
  const { config, options, target, write } = fixture(t);
  const current = target('opencode');
  const file = write('opencode', '{"mcp":{"timeout":{"catalog":9000}}}');
  configureTarget(config, 'opencode', options);
  assert.deepEqual(parseJsonc(fs.readFileSync(file, 'utf8')).mcp.servers[current.serverName], current.entry);
  for (const reservedName of ['servers', 'timeout']) {
    write('opencode', JSON.stringify({ mcp: { [reservedName]: { type: 'local', command: ['keep'] } } }));
    configureTarget(config, 'opencode', options);
    const root = parseJsonc(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(root.mcp[reservedName], { type: 'local', command: ['keep'] });
    assert.deepEqual(root.mcp[current.serverName], current.entry);
  }
});

test('OpenCode avoids duplicate registrations in mixed layouts and rejects ambiguous/invalid maps', (t) => {
  const { config, options, target, status, write } = fixture(t);
  const current = target('opencode');
  const mixed = { mcp: { servers: { other: { type: 'local', command: ['keep'] } }, [current.serverName]: current.entry } };
  const file = write('opencode', JSON.stringify(mixed));
  configureTarget(config, 'opencode', options);
  assert.deepEqual(parseJsonc(fs.readFileSync(file, 'utf8')), mixed);
  for (const root of [{ mcp: { servers: [] } }, { mcp: { servers: null } },
    { mcp: { servers: { [current.serverName]: current.entry }, [current.serverName]: current.entry } }]) {
    const original = JSON.stringify(root);
    write('opencode', original);
    assert.ok(status('opencode').readError);
    assert.throws(() => configureTarget(config, 'opencode', options));
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  }
});

for (const clientId of ['cursor', 'kimi', 'trae']) {
  test(`${clientId} does not mistake SSE for HTTP and repairs only the explicit transport`, (t) => {
    const { config, options, target, status, write } = fixture(t);
    const current = target(clientId);
    const file = write(clientId, JSON.stringify({ mcpServers: { [current.serverName]: { url: current.entry.url, type: 'sse', headers: { 'X-Custom': 'keep' } } } }));
    assert.equal(status(clientId).configured, false);
    configureTarget(config, clientId, options);
    assert.equal(status(clientId).configured, true);
    assert.deepEqual(parseJsonc(fs.readFileSync(file, 'utf8')).mcpServers[current.serverName], { ...current.entry, headers: { 'X-Custom': 'keep' } });
  });
}

test('strict JSON clients reject duplicate keys and comments rather than dropping settings', (t) => {
  const { config, options, target, status, write } = fixture(t);
  for (const current of buildTargets(config, options).filter((item) => !item.isToml && !item.isJsonc && !item.isDsh)) {
    for (const original of ['{"mcpServers":{},"mcpServers":{}}', '{"preferences":{"theme":1,"theme":2}}', '// comment\n{}', '{"mcpServers":{},}']) {
      const file = write(current.id, original);
      assert.equal(status(current.id).configured, false, current.id);
      assert.throws(() => configureTarget(config, current.id, options), undefined, current.id);
      assert.equal(fs.readFileSync(file, 'utf8'), original);
      assert.equal(target(current.id).configPath, file);
    }
  }
});

test('disabled and command-based registrations cannot report HTTP success or be overwritten', (t) => {
  const { config, options, target, status, write } = fixture(t);
  for (const clientId of ['cursor', 'vscode', 'kiro', 'kimi', 'trae', 'opencode', 'qoder', 'codebuddy']) {
    const current = target(clientId);
    for (const extra of [{ disabled: true }, { enabled: false }, { command: 'keep' }]) {
      const root = JSON.parse(formatTargetPreview(current));
      root[current.rootKey][current.serverName] = { ...current.entry, ...extra };
      const original = JSON.stringify(root);
      const file = write(clientId, original);
      assert.equal(status(clientId).configured, false, clientId);
      assert.ok(status(clientId).readError, clientId);
      assert.throws(() => configureTarget(config, clientId, options), undefined, clientId);
      assert.equal(fs.readFileSync(file, 'utf8'), original);
    }
  }
  const current = target('codex');
  for (const extra of ['enabled = false\n', 'command = "keep"\n']) {
    const original = `[mcp_servers.${current.serverName}]\nurl = "${current.url}"\n${extra}`;
    const file = write('codex', original);
    assert.equal(status('codex').configured, false);
    assert.ok(status('codex').readError);
    assert.throws(() => configureTarget(config, 'codex', options));
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  }
});

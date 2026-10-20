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
const { parseJsonc } = require('../lib/jsonc');

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

function createCodeBuddyFixture(t) {
  const options = createTargetOptions(t);
  const projectPath = path.join(options.homePath, 'games', 'cocos');
  fs.mkdirSync(projectPath, { recursive: true });
  const config = { ...CONFIG, projectPath };
  const target = buildTargets(config, options).find((item) => item.id === 'codebuddy');
  return { options, config, target };
}

test('CodeBuddy uses the Cocos project root, not CLI global storage or the enclosing Git root', (t) => {
  const { options, config, target } = createCodeBuddyFixture(t);
  fs.mkdirSync(path.join(options.homePath, '.git'));
  assert.equal(target.name, 'CodeBuddy IDE');
  assert.equal(target.configPath, path.join(config.projectPath, '.mcp.json'));
  assert.equal(target.rootKey, 'mcpServers');
  assert.equal(target.isJsonc, true);
  assert.deepEqual(target.entry, { type: 'http', url: 'http://127.0.0.1:8765/' });
  assert.deepEqual(JSON.parse(formatTargetPreview(target)), {
    mcpServers: { [target.serverName]: target.entry },
  });
  configureTarget(config, 'codebuddy', options);
  assert.equal(fs.existsSync(path.join(options.homePath, '.codebuddy')), false);
  assert.equal(fs.existsSync(path.join(options.homePath, '.mcp.json')), false);
  assert.equal(getTargetStatuses(config, options).find((item) => item.id === 'codebuddy').configured, true);
});

test('CodeBuddy requires project context instead of creating a config in the process working directory', (t) => {
  const options = createTargetOptions(t);
  assert.equal(buildTargets(CONFIG, options).some((item) => item.id === 'codebuddy'), false);
  assert.throws(() => configureTarget(CONFIG, 'codebuddy', options), /Unknown MCP client target/);
  assert.deepEqual(fs.readdirSync(options.homePath), []);
});

test('CodeBuddy setup preserves comments, other servers, custom fields and file mode', (t) => {
  const { options, config, target } = createCodeBuddyFixture(t);
  const original = '\uFEFF{\r\n\t// keep my project MCP servers\r\n\t"mcpServers": {\r\n\t\t"other": {"command":"keep","args":["--project",],},\r\n\t},\r\n\t"preferences": {"theme":"dark",},\r\n}\r\n';
  fs.writeFileSync(target.configPath, original, { mode: 0o640 });
  const first = configureTarget(config, 'codebuddy', options);
  const written = fs.readFileSync(target.configPath, 'utf8');
  assert.ok(written.startsWith('\uFEFF{\r\n\t// keep my project MCP servers\r\n'));
  assert.ok(written.includes('"other": {"command":"keep","args":["--project",],}'));
  assert.ok(written.includes('"preferences": {"theme":"dark",}'));
  assert.deepEqual(parseJsonc(written).mcpServers[target.serverName], target.entry);
  assert.equal(fs.statSync(target.configPath).mode & 0o777, 0o640);
  configureTarget(config, 'codebuddy', options);
  assert.equal(fs.readFileSync(target.configPath, 'utf8'), written, 'repeated setup must be byte-for-byte idempotent');

  const customized = parseJsonc(written);
  customized.mcpServers[target.serverName].headers = { 'X-Project': 'keep' };
  customized.mcpServers[target.serverName].timeout = 15000;
  fs.writeFileSync(target.configPath, JSON.stringify(customized));
  const updated = { ...config, port: 9000, clientConfigEntries: { codebuddy: first } };
  configureTarget(updated, 'codebuddy', options);
  assert.deepEqual(parseJsonc(fs.readFileSync(target.configPath, 'utf8')).mcpServers[target.serverName], {
    type: 'http', url: 'http://127.0.0.1:9000/', headers: { 'X-Project': 'keep' }, timeout: 15000,
  });
  assert.equal(getTargetStatuses(config, options).find((item) => item.id === 'codebuddy').configured, false);
  assert.equal(getTargetStatuses(updated, options).find((item) => item.id === 'codebuddy').configured, true);
});

test('CodeBuddy leaves malformed, ambiguous and non-object project configs unchanged', (t) => {
  const { options, config, target } = createCodeBuddyFixture(t);
  for (const original of ['{"mcpServers":', '[]', '{"mcpServers":[]}', '{"mcpServers":{},"mcpServers":{}}']) {
    fs.writeFileSync(target.configPath, original);
    assert.equal(getTargetStatuses(config, options).find((item) => item.id === 'codebuddy').configured, false);
    assert.throws(() => configureTarget(config, 'codebuddy', options));
    assert.equal(fs.readFileSync(target.configPath, 'utf8'), original);
  }
});

test('CodeBuddy does not confuse an SSE entry with the configured HTTP endpoint', (t) => {
  const { options, config, target } = createCodeBuddyFixture(t);
  fs.writeFileSync(target.configPath, JSON.stringify({ mcpServers: {
    [target.serverName]: { type: 'sse', url: target.entry.url },
  } }));
  assert.equal(getTargetStatuses(config, options).find((item) => item.id === 'codebuddy').configured, false);
  configureTarget(config, 'codebuddy', options);
  assert.equal(getTargetStatuses(config, options).find((item) => item.id === 'codebuddy').configured, true);
});

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

function writeOpenCodeConfig(options, text, extension = 'jsonc') {
  const file = path.join(options.homePath, '.config', 'opencode', `opencode.${extension}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 });
  return file;
}

for (const extension of ['jsonc', 'json']) {
  test(`OpenCode detects and updates commented .${extension} without changing unrelated text`, (t) => {
    const options = createTargetOptions(t);
    const original = '\uFEFF{\r\n\t// keep model and MCP preferences\r\n\t"model": "example/model",\r\n\t"mcp": {\r\n\t\t"funplay_cocos": {\r\n\t\t\t"type": "remote",\r\n\t\t\t"url": "http://127.0.0.1:8123/", // endpoint\r\n\t\t\t"timeout": 15000,\r\n\t\t},\r\n\t\t/* other server */ "other": {"type":"local","command":["keep",],},\r\n\t},\r\n}\r\n';
    const file = writeOpenCodeConfig(options, original, extension);
    assert.equal(getTargetStatuses(OPENCODE_CONFIG, options).find((target) => target.id === 'opencode').configured, true);
    const initial = configureTarget(OPENCODE_CONFIG, 'opencode', options);
    assert.equal(fs.readFileSync(file, 'utf8'), original, 'same configuration must be a byte-for-byte no-op');
    // A project-scoped ownership record permits changing only its own endpoint.
    const projectConfig = { ...OPENCODE_CONFIG, projectPath: path.join(options.homePath, 'project'), migrateLegacy: true };
    const owned = configureTarget(projectConfig, 'opencode', options);
    const before = fs.readFileSync(file, 'utf8');
    const updated = { ...projectConfig, port: 9123, clientConfigEntries: { opencode: owned } };
    configureTarget(updated, 'opencode', options);
    const written = fs.readFileSync(file, 'utf8');
    assert.equal(written.replace('http://127.0.0.1:9123/', owned.url), before);
    assert.ok(written.includes('"timeout": 15000,'), 'custom legacy entries are retained');
    assert.ok(written.includes('/* other server */ "other": {"type":"local","command":["keep",],}'));
    assert.equal(getTargetStatuses(updated, options).find((target) => target.id === 'opencode').configured, true);
    assert.equal(initial.configPath, file);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  });
}

test('OpenCode initializes missing, comment-only and empty configs and is idempotent', (t) => {
  const options = createTargetOptions(t);
  const created = configureTarget(OPENCODE_CONFIG, 'opencode', options);
  assert.equal(JSON.parse(fs.readFileSync(created.configPath, 'utf8')).mcp.funplay_cocos.type, 'remote');
  const jsonBefore = fs.readFileSync(created.configPath, 'utf8');
  for (const original of ['', '// keep this note', '/* keep this note */\n', '{}', '{"model":"keep"}', '{"mcp": {/* keep this note */}}']) {
    const file = writeOpenCodeConfig(options, original);
    const result = configureTarget(OPENCODE_CONFIG, 'opencode', options);
    assert.equal(result.configPath, file, 'prefer JSONC without overwriting the JSON file');
    const written = fs.readFileSync(file, 'utf8');
    if (original.includes('keep this note')) assert.ok(written.includes('keep this note'));
    if (original.includes('"model":"keep"')) assert.ok(written.includes('"model":"keep"'));
    assert.equal(getTargetStatuses(OPENCODE_CONFIG, options).find((target) => target.id === 'opencode').configured, true);
    configureTarget(OPENCODE_CONFIG, 'opencode', options);
    assert.equal(fs.readFileSync(file, 'utf8'), written);
    assert.equal(fs.readFileSync(created.configPath, 'utf8'), jsonBefore);
  }
});

test('OpenCode never overwrites malformed JSONC or conflicting entries', (t) => {
  const options = createTargetOptions(t);
  for (const original of [
    '{ /* unfinished', '{"mcp": }', '{"mcp":{},,}', '{,}', '[,]', '[]', 'null',
    '{"mcp":[]}', '{"mcp":{}, "mcp":{}}', '{"mcp":{}, "mc\\u0070":{}}',
    '{"mcp":{"funplay_cocos":{"type":"remote", "url":"http://127.0.0.1:9999/"}}}',
  ]) {
    const file = writeOpenCodeConfig(options, original);
    assert.equal(getTargetStatuses(OPENCODE_CONFIG, options).find((target) => target.id === 'opencode').configured, false);
    assert.throws(() => configureTarget(OPENCODE_CONFIG, 'opencode', options), undefined, original);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  }
});

test('OpenCode migrates only generated legacy entries and retains comments and other projects', (t) => {
  const options = createTargetOptions(t);
  const file = writeOpenCodeConfig(options, '{\n  "mcp": {\n    // existing integration\n    "other": {"type":"local","command":["keep"]},\n    "funplay_cocos": {"type":"remote","url":"http://127.0.0.1:8123/"},\n  },\n}\n');
  const config = { ...OPENCODE_CONFIG, projectPath: path.join(options.homePath, 'project'), migrateLegacy: true };
  const result = configureTarget(config, 'opencode', options);
  const written = fs.readFileSync(file, 'utf8');
  assert.equal(written.includes('"funplay_cocos"'), false);
  assert.ok(written.includes(`"${result.serverName}"`));
  assert.ok(written.includes('// existing integration\n    "other": {"type":"local","command":["keep"]}'));
  assert.equal(getTargetStatuses(config, options).find((target) => target.id === 'opencode').configured, true);
});

test('OpenCode config writes retain a symlink and the real file permissions', (t) => {
  const options = createTargetOptions(t);
  const actual = path.join(options.homePath, 'managed-config.jsonc');
  const file = path.join(options.homePath, '.config', 'opencode', 'opencode.jsonc');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(actual, '{ /* keep */ }', { mode: 0o600 });
  fs.symlinkSync(actual, file);
  configureTarget(OPENCODE_CONFIG, 'opencode', options);
  assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
  assert.equal(fs.statSync(actual).mode & 0o777, 0o600);
  assert.ok(fs.readFileSync(actual, 'utf8').includes('/* keep */'));
  assert.equal(getTargetStatuses(OPENCODE_CONFIG, options).find((target) => target.id === 'opencode').configured, true);
});

const WINDOWS_PROJECT_PATH = ['D:', 'repos', 'game'].join('\\');

function createWindowsTargetOptions(t) {
  return {
    ...createTargetOptions(t),
    platform: 'win32',
    resolveGitRoot(projectPath) {
      assert.equal(projectPath, WINDOWS_PROJECT_PATH);
      return WINDOWS_PROJECT_PATH;
    },
  };
}

test('Claude Code scope path uses forward slashes on Windows', (t) => {
  const options = createWindowsTargetOptions(t);
  const config = { ...CONFIG, projectPath: WINDOWS_PROJECT_PATH };
  const target = buildTargets(config, options).find((item) => item.id === 'claude_code');

  assert.equal(target.scopePath, 'D:/repos/game');
});

test('Claude Code scope path is left untouched on POSIX', (t) => {
  const options = { ...createTargetOptions(t), platform: 'linux' };
  const projectPath = path.join(options.homePath, 'game');
  const target = buildTargets({ ...CONFIG, projectPath }, options).find((item) => item.id === 'claude_code');

  // path.resolve is host-specific, so assert the separator is untranslated rather than a literal path.
  assert.equal(target.scopePath, path.resolve(projectPath));
});

test('Claude Code reuses a project key that differs only by drive-letter case', (t) => {
  const options = createWindowsTargetOptions(t);
  const configPath = path.join(options.homePath, '.claude.json');
  fs.writeFileSync(configPath, JSON.stringify({
    projects: { 'd:/repos/game': { mcpServers: { existing: { type: 'http', url: 'http://127.0.0.1:1/' } } } },
  }, null, 2));

  const config = { ...CONFIG, projectPath: WINDOWS_PROJECT_PATH };
  const result = configureTarget(config, 'claude_code', options);
  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  assert.deepEqual(Object.keys(written.projects), ['d:/repos/game']);
  assert.equal(written.projects['d:/repos/game'].mcpServers.existing.url, 'http://127.0.0.1:1/');
  assert.deepEqual(written.projects['d:/repos/game'].mcpServers[result.serverName], {
    type: 'http',
    url: 'http://127.0.0.1:8765/',
  });
});

test('Claude Code creates a forward-slash project key when none exists', (t) => {
  const options = createWindowsTargetOptions(t);
  const configPath = path.join(options.homePath, '.claude.json');
  const config = { ...CONFIG, projectPath: WINDOWS_PROJECT_PATH };
  const result = configureTarget(config, 'claude_code', options);
  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  assert.deepEqual(Object.keys(written.projects), ['D:/repos/game']);
  assert.ok(written.projects['D:/repos/game'].mcpServers[result.serverName]);
});

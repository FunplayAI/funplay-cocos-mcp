'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createToolRegistry } = require('../lib/tool-registry');

function createRegistry(profile, projectPath = path.resolve('/tmp/funplay-cocos-test-project'), configExtras = {}, overrides = {}) {
  return createToolRegistry({
    getRuntimeContext: () => ({
      config: { toolProfile: profile, ...configExtras },
      projectPath,
      version: '0.0.0-test',
    }),
    interactionLog: { add() {} },
    runtimeLog: { add() {}, list: () => [], clear: () => 0 },
    sceneBridge: overrides.sceneBridge || { call: async () => ({ ok: true }) },
    editorExecutor: overrides.editorExecutor || (async () => ({ ok: true })),
  });
}

test('core profile exposes the documented focused tool set', () => {
  const tools = createRegistry('core').listTools();
  assert.equal(tools.length, 37);
  assert.equal(tools.some((tool) => tool.name === 'execute_javascript'), true);
  assert.equal(tools.some((tool) => tool.name === 'get_editor_state'), true);
  assert.equal(tools.some((tool) => tool.name === 'get_tool_catalog'), true);
  assert.equal(tools.some((tool) => tool.name === 'validate_scene'), true);
  assert.equal(tools.some((tool) => tool.name === 'inspect_asset_dependencies'), true);
  assert.equal(tools.some((tool) => tool.name === 'get_build_status'), true);
  assert.equal(tools.some((tool) => tool.name === 'get_performance_snapshot'), true);
  assert.equal(tools.some((tool) => tool.name === 'list_project_instructions'), true);
  assert.equal(tools.some((tool) => tool.name === 'set_selection'), true);
  assert.equal(tools.some((tool) => tool.name === 'write_file'), false);
});

test('full profile exposes all built-in tools', () => {
  const tools = createRegistry('full').listTools();
  assert.equal(tools.length, 102);
  assert.equal(tools.some((tool) => tool.name === 'write_file'), true);
  assert.equal(tools.some((tool) => tool.name === 'edit_prefab_json'), true);
  assert.equal(tools.some((tool) => tool.name === 'create_prefab_from_node'), true);
  assert.equal(tools.some((tool) => tool.name === 'create_project_skill'), true);
  assert.equal(tools.some((tool) => tool.name === 'create_cocos_mcp_project_skill'), true);
  assert.equal(tools.some((tool) => tool.name === 'bind_button_click_event'), true);
  assert.equal(tools.some((tool) => tool.name === 'open_build_panel'), true);
  assert.equal(tools.some((tool) => tool.name === 'broadcast_editor_message'), true);
  assert.equal(tools.some((tool) => tool.name === 'get_editor_state'), true);
  assert.equal(tools.some((tool) => tool.name === 'set_selection'), true);
});

test('tool definitions include MCP outputSchema and annotations', () => {
  const tool = createRegistry('core').listTools().find((item) => item.name === 'get_project_info');
  assert.equal(tool.outputSchema.type, 'object');
  assert.equal(tool.outputSchema.properties.ok.type, 'boolean');
  assert.equal(tool.annotations.readOnlyHint, true);
});

test('custom profile can expose a category and disable a specific tool', () => {
  const tools = createRegistry('custom', path.resolve('/tmp/funplay-cocos-test-project'), {
    enabledToolCategories: ['files'],
    disabledTools: ['write_file'],
  }).listTools();

  assert.equal(tools.some((tool) => tool.name === 'read_file'), true);
  assert.equal(tools.some((tool) => tool.name === 'write_file'), false);
  assert.equal(tools.some((tool) => tool.name === 'execute_javascript'), true);
});

test('tool catalog reports disabled tools under the current exposure settings', () => {
  const catalog = createRegistry('core', path.resolve('/tmp/funplay-cocos-test-project'), {
    disabledTools: ['execute_javascript'],
  }).listToolCatalog();
  const executeTool = catalog.find((tool) => tool.name === 'execute_javascript');
  assert.equal(executeTool.enabled, false);
  assert.equal(executeTool.category, 'execution');
});

test('file tools reject writes outside the project root', async () => {
  const registry = createRegistry('full');
  await assert.rejects(
    () => registry.callTool('write_file', { path: '../outside.txt', content: 'x' }),
    /outside the Cocos project/
  );
});

test('callToolDetailed preserves structured values and text output', async () => {
  const registry = createRegistry('core');
  const result = await registry.callToolDetailed('get_project_info', {});
  assert.equal(result.value.ok, true);
  assert.equal(result.value.tool, 'get_project_info');
  assert.equal(result.value.data.projectPath, path.resolve('/tmp/funplay-cocos-test-project'));
  assert.match(result.value.callId, /^fp_/);
  assert.match(result.text, /projectPath/);
});

test('create_prefab_from_node serializes through scene bridge and writes asset file', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-prefab-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'assets'), { recursive: true });

  const calls = [];
  const registry = createRegistry('full', tmp, {}, {
    sceneBridge: {
      call: async (method, payload) => {
        calls.push({ method, payload });
        return {
          source: { name: 'SourceNode', path: 'Canvas/SourceNode', uuid: 'source-uuid' },
          root: { name: payload.rootName || 'SourceNode' },
          content: '[{"__type__":"cc.Prefab","data":{"__id__":1}},{"__type__":"cc.Node","_name":"SourceNode"}]',
        };
      },
    },
  });

  const result = await registry.callToolDetailed('create_prefab_from_node', {
    name: 'SourceNode',
    rootName: 'LoginPanel',
    target: 'Prefabs/LoginPanel',
  });

  assert.equal(calls[0].method, 'serializePrefabFromNode');
  assert.deepEqual(calls[0].payload, {
    path: undefined,
    uuid: undefined,
    name: 'SourceNode',
    rootName: 'LoginPanel',
    prefabName: undefined,
  });
  assert.equal(result.value.data.created, true);
  assert.equal(result.value.data.path, 'assets/Prefabs/LoginPanel.prefab');
  assert.equal(fs.existsSync(path.join(tmp, 'assets', 'Prefabs', 'LoginPanel.prefab')), true);
});

test('callToolDetailed preserves screenshot image text while keeping structured envelope small', async () => {
  const dataUri = 'data:image/png;base64,AAAA';
  const registry = createRegistry('core', path.resolve('/tmp/funplay-cocos-test-project'), {}, {
    editorExecutor: async () => dataUri,
  });

  const result = await registry.callToolDetailed('execute_javascript', { context: 'editor', code: 'return image;' });
  assert.equal(result.text, dataUri);
  assert.equal(result.value.data.image, true);
  assert.equal(result.value.data.mimeType, 'image/png');
});

test('execute_javascript safety checks block risky editor snippets by default', async () => {
  const registry = createRegistry('core');

  await assert.rejects(
    () => registry.callToolDetailed('execute_javascript', {
      context: 'editor',
      code: "fs.rmSync(path.join(context.projectPath, 'assets'), { recursive: true });",
    }),
    /JavaScript safety checks blocked/
  );
});

test('execute_javascript safety checks can be explicitly disabled per call', async () => {
  let called = false;
  const registry = createRegistry('core', path.resolve('/tmp/funplay-cocos-test-project'), {}, {
    editorExecutor: async () => {
      called = true;
      return { ok: true };
    },
  });

  const result = await registry.callToolDetailed('execute_javascript', {
    context: 'editor',
    code: "fs.rmSync(path.join(context.projectPath, 'assets'), { recursive: true });",
    safety_checks: false,
  });

  assert.equal(called, true);
  assert.equal(result.value.ok, true);
});

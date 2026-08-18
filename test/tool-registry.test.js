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

function mockEditorRequests(t, handler) {
  const previousEditor = global.Editor;
  global.Editor = {
    Message: {
      request: handler,
    },
  };
  t.after(() => {
    if (previousEditor === undefined) {
      delete global.Editor;
    } else {
      global.Editor = previousEditor;
    }
  });
}

test('core profile exposes the documented focused tool set', () => {
  const tools = createRegistry('core').listTools();
  assert.equal(tools.length, 39);
  assert.equal(tools.some((tool) => tool.name === 'execute_javascript'), true);
  assert.equal(tools.some((tool) => tool.name === 'get_editor_state'), true);
  assert.equal(tools.some((tool) => tool.name === 'get_tool_catalog'), true);
  assert.equal(tools.some((tool) => tool.name === 'validate_scene'), true);
  assert.equal(tools.some((tool) => tool.name === 'inspect_asset_dependencies'), true);
  assert.equal(tools.some((tool) => tool.name === 'get_build_status'), true);
  assert.equal(tools.some((tool) => tool.name === 'get_preview_mode'), true);
  assert.equal(tools.some((tool) => tool.name === 'get_performance_snapshot'), true);
  assert.equal(tools.some((tool) => tool.name === 'create_scene'), true);
  assert.equal(tools.some((tool) => tool.name === 'list_project_instructions'), true);
  assert.equal(tools.some((tool) => tool.name === 'set_selection'), true);
  assert.equal(tools.some((tool) => tool.name === 'write_file'), false);
});

test('full profile exposes all built-in tools', () => {
  const tools = createRegistry('full').listTools();
  assert.equal(tools.length, 105);
  assert.equal(tools.some((tool) => tool.name === 'write_file'), true);
  assert.equal(tools.some((tool) => tool.name === 'edit_prefab_json'), true);
  assert.equal(tools.some((tool) => tool.name === 'create_prefab_from_node'), true);
  assert.equal(tools.some((tool) => tool.name === 'create_project_skill'), true);
  assert.equal(tools.some((tool) => tool.name === 'create_cocos_mcp_project_skill'), true);
  assert.equal(tools.some((tool) => tool.name === 'bind_button_click_event'), true);
  assert.equal(tools.some((tool) => tool.name === 'open_build_panel'), true);
  assert.equal(tools.some((tool) => tool.name === 'get_preview_mode'), true);
  assert.equal(tools.some((tool) => tool.name === 'set_preview_mode'), true);
  assert.equal(tools.some((tool) => tool.name === 'create_scene'), true);
  assert.equal(tools.some((tool) => tool.name === 'broadcast_editor_message'), true);
  assert.equal(tools.some((tool) => tool.name === 'get_editor_state'), true);
  assert.equal(tools.some((tool) => tool.name === 'set_selection'), true);
});

test('recommended project skill tool records managed template metadata', async (t) => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-managed-skill-'));
  t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));
  const registry = createRegistry('full', projectPath);

  const result = await registry.callToolDetailed('create_cocos_mcp_project_skill', {});

  assert.equal(result.value.data.path, '.codex/skills/funplay-cocos-mcp-workflow/SKILL.md');
  assert.equal(
    result.value.data.manifest,
    '.codex/skills/funplay-cocos-mcp-workflow/.funplay-cocos-mcp.json'
  );
  assert.equal(fs.existsSync(path.join(projectPath, result.value.data.manifest)), true);
});

test('create_scene serializes and persists a scene without an interactive save dialog', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-scene-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'assets'), { recursive: true });

  const calls = [];
  const registry = createRegistry('full', tmp, {}, {
    sceneBridge: {
      call: async (method, payload) => {
        calls.push({ method, payload });
        return {
          mode: payload.mode,
          source: null,
          scene: { name: payload.sceneName, childCount: 0 },
          content: JSON.stringify([
            { __type__: 'cc.SceneAsset', _name: payload.sceneName, scene: { __id__: 1 } },
            { __type__: 'cc.Scene', _name: payload.sceneName, _children: [] },
          ]),
        };
      },
    },
  });

  const result = await registry.callToolDetailed('create_scene', {
    target: 'Scenes/GeneratedLevel',
    openAfterCreate: false,
  });

  assert.deepEqual(calls[0], {
    method: 'serializeScene',
    payload: { mode: 'empty', sceneName: 'GeneratedLevel' },
  });
  assert.equal(result.value.data.created, true);
  assert.equal(result.value.data.path, 'assets/Scenes/GeneratedLevel.scene');
  assert.equal(result.value.data.opened, null);
  assert.equal(fs.existsSync(path.join(tmp, 'assets', 'Scenes', 'GeneratedLevel.scene')), true);
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
          content: JSON.stringify([
            { __type__: 'cc.Prefab', data: { __id__: 1 } },
            {
              __type__: 'cc.Node',
              _name: 'SourceNode',
              _components: [{ __id__: 2 }],
              _prefab: { __id__: 4 },
            },
            { __type__: 'cc.UITransform', node: { __id__: 1 }, __prefab: { __id__: 3 } },
            { __type__: 'cc.CompPrefabInfo', fileId: 'component-file-id' },
            {
              __type__: 'cc.PrefabInfo',
              root: { __id__: 1 },
              asset: { __id__: 0 },
              fileId: 'node-file-id',
            },
          ]),
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
  assert.deepEqual(result.value.data.prefabMetadata, {
    valid: true,
    prefabIndex: 0,
    rootIndex: 1,
    nodeCount: 1,
    componentCount: 1,
    fileIdCount: 2,
  });
  assert.equal(fs.existsSync(path.join(tmp, 'assets', 'Prefabs', 'LoginPanel.prefab')), true);
});

test('create_prefab_from_node rejects serialized output without PrefabInfo', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-invalid-prefab-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'assets'), { recursive: true });

  const registry = createRegistry('full', tmp, {}, {
    sceneBridge: {
      call: async () => ({
        source: { name: 'SourceNode', path: 'Canvas/SourceNode', uuid: 'source-uuid' },
        root: { name: 'SourceNode' },
        content: '[{"__type__":"cc.Prefab","data":{"__id__":1}},{"__type__":"cc.Node","_name":"SourceNode","_components":[],"_prefab":null}]',
      }),
    },
  });

  await assert.rejects(
    () => registry.callToolDetailed('create_prefab_from_node', {
      name: 'SourceNode',
      target: 'Prefabs/Invalid',
    }),
    /cc.Node at index 1\._prefab is not an object reference/
  );
  assert.equal(fs.existsSync(path.join(tmp, 'assets', 'Prefabs', 'Invalid.prefab')), false);
});

test('create_prefab_instance creates a cc.Prefab node and verifies its linkage', async (t) => {
  const editorRequests = [];
  mockEditorRequests(t, async (channel, method, payload) => {
    editorRequests.push({ channel, method, payload });
    if (channel === 'asset-db' && method === 'query-asset-info') {
      return { uuid: 'prefab-uuid' };
    }
    if (channel === 'scene' && method === 'create-node') {
      return 'created-node-uuid';
    }
    throw new Error(`Unexpected editor request: ${channel}:${method}`);
  });

  const sceneCalls = [];
  const registry = createRegistry('full', path.resolve('/tmp/funplay-cocos-test-project'), {}, {
    sceneBridge: {
      call: async (method, payload) => {
        sceneCalls.push({ method, payload });
        if (method === 'inspectNode') {
          return { uuid: 'parent-node-uuid' };
        }
        if (method === 'getPrefabInstanceInfo') {
          return {
            node: { name: 'LinkedPanel', path: 'Canvas/LinkedPanel', uuid: 'created-node-uuid' },
            prefab: {
              linked: true,
              fileId: 'linked-file-id',
              asset: { name: 'Panel', uuid: 'prefab-uuid' },
              instance: { root: 'created-node-uuid' },
            },
          };
        }
        throw new Error(`Unexpected scene call: ${method}`);
      },
    },
  });

  const result = await registry.callToolDetailed('create_prefab_instance', {
    prefabUuid: 'db://assets/Prefabs/Panel.prefab',
    parentPath: 'Canvas',
    name: 'LinkedPanel',
  });

  assert.deepEqual(editorRequests[1], {
    channel: 'scene',
    method: 'create-node',
    payload: {
      assetUuid: 'prefab-uuid',
      type: 'cc.Prefab',
      unlinkPrefab: false,
      parent: 'parent-node-uuid',
      name: 'LinkedPanel',
    },
  });
  assert.deepEqual(sceneCalls, [
    { method: 'inspectNode', payload: { path: 'Canvas' } },
    { method: 'getPrefabInstanceInfo', payload: { uuid: 'created-node-uuid' } },
  ]);
  assert.equal(result.value.data.linkedPrefab, true);
  assert.equal(result.value.data.verified, true);
  assert.equal(result.value.data.creationMethod, 'scene:create-node');
  assert.deepEqual(result.value.data.verification, {
    nodeUuidMatches: true,
    linked: true,
    assetUuidMatches: true,
    fileIdPresent: true,
    instancePresent: true,
  });
});

test('create_prefab_instance removes an unverified node and does not fall back', async (t) => {
  mockEditorRequests(t, async (channel, method) => {
    if (channel === 'asset-db' && method === 'query-asset-info') {
      return { uuid: 'expected-prefab-uuid' };
    }
    if (channel === 'scene' && method === 'create-node') {
      return 'unlinked-node-uuid';
    }
    throw new Error(`Unexpected editor request: ${channel}:${method}`);
  });

  const sceneCalls = [];
  const registry = createRegistry('full', path.resolve('/tmp/funplay-cocos-test-project'), {}, {
    sceneBridge: {
      call: async (method, payload) => {
        sceneCalls.push({ method, payload });
        if (method === 'getPrefabInstanceInfo') {
          return {
            node: { uuid: 'unlinked-node-uuid' },
            prefab: {
              linked: false,
              fileId: '',
              asset: { uuid: 'wrong-prefab-uuid' },
              instance: null,
            },
          };
        }
        if (method === 'deleteNode') {
          return { deleted: true, uuid: payload.uuid };
        }
        throw new Error(`Unexpected scene call: ${method}`);
      },
    },
  });

  await assert.rejects(
    () => registry.callToolDetailed('create_prefab_instance', { prefabUuid: 'expected-prefab-uuid' }),
    /failed linked Prefab verification \(linked, assetUuidMatches, fileIdPresent, instancePresent\).*created node was removed/
  );
  assert.deepEqual(sceneCalls, [
    { method: 'getPrefabInstanceInfo', payload: { uuid: 'unlinked-node-uuid' } },
    { method: 'deleteNode', payload: { uuid: 'unlinked-node-uuid' } },
  ]);
});

test('create_prefab_instance verifies the scene fallback when create-node is unavailable', async (t) => {
  mockEditorRequests(t, async (channel, method) => {
    if (channel === 'asset-db' && method === 'query-asset-info') {
      return { uuid: 'prefab-uuid' };
    }
    if (channel === 'scene' && method === 'create-node') {
      throw new Error('create-node unavailable');
    }
    throw new Error(`Unexpected editor request: ${channel}:${method}`);
  });

  const sceneCalls = [];
  const registry = createRegistry('full', path.resolve('/tmp/funplay-cocos-test-project'), {}, {
    sceneBridge: {
      call: async (method, payload) => {
        sceneCalls.push({ method, payload });
        if (method === 'instantiatePrefab') {
          return {
            instantiated: true,
            prefabUuid: payload.prefabUuid,
            node: { name: 'Panel', path: 'Panel', uuid: 'fallback-node-uuid' },
          };
        }
        if (method === 'getPrefabInstanceInfo') {
          return {
            node: { name: 'Panel', path: 'Panel', uuid: 'fallback-node-uuid' },
            prefab: {
              linked: true,
              fileId: 'fallback-file-id',
              asset: { name: 'Panel', uuid: 'prefab-uuid' },
              instance: {},
            },
          };
        }
        throw new Error(`Unexpected scene call: ${method}`);
      },
    },
  });

  const result = await registry.callToolDetailed('create_prefab_instance', { prefabUuid: 'prefab-uuid' });

  assert.equal(result.value.data.linkedPrefab, true);
  assert.equal(result.value.data.verified, true);
  assert.equal(result.value.data.creationMethod, 'scene:instantiatePrefab');
  assert.deepEqual(sceneCalls.map((call) => call.method), [
    'instantiatePrefab',
    'getPrefabInstanceInfo',
  ]);
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

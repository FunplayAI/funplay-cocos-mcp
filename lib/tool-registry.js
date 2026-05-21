'use strict';

const crypto = require('crypto');
const fs = require('fs');
const {
  clearSelection,
  deleteAsset,
  getCurrentSelection,
  listAssets,
  openAsset,
  queryAssetData,
  queryAssetInfo,
  queryAssetMeta,
  selectAsset,
  selectNode,
} = require('./assets');
const { runScriptDiagnostics } = require('./diagnostics');
const { listWindows, sendKeyCombo, sendKeyPress, sendMouseClick, sendMouseDrag } = require('./input');
const {
  clearProjectLogFiles,
  getRecentProjectLogs,
  searchProjectLogs,
} = require('./logs');
const { resolveProjectPath } = require('./path-safety');
const {
  createProjectSkill,
  listProjectInstructions,
  readProjectInstruction,
  writeProjectInstruction,
} = require('./project-instructions');
const {
  applyPrefabInstance,
  duplicatePrefab,
  editPrefabJson,
  inspectPrefab,
  revertPrefabInstance,
  validatePrefabReferences,
} = require('./prefabs');
const { buildSnippet, createFileTools, refreshAssets } = require('./tools/files');
const { captureDesktopScreenshot, captureEditorWindowScreenshot, capturePanelScreenshot } = require('./screenshots');
const { checkForUpdate } = require('./update-checker');
const { safeStringify } = require('./utils');
const IMAGE_DATA_URI_PREFIX = 'data:image/png;base64,';

const TOOL_CATEGORY_RULES = [
  ['project', /^(get_project_info|get_editor_state|get_tool_catalog)$/],
  ['updates', /update/],
  ['logs', /log/],
  ['diagnostics', /diagnostic|validate/],
  ['screenshots', /screenshot|capture/],
  ['input', /mouse|key|input|button_click/],
  ['files', /file|directory|exists|refresh_assets/],
  ['assets', /asset|scene$|scenes|open_scene|run_scene_asset/],
  ['prefabs', /prefab/],
  ['instructions', /instruction|skill/],
  ['selection', /selection|select_/],
  ['components', /component/],
  ['ui', /canvas|label|button|sprite/],
  ['camera', /camera/],
  ['animation', /animation|clip/],
  ['runtime', /runtime|time_scale|node_event|invoke_component/],
  ['scene', /scene|hierarchy|node/],
  ['execution', /execute_/],
];

function createSchema(properties, required) {
  const schema = {
    type: 'object',
    properties,
  };
  if (required && required.length) {
    schema.required = required;
  }
  return schema;
}

function createOutputSchema(dataSchema = {}) {
  return {
    type: 'object',
    properties: {
      ok: { type: 'boolean', description: 'Whether the tool call completed successfully.' },
      tool: { type: 'string', description: 'Tool name that produced this result.' },
      callId: { type: 'string', description: 'Stable identifier for this tool call result.' },
      timestamp: { type: 'string', description: 'ISO timestamp when the result envelope was produced.' },
      summary: { type: 'string', description: 'Short human-readable result summary.' },
      data: dataSchema,
      refs: {
        type: 'array',
        description: 'Stable references discovered in the result for follow-up tool calls.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            id: { type: 'string' },
            path: { type: 'string' },
            name: { type: 'string' },
          },
        },
      },
    },
    required: ['ok', 'tool', 'callId', 'timestamp', 'data'],
  };
}

function inferToolCategory(toolName) {
  for (const [category, pattern] of TOOL_CATEGORY_RULES) {
    if (pattern.test(toolName)) {
      return category;
    }
  }
  return 'other';
}

function normalizeNameSet(values) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );
}

function normalizeCategorySet(values) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

function toolCategory(tool) {
  return tool.category || inferToolCategory(tool.name);
}

function inferToolAnnotations(tool) {
  const name = tool.name;
  const category = toolCategory(tool);
  const readOnly = /^(get|list|inspect|find|read|search|check|validate|exists|capture)/.test(name);
  const destructive = /(delete|remove|clear|replace|write|reset|set_|execute|run_scene|invoke|emit|simulate)/.test(name);
  const idempotent = readOnly || /^(set|select|open|pause|resume|stop|refresh)/.test(name);

  return {
    title: name
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
    readOnlyHint: readOnly,
    destructiveHint: readOnly ? false : destructive,
    idempotentHint: idempotent,
    openWorldHint: category === 'updates',
    ...(tool.annotations || {}),
  };
}

function isToolExposed(config, tool) {
  const profile = config && config.toolProfile === 'full'
    ? 'full'
    : config && config.toolProfile === 'custom'
      ? 'custom'
      : 'core';
  const category = toolCategory(tool);
  const enabledTools = normalizeNameSet(config && config.enabledTools);
  const disabledTools = normalizeNameSet(config && config.disabledTools);
  const enabledCategories = normalizeCategorySet(config && config.enabledToolCategories);
  const disabledCategories = normalizeCategorySet(config && config.disabledToolCategories);

  let exposed = profile === 'full' || tool.profile === 'core';
  if (profile === 'custom') {
    exposed = tool.profile === 'core' || enabledTools.has(tool.name) || enabledCategories.has(category);
  } else if (enabledTools.has(tool.name) || enabledCategories.has(category)) {
    exposed = true;
  }

  if (disabledTools.has(tool.name) || disabledCategories.has(category)) {
    exposed = false;
  }

  return exposed;
}

function hashObject(value) {
  return crypto
    .createHash('sha256')
    .update(safeStringify(value))
    .digest('hex')
    .slice(0, 16);
}

function summarizeResult(result) {
  if (typeof result === 'string') {
    if (result.startsWith(IMAGE_DATA_URI_PREFIX)) {
      return 'Image payload returned.';
    }
    return result.length > 160 ? `${result.slice(0, 160)}...` : result;
  }
  if (!result || typeof result !== 'object') {
    return String(result);
  }
  if (typeof result.summary === 'string') {
    return result.summary;
  }
  for (const key of ['message', 'path', 'url', 'sceneName', 'projectName']) {
    if (typeof result[key] === 'string' && result[key]) {
      return `${key}: ${result[key]}`;
    }
  }
  if (Number.isFinite(result.count)) {
    return `count: ${result.count}`;
  }
  return 'Structured result returned.';
}

function normalizeEnvelopeData(result) {
  if (typeof result === 'string' && result.startsWith(IMAGE_DATA_URI_PREFIX)) {
    return {
      image: true,
      mimeType: 'image/png',
      byteLength: Buffer.byteLength(result.slice(IMAGE_DATA_URI_PREFIX.length), 'base64'),
    };
  }
  return result;
}

function addRef(refs, type, id, extra = {}) {
  if (!id) {
    return;
  }
  const key = `${type}:${id}`;
  if (refs.some((ref) => ref.key === key)) {
    return;
  }
  refs.push({ key, type, id: String(id), ...extra });
}

function collectRefs(value, refs = [], depth = 0, seen = new WeakSet()) {
  if (!value || depth > 5) {
    return refs;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRefs(item, refs, depth + 1, seen);
    }
    return refs;
  }
  if (typeof value !== 'object') {
    return refs;
  }
  if (seen.has(value)) {
    return refs;
  }
  seen.add(value);

  const uuid = value.uuid || value.prefabUuid || value.sceneUuid || value.assetUuid;
  const pathValue = value.path || value.node || value.url;
  if (uuid) {
    addRef(refs, pathValue && String(pathValue).startsWith('db://') ? 'asset' : 'uuid', uuid, {
      path: pathValue ? String(pathValue) : undefined,
      name: value.name ? String(value.name) : undefined,
    });
  }
  if (typeof pathValue === 'string' && pathValue) {
    addRef(refs, pathValue.startsWith('db://') ? 'asset' : 'path', pathValue, {
      name: value.name ? String(value.name) : undefined,
    });
  }

  for (const item of Object.values(value)) {
    collectRefs(item, refs, depth + 1, seen);
  }
  return refs;
}

function createResultEnvelope(tool, args, result, options = {}) {
  const data = normalizeEnvelopeData(result);
  const refs = collectRefs(data).map(({ key, ...ref }) => ref);
  const timestamp = new Date().toISOString();
  const summary = options.summary || summarizeResult(result);
  const callId = `fp_${hashObject({ tool: tool.name, args: args || {}, result: data })}`;
  return {
    ok: options.ok !== false,
    tool: tool.name,
    callId,
    timestamp,
    summary,
    data,
    refs,
  };
}

function summarizeDiagnostics(result) {
  if (!result) {
    return null;
  }
  return {
    ok: Boolean(result.ok),
    tool: result.tool,
    summary: result.summary,
    diagnosticCount: Array.isArray(result.diagnostics) ? result.diagnostics.length : 0,
    diagnostics: Array.isArray(result.diagnostics) ? result.diagnostics.slice(0, 20) : [],
  };
}

function toOutput(value) {
  if (typeof value === 'string') {
    return value;
  }
  return safeStringify(value);
}

async function resolveNodeUuid(sceneBridge, args) {
  if (args && args.uuid) {
    return String(args.uuid);
  }
  const inspected = await sceneBridge.call('inspectNode', args || {});
  if (!inspected || !inspected.uuid) {
    throw new Error('Target node uuid could not be resolved.');
  }
  return inspected.uuid;
}

function createToolRegistry({ getRuntimeContext, getStatus, interactionLog, runtimeLog, sceneBridge, editorExecutor }) {
  const tools = [
    {
      name: 'execute_javascript',
      profile: 'core',
      description: '[primary] Execute JavaScript in either the scene or editor context. Use context=\"scene\" for live scene/runtime inspection and mutation, or context=\"editor\" for Editor APIs, asset-db workflows, MCP orchestration, local filesystem access, and higher-level automation. Prefer this as the main flexible tool when many narrow tools would be noisy.',
      inputSchema: createSchema(
        {
          context: { type: 'string', description: 'Execution context: scene or editor.' },
          code: { type: 'string', description: 'JavaScript code to execute. May directly return a value, define run(env), or export a function.' },
          args: { type: 'object', description: 'Optional JSON object passed into the script.' },
        },
        ['context', 'code']
      ),
      handler: async (args) => {
        const context = String(args.context || '').toLowerCase();
        if (context === 'scene') {
          return sceneBridge.call('executeCode', { code: args.code, args: args.args || {} });
        }
        if (context === 'editor') {
          if (typeof editorExecutor !== 'function') {
            throw new Error('Editor JavaScript execution is unavailable.');
          }
          return await editorExecutor({ code: args.code, args: args.args || {} });
        }
        throw new Error(`Unknown execution context '${args.context}'. Expected 'scene' or 'editor'.`);
      },
    },
    {
      name: 'execute_scene_script',
      profile: 'core',
      description: '[compat] Execute JavaScript in the active Cocos scene context. Prefer execute_javascript with context="scene" as the main unified tool; use this when you specifically want the scene-only compatibility entrypoint.',
      inputSchema: createSchema(
        {
          code: { type: 'string', description: 'JavaScript code to execute inside the scene script context.' },
          args: { type: 'object', description: 'Optional JSON object passed to the scene script.' },
        },
        ['code']
      ),
      handler: async (args) => sceneBridge.call('executeCode', { code: args.code, args: args.args || {} }),
    },
    {
      name: 'execute_editor_script',
      profile: 'core',
      description: '[compat] Execute JavaScript in the editor/browser context. Prefer execute_javascript with context="editor" as the main unified tool; use this when you specifically want the editor-only compatibility entrypoint.',
      inputSchema: createSchema(
        {
          code: { type: 'string', description: 'JavaScript code to execute inside the editor context.' },
          args: { type: 'object', description: 'Optional JSON object passed to the editor script.' },
        },
        ['code']
      ),
      handler: async (args) => {
        if (typeof editorExecutor !== 'function') {
          throw new Error('Editor JavaScript execution is unavailable.');
        }
        return await editorExecutor({ code: args.code, args: args.args || {} });
      },
    },
    {
      name: 'get_editor_state',
      profile: 'core',
      description: '[specialist] Return a structured editor-state snapshot including project info, runtime server status, current selection, and visible Electron windows. Prefer this when you want one compact editor summary.',
      inputSchema: createSchema({}, []),
      handler: async () => {
        const runtimeContext = getRuntimeContext();
        const status = typeof getStatus === 'function' ? getStatus() : null;
        let scene = null;
        try {
          const sceneInfo = await sceneBridge.call('getSceneInfo', { maxDepth: 1, includeComponents: false });
          scene = sceneInfo
            ? {
                sceneName: sceneInfo.sceneName,
                uuid: sceneInfo.uuid,
                childCount: sceneInfo.childCount,
              }
            : null;
        } catch (error) {
          scene = { error: error.message };
        }

        let windows = [];
        try {
          windows = listWindows();
        } catch (error) {
          windows = [{ error: error.message }];
        }

        return {
          extensionName: runtimeContext.extensionName,
          version: runtimeContext.version,
          projectName: runtimeContext.projectName,
          projectPath: runtimeContext.projectPath,
          cocosVersion: runtimeContext.cocosVersion,
          toolProfile: runtimeContext.config ? runtimeContext.config.toolProfile : 'core',
          status,
          selection: getCurrentSelection(),
          scene,
          windows,
        };
      },
    },
    {
      name: 'get_tool_catalog',
      profile: 'core',
      description: '[specialist] Return every built-in MCP tool with profile, category, and current exposure state. Use this before changing custom tool exposure.',
      inputSchema: createSchema({}, []),
      handler: async () => registry.listToolCatalog(),
    },
    {
      name: 'check_for_updates',
      profile: 'core',
      description: '[specialist] Check the latest Funplay Cocos MCP GitHub release and compare it with the installed extension version.',
      inputSchema: createSchema(
        {
          timeoutMs: { type: 'number', description: 'Optional network timeout in milliseconds.' },
        },
        []
      ),
      handler: async (args) => {
        const runtimeContext = getRuntimeContext();
        return await checkForUpdate({
          currentVersion: runtimeContext.version,
          timeoutMs: Number.isFinite(args.timeoutMs) ? args.timeoutMs : 5000,
        });
      },
    },
    {
      name: 'get_selection',
      profile: 'core',
      description: '[specialist] Return the current editor selection in a compact structured form. Prefer this when selection state matters for the next action.',
      inputSchema: createSchema({}, []),
      handler: async () => getCurrentSelection(),
    },
    {
      name: 'list_project_instructions',
      profile: 'core',
      description: '[specialist] List project AI instruction files and local Codex project skills.',
      inputSchema: createSchema({}, []),
      handler: async () => {
        const { projectPath } = getRuntimeContext();
        return listProjectInstructions(projectPath);
      },
    },
    {
      name: 'read_project_instruction',
      profile: 'core',
      description: '[specialist] Read a project AI instruction file such as AGENTS.md, CLAUDE.md, or a .codex skill SKILL.md.',
      inputSchema: createSchema(
        {
          target: { type: 'string', description: 'Project-relative instruction path.' },
        },
        ['target']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        return readProjectInstruction(projectPath, args.target);
      },
    },
    {
      name: 'write_project_instruction',
      profile: 'full',
      description: '[core] Create or update a project AI instruction file inside the Cocos project.',
      inputSchema: createSchema(
        {
          target: { type: 'string', description: 'Project-relative instruction path.' },
          content: { type: 'string', description: 'Instruction file content.' },
          overwrite: { type: 'boolean', description: 'Allow overwriting an existing file. Defaults to true.' },
        },
        ['target', 'content']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        return writeProjectInstruction(projectPath, args);
      },
    },
    {
      name: 'create_project_skill',
      profile: 'full',
      description: '[core] Create a local Codex project skill under .codex/skills/{skillName}/SKILL.md.',
      inputSchema: createSchema(
        {
          skillName: { type: 'string', description: 'Filesystem-safe project skill name.' },
          title: { type: 'string', description: 'Human-readable skill title.' },
          description: { type: 'string', description: 'Skill trigger description.' },
          instructions: { type: 'string', description: 'Skill instructions body.' },
          overwrite: { type: 'boolean', description: 'Allow overwriting an existing skill. Defaults to true.' },
        },
        ['skillName']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        return createProjectSkill(projectPath, args);
      },
    },
    {
      name: 'set_selection',
      profile: 'core',
      description: '[specialist] Set or clear the current editor selection for an asset or node. Use this when downstream editor workflows depend on selection state.',
      inputSchema: createSchema(
        {
          type: { type: 'string', description: 'Selection target type: asset, node, or clear.' },
          target: { type: 'string', description: 'Asset uuid/path/db url, or node uuid when type=node.' },
          clearMode: { type: 'string', description: 'When type=clear, choose asset, node, or all.' },
        },
        ['type']
      ),
      handler: async (args) => {
        const type = String(args.type || '').trim().toLowerCase();
        if (type === 'clear') {
          return clearSelection(args.clearMode || 'all');
        }
        if (type === 'asset') {
          const info = await queryAssetInfo(args.target);
          return selectAsset(info.uuid || args.target);
        }
        if (type === 'node') {
          const target = String(args.target || '').trim();
          if (!target) {
            throw new Error('target is required when type=node.');
          }
          return selectNode(target);
        }
        throw new Error(`Unknown selection type '${args.type}'. Expected asset, node, or clear.`);
      },
    },
    {
      name: 'get_scene_info',
      profile: 'core',
      description: '[specialist] Return a structured summary of the active Cocos scene. Prefer execute_javascript for multi-step inspection or mutation; use this when you specifically want a compact scene snapshot.',
      inputSchema: createSchema(
        {
          maxDepth: { type: 'number', description: 'Maximum child depth to include in the scene summary.' },
          includeComponents: { type: 'boolean', description: 'Include component names for nodes.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('getSceneInfo', args),
    },
    {
      name: 'get_hierarchy',
      profile: 'core',
      description: '[specialist] Return a structured hierarchy tree from the active scene or a specific node path. Prefer execute_javascript for broader reasoning or repair; use this when you want a predictable hierarchy snapshot.',
      inputSchema: createSchema(
        {
          rootPath: { type: 'string', description: 'Optional node path to use as the traversal root.' },
          maxDepth: { type: 'number', description: 'Maximum child depth to include.' },
          includeComponents: { type: 'boolean', description: 'Include component names for each node.' },
          includeInactive: { type: 'boolean', description: 'Include inactive nodes in the result.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('getHierarchy', args),
    },
    {
      name: 'find_nodes',
      profile: 'full',
      description: '[core] Find scene nodes by exact name, partial path, or component type.',
      inputSchema: createSchema(
        {
          name: { type: 'string', description: 'Exact node name to match.' },
          pathContains: { type: 'string', description: 'Substring that must appear in the node path.' },
          component: { type: 'string', description: 'Component constructor name to match.' },
          includeInactive: { type: 'boolean', description: 'Include inactive nodes.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('findNodes', args),
    },
    {
      name: 'inspect_node',
      profile: 'full',
      description: '[core] Inspect a specific node by path, uuid, or name.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Hierarchy path such as Canvas/Player.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('inspectNode', args),
    },
    {
      name: 'create_node',
      profile: 'full',
      description: 'Create a new node under the active scene or a specified parent path.',
      inputSchema: createSchema(
        {
          name: { type: 'string', description: 'Name of the node to create.' },
          parentPath: { type: 'string', description: 'Optional parent node path.' },
          position: { type: 'object', description: 'Optional position {x,y,z}.' },
          scale: { type: 'object', description: 'Optional scale {x,y,z}.' },
          eulerAngles: { type: 'object', description: 'Optional rotation {x,y,z} in degrees.' },
          active: { type: 'boolean', description: 'Optional active state for the node.' },
        },
        ['name']
      ),
      handler: async (args) => sceneBridge.call('createNode', args),
    },
    {
      name: 'delete_node',
      profile: 'full',
      description: 'Delete a node by path, uuid, or name.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('deleteNode', args),
    },
    {
      name: 'set_node_transform',
      profile: 'full',
      description: 'Update node position, rotation, scale, or active state.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
          position: { type: 'object', description: 'Position {x,y,z}.' },
          scale: { type: 'object', description: 'Scale {x,y,z}.' },
          eulerAngles: { type: 'object', description: 'Rotation {x,y,z} in degrees.' },
          active: { type: 'boolean', description: 'Optional active state.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('setNodeTransform', args),
    },
    {
      name: 'get_project_info',
      profile: 'core',
      description: '[specialist] Return the active Cocos project path, version, and MCP server configuration. Prefer this for a fast structured project summary; use execute_javascript when you need to inspect and act in one step.',
      inputSchema: createSchema({}, []),
      handler: async () => getRuntimeContext(),
    },
    {
      name: 'list_scenes',
      profile: 'core',
      description: '[specialist] List scene assets in the project. Prefer this when you need exact scene discovery before opening one; otherwise stay in execute_javascript for broader workflows.',
      inputSchema: createSchema(
        {
          pattern: { type: 'string', description: 'Optional asset-db pattern. Defaults to db://assets/**.' },
        },
        []
      ),
      handler: async (args) => {
        const assets = await listAssets({ pattern: args.pattern || 'db://assets/**', ccType: 'cc.SceneAsset' });
        return { count: assets.length, scenes: assets.slice(0, 200) };
      },
    },
    {
      name: 'open_scene',
      profile: 'core',
      description: '[specialist] Open a scene asset in Cocos Creator by uuid, db url, or path. Use this when scene switching is the explicit goal; otherwise keep execute_javascript as the main planning tool.',
      inputSchema: createSchema(
        {
          target: { type: 'string', description: 'Scene uuid, db url, or path.' },
        },
        ['target']
      ),
      handler: async (args) => await openAsset(args.target),
    },
    {
      name: 'list_prefabs',
      profile: 'full',
      description: '[core] List prefab assets in the project.',
      inputSchema: createSchema(
        {
          pattern: { type: 'string', description: 'Optional asset-db pattern. Defaults to db://assets/**.' },
        },
        []
      ),
      handler: async (args) => {
        const assets = await listAssets({ pattern: args.pattern || 'db://assets/**', ccType: 'cc.Prefab' });
        return { count: assets.length, prefabs: assets.slice(0, 200) };
      },
    },
    {
      name: 'inspect_prefab',
      profile: 'core',
      description: '[specialist] Inspect a prefab asset, its metadata, serialized file path, and UUID-like asset references.',
      inputSchema: createSchema(
        {
          target: { type: 'string', description: 'Prefab uuid, db url, or project path.' },
        },
        ['target']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        return await inspectPrefab(projectPath, args.target);
      },
    },
    {
      name: 'validate_prefab_references',
      profile: 'core',
      description: '[specialist] Validate prefab asset references by checking serialized UUID references against asset-db.',
      inputSchema: createSchema(
        {
          target: { type: 'string', description: 'Optional prefab uuid, db url, or path. When omitted, scans prefab assets.' },
          pattern: { type: 'string', description: 'Optional asset-db pattern used when scanning prefabs.' },
          limit: { type: 'number', description: 'Maximum prefab assets to scan when target is omitted.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        return await validatePrefabReferences(projectPath, args);
      },
    },
    {
      name: 'duplicate_prefab',
      profile: 'full',
      description: '[core] Create a new prefab asset by duplicating an existing prefab file without copying its .meta UUID.',
      inputSchema: createSchema(
        {
          source: { type: 'string', description: 'Source prefab uuid, db url, or project path.' },
          target: { type: 'string', description: 'Project-relative target path under assets, with or without .prefab.' },
          overwrite: { type: 'boolean', description: 'Overwrite target prefab if it already exists.' },
        },
        ['source', 'target']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const result = await duplicatePrefab(projectPath, args);
        return { ...result, refresh: await refreshAssets(projectPath, resolveProjectPath(projectPath, result.target)) };
      },
    },
    {
      name: 'edit_prefab_json',
      profile: 'full',
      description: '[core] Edit a prefab JSON file by JSON path assignment or literal search/replace, then validate references.',
      inputSchema: createSchema(
        {
          target: { type: 'string', description: 'Prefab uuid, db url, or project path.' },
          jsonPath: { type: 'string', description: 'JSON path such as /0/_name or 0._name when assigning valueJson.' },
          valueJson: { type: 'string', description: 'JSON encoded value to assign at jsonPath.' },
          search: { type: 'string', description: 'Literal text to search for instead of jsonPath assignment.' },
          replace: { type: 'string', description: 'Replacement text for literal search.' },
          replaceAll: { type: 'boolean', description: 'Replace all literal matches.' },
          createBackup: { type: 'boolean', description: 'Create a .bak file before writing.' },
        },
        ['target']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const result = await editPrefabJson(projectPath, args);
        return { ...result, refresh: await refreshAssets(projectPath, resolveProjectPath(projectPath, result.path)) };
      },
    },
    {
      name: 'create_prefab_instance',
      profile: 'full',
      description: '[core] Create a linked prefab instance in the editor hierarchy using Cocos scene create-node when available.',
      inputSchema: createSchema(
        {
          prefabUuid: { type: 'string', description: 'Prefab asset uuid, db url, or path.' },
          parentPath: { type: 'string', description: 'Optional parent node path.' },
          name: { type: 'string', description: 'Optional override node name.' },
          position: { type: 'object', description: 'Optional position {x,y,z}; fallback runtime path only.' },
        },
        ['prefabUuid']
      ),
      handler: async (args) => {
        const info = await queryAssetInfo(args.prefabUuid);
        const payload = {
          assetUuid: info.uuid || args.prefabUuid,
          unlinkPrefab: false,
        };
        if (args.parentPath) {
          payload.parent = await resolveNodeUuid(sceneBridge, { path: args.parentPath });
        }
        if (args.name) {
          payload.name = args.name;
        }

        if (global.Editor && Editor.Message && typeof Editor.Message.request === 'function') {
          try {
            const createdUuid = await Editor.Message.request('scene', 'create-node', payload);
            return {
              created: true,
              linkedPrefab: true,
              prefabUuid: payload.assetUuid,
              uuid: createdUuid,
            };
          } catch (error) {
            runtimeLog && runtimeLog.add('warn', `Linked prefab create-node failed: ${error.message}`);
          }
        }

        return await sceneBridge.call('instantiatePrefab', {
          ...args,
          prefabUuid: info.uuid || args.prefabUuid,
        });
      },
    },
    {
      name: 'inspect_prefab_instance',
      profile: 'core',
      description: '[specialist] Inspect whether a scene node is linked to a prefab instance and return prefab metadata when available.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('getPrefabInstanceInfo', args),
    },
    {
      name: 'apply_prefab_instance',
      profile: 'full',
      description: '[core] Apply a scene prefab instance back to its associated prefab asset using the Cocos editor scene apply-prefab message.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
        },
        []
      ),
      handler: async (args) => await applyPrefabInstance(await resolveNodeUuid(sceneBridge, args)),
    },
    {
      name: 'revert_prefab_instance',
      profile: 'full',
      description: '[core] Revert a scene prefab instance from its associated prefab asset using available Cocos editor prefab revert messages.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
        },
        []
      ),
      handler: async (args) => await revertPrefabInstance(await resolveNodeUuid(sceneBridge, args)),
    },
    {
      name: 'instantiate_prefab',
      profile: 'full',
      description: 'Instantiate a prefab into the active scene by prefab uuid.',
      inputSchema: createSchema(
        {
          prefabUuid: { type: 'string', description: 'Prefab asset uuid.' },
          parentPath: { type: 'string', description: 'Optional parent node path.' },
          name: { type: 'string', description: 'Optional override node name.' },
          position: { type: 'object', description: 'Optional position {x,y,z}.' },
        },
        ['prefabUuid']
      ),
      handler: async (args) => sceneBridge.call('instantiatePrefab', args),
    },
    {
      name: 'run_scene_asset',
      profile: 'full',
      description: 'Load a scene asset by uuid directly into the current runtime scene context.',
      inputSchema: createSchema(
        {
          sceneUuid: { type: 'string', description: 'Scene asset uuid.' },
        },
        ['sceneUuid']
      ),
      handler: async (args) => sceneBridge.call('runSceneAsset', args),
    },
    {
      name: 'list_assets',
      profile: 'core',
      description: '[specialist] Query project assets from asset-db by pattern or asset type. Prefer this when you need exact asset discovery; otherwise use execute_javascript for broader automation.',
      inputSchema: createSchema(
        {
          pattern: { type: 'string', description: 'Optional asset-db pattern such as db://assets/** or a folder url.' },
          ccType: { type: 'string', description: 'Optional Cocos asset type, such as cc.Prefab or cc.SceneAsset.' },
        },
        []
      ),
      handler: async (args) => {
        const assets = await listAssets(args);
        return {
          count: assets.length,
          assets: assets.slice(0, 200),
        };
      },
    },
    {
      name: 'inspect_asset',
      profile: 'core',
      description: '[specialist] Inspect asset-db info, metadata, and serialized asset data by uuid or path. Prefer this when you need a precise structured asset read.',
      inputSchema: createSchema(
        {
          target: { type: 'string', description: 'Asset uuid, db url, or path.' },
          includeData: { type: 'boolean', description: 'Include serialized asset data when available.' },
        },
        ['target']
      ),
      handler: async (args) => {
        const info = await queryAssetInfo(args.target);
        const meta = await queryAssetMeta(args.target).catch(() => null);
        const data = args.includeData ? await queryAssetData(args.target).catch(() => null) : null;
        return { info, meta, data };
      },
    },
    {
      name: 'open_asset',
      profile: 'core',
      description: '[specialist] Open an asset inside Cocos Creator by uuid, db url, or path. Use this only when opening the asset itself is the explicit next step.',
      inputSchema: createSchema(
        {
          target: { type: 'string', description: 'Asset uuid, db url, or path.' },
        },
        ['target']
      ),
      handler: async (args) => await openAsset(args.target),
    },
    {
      name: 'delete_asset',
      profile: 'full',
      description: 'Delete an asset from asset-db by uuid, db url, or path.',
      inputSchema: createSchema(
        {
          target: { type: 'string', description: 'Asset uuid, db url, or path.' },
        },
        ['target']
      ),
      handler: async (args) => await deleteAsset(args.target),
    },
    {
      name: 'select_asset',
      profile: 'core',
      description: '[specialist] Select an asset in the Cocos editor. Use this when editor selection state matters; otherwise keep execute_javascript as the primary workflow.',
      inputSchema: createSchema(
        {
          target: { type: 'string', description: 'Asset uuid, db url, or path.' },
        },
        ['target']
      ),
      handler: async (args) => {
        const info = await queryAssetInfo(args.target);
        return selectAsset(info.uuid || args.target);
      },
    },
    {
      name: 'get_editor_selection',
      profile: 'full',
      description: '[compat] Return the current node and asset selection in the Cocos editor. Prefer get_selection as the primary structured selection read tool.',
      inputSchema: createSchema({}, []),
      handler: async () => getCurrentSelection(),
    },
    {
      name: 'list_components',
      profile: 'full',
      description: '[core] List components attached to a scene node.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('listComponents', args),
    },
    {
      name: 'inspect_component',
      profile: 'full',
      description: '[core] Inspect a component attached to a node.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
          componentName: { type: 'string', description: 'Component class name.' },
          index: { type: 'number', description: 'Optional component index.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('inspectComponent', args),
    },
    {
      name: 'add_component',
      profile: 'full',
      description: 'Add a component to a node by component class name.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
          componentName: { type: 'string', description: 'Component class name, for example Sprite or cc.UITransform.' },
        },
        ['componentName']
      ),
      handler: async (args) => sceneBridge.call('addComponent', args),
    },
    {
      name: 'remove_component',
      profile: 'full',
      description: 'Remove a component from a node by name or index.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
          componentName: { type: 'string', description: 'Component class name.' },
          index: { type: 'number', description: 'Optional component index.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('removeComponent', args),
    },
    {
      name: 'set_component_property',
      profile: 'full',
      description: 'Set a component property by dot path using a JSON value.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
          componentName: { type: 'string', description: 'Component class name.' },
          index: { type: 'number', description: 'Optional component index.' },
          propertyPath: { type: 'string', description: 'Property path such as color.r or enabled.' },
          valueJson: { type: 'string', description: 'JSON encoded value to assign, for example true, 12, \"hero\", or {\"x\":1}.' },
        },
        ['propertyPath', 'valueJson']
      ),
      handler: async (args) => {
        let value;
        try {
          value = JSON.parse(args.valueJson);
        } catch (error) {
          throw new Error(`valueJson must be valid JSON: ${error.message}`);
        }
        return sceneBridge.call('setComponentProperty', { ...args, value });
      },
    },
    {
      name: 'reset_component_property',
      profile: 'full',
      description: 'Reset or clear a component property by dot path.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
          componentName: { type: 'string', description: 'Component class name.' },
          index: { type: 'number', description: 'Optional component index.' },
          propertyPath: { type: 'string', description: 'Property path such as color.r or enabled.' },
        },
        ['propertyPath']
      ),
      handler: async (args) => sceneBridge.call('resetComponentProperty', args),
    },
    {
      name: 'create_canvas',
      profile: 'full',
      description: 'Create a Cocos Canvas node with UITransform.',
      inputSchema: createSchema(
        {
          name: { type: 'string', description: 'Canvas node name.' },
          parentPath: { type: 'string', description: 'Optional parent node path.' },
          width: { type: 'number', description: 'Canvas width.' },
          height: { type: 'number', description: 'Canvas height.' },
          position: { type: 'object', description: 'Optional position {x,y,z}.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('createCanvas', args),
    },
    {
      name: 'create_label',
      profile: 'full',
      description: 'Create a UI Label node under a parent.',
      inputSchema: createSchema(
        {
          name: { type: 'string', description: 'Label node name.' },
          parentPath: { type: 'string', description: 'Optional parent node path.' },
          text: { type: 'string', description: 'Label text.' },
          fontSize: { type: 'number', description: 'Font size.' },
          width: { type: 'number', description: 'UI width.' },
          height: { type: 'number', description: 'UI height.' },
          color: { type: 'string', description: 'Text color as #RRGGBB or #RRGGBBAA.' },
          position: { type: 'object', description: 'Optional position {x,y,z}.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('createLabel', args),
    },
    {
      name: 'create_button',
      profile: 'full',
      description: 'Create a UI Button node with child Label.',
      inputSchema: createSchema(
        {
          name: { type: 'string', description: 'Button node name.' },
          parentPath: { type: 'string', description: 'Optional parent node path.' },
          text: { type: 'string', description: 'Button text.' },
          width: { type: 'number', description: 'Button width.' },
          height: { type: 'number', description: 'Button height.' },
          fontSize: { type: 'number', description: 'Text font size.' },
          backgroundColor: { type: 'string', description: 'Background color as #RRGGBB or #RRGGBBAA.' },
          textColor: { type: 'string', description: 'Text color as #RRGGBB or #RRGGBBAA.' },
          position: { type: 'object', description: 'Optional position {x,y,z}.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('createButton', args),
    },
    {
      name: 'create_sprite',
      profile: 'full',
      description: 'Create a UI Sprite node, optionally assigning a SpriteFrame asset uuid.',
      inputSchema: createSchema(
        {
          name: { type: 'string', description: 'Sprite node name.' },
          parentPath: { type: 'string', description: 'Optional parent node path.' },
          spriteFrameUuid: { type: 'string', description: 'Optional SpriteFrame asset uuid.' },
          width: { type: 'number', description: 'UI width.' },
          height: { type: 'number', description: 'UI height.' },
          color: { type: 'string', description: 'Sprite color as #RRGGBB or #RRGGBBAA.' },
          position: { type: 'object', description: 'Optional position {x,y,z}.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('createSprite', args),
    },
    {
      name: 'list_cameras',
      profile: 'full',
      description: '[core] List Camera components in the active scene.',
      inputSchema: createSchema({}, []),
      handler: async (args) => sceneBridge.call('listCameras', args),
    },
    {
      name: 'create_camera',
      profile: 'full',
      description: 'Create a Camera node in the active scene.',
      inputSchema: createSchema(
        {
          name: { type: 'string', description: 'Camera node name.' },
          parentPath: { type: 'string', description: 'Optional parent node path.' },
          priority: { type: 'number', description: 'Camera priority.' },
          visibility: { type: 'number', description: 'Camera visibility mask.' },
          clearFlags: { type: 'number', description: 'Camera clear flags.' },
          position: { type: 'object', description: 'Optional position {x,y,z}.' },
          eulerAngles: { type: 'object', description: 'Optional rotation {x,y,z}.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('createCamera', args),
    },
    {
      name: 'set_camera_properties',
      profile: 'full',
      description: 'Set selected Camera component properties.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Camera node path.' },
          uuid: { type: 'string', description: 'Camera node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
          priority: { type: 'number', description: 'Camera priority.' },
          visibility: { type: 'number', description: 'Camera visibility mask.' },
          clearFlags: { type: 'number', description: 'Camera clear flags.' },
          projection: { type: 'number', description: 'Projection enum value.' },
          orthoHeight: { type: 'number', description: 'Ortho height.' },
          fov: { type: 'number', description: 'Field of view.' },
          near: { type: 'number', description: 'Near clip.' },
          far: { type: 'number', description: 'Far clip.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('setCameraProperties', args),
    },
    {
      name: 'list_animations',
      profile: 'full',
      description: '[core] List Animation components in the active scene or under one node.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Optional node path.' },
          uuid: { type: 'string', description: 'Optional node uuid.' },
          name: { type: 'string', description: 'Optional exact node name.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('listAnimations', args),
    },
    {
      name: 'add_animation_clip',
      profile: 'full',
      description: 'Add an AnimationClip asset to a node Animation component.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
          clipUuid: { type: 'string', description: 'AnimationClip asset uuid.' },
          makeDefault: { type: 'boolean', description: 'Set this clip as defaultClip.' },
        },
        ['clipUuid']
      ),
      handler: async (args) => sceneBridge.call('addAnimationClip', args),
    },
    {
      name: 'play_animation',
      profile: 'full',
      description: '[core] Play an Animation component clip on a node.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
          clipName: { type: 'string', description: 'Optional clip name.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('playAnimation', args),
    },
    {
      name: 'stop_animation',
      profile: 'full',
      description: '[core] Stop an Animation component clip on a node.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
          clipName: { type: 'string', description: 'Optional clip name.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('stopAnimation', args),
    },
    ...createFileTools({ createSchema, getRuntimeContext }),
    {
      name: 'run_script_diagnostics',
      profile: 'core',
      description: '[specialist] Run a TypeScript no-emit check for the current Cocos project and return parsed diagnostics. This is a preferred specialist tool for script errors when diagnostics are needed.',
      inputSchema: createSchema(
        {
          tsconfigPath: { type: 'string', description: 'Optional path to the tsconfig file to use.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        return await runScriptDiagnostics(projectPath, args);
      },
    },
    {
      name: 'get_recent_logs',
      profile: 'core',
      description: '[specialist] Return recent MCP runtime logs, recent tool interactions, and tails of common project log files.',
      inputSchema: createSchema(
        {
          limit: { type: 'number', description: 'Maximum in-memory runtime/interactions to return.' },
          includeProjectLogs: { type: 'boolean', description: 'Include tails from common project log files.' },
          projectLogLines: { type: 'number', description: 'Tail lines to read per project log file.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(200, args.limit)) : 50;
        return {
          runtimeLogs: runtimeLog && typeof runtimeLog.list === 'function' ? runtimeLog.list(limit) : [],
          interactions: interactionLog && typeof interactionLog.list === 'function' ? interactionLog.list(limit) : [],
          projectLogs: args.includeProjectLogs === false
            ? []
            : getRecentProjectLogs(projectPath, {
                limit: 10,
                lines: Number.isFinite(args.projectLogLines) ? args.projectLogLines : 80,
              }),
        };
      },
    },
    {
      name: 'search_project_logs',
      profile: 'core',
      description: '[specialist] Search common Cocos project log files for a string or regular expression.',
      inputSchema: createSchema(
        {
          query: { type: 'string', description: 'Text or regex pattern to search for.' },
          regex: { type: 'boolean', description: 'Treat query as a JavaScript regular expression.' },
          caseSensitive: { type: 'boolean', description: 'Use case-sensitive matching.' },
          limit: { type: 'number', description: 'Maximum matches to return.' },
          directory: { type: 'string', description: 'Optional project-relative log directory to search.' },
        },
        ['query']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        return searchProjectLogs(projectPath, args);
      },
    },
    {
      name: 'clear_logs',
      profile: 'core',
      description: '[specialist] Clear in-memory MCP logs and, only with explicit confirmation, truncate common project log files.',
      inputSchema: createSchema(
        {
          scope: { type: 'string', description: 'mcp, project, or all. Defaults to mcp.' },
          confirmProjectLogs: { type: 'boolean', description: 'Required when scope includes project log files.' },
          directory: { type: 'string', description: 'Optional project-relative log directory to clear.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const scope = String(args.scope || 'mcp').toLowerCase();
        const clearMcp = scope === 'mcp' || scope === 'all';
        const clearProject = scope === 'project' || scope === 'all';
        const result = {
          runtimeLogEntriesCleared: 0,
          interactionEntriesCleared: 0,
          projectLogFilesCleared: [],
        };

        if (clearMcp) {
          result.runtimeLogEntriesCleared = runtimeLog && typeof runtimeLog.clear === 'function' ? runtimeLog.clear() : 0;
          result.interactionEntriesCleared = interactionLog && typeof interactionLog.clear === 'function' ? interactionLog.clear() : 0;
        }

        if (clearProject) {
          if (!args.confirmProjectLogs) {
            throw new Error('confirmProjectLogs=true is required before truncating project log files.');
          }
          result.projectLogFilesCleared = clearProjectLogFiles(projectPath, { directory: args.directory, limit: 50 });
        }

        if (!clearMcp && !clearProject) {
          throw new Error("scope must be 'mcp', 'project', or 'all'.");
        }

        return result;
      },
    },
    {
      name: 'validate_scene',
      profile: 'core',
      description: '[specialist] Run a compact validation pass over the active scene, runtime state, TypeScript diagnostics, and recent project log errors.',
      inputSchema: createSchema(
        {
          maxDepth: { type: 'number', description: 'Scene hierarchy depth for the scene snapshot.' },
          includeScriptDiagnostics: { type: 'boolean', description: 'Run TypeScript diagnostics as part of validation.' },
          includeLogErrors: { type: 'boolean', description: 'Search project logs for error lines.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const scene = await sceneBridge.call('getSceneInfo', {
          maxDepth: Number.isFinite(args.maxDepth) ? args.maxDepth : 2,
          includeComponents: true,
        }).catch((error) => ({ ok: false, error: error.message }));
        const runtime = await sceneBridge.call('getRuntimeState', {}).catch((error) => ({ ok: false, error: error.message }));
        const performance = await sceneBridge.call('getPerformanceSnapshot', {}).catch((error) => ({ ok: false, error: error.message }));
        const diagnostics = args.includeScriptDiagnostics === false
          ? null
          : summarizeDiagnostics(await runScriptDiagnostics(projectPath, args).catch((error) => ({ ok: false, summary: error.message, diagnostics: [] })));
        const logErrors = args.includeLogErrors === false
          ? null
          : searchProjectLogs(projectPath, { query: 'error', limit: 20 }).matches;

        return {
          ok: !scene.error && !runtime.error && !performance.error && (!diagnostics || diagnostics.ok) && (!logErrors || logErrors.length === 0),
          scene,
          runtime,
          performance,
          diagnostics,
          logErrors,
        };
      },
    },
    {
      name: 'get_performance_snapshot',
      profile: 'core',
      description: '[specialist] Return scene scale and runtime performance-oriented counters such as node/component counts, UI counts, depth, memory, and warnings.',
      inputSchema: createSchema({}, []),
      handler: async (args) => sceneBridge.call('getPerformanceSnapshot', args),
    },
    {
      name: 'get_runtime_state',
      profile: 'core',
      description: '[specialist] Return structured Cocos runtime state including pause state, frame count, and scheduler time scale. Prefer this when you want a compact validation snapshot.',
      inputSchema: createSchema({}, []),
      handler: async (args) => sceneBridge.call('getRuntimeState', args),
    },
    {
      name: 'pause_runtime',
      profile: 'full',
      description: '[core] Pause Cocos director game logic execution.',
      inputSchema: createSchema({}, []),
      handler: async (args) => sceneBridge.call('pauseRuntime', args),
    },
    {
      name: 'resume_runtime',
      profile: 'full',
      description: '[core] Resume Cocos director game logic execution.',
      inputSchema: createSchema({}, []),
      handler: async (args) => sceneBridge.call('resumeRuntime', args),
    },
    {
      name: 'set_time_scale',
      profile: 'full',
      description: '[core] Set Cocos scheduler time scale for runtime validation.',
      inputSchema: createSchema(
        {
          scale: { type: 'number', description: 'Time scale from 0 to 100.' },
        },
        ['scale']
      ),
      handler: async (args) => sceneBridge.call('setTimeScale', args),
    },
    {
      name: 'emit_node_event',
      profile: 'full',
      description: '[core] Emit a custom event on a target scene node with an optional JSON payload.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
          eventName: { type: 'string', description: 'Event name to emit.' },
          payload: { type: 'object', description: 'Optional event payload object.' },
        },
        ['eventName']
      ),
      handler: async (args) => sceneBridge.call('emitNodeEvent', args),
    },
    {
      name: 'simulate_button_click',
      profile: 'full',
      description: '[core] Simulate a Cocos Button click by emitting click events on the target button node.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Button node hierarchy path.' },
          uuid: { type: 'string', description: 'Button node uuid.' },
          name: { type: 'string', description: 'Fallback exact button node name.' },
        },
        []
      ),
      handler: async (args) => sceneBridge.call('simulateButtonClick', args),
    },
    {
      name: 'invoke_component_method',
      profile: 'full',
      description: '[core] Invoke a method on a component for runtime validation and test hooks.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Node hierarchy path.' },
          uuid: { type: 'string', description: 'Node uuid.' },
          name: { type: 'string', description: 'Fallback exact node name.' },
          componentName: { type: 'string', description: 'Component class name.' },
          index: { type: 'number', description: 'Optional component index.' },
          methodName: { type: 'string', description: 'Method name to invoke.' },
          args: { type: 'array', description: 'Optional argument array.' },
        },
        ['methodName']
      ),
      handler: async (args) => sceneBridge.call('invokeComponentMethod', args),
    },
    {
      name: 'get_script_diagnostic_context',
      profile: 'core',
      description: '[specialist] Run TypeScript diagnostics and attach source snippets for each error. This is a preferred specialist tool for compile-error triage before repair.',
      inputSchema: createSchema(
        {
          tsconfigPath: { type: 'string', description: 'Optional path to the tsconfig file to use.' },
          contextLines: { type: 'number', description: 'Number of surrounding source lines per diagnostic.' },
          limit: { type: 'number', description: 'Maximum diagnostics to include.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const result = await runScriptDiagnostics(projectPath, args);
        const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(50, args.limit)) : 10;
        const contextLines = Number.isFinite(args.contextLines) ? Math.max(0, Math.min(20, args.contextLines)) : 3;
        const diagnostics = result.diagnostics.slice(0, limit).map((diagnostic) => ({
          ...diagnostic,
          snippet: fs.existsSync(diagnostic.file)
            ? buildSnippet(diagnostic.file, diagnostic.line, contextLines)
            : 'Source file not found.',
        }));

        return {
          ...result,
          diagnostics,
        };
      },
    },
    {
      name: 'capture_desktop_screenshot',
      profile: 'full',
      description: '[core] Capture a screenshot from the local desktop and return it as an MCP image payload.',
      inputSchema: createSchema(
        {
          fileName: { type: 'string', description: 'Optional output file name under temp/mcp-captures.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const result = await captureDesktopScreenshot(projectPath, args);
        return result.dataUri;
      },
    },
    {
      name: 'capture_editor_screenshot',
      profile: 'core',
      description: '[specialist] Capture the focused Cocos Creator editor window and return it as an MCP image payload. Prefer screenshot tools only when visual verification is explicitly needed.',
      inputSchema: createSchema(
        {
          fileName: { type: 'string', description: 'Optional output file name under temp/mcp-captures.' },
          titleContains: { type: 'string', description: 'Optional window title substring fallback if no window is focused.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const result = await captureEditorWindowScreenshot(projectPath, args);
        return result.dataUri;
      },
    },
    {
      name: 'capture_scene_screenshot',
      profile: 'core',
      description: '[specialist] Capture the Scene panel region from the editor window with panel-level cropping when available. Prefer this only for visual validation of scene-side results.',
      inputSchema: createSchema(
        {
          fileName: { type: 'string', description: 'Optional output file name under temp/mcp-captures.' },
          windowKind: { type: 'string', description: 'Window target kind: focused, editor, simulator, or preview.' },
          titleContains: { type: 'string', description: 'Optional window title substring fallback if no window is focused.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const result = await capturePanelScreenshot(projectPath, { ...args, panel: 'scene', windowKind: args.windowKind || 'editor' });
        return result.dataUri;
      },
    },
    {
      name: 'capture_game_screenshot',
      profile: 'full',
      description: '[core] Capture the Game/Preview panel region from the editor window with panel-level cropping when available.',
      inputSchema: createSchema(
        {
          fileName: { type: 'string', description: 'Optional output file name under temp/mcp-captures.' },
          windowKind: { type: 'string', description: 'Window target kind: focused, editor, simulator, or preview.' },
          titleContains: { type: 'string', description: 'Optional window title substring fallback if no window is focused.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const result = await capturePanelScreenshot(projectPath, { ...args, panel: 'game', windowKind: args.windowKind || 'editor' });
        return result.dataUri;
      },
    },
    {
      name: 'list_editor_windows',
      profile: 'core',
      description: '[specialist] List available Electron windows so screenshots or input-targeting can choose the correct window. Use this when window targeting is the explicit problem.',
      inputSchema: createSchema({}, []),
      handler: async () => listWindows(),
    },
    {
      name: 'simulate_mouse_click',
      profile: 'full',
      description: '[core] Send a low-level Electron mouse click to the editor, preview, or simulator window.',
      inputSchema: createSchema(
        {
          windowKind: { type: 'string', description: 'Window target kind: focused, editor, simulator, or preview.' },
          panel: { type: 'string', description: 'Optional panel hint such as scene or game.' },
          titleContains: { type: 'string', description: 'Optional window title substring.' },
          x: { type: 'number', description: 'Panel-relative or window-relative x offset from center/focus target.' },
          y: { type: 'number', description: 'Panel-relative or window-relative y offset from center/focus target.' },
          button: { type: 'string', description: 'Mouse button: left, right, or middle.' },
          clickCount: { type: 'number', description: 'Click count.' },
          modifiers: { type: 'array', description: 'Optional key modifiers array.' },
        },
        []
      ),
      handler: async (args) => await sendMouseClick(args),
    },
    {
      name: 'simulate_mouse_drag',
      profile: 'full',
      description: '[core] Send a low-level Electron mouse drag to the editor, preview, or simulator window.',
      inputSchema: createSchema(
        {
          windowKind: { type: 'string', description: 'Window target kind: focused, editor, simulator, or preview.' },
          panel: { type: 'string', description: 'Optional panel hint such as scene or game.' },
          titleContains: { type: 'string', description: 'Optional window title substring.' },
          startX: { type: 'number', description: 'Start x offset.' },
          startY: { type: 'number', description: 'Start y offset.' },
          endX: { type: 'number', description: 'End x offset.' },
          endY: { type: 'number', description: 'End y offset.' },
          button: { type: 'string', description: 'Mouse button: left, right, or middle.' },
          steps: { type: 'number', description: 'How many intermediate move steps to send.' },
          stepDelayMs: { type: 'number', description: 'Optional delay between drag steps.' },
          modifiers: { type: 'array', description: 'Optional key modifiers array.' },
        },
        []
      ),
      handler: async (args) => await sendMouseDrag(args),
    },
    {
      name: 'simulate_key_press',
      profile: 'full',
      description: '[core] Send a low-level Electron key press to the editor, preview, or simulator window.',
      inputSchema: createSchema(
        {
          windowKind: { type: 'string', description: 'Window target kind: focused, editor, simulator, or preview.' },
          panel: { type: 'string', description: 'Optional panel hint such as scene or game.' },
          titleContains: { type: 'string', description: 'Optional window title substring.' },
          keyCode: { type: 'string', description: 'Electron keyCode such as A, Space, Enter, ArrowLeft.' },
          text: { type: 'string', description: 'Optional text payload for char events.' },
          modifiers: { type: 'array', description: 'Optional key modifiers array.' },
        },
        ['keyCode']
      ),
      handler: async (args) => await sendKeyPress(args),
    },
    {
      name: 'simulate_key_combo',
      profile: 'full',
      description: '[core] Send a low-level Electron modified key press such as Ctrl+S or Cmd+P.',
      inputSchema: createSchema(
        {
          windowKind: { type: 'string', description: 'Window target kind: focused, editor, simulator, or preview.' },
          panel: { type: 'string', description: 'Optional panel hint such as scene or game.' },
          titleContains: { type: 'string', description: 'Optional window title substring.' },
          keyCode: { type: 'string', description: 'Electron keyCode such as S, P, Enter.' },
          modifiers: { type: 'array', description: 'Modifier array such as [\"command\"] or [\"control\",\"shift\"].' },
        },
        ['keyCode', 'modifiers']
      ),
      handler: async (args) => await sendKeyCombo(args),
    },
    {
      name: 'simulate_preview_input',
      profile: 'full',
      description: '[core] Convenience wrapper for low-level preview/simulator input. Uses mouse click by default or key press when keyCode is provided.',
      inputSchema: createSchema(
        {
          windowKind: { type: 'string', description: 'Window target kind, usually preview or simulator.' },
          panel: { type: 'string', description: 'Optional panel hint such as game.' },
          titleContains: { type: 'string', description: 'Optional window title substring.' },
          mode: { type: 'string', description: 'click, drag, key, or combo.' },
          x: { type: 'number', description: 'Mouse x offset.' },
          y: { type: 'number', description: 'Mouse y offset.' },
          startX: { type: 'number', description: 'Drag start x offset.' },
          startY: { type: 'number', description: 'Drag start y offset.' },
          endX: { type: 'number', description: 'Drag end x offset.' },
          endY: { type: 'number', description: 'Drag end y offset.' },
          keyCode: { type: 'string', description: 'Electron keyCode for key or combo mode.' },
          text: { type: 'string', description: 'Optional char payload.' },
          button: { type: 'string', description: 'Mouse button.' },
          modifiers: { type: 'array', description: 'Modifier array.' },
        },
        []
      ),
      handler: async (args) => {
        const mode = String(args.mode || (args.keyCode ? 'key' : 'click')).toLowerCase();
        const base = { ...args, windowKind: args.windowKind || 'preview', panel: args.panel || 'game' };
        if (mode === 'drag') return await sendMouseDrag(base);
        if (mode === 'combo') return await sendKeyCombo(base);
        if (mode === 'key') return await sendKeyPress(base);
        return await sendMouseClick(base);
      },
    },
    {
      name: 'capture_preview_screenshot',
      profile: 'core',
      description: '[specialist] Capture the preview or simulator window as an MCP image payload. Prefer this only when you need visual proof of game or preview output.',
      inputSchema: createSchema(
        {
          fileName: { type: 'string', description: 'Optional output file name under temp/mcp-captures.' },
          windowKind: { type: 'string', description: 'Window target kind, usually preview or simulator.' },
          titleContains: { type: 'string', description: 'Optional window title substring.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const result = await capturePanelScreenshot(projectPath, { ...args, panel: 'game', windowKind: args.windowKind || 'preview' });
        return result.dataUri;
      },
    },
  ];

  const registry = {
    listTools() {
      const { config } = getRuntimeContext();
      return tools
        .filter((tool) => isToolExposed(config || {}, tool))
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema || createOutputSchema(tool.dataSchema),
          annotations: inferToolAnnotations(tool),
        }));
    },
    listToolCatalog() {
      const { config } = getRuntimeContext();
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        profile: tool.profile,
        category: toolCategory(tool),
        annotations: inferToolAnnotations(tool),
        outputSchema: tool.outputSchema || createOutputSchema(tool.dataSchema),
        enabled: isToolExposed(config || {}, tool),
      }));
    },
    async callToolDetailed(name, args) {
      const { config } = getRuntimeContext();
      const tool = tools.find((item) => item.name === name);
      if (!tool) {
        throw new Error(`Unknown tool '${name}'`);
      }
      if (!isToolExposed(config || {}, tool)) {
        throw new Error(`Tool '${name}' is not exposed by the current MCP tool profile '${config.toolProfile}'.`);
      }

      try {
        const result = await tool.handler(args || {});
        const envelope = createResultEnvelope(tool, args || {}, result);
        const output = typeof result === 'string' && result.startsWith(IMAGE_DATA_URI_PREFIX)
          ? result
          : toOutput(envelope);
        interactionLog.add(name, 'success', envelope.summary.slice(0, 500));
        return {
          value: envelope,
          text: output,
        };
      } catch (error) {
        interactionLog.add(name, 'error', error.message);
        error.toolEnvelope = createResultEnvelope(tool, args || {}, { message: error.message }, {
          ok: false,
          summary: error.message,
        });
        throw error;
      }
    },
    async callTool(name, args) {
      const result = await registry.callToolDetailed(name, args);
      return result.text;
    },
  };

  return registry;
}

module.exports = {
  createToolRegistry,
};

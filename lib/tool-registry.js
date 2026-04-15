'use strict';

const fs = require('fs');
const path = require('path');
const {
  deleteAsset,
  getCurrentSelection,
  listAssets,
  openAsset,
  queryAssetData,
  queryAssetInfo,
  queryAssetMeta,
  selectAsset,
} = require('./assets');
const { runScriptDiagnostics } = require('./diagnostics');
const { listWindows, sendKeyCombo, sendKeyPress, sendMouseClick, sendMouseDrag } = require('./input');
const { captureDesktopScreenshot, captureEditorWindowScreenshot, capturePanelScreenshot } = require('./screenshots');
const { safeStringify } = require('./utils');

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

function toOutput(value) {
  if (typeof value === 'string') {
    return value;
  }
  return safeStringify(value);
}

function resolveProjectPath(projectPath, rawPath) {
  return path.isAbsolute(rawPath) ? rawPath : path.join(projectPath, rawPath);
}

function matchesPattern(fileName, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(fileName);
}

function searchFiles(rootDir, pattern, limit) {
  const results = [];
  if (!fs.existsSync(rootDir)) {
    return results;
  }

  const stack = [rootDir];
  while (stack.length && results.length < limit) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'temp' || entry.name === 'library') {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (matchesPattern(entry.name, pattern)) {
        results.push(fullPath);
        if (results.length >= limit) {
          break;
        }
      }
    }
  }

  return results;
}

function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function buildSnippet(filePath, lineNumber, contextLines = 3) {
  const lines = readLines(filePath);
  const start = Math.max(1, Number(lineNumber || 1) - Math.max(0, contextLines));
  const end = Math.min(lines.length, Number(lineNumber || 1) + Math.max(0, contextLines));
  const snippet = [];
  for (let line = start; line <= end; line += 1) {
    const marker = line === Number(lineNumber || 1) ? '>' : ' ';
    snippet.push(`${marker} ${String(line).padStart(4, ' ')} | ${lines[line - 1]}`);
  }
  return snippet.join('\n');
}

function replaceAllLiteral(content, search, replacement) {
  if (!search) {
    throw new Error('search text is required.');
  }
  return content.split(search).join(replacement);
}

async function refreshAssets(projectPath, targetPath) {
  if (!global.Editor || !Editor.Message || typeof Editor.Message.request !== 'function') {
    return 'Asset refresh API is unavailable; Cocos Creator should pick up file changes automatically.';
  }

  const relative = path.relative(path.join(projectPath, 'assets'), targetPath).replace(/\\/g, '/');
  if (!relative.startsWith('..')) {
    const dbUrl = `db://assets/${relative}`;
    try {
      await Editor.Message.request('asset-db', 'refresh-asset', dbUrl);
      return `Refreshed asset database for ${dbUrl}`;
    } catch (error) {
      try {
        await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
        return `Refreshed asset database after writing ${dbUrl}`;
      } catch (innerError) {
        return `File written, but asset refresh failed: ${innerError.message}`;
      }
    }
  }

  return 'File written outside assets directory; no asset-db refresh was needed.';
}

function createToolRegistry({ getRuntimeContext, interactionLog, sceneBridge, editorExecutor }) {
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
      name: 'get_scene_info',
      profile: 'core',
      description: '[core] Get a summary of the active Cocos scene.',
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
      description: '[core] Browse the scene hierarchy tree from the active scene or a specific node path.',
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
      description: '[core] Return the active Cocos project path, version, and MCP server configuration.',
      inputSchema: createSchema({}, []),
      handler: async () => getRuntimeContext(),
    },
    {
      name: 'list_scenes',
      profile: 'core',
      description: '[core] List scene assets in the project.',
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
      description: '[core] Open a scene asset in Cocos Creator by uuid, db url, or path.',
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
      description: '[core] Query project assets from asset-db by pattern or asset type.',
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
      description: '[core] Inspect asset-db info, metadata, and serialized asset data by uuid or path.',
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
      description: '[core] Open an asset inside Cocos Creator by uuid, db url, or path.',
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
      description: '[core] Select an asset in the Cocos editor.',
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
      description: '[core] Return the current node and asset selection in the Cocos editor.',
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
    {
      name: 'read_file',
      profile: 'full',
      description: '[core] Read a file from the Cocos project.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Project-relative or absolute file path.' },
        },
        ['path']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const fullPath = resolveProjectPath(projectPath, args.path);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`File not found: ${args.path}`);
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        return content.length > 12000 ? `${content.slice(0, 12000)}\n... (truncated)` : content;
      },
    },
    {
      name: 'get_file_snippet',
      profile: 'full',
      description: '[core] Read a focused snippet around a file line number.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Project-relative or absolute file path.' },
          line: { type: 'number', description: 'Target line number, starting at 1.' },
          contextLines: { type: 'number', description: 'Number of surrounding context lines.' },
        },
        ['path', 'line']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const fullPath = resolveProjectPath(projectPath, args.path);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`File not found: ${args.path}`);
        }
        return buildSnippet(fullPath, args.line, Number.isFinite(args.contextLines) ? args.contextLines : 3);
      },
    },
    {
      name: 'write_file',
      profile: 'full',
      description: '[core] Write or overwrite a file in the Cocos project.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Project-relative or absolute file path.' },
          content: { type: 'string', description: 'File content to write.' },
        },
        ['path', 'content']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const fullPath = resolveProjectPath(projectPath, args.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, args.content, 'utf8');
        return `Wrote ${args.content.length} chars to ${args.path}\n${await refreshAssets(projectPath, fullPath)}`;
      },
    },
    {
      name: 'replace_in_file',
      profile: 'full',
      description: '[core] Replace text in a file, useful for script auto-fix loops.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Project-relative or absolute file path.' },
          search: { type: 'string', description: 'Literal text to search for.' },
          replace: { type: 'string', description: 'Replacement text.' },
          replaceAll: { type: 'boolean', description: 'Replace every occurrence instead of only the first.' },
        },
        ['path', 'search', 'replace']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const fullPath = resolveProjectPath(projectPath, args.path);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`File not found: ${args.path}`);
        }

        const original = fs.readFileSync(fullPath, 'utf8');
        if (!original.includes(args.search)) {
          throw new Error(`Search text was not found in ${args.path}`);
        }

        const updated = args.replaceAll
          ? replaceAllLiteral(original, args.search, args.replace)
          : original.replace(args.search, args.replace);

        fs.writeFileSync(fullPath, updated, 'utf8');
        return `Updated ${args.path} (${args.replaceAll ? 'all matches' : 'first match'})\n${await refreshAssets(projectPath, fullPath)}`;
      },
    },
    {
      name: 'search_files',
      profile: 'full',
      description: '[core] Search project files by simple wildcard pattern.',
      inputSchema: createSchema(
        {
          pattern: { type: 'string', description: "Wildcard file pattern such as '*.ts' or 'Player*'." },
          directory: { type: 'string', description: 'Project-relative search root. Defaults to assets.' },
          limit: { type: 'number', description: 'Maximum number of results to return.' },
        },
        ['pattern']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const searchRoot = resolveProjectPath(projectPath, args.directory || 'assets');
        if (!fs.existsSync(searchRoot)) {
          throw new Error(`Directory not found: ${args.directory || 'assets'}`);
        }

        const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(500, args.limit)) : 100;
        const results = searchFiles(searchRoot, args.pattern, limit).map((fullPath) =>
          path.relative(projectPath, fullPath).replace(/\\/g, '/')
        );
        return {
          count: results.length,
          files: results,
        };
      },
    },
    {
      name: 'list_directory',
      profile: 'full',
      description: '[core] List files and directories inside a project directory.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Project-relative or absolute directory path.' },
        },
        ['path']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const targetPath = resolveProjectPath(projectPath, args.path);
        if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
          throw new Error(`Directory not found: ${args.path}`);
        }

        const entries = fs
          .readdirSync(targetPath, { withFileTypes: true })
          .filter((entry) => !entry.name.startsWith('.'))
          .map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
          }));
        return {
          path: args.path,
          entries,
        };
      },
    },
    {
      name: 'exists',
      profile: 'full',
      description: '[core] Check whether a project file or directory exists.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Project-relative or absolute path.' },
        },
        ['path']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const targetPath = resolveProjectPath(projectPath, args.path);
        return {
          path: args.path,
          exists: fs.existsSync(targetPath),
          isFile: fs.existsSync(targetPath) ? fs.statSync(targetPath).isFile() : false,
          isDirectory: fs.existsSync(targetPath) ? fs.statSync(targetPath).isDirectory() : false,
        };
      },
    },
    {
      name: 'refresh_assets',
      profile: 'full',
      description: '[core] Best-effort asset database refresh for a file or the assets root.',
      inputSchema: createSchema(
        {
          path: { type: 'string', description: 'Optional project-relative file path to refresh.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        const targetPath = resolveProjectPath(projectPath, args.path || 'assets');
        return await refreshAssets(projectPath, targetPath);
      },
    },
    {
      name: 'run_script_diagnostics',
      profile: 'core',
      description: '[core] Run a TypeScript no-emit check for the current Cocos project and return parsed diagnostics.',
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
      name: 'get_runtime_state',
      profile: 'core',
      description: '[core] Get Cocos director runtime state, pause state, frame count, and scheduler time scale.',
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
      description: '[core] Run TypeScript diagnostics and attach source snippets for each error.',
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
      description: '[core] Capture the focused Cocos Creator editor window using Electron and return it as an MCP image payload.',
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
      description: '[core] Capture the Scene panel region from the editor window with panel-level cropping when available.',
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
      description: '[core] List available Electron windows so input injection and precise screenshots can target the correct one.',
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
      description: '[core] Capture the preview/simulator window or game panel as an MCP image payload.',
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

  return {
    listTools() {
      const { config } = getRuntimeContext();
      return tools
        .filter((tool) => config.toolProfile === 'full' || tool.profile === 'core')
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }));
    },
    async callTool(name, args) {
      const { config } = getRuntimeContext();
      const tool = tools.find((item) => item.name === name);
      if (!tool) {
        throw new Error(`Unknown tool '${name}'`);
      }
      if (config.toolProfile !== 'full' && tool.profile !== 'core') {
        throw new Error(`Tool '${name}' is not exposed by the current MCP tool profile '${config.toolProfile}'.`);
      }

      try {
        const result = await tool.handler(args || {});
        const output = toOutput(result);
        interactionLog.add(name, 'success', output.slice(0, 500));
        return output;
      } catch (error) {
        interactionLog.add(name, 'error', error.message);
        throw error;
      }
    },
  };
}

module.exports = {
  createToolRegistry,
};

'use strict';

const fs = require('fs');
const path = require('path');
const { getCurrentSelection, queryAssetInfo, queryAssetMeta } = require('./assets');
const { runScriptDiagnostics } = require('./diagnostics');

function createResource(uri, name, description) {
  return { uri, name, description, mimeType: 'text/plain' };
}

function createTemplate(uriTemplate, name, description) {
  return { uriTemplate, name, description, mimeType: 'text/plain' };
}

function truncate(text, limit = 12000) {
  if (typeof text !== 'string') {
    return text;
  }
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n... (truncated)`;
}

function toText(value) {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function summarizeSelection() {
  if (!global.Editor || !Editor.Selection || typeof Editor.Selection.getSelected !== 'function') {
    return 'Selection API is unavailable in this Cocos environment.';
  }

  try {
    const selectedNode = Editor.Selection.getSelected('node');
    const selectedAsset = Editor.Selection.getSelected('asset');
    return [
      `Selected node: ${selectedNode || '(none)'}`,
      `Selected asset: ${selectedAsset || '(none)'}`,
    ].join('\n');
  } catch (error) {
    return `Failed to inspect current selection: ${error.message}`;
  }
}

class ResourceProvider {
  constructor(getRuntimeContext, sceneBridge, interactionLog) {
    this.getRuntimeContext = getRuntimeContext;
    this.sceneBridge = sceneBridge;
    this.interactionLog = interactionLog;
  }

  listResources() {
    const { projectName } = this.getRuntimeContext();
    return [
      createResource('cocos://project/context', `${projectName} Project Context`, 'Live Cocos project context summary.'),
      createResource('cocos://project/summary', `${projectName} Project Summary`, 'Project path, folder summary, and asset overview.'),
      createResource('cocos://scene/active', `${projectName} Active Scene`, 'Summary of the active Cocos scene.'),
      createResource('cocos://scene/current', `${projectName} Current Scene`, 'Alias of the active Cocos scene summary.'),
      createResource('cocos://selection/current', `${projectName} Current Selection`, 'Summary of the current editor selection.'),
      createResource('cocos://selection/asset', `${projectName} Selected Asset`, 'Details for the currently selected asset.'),
      createResource('cocos://errors/scripts', `${projectName} Script Diagnostics`, 'Latest TypeScript diagnostic summary for the project.'),
      createResource('cocos://mcp/interactions', `${projectName} MCP Interactions`, 'Recent MCP tool interaction summaries.'),
    ];
  }

  listResourceTemplates() {
    return [
      createTemplate('cocos://scene/node/{path}', 'Scene Node', 'Inspect a scene node by hierarchy path.'),
      createTemplate('cocos://asset/path/{relative_path}', 'Asset By Path', 'Read a script or text asset by project-relative path.'),
      createTemplate('cocos://asset/info/{uuid_or_path}', 'Asset Info', 'Inspect an asset by uuid, db url, or path.'),
    ];
  }

  async readResource(uri) {
    const text = await this.resolveResourceText(uri);
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text,
        },
      ],
    };
  }

  async resolveResourceText(uri) {
    const { projectName, projectPath, cocosVersion, version, config } = this.getRuntimeContext();

    switch (uri) {
      case 'cocos://project/context':
        return [
          'Funplay Cocos MCP Project Context',
          `Project: ${projectName}`,
          `Project Path: ${projectPath}`,
          `Cocos Creator: ${cocosVersion}`,
          `Extension Version: ${version}`,
          `Tool Profile: ${config.toolProfile}`,
          `Server: http://${config.host}:${config.port}/`,
          '',
          'Selection',
          summarizeSelection(),
          '',
          'Active Scene',
          await this.safeSceneCall('getSceneInfo', { maxDepth: 2 }),
        ].join('\n');
      case 'cocos://project/summary':
        return this.buildProjectSummary(projectPath, cocosVersion, version);
      case 'cocos://scene/active':
      case 'cocos://scene/current':
        return await this.safeSceneCall('getSceneInfo', { maxDepth: 3 });
      case 'cocos://selection/current':
        return summarizeSelection();
      case 'cocos://selection/asset':
        return await this.getSelectedAssetText();
      case 'cocos://errors/scripts':
        return await this.getScriptDiagnosticsText(projectPath);
      case 'cocos://mcp/interactions':
        return this.interactionLog.summary();
      default:
        break;
    }

    if (uri.startsWith('cocos://scene/node/')) {
      const nodePath = decodeURIComponent(uri.slice('cocos://scene/node/'.length));
      return await this.safeSceneCall('inspectNode', { path: nodePath });
    }

    if (uri.startsWith('cocos://asset/path/')) {
      const relativePath = decodeURIComponent(uri.slice('cocos://asset/path/'.length));
      return this.readAssetByPath(relativePath);
    }

    if (uri.startsWith('cocos://asset/info/')) {
      const uuidOrPath = decodeURIComponent(uri.slice('cocos://asset/info/'.length));
      return await this.getAssetInfoText(uuidOrPath);
    }

    return `Resource not found: ${uri}`;
  }

  buildProjectSummary(projectPath, cocosVersion, version) {
    const topLevel = fs.existsSync(projectPath)
      ? fs
          .readdirSync(projectPath, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort((left, right) => left.localeCompare(right))
      : [];

    const assetsDir = path.join(projectPath, 'assets');
    const scriptCount = this.countFiles(assetsDir, ['.ts', '.js']);
    const prefabCount = this.countFiles(assetsDir, ['.prefab']);
    const sceneCount = this.countFiles(assetsDir, ['.scene']);

    return [
      'Project Summary',
      `Project Root: ${projectPath}`,
      `Assets Path: ${assetsDir}`,
      `Cocos Creator: ${cocosVersion}`,
      `Extension Version: ${version}`,
      `Scripts: ${scriptCount}`,
      `Prefabs: ${prefabCount}`,
      `Scenes: ${sceneCount}`,
      '',
      `Top-Level Directories (${topLevel.length})`,
      ...topLevel.map((name) => `- ${name}`),
    ].join('\n');
  }

  countFiles(rootDir, extensions) {
    if (!fs.existsSync(rootDir)) {
      return 0;
    }

    let count = 0;
    const stack = [rootDir];
    while (stack.length) {
      const current = stack.pop();
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (extensions.includes(path.extname(entry.name).toLowerCase())) {
          count += 1;
        }
      }
    }
    return count;
  }

  readAssetByPath(relativePath) {
    const { projectPath } = this.getRuntimeContext();
    const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(projectPath, relativePath);
    if (!fs.existsSync(fullPath)) {
      return `Asset not found: ${relativePath}`;
    }
    return truncate(`[${relativePath}]\n${fs.readFileSync(fullPath, 'utf8')}`);
  }

  async safeSceneCall(method, payload) {
    try {
      const result = await this.sceneBridge.call(method, payload);
      return toText(result);
    } catch (error) {
      return `Scene bridge error (${method}): ${error.message}`;
    }
  }

  async getSelectedAssetText() {
    try {
      const selection = getCurrentSelection();
      if (!selection.asset) {
        return 'No asset is currently selected.';
      }

      return await this.getAssetInfoText(selection.asset);
    } catch (error) {
      return `Selected asset lookup failed: ${error.message}`;
    }
  }

  async getAssetInfoText(uuidOrPath) {
    try {
      const info = await queryAssetInfo(uuidOrPath);
      const meta = await queryAssetMeta(uuidOrPath).catch(() => null);
      return JSON.stringify({ info, meta }, null, 2);
    } catch (error) {
      return `Asset lookup failed: ${error.message}`;
    }
  }

  async getScriptDiagnosticsText(projectPath) {
    try {
      const result = await runScriptDiagnostics(projectPath);
      return JSON.stringify(result, null, 2);
    } catch (error) {
      return `Script diagnostics failed: ${error.message}`;
    }
  }
}

module.exports = {
  ResourceProvider,
};

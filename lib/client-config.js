'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getProjectIdentity } = require('./config');
const { readOptionalText, writeTextIfUnchanged } = require('./atomic-file');
const { findGitRootOrSelf } = require('./skill-platforms');

const SERVER_NAME = 'funplay_cocos';

function getServerName(config) {
  if (!config.projectPath) return SERVER_NAME; // Compatibility for callers without project context.
  const identity = getProjectIdentity(config.projectPath);
  const slug = path.basename(config.projectPath).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12).replace(/-$/, '') || 'project';
  return `cocos-${slug}-${identity.slice(0, 6)}`;
}

function getPreviousEntry(config, targetId) {
  const record = config.clientConfigEntries && config.clientConfigEntries[targetId];
  // A copied project config is not proof of ownership of the source project's client entry.
  return record && record.projectIdentity === getProjectIdentity(config.projectPath)
    && (record.serverName === SERVER_NAME || /^cocos-[a-z0-9-]+$/.test(record.serverName)) ? record : undefined;
}

function isObject(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }

function getServerContainer(root, target, create = false) {
  if (!isObject(root)) throw new Error('MCP configuration must be a JSON object.');
  const keys = target.scopePath ? ['projects', target.scopePath, target.rootKey || 'mcpServers'] : [target.rootKey || 'mcpServers'];
  let current = root;
  for (const key of keys) {
    if (current[key] === undefined) {
      if (!create) return null;
      current[key] = {};
    }
    if (!isObject(current[key])) throw new Error(`MCP configuration field '${key}' must be an object; the file was left unchanged.`);
    current = current[key];
  }
  return current;
}

function formatTargetPreview(target) {
  const name = target.serverName || SERVER_NAME;
  if (target.isToml) return `[mcp_servers.${name}]\nurl = "${target.url}"\n`;
  const root = {};
  getServerContainer(root, target, true)[name] = target.entry;
  return JSON.stringify(root, null, 2);
}

function isGeneratedEntry(entry, url) {
  return isObject(entry) && entry.url === url && Object.keys(entry).every((key) => key === 'url' || (key === 'type' && entry.type === 'http'));
}

function canReplaceEntry(target, name, url) {
  const previous = target.previousEntry;
  return url === (target.url || target.entry.url) || Boolean(previous && previous.serverName === name && previous.url === url && previous.configPath === target.configPath);
}

function getUserHomePath() {
  const home = os.homedir();
  if (home) {
    return home;
  }

  const homeDrive = process.env.HOMEDRIVE;
  const homePath = process.env.HOMEPATH;
  if (homeDrive && homePath) {
    return `${homeDrive}${homePath}`;
  }

  return process.env.HOME || '';
}

function getVSCodeConfigPath(homePath, options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;

  switch (platform) {
    case 'win32': {
      const appData = env.APPDATA || path.join(homePath, 'AppData', 'Roaming');
      return path.join(appData, 'Code', 'User', 'mcp.json');
    }

    case 'darwin': {
      const primaryPath = path.join(homePath, 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
      const primaryDirectory = path.dirname(primaryPath);
      if (existsSync(primaryPath) || existsSync(primaryDirectory)) {
        return primaryPath;
      }
      return path.join(homePath, '.vscode', 'mcp.json');
    }

    case 'linux':
      return path.join(homePath, '.config', 'Code', 'User', 'mcp.json');

    default:
      return path.join(homePath, '.vscode', 'mcp.json');
  }
}

function getConfiguredDirectory(env, key, fallback) {
  const configured = String(env && env[key] || '').trim();
  return configured || fallback;
}

function ensureParent(filePath) {
  const dir = path.dirname(filePath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) {
    return {};
  }

  return JSON.parse(text);
}

function configureJsonTarget(target) {
  const original = readOptionalText(target.configPath);
  const root = original && original.trim() ? JSON.parse(original) : {};
  const servers = getServerContainer(root, target, true);
  const name = target.serverName || SERVER_NAME;
  const existing = servers[name];
  if (existing !== undefined && (!isObject(existing) || !canReplaceEntry(target, name, existing.url))) throw new Error(`MCP entry '${name}' already belongs to another endpoint. Existing configuration was left unchanged.`);
  const previous = target.previousEntry;
  if (previous && previous.configPath === target.configPath && previous.serverName !== name && isGeneratedEntry(servers[previous.serverName], previous.url)) delete servers[previous.serverName];
  if (target.migrateLegacy && name !== SERVER_NAME && isGeneratedEntry(servers[SERVER_NAME], target.entry.url)) delete servers[SERVER_NAME];
  if (target.scopePath && target.migrateLegacy && isObject(root.mcpServers) && isGeneratedEntry(root.mcpServers[SERVER_NAME], target.entry.url)) delete root.mcpServers[SERVER_NAME];
  servers[name] = { ...(existing || {}), ...target.entry };
  writeTextIfUnchanged(target.configPath, JSON.stringify(root, null, 2) + '\n', original);
}

function configureTomlTarget(target) {
  ensureParent(target.configPath);
  const name = target.serverName || SERVER_NAME;
  const sectionHeader = `[mcp_servers.${name}]`;
  const section = `${sectionHeader}\nurl = "${target.url}"\n`;
  const original = readOptionalText(target.configPath);
  let content = original || '';
  const blocks = getTomlBlocks(content);
  const existing = blocks.find((block) => block.name === name);
  if (existing) {
    if (!canReplaceEntry(target, name, existing.url)) throw new Error(`MCP entry '${name}' already belongs to another endpoint. Existing configuration was left unchanged.`);
    const updated = existing.text.replace(/^[ \t]*url[ \t]*=[^\n]*/m, `url = "${target.url}"`);
    content = content.slice(0, existing.start) + updated + content.slice(existing.end);
  } else {
    if (content.length > 0 && !content.endsWith('\n')) {
      content += '\n';
    }
    if (content.length > 0) {
      content += '\n';
    }
    content += section;
  }
  // Retire only exact generated URL-only blocks that this project can identify.
  const previous = target.previousEntry;
  const retired = getTomlBlocks(content).filter((block) => block.name !== name && (
    (target.migrateLegacy && block.name === SERVER_NAME && block.url === target.url) ||
    (previous && previous.configPath === target.configPath && block.name === previous.serverName && block.url === previous.url)
  ) && !block.hasChildren && block.text.trim().split('\n').length === 2);
  for (const block of retired.reverse()) content = content.slice(0, block.start) + content.slice(block.end);
  writeTextIfUnchanged(target.configPath, content, original);
}

function getTomlBlocks(content) {
  // Do not guess at TOML forms that could hide table-looking text inside strings.
  if (/"""|'''|^[ \t]*mcp_servers[ \t]*=/m.test(content)) throw new Error('This TOML uses multiline strings or inline MCP tables. Configure it manually; the file was left unchanged.');
  const headers = [...content.matchAll(/^[ \t]*\[(\[[^\]\r\n]+\]|[^\]\r\n]+)\][ \t]*(?:#[^\n]*)?\r?$/gm)];
  const blocks = [];
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (header[1].trim() === 'mcp_servers') throw new Error('Use explicit [mcp_servers.name] tables to configure automatically.');
    const match = header[1].trim().match(/^mcp_servers\s*\.\s*(?:([A-Za-z0-9_-]+)|"([A-Za-z0-9_-]+)"|'([A-Za-z0-9_-]+)')$/);
    if (!match) continue;
    const start = header.index;
    const end = index + 1 < headers.length ? headers[index + 1].index : content.length;
    const text = content.slice(start, end);
    const urls = [...text.matchAll(/^[ \t]*url[ \t]*=[ \t]*["']([^"']+)["'][ \t]*(?:#[^\n]*)?\r?$/gm)];
    const name = match[1] || match[2] || match[3];
    if (blocks.some((block) => block.name === name) || urls.length > 1) throw new Error('Duplicate MCP table or URL; configuration was left unchanged.');
    const hasChildren = headers.some((item) => [name, `"${name}"`, `'${name}'`].some((key) => item[1].trim().replace(/\s*\.\s*/g, '.').startsWith(`mcp_servers.${key}.`)));
    blocks.push({ name, start, end, text, hasChildren, url: urls.length ? urls[0][1] : '' });
  }
  return blocks;
}

function buildTargets(config, options = {}) {
  const home = options.homePath || getUserHomePath();
  const env = options.env || process.env;
  const url = `http://${config.host}:${config.port}/`;

  return [
    {
      id: 'claude_code',
      name: 'Claude Code',
      configPath: path.join(home, '.claude.json'),
      rootKey: 'mcpServers',
      entry: { type: 'http', url },
    },
    {
      id: 'cursor',
      name: 'Cursor',
      configPath: path.join(home, '.cursor', 'mcp.json'),
      rootKey: 'mcpServers',
      entry: { url },
    },
    {
      id: 'vscode',
      name: 'VS Code',
      configPath: getVSCodeConfigPath(home, options),
      rootKey: 'servers',
      entry: { type: 'http', url },
    },
    {
      id: 'trae',
      name: 'Trae',
      configPath: path.join(home, '.trae', 'mcp.json'),
      rootKey: 'mcpServers',
      entry: { url },
    },
    {
      id: 'kiro',
      name: 'Kiro',
      configPath: path.join(home, '.kiro', 'settings', 'mcp.json'),
      rootKey: 'mcpServers',
      entry: { type: 'http', url },
    },
    {
      id: 'qoder',
      name: 'Qoder',
      configPath: path.join(
        getConfiguredDirectory(env, 'QODER_CONFIG_DIR', path.join(home, '.qoder')),
        'settings.json'
      ),
      rootKey: 'mcpServers',
      entry: { type: 'http', url },
    },
    {
      id: 'kimi',
      name: 'Kimi Code',
      configPath: path.join(
        getConfiguredDirectory(env, 'KIMI_CODE_HOME', path.join(home, '.kimi-code')),
        'mcp.json'
      ),
      rootKey: 'mcpServers',
      entry: { url },
    },
    {
      id: 'codex',
      name: 'Codex',
      configPath: path.join(home, '.codex', 'config.toml'),
      isToml: true,
      url,
    },
  ].map((target) => config.projectPath ? ({
    ...target,
    serverName: getServerName(config),
    ...(target.id === 'claude_code' ? { scopePath: findGitRootOrSelf(config.projectPath) } : {}),
    previousEntry: getPreviousEntry(config, target.id),
    migrateLegacy: config.migrateLegacy === true,
  }) : target);
}

function getTomlServerUrl(target) {
  if (!fs.existsSync(target.configPath)) {
    return '';
  }
  const content = fs.readFileSync(target.configPath, 'utf8');
  const block = getTomlBlocks(content).find((item) => item.name === (target.serverName || SERVER_NAME));
  return block ? block.url : '';
}

function isTargetConfigured(target) {
  if (!fs.existsSync(target.configPath)) {
    return false;
  }

  try {
    if (target.isToml) {
      return getTomlServerUrl(target) === target.url;
    }

    const root = readJson(target.configPath);
    const servers = getServerContainer(root, target);
    const entry = servers && servers[target.serverName || SERVER_NAME];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    return Object.entries(target.entry).every(([key, value]) => entry[key] === value);
  } catch (error) {
    return false;
  }
}

function getTargetStatuses(config, options = {}) {
  return buildTargets(config, options).map((target) => ({
    id: target.id,
    name: target.name,
    configPath: target.configPath,
    serverName: target.serverName || SERVER_NAME,
    configured: isTargetConfigured(target),
    isToml: Boolean(target.isToml),
  }));
}

function configureTarget(config, targetId, options = {}) {
  if (config.stablePort !== undefined && config.port !== config.stablePort) throw new Error('Server is using a temporary fallback port. Pin the current port or use the per-project port before configuring a client.');
  const targets = buildTargets(config, options);
  const target = targets.find((item) => item.id === targetId);
  if (!target) {
    throw new Error(`Unknown MCP client target: ${targetId}`);
  }

  if (target.isToml) {
    configureTomlTarget(target);
  } else {
    configureJsonTarget(target);
  }

  return {
    id: target.id,
    name: target.name,
    configPath: target.configPath,
    configured: true,
    serverName: target.serverName || SERVER_NAME,
    url: target.url || target.entry.url,
    projectIdentity: config.projectPath ? getProjectIdentity(config.projectPath) : '',
    restartHint: `Please restart ${target.name} for the MCP configuration to take effect.`,
  };
}

module.exports = {
  SERVER_NAME,
  getServerName,
  formatTargetPreview,
  buildTargets,
  configureTarget,
  getTargetStatuses,
};

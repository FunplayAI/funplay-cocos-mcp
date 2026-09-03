'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVER_NAME = 'funplay_cocos';

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

function writeJson(filePath, value) {
  ensureParent(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function configureJsonTarget(target) {
  const root = readJson(target.configPath);
  const rootKey = target.rootKey || 'mcpServers';
  if (!root[rootKey] || typeof root[rootKey] !== 'object' || Array.isArray(root[rootKey])) {
    root[rootKey] = {};
  }
  root[rootKey][SERVER_NAME] = target.entry;
  writeJson(target.configPath, root);
}

function configureTomlTarget(target) {
  ensureParent(target.configPath);
  const sectionHeader = `[mcp_servers.${SERVER_NAME}]`;
  const section = `${sectionHeader}\nurl = "${target.url}"\n`;
  let content = fs.existsSync(target.configPath) ? fs.readFileSync(target.configPath, 'utf8') : '';

  if (content.includes(sectionHeader)) {
    const start = content.indexOf(sectionHeader);
    const afterHeader = start + sectionHeader.length;
    const nextSection = content.indexOf('\n[', afterHeader);
    const end = nextSection >= 0 ? nextSection : content.length;
    content = `${content.slice(0, start)}${section}${content.slice(end)}`;
  } else {
    if (content.length > 0 && !content.endsWith('\n')) {
      content += '\n';
    }
    if (content.length > 0) {
      content += '\n';
    }
    content += section;
  }

  fs.writeFileSync(target.configPath, content, 'utf8');
}

function buildTargets(config, options = {}) {
  const home = options.homePath || getUserHomePath();
  const env = options.env || process.env;
  const url = `http://${config.host}:${config.port}/`;

  return [
    {
      id: 'claude_code',
      name: 'Claude Code / Claude Desktop',
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
  ];
}

function getTomlServerUrl(target) {
  if (!fs.existsSync(target.configPath)) {
    return '';
  }
  const content = fs.readFileSync(target.configPath, 'utf8');
  const escapedName = SERVER_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionPattern = new RegExp(
    `(?:^|\\n)\\[mcp_servers\\.${escapedName}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\[[^\\n]+\\]|$)`
  );
  const section = content.match(sectionPattern);
  if (!section) {
    return '';
  }
  const url = section[1].match(/^\s*url\s*=\s*["']([^"']+)["']\s*$/m);
  return url ? url[1] : '';
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
    const rootKey = target.rootKey || 'mcpServers';
    const entry = root && root[rootKey] && root[rootKey][SERVER_NAME];
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
    configured: isTargetConfigured(target),
    isToml: Boolean(target.isToml),
  }));
}

function configureTarget(config, targetId, options = {}) {
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
    restartHint: `Please restart ${target.name} for the MCP configuration to take effect.`,
  };
}

module.exports = {
  SERVER_NAME,
  buildTargets,
  configureTarget,
  getTargetStatuses,
};

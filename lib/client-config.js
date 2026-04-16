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

function getVSCodeConfigPath(homePath) {
  switch (process.platform) {
    case 'win32': {
      const appData = process.env.APPDATA || path.join(homePath, 'AppData', 'Roaming');
      return path.join(appData, 'Code', 'User', 'mcp.json');
    }

    case 'darwin': {
      const primaryPath = path.join(homePath, 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
      const primaryDirectory = path.dirname(primaryPath);
      if (fs.existsSync(primaryPath) || fs.existsSync(primaryDirectory)) {
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

function buildTargets(config) {
  const home = getUserHomePath();
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
      configPath: getVSCodeConfigPath(home),
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
      id: 'codex',
      name: 'Codex',
      configPath: path.join(home, '.codex', 'config.toml'),
      isToml: true,
      url,
    },
  ];
}

function getTargetStatuses(config) {
  return buildTargets(config).map((target) => ({
    id: target.id,
    name: target.name,
    configPath: target.configPath,
    configured: fs.existsSync(target.configPath),
    isToml: Boolean(target.isToml),
  }));
}

function configureTarget(config, targetId) {
  const targets = buildTargets(config);
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

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  host: '127.0.0.1',
  port: 8765,
  toolProfile: 'core',
  autostart: true,
  maxInteractionLogEntries: 50,
};

function getProjectPath() {
  if (global.Editor && Editor.Project && typeof Editor.Project.path === 'string' && Editor.Project.path) {
    return Editor.Project.path;
  }
  return process.cwd();
}

function getProjectName() {
  return path.basename(getProjectPath());
}

function getCocosVersion() {
  if (global.Editor && Editor.App) {
    if (typeof Editor.App.version === 'string' && Editor.App.version) {
      return Editor.App.version;
    }
    if (typeof Editor.App.ver === 'string' && Editor.App.ver) {
      return Editor.App.ver;
    }
  }
  return 'unknown';
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return {
      __error: `Failed to parse config file '${filePath}': ${error.message}`,
    };
  }
}

function clampPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return DEFAULTS.port;
  }
  return port;
}

function normalizeProfile(value) {
  return String(value || DEFAULTS.toolProfile).toLowerCase() === 'full' ? 'full' : 'core';
}

function loadConfig() {
  const projectPath = getProjectPath();
  const configPath = path.join(projectPath, 'funplay-cocos-mcp.config.json');
  const fileConfig = loadJson(configPath) || {};

  return {
    ...DEFAULTS,
    ...fileConfig,
    host: process.env.COCOS_MCP_HOST || fileConfig.host || DEFAULTS.host,
    port: clampPort(process.env.COCOS_MCP_PORT || fileConfig.port || DEFAULTS.port),
    toolProfile: normalizeProfile(process.env.COCOS_MCP_PROFILE || fileConfig.toolProfile || DEFAULTS.toolProfile),
    autostart: typeof fileConfig.autostart === 'boolean' ? fileConfig.autostart : DEFAULTS.autostart,
    maxInteractionLogEntries: Number.isInteger(fileConfig.maxInteractionLogEntries)
      ? Math.max(10, Math.min(500, fileConfig.maxInteractionLogEntries))
      : DEFAULTS.maxInteractionLogEntries,
    configPath,
    configError: fileConfig.__error || '',
  };
}

module.exports = {
  DEFAULTS,
  getProjectPath,
  getProjectName,
  getCocosVersion,
  loadConfig,
};

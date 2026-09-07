'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { normalizeLanguagePreference } = require('./i18n');
const { normalizeSavedToolProfiles } = require('./tool-profiles');

const DEFAULTS = {
  host: '127.0.0.1',
  port: 8765,
  portMode: 'project',
  toolProfile: 'core',
  enabledTools: [],
  disabledTools: [],
  enabledToolCategories: [],
  disabledToolCategories: [],
  enableSessions: false,
  enableConsoleLogging: true,
  executeJavascriptSafetyChecks: true,
  autostart: true,
  maxInteractionLogEntries: 50,
  lastClientTargetId: 'claude_code',
  activeToolProfileName: '',
  savedToolProfiles: [],
  language: 'auto',
};

const RUNTIME_CONFIG_KEYS = [
  'host',
  'port',
  'toolProfile',
  'enabledTools',
  'disabledTools',
  'enabledToolCategories',
  'disabledToolCategories',
  'enableSessions',
  'executeJavascriptSafetyChecks',
  'maxInteractionLogEntries',
];

function getProjectPath() {
  if (global.Editor && Editor.Project && typeof Editor.Project.path === 'string' && Editor.Project.path) {
    return Editor.Project.path;
  }
  return process.cwd();
}

function getProjectName() {
  return path.basename(getProjectPath());
}

function normalizeProjectIdentityPath(projectPath) {
  const normalized = path.resolve(String(projectPath || process.cwd())).replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function getProjectIdentity(projectPath = getProjectPath()) {
  return crypto
    .createHash('sha256')
    .update(`funplay-cocos-mcp:${normalizeProjectIdentityPath(projectPath)}`)
    .digest('hex')
    .slice(0, 24);
}

function getProjectPort(projectPath = getProjectPath()) {
  return 20000 + (parseInt(getProjectIdentity(projectPath).slice(0, 8), 16) % 10000);
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
  const normalized = String(value || DEFAULTS.toolProfile).toLowerCase();
  if (normalized === 'full' || normalized === 'custom') {
    return normalized;
  }
  return 'core';
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeClientTargetId(value) {
  const normalized = String(value || '').trim();
  return normalized || DEFAULTS.lastClientTargetId;
}

function hasRuntimeConfigChanges(currentConfig = {}, nextConfig = {}) {
  return RUNTIME_CONFIG_KEYS.some((key) => (
    JSON.stringify(currentConfig[key]) !== JSON.stringify(nextConfig[key])
  ));
}

function loadConfig(options = {}) {
  const projectPath = options.projectPath || getProjectPath();
  const env = options.env || process.env;
  const configPath = path.join(projectPath, 'funplay-cocos-mcp.config.json');
  const fileConfig = loadJson(configPath) || {};
  // Existing config files without a mode retain their old fixed endpoint.
  const portMode = fileConfig.portMode === 'project' || (!fs.existsSync(configPath) && !env.COCOS_MCP_PORT)
    ? 'project' : 'fixed';
  const port = clampPort(env.COCOS_MCP_PORT || (portMode === 'project' ? getProjectPort(projectPath) : fileConfig.port || DEFAULTS.port));

  return {
    ...DEFAULTS,
    ...fileConfig,
    host: env.COCOS_MCP_HOST || fileConfig.host || DEFAULTS.host,
    port,
    portMode: env.COCOS_MCP_PORT ? 'fixed' : portMode,
    projectPath,
    clientConfigEntries: fileConfig.clientConfigEntries && typeof fileConfig.clientConfigEntries === 'object' && !Array.isArray(fileConfig.clientConfigEntries)
      ? fileConfig.clientConfigEntries : {},
    toolProfile: normalizeProfile(process.env.COCOS_MCP_PROFILE || fileConfig.toolProfile || DEFAULTS.toolProfile),
    enabledTools: normalizeStringList(fileConfig.enabledTools),
    disabledTools: normalizeStringList(fileConfig.disabledTools),
    enabledToolCategories: normalizeStringList(fileConfig.enabledToolCategories).map((item) => item.toLowerCase()),
    disabledToolCategories: normalizeStringList(fileConfig.disabledToolCategories).map((item) => item.toLowerCase()),
    enableSessions: typeof fileConfig.enableSessions === 'boolean' ? fileConfig.enableSessions : DEFAULTS.enableSessions,
    enableConsoleLogging: typeof fileConfig.enableConsoleLogging === 'boolean'
      ? fileConfig.enableConsoleLogging
      : DEFAULTS.enableConsoleLogging,
    executeJavascriptSafetyChecks: typeof fileConfig.executeJavascriptSafetyChecks === 'boolean'
      ? fileConfig.executeJavascriptSafetyChecks
      : DEFAULTS.executeJavascriptSafetyChecks,
    autostart: typeof fileConfig.autostart === 'boolean' ? fileConfig.autostart : DEFAULTS.autostart,
    maxInteractionLogEntries: Number.isInteger(fileConfig.maxInteractionLogEntries)
      ? Math.max(10, Math.min(500, fileConfig.maxInteractionLogEntries))
      : DEFAULTS.maxInteractionLogEntries,
    lastClientTargetId: normalizeClientTargetId(fileConfig.lastClientTargetId),
    activeToolProfileName: typeof fileConfig.activeToolProfileName === 'string' ? fileConfig.activeToolProfileName : '',
    savedToolProfiles: normalizeSavedToolProfiles(fileConfig.savedToolProfiles),
    language: normalizeLanguagePreference(fileConfig.language),
    configPath,
    configError: fileConfig.__error || '',
  };
}

module.exports = {
  DEFAULTS,
  getProjectPath,
  getProjectName,
  getProjectIdentity,
  getProjectPort,
  getCocosVersion,
  loadConfig,
  hasRuntimeConfigChanges,
  normalizeProfile,
  normalizeStringList,
  normalizeLanguagePreference,
};

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { normalizeLanguagePreference } = require('./i18n');
const { normalizeSavedToolProfiles } = require('./tool-profiles');

const DEFAULTS = {
  host: '127.0.0.1',
  port: 8765,
  toolProfile: 'core',
  enabledTools: [],
  disabledTools: [],
  enabledToolCategories: [],
  disabledToolCategories: [],
  enableSessions: false,
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
    enabledTools: normalizeStringList(fileConfig.enabledTools),
    disabledTools: normalizeStringList(fileConfig.disabledTools),
    enabledToolCategories: normalizeStringList(fileConfig.enabledToolCategories).map((item) => item.toLowerCase()),
    disabledToolCategories: normalizeStringList(fileConfig.disabledToolCategories).map((item) => item.toLowerCase()),
    enableSessions: typeof fileConfig.enableSessions === 'boolean' ? fileConfig.enableSessions : DEFAULTS.enableSessions,
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
  getCocosVersion,
  loadConfig,
  hasRuntimeConfigChanges,
  normalizeProfile,
  normalizeStringList,
  normalizeLanguagePreference,
};

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const manifest = require('./package.json');
const { SERVER_NAME, buildTargets, configureTarget, getTargetStatuses } = require('./lib/client-config');
const { loadConfig, getProjectPath, getProjectName, getProjectIdentity, getCocosVersion } = require('./lib/config');
const { McpServer } = require('./lib/server');
const { createToolRegistry } = require('./lib/tool-registry');
const { ResourceProvider } = require('./lib/resources');
const { PromptProvider } = require('./lib/prompts');
const { InteractionLog } = require('./lib/interaction-log');
const { RuntimeLog } = require('./lib/runtime-log');
const { checkForUpdate } = require('./lib/update-checker');
const { installLatestUpdate } = require('./lib/updater');
const { normalizeSavedToolProfiles } = require('./lib/tool-profiles');

const EXTENSION_NAME = manifest.name || 'funplay-cocos-mcp';
const LOG_PREFIX = '[Funplay Cocos MCP]';
const REPOSITORY_URL = 'https://github.com/FunplayAI/funplay-cocos-mcp';
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

class ExtensionService {
  constructor() {
    this.config = null;
    this.server = null;
    this.toolRegistry = null;
    this.resourceProvider = null;
    this.promptProvider = null;
    this.interactionLog = new InteractionLog();
    this.runtimeLog = new RuntimeLog();
    this.lastUpdateInfo = null;
    this.lastInstallInfo = null;
  }

  log(level, message, details) {
    if (this.runtimeLog && typeof this.runtimeLog.add === 'function') {
      this.runtimeLog.add(level, message, details);
    }
    const output = `${LOG_PREFIX} ${message}`;
    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  load() {
    this.log('info', 'Extension loading...');
    this.reloadRuntime();
    let result;
    if (this.config.autostart) {
      this.log('info', 'Autostart is enabled, starting MCP server.');
      result = this.startServer();
    } else {
      this.log('info', 'Autostart is disabled. MCP server is idle.');
      result = this.getStatus();
    }

    Promise.resolve(result)
      .then(() => this.autoCheckUpdates({ reason: 'startup', silent: true }))
      .catch((error) => this.log('warn', `Automatic update check skipped: ${error.message}`));
    return result;
  }

  unload() {
    this.log('info', 'Extension unloading...');
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
    this.log('info', 'Extension unloaded.');
  }

  openPanel(panelName) {
    if (!global.Editor || !Editor.Panel || typeof Editor.Panel.open !== 'function') {
      throw new Error('Editor.Panel.open is unavailable in this Cocos extension host.');
    }
    const normalized = String(panelName || 'default').trim();
    const panelId = !normalized || normalized === 'default'
      ? EXTENSION_NAME
      : `${EXTENSION_NAME}.${normalized}`;
    return Editor.Panel.open(panelId);
  }

  reloadRuntime() {
    this.config = loadConfig();
    this.interactionLog = new InteractionLog(this.config.maxInteractionLogEntries);
    this.runtimeLog = new RuntimeLog(this.config.maxInteractionLogEntries);
    this.log(
      'info',
      `Runtime config loaded: host=${this.config.host}, port=${this.config.port}, ` +
      `profile=${this.config.toolProfile}, autostart=${this.config.autostart}`
    );
    const sceneBridge = {
      call: async (method, payload) => {
        if (!global.Editor || !Editor.Message || typeof Editor.Message.request !== 'function') {
          throw new Error('Editor.Message.request is unavailable in the Cocos extension host.');
        }

        return await Editor.Message.request('scene', 'execute-scene-script', {
          name: EXTENSION_NAME,
          method,
          args: [payload || {}],
        });
      },
    };

    const runtimeContext = () => ({
      extensionName: EXTENSION_NAME,
      version: manifest.version || '0.0.0',
      config: this.config,
      projectPath: getProjectPath(),
      projectName: getProjectName(),
      projectIdentity: getProjectIdentity(),
      cocosVersion: getCocosVersion(),
      packagePath: path.dirname(__filename),
    });

    this.toolRegistry = createToolRegistry({
      getRuntimeContext: runtimeContext,
      getStatus: () => this.getStatus(),
      interactionLog: this.interactionLog,
      runtimeLog: this.runtimeLog,
      sceneBridge,
      editorExecutor: async (payload) => await this.executeEditorScript(payload, runtimeContext),
    });
    this.resourceProvider = new ResourceProvider(runtimeContext, sceneBridge, this.interactionLog, this.runtimeLog);
    this.promptProvider = new PromptProvider(runtimeContext);
  }

  async startServer() {
    if (this.server && this.server.isRunning()) {
      this.log('info', `Start requested but MCP server is already running at ${this.getStatus().url}`);
      return this.getStatus();
    }

    this.log('info', 'Starting MCP server...');
    this.reloadRuntime();
    this.server = new McpServer({
      config: this.config,
      interactionLog: this.interactionLog,
      runtimeLog: this.runtimeLog,
      toolRegistry: this.toolRegistry,
      resourceProvider: this.resourceProvider,
      promptProvider: this.promptProvider,
      serverName: `Funplay Cocos MCP - ${getProjectName()}`,
      serverVersion: manifest.version || '0.0.0',
      projectName: getProjectName(),
      projectIdentity: getProjectIdentity(),
    });

    await this.server.start();
    this.log('info', `MCP server started at ${this.getStatus().url}`);
    this.log('info', `If this tool saves you time, please consider giving it a Star on GitHub: ${REPOSITORY_URL}`);
    return this.getStatus();
  }

  async stopServer() {
    this.log('info', 'Stop requested.');
    if (this.server) {
      await this.server.stop();
      this.server = null;
      this.log('info', 'MCP server stopped.');
    } else {
      this.log('info', 'Stop requested but MCP server was not running.');
    }
    return this.getStatus();
  }

  async restartServer() {
    this.log('info', 'Restart requested.');
    await this.stopServer();
    const status = await this.startServer();
    this.log('info', `Restart completed. MCP server running=${status.running}, url=${status.url}`);
    return status;
  }

  getEffectiveServerConnection() {
    const port = this.server && this.server.isRunning() && typeof this.server.getPort === 'function'
      ? this.server.getPort()
      : this.config.port;
    return {
      host: this.config.host,
      port,
      url: `http://${this.config.host}:${port}/`,
    };
  }

  getStatus() {
    const effective = this.getEffectiveServerConnection();
    const fallbackInfo = this.server && this.server.isRunning() && typeof this.server.getPortFallbackInfo === 'function'
      ? this.server.getPortFallbackInfo()
      : null;
    const attachInfo = this.server && this.server.isRunning() && typeof this.server.getAttachInfo === 'function'
      ? this.server.getAttachInfo()
      : null;
    return {
      running: Boolean(this.server && this.server.isRunning()),
      attachedToExisting: Boolean(attachInfo),
      attachInfo,
      host: this.config.host,
      port: effective.port,
      requestedPort: this.config.port,
      portFallbackActive: Boolean(fallbackInfo),
      portFallbackInfo: fallbackInfo,
      toolProfile: this.config.toolProfile,
      enabledTools: this.config.enabledTools,
      disabledTools: this.config.disabledTools,
      enabledToolCategories: this.config.enabledToolCategories,
      disabledToolCategories: this.config.disabledToolCategories,
      enableSessions: this.config.enableSessions,
      executeJavascriptSafetyChecks: this.config.executeJavascriptSafetyChecks,
      autostart: this.config.autostart,
      activeToolProfileName: this.config.activeToolProfileName,
      savedToolProfiles: this.config.savedToolProfiles,
      version: manifest.version || '0.0.0',
      projectPath: getProjectPath(),
      projectName: getProjectName(),
      projectIdentity: getProjectIdentity(),
      cocosVersion: getCocosVersion(),
      url: effective.url,
    };
  }

  getPanelState() {
    this.ensureRuntime();
    const status = this.getStatus();
    const tools = this.toolRegistry.listTools();
    const toolCatalog = typeof this.toolRegistry.listToolCatalog === 'function'
      ? this.toolRegistry.listToolCatalog()
      : tools;
    const resources = this.resourceProvider.listResources();
    const prompts = this.promptProvider.listPrompts();

    return {
      status,
      tools,
      toolCatalog,
      resources,
      prompts,
      recentInteractions: this.interactionLog.list(20),
      recentRuntimeLogs: this.runtimeLog.list(20),
      config: this.config,
      updateInfo: this.lastUpdateInfo,
      installInfo: this.lastInstallInfo,
      clientConfig: this.getClientConfig(),
      clientTargets: getTargetStatuses(this.config),
    };
  }

  listToolsForPanel() {
    this.ensureRuntime();
    return this.toolRegistry.listTools();
  }

  async callToolFromPanel(name, args) {
    this.ensureRuntime();
    this.log('info', `Panel calling tool: ${name}`);
    return await this.toolRegistry.callTool(name, args || {});
  }

  async checkUpdates(options = {}) {
    this.ensureRuntime();
    this.log('info', 'Checking GitHub for newer Funplay Cocos MCP releases.');
    this.lastUpdateInfo = await checkForUpdate({
      currentVersion: manifest.version || '0.0.0',
      timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5000,
    });
    if (this.lastUpdateInfo.ok) {
      this.log(
        'info',
        `Update check completed: current=${this.lastUpdateInfo.currentVersion}, latest=${this.lastUpdateInfo.latestVersion || 'unknown'}`
      );
    } else {
      this.log('warn', `Update check failed: ${this.lastUpdateInfo.error}`);
    }
    return this.getPanelState();
  }

  async autoCheckUpdates(options = {}) {
    this.ensureRuntime();
    const now = Date.now();
    const lastCheckedAt = this.lastUpdateInfo && this.lastUpdateInfo.checkedAt
      ? new Date(this.lastUpdateInfo.checkedAt).getTime()
      : 0;
    const fresh = Number.isFinite(lastCheckedAt) && lastCheckedAt > 0
      && now - lastCheckedAt < UPDATE_CHECK_INTERVAL_MS;
    if (!options.force && fresh) {
      return this.getPanelState();
    }

    if (!options.silent) {
      this.log('info', `Running automatic update check (${options.reason || 'panel'}).`);
    }
    return await this.checkUpdates({ timeoutMs: options.timeoutMs });
  }

  async installUpdate(options = {}) {
    this.ensureRuntime();
    let updateInfo = this.lastUpdateInfo;
    if (!updateInfo || !updateInfo.ok || options.forceCheck) {
      await this.checkUpdates({ timeoutMs: options.timeoutMs });
      updateInfo = this.lastUpdateInfo;
    }
    if (!updateInfo || !updateInfo.ok) {
      throw new Error(updateInfo && updateInfo.error ? updateInfo.error : 'Update check failed.');
    }
    if (!updateInfo.updateAvailable && !options.force) {
      throw new Error(`Already up to date: ${updateInfo.currentVersion}.`);
    }

    const installResult = await installLatestUpdate({
      releaseInfo: updateInfo,
      currentVersion: manifest.version || '0.0.0',
      packagePath: path.dirname(__filename),
      timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000,
      log: (level, message, details) => this.log(level, message, details),
    });
    const reload = options.skipReload ? { scheduled: false, reason: 'skipReload requested' } : this.scheduleExtensionReload();
    this.lastInstallInfo = {
      ...installResult,
      installedAt: new Date().toISOString(),
      reload,
    };
    this.log(
      'info',
      `Installed Funplay Cocos MCP ${installResult.installedVersion}; ` +
      (reload.scheduled ? 'extension reload scheduled.' : `reload not scheduled: ${reload.reason}`)
    );
    return this.getPanelState();
  }

  openUpdateRelease(url) {
    const update = this.lastUpdateInfo || {};
    const targetUrl = String(url || update.releaseUrl || REPOSITORY_URL).trim();
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`Refusing to open non-HTTP URL: ${targetUrl}`);
    }

    try {
      const electron = require('electron');
      if (electron && electron.shell && typeof electron.shell.openExternal === 'function') {
        electron.shell.openExternal(targetUrl);
        return { opened: true, url: targetUrl, method: 'electron.shell.openExternal' };
      }
    } catch (error) {
      // Fall through to Editor or platform open commands.
    }

    if (global.Editor && Editor.Utils && Editor.Utils.Shell && typeof Editor.Utils.Shell.openExternal === 'function') {
      Editor.Utils.Shell.openExternal(targetUrl);
      return { opened: true, url: targetUrl, method: 'Editor.Utils.Shell.openExternal' };
    }

    const childProcess = require('child_process');
    const command = process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', targetUrl] : [targetUrl];
    const child = childProcess.spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { opened: true, url: targetUrl, method: command };
  }

  scheduleExtensionReload(delayMs = 1200) {
    if (!global.Editor || !Editor.Package) {
      return { scheduled: false, reason: 'Editor.Package is unavailable' };
    }
    const canReload = typeof Editor.Package.reload === 'function';
    if (!canReload) {
      return {
        scheduled: false,
        reason: 'Cocos Creator does not expose a reliable package reload API; restart Cocos Creator to load the updated extension',
      };
    }

    setTimeout(async () => {
      try {
        this.log('info', 'Reloading Funplay Cocos MCP after update installation.');
        await Editor.Package.reload(EXTENSION_NAME);
      } catch (error) {
        this.log('error', `Extension reload after update failed: ${error.message}`);
      }
    }, delayMs);
    return { scheduled: true, delayMs };
  }

  async executeEditorScript(payload, runtimeContext) {
    const code = String(payload && payload.code || '');
    if (!code.trim()) {
      throw new Error('code is required.');
    }

    const args = payload && payload.args ? payload.args : {};
    const context = runtimeContext();
    const helpers = {
      getStatus: () => this.getStatus(),
      listTools: () => this.toolRegistry.listTools(),
      readResource: async (uri) => await this.resourceProvider.readResource(uri),
      callTool: async (name, toolArgs) => await this.toolRegistry.callTool(name, toolArgs || {}),
      listClientTargets: () => getTargetStatuses(this.config),
      getClientConfig: () => this.getClientConfig(),
      configureClient: async (targetId) => this.configureClient(targetId),
    };

    const runner = new AsyncFunction(
      'require',
      'Editor',
      'args',
      'context',
      'helpers',
      'fs',
      'path',
      'os',
      `
      const module = { exports: {} };
      const exports = module.exports;
      ${code}
      if (typeof run === 'function') {
        return await run({ Editor, args, context, helpers, fs, path, os, require });
      }
      if (typeof module.exports === 'function') {
        return await module.exports({ Editor, args, context, helpers, fs, path, os, require });
      }
      if (module.exports && typeof module.exports.run === 'function') {
        return await module.exports.run({ Editor, args, context, helpers, fs, path, os, require });
      }
      `
    );

    return await runner(require, global.Editor, args, context, helpers, fs, path, os);
  }

  async readResourceFromPanel(uri) {
    this.ensureRuntime();
    this.log('info', `Panel reading resource: ${uri}`);
    return await this.resourceProvider.readResource(uri);
  }

  getClientConfig() {
    const effective = this.getEffectiveServerConnection();
    const { url } = effective;
    const targetConfig = {
      ...this.config,
      host: effective.host,
      port: effective.port,
    };
    const targets = buildTargets(targetConfig).map((target) => ({
      id: target.id,
      name: target.name,
      configPath: target.configPath,
      isToml: Boolean(target.isToml),
      preview: this.formatClientTargetPreview(target),
    }));
    const baseUrl = url.replace(/\/$/, '');
    return {
      url,
      codex: `[mcp_servers.funplay_cocos]\nurl = "${url}"\n`,
      json: JSON.stringify({
        mcpServers: {
          funplay_cocos: {
            url,
          },
        },
      }, null, 2),
      targets,
      curl: {
        health: `curl ${baseUrl}/health`,
        tools: `curl ${baseUrl}/tools`,
        catalog: `curl ${baseUrl}/tools?catalog=1`,
      },
    };
  }

  formatClientTargetPreview(target) {
    if (target.isToml) {
      return `[mcp_servers.${SERVER_NAME}]\nurl = "${target.url}"\n`;
    }

    const rootKey = target.rootKey || 'mcpServers';
    return JSON.stringify({
      [rootKey]: {
        [SERVER_NAME]: target.entry,
      },
    }, null, 2);
  }

  configureClient(targetId) {
    this.ensureRuntime();
    this.log('info', `Configuring MCP client target: ${targetId}`);
    const effective = this.getEffectiveServerConnection();
    if (effective.port !== this.config.port) {
      this.log(
        'info',
        `Using actual running port ${effective.port} for MCP client configuration ` +
        `(requested: ${this.config.port}).`
      );
    }
    const result = configureTarget(
      {
        ...this.config,
        host: effective.host,
        port: effective.port,
      },
      targetId
    );
    this.log('info', `MCP client configured: ${result.name} -> ${result.configPath}`);
    return {
      ...result,
      clientTargets: getTargetStatuses(this.config),
    };
  }

  async saveConfig(partialConfig) {
    this.ensureRuntime();
    const nextPort = partialConfig && partialConfig.port !== undefined
      ? Number(partialConfig.port)
      : this.config.port;
    const nextMaxEntries = partialConfig && partialConfig.maxInteractionLogEntries !== undefined
      ? Number(partialConfig.maxInteractionLogEntries)
      : this.config.maxInteractionLogEntries;
    const normalizeList = (value, fallback) => {
      if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
      }
      if (typeof value === 'string') {
        return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
      }
      return fallback || [];
    };
    const normalizeCategories = (value, fallback) => normalizeList(value, fallback)
      .map((item) => item.toLowerCase());
    const nextProfile = partialConfig && partialConfig.toolProfile
      ? (partialConfig.toolProfile === 'full' || partialConfig.toolProfile === 'custom' ? partialConfig.toolProfile : 'core')
      : this.config.toolProfile;
    const nextConfig = {
      host: partialConfig && partialConfig.host ? String(partialConfig.host) : this.config.host,
      port: Number.isInteger(nextPort) && nextPort > 0 && nextPort <= 65535 ? nextPort : this.config.port,
      toolProfile: nextProfile,
      enabledTools: normalizeList(partialConfig && partialConfig.enabledTools, this.config.enabledTools),
      disabledTools: normalizeList(partialConfig && partialConfig.disabledTools, this.config.disabledTools),
      enabledToolCategories: normalizeCategories(
        partialConfig && partialConfig.enabledToolCategories,
        this.config.enabledToolCategories
      ),
      disabledToolCategories: normalizeCategories(
        partialConfig && partialConfig.disabledToolCategories,
        this.config.disabledToolCategories
      ),
      enableSessions: partialConfig && typeof partialConfig.enableSessions === 'boolean'
        ? partialConfig.enableSessions
        : this.config.enableSessions,
      executeJavascriptSafetyChecks: partialConfig && typeof partialConfig.executeJavascriptSafetyChecks === 'boolean'
        ? partialConfig.executeJavascriptSafetyChecks
        : this.config.executeJavascriptSafetyChecks,
      autostart: partialConfig && typeof partialConfig.autostart === 'boolean'
        ? partialConfig.autostart
        : this.config.autostart,
      maxInteractionLogEntries: Number.isInteger(nextMaxEntries)
        ? Math.max(10, Math.min(500, nextMaxEntries))
        : this.config.maxInteractionLogEntries,
      lastClientTargetId: partialConfig && partialConfig.lastClientTargetId
        ? String(partialConfig.lastClientTargetId)
        : this.config.lastClientTargetId,
      activeToolProfileName: partialConfig && typeof partialConfig.activeToolProfileName === 'string'
        ? String(partialConfig.activeToolProfileName)
        : this.config.activeToolProfileName,
      savedToolProfiles: partialConfig && Array.isArray(partialConfig.savedToolProfiles)
        ? normalizeSavedToolProfiles(partialConfig.savedToolProfiles)
        : this.config.savedToolProfiles,
    };

    const configPath = this.config.configPath;
    fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2) + '\n', 'utf8');
    const wasRunning = Boolean(this.server && this.server.isRunning());
    const requiresRestart = wasRunning && (
      nextConfig.host !== this.config.host ||
      nextConfig.port !== this.config.port ||
      nextConfig.toolProfile !== this.config.toolProfile ||
      nextConfig.enableSessions !== this.config.enableSessions ||
      nextConfig.executeJavascriptSafetyChecks !== this.config.executeJavascriptSafetyChecks ||
      JSON.stringify(nextConfig.enabledTools) !== JSON.stringify(this.config.enabledTools) ||
      JSON.stringify(nextConfig.disabledTools) !== JSON.stringify(this.config.disabledTools) ||
      JSON.stringify(nextConfig.enabledToolCategories) !== JSON.stringify(this.config.enabledToolCategories) ||
      JSON.stringify(nextConfig.disabledToolCategories) !== JSON.stringify(this.config.disabledToolCategories)
    );
    if (requiresRestart) {
      await this.stopServer();
    }
    this.reloadRuntime();
    if (requiresRestart) {
      await this.startServer();
    }
    return this.getPanelState();
  }

  ensureRuntime() {
    if (!this.config || !this.toolRegistry || !this.resourceProvider || !this.promptProvider) {
      this.reloadRuntime();
    }
  }
}

const service = new ExtensionService();

module.exports = {
  load() {
    return service.load();
  },
  unload() {
    return service.unload();
  },
  methods: {
    openPanel(panelName) {
      return service.openPanel(panelName);
    },
    openToolExposurePanel() {
      return service.openPanel('tool-exposure');
    },
    openSettingsPanel() {
      return service.openPanel('settings');
    },
    openActivityPanel() {
      return service.openPanel('activity');
    },
    startServer() {
      return service.startServer();
    },
    stopServer() {
      return service.stopServer();
    },
    restartServer() {
      return service.restartServer();
    },
    getStatus() {
      return service.getStatus();
    },
    getPanelState() {
      return service.getPanelState();
    },
    saveConfig(config) {
      return service.saveConfig(config);
    },
    listToolsForPanel() {
      return service.listToolsForPanel();
    },
    callToolFromPanel(name, args) {
      return service.callToolFromPanel(name, args);
    },
    checkUpdates() {
      return service.checkUpdates();
    },
    autoCheckUpdates() {
      return service.autoCheckUpdates({ reason: 'panel' });
    },
    installUpdate(options) {
      return service.installUpdate(options);
    },
    openUpdateRelease(url) {
      return service.openUpdateRelease(url);
    },
    readResourceFromPanel(uri) {
      return service.readResourceFromPanel(uri);
    },
    getClientConfig() {
      return service.getClientConfig();
    },
    configureClient(targetId) {
      return service.configureClient(targetId);
    },
  },
};

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const manifest = require('./package.json');
const { configureTarget, getTargetStatuses } = require('./lib/client-config');
const { loadConfig, getProjectPath, getProjectName, getCocosVersion } = require('./lib/config');
const { McpServer } = require('./lib/server');
const { createToolRegistry } = require('./lib/tool-registry');
const { ResourceProvider } = require('./lib/resources');
const { PromptProvider } = require('./lib/prompts');
const { InteractionLog } = require('./lib/interaction-log');

const EXTENSION_NAME = manifest.name || 'funplay-cocos-mcp';
const LOG_PREFIX = '[Funplay Cocos MCP]';
const REPOSITORY_URL = 'https://github.com/FunplayAI/funplay-cocos-mcp';
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

class ExtensionService {
  constructor() {
    this.config = null;
    this.server = null;
    this.toolRegistry = null;
    this.resourceProvider = null;
    this.promptProvider = null;
    this.interactionLog = new InteractionLog();
  }

  load() {
    console.log(`${LOG_PREFIX} Extension loading...`);
    this.reloadRuntime();
    if (this.config.autostart) {
      console.log(`${LOG_PREFIX} Autostart is enabled, starting MCP server.`);
      return this.startServer();
    }
    console.log(`${LOG_PREFIX} Autostart is disabled. MCP server is idle.`);
    return this.getStatus();
  }

  unload() {
    console.log(`${LOG_PREFIX} Extension unloading...`);
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
    console.log(`${LOG_PREFIX} Extension unloaded.`);
  }

  openPanel() {
    if (!global.Editor || !Editor.Panel || typeof Editor.Panel.open !== 'function') {
      throw new Error('Editor.Panel.open is unavailable in this Cocos extension host.');
    }
    return Editor.Panel.open(EXTENSION_NAME);
  }

  reloadRuntime() {
    this.config = loadConfig();
    console.log(
      `${LOG_PREFIX} Runtime config loaded: host=${this.config.host}, port=${this.config.port}, ` +
      `profile=${this.config.toolProfile}, autostart=${this.config.autostart}`
    );
    this.interactionLog = new InteractionLog(this.config.maxInteractionLogEntries);
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
      cocosVersion: getCocosVersion(),
      packagePath: path.dirname(__filename),
    });

    this.toolRegistry = createToolRegistry({
      getRuntimeContext: runtimeContext,
      interactionLog: this.interactionLog,
      sceneBridge,
      editorExecutor: async (payload) => await this.executeEditorScript(payload, runtimeContext),
    });
    this.resourceProvider = new ResourceProvider(runtimeContext, sceneBridge, this.interactionLog);
    this.promptProvider = new PromptProvider(runtimeContext);
  }

  async startServer() {
    if (this.server && this.server.isRunning()) {
      console.log(`${LOG_PREFIX} Start requested but MCP server is already running at ${this.getStatus().url}`);
      return this.getStatus();
    }

    console.log(`${LOG_PREFIX} Starting MCP server...`);
    this.reloadRuntime();
    this.server = new McpServer({
      config: this.config,
      interactionLog: this.interactionLog,
      toolRegistry: this.toolRegistry,
      resourceProvider: this.resourceProvider,
      promptProvider: this.promptProvider,
      serverName: `Funplay Cocos MCP - ${getProjectName()}`,
      serverVersion: manifest.version || '0.0.0',
    });

    await this.server.start();
    console.log(`${LOG_PREFIX} MCP server started at ${this.getStatus().url}`);
    console.log(
      `${LOG_PREFIX} If this tool saves you time, please consider giving it a Star on GitHub: ${REPOSITORY_URL}`
    );
    return this.getStatus();
  }

  async stopServer() {
    console.log(`${LOG_PREFIX} Stop requested.`);
    if (this.server) {
      await this.server.stop();
      this.server = null;
      console.log(`${LOG_PREFIX} MCP server stopped.`);
    } else {
      console.log(`${LOG_PREFIX} Stop requested but MCP server was not running.`);
    }
    return this.getStatus();
  }

  async restartServer() {
    console.log(`${LOG_PREFIX} Restart requested.`);
    await this.stopServer();
    const status = await this.startServer();
    console.log(`${LOG_PREFIX} Restart completed. MCP server running=${status.running}, url=${status.url}`);
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
    return {
      running: Boolean(this.server && this.server.isRunning()),
      host: this.config.host,
      port: effective.port,
      requestedPort: this.config.port,
      portFallbackActive: Boolean(fallbackInfo),
      portFallbackInfo: fallbackInfo,
      toolProfile: this.config.toolProfile,
      autostart: this.config.autostart,
      projectPath: getProjectPath(),
      projectName: getProjectName(),
      cocosVersion: getCocosVersion(),
      url: effective.url,
    };
  }

  getPanelState() {
    this.ensureRuntime();
    const status = this.getStatus();
    const tools = this.toolRegistry.listTools();
    const resources = this.resourceProvider.listResources();
    const prompts = this.promptProvider.listPrompts();

    return {
      status,
      tools,
      resources,
      prompts,
      recentInteractions: this.interactionLog.list(20),
      config: this.config,
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
    console.log(`${LOG_PREFIX} Panel calling tool: ${name}`);
    return await this.toolRegistry.callTool(name, args || {});
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
    console.log(`${LOG_PREFIX} Panel reading resource: ${uri}`);
    return await this.resourceProvider.readResource(uri);
  }

  getClientConfig() {
    const { url } = this.getEffectiveServerConnection();
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
    };
  }

  configureClient(targetId) {
    this.ensureRuntime();
    console.log(`${LOG_PREFIX} Configuring MCP client target: ${targetId}`);
    const effective = this.getEffectiveServerConnection();
    if (effective.port !== this.config.port) {
      console.log(
        `${LOG_PREFIX} Using actual running port ${effective.port} for MCP client configuration ` +
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
    console.log(`${LOG_PREFIX} MCP client configured: ${result.name} -> ${result.configPath}`);
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
    const nextConfig = {
      host: partialConfig && partialConfig.host ? String(partialConfig.host) : this.config.host,
      port: Number.isInteger(nextPort) && nextPort > 0 && nextPort <= 65535 ? nextPort : this.config.port,
      toolProfile: partialConfig && partialConfig.toolProfile
        ? (partialConfig.toolProfile === 'full' ? 'full' : 'core')
        : this.config.toolProfile,
      autostart: partialConfig && typeof partialConfig.autostart === 'boolean'
        ? partialConfig.autostart
        : this.config.autostart,
      maxInteractionLogEntries: Number.isInteger(nextMaxEntries)
        ? Math.max(10, Math.min(500, nextMaxEntries))
        : this.config.maxInteractionLogEntries,
    };

    const configPath = this.config.configPath;
    fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2) + '\n', 'utf8');
    const wasRunning = Boolean(this.server && this.server.isRunning());
    if (wasRunning) {
      await this.stopServer();
    }
    this.reloadRuntime();
    if (wasRunning) {
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
    openPanel() {
      return service.openPanel();
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

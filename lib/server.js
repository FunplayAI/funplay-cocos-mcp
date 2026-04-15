'use strict';

const http = require('http');
const IMAGE_DATA_URI_PREFIX = 'data:image/png;base64,';
const LOG_PREFIX = '[Funplay Cocos MCP Server]';

function json(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function textContent(value) {
  if (typeof value === 'string' && value.startsWith(IMAGE_DATA_URI_PREFIX)) {
    return [
      {
        type: 'image',
        data: value.slice(IMAGE_DATA_URI_PREFIX.length),
        mimeType: 'image/png',
      },
      {
        type: 'text',
        text: 'Screenshot captured successfully.',
      },
    ];
  }

  return [
    {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    },
  ];
}

class McpServer {
  constructor(options) {
    this.config = options.config;
    this.toolRegistry = options.toolRegistry;
    this.resourceProvider = options.resourceProvider;
    this.promptProvider = options.promptProvider;
    this.interactionLog = options.interactionLog;
    this.serverName = options.serverName;
    this.serverVersion = options.serverVersion;
    this.server = null;
  }

  isRunning() {
    return Boolean(this.server && this.server.listening);
  }

  async start() {
    if (this.isRunning()) {
      console.log(`${LOG_PREFIX} Start skipped: already running.`);
      return;
    }

    console.log(`${LOG_PREFIX} Creating HTTP server on ${this.config.host}:${this.config.port}...`);
    this.server = http.createServer(async (request, response) => {
      try {
        if (request.method === 'GET' && request.url === '/health') {
          console.log(`${LOG_PREFIX} GET /health`);
          return json(response, 200, { ok: true, name: this.serverName, version: this.serverVersion });
        }

        if (request.method !== 'POST') {
          console.warn(`${LOG_PREFIX} Rejected ${request.method} ${request.url}: method not allowed.`);
          return json(response, 405, { error: 'Method Not Allowed' });
        }

        const body = await this.readBody(request);
        if (!body) {
          return json(response, 400, this.createError(null, -32700, 'Parse error: empty body'));
        }

        const rpc = JSON.parse(body);
        if (rpc && rpc.method) {
          console.log(`${LOG_PREFIX} RPC ${rpc.method}`);
        }
        const result = await this.handleRpcRequest(rpc);
        if (result == null) {
          response.writeHead(204);
          response.end();
          return;
        }

        return json(response, 200, result);
      } catch (error) {
        console.error(`${LOG_PREFIX} Request handling failed: ${error.message}`);
        return json(response, 500, this.createError(null, -32603, `Internal error: ${error.message}`));
      }
    });

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.off('error', reject);
        console.log(`${LOG_PREFIX} Listening on http://${this.config.host}:${this.config.port}/`);
        resolve();
      });
    });
  }

  async stop() {
    if (!this.server) {
      console.log(`${LOG_PREFIX} Stop skipped: server object is empty.`);
      return;
    }

    console.log(`${LOG_PREFIX} Closing HTTP server...`);
    const active = this.server;
    this.server = null;
    await new Promise((resolve, reject) => {
      active.close((error) => {
        if (error) {
          console.error(`${LOG_PREFIX} Close failed: ${error.message}`);
          reject(error);
          return;
        }
        console.log(`${LOG_PREFIX} HTTP server closed.`);
        resolve();
      });
    });
  }

  readBody(request) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      request.on('error', reject);
    });
  }

  async handleRpcRequest(request) {
    if (!request || request.jsonrpc !== '2.0') {
      return this.createError(request && request.id, -32600, 'Invalid Request');
    }

    const method = request.method;
    if (typeof method !== 'string' || !method) {
      return this.createError(request.id, -32600, 'Invalid Request: method is required');
    }

    if (method === 'initialize') {
      return this.createResult(request.id, {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: this.serverName,
          version: this.serverVersion,
        },
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      });
    }

    if (method === 'notifications/initialized' || method === 'notifications/cancelled' || method.startsWith('notifications/')) {
      return null;
    }

    if (method === 'tools/list') {
      return this.createResult(request.id, { tools: this.toolRegistry.listTools() });
    }

    if (method === 'tools/call') {
      const params = request.params || {};
      if (typeof params.name !== 'string' || !params.name) {
        return this.createError(request.id, -32602, "Invalid params: 'name' is required");
      }

      try {
        const output = await this.toolRegistry.callTool(params.name, params.arguments || {});
        return this.createResult(request.id, { content: textContent(output) });
      } catch (error) {
        return this.createError(request.id, -32603, error.message);
      }
    }

    if (method === 'resources/list') {
      return this.createResult(request.id, { resources: this.resourceProvider.listResources() });
    }

    if (method === 'resources/read') {
      const params = request.params || {};
      if (typeof params.uri !== 'string' || !params.uri) {
        return this.createError(request.id, -32602, "Invalid params: 'uri' is required");
      }
      return this.createResult(request.id, await this.resourceProvider.readResource(params.uri));
    }

    if (method === 'resources/templates/list') {
      return this.createResult(request.id, { resourceTemplates: this.resourceProvider.listResourceTemplates() });
    }

    if (method === 'prompts/list') {
      return this.createResult(request.id, { prompts: this.promptProvider.listPrompts() });
    }

    if (method === 'prompts/get') {
      const params = request.params || {};
      if (typeof params.name !== 'string' || !params.name) {
        return this.createError(request.id, -32602, "Invalid params: 'name' is required");
      }
      return this.createResult(request.id, this.promptProvider.getPrompt(params.name, params.arguments || {}));
    }

    return this.createError(request.id, -32601, `Method not found: ${method}`);
  }

  createResult(id, result) {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  createError(id, code, message) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
      },
    };
  }
}

module.exports = {
  McpServer,
};

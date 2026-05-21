'use strict';

const crypto = require('crypto');
const http = require('http');
const { safeStringify } = require('./utils');
const IMAGE_DATA_URI_PREFIX = 'data:image/png;base64,';
const LOG_PREFIX = '[Funplay Cocos MCP Server]';
const MAX_PORT_FALLBACK_ATTEMPTS = 20;
const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;
const MCP_PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = [
  MCP_PROTOCOL_VERSION,
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
];

function responseHeaders(protocolVersion = MCP_PROTOCOL_VERSION, extraHeaders = {}) {
  return {
    'MCP-Protocol-Version': protocolVersion,
    ...extraHeaders,
  };
}

function json(response, statusCode, payload, protocolVersion = MCP_PROTOCOL_VERSION, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...responseHeaders(protocolVersion, extraHeaders),
  });
  response.end(JSON.stringify(payload));
}

function empty(response, statusCode, protocolVersion = MCP_PROTOCOL_VERSION, extraHeaders = {}) {
  response.writeHead(statusCode, responseHeaders(protocolVersion, extraHeaders));
  response.end();
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

function isStructuredValue(value) {
  return value !== null && typeof value === 'object' && !Buffer.isBuffer(value);
}

function structuredContent(value) {
  if (!isStructuredValue(value)) {
    return null;
  }

  try {
    return JSON.parse(safeStringify(value));
  } catch (error) {
    return null;
  }
}

class McpServer {
  constructor(options) {
    this.config = options.config;
    this.toolRegistry = options.toolRegistry;
    this.resourceProvider = options.resourceProvider;
    this.promptProvider = options.promptProvider;
    this.interactionLog = options.interactionLog;
    this.runtimeLog = options.runtimeLog;
    this.serverName = options.serverName;
    this.serverVersion = options.serverVersion;
    this.server = null;
    this.actualPort = null;
    this.portFallbackInfo = null;
    this.negotiatedProtocolVersion = MCP_PROTOCOL_VERSION;
    this.enableSessions = Boolean(this.config && this.config.enableSessions);
    this.sessions = new Set();
  }

  isRunning() {
    return Boolean(this.server && this.server.listening);
  }

  getPort() {
    if (this.server && typeof this.server.address === 'function') {
      const address = this.server.address();
      if (address && typeof address.port === 'number') {
        return address.port;
      }
    }
    return this.actualPort || this.config.port;
  }

  getRequestedPort() {
    return this.config.port;
  }

  getPortFallbackInfo() {
    return this.portFallbackInfo;
  }

  log(level, message) {
    if (this.runtimeLog && typeof this.runtimeLog.add === 'function') {
      this.runtimeLog.add(level, message);
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

  async start() {
    if (this.isRunning()) {
      this.log('info', 'Start skipped: already running.');
      return;
    }

    this.actualPort = null;
    this.portFallbackInfo = null;

    const requestHandler = async (request, response) => {
      try {
        const requestUrl = new URL(request.url || '/', 'http://localhost');
        if (request.method === 'GET' && requestUrl.pathname === '/health') {
          this.log('info', 'GET /health');
          return json(response, 200, { ok: true, name: this.serverName, version: this.serverVersion }, this.negotiatedProtocolVersion);
        }

        if (request.method === 'GET' && requestUrl.pathname === '/tools') {
          this.log('info', 'GET /tools');
          const includeCatalog = requestUrl.searchParams.get('catalog') === '1';
          const tools = includeCatalog && typeof this.toolRegistry.listToolCatalog === 'function'
            ? this.toolRegistry.listToolCatalog()
            : this.toolRegistry.listTools();
          const baseUrl = `http://${request.headers.host || `${this.config.host}:${this.getPort()}`}`;
          return json(response, 200, {
            ok: true,
            name: this.serverName,
            version: this.serverVersion,
            count: tools.length,
            tools,
            examples: {
              health: `curl ${baseUrl}/health`,
              tools: `curl ${baseUrl}/tools`,
              catalog: `curl ${baseUrl}/tools?catalog=1`,
            },
          }, this.negotiatedProtocolVersion);
        }

        if (!this.isAllowedOrigin(request)) {
          this.log('warn', `Rejected ${request.method} ${request.url}: invalid Origin header.`);
          return json(response, 403, { error: 'Forbidden: invalid Origin header' }, this.negotiatedProtocolVersion);
        }

        if (request.method === 'DELETE') {
          return this.handleDelete(request, response);
        }

        if (request.method === 'GET') {
          this.log('warn', `Rejected ${request.method} ${request.url}: SSE GET streams are not supported.`);
          return json(response, 405, { error: 'Method Not Allowed: SSE streams are not supported' }, this.negotiatedProtocolVersion);
        }

        if (request.method !== 'POST') {
          this.log('warn', `Rejected ${request.method} ${request.url}: method not allowed.`);
          return json(response, 405, { error: 'Method Not Allowed' }, this.negotiatedProtocolVersion);
        }

        const acceptHeaderError = this.validateAcceptHeader(request);
        if (acceptHeaderError) {
          return json(response, 406, acceptHeaderError, this.negotiatedProtocolVersion);
        }

        const body = await this.readBody(request);
        if (!body) {
          return json(response, 400, this.createError(null, -32700, 'Parse error: empty body'), this.negotiatedProtocolVersion);
        }

        let rpc;
        try {
          rpc = JSON.parse(body);
        } catch (error) {
          return json(response, 400, this.createError(null, -32700, `Parse error: ${error.message}`), this.negotiatedProtocolVersion);
        }

        if (rpc && rpc.method) {
          this.log('info', `RPC ${rpc.method}`);
        }

        const protocolHeaderError = this.validateProtocolVersionHeader(request, rpc);
        if (protocolHeaderError) {
          return json(response, 400, protocolHeaderError, this.negotiatedProtocolVersion);
        }
        const responseProtocolVersion = this.getProtocolVersionForResponse(request, rpc);

        const sessionError = this.validateSession(request, rpc);
        if (sessionError) {
          return json(response, sessionError.statusCode, sessionError.error, responseProtocolVersion);
        }

        const messageType = this.classifyJsonRpcMessage(rpc);
        if (messageType === 'response') {
          return empty(response, 202, responseProtocolVersion);
        }

        if (messageType === 'notification') {
          const notificationError = this.handleRpcNotification(rpc);
          if (notificationError) {
            return json(response, 400, notificationError, responseProtocolVersion);
          }
          return empty(response, 202, responseProtocolVersion);
        }

        if (messageType !== 'request') {
          return json(response, 400, this.createError(rpc && rpc.id, -32600, 'Invalid Request'), responseProtocolVersion);
        }

        const result = await this.handleRpcRequest(rpc);
        if (result == null) {
          return empty(response, 202, responseProtocolVersion);
        }

        const extraHeaders = {};
        if (this.enableSessions && rpc.method === 'initialize' && result && !result.error) {
          const sessionId = this.createSessionId();
          this.sessions.add(sessionId);
          extraHeaders['Mcp-Session-Id'] = sessionId;
        }

        return json(response, 200, result, this.getProtocolVersionForResponse(request, rpc), extraHeaders);
      } catch (error) {
        this.log('error', `Request handling failed: ${error.message}`);
        const statusCode = error.statusCode || 500;
        const rpcCode = error.rpcCode || -32603;
        const message = statusCode === 500 ? `Internal error: ${error.message}` : error.message;
        return json(response, statusCode, this.createError(null, rpcCode, message), this.negotiatedProtocolVersion);
      }
    };

    let attempt = 0;
    let port = this.config.port;
    let lastError = null;

    while (attempt <= MAX_PORT_FALLBACK_ATTEMPTS) {
      this.log('info', `Creating HTTP server on ${this.config.host}:${port}...`);
      const candidate = http.createServer(requestHandler);

      try {
        await this.listen(candidate, port, this.config.host);
        this.server = candidate;
        this.actualPort = candidate.address() && typeof candidate.address().port === 'number'
          ? candidate.address().port
          : port;

        if (this.config.port !== 0 && this.actualPort !== this.config.port) {
          this.portFallbackInfo = {
            requestedPort: this.config.port,
            actualPort: this.actualPort,
            attempts: attempt,
          };
          this.log(
            'warn',
            `Port ${this.config.port} was unavailable. Fell back to ${this.actualPort}.`
          );
        }

        this.log('info', `Listening on http://${this.config.host}:${this.actualPort}/`);
        return;
      } catch (error) {
        lastError = error;
        if (error && error.code === 'EADDRINUSE' && port < 65535 && attempt < MAX_PORT_FALLBACK_ATTEMPTS) {
          const nextPort = port + 1;
          this.log(
            'warn',
            `Port ${port} is already in use. Trying fallback port ${nextPort}...`
          );
          port = nextPort;
          attempt += 1;
          continue;
        }

        candidate.removeAllListeners();
        break;
      }
    }

    this.server = null;
    this.actualPort = null;
    this.portFallbackInfo = null;
    throw lastError || new Error('Failed to start MCP server.');
  }

  async stop() {
    if (!this.server) {
      this.log('info', 'Stop skipped: server object is empty.');
      return;
    }

    this.log('info', 'Closing HTTP server...');
    const active = this.server;
    this.server = null;
    this.actualPort = null;
    this.portFallbackInfo = null;
    await new Promise((resolve, reject) => {
      active.close((error) => {
        if (error) {
          this.log('error', `Close failed: ${error.message}`);
          reject(error);
          return;
        }
        this.log('info', 'HTTP server closed.');
        resolve();
      });
    });
  }

  listen(server, port, host) {
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
  }

  readBody(request) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      request.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_REQUEST_BODY_BYTES) {
          const error = new Error(`Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes.`);
          error.statusCode = 413;
          error.rpcCode = -32600;
          reject(error);
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      request.on('error', reject);
    });
  }

  isAllowedOrigin(request) {
    const origin = request.headers && request.headers.origin;
    if (!origin) {
      return true;
    }

    try {
      const parsed = new URL(String(origin));
      const hostname = parsed.hostname.toLowerCase();
      const configuredHost = String(this.config.host || '').toLowerCase();
      return hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '::1'
        || (configuredHost && hostname === configuredHost);
    } catch (error) {
      return false;
    }
  }

  validateAcceptHeader(request) {
    const header = request.headers && request.headers.accept;
    if (!header) {
      return this.createError(
        null,
        -32600,
        'Missing Accept header. Streamable HTTP clients must accept application/json and text/event-stream.'
      );
    }

    const tokens = String(Array.isArray(header) ? header.join(',') : header)
      .split(',')
      .map((item) => item.split(';')[0].trim().toLowerCase())
      .filter(Boolean);
    const hasWildcard = tokens.includes('*/*');
    const hasJson = hasWildcard || tokens.includes('application/json') || tokens.includes('application/*');
    const hasSse = hasWildcard || tokens.includes('text/event-stream') || tokens.includes('text/*');

    if (!hasJson || !hasSse) {
      return this.createError(
        null,
        -32600,
        'Invalid Accept header. Streamable HTTP clients must accept both application/json and text/event-stream.'
      );
    }

    return null;
  }

  validateProtocolVersionHeader(request, rpc) {
    const header = request.headers && request.headers['mcp-protocol-version'];
    if (!header || (rpc && rpc.method === 'initialize')) {
      return null;
    }

    const version = Array.isArray(header) ? header[0] : String(header);
    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
      return this.createError(
        rpc && rpc.id,
        -32600,
        `Unsupported MCP protocol version header: ${version}`
      );
    }

    return null;
  }

  getProtocolVersionForResponse(request, rpc) {
    if (rpc && rpc.method === 'initialize') {
      return this.negotiatedProtocolVersion;
    }

    const header = request.headers && request.headers['mcp-protocol-version'];
    const version = Array.isArray(header) ? header[0] : header ? String(header) : '';
    if (SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
      return version;
    }
    return this.negotiatedProtocolVersion;
  }

  validateSession(request, rpc) {
    if (!this.enableSessions || (rpc && rpc.method === 'initialize')) {
      return null;
    }

    const sessionId = this.getSessionId(request);
    if (!sessionId) {
      return {
        statusCode: 400,
        error: this.createError(rpc && rpc.id, -32600, 'Missing Mcp-Session-Id header.'),
      };
    }
    if (!this.sessions.has(sessionId)) {
      return {
        statusCode: 404,
        error: this.createError(rpc && rpc.id, -32001, 'Unknown or expired MCP session.'),
      };
    }
    return null;
  }

  getSessionId(request) {
    const value = request.headers && (request.headers['mcp-session-id'] || request.headers['Mcp-Session-Id']);
    if (Array.isArray(value)) {
      return value[0] || '';
    }
    return value ? String(value) : '';
  }

  createSessionId() {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
  }

  handleDelete(request, response) {
    if (!this.enableSessions) {
      return json(response, 405, { error: 'Method Not Allowed: MCP sessions are disabled' }, this.negotiatedProtocolVersion);
    }

    const sessionId = this.getSessionId(request);
    if (!sessionId) {
      return json(
        response,
        400,
        this.createError(null, -32600, 'Missing Mcp-Session-Id header.'),
        this.negotiatedProtocolVersion
      );
    }
    if (!this.sessions.has(sessionId)) {
      return json(
        response,
        404,
        this.createError(null, -32001, 'Unknown or expired MCP session.'),
        this.negotiatedProtocolVersion
      );
    }

    this.sessions.delete(sessionId);
    return empty(response, 202, this.negotiatedProtocolVersion);
  }

  classifyJsonRpcMessage(message) {
    if (!message || message.jsonrpc !== '2.0') {
      return 'invalid';
    }
    if (typeof message.method === 'string') {
      return Object.prototype.hasOwnProperty.call(message, 'id') ? 'request' : 'notification';
    }
    if (
      Object.prototype.hasOwnProperty.call(message, 'id') &&
      (Object.prototype.hasOwnProperty.call(message, 'result') || Object.prototype.hasOwnProperty.call(message, 'error'))
    ) {
      return 'response';
    }
    return 'invalid';
  }

  handleRpcNotification(notification) {
    if (!notification || notification.jsonrpc !== '2.0' || typeof notification.method !== 'string') {
      return this.createError(null, -32600, 'Invalid Request');
    }

    if (notification.method.startsWith('notifications/')) {
      return null;
    }

    return this.createError(null, -32601, `Notification method not found: ${notification.method}`);
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
      this.negotiatedProtocolVersion = this.negotiateProtocolVersion(request.params && request.params.protocolVersion);
      return this.createResult(request.id, {
        protocolVersion: this.negotiatedProtocolVersion,
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
        const output = typeof this.toolRegistry.callToolDetailed === 'function'
          ? await this.toolRegistry.callToolDetailed(params.name, params.arguments || {})
          : { value: null, text: await this.toolRegistry.callTool(params.name, params.arguments || {}) };
        const result = { content: textContent(output.text) };
        const structured = structuredContent(output.value);
        if (structured) {
          result.structuredContent = structured;
        }
        return this.createResult(request.id, result);
      } catch (error) {
        const result = {
          content: textContent(error.message),
          isError: true,
        };
        const structured = structuredContent(error.toolEnvelope);
        if (structured) {
          result.structuredContent = structured;
        }
        return this.createResult(request.id, result);
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

  negotiateProtocolVersion(clientVersion) {
    if (SUPPORTED_PROTOCOL_VERSIONS.includes(clientVersion)) {
      return clientVersion;
    }
    return MCP_PROTOCOL_VERSION;
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
  MCP_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
};

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const DEFAULT_URL = 'http://127.0.0.1:8765/';
const DEFAULT_TIMEOUT_SECONDS = 120;
const ACCEPT_HEADER = 'application/json, text/event-stream';

async function main() {
  const args = process.argv.slice(2);

  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    printHelp();
    return 0;
  }

  if (hasFlag(args, '--version')) {
    console.error(`funplay-cocos-mcp ${readPackageVersion()}`);
    return 0;
  }

  const urlText = getOption(args, '--url')
    || process.env.FUNPLAY_COCOS_MCP_URL
    || DEFAULT_URL;
  const timeoutText = getOption(args, '--timeout-seconds')
    || process.env.FUNPLAY_COCOS_MCP_TIMEOUT_SECONDS
    || String(DEFAULT_TIMEOUT_SECONDS);

  const endpoint = parseEndpoint(urlText);
  if (!endpoint) {
    console.error(`Invalid --url value: ${urlText}`);
    return 2;
  }

  const timeoutSeconds = Number.parseInt(timeoutText, 10);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    console.error(`Invalid timeout value: ${timeoutText}`);
    return 2;
  }

  console.error(`[Funplay Cocos MCP] Bridging stdio to ${endpoint.href}`);
  await bridgeStdioToHttp({
    input: process.stdin,
    output: process.stdout,
    endpoint,
    timeoutMs: timeoutSeconds * 1000
  });
  return 0;
}

async function bridgeStdioToHttp({ input, output, endpoint, timeoutMs }) {
  let sessionId = '';

  while (true) {
    const message = await readMessage(input);
    if (message === null) {
      return;
    }

    let parsed = null;
    let requestId = null;
    try {
      parsed = JSON.parse(message);
      requestId = getRequestId(parsed);
    } catch (error) {
      await writeJsonRpcError(output, null, -32700, 'Parse error');
      continue;
    }

    try {
      const response = await postJsonRpc(endpoint, message, {
        timeoutMs,
        sessionId
      });

      const nextSessionId = response.headers['mcp-session-id'];
      if (typeof nextSessionId === 'string' && nextSessionId) {
        sessionId = nextSessionId;
      }

      if (response.statusCode >= 200 && response.statusCode < 300 && response.body.trim()) {
        await writeMessage(output, response.body);
        continue;
      }

      if (response.statusCode >= 200 && response.statusCode < 300 && isNotification(parsed)) {
        continue;
      }

      if (requestId !== null) {
        const messageText = response.body.trim()
          ? `Cocos MCP server returned HTTP ${response.statusCode}: ${response.body}`
          : `Cocos MCP server returned HTTP ${response.statusCode}.`;
        await writeJsonRpcError(output, requestId, -32000, messageText);
      }
    } catch (error) {
      console.error(`[Funplay Cocos MCP] ${error.message}`);
      if (requestId !== null) {
        await writeJsonRpcError(output, requestId, -32000, `Proxy transport error: ${error.message}`);
      }
    }
  }
}

function postJsonRpc(endpoint, body, { timeoutMs, sessionId }) {
  return new Promise((resolve, reject) => {
    const client = endpoint.protocol === 'https:' ? https : http;
    const request = client.request(
      endpoint,
      {
        method: 'POST',
        headers: {
          Accept: ACCEPT_HEADER,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {})
        },
        timeout: timeoutMs
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode || 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error(`HTTP request timed out after ${timeoutMs / 1000} seconds.`));
    });
    request.on('error', reject);
    request.end(body);
  });
}

function parseEndpoint(value) {
  try {
    const endpoint = new URL(value);
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
      return null;
    }
    return endpoint;
  } catch (error) {
    return null;
  }
}

function getRequestId(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(value, 'id') ? value.id : null;
}

function isNotification(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && value.method && !Object.prototype.hasOwnProperty.call(value, 'id'));
}

async function writeJsonRpcError(output, id, code, message) {
  await writeMessage(output, JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  }));
}

async function readMessage(input) {
  const headers = new Map();

  while (true) {
    const line = await readHeaderLine(input);
    if (line === null) {
      return headers.size === 0 ? null : Promise.reject(new Error('Unexpected EOF while reading MCP headers.'));
    }

    if (line === '') {
      break;
    }

    const separator = line.indexOf(':');
    if (separator <= 0) {
      continue;
    }

    headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }

  const contentLength = Number.parseInt(headers.get('content-length') || '', 10);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    throw new Error('Missing Content-Length header.');
  }

  const payload = await readExact(input, contentLength);
  return payload.toString('utf8');
}

function readHeaderLine(input) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    function cleanup() {
      input.off('readable', onReadable);
      input.off('end', onEnd);
      input.off('error', onError);
    }

    function onReadable() {
      let byte;
      while ((byte = input.read(1)) !== null) {
        if (byte[0] === 0x0a) {
          cleanup();
          if (chunks.length > 0 && chunks[chunks.length - 1][0] === 0x0d) {
            chunks.pop();
          }
          resolve(Buffer.concat(chunks).toString('ascii'));
          return;
        }
        chunks.push(byte);
      }
    }

    function onEnd() {
      cleanup();
      resolve(chunks.length === 0 ? null : Buffer.concat(chunks).toString('ascii'));
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    input.on('readable', onReadable);
    input.once('end', onEnd);
    input.once('error', onError);
    onReadable();
  });
}

function readExact(input, length) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let remaining = length;

    function cleanup() {
      input.off('readable', onReadable);
      input.off('end', onEnd);
      input.off('error', onError);
    }

    function onReadable() {
      while (remaining > 0) {
        const chunk = input.read(remaining);
        if (chunk === null) {
          return;
        }
        chunks.push(chunk);
        remaining -= chunk.length;
      }
      cleanup();
      resolve(Buffer.concat(chunks, length));
    }

    function onEnd() {
      cleanup();
      reject(new Error('Unexpected EOF while reading MCP payload.'));
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    input.on('readable', onReadable);
    input.once('end', onEnd);
    input.once('error', onError);
    onReadable();
  });
}

function writeMessage(output, json) {
  const payload = Buffer.from(json, 'utf8');
  return new Promise((resolve, reject) => {
    output.write(`Content-Length: ${payload.length}\r\n\r\n`, 'ascii', (headerError) => {
      if (headerError) {
        reject(headerError);
        return;
      }
      output.write(payload, (payloadError) => {
        if (payloadError) {
          reject(payloadError);
          return;
        }
        resolve();
      });
    });
  });
}

function hasFlag(args, name) {
  return args.some((arg) => arg.toLowerCase() === name.toLowerCase());
}

function getOption(args, name) {
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i].toLowerCase() === name.toLowerCase()) {
      return args[i + 1];
    }
  }
  return '';
}

function readPackageVersion() {
  try {
    const packagePath = path.resolve(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return packageJson.version || '0.0.0';
  } catch (error) {
    return '0.0.0';
  }
}

function printHelp() {
  console.error('funplay-cocos-mcp');
  console.error('Bridges stdio MCP traffic to a local Cocos Creator HTTP MCP server.');
  console.error();
  console.error('Options:');
  console.error('  --url <http://127.0.0.1:8765/>   Cocos MCP HTTP endpoint.');
  console.error('  --timeout-seconds <120>           HTTP timeout per request.');
  console.error('  --version                         Print the proxy version.');
  console.error('  --help                            Show this help.');
  console.error();
  console.error('Environment:');
  console.error('  FUNPLAY_COCOS_MCP_URL');
  console.error('  FUNPLAY_COCOS_MCP_TIMEOUT_SECONDS');
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(`[Funplay Cocos MCP] ${error.message}`);
    process.exitCode = 1;
  });
}

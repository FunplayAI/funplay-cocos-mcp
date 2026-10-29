'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { hasRuntimeConfigChanges, normalizeHost } = require('../lib/config');

const BASE_CONFIG = {
  host: '127.0.0.1',
  port: 8765,
  toolProfile: 'core',
  enabledTools: [],
  disabledTools: [],
  enabledToolCategories: [],
  disabledToolCategories: [],
  enableSessions: false,
  executeJavascriptSafetyChecks: true,
  maxInteractionLogEntries: 50,
  language: 'auto',
  lastClientTargetId: 'codex',
};

test('language-only config changes do not require an MCP runtime reload', () => {
  assert.equal(hasRuntimeConfigChanges(BASE_CONFIG, { ...BASE_CONFIG, language: 'zh' }), false);
  assert.equal(hasRuntimeConfigChanges(BASE_CONFIG, { ...BASE_CONFIG, lastClientTargetId: 'cursor' }), false);
});

test('transport, exposure, and log capacity changes require an MCP runtime reload', () => {
  assert.equal(hasRuntimeConfigChanges(BASE_CONFIG, { ...BASE_CONFIG, port: 9000 }), true);
  assert.equal(hasRuntimeConfigChanges(BASE_CONFIG, { ...BASE_CONFIG, enabledTools: ['write_file'] }), true);
  assert.equal(hasRuntimeConfigChanges(BASE_CONFIG, { ...BASE_CONFIG, maxInteractionLogEntries: 100 }), true);
});

test('Host edits accept IP addresses and hostnames but never an empty binding, URL or embedded port', () => {
  for (const host of ['127.0.0.1', '0.0.0.0', '192.168.64.1', '::1', '::', 'localhost', 'my-host.local']) {
    assert.equal(normalizeHost(` ${host} `), host);
  }
  for (const host of ['', ' ', false, {}, [], 'http://localhost', 'localhost:8765', '[::1]', 'a/b', 'a b', '-bad']) {
    assert.throws(() => normalizeHost(host), /Host/);
  }
});

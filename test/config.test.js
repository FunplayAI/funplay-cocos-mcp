'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { hasRuntimeConfigChanges } = require('../lib/config');

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

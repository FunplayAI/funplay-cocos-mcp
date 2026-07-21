'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const EN = require('../i18n/en');
const ZH = require('../i18n/zh');
const { createToolRegistry } = require('../lib/tool-registry');
const {
  ZH_TOOL_DESCRIPTIONS,
  localizeToolDescription,
} = require('../panel/tool-description-i18n');
const {
  detectEditorLanguage,
  normalizeLanguagePreference,
  normalizeLocale,
  resolveLanguage,
  translate,
} = require('../lib/i18n');

const DICTIONARIES = { en: EN, zh: ZH };

test('language preferences and locales normalize to supported values', () => {
  assert.equal(normalizeLanguagePreference('ZH'), 'zh');
  assert.equal(normalizeLanguagePreference('en'), 'en');
  assert.equal(normalizeLanguagePreference('fr'), 'auto');
  assert.equal(normalizeLocale('zh-CN'), 'zh');
  assert.equal(normalizeLocale('zh_TW'), 'zh');
  assert.equal(normalizeLocale('en-US'), 'en');
});

test('automatic language follows the detected Cocos Creator language', () => {
  assert.equal(resolveLanguage('auto', 'zh'), 'zh');
  assert.equal(resolveLanguage('auto', 'en'), 'en');
  assert.equal(resolveLanguage('en', 'zh'), 'en');
  assert.equal(resolveLanguage('zh', 'en'), 'zh');

  const editor = { I18n: { t: () => 'zh' } };
  assert.equal(detectEditorLanguage(editor), 'zh');
});

test('English and Chinese dictionaries stay complete and interpolate values', () => {
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(ZH).sort());
  assert.equal(translate(DICTIONARIES, 'en', 'dashboard.version', { version: '0.4.3' }), 'Version 0.4.3');
  assert.equal(translate(DICTIONARIES, 'zh', 'dashboard.version', { version: '0.4.3' }), '版本 0.4.3');
  assert.equal(translate(DICTIONARIES, 'zh', 'missing.key'), 'missing.key');
});

test('panel and package localization references exist in both dictionaries', () => {
  const panelSource = fs.readFileSync(require.resolve('../panel/shared'), 'utf8');
  const panelKeys = [
    ...panelSource.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g),
    ...panelSource.matchAll(/this\.t\('([^']+)'/g),
  ].map((match) => match[1]);
  const packageSource = fs.readFileSync(require.resolve('../package.json'), 'utf8');
  const packageKeys = [...packageSource.matchAll(/i18n:funplay-cocos-mcp\.([A-Za-z0-9_]+)/g)]
    .map((match) => match[1]);

  for (const key of new Set([...panelKeys, ...packageKeys])) {
    assert.equal(key in EN, true, `Missing English translation: ${key}`);
    assert.equal(key in ZH, true, `Missing Chinese translation: ${key}`);
  }
});

test('every built-in tool has a Chinese panel description', () => {
  const registry = createToolRegistry({
    getRuntimeContext: () => ({ config: { toolProfile: 'full' } }),
    getStatus: () => ({}),
    sceneBridge: { call: async () => ({}) },
    editorExecutor: async () => ({}),
  });
  const catalog = registry.listToolCatalog();
  const toolNames = catalog.map((tool) => tool.name).sort();
  const translatedNames = Object.keys(ZH_TOOL_DESCRIPTIONS).sort();

  assert.deepEqual(translatedNames, toolNames);
  for (const tool of catalog) {
    assert.notEqual(localizeToolDescription(tool, 'zh'), tool.description);
    assert.equal(localizeToolDescription(tool, 'en'), tool.description);
  }
  assert.equal(
    localizeToolDescription({
      name: 'list_animations',
      description: '[core] List Animation components.',
    }, 'zh'),
    '[核心] 列出当前场景或指定节点下的 Animation 组件。'
  );
});

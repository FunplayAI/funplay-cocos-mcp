'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { PromptProvider } = require('../lib/prompts');
const { McpServer } = require('../lib/server');
const { parseProjectPrompt, loadProjectPrompts, MAX_PROMPT_BYTES } = require('../lib/project-prompts');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-prompts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'mcp-prompts');
  fs.mkdirSync(directory);
  const warnings = [];
  const provider = new PromptProvider(() => ({ projectName: 'Test', projectPath: root }), { onWarning: (message) => warnings.push(message) });
  return { root, directory, provider, warnings };
}

const definition = '---\nname: inspect_prefab\ndescription: Inspect a prefab\narguments: prefab_path(required), focus\n---\nInspect {prefab_path}. Focus: {focus}. Preserve {undeclared}.\n';

test('project prompts parse CRLF/BOM and interpolate once without evaluating code', (t) => {
  const { directory, provider } = fixture(t);
  fs.writeFileSync(path.join(directory, 'inspect.md'), '\uFEFF' + definition.replace(/\n/g, '\r\n'));
  const listed = provider.listPrompts();
  assert.equal(listed.length, 5);
  assert.equal(listed.at(-1).arguments[0].required, true);
  const text = provider.getPrompt('inspect_prefab', { prefab_path: '{focus} ${1+1}' }).messages[0].content.text;
  assert.match(text, /Inspect \{focus\} \$\{1\+1\}/);
  assert.match(text, /Focus: \. Preserve \{undeclared\}/);
});

test('new, changed and removed project prompt files are reflected without a restart', (t) => {
  const { directory, provider } = fixture(t);
  assert.equal(provider.listPrompts().length, 4);
  const file = path.join(directory, 'inspect.md');
  fs.writeFileSync(file, definition);
  assert.equal(provider.listPrompts().length, 5);
  fs.writeFileSync(file, definition.replace('Inspect {prefab_path}', 'Read {prefab_path}'));
  assert.match(provider.getPrompt('inspect_prefab', { prefab_path: 'assets/UI.prefab' }).messages[0].content.text, /Read assets\/UI.prefab/);
  fs.unlinkSync(file);
  assert.throws(() => provider.getPrompt('inspect_prefab'), /not found/);
});

test('invalid project files are skipped with visible deduplicated warnings', (t) => {
  const { directory, provider, warnings } = fixture(t);
  fs.writeFileSync(path.join(directory, 'a.md'), definition);
  fs.writeFileSync(path.join(directory, 'b.md'), definition);
  fs.writeFileSync(path.join(directory, 'bad.md'), 'not frontmatter');
  fs.writeFileSync(path.join(directory, 'reserved.md'), definition.replace('inspect_prefab', 'scene_validation'));
  fs.writeFileSync(path.join(directory, 'oversized.md'), 'x'.repeat(MAX_PROMPT_BYTES + 1));
  assert.equal(provider.listPrompts().length, 5);
  assert.equal(warnings.length, 4);
  provider.listPrompts();
  assert.equal(warnings.length, 4);
});

test('project prompt parsing rejects duplicate or malformed definitions', () => {
  for (const content of [
    definition.replace('name: inspect_prefab', 'name: Bad Name'),
    definition.replace('name: inspect_prefab', 'name: inspect_prefab\nname: other'),
    definition.replace('prefab_path(required), focus', 'x, x'),
    definition.replace('prefab_path(required), focus', 'x(optional)'),
    definition.replace('prefab_path(required), focus', 'x,'),
    '---\nname: empty\n---\n  ',
  ]) assert.throws(() => parseProjectPrompt(content));
});

test('prompt name, required, unknown and non-string arguments return invalid params', async (t) => {
  const { directory, provider } = fixture(t);
  fs.writeFileSync(path.join(directory, 'inspect.md'), definition);
  const server = new McpServer({ config: {}, promptProvider: provider });
  for (const [name, args] of [
    ['unknown', {}], ['inspect_prefab', {}], ['inspect_prefab', { prefab_path: '  ' }],
    ['inspect_prefab', { prefab_path: 'x', unknown: 'x' }],
    ['inspect_prefab', { prefab_path: 42 }], ['inspect_prefab', []], ['inspect_prefab', null],
    ['scene_validation', { focus: 'x'.repeat(65537) }],
  ]) {
    const response = await server.handleRpcRequest({ jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name, arguments: args } });
    assert.equal(response.error.code, -32602);
    assert.equal(response.result, undefined);
  }
  assert.ok(provider.getPrompt('scene_validation').messages.length);
  assert.match(provider.getPrompt('scene_validation', { focus: 'Canvas' }).messages[0].content.text, /focus: Canvas/);
});

test('prompt discovery rejects symbolic-link files and directories', (t) => {
  const { root, directory } = fixture(t);
  const source = path.join(root, 'source.md');
  fs.writeFileSync(source, definition);
  fs.symlinkSync(source, path.join(directory, 'linked.md'));
  assert.equal(loadProjectPrompts(root).prompts.length, 0);
  assert.equal(loadProjectPrompts(root).warnings.length, 1);
  const other = path.join(root, 'nested');
  fs.mkdirSync(other);
  fs.symlinkSync(directory, path.join(other, 'mcp-prompts'), 'dir');
  assert.equal(loadProjectPrompts(other).prompts.length, 0);
  assert.match(loadProjectPrompts(other).warnings[0], /symbolic link|outside the Cocos project/);
});

test('prompt file discovery is bounded and missing folders are harmless', (t) => {
  const { root, directory } = fixture(t);
  assert.deepEqual(loadProjectPrompts(path.join(root, 'missing')), { prompts: [], warnings: [] });
  for (let index = 0; index < 101; index += 1) fs.writeFileSync(path.join(directory, `${String(index).padStart(3, '0')}.md`), definition.replace('inspect_prefab', `prompt_${index}`));
  const loaded = loadProjectPrompts(root);
  assert.equal(loaded.prompts.length, 100);
  assert.match(loaded.warnings[0], /100/);
});

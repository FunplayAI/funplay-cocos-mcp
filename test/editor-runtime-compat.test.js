'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parseJsonc, updateJsonc } = require('../lib/jsonc');
const { readProjectInstruction, writeProjectInstruction } = require('../lib/project-instructions');
const { parseProjectPrompt, interpolatePrompt } = require('../lib/project-prompts');
const { PromptProvider } = require('../lib/prompts');

// node:test isolates files in separate processes. Keep these callbacks synchronous
// and restore the descriptor even on failure so no other test loses the API.
function withoutObjectHasOwn(run) {
  const descriptor = Object.getOwnPropertyDescriptor(Object, 'hasOwn');
  try {
    delete Object.hasOwn;
    assert.equal(Object.hasOwn, undefined);
    return run();
  } finally {
    if (descriptor) Object.defineProperty(Object, 'hasOwn', descriptor);
  }
}

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-editor-compat-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const promptSource = '---\nname: inspect_prefab\narguments: prefab_path(required), focus\n---\nInspect {prefab_path}. Focus: {focus}. Keep {undeclared}.\n';

test('older editor runtime: JSONC parsing and updates preserve own-key semantics', () => withoutObjectHasOwn(() => {
  const source = '// keep comment\n{"__proto__":{"safe":true},"hasOwnProperty":false,"mcp":{"old":{"url":"old"}},}';
  const desired = parseJsonc(source);
  assert.equal(Object.getPrototypeOf(desired), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(desired, '__proto__'), true);
  desired.__proto__.safe = false;
  delete desired.mcp.old;
  desired.mcp.next = { url: 'http://127.0.0.1:8765/' };
  const written = updateJsonc(source, desired);
  assert.ok(written.startsWith('// keep comment\n'));
  assert.deepEqual(parseJsonc(written), desired);
  assert.equal(updateJsonc(written, desired), written);
  assert.equal({}.safe, undefined);
  for (const duplicate of ['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"__proto__":1,"__proto__":2}']) {
    assert.throws(() => parseJsonc(duplicate), /duplicate object key/);
  }
}));

test('older editor runtime: instruction writes retain concurrent-edit and overwrite protection', (t) => {
  const root = project(t);
  withoutObjectHasOwn(() => {
    const options = Object.assign(Object.create(null), { target: 'AGENTS.md', content: 'first', expectedContent: null });
    assert.equal(writeProjectInstruction(root, options).written, true);
    assert.throws(() => writeProjectInstruction(root, { ...options, content: 'stale' }), /changed while editing/);
    assert.throws(() => writeProjectInstruction(root, { target: 'AGENTS.md', content: 'overwrite', overwrite: false }), /already exists/);
    assert.equal(readProjectInstruction(root, 'AGENTS.md').content, 'first');

    // An inherited expectedContent must not replace the current-file fallback.
    const inherited = Object.assign(Object.create({ expectedContent: 'stale' }), { target: 'AGENTS.md', content: 'second' });
    assert.equal(writeProjectInstruction(root, inherited).written, true);
    assert.equal(readProjectInstruction(root, 'AGENTS.md').content, 'second');
    assert.equal(writeProjectInstruction(root, { target: 'AGENTS.md', content: 'third', expectedContent: 'second' }).written, true);
    assert.equal(readProjectInstruction(root, 'AGENTS.md').content, 'third');
  });
});

test('older editor runtime: prompt frontmatter still rejects duplicate fields', () => withoutObjectHasOwn(() => {
  const prompt = parseProjectPrompt(promptSource);
  assert.equal(prompt.name, 'inspect_prefab');
  assert.equal(prompt.arguments[0].required, true);
  assert.throws(() => parseProjectPrompt(promptSource.replace('name: inspect_prefab', 'name: inspect_prefab\nname: other')), /Duplicate field/);
}));

test('older editor runtime: interpolation accepts null-prototype args and ignores inherited values', () => withoutObjectHasOwn(() => {
  const prompt = parseProjectPrompt(promptSource);
  const args = Object.assign(Object.create(null), { prefab_path: '{focus}' });
  assert.equal(interpolatePrompt(prompt.body, args, prompt.arguments), 'Inspect {focus}. Focus: . Keep {undeclared}.');
  const inherited = Object.assign(Object.create({ focus: 'hidden' }), { prefab_path: 'assets/UI.prefab' });
  assert.equal(interpolatePrompt(prompt.body, inherited, prompt.arguments), 'Inspect assets/UI.prefab. Focus: . Keep {undeclared}.');
}));

test('older editor runtime: built-in and project prompts retain argument validation', (t) => {
  const root = project(t);
  fs.mkdirSync(path.join(root, 'mcp-prompts'));
  fs.writeFileSync(path.join(root, 'mcp-prompts', 'inspect.md'), promptSource);
  withoutObjectHasOwn(() => {
    const provider = new PromptProvider(() => ({ projectPath: root, projectName: 'Compatibility test' }));
    assert.equal(provider.listPrompts().length, 5);
    assert.match(provider.getPrompt('scene_validation', { focus: 'Canvas' }).messages[0].content.text, /focus: Canvas/);
    const args = Object.assign(Object.create(null), { prefab_path: 'assets/UI.prefab' });
    assert.match(provider.getPrompt('inspect_prefab', args).messages[0].content.text, /Inspect assets\/UI.prefab/);
    for (const invalid of [{}, { prefab_path: ' ' }, Object.create({ prefab_path: 'inherited' })]) {
      assert.throws(() => provider.getPrompt('inspect_prefab', invalid), /Missing required argument/);
    }
    assert.throws(() => provider.getPrompt('inspect_prefab', { prefab_path: 42 }), /must be a string/);
    assert.throws(() => provider.getPrompt('not_a_prompt'), /Prompt not found/);
  });
});

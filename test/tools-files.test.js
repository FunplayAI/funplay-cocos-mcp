'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSnippet, createFileTools } = require('../lib/tools/files');

function createSchema(properties, required) {
  return { type: 'object', properties, required };
}

function createTools(projectPath) {
  return createFileTools({
    createSchema,
    getRuntimeContext: () => ({ projectPath }),
  });
}

function getTool(tools, name) {
  const tool = tools.find((item) => item.name === name);
  assert.ok(tool, `Expected ${name} to exist`);
  return tool;
}

test('buildSnippet returns focused line-numbered context', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-files-'));
  try {
    const filePath = path.join(root, 'sample.ts');
    fs.writeFileSync(filePath, ['alpha', 'beta', 'gamma', 'delta'].join('\n'), 'utf8');

    const snippet = buildSnippet(filePath, 2, 1);

    assert.match(snippet, / 1 \| alpha/);
    assert.match(snippet, />\s+2 \| beta/);
    assert.match(snippet, / 3 \| gamma/);
    assert.doesNotMatch(snippet, /delta/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('file tools write, read, replace, search, list, and check project files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-files-'));
  try {
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    const tools = createTools(root);

    const writeResult = await getTool(tools, 'write_file').handler({
      path: 'assets/player.ts',
      content: 'const name = "Hero";\nconst clone = "Hero";\n',
    });
    assert.match(writeResult, /Wrote \d+ chars/);

    const readResult = await getTool(tools, 'read_file').handler({ path: 'assets/player.ts' });
    assert.match(readResult, /const name = "Hero"/);

    await getTool(tools, 'replace_in_file').handler({
      path: 'assets/player.ts',
      search: 'Hero',
      replace: 'Player',
      replaceAll: true,
    });
    assert.equal(fs.readFileSync(path.join(root, 'assets', 'player.ts'), 'utf8').includes('Hero'), false);

    const searchResult = await getTool(tools, 'search_files').handler({ pattern: '*.ts', directory: 'assets' });
    assert.deepEqual(searchResult.files, ['assets/player.ts']);

    const listResult = await getTool(tools, 'list_directory').handler({ path: 'assets' });
    assert.deepEqual(listResult.entries, [{ name: 'player.ts', type: 'file' }]);

    const existsResult = await getTool(tools, 'exists').handler({ path: 'assets/player.ts' });
    assert.deepEqual(existsResult, {
      path: 'assets/player.ts',
      exists: true,
      isFile: true,
      isDirectory: false,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

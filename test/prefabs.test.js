'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { normalizePrefabTarget, savePrefabContent } = require('../lib/prefabs');

test('normalizePrefabTarget maps simple names into assets prefab paths', () => {
  const projectPath = path.resolve('/tmp/funplay-cocos-project');
  const target = normalizePrefabTarget(projectPath, 'Prefabs/LoginPanel');

  assert.equal(target.projectRelative, 'assets/Prefabs/LoginPanel.prefab');
  assert.equal(target.dbUrl, 'db://assets/Prefabs/LoginPanel.prefab');
});

test('normalizePrefabTarget rejects paths outside assets', () => {
  const projectPath = path.resolve('/tmp/funplay-cocos-project');
  assert.throws(() => normalizePrefabTarget(projectPath, '../Outside'), /inside the Cocos assets directory/);
});

test('savePrefabContent writes prefab content without Editor asset-db', async (t) => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-prefab-save-'));
  t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectPath, 'assets'), { recursive: true });

  const content = '[{"__type__":"cc.Prefab","data":{"__id__":1}},{"__type__":"cc.Node","_name":"Node"}]';
  const result = await savePrefabContent(projectPath, {
    target: 'Generated/TestPrefab',
    content,
  });

  assert.equal(result.created, true);
  assert.equal(result.path, 'assets/Generated/TestPrefab.prefab');
  assert.equal(result.dbUrl, 'db://assets/Generated/TestPrefab.prefab');
  assert.equal(result.fileExists, true);
  assert.equal(
    fs.readFileSync(path.join(projectPath, 'assets', 'Generated', 'TestPrefab.prefab'), 'utf8').trim(),
    content
  );
});

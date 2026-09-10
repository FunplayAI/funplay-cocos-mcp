'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SKILL_PLATFORMS, getSkillsDirectory, getSkillProjectPath } = require('../lib/skill-platforms');
const { getProjectSkillsState, updateBuiltInProjectSkill, getBuiltInProjectSkillState, createProjectSkillBackup, listProjectSkillBackups, restoreLatestBuiltInProjectSkillBackup } = require('../lib/project-skills');
const { COCOS_UI_SKILL_NAME, buildCocosUiProjectSkillContent, createProjectSkill } = require('../lib/project-instructions');

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-platforms-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

for (const platform of SKILL_PLATFORMS) {
  test(`${platform.name} installs Skills and manifests into its own directory`, (t) => {
    const root = project(t);
    const options = { clientId: platform.id, skillName: COCOS_UI_SKILL_NAME };
    assert.equal(getBuiltInProjectSkillState(root, options).status, 'missing');
    const installed = updateBuiltInProjectSkill(root, options);
    assert.equal(installed.state.path, `${platform.directory}/${COCOS_UI_SKILL_NAME}/SKILL.md`);
    assert.equal(installed.state.status, 'current');
    assert.ok(fs.existsSync(path.join(root, installed.manifest)));
    const custom = createProjectSkill(root, { clientId: platform.id, skillName: 'scene-qa', description: 'Validate this scene' });
    assert.equal(custom.path, `${platform.directory}/scene-qa/SKILL.md`);
    assert.equal(getProjectSkillsState(root, options).skills.length, 2);
    for (const other of SKILL_PLATFORMS.filter((item) => item.id !== platform.id)) assert.equal(getBuiltInProjectSkillState(root, { ...options, clientId: other.id }).status, 'missing');
  });
}

test('Kimi uses the nearest Git root, including .git files used by worktrees', (t) => {
  const root = project(t);
  fs.writeFileSync(path.join(root, '.git'), 'gitdir: elsewhere');
  const child = path.join(root, 'games', 'cocos');
  fs.mkdirSync(child, { recursive: true });
  assert.equal(getSkillProjectPath(child, { clientId: 'kimi' }), root);
  assert.equal(getSkillProjectPath(child, { clientId: 'codex' }), child);
  const installed = updateBuiltInProjectSkill(child, { clientId: 'kimi' });
  assert.ok(fs.existsSync(path.join(root, installed.write.path)));
  assert.equal(getProjectSkillsState(child, { clientId: 'kimi' }).projectPath, root);
});

test('legacy Codex UI v1 migrates with a backup and preserves the original file', (t) => {
  const root = project(t);
  const legacy = path.join(root, '.codex', 'skills', COCOS_UI_SKILL_NAME, 'SKILL.md');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  const original = fs.readFileSync(path.join(__dirname, 'fixtures/cocos-ui-skill-v1.md'), 'utf8');
  fs.writeFileSync(legacy, original);
  const options = { clientId: 'codex', skillName: COCOS_UI_SKILL_NAME };
  const state = getBuiltInProjectSkillState(root, options);
  assert.equal(state.status, 'update-available');
  assert.ok(state.legacyPath);
  const result = updateBuiltInProjectSkill(root, options);
  assert.equal(result.state.status, 'current');
  assert.equal(fs.readFileSync(legacy, 'utf8'), original);
  assert.equal(fs.readFileSync(path.join(root, result.backup.path), 'utf8'), original);
  assert.equal(fs.readFileSync(path.join(root, result.write.path), 'utf8'), buildCocosUiProjectSkillContent());
});

test('legacy modified Skills require consent and never replace an existing new-directory file', (t) => {
  const root = project(t);
  const options = { clientId: 'codex', skillName: COCOS_UI_SKILL_NAME };
  const legacy = path.join(root, '.codex', 'skills', COCOS_UI_SKILL_NAME, 'SKILL.md');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, buildCocosUiProjectSkillContent() + '\nMy local instructions.\n');
  assert.equal(getBuiltInProjectSkillState(root, options).status, 'modified');
  assert.throws(() => updateBuiltInProjectSkill(root, options), /local modifications/);
  const result = updateBuiltInProjectSkill(root, { ...options, allowModified: true });
  fs.appendFileSync(path.join(root, result.write.path), '\nNew local instructions.\n');
  assert.equal(getBuiltInProjectSkillState(root, options).legacyPath, '');
  assert.throws(() => updateBuiltInProjectSkill(root, options), /local modifications/);
});

test('backup histories are isolated by client and include legacy Codex backups', (t) => {
  const root = project(t);
  const options = { skillName: COCOS_UI_SKILL_NAME };
  createProjectSkillBackup(root, 'Old Codex backup', { ...options, clientId: 'codex', legacy: true });
  createProjectSkillBackup(root, 'Claude backup', { ...options, clientId: 'claude_code' });
  assert.equal(listProjectSkillBackups(root, COCOS_UI_SKILL_NAME, { clientId: 'codex' }).length, 1);
  const result = restoreLatestBuiltInProjectSkillBackup(root, { ...options, clientId: 'codex' });
  assert.equal(fs.readFileSync(path.join(root, result.write.path), 'utf8'), 'Old Codex backup');
  assert.throws(() => restoreLatestBuiltInProjectSkillBackup(root, { ...options, clientId: 'kimi' }), /No project skill backup/);
});

test('unsupported clients hide Skills notices and cannot silently install into Codex directories', (t) => {
  const root = project(t);
  const state = getProjectSkillsState(root, { clientId: 'vscode' });
  assert.equal(state.supported, false);
  assert.deepEqual(state.builtIns, []);
  assert.throws(() => updateBuiltInProjectSkill(root, { clientId: 'vscode' }), /not supported/);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('managed Skill installation cannot follow project-local symlinks into another project', (t) => {
  const root = project(t);
  const outside = project(t);
  fs.symlinkSync(outside, path.join(root, '.agents'), 'dir');
  assert.throws(() => updateBuiltInProjectSkill(root), /outside the Cocos project/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('an unsafe client directory is reported without breaking other clients’ Skills state', (t) => {
  const root = project(t);
  const outside = project(t);
  fs.symlinkSync(outside, path.join(root, '.agents'), 'dir');
  const codex = getProjectSkillsState(root, { clientId: 'codex' });
  assert.match(codex.error, /outside the Cocos project/);
  assert.deepEqual(codex.builtIns, []);
  const claude = getProjectSkillsState(root, { clientId: 'claude_code' });
  assert.equal(claude.error, undefined);
  assert.equal(claude.builtIns.length, 2);
  assert.ok(claude.builtIns.every((skill) => skill.status === 'missing'));
});

test('missing-only setup never replaces an existing old or modified Skill after preflight', (t) => {
  const root = project(t);
  const options = { clientId: 'qoder', skillName: COCOS_UI_SKILL_NAME, onlyIfMissing: true };
  const installed = updateBuiltInProjectSkill(root, options);
  assert.equal(installed.installed, true);
  const file = path.join(root, installed.write.path);
  for (const content of [fs.readFileSync(path.join(__dirname, 'fixtures/cocos-ui-skill-v1.md'), 'utf8'), 'Local author instructions']) {
    fs.writeFileSync(file, content);
    const result = updateBuiltInProjectSkill(root, options);
    assert.equal(result.skipped, true);
    assert.equal(fs.readFileSync(file, 'utf8'), content);
    assert.equal(listProjectSkillBackups(root, COCOS_UI_SKILL_NAME, options).length, 0);
  }
});

test('OpenCode exposes its own project-local Skills directory', () => {
  assert.equal(getSkillsDirectory({ clientId: 'opencode' }), '.opencode/skills');
});

test('OpenCode project paths are resolved in place without a Git root walk', () => {
  assert.equal(
    getSkillProjectPath('X:\\proj\\path', { clientId: 'opencode' }),
    path.resolve('X:\\proj\\path')
  );
});

test('the OpenCode client is registered as a Skills platform', () => {
  assert.ok(
    SKILL_PLATFORMS.some((platform) => platform.id === 'opencode'),
    'SKILL_PLATFORMS must register the opencode client'
  );
});

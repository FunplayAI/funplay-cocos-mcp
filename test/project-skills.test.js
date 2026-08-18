'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  COCOS_UI_SKILL_NAME,
  buildLegacyCocosMcpProjectSkillContent,
  createProjectSkill,
  readProjectInstruction,
  writeProjectInstruction,
} = require('../lib/project-instructions');
const {
  buildLineDiff,
  getBuiltInProjectSkillState,
  getCocosMcpProjectSkillState,
  getProjectSkillsState,
  getSkillRelativePath,
  previewBuiltInProjectSkillUpdate,
  previewCocosMcpProjectSkillUpdate,
  restoreLatestBuiltInProjectSkillBackup,
  restoreLatestCocosMcpProjectSkillBackup,
  updateBuiltInProjectSkill,
  updateCocosMcpProjectSkill,
} = require('../lib/project-skills');

function createProject(t) {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-project-skills-'));
  t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));
  return projectPath;
}

test('recommended project skill installs as a managed current template', (t) => {
  const projectPath = createProject(t);
  const before = getCocosMcpProjectSkillState(projectPath);
  assert.equal(before.status, 'missing');
  assert.equal(before.canInstall, true);

  const result = updateCocosMcpProjectSkill(projectPath, { extensionVersion: '0.4.8-test' });
  assert.equal(result.installed, true);
  assert.equal(result.backup, null);
  assert.equal(result.state.status, 'current');
  assert.equal(result.state.manifest.valid, true);

  const content = readProjectInstruction(projectPath, getSkillRelativePath()).content;
  assert.match(content, /^---\nname: funplay-cocos-mcp-workflow\n/);
  assert.match(content, /do not rebuild the entire prefab unless explicitly requested/);
});

test('both built-in Cocos skills have independent state, manifests, and updates', (t) => {
  const projectPath = createProject(t);
  const before = getProjectSkillsState(projectPath);
  assert.deepEqual(
    before.builtIns.map((skill) => [skill.skillId, skill.status]),
    [
      ['cocos-mcp-workflow', 'missing'],
      ['cocos-ui-composition', 'missing'],
    ]
  );

  const installed = updateBuiltInProjectSkill(projectPath, {
    skillName: COCOS_UI_SKILL_NAME,
    extensionVersion: '0.4.8-test',
  });
  assert.equal(installed.state.skillId, 'cocos-ui-composition');
  assert.equal(installed.state.status, 'current');
  assert.equal(installed.state.templateVersion, 1);
  assert.equal(getCocosMcpProjectSkillState(projectPath).status, 'missing');

  const preview = previewBuiltInProjectSkillUpdate(projectPath, {
    skillName: COCOS_UI_SKILL_NAME,
  });
  assert.equal(preview.addedLines, 0);
  assert.equal(preview.removedLines, 0);

  const targetPath = path.join(projectPath, getSkillRelativePath(COCOS_UI_SKILL_NAME));
  fs.appendFileSync(targetPath, '\nCustom UI rule.\n', 'utf8');
  assert.equal(
    getBuiltInProjectSkillState(projectPath, { skillName: COCOS_UI_SKILL_NAME }).status,
    'modified'
  );
  updateBuiltInProjectSkill(projectPath, {
    skillName: COCOS_UI_SKILL_NAME,
    allowModified: true,
  });
  const restored = restoreLatestBuiltInProjectSkillBackup(projectPath, {
    skillName: COCOS_UI_SKILL_NAME,
  });
  assert.match(fs.readFileSync(targetPath, 'utf8'), /Custom UI rule/);
  assert.equal(restored.state.skillName, COCOS_UI_SKILL_NAME);
});

test('legacy official skill is updateable without being treated as user-modified', (t) => {
  const projectPath = createProject(t);
  writeProjectInstruction(projectPath, {
    target: getSkillRelativePath(),
    content: buildLegacyCocosMcpProjectSkillContent(),
  });

  const state = getCocosMcpProjectSkillState(projectPath);
  assert.equal(state.status, 'update-available');
  assert.equal(state.modified, false);
  assert.equal(state.installedTemplateVersion, 1);

  const preview = previewCocosMcpProjectSkillUpdate(projectPath);
  assert.match(preview.diff, /\+ ---/);
  assert.match(preview.diff, /do not rebuild the entire prefab unless explicitly requested/);

  const result = updateCocosMcpProjectSkill(projectPath);
  assert.equal(result.updated, true);
  assert.equal(Boolean(result.backup), true);
  assert.equal(result.state.status, 'current');
  assert.equal(result.state.backupCount, 1);
});

test('modified recommended skill requires confirmation and is backed up before update', (t) => {
  const projectPath = createProject(t);
  updateCocosMcpProjectSkill(projectPath);
  const targetPath = path.join(projectPath, getSkillRelativePath());
  fs.appendFileSync(targetPath, '\nCustom project rule.\n', 'utf8');

  const modified = getCocosMcpProjectSkillState(projectPath);
  assert.equal(modified.status, 'modified');
  assert.equal(modified.modified, true);
  assert.throws(
    () => updateCocosMcpProjectSkill(projectPath),
    /local modifications/
  );

  const updated = updateCocosMcpProjectSkill(projectPath, { allowModified: true });
  assert.equal(updated.state.status, 'current');
  assert.equal(updated.state.backupCount, 1);
  assert.match(fs.readFileSync(path.join(projectPath, updated.backup.path), 'utf8'), /Custom project rule/);
});

test('latest skill backup can be restored without losing the current template', (t) => {
  const projectPath = createProject(t);
  updateCocosMcpProjectSkill(projectPath);
  const targetPath = path.join(projectPath, getSkillRelativePath());
  fs.appendFileSync(targetPath, '\nCustom restore rule.\n', 'utf8');
  updateCocosMcpProjectSkill(projectPath, { allowModified: true });

  const restored = restoreLatestCocosMcpProjectSkillBackup(projectPath);
  assert.equal(restored.restored, true);
  assert.match(fs.readFileSync(targetPath, 'utf8'), /Custom restore rule/);
  assert.equal(restored.state.status, 'modified');
  assert.equal(restored.state.backupCount, 2);
});

test('project skills state lists custom skills and marks both built-in skills', (t) => {
  const projectPath = createProject(t);
  updateCocosMcpProjectSkill(projectPath);
  updateBuiltInProjectSkill(projectPath, { skillName: COCOS_UI_SKILL_NAME });
  createProjectSkill(projectPath, {
    skillName: 'scene qa',
    title: 'Scene QA',
    description: 'Validate project scenes.',
    overwrite: false,
  });

  const state = getProjectSkillsState(projectPath);
  assert.equal(state.builtIns.length, 2);
  assert.equal(state.skills.length, 3);
  assert.equal(state.skills.find((skill) => skill.name === 'scene-qa').valid, true);
  assert.deepEqual(
    state.skills.filter((skill) => skill.builtIn).map((skill) => skill.name).sort(),
    ['funplay-cocos-mcp-workflow', 'funplay-cocos-ui-composition']
  );
});

test('line diff reports additions and removals', () => {
  const diff = buildLineDiff('one\ntwo\n', 'one\nthree\n');
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  assert.match(diff.text, /- two/);
  assert.match(diff.text, /\+ three/);
});

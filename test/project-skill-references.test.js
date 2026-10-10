'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SKILL_PLATFORMS } = require('../lib/skill-platforms');
const { COCOS_MCP_SKILL_NAME, COCOS_UI_SKILL_NAME, createCocosMcpProjectSkill } = require('../lib/project-instructions');
const {
  getBuiltInProjectSkillState, getSkillRelativePath, getManifestRelativePath,
  previewBuiltInProjectSkillUpdate, restoreLatestBuiltInProjectSkillBackup,
  updateBuiltInProjectSkill, sha256Text,
} = require('../lib/project-skills');
const { getProjectSkillReferences } = require('../lib/project-skill-references');

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-skill-references-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

for (const platform of SKILL_PLATFORMS) {
  test(`${platform.name}: both entrypoints export linked references with individual ownership hashes`, (t) => {
    const root = project(t);
    for (const skillName of [COCOS_MCP_SKILL_NAME, COCOS_UI_SKILL_NAME]) {
      const options = { clientId: platform.id, skillName };
      const result = updateBuiltInProjectSkill(root, options);
      const skillRoot = path.dirname(path.join(root, result.state.path));
      const entrypoint = fs.readFileSync(path.join(root, result.state.path), 'utf8');
      const links = [...entrypoint.matchAll(/\]\((references\/[^)]+)\)/g)].map((match) => match[1]);
      const templates = getProjectSkillReferences(skillName);
      assert.deepEqual(links.sort(), templates.map((file) => file.path).sort());
      const manifest = JSON.parse(fs.readFileSync(path.join(root, result.manifest), 'utf8'));
      assert.equal(manifest.schemaVersion, 2);
      for (const template of templates) {
        const bytes = fs.readFileSync(path.join(skillRoot, template.path), 'utf8');
        assert.equal(bytes, template.content);
        assert.equal(manifest.files[template.path].installedHash, sha256Text(bytes));
      }
      assert.equal(result.state.current, true);
      assert.equal(result.state.missingReferenceCount, 0);
    }
  });
}

test('a missing reference triggers preview/update even with an unchanged current entrypoint', (t) => {
  const root = project(t);
  const options = { skillName: COCOS_UI_SKILL_NAME };
  const installed = updateBuiltInProjectSkill(root, options);
  const entrypoint = fs.readFileSync(path.join(root, installed.state.path), 'utf8');
  const missing = installed.state.references[2];
  fs.unlinkSync(path.join(root, missing.path));
  const state = getBuiltInProjectSkillState(root, options);
  assert.equal(state.status, 'update-available');
  assert.equal(state.modified, false);
  assert.equal(state.missingReferenceCount, 1);
  const preview = previewBuiltInProjectSkillUpdate(root, options);
  assert.ok(preview.diff.includes(`+++ template-v3/${missing.relativePath}`));
  const repaired = updateBuiltInProjectSkill(root, options);
  assert.equal(repaired.state.current, true);
  assert.equal(fs.readFileSync(path.join(root, installed.state.path), 'utf8'), entrypoint);
});

test('an older owned reference triggers an update without classifying it as a user modification', (t) => {
  const root = project(t);
  const options = { skillName: COCOS_UI_SKILL_NAME };
  const installed = updateBuiltInProjectSkill(root, options);
  const reference = installed.state.references[0];
  const prior = '# Earlier managed reference\n';
  fs.writeFileSync(path.join(root, reference.path), prior);
  const manifestPath = path.join(root, installed.manifest);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.files[reference.relativePath].installedHash = sha256Text(prior);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const state = getBuiltInProjectSkillState(root, options);
  assert.equal(state.status, 'update-available');
  assert.equal(state.modified, false);
  assert.equal(updateBuiltInProjectSkill(root, options).state.current, true);
});

test('modified owned references require confirmation and their exact notes can be restored', (t) => {
  const root = project(t);
  const options = { skillName: COCOS_UI_SKILL_NAME };
  const installed = updateBuiltInProjectSkill(root, options);
  const reference = installed.state.references[0];
  const custom = `${fs.readFileSync(path.join(root, reference.path), 'utf8')}\nOur game uses a custom adaptation policy.\n`;
  fs.writeFileSync(path.join(root, reference.path), custom);
  const state = getBuiltInProjectSkillState(root, options);
  assert.equal(state.modified, true);
  assert.equal(state.modifiedReferenceCount, 1);
  assert.throws(() => updateBuiltInProjectSkill(root, options), /local modifications/);
  assert.equal(fs.readFileSync(path.join(root, reference.path), 'utf8'), custom);
  const updated = updateBuiltInProjectSkill(root, { ...options, allowModified: true });
  const backup = JSON.parse(fs.readFileSync(path.join(root, `${updated.backup.path}.files.json`), 'utf8'));
  assert.equal(backup.files[reference.relativePath], custom);
  restoreLatestBuiltInProjectSkillBackup(root, options);
  assert.equal(fs.readFileSync(path.join(root, reference.path), 'utf8'), custom);
  assert.equal(getBuiltInProjectSkillState(root, options).modifiedReferenceCount, 1);
});

test('unowned reference collisions fail before writing either SKILL.md or a manifest', (t) => {
  const root = project(t);
  const options = { skillName: COCOS_UI_SKILL_NAME };
  const skillPath = getSkillRelativePath(COCOS_UI_SKILL_NAME);
  const conflictPath = path.join(root, path.dirname(skillPath), 'references', 'text-and-localization.md');
  fs.mkdirSync(path.dirname(conflictPath), { recursive: true });
  fs.writeFileSync(conflictPath, '# User-owned font notes\n');
  const extras = path.join(path.dirname(conflictPath), 'custom.md');
  fs.writeFileSync(extras, '# Do not touch\n');
  assert.throws(() => updateBuiltInProjectSkill(root, { ...options, allowModified: true }), /user-owned/);
  assert.equal(fs.existsSync(path.join(root, skillPath)), false);
  assert.equal(fs.existsSync(path.join(root, getManifestRelativePath(COCOS_UI_SKILL_NAME))), false);
  assert.equal(fs.readFileSync(conflictPath, 'utf8'), '# User-owned font notes\n');
  assert.equal(fs.readFileSync(extras, 'utf8'), '# Do not touch\n');
});

test('an in-project symlink reference is not adopted or overwritten', (t) => {
  const root = project(t);
  const target = path.join(root, 'notes.md');
  fs.writeFileSync(target, 'User notes');
  const skillRoot = path.dirname(path.join(root, getSkillRelativePath()));
  fs.mkdirSync(path.join(skillRoot, 'references'), { recursive: true });
  fs.symlinkSync(target, path.join(skillRoot, 'references/project-readiness.md'));
  assert.throws(() => updateBuiltInProjectSkill(root), /symbolic link/);
  assert.equal(fs.existsSync(path.join(skillRoot, 'SKILL.md')), false);
  assert.equal(fs.readFileSync(target, 'utf8'), 'User notes');
});

test('v2 UI content upgrades without a manifest and bundle restore preserves unrelated files', (t) => {
  const root = project(t);
  const options = { skillName: COCOS_UI_SKILL_NAME };
  const v2 = fs.readFileSync(path.join(__dirname, 'fixtures/cocos-ui-skill-v1.md'), 'utf8').replace(
    'https://docs.cocos.com/creator/3.8/manual/en/ui-system/)',
    'https://docs.cocos.com/creator/3.8/manual/en/2d-object/ui-system/)'
  );
  const skillPath = path.join(root, getSkillRelativePath(COCOS_UI_SKILL_NAME));
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath, v2);
  assert.equal(getBuiltInProjectSkillState(root, options).installedTemplateVersion, 2);
  const installed = updateBuiltInProjectSkill(root, options);
  const extra = path.join(path.dirname(skillPath), 'references/custom.md');
  fs.writeFileSync(extra, 'Keep user extras');
  restoreLatestBuiltInProjectSkillBackup(root, options);
  assert.equal(fs.readFileSync(skillPath, 'utf8'), v2);
  assert.equal(fs.readFileSync(extra, 'utf8'), 'Keep user extras');
  assert.ok(installed.state.references.every((file) => !fs.existsSync(path.join(root, file.path))));
  assert.equal(getBuiltInProjectSkillState(root, options).status, 'update-available');
});

test('reference backup paths cannot escape their predefined bundle', (t) => {
  const root = project(t);
  const installed = updateBuiltInProjectSkill(root);
  fs.appendFileSync(path.join(root, installed.state.path), '\nCustom rule\n');
  const updated = updateBuiltInProjectSkill(root, { allowModified: true });
  const sidecar = path.join(root, `${updated.backup.path}.files.json`);
  const data = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
  data.files['../../notes.md'] = 'Bad';
  fs.writeFileSync(sidecar, JSON.stringify(data));
  const before = fs.readFileSync(path.join(root, installed.state.path), 'utf8');
  assert.throws(() => restoreLatestBuiltInProjectSkillBackup(root), /unsupported path/);
  assert.equal(fs.readFileSync(path.join(root, installed.state.path), 'utf8'), before);
});

test('the direct workflow creator exports references in a custom skill folder too', (t) => {
  const root = project(t);
  const created = createCocosMcpProjectSkill(root, { skillName: 'custom-cocos-workflow', clientId: 'opencode' });
  assert.equal(created.references.length, 1);
  const reference = path.join(root, '.opencode/skills/custom-cocos-workflow/references/project-readiness.md');
  assert.equal(fs.existsSync(reference), true);
  assert.throws(() => createCocosMcpProjectSkill(root, { skillName: 'custom-cocos-workflow', clientId: 'opencode', overwrite: false }), /already exists/);
});

test('direct built-in creators retain explicit title, description and instruction overrides', (t) => {
  const root = project(t);
  createCocosMcpProjectSkill(root);
  const created = createCocosMcpProjectSkill(root, {
    title: 'Scoped workflow', description: 'Use for this project only.', instructions: 'Preserve the user-authored rule.',
  });
  const content = fs.readFileSync(path.join(root, created.path), 'utf8');
  assert.match(content, /# Scoped workflow/);
  assert.match(content, /description: "Use for this project only\."/);
  assert.match(content, /Preserve the user-authored rule\./);
  assert.ok(created.backup);
  assert.equal(created.references.length, 1);
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const extension = require('../browser');
const manifest = require('../package.json');

test('Project Skills panel and browser messages are registered', () => {
  assert.equal(manifest.panels['project-skills'].main, 'panel/project-skills.js');
  assert.equal(
    manifest.contributions.menu.some((entry) => entry.message === 'open-project-skills'),
    true
  );
  assert.deepEqual(
    manifest.contributions.messages['install-or-update-project-skill'].methods,
    ['installOrUpdateProjectSkill']
  );
  assert.equal(typeof extension.methods.openProjectSkillsPanel, 'function');
  assert.equal(typeof extension.methods.previewProjectSkillUpdate, 'function');
  assert.equal(typeof extension.methods.restoreProjectSkillBackup, 'function');
  assert.equal(typeof extension.methods.createProjectSkillFromPanel, 'function');
});

test('shared panel implementation includes project skill management actions', () => {
  const source = fs.readFileSync(require.resolve('../panel/shared'), 'utf8');
  assert.match(source, /createPanel\('project-skills'\)|mode === 'project-skills'/);
  assert.match(source, /preview-project-skill-update/);
  assert.match(source, /restore-project-skill-backup/);
  assert.match(source, /create-project-skill/);
  assert.match(source, /builtInSkillList/);
  assert.match(source, /dataset\.skillAction/);
});

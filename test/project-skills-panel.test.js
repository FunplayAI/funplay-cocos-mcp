'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const extension = require('../browser');
const manifest = require('../package.json');
const { createPanel } = require('../panel/shared');

function panelMethods() {
  const previous = global.Editor;
  global.Editor = { Panel: { define: (definition) => definition } };
  try { return createPanel('dashboard').methods; } finally { global.Editor = previous; }
}

function fakeElement() {
  const classes = new Set();
  return { textContent: '', value: '', disabled: false,
    classList: { add: (...values) => values.forEach((value) => classes.add(value)), remove: (...values) => values.forEach((value) => classes.delete(value)), contains: (value) => classes.has(value) },
    setAttribute() {}, removeAttribute() {},
  };
}

test('Skills notice follows the selected client and hides for current or unsupported clients', () => {
  const notice = fakeElement();
  const text = fakeElement();
  const select = { value: 'codex' };
  const panel = { ...panelMethods(), language: 'zh', $: { projectSkillsNotice: notice, projectSkillsNoticeText: text, clientTargetSelect: select },
    state: { config: { lastClientTargetId: 'codex' }, projectSkillsByClient: {
      codex: { clientId: 'codex', clientName: 'Codex', supported: true, builtIns: [{ skillName: 'workflow', title: 'Workflow', status: 'missing' }] },
      claude_code: { clientId: 'claude_code', clientName: 'Claude Code', supported: true, builtIns: [{ skillName: 'workflow', status: 'current' }] },
      codebuddy: { clientId: 'codebuddy', clientName: 'CodeBuddy', supported: true, builtIns: [{ skillName: 'workflow', title: 'Workflow', status: 'missing' }] },
    } },
  };
  panel.renderProjectSkillsNotice();
  assert.equal(notice.classList.contains('visible'), true);
  assert.match(text.textContent, /Codex/);
  assert.match(text.textContent, /Workflow/);
  select.value = 'claude_code';
  panel.renderProjectSkillsNotice();
  assert.equal(notice.classList.contains('visible'), false);
  assert.equal(panel.getBuiltInProjectSkill('workflow').status, 'current');
  select.value = 'codebuddy';
  panel.renderProjectSkillsNotice();
  assert.equal(notice.classList.contains('visible'), true);
  assert.match(text.textContent, /CodeBuddy/);
  panel.state.projectSkillsByClient.codebuddy.builtIns[0].status = 'current';
  panel.renderProjectSkillsNotice();
  assert.equal(notice.classList.contains('visible'), false);
  select.value = 'vscode';
  panel.renderProjectSkillsNotice();
  assert.equal(notice.classList.contains('visible'), false);
  assert.equal(text.textContent, '');
});

test('client configuration button is disabled during temporary port fallback', () => {
  const button = fakeElement();
  const status = fakeElement();
  const details = fakeElement();
  const panel = { ...panelMethods(), language: 'zh', $: { configureClientBtn: button, clientTargetStatus: status, clientTargetDetails: details, clientTargetSelect: { ...fakeElement(), value: 'codex' } },
    state: { clientTargets: [{ id: 'codex', serverName: 'cocos-project-hash', configPath: '/test/config.toml' }], clientConfig: { configurationBlocked: true } },
  };
  panel.renderClientTargetStatus();
  assert.equal(button.disabled, true);
  assert.match(status.textContent, /临时回退端口/);
  panel.state.clientConfig.configurationBlocked = false;
  panel.renderClientTargetStatus();
  assert.equal(button.disabled, false);
  assert.match(details.textContent, /cocos-project-hash/);
});

test('connection migration shares the Skills notice and remains visible until both concerns are resolved', () => {
  const panel = { ...panelMethods(), language: 'zh',
    $: { projectSkillsNotice: fakeElement(), projectSkillsNoticeText: fakeElement(), openProjectSkillsNoticeBtn: fakeElement(),
      clientTargetSelect: { value: 'codex' } },
    state: { clientTargets: [{ id: 'codex', name: 'Codex', needsReconfigure: true, canReconfigure: true }],
      projectSkillsByClient: { codex: { clientId: 'codex', supported: true, builtIns: [{ skillName: 'workflow', status: 'update-available' }] } } } };
  panel.renderProjectSkillsNotice();
  assert.match(panel.$.projectSkillsNoticeText.textContent, /旧地址/);
  assert.match(panel.$.projectSkillsNoticeText.textContent, /workflow/);
  assert.match(panel.$.openProjectSkillsNoticeBtn.textContent, /重新配置 MCP \+ Skills/);
  panel.state.clientTargets[0].needsReconfigure = false;
  panel.renderProjectSkillsNotice();
  assert.equal(panel.$.projectSkillsNotice.classList.contains('visible'), true);
  assert.doesNotMatch(panel.$.projectSkillsNoticeText.textContent, /旧地址/);
  panel.state.projectSkillsByClient.codex.builtIns[0].status = 'current';
  panel.renderProjectSkillsNotice();
  assert.equal(panel.$.projectSkillsNotice.classList.contains('visible'), false);
});

test('Skills read errors remain visible instead of looking like a current installation', () => {
  const notice = fakeElement();
  const text = fakeElement();
  const panel = { ...panelMethods(), language: 'zh', $: { projectSkillsNotice: notice, projectSkillsNoticeText: text, clientTargetSelect: { value: 'codex' } },
    state: { projectSkillsByClient: { codex: { clientId: 'codex', clientName: 'Codex', supported: true, error: 'Unsafe directory', builtIns: [], skills: [] } } },
  };
  panel.renderProjectSkillsNotice();
  assert.equal(notice.classList.contains('visible'), true);
  assert.match(text.textContent, /无法读取/);
  assert.match(text.textContent, /Unsafe directory/);
  panel.$.builtInSkillList = fakeElement();
  panel.$.skillClientStatus = fakeElement();
  panel.$.createProjectSkillBtn = fakeElement();
  panel.renderProjectSkills();
  assert.equal(panel.$.createProjectSkillBtn.disabled, true);
  assert.match(panel.$.skillClientStatus.textContent, /Unsafe directory/);
});

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

test('MCP Server dashboard reports missing and updateable built-in skills', () => {
  const source = fs.readFileSync(require.resolve('../panel/shared'), 'utf8');
  assert.match(source, /projectSkillsNoticeText/);
  assert.match(source, /skills_manager\.notice_missing_list/);
  assert.match(source, /skills_manager\.notice_update_list/);
  assert.match(source, /openProjectSkillsNoticeBtn/);
});

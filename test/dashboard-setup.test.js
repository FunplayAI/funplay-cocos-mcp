'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createPanel } = require('../panel/shared');

function element(value = '') {
  const classes = new Set();
  return { value, textContent: '', disabled: false, hidden: false,
    classList: { add: (...items) => items.forEach((item) => classes.add(item)), remove: (...items) => items.forEach((item) => classes.delete(item)), contains: (item) => classes.has(item) },
    setAttribute() {}, removeAttribute() {},
  };
}

function fixture(t, handler, skills = { supported: true, builtIns: [] }) {
  const previous = global.Editor;
  const calls = [];
  global.Editor = { Panel: { define: (value) => value }, Message: { request: async (pkg, name, ...args) => {
    calls.push({ name, args });
    return handler ? await handler(name, ...args) : {};
  } } };
  t.after(() => { global.Editor = previous; });
  const definition = createPanel('dashboard');
  const panel = { ...definition.methods, language: 'zh', state: {
    clientTargets: [{ id: 'qoder', name: 'Qoder', configPath: '/fixture/settings.json', serverName: 'cocos-demo-123456' }],
    clientConfig: { url: 'http://127.0.0.1:23456/' }, projectSkillsByClient: { qoder: skills },
  }, $: { clientTargetSelect: element('qoder'), configureClientBtn: element(), configureWithSkillsBtn: element(),
    configureSkillsHint: element(), clientTargetStatus: element(), clientTargetDetails: element(), clientActionStatus: element() },
    async refresh() {},
  };
  return { panel, calls, definition };
}

test('dashboard groups setup actions and moves update/global controls to Settings', (t) => {
  const { definition } = fixture(t);
  assert.match(definition.template, /configureWithSkillsBtn/);
  assert.ok(definition.template.indexOf('clientTargetSelect') < definition.template.indexOf('projectSkillsNotice'));
  for (const id of ['installUpdateBtn', 'checkUpdatesBtn', 'openReleaseBtn', 'installGlobalBtn']) {
    assert.doesNotMatch(definition.template, new RegExp(`id="${id}"`));
    assert.match(createPanel('settings').template, new RegExp(`id="${id}"`));
  }
  assert.match(definition.style, /@container mcp-dashboard \(max-width: 340px\)/);
});

test('Configure + Skills installs only missing copies and reports existing versions needing review', async (t) => {
  const skills = { supported: true, builtIns: [
    { skillName: 'missing', status: 'missing' }, { skillName: 'edited', status: 'modified' }, { skillName: 'old', status: 'update-available' }, { skillName: 'current', status: 'current' },
  ] };
  const { panel, calls } = fixture(t, (name) => name === 'get-project-skills-state' ? skills : name === 'install-or-update-project-skill' ? { installed: true } : {}, skills);
  await panel.configureClientSetup(true);
  assert.deepEqual(calls.map((call) => call.name), ['get-project-skills-state', 'configure-client', 'install-or-update-project-skill']);
  assert.deepEqual(calls[2].args[0], { skillName: 'missing', clientId: 'qoder', onlyIfMissing: true });
  assert.match(panel.$.clientActionStatus.textContent, /已有 Skill 保持不变/);
  assert.equal(panel.$.configureWithSkillsBtn.disabled, false);
});

test('unsupported or unreadable Skills stop combined setup before configuration writes', async (t) => {
  const { panel, calls } = fixture(t, () => ({ supported: false }));
  await panel.configureClientSetup(true);
  assert.deepEqual(calls.map((call) => call.name), ['get-project-skills-state']);
  assert.match(panel.$.clientActionStatus.textContent, /配置失败/);
});

test('a failed config never installs Skills, and later failures report partial completion', async (t) => {
  const skills = { supported: true, builtIns: [{ skillName: 'missing', status: 'missing' }] };
  let failConfig = true;
  const { panel, calls } = fixture(t, (name) => {
    if (name === 'get-project-skills-state') return skills;
    if (name === 'configure-client' && !failConfig) return {};
    throw new Error('Test failure');
  });
  await panel.configureClientSetup(true);
  assert.equal(calls.some((call) => call.name === 'install-or-update-project-skill'), false);
  assert.match(panel.$.clientActionStatus.textContent, /配置失败/);
  failConfig = false;
  await panel.configureClientSetup(true);
  assert.match(panel.$.clientActionStatus.textContent, /客户端配置已保存，但 Skills 安装未完成/);
  assert.equal(panel.configuringClient, false);
});

test('temporary port fallback blocks both setup flows without a write', async (t) => {
  const { panel, calls } = fixture(t);
  panel.state.clientConfig.configurationBlocked = true;
  panel.renderClientTargetStatus();
  assert.equal(panel.$.configureClientBtn.disabled, true);
  assert.equal(panel.$.configureWithSkillsBtn.disabled, true);
  await panel.configureClientSetup(true);
  assert.equal(calls.length, 0);
});

test('double clicks cannot configure or install twice', async (t) => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const { panel, calls } = fixture(t, () => pending);
  const first = panel.configureClientSetup(false);
  await panel.configureClientSetup(false);
  assert.equal(calls.length, 1);
  assert.equal(panel.$.clientTargetSelect.disabled, true);
  resolve({});
  await first;
  assert.equal(panel.$.clientTargetSelect.disabled, false);
});

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createPanel } = require('../panel/shared');
const manifest = require('../package.json');

function descendants(root) {
  return [root, ...(root.children || []).flatMap(descendants)];
}

function textOf(root) {
  return descendants(root).map((item) => item.textContent).filter(Boolean).join('\n');
}

function element(tag = 'div') {
  const attributes = {};
  return { tagName: tag.toUpperCase(), hidden: true, textContent: '', className: '', dataset: {}, children: [],
    set innerHTML(value) { this.children = []; },
    setAttribute(key, value) { attributes[key] = value; },
    getAttribute(key) { return attributes[key]; },
    removeAttribute(key) { delete attributes[key]; },
    appendChild(child) { this.children.push(child); },
    querySelectorAll() { return descendants(this).filter((child) => child.tagName === 'DETAILS' && child.dataset.activityKey); },
    classList: { add() {}, remove() {} },
  };
}

function fixture(t, mode = 'dashboard') {
  const previous = global.Editor;
  global.Editor = { Panel: { define: (value) => value } };
  t.after(() => { global.Editor = previous; });
  const definition = createPanel(mode);
  const panel = { ...definition.methods, language: 'zh', $: { panelNotice: element(), panelNoticeText: element() }, async refresh() {} };
  t.after(() => panel.dismissNotice());
  return { definition, panel };
}

test('only the dashboard retains Recent Activity; Output and the standalone log window stay removed', (t) => {
  fixture(t);
  assert.deepEqual(Object.keys(manifest.panels).sort(), ['default', 'project-skills', 'settings', 'tool-exposure']);
  assert.equal(manifest.contributions.messages['open-activity'], undefined);
  assert.equal(manifest.contributions.menu.some((entry) => entry.message === 'open-activity'), false);
  for (const mode of ['dashboard', 'tool-exposure', 'settings', 'project-skills']) {
    const { template, style } = createPanel(mode);
    assert.doesNotMatch(template, /id="(?:output|recentLogs|openActivityBtn)"|common\.output/);
    if (mode === 'dashboard') {
      assert.match(template, /id="recentCalls"/);
      assert.match(template, /id="clearActivityBtn"/);
      assert.match(template, /dashboard\.recent_activity/);
    } else {
      assert.doesNotMatch(template, /id="(?:recentCalls|clearActivityBtn)"/);
    }
    assert.match(template, /id="panelNotice"[^>]*hidden/);
    assert.match(style, /@container mcp-panel/);
    assert.match(style, /\.result-array > li, \.execution-logs > li \{ list-style: decimal outside;/);
    if (mode !== 'dashboard') assert.match(template, /id="openDashboardBtn"/);
  }
});

test('Recent Activity renders result cards safely without runtime logs', (t) => {
  const { panel } = fixture(t);
  const previousDocument = global.document;
  global.document = { createElement: element, createDocumentFragment: element };
  t.after(() => { global.document = previousDocument; });
  panel.$.recentCalls = element();
  panel.state = { recentInteractions: [{ toolName: 'get_editor_state', status: 'success', timestamp: '2026-09-07T04:00:00Z',
    summary: 'Structured result returned.', preview: { sceneName: '<script>not HTML</script>', running: true },
  }], recentRuntimeLogs: [{ message: 'Not a dashboard activity' }] };
  panel.renderActivity();
  const card = panel.$.recentCalls.children[0].children[0];
  assert.equal(card.className, 'mini-item success');
  assert.deepEqual(card.children[0].children.slice(1).map((child) => child.textContent), ['get_editor_state', 'OK']);
  const fields = descendants(card).find((child) => child.className === 'result-fields');
  assert.deepEqual(fields.children.flatMap((child) => child.children.map((item) => item.textContent)), ['场景', '<script>not HTML</script>', '运行中', '是']);
  assert.equal(card.children.find((child) => child.className === 'result-details').open, false);
  assert.doesNotMatch(textOf(card), /Not a dashboard activity/);
  panel.state.recentInteractions = [];
  panel.renderActivity();
  assert.equal(panel.$.recentCalls.textContent, '暂无 MCP 调用。');
  assert.equal(panel.$.recentCalls.children.length, 0);
});

test('Recent Activity preserves nested objects and array items without sorting or selecting six fields', (t) => {
  const { panel } = fixture(t);
  const previousDocument = global.document;
  global.document = { createElement: element, createDocumentFragment: element };
  t.after(() => { global.document = previousDocument; });
  panel.$.recentCalls = element();
  const preview = { message: 'Updated two nodes', nodes: [{ name: 'A', active: false }, { name: 'B', active: false }],
    status: { running: true, port: 21578 }, empty: [], nothing: null, zero: 0, emptyString: '', lastField: 'Still visible' };
  panel.state = { recentInteractions: [{ toolName: 'some_tool', timestamp: 't', status: 'success', preview }] };
  panel.renderActivity();
  const result = descendants(panel.$.recentCalls).find((child) => child.className === 'activity-result');
  const tree = result.children.at(-1);
  assert.deepEqual(tree.children.map((child) => child.children[0].textContent), ['消息', 'nodes', 'status', 'empty', 'nothing', 'zero', 'emptyString', 'lastField']);
  const items = descendants(tree).find((child) => child.className === 'result-array');
  assert.equal(items.tagName, 'OL');
  assert.equal(items.children.length, 2);
  assert.match(textOf(items.children[0]), /A\nactive\n否/);
  assert.match(textOf(items.children[1]), /B\nactive\n否/);
  assert.match(textOf(tree), /Still visible/);
  assert.match(textOf(tree), /nothing\nnull\nzero\n0\nemptyString\n""/);
  assert.equal(descendants(tree).filter((child) => child.className === 'result-branch').length, 2);
});

test('script cards separate execution logs from return values and retain logs on failure', (t) => {
  const { panel } = fixture(t);
  const previousDocument = global.document;
  global.document = { createElement: element, createDocumentFragment: element };
  t.after(() => { global.document = previousDocument; });
  panel.$.recentCalls = element();
  const execution = { context: 'scene', durationMs: 4, logsOmitted: 2,
    logs: [{ level: 'info', message: 'First line\nSecond line' }, { level: 'warn', message: '<b>literal text</b>' }] };
  panel.state = { recentInteractions: [{ toolName: 'execute_javascript', timestamp: 't', status: 'success',
    summary: 'sceneName: Main', execution, preview: { ok: true, result: { message: 'Completed', values: [1, 2] }, sceneName: 'Main' } }] };
  panel.renderActivity();
  let result = descendants(panel.$.recentCalls).find((child) => child.className === 'activity-result');
  assert.equal(result.children[0].textContent, 'Completed');
  assert.match(textOf(result), /执行日志\nINFO\nFirst line\nSecond line\nWARN\n<b>literal text<\/b>/);
  assert.match(textOf(result), /另有 2 条日志未展示/);
  assert.match(textOf(result), /返回值/);
  assert.doesNotMatch(textOf(result), /sceneName|运行中|端口/);
  panel.state.recentInteractions[0] = { toolName: 'execute_javascript', timestamp: 't2', status: 'error', summary: 'Expected failure', execution };
  panel.renderActivity();
  result = descendants(panel.$.recentCalls).find((child) => child.className === 'activity-result');
  assert.equal(result.children[0].textContent, 'Expected failure');
  assert.match(result.children[0].className, /result-error/);
  assert.match(textOf(result), /First line/);
  assert.doesNotMatch(textOf(result), /返回值/);
});

test('refresh preserves expanded result branches, JSON disclosure and scroll position', (t) => {
  const { panel } = fixture(t);
  const previousDocument = global.document;
  global.document = { createElement: element, createDocumentFragment: element };
  t.after(() => { global.document = previousDocument; });
  panel.$.recentCalls = element();
  panel.$.recentCalls.scrollTop = 120;
  panel.state = { recentInteractions: [{ toolName: 'tool', timestamp: 't', status: 'success', preview: { group: { nested: { deeper: { value: 1 } } } } }] };
  panel.renderActivity();
  let details = descendants(panel.$.recentCalls).filter((child) => child.tagName === 'DETAILS');
  assert.deepEqual(details.map((child) => child.open), [true, true, false, false]);
  details[0].open = false;
  details[2].open = true;
  details[3].open = true;
  panel.renderActivity();
  details = descendants(panel.$.recentCalls).filter((child) => child.tagName === 'DETAILS');
  assert.deepEqual(details.map((child) => child.open), [false, true, true, true]);
  assert.equal(panel.$.recentCalls.scrollTop, 120);
});

test('clearing Recent Activity uses a dedicated action, not clear_logs', async (t) => {
  const { panel } = fixture(t);
  const calls = [];
  global.Editor.Message = { request: async (pkg, message) => { calls.push(message); return {}; } };
  await panel.clearActivity();
  assert.deepEqual(calls, ['clear-recent-activity']);
  assert.deepEqual(manifest.contributions.messages['clear-recent-activity'].methods, ['clearRecentActivity']);
});

test('success notices dismiss automatically and never dump raw results', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { panel } = fixture(t);
  panel.showNotice({ secret: 'do-not-display', content: 'raw result' });
  assert.equal(panel.$.panelNotice.hidden, false);
  assert.equal(panel.$.panelNoticeText.textContent, '操作已完成。');
  assert.equal(panel.$.panelNotice.getAttribute('role'), 'status');
  t.mock.timers.tick(4500);
  assert.equal(panel.$.panelNotice.hidden, true);
});

test('errors cancel pending success dismissal and remain until dismissed', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { definition, panel } = fixture(t);
  panel.showNotice('已保存');
  panel.showNotice('保存失败，请重试', 'error');
  t.mock.timers.tick(10000);
  assert.equal(panel.$.panelNotice.hidden, false);
  assert.equal(panel.$.panelNotice.getAttribute('role'), 'alert');
  assert.equal(panel.$.panelNoticeText.textContent, '保存失败，请重试');
  definition.close.call(panel);
  assert.equal(panel.$.panelNotice.hidden, true);
  assert.equal(panel.noticeTimer, null);
});

test('action failures remain visible, while successful navigation is quiet', async (t) => {
  const { panel } = fixture(t);
  await panel.runAction(async () => ({ opened: true }), { notify: false });
  assert.equal(panel.$.panelNotice.hidden, true);
  await panel.runAction(async () => { throw new Error('Permission denied'); });
  assert.match(panel.$.panelNoticeText.textContent, /Permission denied/);
  assert.equal(panel.$.panelNotice.className, 'panel-notice error');
  await panel.runAction(async () => ({ ok: false, error: { message: 'Invalid configuration' } }));
  assert.match(panel.$.panelNoticeText.textContent, /Invalid configuration/);
});

test('removing Output does not swallow failed configuration saves', async (t) => {
  const { panel } = fixture(t);
  global.Editor.Message = { request: async () => { throw new Error('Read-only configuration'); } };
  panel.collectConfig = () => ({});
  await assert.rejects(panel.persistConfig(), /Read-only configuration/);
  assert.match(panel.$.panelNoticeText.textContent, /保存配置失败/);
  assert.equal(panel.$.panelNotice.hidden, false);
  assert.equal(panel.$.panelNotice.getAttribute('role'), 'alert');
});

test('Skill cards show only available actions and keep file/backup details collapsed', (t) => {
  const { panel } = fixture(t, 'project-skills');
  const previousDocument = global.document;
  global.document = { createElement: element, createDocumentFragment: element };
  t.after(() => { global.document = previousDocument; });
  panel.$.builtInSkillList = element();
  panel.selectedSkillClientId = () => 'codex';
  for (const [status, backupCount, expected] of [
    ['current', 0, ['reveal']], ['missing', 0, ['install', 'preview']],
    ['modified', 1, ['install', 'preview', 'restore', 'reveal']],
  ]) {
    panel.$.builtInSkillList.children = [];
    panel.selectedProjectSkills = () => ({ supported: true, builtIns: [
      { skillName: 'workflow', status, installed: status !== 'missing', backupCount },
    ] });
    panel.renderProjectSkills();
    const card = panel.$.builtInSkillList.children[0].children[0];
    const toolbar = card.children.find((child) => child.className === 'toolbar');
    assert.deepEqual(toolbar.children.map((child) => child.dataset.skillAction), expected);
    const fileDetails = card.children.find((child) => child.className === 'skill-file-details');
    assert.ok(fileDetails);
    assert.notEqual(fileDetails.open, true);
    assert.equal(card.children.some((child) => child.className === 'skill-diff-details'), false);
  }
});

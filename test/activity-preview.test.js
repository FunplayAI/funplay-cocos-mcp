'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createActivityPreview, PREVIEW_LIMITS } = require('../lib/activity-preview');
const { InteractionLog } = require('../lib/interaction-log');

test('activity previews redact credentials and omit file/script/image bodies', () => {
  const preview = createActivityPreview({ sceneName: 'Main', running: false, api_key: 'private-key', content: 'file-body',
    details: { password: 'private-password', code: 'script-body', auth: 'Bearer private-bearer', image: 'data:image/png;base64,private-image' },
  });
  assert.doesNotMatch(JSON.stringify(preview), /private-|file-body|script-body/);
  assert.equal(preview.sceneName, 'Main');
  assert.equal(preview.running, false);
  assert.equal(preview.content, '[omitted]');
  assert.equal(createActivityPreview('A script return value'), 'A script return value');
  assert.doesNotMatch(createActivityPreview('token=private-token, password="private-password"'), /private-/);
});

test('activity snapshots are bounded, detached, and never execute getters', () => {
  let getters = 0;
  const value = { label: 'a'.repeat(10000), children: Array.from({ length: 30 }, (_, i) => ({ name: `Node ${i}` })),
    get secretGetter() { getters++; throw new Error('Do not call'); },
    get badGetter() { getters++; throw new Error('Do not call'); },
  };
  value.self = value;
  const preview = createActivityPreview(value);
  assert.equal(getters, 0);
  assert.ok(preview.label.length <= PREVIEW_LIMITS.string + 1);
  assert.equal(preview.children.length, PREVIEW_LIMITS.items + 1);
  assert.equal(preview.children.at(-1).$remaining, 30 - PREVIEW_LIMITS.items);
  assert.doesNotThrow(() => JSON.stringify(preview));
  value.children[0].name = 'Changed';
  assert.equal(preview.children[0].name, 'Node 0');
  const wide = createActivityPreview(Object.fromEntries(Array.from({ length: 100 }, (_, i) => [i, i])));
  assert.equal(Object.keys(wide).length, PREVIEW_LIMITS.keys + 1);
  assert.equal(wide.$remaining, 100 - PREVIEW_LIMITS.keys);
});

test('activity results retain ordering, nested arrays, repeated fields and falsy values', () => {
  const result = { message: 'Updated two nodes', nodes: [{ name: 'A', active: false }, { name: 'B', active: false }],
    status: { running: true }, counts: [0, 2], empty: [], nothing: null, textReturn: '', count: 2 };
  const preview = createActivityPreview(result);
  assert.deepEqual(JSON.parse(JSON.stringify(preview)), result);
  assert.deepEqual(Object.keys(preview), Object.keys(result));
  for (const value of [null, false, 0, '']) assert.equal(createActivityPreview(value), value);
  assert.equal(createActivityPreview(undefined), undefined);
  const shared = { count: 1 };
  assert.equal(createActivityPreview({ a: shared, b: shared }).b.count, 1);
});

test('large nested results are bounded with explicit truncation markers', () => {
  const preview = createActivityPreview({ rows: Array.from({ length: 12 }, () => ({
    values: Array.from({ length: 12 }, () => 'x'.repeat(10000)),
  })) });
  assert.ok(JSON.stringify(preview).length < PREVIEW_LIMITS.characters + 2000);
  assert.match(JSON.stringify(preview), /\$remaining|truncated/);
  let deep = { value: 1 };
  for (let i = 0; i < 20; i++) deep = { next: deep };
  assert.match(JSON.stringify(createActivityPreview(deep)), /truncated/);
});

test('activity summaries are redacted and execution logs remain detached', () => {
  const log = new InteractionLog();
  const execution = { context: 'editor', durationMs: 3, logsOmitted: 0,
    logs: Array.from({ length: 20 }, (_, i) => ({ level: 'info', message: `Log ${i}` })) };
  log.add('execute_javascript', 'error', 'Failed: password=private-password', undefined, execution);
  execution.logs[0].message = 'changed';
  const entry = log.list()[0];
  assert.doesNotMatch(entry.summary, /private-password/);
  assert.equal(entry.execution.logs.length, 20);
  assert.equal(entry.execution.logs[0].message, 'Log 0');
  assert.equal(entry.preview, undefined);
});

test('interaction logs keep legacy summaries, bounded entries and clear behavior', () => {
  const log = new InteractionLog(2);
  log.add('first', 'success', 'old');
  log.add('second', 'success', 'summary', { count: 2 });
  log.add('third', 'error', 'Failed');
  assert.equal(log.list().length, 2);
  assert.equal(log.list()[1].preview.count, 2);
  assert.equal(log.list()[0].preview, undefined);
  assert.match(log.summary(), /ERROR third: Failed/);
  assert.equal(log.clear(), 2);
  assert.equal(log.list().length, 0);
});

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { checkAssetReady, normalizeAssetTarget } = require('../lib/asset-readiness');

const asset = { uuid: 'asset-uuid', url: 'db://assets/ui/panel.png', type: 'cc.ImageAsset', importer: 'image', imported: true };

function fixture(overrides = {}) {
  let clock = 0;
  const calls = [];
  const request = async (method, target) => {
    calls.push([method, target]);
    if (overrides[method]) return overrides[method](target, calls);
    if (method === 'query-ready') return true;
    if (method === 'query-asset-info') return { ...asset };
    if (method === 'query-uuid') return asset.uuid;
    if (method === 'query-url') return asset.url;
    assert.fail(`Unexpected write or query: ${method}`);
  };
  return { calls, dependencies: { request, now: () => clock, sleep: async (ms) => { clock += ms; } } };
}

test('asset readiness uses exact imported identities and two separate stable observations', async () => {
  const { dependencies, calls } = fixture();
  const result = await checkAssetReady({ target: 'assets/ui/panel.png' }, dependencies);
  assert.equal(result.ready, true);
  assert.equal(result.target, asset.url);
  assert.equal(result.attempts, 2);
  assert.equal(result.stableObservations, 2);
  assert.equal(result.elapsedMs, 100);
  assert.deepEqual(result.asset, { uuid: asset.uuid, url: asset.url, type: asset.type, importer: asset.importer });
  assert.equal(calls.filter(([method]) => method === 'query-ready').length, 4);
  assert.equal(calls.filter(([method]) => method === 'query-uuid').length, 2);
  assert.equal(Object.values(result.boundaries).every((value) => value === false), true);
});

test('global AssetDB readiness makes no claim about a specific resource or queue', async () => {
  const { dependencies, calls } = fixture();
  const result = await checkAssetReady({}, dependencies);
  assert.equal(result.ready, true);
  assert.equal(result.scope, 'asset_db_query');
  assert.equal(result.asset, null);
  assert.deepEqual(calls, [['query-ready', undefined], ['query-ready', undefined]]);
  assert.equal(result.boundaries.importQueueVerified, false);
});

test('zero wait returns an observation, not stability or a successful readiness claim', async () => {
  const { dependencies } = fixture();
  const result = await checkAssetReady({ target: asset.uuid, waitMs: 0 }, dependencies);
  assert.equal(result.status, 'unconfirmed');
  assert.equal(result.ready, false);
  assert.equal(result.attempts, 1);
  assert.equal(result.timedOut, false);
});

for (const [name, overrides, status] of [
  ['busy', { 'query-ready': () => false }, 'database_busy'],
  ['unknown database response', { 'query-ready': () => ({ ready: true }) }, 'unknown'],
  ['missing asset', { 'query-asset-info': () => null }, 'missing'],
  ['importing', { 'query-asset-info': () => ({ ...asset, imported: false }) }, 'importing'],
  ['missing import evidence', { 'query-asset-info': () => ({ uuid: asset.uuid, url: asset.url, type: asset.type }) }, 'importing'],
  ['invalid asset', { 'query-asset-info': () => ({ ...asset, invalid: true }) }, 'invalid_asset'],
  ['wrong URL', { 'query-url': () => 'db://assets/other.png' }, 'identity_mismatch'],
  ['wrong UUID', { 'query-uuid': () => 'other-uuid' }, 'identity_mismatch'],
]) {
  test(`asset readiness reports ${name} without refreshing or guessing another target`, async () => {
    const { dependencies, calls } = fixture(overrides);
    const result = await checkAssetReady({ target: asset.url, waitMs: 250 }, dependencies);
    assert.equal(result.ready, false);
    assert.equal(result.status, status);
    assert.equal(result.timedOut, true);
    assert.ok(calls.length < 30);
    assert.ok(calls.every(([method]) => method.startsWith('query-')));
  });
}

test('a database becoming busy during identity readback invalidates the observation', async () => {
  let readyReads = 0;
  const { dependencies } = fixture({ 'query-ready': () => ++readyReads % 2 === 1 });
  const result = await checkAssetReady({ target: asset.uuid, waitMs: 200 }, dependencies);
  assert.equal(result.ready, false);
  assert.equal(result.status, 'database_busy');
  assert.equal(result.stableObservations, 0);
});

test('changed imported identity resets stability before the new type settles', async () => {
  let reads = 0;
  const { dependencies } = fixture({ 'query-asset-info': () => ({ ...asset, type: ++reads <= 2 ? 'cc.ImageAsset' : 'cc.Texture2D' }) });
  const result = await checkAssetReady({ target: asset.uuid }, dependencies);
  assert.equal(result.ready, true);
  assert.equal(result.attempts, 3);
  assert.equal(result.asset.type, 'cc.Texture2D');
});

test('unavailable editor messages are explicit rather than a ready result', async () => {
  const { dependencies } = fixture({ 'query-ready': () => { throw new Error('Message not supported'); } });
  const result = await checkAssetReady({}, dependencies);
  assert.equal(result.ready, false);
  assert.equal(result.status, 'unavailable');
  assert.match(result.error, /not supported/);
});

test('a stalled native query is bounded by the whole readiness deadline', async () => {
  const started = Date.now();
  const result = await checkAssetReady({ waitMs: 40 }, { request: () => new Promise(() => {}) });
  assert.equal(result.status, 'query_timeout');
  assert.equal(result.ready, false);
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 1000);
});

test('readiness validates exact targets and polling limits before any query', async () => {
  for (const target of ['', null, 12, '../assets/a.png', '/tmp/a.png', 'db://assets/../a.png', 'db://assets/*.png', 'db://assets/a.png?x', 'db://assets/a.png#x']) {
    assert.throws(() => normalizeAssetTarget(target), /target/);
  }
  assert.equal(normalizeAssetTarget('abcd+efgh/ijklmnopqrst'), 'abcd+efgh/ijklmnopqrst');
  for (const options of [{ waitMs: -1 }, { waitMs: 10001 }, { waitMs: 0.5 }, { pollIntervalMs: 0 }, { pollIntervalMs: 2001 }]) {
    await assert.rejects(checkAssetReady(options, { request: () => assert.fail('Invalid input must not query') }), /must be an integer/);
  }
});

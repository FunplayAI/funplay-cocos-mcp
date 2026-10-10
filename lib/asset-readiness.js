'use strict';

// Readiness is deliberately narrower than importer/compilation/runtime completion.
// Only exact AssetDB identities are queried; this module never refreshes or retries writes.
function normalizeAssetTarget(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string') throw new Error('target must be an asset UUID or exact db:// URL.');
  const target = value.trim().replace(/\\/g, '/');
  if (!target || target.length > 512 || /[\0*?#]/.test(target)) {
    throw new Error('target must be an asset UUID or exact db:// URL.');
  }
  const url = target.startsWith('assets/') || target.startsWith('internal/') ? `db://${target}` : target;
  if (url.startsWith('db://')) {
    const segments = url.slice(5).split('/');
    if (!['assets', 'internal'].includes(segments[0]) || segments.length < 2 ||
        segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new Error('target must be an exact db://assets/ or db://internal/ asset URL.');
    }
    return url;
  }
  // Compressed Cocos UUIDs may contain + or /; ordinary filesystem paths are not accepted.
  if (!/^[A-Za-z0-9_-]+(?:@[A-Za-z0-9_-]+)?$/.test(target) &&
      !/^[A-Za-z0-9+/]{22}(?:@[A-Za-z0-9_-]+)?$/.test(target)) {
    throw new Error('target must be an asset UUID, not a filesystem path.');
  }
  return target;
}

function integerOption(value, fallback, name, minimum, maximum) {
  const number = value === undefined ? fallback : value;
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return number;
}

function importedIdentity(info) {
  if (!info || typeof info !== 'object' || typeof info.uuid !== 'string' || !info.uuid ||
      typeof info.url !== 'string' || !info.url || typeof info.type !== 'string' || !info.type ||
      info.imported !== true || info.invalid === true) return null;
  return { uuid: info.uuid, url: info.url, type: info.type, importer: info.importer || null };
}

function editorRequest(method, ...args) {
  if (!global.Editor || !Editor.Message || typeof Editor.Message.request !== 'function') {
    throw new Error('AssetDB queries require the Cocos Creator extension host.');
  }
  return Editor.Message.request('asset-db', method, ...args);
}

async function observeAsset(request, target) {
  const databaseState = await request('query-ready');
  if (databaseState !== true) {
    return { status: databaseState === false ? 'database_busy' : 'unknown', databaseReady: databaseState === false ? false : null, asset: null };
  }
  if (!target) return { status: 'observed', databaseReady: true, asset: null };

  const info = await request('query-asset-info', target);
  if (!info) return { status: 'missing', databaseReady: true, asset: null };
  const asset = importedIdentity(info);
  if (!asset) {
    return { status: info.invalid === true ? 'invalid_asset' : 'importing', databaseReady: true, asset: {
      uuid: info.uuid || null, url: info.url || null, imported: info.imported === true,
    } };
  }
  if ((target.startsWith('db://') ? asset.url : asset.uuid) !== target) {
    return { status: 'identity_mismatch', databaseReady: true, asset };
  }
  const uuid = await request('query-uuid', asset.url);
  const url = await request('query-url', asset.uuid);
  const readback = importedIdentity(await request('query-asset-info', asset.uuid));
  if (uuid !== asset.uuid || url !== asset.url || JSON.stringify(readback) !== JSON.stringify(asset)) {
    return { status: 'identity_mismatch', databaseReady: true, asset };
  }
  const readyAfterRead = await request('query-ready');
  if (readyAfterRead !== true) {
    return { status: readyAfterRead === false ? 'database_busy' : 'unknown', databaseReady: readyAfterRead === false ? false : null, asset };
  }
  return { status: 'observed', databaseReady: true, asset };
}

async function checkAssetReady(options = {}, dependencies = {}) {
  const target = normalizeAssetTarget(options.target);
  const waitMs = integerOption(options.waitMs, 1500, 'waitMs', 0, 10000);
  const pollIntervalMs = integerOption(options.pollIntervalMs, 100, 'pollIntervalMs', 20, 2000);
  const now = dependencies.now || Date.now;
  const sleep = dependencies.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const nativeRequest = dependencies.request || editorRequest;
  const started = now();
  // A zero-wait request still bounds its single IPC observation, but cannot establish stability.
  const deadline = started + (waitMs || 1000);
  const request = (method, ...args) => new Promise((resolve, reject) => {
    const budget = Math.min(1000, deadline - now());
    if (budget <= 0) {
      const error = new Error('AssetDB readiness deadline reached.');
      error.code = 'READINESS_QUERY_TIMEOUT';
      reject(error);
      return;
    }
    const timer = setTimeout(() => {
      const error = new Error(`AssetDB ${method} did not respond within the readiness deadline.`);
      error.code = 'READINESS_QUERY_TIMEOUT';
      reject(error);
    }, budget);
    Promise.resolve().then(() => nativeRequest(method, ...args)).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });

  let attempts = 0;
  let stableObservations = 0;
  let previous = null;
  let sample = { status: 'unknown', databaseReady: null, asset: null };
  let queryError = '';
  while (attempts < 102) {
    attempts += 1;
    try {
      sample = await observeAsset(request, target);
    } catch (error) {
      sample = { status: error.code === 'READINESS_QUERY_TIMEOUT' ? 'query_timeout' : 'unavailable', databaseReady: null, asset: null };
      queryError = String(error.message || error).slice(0, 500);
      stableObservations = 0;
      break;
    }
    const identity = sample.status === 'observed' ? JSON.stringify(sample.asset || { databaseReady: true }) : null;
    stableObservations = identity ? (identity === previous ? stableObservations + 1 : 1) : 0;
    previous = identity;
    if (stableObservations >= 2 || waitMs === 0 || now() >= deadline) break;
    await sleep(Math.min(pollIntervalMs, deadline - now()));
    if (now() >= deadline) break;
  }

  const ready = stableObservations >= 2;
  return {
    ready,
    status: ready ? 'ready' : sample.status === 'observed' ? 'unconfirmed' : sample.status,
    scope: target ? 'asset_db_record' : 'asset_db_query',
    target,
    databaseReady: sample.databaseReady,
    asset: sample.asset,
    stableObservations,
    attempts,
    elapsedMs: Math.max(0, now() - started),
    timedOut: !ready && (sample.status === 'query_timeout' || waitMs > 0 && now() >= deadline),
    error: queryError,
    boundaries: {
      importQueueVerified: false,
      sourceBytesVerified: false,
      scriptCompilationVerified: false,
      runtimeLoadedVerified: false,
    },
    summary: ready
      ? target ? 'Stable imported AssetDB identity verified; compilation and runtime loading are not verified.'
        : 'Stable AssetDB query readiness verified; individual assets and the importer queue are not verified.'
      : `AssetDB readiness was not established (${sample.status === 'observed' ? 'unconfirmed' : sample.status}).`,
  };
}

module.exports = { checkAssetReady, normalizeAssetTarget };

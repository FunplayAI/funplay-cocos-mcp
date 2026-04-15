'use strict';

async function safeRequest(channel, method, ...args) {
  if (!global.Editor || !Editor.Message || typeof Editor.Message.request !== 'function') {
    throw new Error('Editor.Message.request is unavailable in the Cocos extension host.');
  }
  return await Editor.Message.request(channel, method, ...args);
}

function buildAssetTargetCandidates(uuidOrPath) {
  const raw = String(uuidOrPath || '').trim().replace(/\\/g, '/');
  const candidates = [];
  const add = (value) => {
    if (value && !candidates.includes(value)) {
      candidates.push(value);
    }
  };

  add(raw);

  if (raw.startsWith('assets/')) {
    add(`db://${raw}`);
  } else if (raw.startsWith('/assets/')) {
    add(`db://${raw.slice(1)}`);
  }

  if (raw.includes('/assets/')) {
    add(`db://assets/${raw.split('/assets/').pop()}`);
  }

  if (raw.startsWith('db://assets/') && !raw.match(/\.[a-z0-9]+$/i)) {
    add(`${raw}.scene`);
    add(`${raw}.prefab`);
    add(`${raw}.ts`);
  }

  return candidates;
}

async function requestFirst(method, uuidOrPath) {
  const candidates = buildAssetTargetCandidates(uuidOrPath);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const result = await safeRequest('asset-db', method, candidate);
      if (result != null) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}

async function listAssets(options = {}) {
  const payload = {};
  if (options.pattern) {
    payload.pattern = options.pattern;
  }
  if (options.ccType) {
    payload.ccType = options.ccType;
  }
  const result = await safeRequest('asset-db', 'query-assets', payload);
  return Array.isArray(result) ? result : [];
}

async function queryAssetInfo(uuidOrPath) {
  if (!uuidOrPath) {
    throw new Error('Asset uuid or path is required.');
  }

  const direct = await requestFirst('query-asset-info', uuidOrPath);
  if (direct) {
    return direct;
  }

  const url = await queryAssetUrl(uuidOrPath).catch(() => null);
  if (url) {
    const fromUrl = await safeRequest('asset-db', 'query-asset-info', url);
    if (fromUrl) {
      return fromUrl;
    }
  }

  throw new Error(`Asset not found: ${uuidOrPath}`);
}

async function queryAssetMeta(uuidOrPath) {
  if (!uuidOrPath) {
    throw new Error('Asset uuid or path is required.');
  }

  const direct = await requestFirst('query-asset-meta', uuidOrPath);
  if (direct) {
    return direct;
  }

  const info = await queryAssetInfo(uuidOrPath);
  return await safeRequest('asset-db', 'query-asset-meta', info.uuid || info.url || uuidOrPath);
}

async function queryAssetData(uuidOrPath) {
  if (!uuidOrPath) {
    throw new Error('Asset uuid or path is required.');
  }

  const direct = await requestFirst('query-asset-data', uuidOrPath);
  if (direct) {
    return direct;
  }

  const info = await queryAssetInfo(uuidOrPath);
  return await safeRequest('asset-db', 'query-asset-data', info.uuid || info.url || uuidOrPath);
}

async function queryAssetUrl(uuidOrPath) {
  if (!uuidOrPath) {
    throw new Error('Asset uuid or path is required.');
  }
  const result = await requestFirst('query-url', uuidOrPath);
  if (result) {
    return result;
  }
  throw new Error(`Asset URL not found: ${uuidOrPath}`);
}

async function openAsset(uuidOrPath) {
  const info = await queryAssetInfo(uuidOrPath);
  await safeRequest('asset-db', 'open-asset', info.uuid || uuidOrPath);
  return info;
}

async function deleteAsset(uuidOrPath) {
  let url = String(uuidOrPath || '');
  if (!url.startsWith('db://')) {
    const info = await queryAssetInfo(uuidOrPath);
    url = info.url || (await queryAssetUrl(info.uuid || uuidOrPath));
  }

  await safeRequest('asset-db', 'delete-asset', url);
  return { deleted: true, url };
}

function selectAsset(uuid) {
  if (!global.Editor || !Editor.Selection || typeof Editor.Selection.select !== 'function') {
    throw new Error('Editor.Selection.select is unavailable in this Cocos environment.');
  }

  Editor.Selection.clear('asset');
  Editor.Selection.select('asset', uuid);
  return { selected: true, uuid };
}

function getCurrentSelection() {
  if (!global.Editor || !Editor.Selection || typeof Editor.Selection.getSelected !== 'function') {
    throw new Error('Editor.Selection API is unavailable in this Cocos environment.');
  }

  return {
    asset: Editor.Selection.getSelected('asset') || '',
    node: Editor.Selection.getSelected('node') || '',
    type: typeof Editor.Selection.getLastSelectedType === 'function' ? Editor.Selection.getLastSelectedType() : '',
  };
}

module.exports = {
  deleteAsset,
  getCurrentSelection,
  listAssets,
  openAsset,
  queryAssetData,
  queryAssetInfo,
  queryAssetMeta,
  queryAssetUrl,
  selectAsset,
};

'use strict';

const fs = require('fs');
const path = require('path');
const { listAssets, queryAssetData, queryAssetInfo, queryAssetMeta } = require('./assets');
const { resolveProjectPath } = require('./path-safety');

function requestEditorMessage(channel, method, ...args) {
  if (!global.Editor || !Editor.Message || typeof Editor.Message.request !== 'function') {
    throw new Error('Editor.Message.request is unavailable in the Cocos extension host.');
  }
  return Editor.Message.request(channel, method, ...args);
}

function assetUrlToPath(projectPath, url) {
  if (!url || !String(url).startsWith('db://assets/')) {
    return '';
  }
  return path.join(projectPath, String(url).slice('db://'.length));
}

function assetFilePath(projectPath, info) {
  const candidates = [
    info && info.file,
    info && info.path,
    info && info.source,
    info && info.url ? assetUrlToPath(projectPath, info.url) : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const fullPath = path.isAbsolute(candidate)
      ? resolveProjectPath(projectPath, candidate)
      : resolveProjectPath(projectPath, candidate);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return fullPath;
    }
  }
  return '';
}

function normalizePrefabTarget(projectPath, target) {
  const raw = String(target || '').trim().replace(/\\/g, '/');
  if (!raw) {
    throw new Error('target is required.');
  }

  let relative = raw;
  if (relative.startsWith('db://assets/')) {
    relative = relative.slice('db://'.length);
  } else if (relative.startsWith('/assets/')) {
    relative = relative.slice(1);
  } else if (!relative.startsWith('assets/')) {
    relative = `assets/${relative}`;
  }

  if (!relative.endsWith('.prefab')) {
    relative = `${relative}.prefab`;
  }

  const filePath = resolveProjectPath(projectPath, relative);
  const assetsRoot = path.join(projectPath, 'assets');
  const relativeToAssets = path.relative(assetsRoot, filePath);
  if (relativeToAssets.startsWith('..') || path.isAbsolute(relativeToAssets)) {
    throw new Error('target must be inside the Cocos assets directory.');
  }

  const projectRelative = path.relative(projectPath, filePath).replace(/\\/g, '/');
  return {
    filePath,
    projectRelative,
    dbUrl: `db://${projectRelative}`,
  };
}

async function queryAssetInfoOptional(target) {
  try {
    return await queryAssetInfo(target);
  } catch (error) {
    return null;
  }
}

async function savePrefabContent(projectPath, options = {}) {
  const target = normalizePrefabTarget(projectPath, options.target);
  const content = String(options.content || '');
  if (!content) {
    throw new Error('content is required.');
  }
  JSON.parse(content);

  const exists = fs.existsSync(target.filePath);
  if (exists && options.overwrite !== true) {
    throw new Error(`Target prefab already exists: ${target.projectRelative}`);
  }

  fs.mkdirSync(path.dirname(target.filePath), { recursive: true });

  let method = 'fs-write';
  let result;
  if (global.Editor && Editor.Message && typeof Editor.Message.request === 'function') {
    if (exists && options.overwrite === true) {
      try {
        result = await requestEditorMessage('asset-db', 'save-asset', target.dbUrl, content);
        method = 'asset-db:save-asset';
        if (!fs.existsSync(target.filePath) || fs.readFileSync(target.filePath, 'utf8') !== content) {
          fs.writeFileSync(target.filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
        }
      } catch (error) {
        fs.writeFileSync(target.filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
        result = { fallbackReason: error.message };
      }
    } else {
      try {
        result = await requestEditorMessage('asset-db', 'create-asset', target.dbUrl, content);
        method = 'asset-db:create-asset';
      } catch (error) {
        if (fs.existsSync(target.filePath)) {
          result = { fallbackReason: error.message, fileCreated: true };
        } else {
          throw error;
        }
      }
    }
  } else {
    fs.writeFileSync(target.filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  }

  const fileExists = fs.existsSync(target.filePath);
  const info = await queryAssetInfoOptional(target.dbUrl);
  if (!fileExists && !info) {
    throw new Error(`Prefab was not created: ${target.projectRelative}`);
  }

  return {
    created: !exists,
    overwritten: exists && options.overwrite === true,
    method,
    result,
    dbUrl: target.dbUrl,
    path: target.projectRelative,
    fileExists,
    info,
  };
}

function collectUuidReferences(value, refs = [], pointer = '') {
  if (!value || typeof value !== 'object') {
    return refs;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUuidReferences(item, refs, `${pointer}/${index}`));
    return refs;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${key}`;
    if (
      typeof child === 'string' &&
      (key.toLowerCase().includes('uuid') || key === '__uuid__' || key === 'assetUuid' || key === 'prefabUuid')
    ) {
      refs.push({ uuid: child, path: childPointer, key });
    } else {
      collectUuidReferences(child, refs, childPointer);
    }
  }
  return refs;
}

function getByJsonPath(target, jsonPath) {
  const segments = String(jsonPath || '')
    .replace(/^\//, '')
    .split(/[/.]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  let current = target;
  for (const segment of segments) {
    if (current == null) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function setByJsonPath(target, jsonPath, value) {
  const segments = String(jsonPath || '')
    .replace(/^\//, '')
    .split(/[/.]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    throw new Error('jsonPath is required.');
  }
  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (current[segment] == null || typeof current[segment] !== 'object') {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[segments[segments.length - 1]] = value;
}

async function inspectPrefab(projectPath, target) {
  const info = await queryAssetInfo(target);
  const meta = await queryAssetMeta(target).catch(() => null);
  const data = await queryAssetData(target).catch(() => null);
  const filePath = assetFilePath(projectPath, info);
  const content = filePath ? fs.readFileSync(filePath, 'utf8') : '';
  const parsed = content ? JSON.parse(content) : data;
  const references = collectUuidReferences(parsed).slice(0, 500);

  return {
    info,
    meta,
    filePath: filePath ? path.relative(projectPath, filePath).replace(/\\/g, '/') : '',
    referenceCount: references.length,
    references,
  };
}

async function validatePrefabReferences(projectPath, options = {}) {
  const targets = options.target
    ? [options.target]
    : (await listAssets({ pattern: options.pattern || 'db://assets/**', ccType: 'cc.Prefab' }))
        .slice(0, Number.isFinite(options.limit) ? Math.max(1, Math.min(200, options.limit)) : 50)
        .map((asset) => asset.uuid || asset.url)
        .filter(Boolean);
  const prefabs = [];

  for (const target of targets) {
    const prefab = await inspectPrefab(projectPath, target);
    const checked = [];
    const missing = [];
    for (const ref of prefab.references) {
      try {
        const info = await queryAssetInfo(ref.uuid);
        checked.push({ ...ref, exists: true, asset: { uuid: info.uuid, url: info.url, type: info.type } });
      } catch (error) {
        missing.push({ ...ref, exists: false, error: error.message });
      }
    }
    prefabs.push({
      target,
      filePath: prefab.filePath,
      referenceCount: prefab.referenceCount,
      checkedCount: checked.length + missing.length,
      missingCount: missing.length,
      missing,
    });
  }

  const missingCount = prefabs.reduce((sum, prefab) => sum + prefab.missingCount, 0);
  return {
    ok: missingCount === 0,
    prefabCount: prefabs.length,
    missingCount,
    prefabs,
  };
}

async function duplicatePrefab(projectPath, options = {}) {
  const source = String(options.source || '').trim();
  const target = String(options.target || '').trim();
  if (!source || !target) {
    throw new Error('source and target are required.');
  }

  const info = await queryAssetInfo(source);
  const sourcePath = assetFilePath(projectPath, info);
  if (!sourcePath) {
    throw new Error(`Prefab source file was not found: ${source}`);
  }

  const targetPath = resolveProjectPath(projectPath, target.endsWith('.prefab') ? target : `${target}.prefab`);
  const assetsRoot = path.join(projectPath, 'assets');
  const relativeToAssets = path.relative(assetsRoot, targetPath);
  if (relativeToAssets.startsWith('..') || path.isAbsolute(relativeToAssets)) {
    throw new Error('target must be inside the Cocos assets directory.');
  }
  if (fs.existsSync(targetPath) && options.overwrite !== true) {
    throw new Error(`Target prefab already exists: ${target}`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return {
    duplicated: true,
    source: path.relative(projectPath, sourcePath).replace(/\\/g, '/'),
    target: path.relative(projectPath, targetPath).replace(/\\/g, '/'),
  };
}

async function editPrefabJson(projectPath, options = {}) {
  const target = String(options.target || '').trim();
  if (!target) {
    throw new Error('target is required.');
  }
  const info = await queryAssetInfo(target);
  const filePath = assetFilePath(projectPath, info);
  if (!filePath) {
    throw new Error(`Prefab file was not found: ${target}`);
  }

  const original = fs.readFileSync(filePath, 'utf8');
  let updated = original;
  if (options.search !== undefined) {
    const search = String(options.search);
    if (!search) {
      throw new Error('search must not be empty.');
    }
    if (!original.includes(search)) {
      throw new Error('search text was not found in prefab file.');
    }
    updated = options.replaceAll
      ? original.split(search).join(String(options.replace || ''))
      : original.replace(search, String(options.replace || ''));
  } else {
    const json = JSON.parse(original);
    const value = JSON.parse(String(options.valueJson || 'null'));
    setByJsonPath(json, options.jsonPath, value);
    updated = JSON.stringify(json, null, 2) + '\n';
  }

  JSON.parse(updated);
  if (options.createBackup) {
    fs.writeFileSync(`${filePath}.bak`, original, 'utf8');
  }
  fs.writeFileSync(filePath, updated, 'utf8');
  return {
    edited: true,
    path: path.relative(projectPath, filePath).replace(/\\/g, '/'),
    oldValue: options.jsonPath ? getByJsonPath(JSON.parse(original), options.jsonPath) : undefined,
    validation: await validatePrefabReferences(projectPath, { target }),
  };
}

async function applyPrefabInstance(nodeUuid) {
  const uuid = String(nodeUuid || '').trim();
  if (!uuid) {
    throw new Error('node uuid is required.');
  }
  const result = await requestEditorMessage('scene', 'apply-prefab', uuid);
  return { applied: true, uuid, result };
}

async function revertPrefabInstance(nodeUuid) {
  const uuid = String(nodeUuid || '').trim();
  if (!uuid) {
    throw new Error('node uuid is required.');
  }
  const candidates = ['revert-prefab', 'restore-prefab'];
  let lastError = null;
  for (const method of candidates) {
    try {
      const result = await requestEditorMessage('scene', method, uuid);
      return { reverted: true, uuid, method, result };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No prefab revert editor message was available.');
}

module.exports = {
  applyPrefabInstance,
  duplicatePrefab,
  editPrefabJson,
  inspectPrefab,
  normalizePrefabTarget,
  revertPrefabInstance,
  savePrefabContent,
  validatePrefabReferences,
};

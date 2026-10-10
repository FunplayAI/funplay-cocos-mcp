'use strict';

const { checkAssetReady } = require('../asset-readiness');

const fs = require('fs');
const path = require('path');
const { listAssets, queryAssetInfo } = require('../assets');
const { resolveProjectPath } = require('../path-safety');

const UUID_KEY_PATTERN = /uuid|assetUuid|prefabUuid|sceneUuid|__uuid__/i;
const UUID_LITERAL_PATTERN = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[A-Za-z0-9+/=-]{20,32}/g;

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
    const fullPath = resolveProjectPath(projectPath, candidate);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return fullPath;
    }
  }
  return '';
}

function collectStructuredUuidReferences(value, refs = [], pointer = '') {
  if (value == null) {
    return refs;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStructuredUuidReferences(item, refs, `${pointer}/${index}`));
    return refs;
  }
  if (typeof value !== 'object') {
    return refs;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${key}`;
    if (typeof child === 'string' && UUID_KEY_PATTERN.test(key)) {
      refs.push({ uuid: child, path: childPointer, key, source: 'structured' });
      continue;
    }
    collectStructuredUuidReferences(child, refs, childPointer);
  }
  return refs;
}

function collectTextUuidReferences(text) {
  const refs = [];
  const seen = new Set();
  let match;
  while ((match = UUID_LITERAL_PATTERN.exec(String(text || '')))) {
    const uuid = match[0];
    if (seen.has(uuid)) {
      continue;
    }
    seen.add(uuid);
    refs.push({ uuid, path: `@${match.index}`, key: '', source: 'text' });
  }
  return refs;
}

function dedupeReferences(refs) {
  const seen = new Set();
  const result = [];
  for (const ref of refs) {
    const key = `${ref.uuid}:${ref.path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function collectUuidReferences(content) {
  const refs = [];
  try {
    refs.push(...collectStructuredUuidReferences(JSON.parse(content)));
  } catch (error) {
    // Non-JSON assets still get a literal reference scan below.
  }
  refs.push(...collectTextUuidReferences(content));
  return dedupeReferences(refs);
}

async function inspectAssetDependencies(projectPath, target, options = {}) {
  const info = await queryAssetInfo(target);
  const filePath = assetFilePath(projectPath, info);
  if (!filePath) {
    throw new Error(`Asset file was not found: ${target}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(500, options.limit)) : 200;
  const references = collectUuidReferences(content).slice(0, limit);
  const dependencies = [];
  const missing = [];

  for (const ref of references) {
    try {
      const asset = await queryAssetInfo(ref.uuid);
      dependencies.push({
        ...ref,
        exists: true,
        asset: {
          uuid: asset.uuid,
          url: asset.url,
          type: asset.type,
          importer: asset.importer,
        },
      });
    } catch (error) {
      missing.push({ ...ref, exists: false, error: error.message });
    }
  }

  return {
    ok: missing.length === 0,
    target,
    asset: {
      uuid: info.uuid,
      url: info.url,
      type: info.type,
    },
    filePath: path.relative(projectPath, filePath).replace(/\\/g, '/'),
    referenceCount: references.length,
    dependencyCount: dependencies.length,
    missingCount: missing.length,
    dependencies,
    missing,
  };
}

async function validateAssetDependencies(projectPath, options = {}) {
  const targets = options.target
    ? [options.target]
    : (await listAssets({ pattern: options.pattern || 'db://assets/**', ccType: options.ccType }))
        .slice(0, Number.isFinite(options.limit) ? Math.max(1, Math.min(200, options.limit)) : 50)
        .map((asset) => asset.uuid || asset.url)
        .filter(Boolean);

  const assets = [];
  for (const target of targets) {
    try {
      assets.push(await inspectAssetDependencies(projectPath, target, options));
    } catch (error) {
      assets.push({
        ok: false,
        target,
        error: error.message,
        missingCount: 1,
      });
    }
  }

  const missingCount = assets.reduce((sum, asset) => sum + (Number(asset.missingCount) || 0), 0);
  return {
    ok: missingCount === 0,
    assetCount: assets.length,
    missingCount,
    assets,
  };
}

function createAssetsAdvancedTools({ createSchema, getRuntimeContext }) {
  return [
    {
      name: 'check_asset_ready',
      profile: 'full',
      category: 'assets',
      description: '[specialist] Check bounded AssetDB readiness and optionally a stable imported UUID/URL identity. Does not prove importer queue, script compilation, source bytes, or runtime loading completion.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: createSchema({
        target: { type: 'string', description: 'Optional exact asset UUID, db:// URL, or assets/... path. No extension guessing.' },
        waitMs: { type: 'integer', minimum: 0, maximum: 10000, description: 'Total polling budget; defaults to 1500 ms. Zero returns one unconfirmed observation.' },
        pollIntervalMs: { type: 'integer', minimum: 20, maximum: 2000, description: 'Polling interval; defaults to 100 ms.' },
      }, []),
      handler: async (args) => await checkAssetReady(args),
    },
    {
      name: 'inspect_asset_dependencies',
      profile: 'core',
      description: '[specialist] Inspect UUID-style dependencies referenced by a serialized Cocos asset.',
      inputSchema: createSchema(
        {
          target: { type: 'string', description: 'Asset uuid, db url, or project path.' },
          limit: { type: 'number', description: 'Maximum dependency references to inspect.' },
        },
        ['target']
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        return await inspectAssetDependencies(projectPath, args.target, args);
      },
    },
    {
      name: 'validate_asset_dependencies',
      profile: 'core',
      description: '[specialist] Validate UUID-style dependencies for one asset or a project asset query.',
      inputSchema: createSchema(
        {
          target: { type: 'string', description: 'Optional asset uuid, db url, or project path.' },
          pattern: { type: 'string', description: 'Asset-db pattern used when target is omitted.' },
          ccType: { type: 'string', description: 'Optional Cocos asset type filter.' },
          limit: { type: 'number', description: 'Maximum assets to scan when target is omitted.' },
        },
        []
      ),
      handler: async (args) => {
        const { projectPath } = getRuntimeContext();
        return await validateAssetDependencies(projectPath, args);
      },
    },
  ];
}

module.exports = {
  collectUuidReferences,
  createAssetsAdvancedTools,
  inspectAssetDependencies,
  validateAssetDependencies,
};

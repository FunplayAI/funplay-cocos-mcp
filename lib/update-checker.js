'use strict';

const https = require('https');

const LATEST_RELEASE_URL = 'https://api.github.com/repos/FunplayAI/funplay-cocos-mcp/releases/latest';
const EXTENSION_ZIP_PATTERN = /^Funplay\.CocosMcp\.v.+\.zip$/i;

function normalizeVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[+-]/)[0];
}

function parseVersion(value) {
  return normalizeVersion(value)
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

function fetchJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'funplay-cocos-mcp-update-checker',
        },
        timeout: timeoutMs,
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`GitHub returned HTTP ${response.statusCode}: ${body.slice(0, 160)}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Failed to parse GitHub response: ${error.message}`));
          }
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error(`Update check timed out after ${timeoutMs}ms.`));
    });
    request.on('error', reject);
  });
}

function mapReleaseAsset(asset) {
  return {
    name: String(asset && asset.name || ''),
    browserDownloadUrl: String(asset && asset.browser_download_url || asset && asset.browserDownloadUrl || ''),
    size: Number(asset && asset.size || 0),
    contentType: String(asset && asset.content_type || asset && asset.contentType || ''),
  };
}

function selectReleaseAssets(version, assets = []) {
  const mapped = (Array.isArray(assets) ? assets : [])
    .map(mapReleaseAsset)
    .filter((asset) => asset.name && asset.browserDownloadUrl);
  const exactZipName = `Funplay.CocosMcp.v${normalizeVersion(version)}.zip`;
  const extensionAsset = mapped.find((asset) => asset.name === exactZipName)
    || mapped.find((asset) => EXTENSION_ZIP_PATTERN.test(asset.name))
    || mapped.find((asset) => /\.zip$/i.test(asset.name));
  const checksumAsset = mapped.find((asset) => asset.name === 'SHA256SUMS.txt')
    || mapped.find((asset) => /sha256sums/i.test(asset.name));
  const manifestAsset = mapped.find((asset) => asset.name === 'release-manifest.json');

  return {
    assets: mapped,
    extensionAsset: extensionAsset || null,
    checksumAsset: checksumAsset || null,
    manifestAsset: manifestAsset || null,
  };
}

async function checkForUpdate(options = {}) {
  const currentVersion = normalizeVersion(options.currentVersion || '0.0.0');
  const checkedAt = new Date().toISOString();

  try {
    const release = await fetchJson(options.url || LATEST_RELEASE_URL, options.timeoutMs || 5000);
    const latestVersion = normalizeVersion(release.tag_name || release.name || '');
    const comparison = latestVersion ? compareVersions(latestVersion, currentVersion) : 0;
    const releaseAssets = selectReleaseAssets(latestVersion, release.assets);
    return {
      ok: true,
      checkedAt,
      currentVersion,
      latestVersion,
      updateAvailable: comparison > 0,
      releaseUrl: release.html_url || '',
      publishedAt: release.published_at || '',
      source: options.url || LATEST_RELEASE_URL,
      tagName: release.tag_name || '',
      releaseName: release.name || '',
      assets: releaseAssets.assets,
      extensionAsset: releaseAssets.extensionAsset,
      checksumAsset: releaseAssets.checksumAsset,
      manifestAsset: releaseAssets.manifestAsset,
      downloadAvailable: Boolean(releaseAssets.extensionAsset && releaseAssets.checksumAsset),
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      currentVersion,
      latestVersion: '',
      updateAvailable: false,
      releaseUrl: '',
      publishedAt: '',
      source: options.url || LATEST_RELEASE_URL,
      tagName: '',
      releaseName: '',
      assets: [],
      extensionAsset: null,
      checksumAsset: null,
      manifestAsset: null,
      downloadAvailable: false,
      error: error.message,
    };
  }
}

module.exports = {
  LATEST_RELEASE_URL,
  checkForUpdate,
  compareVersions,
  normalizeVersion,
  selectReleaseAssets,
};

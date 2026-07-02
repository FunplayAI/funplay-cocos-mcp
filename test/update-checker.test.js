'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { compareVersions, normalizeVersion, selectReleaseAssets } = require('../lib/update-checker');

test('normalizeVersion removes release tag prefixes and metadata', () => {
  assert.equal(normalizeVersion('v1.2.3-beta+build'), '1.2.3');
});

test('compareVersions compares semantic version numbers', () => {
  assert.equal(compareVersions('1.2.4', '1.2.3'), 1);
  assert.equal(compareVersions('1.2.3', '1.2.4'), -1);
  assert.equal(compareVersions('1.2.3', 'v1.2.3'), 0);
});

test('selectReleaseAssets finds extension zip, checksums, and manifest', () => {
  const selected = selectReleaseAssets('0.4.1', [
    { name: 'README.md', browser_download_url: 'https://example.test/readme' },
    { name: 'Funplay.CocosMcp.v0.4.1.zip', browser_download_url: 'https://example.test/package.zip' },
    { name: 'SHA256SUMS.txt', browser_download_url: 'https://example.test/sums' },
    { name: 'release-manifest.json', browser_download_url: 'https://example.test/manifest' },
  ]);

  assert.equal(selected.extensionAsset.name, 'Funplay.CocosMcp.v0.4.1.zip');
  assert.equal(selected.checksumAsset.name, 'SHA256SUMS.txt');
  assert.equal(selected.manifestAsset.name, 'release-manifest.json');
  assert.equal(selected.assets.length, 4);
});

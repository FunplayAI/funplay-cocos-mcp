'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { refreshAssets } = require('../lib/tools/files');

const PROJECT = path.resolve('/tmp/cocos-project');

async function captureRefreshUrls(targetPath) {
  const previousEditor = global.Editor;
  const urls = [];
  global.Editor = {
    Message: {
      request: async (channel, message, url) => {
        assert.equal(channel, 'asset-db');
        assert.equal(message, 'refresh-asset');
        urls.push(url);
      },
    },
  };
  try {
    await refreshAssets(PROJECT, targetPath);
  } finally {
    global.Editor = previousEditor;
  }
  return urls;
}

test('refreshAssets uses db://assets without a trailing slash for the assets root', async () => {
  assert.deepEqual(await captureRefreshUrls(path.join(PROJECT, 'assets')), ['db://assets']);
});

test('refreshAssets keeps the relative path for a file inside assets', async () => {
  assert.deepEqual(
    await captureRefreshUrls(path.join(PROJECT, 'assets', 'scripts', 'a.ts')),
    ['db://assets/scripts/a.ts']
  );
});

test('refreshAssets does not refresh for a path outside assets', async () => {
  assert.deepEqual(await captureRefreshUrls(path.join(PROJECT, 'settings', 'a.json')), []);
});

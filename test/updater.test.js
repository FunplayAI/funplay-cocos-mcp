'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  extractZip,
  installLatestUpdate,
  parseChecksum,
  sha256File,
} = require('../lib/updater');

function hasCommand(name) {
  const result = childProcess.spawnSync(name, ['-v'], { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-updater-test-'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createReleasePackage(root, version) {
  const packageRoot = path.join(root, 'funplay-cocos-mcp');
  fs.mkdirSync(path.join(packageRoot, 'lib'), { recursive: true });
  writeJson(path.join(packageRoot, 'package.json'), {
    name: 'funplay-cocos-mcp',
    version,
    main: 'browser.js',
  });
  fs.writeFileSync(path.join(packageRoot, 'browser.js'), `'use strict';\nmodule.exports = '${version}';\n`, 'utf8');
  fs.writeFileSync(path.join(packageRoot, 'lib', 'marker.js'), `'use strict';\n`, 'utf8');
  return packageRoot;
}

function createZip(sourceRoot, zipPath) {
  const result = childProcess.spawnSync('zip', ['-qr', zipPath, 'funplay-cocos-mcp'], {
    cwd: sourceRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'zip failed');
  }
}

function serveFiles(files) {
  const server = http.createServer((request, response) => {
    const name = decodeURIComponent(String(request.url || '/').replace(/^\//, ''));
    const file = files[name];
    if (!file) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    response.end(fs.readFileSync(file));
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('parseChecksum returns the checksum for a named release asset', () => {
  const checksum = 'a'.repeat(64);
  assert.equal(parseChecksum(`${checksum}  Funplay.CocosMcp.v0.4.1.zip\n`, 'Funplay.CocosMcp.v0.4.1.zip'), checksum);
  assert.equal(parseChecksum(`${checksum}  other.zip\n`, 'Funplay.CocosMcp.v0.4.1.zip'), '');
});

test('extractZip extracts the extension package safely', { skip: hasCommand('zip') ? false : 'zip command unavailable' }, () => {
  const temp = makeTempDir();
  try {
    const source = path.join(temp, 'source');
    const zipPath = path.join(temp, 'package.zip');
    const extractRoot = path.join(temp, 'extract');
    createReleasePackage(source, '0.4.1');
    createZip(source, zipPath);

    const result = extractZip(zipPath, extractRoot);

    assert.equal(result.files > 0, true);
    assert.equal(fs.existsSync(path.join(extractRoot, 'funplay-cocos-mcp', 'package.json')), true);
    assert.equal(fs.existsSync(path.join(extractRoot, 'funplay-cocos-mcp', 'browser.js')), true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('installLatestUpdate downloads, verifies, backs up, and replaces the extension package', {
  skip: hasCommand('zip') ? false : 'zip command unavailable',
}, async () => {
  const temp = makeTempDir();
  let server = null;
  try {
    const currentPackage = path.join(temp, 'extensions', 'funplay-cocos-mcp');
    fs.mkdirSync(currentPackage, { recursive: true });
    writeJson(path.join(currentPackage, 'package.json'), {
      name: 'funplay-cocos-mcp',
      version: '0.4.0',
      main: 'browser.js',
    });
    fs.writeFileSync(path.join(currentPackage, 'browser.js'), `'use strict';\nmodule.exports = 'old';\n`, 'utf8');
    fs.writeFileSync(path.join(currentPackage, 'stale.txt'), 'remove me\n', 'utf8');

    const releaseRoot = path.join(temp, 'release-source');
    const zipName = 'Funplay.CocosMcp.v0.4.1.zip';
    const zipPath = path.join(temp, zipName);
    const sumsPath = path.join(temp, 'SHA256SUMS.txt');
    createReleasePackage(releaseRoot, '0.4.1');
    createZip(releaseRoot, zipPath);
    fs.writeFileSync(sumsPath, `${sha256File(zipPath)}  ${zipName}\n`, 'utf8');

    server = await serveFiles({
      [zipName]: zipPath,
      'SHA256SUMS.txt': sumsPath,
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const result = await installLatestUpdate({
      packagePath: currentPackage,
      currentVersion: '0.4.0',
      releaseInfo: {
        latestVersion: '0.4.1',
        assets: [
          { name: zipName, browserDownloadUrl: `${baseUrl}/${zipName}` },
          { name: 'SHA256SUMS.txt', browserDownloadUrl: `${baseUrl}/SHA256SUMS.txt` },
        ],
      },
    });

    const installedPackage = JSON.parse(fs.readFileSync(path.join(currentPackage, 'package.json'), 'utf8'));
    assert.equal(result.installed, true);
    assert.equal(result.checksumVerified, true);
    assert.equal(installedPackage.version, '0.4.1');
    assert.equal(fs.existsSync(path.join(currentPackage, 'lib', 'marker.js')), true);
    assert.equal(fs.existsSync(path.join(currentPackage, 'stale.txt')), false);
    assert.equal(fs.existsSync(path.join(result.backupDir, 'stale.txt')), true);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

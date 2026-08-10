'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  activateGlobalExtension,
  getGlobalExtensionsDirectory,
  getGlobalInstallationState,
  installGlobalExtension,
} = require('../lib/global-install');
const { sha256File } = require('../lib/updater');

function hasCommand(name) {
  const result = childProcess.spawnSync(name, ['-v'], { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-global-install-test-'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createExtensionPackage(packagePath, version) {
  fs.mkdirSync(path.join(packagePath, 'lib'), { recursive: true });
  writeJson(path.join(packagePath, 'package.json'), {
    name: 'funplay-cocos-mcp',
    version,
    main: 'browser.js',
  });
  fs.writeFileSync(
    path.join(packagePath, 'browser.js'),
    `'use strict';\nmodule.exports = '${version}';\n`,
    'utf8'
  );
  fs.writeFileSync(path.join(packagePath, 'lib', 'marker.js'), `'use strict';\n`, 'utf8');
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

test('global install state targets the active Creator version directory', () => {
  const temp = makeTempDir();
  try {
    const homePath = path.join(temp, 'home');
    const editorHomePath = path.join(homePath, '.CocosCreator');
    const projectPath = path.join(temp, 'project');
    const packagePath = path.join(projectPath, 'extensions', 'funplay-cocos-mcp');
    createExtensionPackage(packagePath, '0.4.6');

    const state = getGlobalInstallationState({
      homePath,
      editorHomePath,
      editorVersion: '3.8.8',
      projectPath,
      packagePath,
      currentVersion: '0.4.6',
      availableVersion: '0.4.6',
    });

    assert.equal(
      getGlobalExtensionsDirectory({ editorHomePath, editorVersion: '3.8.8' }),
      path.join(editorHomePath, 'builtin-extensions', '3.8.8')
    );
    assert.equal(
      state.globalPackagePath,
      path.join(editorHomePath, 'builtin-extensions', '3.8.8', 'funplay-cocos-mcp')
    );
    assert.equal(state.editorVersion, '3.8.8');
    assert.equal(state.scope, 'project');
    assert.equal(state.action, 'install');
    assert.equal(state.canInstallGlobally, true);
    assert.equal(state.automaticForNewProjects, false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('global directory keeps the legacy fallback outside a running Creator host', () => {
  const homePath = path.join('/tmp', 'funplay-legacy-home');
  assert.equal(
    getGlobalExtensionsDirectory({ homePath }),
    path.join(homePath, '.CocosCreator', 'extensions')
  );
});

test('activateGlobalExtension asks Creator to scan and enable the global package', async () => {
  const globalPackagePath = path.join('/tmp', 'creator-home', 'builtin-extensions', '3.8.8', 'funplay-cocos-mcp');
  const packages = [];
  const calls = [];
  const editor = {
    Message: {
      async request(packageName, message, ...args) {
        calls.push([packageName, message, ...args]);
        if (message === 'scanning') {
          packages.push({
            name: 'funplay-cocos-mcp',
            path: globalPackagePath,
            enable: false,
          });
        }
        if (message === 'enable') {
          const item = packages.find((candidate) => candidate.path === args[0]);
          if (item) {
            item.enable = true;
          }
        }
      },
    },
    Package: {
      getPackages(filter = {}) {
        return packages.filter((item) =>
          (!filter.name || item.name === filter.name) &&
          (!filter.path || item.path === filter.path)
        );
      },
      async register(packagePath) {
        packages.push({ name: 'funplay-cocos-mcp', path: packagePath, enable: false });
      },
      async enable(packagePath) {
        const item = packages.find((candidate) => candidate.path === packagePath);
        if (item) {
          item.enable = true;
        }
      },
    },
  };

  const activation = await activateGlobalExtension({ editor, globalPackagePath });

  assert.equal(activation.scanned, true);
  assert.equal(activation.registered, true);
  assert.equal(activation.enabled, true);
  assert.equal(activation.activePath, globalPackagePath);
  assert.equal(activation.shadowedBy, '');
  assert.deepEqual(calls[0], ['extension', 'scanning', 'global']);
  assert.deepEqual(calls[1].slice(0, 4), [
    'extension',
    'enable',
    globalPackagePath,
    true,
  ]);
});

test('activateGlobalExtension preserves an active project copy after registering the global package', async () => {
  const projectPackagePath = path.join('/tmp', 'project', 'extensions', 'funplay-cocos-mcp');
  const globalPackagePath = path.join('/tmp', 'creator-home', 'builtin-extensions', '3.8.8', 'funplay-cocos-mcp');
  const packages = [{
    name: 'funplay-cocos-mcp',
    path: projectPackagePath,
    enable: true,
  }];
  const calls = [];
  const editor = {
    Message: {
      async request(packageName, message, ...args) {
        calls.push([packageName, message, ...args]);
        if (message === 'scanning') {
          packages.push({
            name: 'funplay-cocos-mcp',
            path: globalPackagePath,
            enable: false,
          });
        }
      },
    },
    Package: {
      getPackages(filter = {}) {
        return packages.filter((item) =>
          (!filter.name || item.name === filter.name) &&
          (!filter.path || item.path === filter.path)
        );
      },
    },
  };

  const activation = await activateGlobalExtension({ editor, globalPackagePath });

  assert.equal(activation.scanned, true);
  assert.equal(activation.registered, true);
  assert.equal(activation.enabled, false);
  assert.equal(activation.activePath, projectPackagePath);
  assert.equal(activation.shadowedBy, projectPackagePath);
  assert.deepEqual(calls, [['extension', 'scanning', 'global']]);
});

test('global install state detects updates and duplicate project copies', () => {
  const temp = makeTempDir();
  try {
    const homePath = path.join(temp, 'home');
    const projectPath = path.join(temp, 'project');
    const projectPackagePath = path.join(projectPath, 'extensions', 'funplay-cocos-mcp');
    const globalPackagePath = path.join(
      getGlobalExtensionsDirectory({ homePath }),
      'funplay-cocos-mcp'
    );
    createExtensionPackage(projectPackagePath, '0.4.6');
    createExtensionPackage(globalPackagePath, '0.4.5');

    const state = getGlobalInstallationState({
      homePath,
      projectPath,
      packagePath: projectPackagePath,
      currentVersion: '0.4.6',
      availableVersion: '0.4.6',
    });

    assert.equal(state.globalInstalled, true);
    assert.equal(state.globalVersion, '0.4.5');
    assert.equal(state.duplicateInstall, true);
    assert.equal(state.action, 'update');
    assert.equal(state.canInstallGlobally, true);
    assert.equal(state.automaticForNewProjects, true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('an active global install can still be updated', () => {
  const temp = makeTempDir();
  try {
    const homePath = path.join(temp, 'home');
    const projectPath = path.join(temp, 'project');
    const globalPackagePath = path.join(
      getGlobalExtensionsDirectory({ homePath }),
      'funplay-cocos-mcp'
    );
    createExtensionPackage(globalPackagePath, '0.4.5');

    const state = getGlobalInstallationState({
      homePath,
      projectPath,
      packagePath: globalPackagePath,
      currentVersion: '0.4.5',
      availableVersion: '0.4.6',
    });

    assert.equal(state.scope, 'global');
    assert.equal(state.action, 'update');
    assert.equal(state.canInstallGlobally, true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('an equal global version is reused without invoking the installer', async () => {
  const temp = makeTempDir();
  try {
    const homePath = path.join(temp, 'home');
    const projectPath = path.join(temp, 'project');
    const projectPackagePath = path.join(projectPath, 'extensions', 'funplay-cocos-mcp');
    const globalPackagePath = path.join(
      getGlobalExtensionsDirectory({ homePath }),
      'funplay-cocos-mcp'
    );
    createExtensionPackage(projectPackagePath, '0.4.6');
    createExtensionPackage(globalPackagePath, '0.4.6');

    const result = await installGlobalExtension({
      homePath,
      projectPath,
      packagePath: projectPackagePath,
      currentVersion: '0.4.6',
      releaseInfo: { latestVersion: '0.4.6' },
      installer() {
        throw new Error('installer should not be called');
      },
    });

    assert.equal(result.installed, false);
    assert.equal(result.alreadyInstalled, true);
    assert.equal(result.installedVersion, '0.4.6');
    assert.equal(result.restartRequired, false);
    assert.equal(result.automaticForNewProjects, true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('a newer global version is not downgraded', async () => {
  const temp = makeTempDir();
  try {
    const homePath = path.join(temp, 'home');
    const editorHomePath = path.join(homePath, '.CocosCreator');
    const projectPath = path.join(temp, 'project');
    const projectPackagePath = path.join(projectPath, 'extensions', 'funplay-cocos-mcp');
    const globalPackagePath = path.join(
      getGlobalExtensionsDirectory({ homePath }),
      'funplay-cocos-mcp'
    );
    createExtensionPackage(projectPackagePath, '0.4.6');
    createExtensionPackage(globalPackagePath, '0.5.0');

    await assert.rejects(
      installGlobalExtension({
        homePath,
        projectPath,
        packagePath: projectPackagePath,
        currentVersion: '0.4.6',
        releaseInfo: { latestVersion: '0.4.6' },
      }),
      /Refusing to replace newer global version 0\.5\.0 with 0\.4\.6/
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('an invalid package occupying the global path blocks installation', () => {
  const temp = makeTempDir();
  try {
    const homePath = path.join(temp, 'home');
    const projectPath = path.join(temp, 'project');
    const packagePath = path.join(projectPath, 'extensions', 'funplay-cocos-mcp');
    const globalPackagePath = path.join(
      getGlobalExtensionsDirectory({ homePath }),
      'funplay-cocos-mcp'
    );
    createExtensionPackage(packagePath, '0.4.6');
    fs.mkdirSync(globalPackagePath, { recursive: true });
    fs.writeFileSync(path.join(globalPackagePath, 'keep.txt'), 'do not replace\n', 'utf8');

    const state = getGlobalInstallationState({
      homePath,
      projectPath,
      packagePath,
      currentVersion: '0.4.6',
    });

    assert.equal(state.globalPathExists, true);
    assert.equal(state.globalInstalled, false);
    assert.equal(state.action, 'blocked');
    assert.equal(state.canInstallGlobally, false);
    assert.match(state.globalInstallError, /package\.json is missing/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('a dangling symlink at the global path is treated as occupied', async (context) => {
  const temp = makeTempDir();
  try {
    const homePath = path.join(temp, 'home');
    const projectPath = path.join(temp, 'project');
    const packagePath = path.join(projectPath, 'extensions', 'funplay-cocos-mcp');
    const globalPackagePath = path.join(
      getGlobalExtensionsDirectory({ homePath }),
      'funplay-cocos-mcp'
    );
    createExtensionPackage(packagePath, '0.4.6');
    fs.mkdirSync(path.dirname(globalPackagePath), { recursive: true });
    try {
      fs.symlinkSync(path.join(temp, 'missing-target'), globalPackagePath, 'dir');
    } catch (error) {
      context.skip(`symlink creation unavailable: ${error.code || error.message}`);
      return;
    }

    const options = {
      homePath,
      projectPath,
      packagePath,
      currentVersion: '0.4.6',
      releaseInfo: { latestVersion: '0.4.6' },
    };
    const state = getGlobalInstallationState(options);

    assert.equal(state.globalPathExists, true);
    assert.equal(state.globalInstalled, false);
    assert.equal(state.action, 'blocked');
    await assert.rejects(
      installGlobalExtension(options),
      /Global extension path is occupied by an invalid package/
    );
    assert.equal(fs.lstatSync(globalPackagePath).isSymbolicLink(), true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('installGlobalExtension verifies and installs a release into a new global path', {
  skip: hasCommand('zip') ? false : 'zip command unavailable',
}, async () => {
  const temp = makeTempDir();
  let server = null;
  try {
    const homePath = path.join(temp, 'home');
    const editorHomePath = path.join(homePath, '.CocosCreator');
    const projectPath = path.join(temp, 'project');
    const projectPackagePath = path.join(projectPath, 'extensions', 'funplay-cocos-mcp');
    createExtensionPackage(projectPackagePath, '0.4.5');

    const releaseRoot = path.join(temp, 'release-source');
    const releasePackagePath = path.join(releaseRoot, 'funplay-cocos-mcp');
    const zipName = 'Funplay.CocosMcp.v0.4.6.zip';
    const zipPath = path.join(temp, zipName);
    const sumsPath = path.join(temp, 'SHA256SUMS.txt');
    createExtensionPackage(releasePackagePath, '0.4.6');
    createZip(releaseRoot, zipPath);
    fs.writeFileSync(sumsPath, `${sha256File(zipPath)}  ${zipName}\n`, 'utf8');

    server = await serveFiles({
      [zipName]: zipPath,
      'SHA256SUMS.txt': sumsPath,
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const result = await installGlobalExtension({
      homePath,
      editorHomePath,
      editorVersion: '3.8.8',
      projectPath,
      packagePath: projectPackagePath,
      currentVersion: '0.4.5',
      availableVersion: '0.4.6',
      releaseInfo: {
        latestVersion: '0.4.6',
        assets: [
          { name: zipName, browserDownloadUrl: `${baseUrl}/${zipName}` },
          { name: 'SHA256SUMS.txt', browserDownloadUrl: `${baseUrl}/SHA256SUMS.txt` },
        ],
      },
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(result.globalPackagePath, 'package.json'), 'utf8')
    );
    assert.equal(result.installed, true);
    assert.equal(result.installedVersion, '0.4.6');
    assert.equal(result.checksumVerified, true);
    assert.equal(result.backupDir, '');
    assert.equal(result.restartRequired, true);
    assert.equal(result.automaticForNewProjects, true);
    assert.equal(result.duplicateInstall, true);
    assert.equal(
      result.globalPackagePath,
      path.join(editorHomePath, 'builtin-extensions', '3.8.8', 'funplay-cocos-mcp')
    );
    assert.equal(manifest.version, '0.4.6');
    assert.equal(fs.existsSync(path.join(result.globalPackagePath, 'lib', 'marker.js')), true);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

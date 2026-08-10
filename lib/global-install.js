'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { compareVersions, normalizeVersion } = require('./update-checker');
const { installLatestUpdate } = require('./updater');

const PACKAGE_NAME = 'funplay-cocos-mcp';

function normalizePathForComparison(value) {
  const resolved = path.resolve(String(value || ''));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function realPathOrResolved(value) {
  const resolved = path.resolve(String(value || ''));
  try {
    const realPath = fs.realpathSync.native
      ? fs.realpathSync.native(resolved)
      : fs.realpathSync(resolved);
    return normalizePathForComparison(realPath);
  } catch (error) {
    return normalizePathForComparison(resolved);
  }
}

function isSameLocation(left, right) {
  if (!left || !right) {
    return false;
  }
  return realPathOrResolved(left) === realPathOrResolved(right);
}

function getGlobalExtensionsDirectory(options = {}) {
  const editorHomePath = String(options.editorHomePath || '').trim();
  const editorVersion = String(options.editorVersion || '').trim().replace(/^v/i, '');
  if (editorHomePath && editorVersion) {
    return path.resolve(editorHomePath, 'builtin-extensions', editorVersion);
  }

  const homePath = String(options.homePath || os.homedir() || '').trim();
  if (!homePath) {
    throw new Error('Unable to resolve the current user home directory for the Cocos global extension install.');
  }
  return path.resolve(homePath, '.CocosCreator', 'extensions');
}

function readPackageInstallation(packagePath) {
  const resolvedPath = path.resolve(String(packagePath || ''));
  let stat;
  try {
    stat = fs.lstatSync(resolvedPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        path: resolvedPath,
        realPath: realPathOrResolved(resolvedPath),
        exists: false,
        valid: false,
        name: '',
        version: '',
        isSymlink: false,
        error: '',
      };
    }
    return {
      path: resolvedPath,
      realPath: realPathOrResolved(resolvedPath),
      exists: true,
      valid: false,
      name: '',
      version: '',
      isSymlink: false,
      error: error.message,
    };
  }

  const installation = {
    path: resolvedPath,
    realPath: realPathOrResolved(resolvedPath),
    exists: true,
    valid: false,
    name: '',
    version: '',
    isSymlink: stat.isSymbolicLink(),
    error: '',
  };

  if (!stat.isDirectory() && !stat.isSymbolicLink()) {
    installation.error = 'The extension path exists but is not a directory.';
    return installation;
  }

  const manifestPath = path.join(resolvedPath, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    installation.error = 'package.json is missing.';
    return installation;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    installation.name = String(manifest.name || '');
    installation.version = normalizeVersion(manifest.version || '');
    installation.valid = installation.name === PACKAGE_NAME && Boolean(installation.version);
    if (!installation.valid) {
      installation.error = installation.name !== PACKAGE_NAME
        ? `Unexpected extension package name: ${installation.name || 'unknown'}.`
        : 'The extension package version is missing.';
    }
  } catch (error) {
    installation.error = `Failed to read package.json: ${error.message}`;
  }

  return installation;
}

function getGlobalInstallationState(options = {}) {
  const currentPackagePath = path.resolve(options.packagePath || path.join(__dirname, '..'));
  const projectPath = path.resolve(options.projectPath || process.cwd());
  const globalExtensionsPath = path.resolve(
    options.globalExtensionsPath || getGlobalExtensionsDirectory(options)
  );
  const globalPackagePath = path.join(globalExtensionsPath, PACKAGE_NAME);
  const projectPackagePath = path.join(projectPath, 'extensions', PACKAGE_NAME);
  const current = readPackageInstallation(currentPackagePath);
  const global = readPackageInstallation(globalPackagePath);
  const project = readPackageInstallation(projectPackagePath);
  const currentVersion = normalizeVersion(options.currentVersion || current.version || '');
  const targetVersion = normalizeVersion(options.availableVersion || currentVersion);

  let scope = 'external';
  if (isSameLocation(currentPackagePath, globalPackagePath)) {
    scope = 'global';
  } else if (isSameLocation(currentPackagePath, projectPackagePath)) {
    scope = 'project';
  }

  const globalInvalid = global.exists && !global.valid;
  const duplicateInstall = Boolean(
    global.valid &&
    project.valid &&
    !isSameLocation(globalPackagePath, projectPackagePath)
  );

  let action = 'installed';
  if (globalInvalid) {
    action = 'blocked';
  } else if (!global.valid) {
    action = 'install';
  } else if (targetVersion && compareVersions(targetVersion, global.version) > 0) {
    action = 'update';
  } else if (scope === 'global') {
    action = 'active';
  }

  return {
    packageName: PACKAGE_NAME,
    editorVersion: String(options.editorVersion || '').trim().replace(/^v/i, ''),
    scope,
    currentPackagePath,
    currentVersion,
    targetVersion,
    globalExtensionsPath,
    globalPackagePath,
    globalPathExists: global.exists,
    globalInstalled: global.valid,
    globalVersion: global.version,
    globalInstallError: globalInvalid ? global.error : '',
    projectPackagePath,
    projectInstalled: project.valid,
    projectVersion: project.version,
    duplicateInstall,
    action,
    canInstallGlobally: action === 'install' || action === 'update',
    automaticForNewProjects: global.valid,
  };
}

function getMatchingEditorPackages(editor, filter = {}) {
  if (!editor || !editor.Package || typeof editor.Package.getPackages !== 'function') {
    return [];
  }

  try {
    const packages = editor.Package.getPackages(filter);
    return Array.isArray(packages) ? packages : [];
  } catch (error) {
    return [];
  }
}

function findEditorPackageByPath(editor, packagePath) {
  const resolvedPath = path.resolve(String(packagePath || ''));
  return getMatchingEditorPackages(editor, { path: resolvedPath })
    .find((item) => item && isSameLocation(item.path, resolvedPath)) || null;
}

async function activateGlobalExtension(options = {}) {
  const editor = options.editor;
  const globalPackagePath = path.resolve(String(options.globalPackagePath || ''));
  const result = {
    available: Boolean(editor && editor.Package),
    scanned: false,
    registered: false,
    enabled: false,
    activePath: '',
    shadowedBy: '',
    errors: [],
  };

  if (!result.available) {
    result.errors.push('Cocos package APIs are unavailable; reopen the project to activate the global extension.');
    return result;
  }

  if (editor.Message && typeof editor.Message.request === 'function') {
    try {
      await editor.Message.request('extension', 'scanning', 'global');
      result.scanned = true;
    } catch (error) {
      result.errors.push(`Cocos global extension scan failed: ${error.message}`);
    }
  }

  let packageInfo = findEditorPackageByPath(editor, globalPackagePath);
  if (!packageInfo && typeof editor.Package.register === 'function') {
    try {
      await editor.Package.register(globalPackagePath);
      packageInfo = findEditorPackageByPath(editor, globalPackagePath);
    } catch (error) {
      result.errors.push(`Cocos extension registration failed: ${error.message}`);
    }
  }
  result.registered = Boolean(packageInfo);

  const activePackageBeforeEnable = getMatchingEditorPackages(editor, { name: PACKAGE_NAME })
    .find((item) => item && item.enable);
  if (
    activePackageBeforeEnable &&
    activePackageBeforeEnable.path &&
    !isSameLocation(activePackageBeforeEnable.path, globalPackagePath)
  ) {
    result.activePath = path.resolve(activePackageBeforeEnable.path);
    result.shadowedBy = result.activePath;
    return result;
  }

  if (result.registered) {
    try {
      if (editor.Message && typeof editor.Message.request === 'function') {
        await editor.Message.request(
          'extension',
          'enable',
          globalPackagePath,
          true,
          { addNotification: false, showInExtensionManager: false }
        );
      } else if (typeof editor.Package.enable === 'function') {
        await editor.Package.enable(globalPackagePath);
      }
    } catch (error) {
      result.errors.push(`Cocos extension enable failed: ${error.message}`);
    }
  }

  packageInfo = findEditorPackageByPath(editor, globalPackagePath);
  result.registered = Boolean(packageInfo);
  result.enabled = Boolean(packageInfo && packageInfo.enable);

  const activePackage = getMatchingEditorPackages(editor, { name: PACKAGE_NAME })
    .find((item) => item && item.enable);
  if (activePackage && activePackage.path) {
    result.activePath = path.resolve(activePackage.path);
    if (!isSameLocation(activePackage.path, globalPackagePath)) {
      result.shadowedBy = result.activePath;
    }
  }

  return result;
}

async function installGlobalExtension(options = {}) {
  const state = getGlobalInstallationState(options);
  if (state.globalPathExists && !state.globalInstalled) {
    throw new Error(
      `Global extension path is occupied by an invalid package: ${state.globalPackagePath}. ` +
      `${state.globalInstallError || 'Remove or rename it before installing.'}`
    );
  }

  const releaseInfo = options.releaseInfo || {};
  const latestVersion = normalizeVersion(releaseInfo.latestVersion || releaseInfo.tagName || '');
  if (!latestVersion) {
    throw new Error('Latest release version is unknown.');
  }

  if (state.globalInstalled) {
    const comparison = compareVersions(latestVersion, state.globalVersion);
    if (comparison < 0 && !options.allowDowngrade) {
      throw new Error(
        `Refusing to replace newer global version ${state.globalVersion} with ${latestVersion}.`
      );
    }
    if (comparison === 0 && !options.force) {
      return {
        ok: true,
        installed: false,
        alreadyInstalled: true,
        installedVersion: state.globalVersion,
        packagePath: state.globalPackagePath,
        globalPackagePath: state.globalPackagePath,
        restartRequired: false,
        duplicateInstall: state.duplicateInstall,
        projectPackagePath: state.projectPackagePath,
        automaticForNewProjects: true,
      };
    }
  }

  const installer = options.installer || installLatestUpdate;
  const result = await installer({
    releaseInfo,
    currentVersion: state.globalVersion || '0.0.0',
    packagePath: state.globalPackagePath,
    timeoutMs: options.timeoutMs,
    maxDownloadBytes: options.maxDownloadBytes,
    log: options.log,
    force: Boolean(options.force || options.allowDowngrade),
  });
  const after = getGlobalInstallationState(options);

  return {
    ...result,
    globalPackagePath: after.globalPackagePath,
    restartRequired: true,
    duplicateInstall: after.duplicateInstall,
    projectPackagePath: after.projectPackagePath,
    automaticForNewProjects: after.automaticForNewProjects,
  };
}

module.exports = {
  PACKAGE_NAME,
  activateGlobalExtension,
  getGlobalExtensionsDirectory,
  getGlobalInstallationState,
  installGlobalExtension,
  isSameLocation,
  readPackageInstallation,
};

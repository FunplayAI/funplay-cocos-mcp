'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { compareVersions, normalizeVersion, selectReleaseAssets } = require('./update-checker');

const PACKAGE_NAME = 'funplay-cocos-mcp';
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_ZIP_ENTRIES = 5000;

function logMessage(log, level, message, details) {
  if (typeof log === 'function') {
    log(level, message, details);
  }
}

function normalizeAsset(asset) {
  if (!asset) {
    return null;
  }
  return {
    name: String(asset.name || ''),
    browserDownloadUrl: String(asset.browserDownloadUrl || asset.browser_download_url || ''),
    size: Number(asset.size || 0),
    contentType: String(asset.contentType || asset.content_type || ''),
  };
}

function parseChecksum(text, fileName) {
  const target = path.basename(String(fileName || ''));
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64})\s+[* ]?(.+?)\s*$/.exec(line.trim());
    if (!match) {
      continue;
    }
    const candidate = path.basename(match[2].trim());
    if (candidate === target) {
      return match[1].toLowerCase();
    }
  }
  return '';
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertInside(parent, target) {
  const resolvedParent = path.resolve(parent);
  const resolvedTarget = path.resolve(target);
  const prefix = resolvedParent.endsWith(path.sep) ? resolvedParent : `${resolvedParent}${path.sep}`;
  if (resolvedTarget !== resolvedParent && !resolvedTarget.startsWith(prefix)) {
    throw new Error(`Unsafe archive path escaped destination: ${target}`);
  }
  return resolvedTarget;
}

function normalizeArchivePath(value) {
  const raw = String(value || '').replace(/\\/g, '/');
  if (!raw || raw.includes('\0') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    throw new Error(`Unsafe archive path: ${raw}`);
  }
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Unsafe archive path: ${raw}`);
  }
  return normalized;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error('Invalid zip file: end of central directory was not found.');
}

function extractZip(zipPath, destination, options = {}) {
  const buffer = fs.readFileSync(zipPath);
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
  const maxEntries = options.maxEntries || DEFAULT_MAX_ZIP_ENTRIES;
  const maxFileBytes = options.maxFileBytes || DEFAULT_MAX_FILE_BYTES;
  const maxUncompressedBytes = options.maxUncompressedBytes || DEFAULT_MAX_UNCOMPRESSED_BYTES;

  if (entryCount > maxEntries) {
    throw new Error(`Zip has too many entries: ${entryCount}`);
  }

  fs.mkdirSync(destination, { recursive: true });
  let offset = centralDirectoryOffset;
  let totalUncompressed = 0;
  const extracted = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid zip central directory entry at offset ${offset}.`);
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const rawName = buffer.slice(offset + 46, offset + 46 + nameLength).toString('utf8');
    offset += 46 + nameLength + extraLength + commentLength;

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error('Zip64 archives are not supported by the built-in updater.');
    }

    const archivePath = normalizeArchivePath(rawName);
    if (archivePath.endsWith('/')) {
      fs.mkdirSync(assertInside(destination, path.join(destination, archivePath)), { recursive: true });
      continue;
    }

    if (uncompressedSize > maxFileBytes) {
      throw new Error(`Zip entry is too large: ${archivePath}`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > maxUncompressedBytes) {
      throw new Error('Zip archive expands beyond the safe size limit.');
    }

    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid zip local header for ${archivePath}.`);
    }

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataOffset, dataOffset + compressedSize);
    let content;

    if (method === 0) {
      content = compressed;
    } else if (method === 8) {
      content = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported zip compression method ${method} for ${archivePath}.`);
    }

    if (content.length !== uncompressedSize) {
      throw new Error(`Zip entry size mismatch for ${archivePath}.`);
    }

    const targetPath = assertInside(destination, path.join(destination, archivePath));
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content);
    extracted.push(targetPath);
  }

  return {
    entries: entryCount,
    files: extracted.length,
    totalUncompressedBytes: totalUncompressed,
  };
}

function requestUrl(url, options = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? http : https;
    const request = client.get(
      parsed,
      {
        headers: {
          'User-Agent': 'funplay-cocos-mcp-updater',
          Accept: '*/*',
        },
        timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      },
      (response) => {
        const status = response.statusCode || 0;
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          response.resume();
          if (redirectCount >= MAX_REDIRECTS) {
            reject(new Error(`Too many redirects while downloading ${url}`));
            return;
          }
          const redirected = new URL(location, parsed).toString();
          requestUrl(redirected, options, redirectCount + 1).then(resolve, reject);
          return;
        }

        if (status < 200 || status >= 300) {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8').slice(0, 200);
            reject(new Error(`Download failed with HTTP ${status}: ${body}`));
          });
          return;
        }

        resolve(response);
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error(`Download timed out after ${options.timeoutMs || DEFAULT_TIMEOUT_MS}ms.`));
    });
    request.on('error', reject);
  });
}

async function downloadFile(url, destination, options = {}) {
  const response = await requestUrl(url, options);
  const maxBytes = options.maxBytes || DEFAULT_MAX_DOWNLOAD_BYTES;

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destination);
    let total = 0;
    response.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        response.destroy(new Error(`Download exceeded ${maxBytes} bytes.`));
      }
    });
    response.on('error', reject);
    output.on('error', reject);
    output.on('finish', resolve);
    response.pipe(output);
  });

  return {
    path: destination,
    sizeBytes: fs.statSync(destination).size,
  };
}

async function downloadText(url, options = {}) {
  const response = await requestUrl(url, options);
  const maxBytes = options.maxBytes || 1024 * 1024;

  return await new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    response.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        response.destroy(new Error(`Download exceeded ${maxBytes} bytes.`));
        return;
      }
      chunks.push(chunk);
    });
    response.on('error', reject);
    response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function findPackageDirectory(root) {
  const direct = path.join(root, PACKAGE_NAME);
  if (isExpectedPackageDirectory(direct)) {
    return direct;
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = path.join(root, entry.name);
    if (isExpectedPackageDirectory(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Release archive does not contain a ${PACKAGE_NAME} package directory.`);
}

function isExpectedPackageDirectory(directory) {
  const packagePath = path.join(directory, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return false;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return pkg.name === PACKAGE_NAME;
  } catch (error) {
    return false;
  }
}

function validatePackageDirectory(directory, expectedVersion) {
  const packagePath = path.join(directory, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const version = normalizeVersion(pkg.version);
  if (pkg.name !== PACKAGE_NAME) {
    throw new Error(`Update package name mismatch: ${pkg.name}`);
  }
  if (expectedVersion && version !== normalizeVersion(expectedVersion)) {
    throw new Error(`Update package version ${version} does not match release ${expectedVersion}.`);
  }
  if (!pkg.main || !fs.existsSync(path.join(directory, pkg.main))) {
    throw new Error('Update package main file is missing.');
  }
  return {
    name: pkg.name,
    version,
    packageVersion: pkg.package_version || pkg.packageVersion || 0,
  };
}

function hasGitMetadata(directory) {
  return fs.existsSync(path.join(directory, '.git'));
}

function assertInstallablePackagePath(packagePath, options = {}) {
  const stat = fs.lstatSync(packagePath);
  if (stat.isSymbolicLink() && !options.allowSymlinkInstall) {
    throw new Error('One-click update is disabled for symlink installs. Use git pull, Cocos Store, or replace the extension manually.');
  }
  if (hasGitMetadata(packagePath) && !options.allowGitWorktreeInstall) {
    throw new Error('One-click update is disabled inside a git worktree. Use git pull or install the release package manually.');
  }
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function copyDirectoryContents(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source)) {
    fs.cpSync(path.join(source, entry), path.join(destination, entry), {
      recursive: true,
      force: true,
    });
  }
}

function cleanDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  for (const entry of fs.readdirSync(directory)) {
    fs.rmSync(path.join(directory, entry), { recursive: true, force: true });
  }
}

function restoreBackup(backupDir, packagePath) {
  cleanDirectory(packagePath);
  copyDirectoryContents(backupDir, packagePath);
}

async function installLatestUpdate(options = {}) {
  const releaseInfo = options.releaseInfo || {};
  const currentVersion = normalizeVersion(options.currentVersion || releaseInfo.currentVersion || '0.0.0');
  const latestVersion = normalizeVersion(releaseInfo.latestVersion || releaseInfo.tagName || '');
  const packagePath = path.resolve(options.packagePath || path.join(__dirname, '..'));
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const log = options.log;

  if (!latestVersion) {
    throw new Error('Latest release version is unknown.');
  }
  if (!options.force && compareVersions(latestVersion, currentVersion) <= 0) {
    throw new Error(`Already up to date: ${currentVersion}.`);
  }

  assertInstallablePackagePath(packagePath, options);

  const selected = selectReleaseAssets(latestVersion, releaseInfo.assets || []);
  const extensionAsset = normalizeAsset(releaseInfo.extensionAsset) || selected.extensionAsset;
  const checksumAsset = normalizeAsset(releaseInfo.checksumAsset) || selected.checksumAsset;
  if (!extensionAsset || !extensionAsset.browserDownloadUrl) {
    throw new Error('Latest release does not include a downloadable extension zip.');
  }
  if (!checksumAsset || !checksumAsset.browserDownloadUrl) {
    throw new Error('Latest release does not include SHA256SUMS.txt, so one-click update was refused.');
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-mcp-update-'));
  const downloadDir = path.join(tempRoot, 'downloads');
  const extractDir = path.join(tempRoot, 'extract');
  fs.mkdirSync(downloadDir, { recursive: true });
  fs.mkdirSync(extractDir, { recursive: true });
  const zipPath = path.join(downloadDir, path.basename(extensionAsset.name));
  const checksumPath = path.join(downloadDir, 'SHA256SUMS.txt');
  let backupDir = '';

  try {
    logMessage(log, 'info', `Downloading update package ${extensionAsset.name}...`);
    await downloadFile(extensionAsset.browserDownloadUrl, zipPath, {
      timeoutMs,
      maxBytes: options.maxDownloadBytes || DEFAULT_MAX_DOWNLOAD_BYTES,
    });
    await downloadFile(checksumAsset.browserDownloadUrl, checksumPath, {
      timeoutMs,
      maxBytes: 1024 * 1024,
    });

    const expectedSha256 = parseChecksum(fs.readFileSync(checksumPath, 'utf8'), extensionAsset.name);
    if (!expectedSha256) {
      throw new Error(`SHA256SUMS.txt does not contain a checksum for ${extensionAsset.name}.`);
    }
    const actualSha256 = sha256File(zipPath);
    if (actualSha256 !== expectedSha256) {
      throw new Error(`Checksum mismatch for ${extensionAsset.name}.`);
    }

    logMessage(log, 'info', `Checksum verified for ${extensionAsset.name}.`);
    const extraction = extractZip(zipPath, extractDir, options);
    const extractedPackage = findPackageDirectory(extractDir);
    const packageInfo = validatePackageDirectory(extractedPackage, latestVersion);

    const backupRoot = path.join(path.dirname(packagePath), '.funplay-cocos-mcp-backups');
    backupDir = path.join(backupRoot, `${path.basename(packagePath)}-${timestampForPath()}`);
    fs.mkdirSync(backupRoot, { recursive: true });
    copyDirectoryContents(packagePath, backupDir);

    logMessage(log, 'info', `Replacing extension package. Backup: ${backupDir}`);
    try {
      cleanDirectory(packagePath);
      copyDirectoryContents(extractedPackage, packagePath);
    } catch (error) {
      restoreBackup(backupDir, packagePath);
      throw error;
    }

    return {
      ok: true,
      installed: true,
      currentVersion,
      installedVersion: packageInfo.version,
      backupDir,
      packagePath,
      zipName: extensionAsset.name,
      zipSha256: actualSha256,
      checksumVerified: true,
      extraction,
    };
  } finally {
    if (!options.keepTemp) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

module.exports = {
  downloadFile,
  downloadText,
  extractZip,
  installLatestUpdate,
  parseChecksum,
  sha256File,
  validatePackageDirectory,
};

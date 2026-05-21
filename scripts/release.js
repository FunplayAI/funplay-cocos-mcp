#!/usr/bin/env node
'use strict';

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_DIR_NAME = 'funplay-cocos-mcp';
const RELEASES_DIR = path.join(ROOT, 'releases');
const TEMP_DIR = path.join(ROOT, '.release-tmp');
const ZIP_PREFIX = 'Funplay.CocosMcp';
const REPOSITORY_URL = 'https://github.com/FunplayAI/funplay-cocos-mcp';

const REQUIRED_REPO_FILES = [
  'package.json',
  'README.md',
  'README_CN.md',
  'docs/TOOLS.md',
  'RELEASE_WORKFLOW.md',
  'RELEASE_CHECKLIST.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'server.json',
  'bin/funplay-cocos-mcp.js',
  'browser.js',
  'scene.js',
  'panel/index.js',
  'lib/server.js',
  'lib/tool-registry.js'
];

const PACKAGE_INCLUDES = [
  'package.json',
  'README.md',
  'README_CN.md',
  'docs',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'server.json',
  'bin',
  'browser.js',
  'scene.js',
  'panel',
  'lib'
];

const FORBIDDEN_TRACKED_SEGMENTS = new Set([
  '.idea',
  'node_modules',
  'Library',
  'library',
  'Temp',
  'temp',
  'dist',
  'build',
  'coverage',
  'releases',
  '.release-tmp'
]);

const FORBIDDEN_ARCHIVE_SEGMENTS = new Set([
  '.git',
  '.github',
  '.idea',
  'node_modules',
  'Library',
  'library',
  'Temp',
  'temp',
  'dist',
  'build',
  'coverage',
  'releases',
  '.release-tmp',
  'scripts',
  'test'
]);

const FORBIDDEN_NAMES = new Set([
  '.DS_Store'
]);

function main() {
  const command = process.argv[2] || 'check';
  const options = parseOptions(process.argv.slice(3));

  if (command === 'check') {
    const context = checkRelease(options);
    console.log(`Release check passed for v${context.version}.`);
    return;
  }

  if (command === 'package') {
    const context = checkRelease(options);
    const artifacts = packageRelease(context);
    console.log(`Release package ready: ${path.relative(ROOT, artifacts.releaseDir)}`);
    console.log(`- ${artifacts.zipName}`);
    console.log('- release-manifest.json');
    console.log('- SHA256SUMS.txt');
    console.log('- README.md');
    return;
  }

  printUsage();
  process.exitCode = 2;
}

function parseOptions(args) {
  const options = {
    version: '',
    strictTag: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--version' && args[i + 1]) {
      options.version = args[i + 1];
      i += 1;
    } else if (arg === '--strict-tag') {
      options.strictTag = true;
    } else {
      throw new Error(`Unknown release option: ${arg}`);
    }
  }

  return options;
}

function checkRelease(options = {}) {
  const errors = [];
  const packageJson = readJson(path.join(ROOT, 'package.json'), errors);
  const version = options.version || (packageJson && packageJson.version) || '';
  const tag = `v${version}`;

  if (!packageJson) {
    throwErrors(errors);
  }

  if (options.version && options.version !== packageJson.version) {
    errors.push(`--version ${options.version} does not match package.json version ${packageJson.version}.`);
  }

  if (packageJson.name !== 'funplay-cocos-mcp') {
    errors.push('package.json name must be funplay-cocos-mcp.');
  }

  if (!Number.isInteger(packageJson.package_version) || packageJson.package_version <= 0) {
    errors.push('package.json package_version must be a positive integer.');
  }

  if (!packageJson.main || !fs.existsSync(path.join(ROOT, packageJson.main))) {
    errors.push('package.json main must point to an existing file.');
  }

  if (!packageJson.bin || packageJson.bin['funplay-cocos-mcp'] !== 'bin/funplay-cocos-mcp.js') {
    errors.push('package.json bin.funplay-cocos-mcp must point to bin/funplay-cocos-mcp.js.');
  }

  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    errors.push(`package.json version must be semver-like, got: ${version}`);
  }

  const serverJson = readJson(path.join(ROOT, 'server.json'), errors);
  if (serverJson) {
    if (serverJson.name !== packageJson.mcpName) {
      errors.push('server.json name must match package.json mcpName.');
    }
    if (serverJson.version !== version) {
      errors.push(`server.json version ${serverJson.version} must match package.json version ${version}.`);
    }
    const npmPackage = Array.isArray(serverJson.packages)
      ? serverJson.packages.find((entry) => entry && entry.registryType === 'npm')
      : null;
    if (!npmPackage) {
      errors.push('server.json must include an npm package entry.');
    } else {
      if (npmPackage.identifier !== packageJson.name) {
        errors.push(`server.json npm identifier ${npmPackage.identifier} must match package.json name ${packageJson.name}.`);
      }
      if (npmPackage.version !== version) {
        errors.push(`server.json npm package version ${npmPackage.version} must match package.json version ${version}.`);
      }
      if (!npmPackage.transport || npmPackage.transport.type !== 'stdio') {
        errors.push('server.json npm package transport must be stdio.');
      }
    }
  }

  for (const relative of REQUIRED_REPO_FILES) {
    if (!fs.existsSync(path.join(ROOT, relative))) {
      errors.push(`Missing required repository file: ${relative}`);
    }
  }

  const changelogPath = path.join(ROOT, 'CHANGELOG.md');
  const changelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
  if (version && !new RegExp(`^## \\[${escapeRegExp(version)}\\] - \\d{4}-\\d{2}-\\d{2}`, 'm').test(changelog)) {
    errors.push(`CHANGELOG.md is missing a dated ## [${version}] release section.`);
  }

  const trackedFiles = gitLines(['ls-files']);
  const forbiddenTracked = trackedFiles.filter(isForbiddenTrackedPath);
  if (forbiddenTracked.length > 0) {
    errors.push(`Tracked local/build junk must not be committed:\n- ${forbiddenTracked.join('\n- ')}`);
  }

  for (const relative of PACKAGE_INCLUDES) {
    const fullPath = path.join(ROOT, relative);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Package include path is missing: ${relative}`);
    }
  }

  if (options.strictTag && !gitTagExists(tag)) {
    errors.push(`Git tag ${tag} does not exist. Create it before publishing.`);
  }

  throwErrors(errors);

  return {
    packageJson,
    version,
    tag,
    changelogNotes: extractChangelogNotes(changelog, version),
    gitCommit: gitText(['rev-parse', 'HEAD']).trim(),
    gitDirty: gitText(['status', '--porcelain']).trim() !== ''
  };
}

function packageRelease(context) {
  ensureCommand('zip');

  const releaseDir = path.join(RELEASES_DIR, context.version);
  const stagingRoot = path.join(TEMP_DIR, PACKAGE_DIR_NAME);
  const zipName = `${ZIP_PREFIX}.v${context.version}.zip`;
  const zipPath = path.join(releaseDir, zipName);

  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.mkdirSync(stagingRoot, { recursive: true });

  for (const relative of PACKAGE_INCLUDES) {
    copyIntoPackage(relative, stagingRoot);
  }

  const stagedFiles = collectFiles(stagingRoot)
    .map((filePath) => path.relative(TEMP_DIR, filePath).split(path.sep).join('/'));
  validateArchivePaths(stagedFiles);

  run('zip', ['-qr', zipPath, PACKAGE_DIR_NAME], { cwd: TEMP_DIR });
  validateZipListing(zipPath);

  const zipSha256 = sha256File(zipPath);
  const zipSize = fs.statSync(zipPath).size;
  const manifest = buildManifest(context, {
    zipName,
    zipSha256,
    zipSize,
    fileCount: stagedFiles.length
  });

  const manifestPath = path.join(releaseDir, 'release-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const readmePath = path.join(releaseDir, 'README.md');
  fs.writeFileSync(readmePath, buildReleaseReadme(context, manifest));

  const checksums = [
    checksumLine(zipPath, zipName),
    checksumLine(manifestPath, 'release-manifest.json'),
    checksumLine(readmePath, 'README.md')
  ].join('');
  fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS.txt'), checksums);

  fs.rmSync(TEMP_DIR, { recursive: true, force: true });

  return {
    releaseDir,
    zipName
  };
}

function copyIntoPackage(relative, stagingRoot) {
  const source = path.join(ROOT, relative);
  const destination = path.join(stagingRoot, relative);
  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    filter(sourcePath) {
      const name = path.basename(sourcePath);
      if (FORBIDDEN_NAMES.has(name)) {
        return false;
      }
      const relativeSource = path.relative(ROOT, sourcePath).split(path.sep);
      return !relativeSource.some((part) => FORBIDDEN_ARCHIVE_SEGMENTS.has(part));
    }
  });
}

function buildManifest(context, artifact) {
  return {
    version: context.version,
    generatedAt: new Date().toISOString(),
    repository: {
      url: REPOSITORY_URL,
      source: 'github'
    },
    git: {
      tag: context.tag,
      commit: context.gitCommit,
      dirty: context.gitDirty
    },
    package: {
      name: context.packageJson.name,
      version: context.packageJson.version,
      main: context.packageJson.main,
      packageVersion: context.packageJson.package_version
    },
    artifacts: {
      extensionZip: {
        file: artifact.zipName,
        sha256: artifact.zipSha256,
        sizeBytes: artifact.zipSize,
        fileCount: artifact.fileCount,
        installDirectory: 'extensions/funplay-cocos-mcp',
        githubDownloadUrl: `${REPOSITORY_URL}/releases/download/${context.tag}/${artifact.zipName}`
      }
    },
    notes: firstMeaningfulLine(context.changelogNotes)
  };
}

function buildReleaseReadme(context, manifest) {
  const zip = manifest.artifacts.extensionZip;
  return `# Funplay MCP for Cocos ${context.tag}

This folder contains the generated release artifacts for Funplay MCP for Cocos ${context.tag}.

## Artifacts

- \`${zip.file}\` - Cocos Creator extension package.
- \`release-manifest.json\` - Machine-readable release metadata.
- \`SHA256SUMS.txt\` - SHA-256 checksums for release artifacts.

## Install

1. Unzip \`${zip.file}\`.
2. Move the extracted \`${PACKAGE_DIR_NAME}\` folder into your Cocos project \`extensions/\` directory.
3. Restart Cocos Creator or reload extensions.
4. Open \`Funplay > MCP Server\`.

## Verify

\`\`\`bash
shasum -a 256 -c SHA256SUMS.txt
\`\`\`
`;
}

function validateArchivePaths(paths) {
  const bad = [];
  const prefix = `${PACKAGE_DIR_NAME}/`;

  for (const archivePath of paths) {
    const normalized = archivePath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    if (!normalized.startsWith(prefix)) {
      bad.push(`${archivePath} (must stay under ${PACKAGE_DIR_NAME}/)`);
      continue;
    }
    if (parts.some((part) => part === '..' || part === '.')) {
      bad.push(`${archivePath} (contains unsafe relative path segments)`);
      continue;
    }
    if (parts.some((part) => FORBIDDEN_ARCHIVE_SEGMENTS.has(part) || FORBIDDEN_NAMES.has(part))) {
      bad.push(`${archivePath} (contains forbidden release content)`);
    }
  }

  if (bad.length > 0) {
    throw new Error(`Release archive contains invalid paths:\n- ${bad.join('\n- ')}`);
  }
}

function validateZipListing(zipPath) {
  const result = childProcess.spawnSync('unzip', ['-Z1', zipPath], {
    cwd: ROOT,
    encoding: 'utf8'
  });

  if (result.error && result.error.code === 'ENOENT') {
    console.warn('Warning: unzip is not available; skipped zip listing validation.');
    return;
  }

  if (result.status !== 0) {
    throw new Error(`Failed to inspect ${zipPath}:\n${result.stderr || result.stdout}`);
  }

  const listing = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  validateArchivePaths(listing);
}

function isForbiddenTrackedPath(relative) {
  const parts = relative.split('/');
  return parts.some((part) => FORBIDDEN_TRACKED_SEGMENTS.has(part) || FORBIDDEN_NAMES.has(part));
}

function readJson(filePath, errors) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(ROOT, filePath)} is not valid JSON: ${error.message}`);
    return null;
  }
}

function collectFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractChangelogNotes(changelog, version) {
  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`, 'm');
  const match = heading.exec(changelog);
  if (!match) {
    return '';
  }
  const start = match.index + match[0].length;
  const rest = changelog.slice(start);
  const next = rest.search(/^## /m);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function firstMeaningfulLine(text) {
  const line = text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value && !value.startsWith('###') && !value.startsWith('-'));
  if (line) {
    return line;
  }
  const bullet = text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.startsWith('- '));
  return bullet ? bullet.slice(2) : '';
}

function checksumLine(filePath, displayName) {
  return `${sha256File(filePath)}  ${displayName}\n`;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function ensureCommand(name) {
  const result = childProcess.spawnSync(name, ['-v'], { encoding: 'utf8' });
  if (result.error && result.error.code === 'ENOENT') {
    throw new Error(`Required command not found: ${name}`);
  }
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8'
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function gitLines(args) {
  const text = gitText(args);
  return text ? text.split(/\r?\n/).filter(Boolean) : [];
}

function gitText(args) {
  const result = childProcess.spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8'
  });
  if (result.error || result.status !== 0) {
    return '';
  }
  return result.stdout;
}

function gitTagExists(tag) {
  const result = childProcess.spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  return result.status === 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function throwErrors(errors) {
  if (errors.length > 0) {
    throw new Error(`Release validation failed:\n- ${errors.join('\n- ')}`);
  }
}

function printUsage() {
  console.error(`Usage:
  node scripts/release.js check [--version <version>] [--strict-tag]
  node scripts/release.js package [--version <version>] [--strict-tag]`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

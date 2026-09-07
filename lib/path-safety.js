'use strict';

const path = require('path');
const fs = require('fs');

function normalizeRoot(projectPath) {
  return path.resolve(String(projectPath || process.cwd()));
}

function isPathInside(rootPath, targetPath) {
  const root = normalizeRoot(rootPath);
  const target = path.resolve(String(targetPath || ''));
  const relative = path.relative(root, target);
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveProjectPath(projectPath, rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new Error('path is required.');
  }

  const root = normalizeRoot(projectPath);
  const targetPath = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(root, rawPath);

  if (!isPathInside(root, targetPath)) {
    throw new Error(`Path is outside the Cocos project: ${rawPath}`);
  }

  return targetPath;
}

// For managed configuration/instruction files, lexical containment alone is not enough:
// a project-local directory may be a symlink to another project's or the user's files.
function resolveProjectFilePath(projectPath, rawPath) {
  const resolved = resolveProjectPath(projectPath, rawPath);
  const root = normalizeRoot(projectPath);
  const realRoot = fs.existsSync(root) ? fs.realpathSync(root) : root;
  let existing = resolved;
  while (!fs.existsSync(existing)) {
    try {
      if (fs.lstatSync(existing).isSymbolicLink()) throw new Error(`Dangling symbolic link in project path: ${rawPath}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  if (fs.existsSync(root) && !isPathInside(realRoot, fs.realpathSync(existing))) throw new Error(`Path resolves outside the Cocos project: ${rawPath}`);
  return resolved;
}

module.exports = {
  isPathInside,
  resolveProjectPath,
  resolveProjectFilePath,
};

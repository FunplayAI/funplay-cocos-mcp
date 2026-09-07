'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_PLATFORMS = Object.freeze([
  { id: 'codex', name: 'Codex', directory: '.agents/skills', legacyDirectory: '.codex/skills' },
  { id: 'claude_code', name: 'Claude Code', directory: '.claude/skills' },
  { id: 'cursor', name: 'Cursor', directory: '.cursor/skills' },
  { id: 'qoder', name: 'Qoder', directory: '.qoder/skills' },
  { id: 'kimi', name: 'Kimi Code', directory: '.kimi-code/skills', gitRoot: true },
]);

function findGitRootOrSelf(projectPath) {
  const original = path.resolve(projectPath);
  for (let current = original; ; current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    if (path.dirname(current) === current) return original;
  }
}

function getSkillPlatform(options = {}) {
  const id = options.clientId || 'codex';
  return SKILL_PLATFORMS.find((platform) => platform.id === id) || null;
}

function requireSkillPlatform(options = {}) {
  const platform = getSkillPlatform(options);
  if (!platform) throw new Error(`Project Skills installation is not supported for client: ${options.clientId}`);
  return platform;
}

function getSkillsDirectory(options = {}) {
  const platform = requireSkillPlatform(options);
  return options.legacy && platform.legacyDirectory ? platform.legacyDirectory : platform.directory;
}

function getSkillProjectPath(projectPath, options = {}) {
  return requireSkillPlatform(options).gitRoot ? findGitRootOrSelf(projectPath) : path.resolve(projectPath);
}

module.exports = { SKILL_PLATFORMS, findGitRootOrSelf, getSkillPlatform, getSkillsDirectory, getSkillProjectPath };

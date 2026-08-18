'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  COCOS_MCP_SKILL_DESCRIPTION,
  COCOS_MCP_SKILL_NAME,
  COCOS_MCP_SKILL_TITLE,
  COCOS_UI_SKILL_DESCRIPTION,
  COCOS_UI_SKILL_NAME,
  COCOS_UI_SKILL_TITLE,
  buildCocosMcpProjectSkillContent,
  buildCocosUiProjectSkillContent,
  buildLegacyCocosMcpProjectSkillContent,
  listProjectInstructions,
  parseSkillMetadata,
  writeProjectInstruction,
} = require('./project-instructions');
const { resolveProjectPath } = require('./path-safety');

const COCOS_MCP_SKILL_TEMPLATE_VERSION = 2;
const COCOS_UI_SKILL_TEMPLATE_VERSION = 1;
const MANIFEST_FILE_NAME = '.funplay-cocos-mcp.json';
const BACKUP_ROOT = '.codex/skill-backups';

const BUILT_IN_PROJECT_SKILLS = Object.freeze([
  Object.freeze({
    id: 'cocos-mcp-workflow',
    skillName: COCOS_MCP_SKILL_NAME,
    title: COCOS_MCP_SKILL_TITLE,
    description: COCOS_MCP_SKILL_DESCRIPTION,
    templateVersion: COCOS_MCP_SKILL_TEMPLATE_VERSION,
    buildContent: buildCocosMcpProjectSkillContent,
    legacyTemplates: Object.freeze([
      Object.freeze({ version: 1, content: buildLegacyCocosMcpProjectSkillContent() }),
      Object.freeze({
        version: 1,
        content: buildLegacyCocosMcpProjectSkillContent({ includePrefabPreservationRule: true }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'cocos-ui-composition',
    skillName: COCOS_UI_SKILL_NAME,
    title: COCOS_UI_SKILL_TITLE,
    description: COCOS_UI_SKILL_DESCRIPTION,
    templateVersion: COCOS_UI_SKILL_TEMPLATE_VERSION,
    buildContent: buildCocosUiProjectSkillContent,
    legacyTemplates: Object.freeze([]),
  }),
]);

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function getBuiltInProjectSkillDefinitions() {
  return BUILT_IN_PROJECT_SKILLS.map((definition) => ({
    id: definition.id,
    skillName: definition.skillName,
    title: definition.title,
    description: definition.description,
    templateVersion: definition.templateVersion,
  }));
}

function resolveBuiltInProjectSkillDefinition(value = COCOS_MCP_SKILL_NAME) {
  const key = String(value || COCOS_MCP_SKILL_NAME).trim();
  const definition = BUILT_IN_PROJECT_SKILLS.find((item) => (
    item.skillName === key || item.id === key
  ));
  if (!definition) {
    throw new Error(`Unknown built-in project skill: ${key}`);
  }
  return definition;
}

function definitionFromOptions(options = {}) {
  return resolveBuiltInProjectSkillDefinition(
    options.skillName || options.skillId || COCOS_MCP_SKILL_NAME
  );
}

function getSkillRelativePath(skillName = COCOS_MCP_SKILL_NAME) {
  return `.codex/skills/${skillName}/SKILL.md`;
}

function getManifestRelativePath(skillName = COCOS_MCP_SKILL_NAME) {
  return `.codex/skills/${skillName}/${MANIFEST_FILE_NAME}`;
}

function readJsonFile(filePath) {
  try {
    return {
      valid: true,
      value: JSON.parse(fs.readFileSync(filePath, 'utf8')),
      error: '',
    };
  } catch (error) {
    return {
      valid: false,
      value: null,
      error: error.message,
    };
  }
}

function readManagedSkillManifest(projectPath, skillName = COCOS_MCP_SKILL_NAME) {
  const relativePath = getManifestRelativePath(skillName);
  const filePath = resolveProjectPath(projectPath, relativePath);
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      valid: false,
      path: relativePath,
      data: null,
      error: '',
    };
  }
  const parsed = readJsonFile(filePath);
  return {
    exists: true,
    valid: parsed.valid,
    path: relativePath,
    data: parsed.value,
    error: parsed.error,
  };
}

function writeManagedSkillManifest(projectPath, content, options = {}) {
  const skillName = options.skillName || COCOS_MCP_SKILL_NAME;
  let definition = null;
  try {
    definition = resolveBuiltInProjectSkillDefinition(skillName);
  } catch (error) {
    // A custom folder name may still contain the recommended workflow template.
  }
  const contentHash = sha256Text(content);
  const data = {
    schemaVersion: 1,
    skillId: String(options.skillId || definition && definition.id || skillName),
    skillName,
    templateVersion: Number(
      options.templateVersion || definition && definition.templateVersion || COCOS_MCP_SKILL_TEMPLATE_VERSION
    ),
    templateHash: contentHash,
    installedHash: contentHash,
    extensionVersion: String(options.extensionVersion || ''),
    updatedAt: new Date().toISOString(),
  };
  const result = writeProjectInstruction(projectPath, {
    target: getManifestRelativePath(skillName),
    content: `${JSON.stringify(data, null, 2)}\n`,
    overwrite: true,
  });
  return { ...result, data };
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function listProjectSkillBackups(projectPath, skillName = COCOS_MCP_SKILL_NAME) {
  const relativeRoot = `${BACKUP_ROOT}/${skillName}`;
  const root = resolveProjectPath(projectPath, relativeRoot);
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => {
      const filePath = path.join(root, entry.name);
      const stat = fs.statSync(filePath);
      return {
        path: `${relativeRoot}/${entry.name}`,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      };
    })
    .sort((left, right) => right.mtime.localeCompare(left.mtime) || right.path.localeCompare(left.path));
}

function createProjectSkillBackup(projectPath, content, options = {}) {
  const skillName = options.skillName || COCOS_MCP_SKILL_NAME;
  const label = String(options.label || 'before-update').replace(/[^a-z0-9_-]+/gi, '-');
  const root = `${BACKUP_ROOT}/${skillName}`;
  const baseName = `${timestampForPath(options.date || new Date())}-${label}-SKILL`;
  let relativePath = `${root}/${baseName}.md`;
  let suffix = 2;
  while (fs.existsSync(resolveProjectPath(projectPath, relativePath))) {
    relativePath = `${root}/${baseName}-${suffix}.md`;
    suffix += 1;
  }
  return writeProjectInstruction(projectPath, {
    target: relativePath,
    content: String(content || ''),
    overwrite: false,
  });
}

function findRecognizedLegacyTemplate(definition, currentHash) {
  return definition.legacyTemplates.find((legacy) => sha256Text(legacy.content) === currentHash) || null;
}

function getBuiltInProjectSkillState(projectPath, options = {}) {
  const definition = definitionFromOptions(options);
  const skillName = definition.skillName;
  const relativePath = getSkillRelativePath(skillName);
  const filePath = resolveProjectPath(projectPath, relativePath);
  const installed = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  const templateContent = definition.buildContent({ skillName });
  const templateHash = sha256Text(templateContent);
  const content = installed ? fs.readFileSync(filePath, 'utf8') : '';
  const currentHash = installed ? sha256Text(content) : '';
  const metadata = installed ? parseSkillMetadata(content) : {
    name: skillName,
    description: '',
    format: 'missing',
    valid: false,
  };
  const manifest = readManagedSkillManifest(projectPath, skillName);
  const manifestData = manifest.valid && manifest.data ? manifest.data : {};
  const recognizedLegacy = installed
    ? findRecognizedLegacyTemplate(definition, currentHash)
    : null;
  const current = installed && currentHash === templateHash;
  const matchesManagedInstall = Boolean(
    installed &&
    manifest.valid &&
    manifestData.skillName === skillName &&
    manifestData.installedHash === currentHash
  );
  const modified = Boolean(
    installed && !current && !recognizedLegacy && !matchesManagedInstall
  );
  const updateAvailable = Boolean(installed && !current);
  const backups = listProjectSkillBackups(projectPath, skillName);

  let status = 'missing';
  if (current) {
    status = 'current';
  } else if (modified) {
    status = 'modified';
  } else if (installed) {
    status = 'update-available';
  }

  const installedTemplateVersion = current
    ? definition.templateVersion
    : recognizedLegacy
      ? recognizedLegacy.version
      : Number(manifestData.templateVersion || 0);

  return {
    skillId: definition.id,
    skillName,
    title: definition.title,
    description: definition.description,
    path: relativePath,
    absolutePath: filePath,
    installed,
    status,
    current,
    modified,
    managed: Boolean(current || recognizedLegacy || matchesManagedInstall),
    updateAvailable,
    templateVersion: definition.templateVersion,
    installedTemplateVersion,
    templateHash,
    currentHash,
    metadata,
    manifest: {
      exists: manifest.exists,
      valid: manifest.valid,
      path: manifest.path,
      error: manifest.error,
    },
    backupCount: backups.length,
    latestBackup: backups[0] || null,
    canInstall: !installed,
    canUpdate: updateAvailable,
  };
}

function getCocosMcpProjectSkillState(projectPath) {
  return getBuiltInProjectSkillState(projectPath, { skillName: COCOS_MCP_SKILL_NAME });
}

function getCocosUiProjectSkillState(projectPath) {
  return getBuiltInProjectSkillState(projectPath, { skillName: COCOS_UI_SKILL_NAME });
}

function getProjectSkillsState(projectPath) {
  const instructions = listProjectInstructions(projectPath);
  const builtIns = BUILT_IN_PROJECT_SKILLS.map((definition) => (
    getBuiltInProjectSkillState(projectPath, { skillName: definition.skillName })
  ));
  const builtInByPath = new Map(builtIns.map((skill) => [skill.path, skill]));
  return {
    projectPath: path.resolve(projectPath),
    skillRoot: resolveProjectPath(projectPath, '.codex/skills'),
    builtIns,
    official: builtIns[0],
    skills: instructions.skills.map((skill) => {
      const builtIn = builtInByPath.get(skill.path);
      return {
        ...skill,
        title: builtIn ? builtIn.title : skill.title,
        description: builtIn ? builtIn.description : skill.description,
        builtIn: Boolean(builtIn),
        builtInId: builtIn ? builtIn.skillId : '',
        official: Boolean(builtIn),
      };
    }),
    backups: builtIns.flatMap((skill) => (
      listProjectSkillBackups(projectPath, skill.skillName).map((backup) => ({
        ...backup,
        skillName: skill.skillName,
      }))
    )),
  };
}

function buildLineDiff(before, after, options = {}) {
  const beforeLines = String(before || '').replace(/\r\n/g, '\n').split('\n');
  const afterLines = String(after || '').replace(/\r\n/g, '\n').split('\n');
  const maxLines = options.maxLines || 1000;
  if (beforeLines.length > maxLines || afterLines.length > maxLines) {
    return {
      text: 'Diff preview is unavailable because the skill exceeds the safe line limit.',
      added: afterLines.length,
      removed: beforeLines.length,
    };
  }

  const rows = beforeLines.length + 1;
  const columns = afterLines.length + 1;
  const table = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let left = beforeLines.length - 1; left >= 0; left -= 1) {
    for (let right = afterLines.length - 1; right >= 0; right -= 1) {
      table[left][right] = beforeLines[left] === afterLines[right]
        ? table[left + 1][right + 1] + 1
        : Math.max(table[left + 1][right], table[left][right + 1]);
    }
  }

  const templateVersion = Number(options.templateVersion || COCOS_MCP_SKILL_TEMPLATE_VERSION);
  const output = ['--- installed/SKILL.md', `+++ template-v${templateVersion}/SKILL.md`, '@@'];
  let left = 0;
  let right = 0;
  let added = 0;
  let removed = 0;
  while (left < beforeLines.length && right < afterLines.length) {
    if (beforeLines[left] === afterLines[right]) {
      output.push(`  ${beforeLines[left]}`);
      left += 1;
      right += 1;
    } else if (table[left + 1][right] >= table[left][right + 1]) {
      output.push(`- ${beforeLines[left]}`);
      removed += 1;
      left += 1;
    } else {
      output.push(`+ ${afterLines[right]}`);
      added += 1;
      right += 1;
    }
  }
  while (left < beforeLines.length) {
    output.push(`- ${beforeLines[left]}`);
    removed += 1;
    left += 1;
  }
  while (right < afterLines.length) {
    output.push(`+ ${afterLines[right]}`);
    added += 1;
    right += 1;
  }

  return { text: output.join('\n'), added, removed };
}

function previewBuiltInProjectSkillUpdate(projectPath, options = {}) {
  const definition = definitionFromOptions(options);
  const state = getBuiltInProjectSkillState(projectPath, options);
  const currentContent = state.installed
    ? fs.readFileSync(state.absolutePath, 'utf8')
    : '';
  const templateContent = definition.buildContent({ skillName: state.skillName });
  const diff = buildLineDiff(currentContent, templateContent, {
    ...options,
    templateVersion: state.templateVersion,
  });
  return {
    skillId: state.skillId,
    skillName: state.skillName,
    title: state.title,
    path: state.path,
    status: state.status,
    modified: state.modified,
    templateVersion: state.templateVersion,
    installedTemplateVersion: state.installedTemplateVersion,
    addedLines: diff.added,
    removedLines: diff.removed,
    diff: diff.text,
  };
}

function previewCocosMcpProjectSkillUpdate(projectPath, options = {}) {
  return previewBuiltInProjectSkillUpdate(projectPath, {
    ...options,
    skillName: options.skillName || COCOS_MCP_SKILL_NAME,
  });
}

function updateBuiltInProjectSkill(projectPath, options = {}) {
  const definition = definitionFromOptions(options);
  const state = getBuiltInProjectSkillState(projectPath, options);
  if (state.current) {
    return {
      installed: false,
      updated: false,
      alreadyCurrent: true,
      backup: null,
      state,
    };
  }
  if (state.modified && options.allowModified !== true) {
    throw new Error(`The built-in project skill '${state.skillName}' has local modifications. Confirm a backup update before replacing it.`);
  }

  let backup = null;
  if (state.installed) {
    backup = createProjectSkillBackup(
      projectPath,
      fs.readFileSync(state.absolutePath, 'utf8'),
      { skillName: state.skillName, label: 'before-update' }
    );
  }

  const content = definition.buildContent({ skillName: state.skillName });
  const write = writeProjectInstruction(projectPath, {
    target: state.path,
    content,
    overwrite: true,
  });
  const manifest = writeManagedSkillManifest(projectPath, content, {
    skillId: state.skillId,
    skillName: state.skillName,
    templateVersion: state.templateVersion,
    extensionVersion: options.extensionVersion,
  });
  return {
    installed: !state.installed,
    updated: state.installed,
    alreadyCurrent: false,
    backup,
    write,
    manifest: manifest.path,
    state: getBuiltInProjectSkillState(projectPath, options),
  };
}

function updateCocosMcpProjectSkill(projectPath, options = {}) {
  return updateBuiltInProjectSkill(projectPath, {
    ...options,
    skillName: options.skillName || COCOS_MCP_SKILL_NAME,
  });
}

function restoreLatestBuiltInProjectSkillBackup(projectPath, options = {}) {
  const state = getBuiltInProjectSkillState(projectPath, options);
  const backups = listProjectSkillBackups(projectPath, state.skillName);
  const selected = options.backupPath
    ? backups.find((backup) => backup.path === options.backupPath)
    : backups[0];
  if (!selected) {
    throw new Error(`No project skill backup is available to restore for '${state.skillName}'.`);
  }

  const sourcePath = resolveProjectPath(projectPath, selected.path);
  let currentBackup = null;
  if (state.installed) {
    currentBackup = createProjectSkillBackup(
      projectPath,
      fs.readFileSync(state.absolutePath, 'utf8'),
      { skillName: state.skillName, label: 'before-restore' }
    );
  }
  const write = writeProjectInstruction(projectPath, {
    target: state.path,
    content: fs.readFileSync(sourcePath, 'utf8'),
    overwrite: true,
  });
  return {
    restored: true,
    source: selected,
    currentBackup,
    write,
    state: getBuiltInProjectSkillState(projectPath, options),
  };
}

function restoreLatestCocosMcpProjectSkillBackup(projectPath, options = {}) {
  return restoreLatestBuiltInProjectSkillBackup(projectPath, {
    ...options,
    skillName: options.skillName || COCOS_MCP_SKILL_NAME,
  });
}

module.exports = {
  BACKUP_ROOT,
  BUILT_IN_PROJECT_SKILLS,
  COCOS_MCP_SKILL_TEMPLATE_VERSION,
  COCOS_UI_SKILL_TEMPLATE_VERSION,
  MANIFEST_FILE_NAME,
  buildLineDiff,
  createProjectSkillBackup,
  getBuiltInProjectSkillDefinitions,
  getBuiltInProjectSkillState,
  getCocosMcpProjectSkillState,
  getCocosUiProjectSkillState,
  getManifestRelativePath,
  getProjectSkillsState,
  getSkillRelativePath,
  listProjectSkillBackups,
  previewBuiltInProjectSkillUpdate,
  previewCocosMcpProjectSkillUpdate,
  readManagedSkillManifest,
  resolveBuiltInProjectSkillDefinition,
  restoreLatestBuiltInProjectSkillBackup,
  restoreLatestCocosMcpProjectSkillBackup,
  sha256Text,
  updateBuiltInProjectSkill,
  updateCocosMcpProjectSkill,
  writeManagedSkillManifest,
};

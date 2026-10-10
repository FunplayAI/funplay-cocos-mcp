'use strict';

const fs = require('fs');
const path = require('path');
const { resolveProjectFilePath: resolveProjectPath } = require('./path-safety');
const { readOptionalText, writeTextIfUnchanged } = require('./atomic-file');
const { getSkillsDirectory, getSkillProjectPath } = require('./skill-platforms');

const KNOWN_INSTRUCTION_PATHS = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
];

const COCOS_MCP_SKILL_NAME = 'funplay-cocos-mcp-workflow';
const COCOS_MCP_SKILL_TITLE = 'Funplay Cocos MCP Workflow';
const LEGACY_COCOS_MCP_SKILL_DESCRIPTION =
  'Use this skill when editing, validating, or debugging this Cocos Creator project through Funplay Cocos MCP.';
const COCOS_MCP_SKILL_DESCRIPTION =
  'Edit, inspect, validate, preview, and debug Cocos Creator projects through Funplay Cocos MCP. Use when working with scenes, nodes, prefabs, assets, TypeScript, logs, screenshots, preview behavior, runtime state, or MCP connectivity.';
const COCOS_MCP_SKILL_INSTRUCTIONS = [
  '## Operating Loop',
  '',
  '1. Establish context.',
  '   - Read `cocos://project/context` or call `get_editor_state` before assuming the project, active scene, MCP URL, selection, visible windows, or tool profile.',
  '   - Inspect the active scene with `get_scene_info` and `get_hierarchy`; use `get_selection`, `list_scenes`, `list_assets`, or `list_prefabs` when identity or ownership is unclear.',
  '   - Treat user-provided node and asset names as hints. Resolve the real hierarchy path, node UUID, asset UUID, or `db://assets/...` URL before editing.',
  '   - Call `get_tool_catalog` when a required tool may be hidden by the `core`, `full`, or custom exposure profile.',
  '2. Choose the edit surface.',
  '   - Edit TypeScript and ordinary project files with repository tools or the MCP file tools, then refresh the affected asset and run diagnostics.',
  '   - Edit live scene nodes with focused scene/component tools or `execute_javascript` using `context="scene"`; save the scene when the change must persist.',
  '   - Use `execute_javascript` with `context="editor"` for asset-db, Editor messages, project orchestration, and filesystem work that belongs in the editor process.',
  '   - Inspect prefab ownership and references before mutation. Prefer focused prefab tools, or edit a verified linked instance and apply it back through the editor workflow.',
  '   - Preserve an existing UI or gameplay prefab hierarchy and change only the necessary nodes, components, and serialized fields; do not rebuild the entire prefab unless explicitly requested.',
  '3. Execute the smallest coherent change.',
  '   - Prefer one guarded `execute_javascript` operation for tightly related editor work, but use focused tools when they provide clearer validation or safer arguments.',
  '   - Keep JavaScript safety checks enabled unless the code and its paths were reviewed explicitly.',
  '   - Null-check every scene, node, component, asset, and filesystem lookup. Return concise structured before/after values, including stable UUIDs or asset URLs where useful.',
  '   - Save or refresh only the assets and scenes intentionally changed.',
  '   - Do not guess alternate paths, silently create replacement objects, or run self-healing fallback loops after a missing reference or unsupported editor message.',
  '4. Read back and validate.',
  '   - Re-inspect the exact node, component, prefab instance, or asset after mutation; a successful command response alone is not proof of the final editor state.',
  '   - Run `run_script_diagnostics` or `get_script_diagnostic_context` after TypeScript changes, then use `validate_scene` and project logs before claiming success.',
  '   - For visual or runtime work, run the appropriate browser, Game View, or simulator preview and verify with runtime state, input, logs, and screenshots.',
  '   - State exactly what was verified and what still requires a native build, device, network, store, or manual check.',
  '',
  '## Scene, Prefab, and Asset Safety',
  '',
  '- Do not treat Cocos `.scene`, `.prefab`, or `.meta` files as ordinary text. Prefer scene-process, prefab, and asset-db operations that preserve UUID references and editor import state.',
  '- If `edit_prefab_json` is used, target a verified prefab path and the smallest exact JSON path or literal replacement, then run `validate_prefab_references` and inspect the result.',
  '- Before structural prefab work, call `inspect_prefab`; for scene instances, call `inspect_prefab_instance` and choose deliberately between apply and revert.',
  '- Replacing a prefab at the same path can keep the asset UUID while changing internal object IDs and breaking serialized references, animation tracks, nested prefab links, and scene overrides.',
  '- Inspect dependencies with `inspect_asset_dependencies` and validate them with `validate_asset_dependencies` before and after sensitive asset changes.',
  '- Never copy a `.meta` file when duplicating an asset. Use `duplicate_prefab` or asset-db operations so the new asset receives its own UUID.',
  '',
  '## Tool Exposure and Execution Contexts',
  '',
  '- The default `core` profile exposes the main inspection, diagnostics, logs, screenshots, scene, asset, and unified JavaScript workflow.',
  '- The `full` profile adds focused mutation tools for nodes, components, prefabs, UI, runtime control, input simulation, files, and project preview.',
  '- If a named tool is unavailable under a custom profile, adapt to the exposed catalog and report the missing capability instead of pretending it ran.',
  '- In scene context, use the Cocos runtime and scene APIs for live hierarchy and component work. In editor context, use `Editor` APIs and messages for asset-db and extension orchestration.',
  '- Use `execute_scene_script` and `execute_editor_script` only as compatibility entrypoints; prefer `execute_javascript` with an explicit context for new workflows.',
  '',
  '## Readiness and Preview Evidence',
  '',
  '- For imports, scripts, preview startup, calibrated input, or persistence checks, read [project readiness](references/project-readiness.md). Do not load this conditional reference for an unrelated inspection.',
  '- `check_asset_ready` checks stable AssetDB identity, not script compilation or runtime loading. Discover its exposure before use.',
  '- `get_runtime_state` describes the editor Game View and toolbar, not browser/simulator runtime or edit-scene counters.',
  '- Read `get_recent_logs` or `search_project_logs` for relevant errors. Do not clear persistent logs without explicit confirmation.',
  '',
  '## Failure Handling',
  '',
  '- If MCP is unreachable, limit claims to safe filesystem inspection or code edits; do not claim scene, prefab, editor, preview, or runtime verification.',
  '- If a node lookup is ambiguous, return the matching paths and UUIDs and choose only after identifying the user-visible or prefab-owned target.',
  '- If editor readback and serialized text disagree, trust editor and asset-db readback first and investigate whether the wrong asset, scene instance, or stale import was inspected.',
  '- Fix diagnostics or new error logs caused by the change before visual or runtime validation.',
].join('\n');

const COCOS_UI_SKILL_NAME = 'funplay-cocos-ui-composition';
const COCOS_UI_SKILL_TITLE = 'Funplay Cocos UI Composition';
const COCOS_UI_SKILL_DESCRIPTION =
  'Build and revise responsive Cocos Creator UI for mobile, desktop, and web, including portrait and landscape layouts, safe areas, prefabs, Widget and Layout behavior, scrolling, text, input, animation, and performance validation.';
const COCOS_UI_SKILL_INSTRUCTIONS = [
  "## UI Workflow",
  "",
  "1. Inspect the active scene, Canvas, design resolution, target viewports, `UITransform`, `Widget`, `Layout`, existing `SafeArea` policy, prefab ownership and serialized references.",
  "2. Preserve the user's design requirements and established project baseline. A full-page reference may define a new screen's baseline; clarify cropped or conflicting references instead of imposing a fixed resolution.",
  "3. Preserve existing roots, node/component identities, event bindings, animation targets and nested prefabs. Change only what the request requires; do not rebuild the entire prefab unless explicitly requested.",
  "4. Choose one owner for each position/size property. Avoid conflicting Widget, Layout, animation and manual writes. Use supported Cocos scene/prefab/AssetDB workflows for authored assets.",
  "5. Read back exact dimensions, anchors, constraints, SpriteFrame/font references and event bindings. Save/reopen when persistence matters; use preview input and screenshots for visual or interaction claims.",
  "",
  "## Design Fidelity",
  "",
  "- Preserve authored spacing and the project's adaptation. Do not proactively add SafeArea containers, adaptation scripts or extra insets. New adaptation requires an explicit request or a demonstrated overlap confirmed with the user.",
  "- Keep complete UI pages in saved prefabs when that fits the project; runtime hierarchy creation is not a substitute for requested authored UI.",
  "- A tool response, hierarchy, edit-scene performance counter and screenshot prove different things. Report unverified runtime, device, glyph or business behavior explicitly.",
  "",
  "## Read Only the Relevant References",
  "",
  "- For resolution, orientation, SafeArea, Widget/Layout, scrolling or masks: [layout and adaptation](references/layout-and-adaptation.md).",
  "- For SpriteFrames, nine-slice, atlas or importer edits: [sprites and importers](references/sprites-and-importers.md).",
  "- For fonts, text overflow, glyph coverage or requested localization: [text and localization](references/text-and-localization.md).",
  "- For event bindings, real input, animation, screenshots or performance evidence: [input and validation](references/input-and-validation.md).",
  "",
  "These references are conditional; do not load every file for a focused edit.",
].join('\n');

function normalizeSkillName(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
  if (!normalized) {
    throw new Error('skillName is required.');
  }
  return normalized;
}

function statFile(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (error) {
    return null;
  }
}

function decodeYamlScalar(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if (text.startsWith('"')) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return text.slice(1, text.endsWith('"') ? -1 : undefined);
    }
  }
  if (text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
}

function parseSkillMetadata(content) {
  const text = String(content || '');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (frontmatter) {
    const values = {};
    for (const line of frontmatter[1].split(/\r?\n/)) {
      const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (match) {
        values[match[1]] = decodeYamlScalar(match[2]);
      }
    }
    const name = String(values.name || '').trim();
    const description = String(values.description || '').trim();
    const validName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 63;
    const validDescription = Boolean(
      description && description.length <= 1024 && !/[<>]/.test(description)
    );
    return {
      name,
      description,
      format: 'frontmatter',
      valid: validName && validDescription,
    };
  }

  const title = /^#\s+(.+)$/m.exec(text);
  const description = /^Description:\s*(.+)$/m.exec(text);
  return {
    name: '',
    description: description ? description[1].trim() : '',
    title: title ? title[1].trim() : '',
    format: title || description ? 'legacy' : 'unknown',
    valid: false,
  };
}

function buildProjectSkillContent(options = {}) {
  const skillName = normalizeSkillName(options.skillName);
  const title = String(options.title || '').trim() || skillName;
  const description = String(options.description || '').trim() || `Project-specific workflow for ${title}.`;
  if (description.length > 1024) {
    throw new Error('Skill description must be 1024 characters or fewer.');
  }
  if (/[<>]/.test(description)) {
    throw new Error('Skill description cannot contain angle brackets.');
  }
  const body = String(options.instructions || '').trim() || [
    `Use this skill for ${title} work in this Cocos project.`,
    '',
    '- Inspect the active scene and project context before editing.',
    '- Prefer focused MCP tools before broad manual file edits.',
    '- Run relevant validation tools after changes.',
  ].join('\n');

  return [
    '---',
    `name: ${skillName}`,
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
    `# ${title}`,
    '',
    '## Instructions',
    '',
    body,
    '',
  ].join('\n');
}

function buildCocosMcpProjectSkillContent(options = {}) {
  return buildProjectSkillContent({
    skillName: options.skillName || COCOS_MCP_SKILL_NAME,
    title: options.title || COCOS_MCP_SKILL_TITLE,
    description: options.description || COCOS_MCP_SKILL_DESCRIPTION,
    instructions: String(options.instructions || '').trim() || COCOS_MCP_SKILL_INSTRUCTIONS,
  });
}

function buildCocosUiProjectSkillContent(options = {}) {
  return buildProjectSkillContent({
    skillName: options.skillName || COCOS_UI_SKILL_NAME,
    title: options.title || COCOS_UI_SKILL_TITLE,
    description: options.description || COCOS_UI_SKILL_DESCRIPTION,
    instructions: String(options.instructions || '').trim() || COCOS_UI_SKILL_INSTRUCTIONS,
  });
}

function buildLegacyCocosMcpProjectSkillContent(options = {}) {
  const instructions = [
    '- Start by reading `cocos://project/context` or calling `get_editor_state` to confirm the active project, scene, server URL, and tool profile.',
    '- Prefer `execute_javascript` for high-level scene/editor orchestration, but keep safety checks enabled unless the code was reviewed.',
    '- Use focused tools when they are better primitives: `list_assets`, `inspect_asset_dependencies`, `validate_asset_dependencies`, `run_script_diagnostics`, `get_script_diagnostic_context`, and screenshot tools.',
    '- For UI work, inspect the active Canvas/hierarchy first, mutate the smallest necessary node/component set, then verify with `validate_scene` and a screenshot.',
    ...(options.includePrefabPreservationRule ? [
      '- When modifying a UI or gameplay-object prefab, preserve the existing prefab and edit only the necessary nodes/components; do not rebuild the entire prefab unless explicitly requested.',
    ] : []),
    '- For prefab or asset edits, inspect dependencies/references before mutation and refresh assets afterward.',
    '- When changing tool exposure, save a named tool profile so the same client setup can be restored later.',
  ].join('\n');
  return [
    `# ${COCOS_MCP_SKILL_TITLE}`,
    '',
    `Description: ${LEGACY_COCOS_MCP_SKILL_DESCRIPTION}`,
    '',
    '## Instructions',
    instructions,
    '',
  ].join('\n');
}

function listSkillFiles(projectPath, options = {}) {
  projectPath = getSkillProjectPath(projectPath, options);
  const skillRoot = resolveProjectPath(projectPath, getSkillsDirectory(options));
  if (!fs.existsSync(skillRoot)) {
    return [];
  }

  const skills = [];
  const stack = [skillRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = resolveProjectPath(projectPath, path.join(current, entry.name));
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.name === 'SKILL.md') {
        const stat = statFile(fullPath);
        const metadata = parseSkillMetadata(fs.readFileSync(fullPath, 'utf8'));
        skills.push({
          path: path.relative(projectPath, fullPath).replace(/\\/g, '/'),
          size: stat ? stat.size : 0,
          mtime: stat ? stat.mtime.toISOString() : '',
          name: metadata.name || path.basename(path.dirname(fullPath)),
          title: metadata.title || '',
          description: metadata.description,
          format: metadata.format,
          valid: metadata.valid,
        });
      }
    }
  }
  return skills.sort((left, right) => left.path.localeCompare(right.path));
}

function listProjectInstructions(projectPath, options = {}) {
  projectPath = getSkillProjectPath(projectPath, options);
  const files = [];
  for (const relativePath of KNOWN_INSTRUCTION_PATHS) {
    const fullPath = resolveProjectPath(projectPath, relativePath);
    const stat = statFile(fullPath);
    if (stat && stat.isFile()) {
      files.push({
        path: relativePath,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      });
    }
  }

  return {
    files,
    skills: listSkillFiles(projectPath, options),
  };
}

function readProjectInstruction(projectPath, target) {
  const relativePath = String(target || '').trim();
  if (!relativePath) {
    throw new Error('target is required.');
  }
  const fullPath = resolveProjectPath(projectPath, relativePath);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error(`Instruction file not found: ${relativePath}`);
  }
  return {
    path: relativePath,
    content: fs.readFileSync(fullPath, 'utf8'),
  };
}

function writeProjectInstruction(projectPath, options = {}) {
  const relativePath = String(options.target || '').trim();
  if (!relativePath) {
    throw new Error('target is required.');
  }
  const content = String(options.content || '');
  const fullPath = resolveProjectPath(projectPath, relativePath);
  const original = Object.prototype.hasOwnProperty.call(options, 'expectedContent') ? options.expectedContent : readOptionalText(fullPath);
  if (original !== null && options.overwrite === false) {
    throw new Error(`Instruction file already exists: ${relativePath}`);
  }
  writeTextIfUnchanged(fullPath, content, original);
  const stat = fs.statSync(fullPath);
  return {
    written: true,
    path: relativePath,
    size: stat.size,
    mtime: stat.mtime.toISOString(),
  };
}

function createProjectSkill(projectPath, options = {}) {
  projectPath = getSkillProjectPath(projectPath, options);
  const skillName = normalizeSkillName(options.skillName);
  const relativePath = `${getSkillsDirectory(options)}/${skillName}/SKILL.md`;
  const content = buildProjectSkillContent({ ...options, skillName });
  return writeProjectInstruction(projectPath, {
    target: relativePath,
    content,
    overwrite: options.overwrite !== false,
  });
}

function createCocosMcpProjectSkill(projectPath, options = {}) {
  return createManagedProjectSkill(projectPath, COCOS_MCP_SKILL_NAME, options);
}

function createCocosUiProjectSkill(projectPath, options = {}) {
  return createManagedProjectSkill(projectPath, COCOS_UI_SKILL_NAME, options);
}

function createManagedProjectSkill(projectPath, templateSkillName, options) {
  projectPath = getSkillProjectPath(projectPath, options);
  const skillName = normalizeSkillName(options.skillName || templateSkillName);
  const target = `${getSkillsDirectory(options)}/${skillName}/SKILL.md`;
  if (options.overwrite === false && fs.existsSync(resolveProjectPath(projectPath, target))) {
    throw new Error(`Instruction file already exists: ${target}`);
  }
  // Lazy import avoids a cycle: the manager uses the pure content builders above.
  const result = require('./project-skills').updateBuiltInProjectSkill(projectPath, {
    ...options, skillName, templateSkillName, allowModified: options.overwrite !== false,
  });
  return {
    ...(result.write || { written: false, path: result.state.path }),
    manifest: result.manifest || result.state.manifest.path,
    references: result.references || result.state.references.map((file) => file.path),
    backup: result.backup || null,
  };
}

module.exports = {
  COCOS_MCP_SKILL_DESCRIPTION,
  COCOS_MCP_SKILL_INSTRUCTIONS,
  COCOS_MCP_SKILL_NAME,
  COCOS_MCP_SKILL_TITLE,
  COCOS_UI_SKILL_DESCRIPTION,
  COCOS_UI_SKILL_INSTRUCTIONS,
  COCOS_UI_SKILL_NAME,
  COCOS_UI_SKILL_TITLE,
  KNOWN_INSTRUCTION_PATHS,
  buildCocosMcpProjectSkillContent,
  buildCocosUiProjectSkillContent,
  buildLegacyCocosMcpProjectSkillContent,
  buildProjectSkillContent,
  createCocosMcpProjectSkill,
  createCocosUiProjectSkill,
  createProjectSkill,
  listProjectInstructions,
  normalizeSkillName,
  parseSkillMetadata,
  readProjectInstruction,
  writeProjectInstruction,
};

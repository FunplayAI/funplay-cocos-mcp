'use strict';

const fs = require('fs');
const path = require('path');
const { resolveProjectPath } = require('./path-safety');

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
  '## Script and Asset Validation',
  '',
  '- After external script changes, refresh the affected asset or `db://assets`, then run TypeScript no-emit diagnostics. Use diagnostic context to read focused source snippets before repairing errors.',
  '- Cocos import and compilation are asynchronous. After refresh, re-query diagnostics, logs, or asset info instead of assuming the first request observed the final state.',
  '- Read `get_recent_logs` or `search_project_logs` for import, serialization, preview, and runtime failures. Do not clear persistent project logs without explicit confirmation.',
  '- Use `validate_scene` as a compact final pass, not as a replacement for targeted readback of the values changed.',
  '',
  '## Preview and Runtime Verification',
  '',
  '- Query `get_preview_mode` before changing preview behavior. Use `run_project_preview` only when preview execution is needed and distinguish browser `localUrl` from a LAN `networkUrl`.',
  '- Use `get_runtime_state` for pause, frame, and time-scale state; use focused runtime or component methods only when runtime behavior must be exercised.',
  '- Use `capture_scene_screenshot` for scene-side composition, `capture_preview_screenshot` for game output, and `capture_editor_screenshot` for editor UI or extension panels.',
  '- When low-level input is needed, list editor windows first and target the preview or simulator deliberately. Prefer semantic button events when available.',
  '- Restore temporary runtime state such as pause or time scale before finishing unless the user explicitly wants it left changed.',
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
  '## Operating Loop',
  '',
  '1. Inspect before editing.',
  '   - Confirm the active scene, Canvas, design resolution, Fit Width/Fit Height policy, target orientations, SafeArea usage, and relevant prefab asset paths.',
  '   - Inspect the existing hierarchy, `UITransform` sizes and anchor points, `Widget` constraints and align modes, `Layout` ownership, sibling order, render order, serialized references, animation targets, and prefab instance state.',
  '   - Treat screenshots and design coordinates as visual intent, not as permission to replace a working hierarchy.',
  '2. Classify each region.',
  '   - Mark art as full-bleed or safe-area content.',
  '   - Mark placement as edge-aligned by Widget, stretched between edges, content-sized by Layout, repeated content, scrollable content, modal, overlay, or world-space UI.',
  '   - Decide which system owns position and size. Avoid letting Widget, Layout, animation, and manual code fight over the same property.',
  '3. Make the smallest coherent change.',
  '   - Preserve the prefab root, existing children, components, names, UUID-backed references, animation tracks, nested prefab links, and scene overrides unless a specific replacement is required.',
  '   - Modify only the necessary nodes, components, fields, and children; do not rebuild the entire prefab unless explicitly requested.',
  '   - Prefer Cocos MCP scene, prefab, and asset-db workflows over generic text replacement for serialized assets.',
  '4. Read back and validate.',
  '   - Read exact hierarchy, node UUIDs, `UITransform` sizes and anchors, Widget edges, Layout settings, sprites, labels, opacity, input blockers, event bindings, and prefab ownership back from Cocos.',
  '   - Test layout, input, safe area, localization, animation interruption, close/reopen state, and runtime data changes.',
  '   - Capture preview screenshots at representative aspect ratios. Use native builds on representative devices before claiming device performance or platform validation.',
  '',
  '## Component Selection',
  '',
  '| Component | Use it for | Configure deliberately | Avoid |',
  '| --- | --- | --- | --- |',
  '| `Canvas` | Root 2D/UI render space and design-resolution adaptation | Verify project design resolution, Fit Width/Fit Height, camera and layer behavior | Adding duplicate Canvases only to organize folders or assuming one resolution fits every aspect ratio |',
  '| `UITransform` | UI size, anchor point, coordinate conversion, hit testing, and render priority | Set `contentSize` and anchor point intentionally; keep scale for visual effects rather than basic layout | Treating one screenshot position as universal or changing scale when size/Widget constraints should change |',
  '| `Widget` | Edge, center, stretch, and parent-relative alignment | Choose top/bottom/left/right/center constraints and `ONCE`, `ON_WINDOW_RESIZE`, or `ALWAYS` based on runtime needs | Animating properties that an `ALWAYS` Widget rewrites at the end of the frame |',
  '| `SafeArea` | Keeping critical controls inside notches and system gesture areas | Put it on the top interaction container; allow full-bleed backgrounds outside it | Applying safe-area insets twice or placing important controls outside the safe rectangle |',
  '| `Layout` | Horizontal, vertical, or grid arrangement and container/child resizing | Choose type, resize mode, padding, spacing, constraint, and start axis; call `updateLayout` only when same-frame measurement is necessary | Putting Layout and Widget on the same node or manually positioning children driven by Layout |',
  '| `Sprite` | Icons, panels, progress fills, and sliced or tiled UI art | Use sliced frames for scalable borders, preserve SpriteFrame references, and choose fill/type intentionally | Stretching bordered art as a simple Sprite or leaving decorative nodes interactive |',
  '| `Label` / `RichText` | Localized text and formatted text | Set fonts, fallback coverage, alignment, wrapping, line height, overflow, and cache mode from actual update frequency | Broad `SHRINK` use on frequently changing labels or shipping without required CJK and symbol glyphs |',
  '| `ScrollView` + `Mask` | Content larger than a viewport | Use a dedicated view/mask and content node, enable only required axes, and configure inertia, brake, bounce, and nested input deliberately | Combining Widget and Layout on the same Content node, or creating thousands of live rows without pooling |',
  '| `Mask` | Rectangular, ellipse, graphics, or sprite-stencil clipping | Match the mask type to the visual requirement and keep renderer constraints in mind | Adding Sprite or Label renderers to a Mask node where Cocos requires the mask-owned Graphics/Sprite |',
  '| `Button`, `Toggle`, `Slider`, `EditBox` | Semantic interaction | Verify transition state, target node, event handlers, hit area, keyboard/focus behavior, and disabled state | Duplicate event bindings, tiny touch targets, or visual-only disabled states |',
  '| `UIOpacity` | Fading a UI subtree | Coordinate opacity with active state and input blocking | Hiding a modal visually while it still receives or blocks input |',
  '| `BlockInputEvents` | Preventing pointer/touch events from passing through overlays and modals | Put it on the intended blocking region and validate sibling order and active state | Assuming a visible scrim blocks gameplay input by itself |',
  '| `PageView` | Paged horizontal or vertical content | Recompute page and content sizes when the viewport changes and test drag thresholds | Hard-coding page positions from one device width |',
  '',
  '## Design Resolution, Widget, and Safe Area',
  '',
  '- Treat the design resolution as the coordinate baseline, not a physical-device whitelist. Verify the project Fit Width/Fit Height policy and any runtime `view.setDesignResolutionSize` policy before changing layout.',
  '- Use Widget to express attachment and stretch. Use `ON_WINDOW_RESIZE` for resizable desktop/web or large-screen layouts, and use `ALWAYS` only when continuous alignment is worth its property ownership cost.',
  '- When Widget owns an edge or size, change the Widget offsets or align mode rather than writing a Node position or UITransform size that will be overwritten later.',
  '- Keep UI scale at one for ordinary layout. Resize through `UITransform.contentSize`, Widget constraints, Layout properties, or a deliberate design-resolution policy.',
  '- Put decorative backgrounds outside the SafeArea interaction root so they can bleed to physical edges. Put buttons, labels, navigation, and other critical content under SafeArea.',
  '- SafeArea already obtains `sys.getSafeAreaRect` and adjusts through Widget. Do not add a second manual inset unless the project has a documented additional margin.',
  '- Re-evaluate layout on window resize, orientation change, or safe-area change when the target platform can change dimensions at runtime.',
  '',
  '## Portrait and Landscape Patterns',
  '',
  '- For portrait screens, organize persistent UI into Top, flexible Center, and Bottom regions. Let tall screens expand the center instead of multiplying every vertical coordinate by aspect ratio.',
  '- For landscape screens, use Left, Center, Right, and stable corner regions. Verify 16:9, ultrawide, 16:10, and 4:3 instead of treating landscape as one shape.',
  '- Separate camera/world composition from Canvas UI adaptation. A correct Widget layout does not prove the gameplay camera shows the intended world area.',
  '- Use alternate art or deliberate cover/crop behavior when one background cannot preserve composition across phone, tablet, and desktop aspect ratios.',
  '- Reposition only regions whose composition genuinely changes. Do not fork or rebuild the entire screen prefab for a few aspect-dependent offsets.',
  '',
  '## Auto Layout and Dynamic Content',
  '',
  '- A Layout component drives its children or container according to `ResizeMode`. Do not manually write the driven dimensions and expect them to survive the next layout update.',
  '- For `ResizeMode.CHILDREN`, verify the container size and the resulting child sizes. For `ResizeMode.CONTAINER`, verify anchor point and growth direction so the container expands predictably.',
  '- Grid Layout uses its configured cell and constraint policy. Use fixed rows or columns deliberately and do not expect heterogeneous child preferred sizes to define every cell.',
  '- Runtime Layout property changes normally settle on the next frame. Call `updateLayout` only when code must read the final result in the same operation.',
  '- Keep nested Layout chains shallow, batch data changes, pool repeated items, and avoid rebuilding a large hierarchy for every small model update.',
  '',
  '## Sprites, Text, Scrolling, and Input',
  '',
  '- Use sliced SpriteFrames for scalable bordered panels and buttons. Preserve caps/insets and inspect the actual SpriteFrame reference after prefab edits.',
  '- For Label, choose `CLAMP`, `SHRINK`, or `RESIZE_HEIGHT` from a documented overflow policy. `SHRINK` can cost more CPU when text updates; `RESIZE_HEIGHT` transfers height ownership to the label.',
  '- Choose Label cache mode from content behavior: avoid caching assumptions for highly dynamic text, and verify character coverage and atlas capacity for localized content.',
  '- Structure a ScrollView as root, masked view, and content. Enable only the needed direction, verify the content reference, and test child-button cancellation and nested scroll behavior.',
  '- Keep one intentional interactive target per control, bind events once, and validate the serialized target, component, handler, and custom event data.',
  '- Give touch controls a project-defined minimum hit area even when the visible art is smaller. Verify with preview input rather than only inspecting dimensions.',
  '- Synchronize modal visibility, `UIOpacity`, active state, Button interactability, and `BlockInputEvents` so hidden panels neither receive nor leak input.',
  '',
  '## Animation and Prefab Safety',
  '',
  '- Animate a `Visual` or `Container` child when the root is driven by Widget or Layout. Do not animate a property that layout rewrites every frame.',
  '- Stop or cancel an existing tween/animation before replaying it and restore deterministic position, scale, opacity, active state, and input blocking on disable or close.',
  '- Use unscaled scheduling or an explicit UI clock when menus and modal transitions must continue while gameplay time scale is zero.',
  '- Preserve existing prefab objects by default. Replacing a prefab hierarchy can break internal object IDs, animation tracks, serialized component references, nested prefabs, and scene overrides even when the asset UUID remains stable.',
  '- Prefer serialized references and stable semantic names over repeated `getChildByPath` lookups. If a path is required, verify it and fail clearly rather than silently creating an alternate hierarchy.',
  '',
  '## Performance and Validation',
  '',
  '- Profile before restructuring. Common UI costs include excessive nodes, draw-call breaks, masks/stencils, overdraw, dynamic text generation, repeated Layout work, and large unpooled lists.',
  '- Preserve render batching by grouping compatible sprites and materials without changing intended sibling/render order. Use dynamic atlas or static batching only after verifying asset eligibility and runtime behavior.',
  '- Use `get_performance_snapshot` to compare node, component, UI, depth, and memory-oriented counters before and after material changes.',
  '- Validate portrait at 16:9, 19.5:9 or 20:9, a cutout phone, and a portrait tablet. Validate landscape at 16:9, ultrawide, 16:10, 4:3, and both cutout sides.',
  '- In every profile, verify full-bleed art, safe interactive content, text overflow and glyphs, scroll bounds, modal blocking, touch targets, animation interruption, and close/reopen state.',
  '',
  '## Official Cocos References',
  '',
  '- [Cocos Creator 3.8 UI system](https://docs.cocos.com/creator/3.8/manual/en/ui-system/)',
  '- [UITransform](https://docs.cocos.com/creator/3.8/api/en/class/UITransform) and [Widget](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/widget.html)',
  '- [SafeArea](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/safearea.html) and [multi-resolution adaptation](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/engine/multi-resolution.html)',
  '- [Layout](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/layout.html) and [ScrollView](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/scrollview.html)',
  '- [Label](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/label.html) and [Mask](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/mask.html)',
  '- [Node hierarchy and UI rendering order](https://docs.cocos.com/creator/3.8/manual/en/concepts/scene/node-tree.html)',
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

function listSkillFiles(projectPath) {
  const skillRoot = resolveProjectPath(projectPath, '.codex/skills');
  if (!fs.existsSync(skillRoot)) {
    return [];
  }

  const skills = [];
  const stack = [skillRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
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

function listProjectInstructions(projectPath) {
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
    skills: listSkillFiles(projectPath),
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
  if (fs.existsSync(fullPath) && options.overwrite === false) {
    throw new Error(`Instruction file already exists: ${relativePath}`);
  }
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  const stat = fs.statSync(fullPath);
  return {
    written: true,
    path: relativePath,
    size: stat.size,
    mtime: stat.mtime.toISOString(),
  };
}

function createProjectSkill(projectPath, options = {}) {
  const skillName = normalizeSkillName(options.skillName);
  const relativePath = `.codex/skills/${skillName}/SKILL.md`;
  const content = buildProjectSkillContent({ ...options, skillName });
  return writeProjectInstruction(projectPath, {
    target: relativePath,
    content,
    overwrite: options.overwrite !== false,
  });
}

function createCocosMcpProjectSkill(projectPath, options = {}) {
  const skillName = normalizeSkillName(options.skillName || COCOS_MCP_SKILL_NAME);
  return writeProjectInstruction(projectPath, {
    target: `.codex/skills/${skillName}/SKILL.md`,
    content: buildCocosMcpProjectSkillContent({ ...options, skillName }),
    overwrite: options.overwrite !== false,
  });
}

function createCocosUiProjectSkill(projectPath, options = {}) {
  const skillName = normalizeSkillName(options.skillName || COCOS_UI_SKILL_NAME);
  return writeProjectInstruction(projectPath, {
    target: `.codex/skills/${skillName}/SKILL.md`,
    content: buildCocosUiProjectSkillContent({ ...options, skillName }),
    overwrite: options.overwrite !== false,
  });
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

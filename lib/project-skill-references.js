'use strict';

// Original Cocos-specific guidance, exported beside each client's SKILL.md.
// Entrypoints route here only when the corresponding kind of work is requested.
const WORKFLOW_REFERENCES = Object.freeze({
  'references/project-readiness.md': `# Project, import, and preview readiness

## Asset and script changes

- Resolve the exact AssetDB UUID or db:// URL. Refresh only the changed source assets; do not guess an extension or silently substitute another asset.
- Import is asynchronous. If exposed, use \`check_asset_ready\` with the exact target after refresh/import and before assigning the asset or attaching its script. A stable imported UUID/URL identity is not proof that the importer queue is empty, TypeScript compiled, or the preview loaded those bytes.
- \`check_asset_ready\` is a Full-profile read-only tool. Discover exposure with \`get_tool_catalog\`; do not change a custom allowlist without authorization. If unavailable, query exact asset info and report the narrower evidence instead of claiming full readiness.
- After TypeScript edits, run \`run_script_diagnostics\` and inspect import/preview errors. Its no-emit compiler result is separate from Creator's compilation and preview loading.
- A zero-wait readiness query is one observation, not stable readiness. Busy, missing, importing, timeout, unavailable, and unknown results are not success. Wait within a bounded budget or report the unresolved state; never repeat a mutation to obtain a cleaner response.
- Check APIs against the actual Creator version and loaded project components, not only a package.json declaration. Preserve existing dependencies and project conventions.

## Preview evidence

- Query \`get_preview_mode\` before choosing browser, editor Game View, or simulator. Browser \`localUrl\` is same-host; \`networkUrl\` is Creator's LAN address.
- \`get_runtime_state\`, pause, and resume address the editor Game View and its native toolbar. They do not inspect external browser/simulator runtime state. Edit-scene director counters and time scale are not Game View state.
- A listening MCP server, opened window, non-empty screenshot, current scene drawing, and correct business behavior are different claims. Verify only the layers relevant to the user's request and identify missing evidence.
- Use \`capture_scene_screenshot\` for editor Scene composition and Game/preview capture for game output. For real pointer testing, bind \`simulate_mouse_click\` or drag to the returned \`captureId\` with \`coordinateSpace="image-pixels"\`; use coordinates from that exact image.
- Recapture after a resize, zoom, reload, scene change, or stale-capture rejection. Do not scale coordinates from an unrelated/resized reference image yourself. Button event emission tests handlers but does not prove hit testing, clipping, focus, or occlusion.
- If an input reports an unknown outcome, inspect the resulting state before deciding on another action. Do not automatically resend it. Restore only temporary state owned by this task; preserve user changes.

## Persistence

- Prefer scene-process, prefab, and AssetDB tools for .scene/.prefab/.meta changes. A successful native message alone does not prove saved content or preserved UUID links.
- Reinspect the exact object and relevant serialized references, save only the requested changes, and reopen when persistence matters. Keep incomplete checks explicit.

Sources: [Creator messages](https://docs.cocos.com/creator/3.8/manual/en/editor/extension/messages.html) and [asset workflow](https://docs.cocos.com/creator/3.8/manual/en/asset/asset-workflow.html).\n`,
});

const UI_REFERENCES = Object.freeze({
  'references/layout-and-adaptation.md': `# Layout and design fidelity

## Resolution and safe area

- User requirements and explicit design specifications take priority. Preserve an established project's design resolution and Fit Width/Fit Height policy unless a change is requested. For a new screen without a baseline, a full-page design image may define the baseline; a crop, conflicting images, or unclear intended dimensions need clarification. Do not impose a fixed phone resolution.
- Keep authored spacing and full-bleed composition. Inspect existing SafeArea components and runtime adaptation before changing them. Do not proactively add SafeArea containers, adaptation scripts, extra margins, or a second inset; new adaptation needs an explicit request or a demonstrated overlap confirmed with the user.
- If safe-area adaptation is requested, distinguish full-bleed art from critical controls and apply it once. Cocos SafeArea uses sys.getSafeAreaRect and Widget; preserve the project's existing ownership of position/size.
- Separate Canvas adaptation from gameplay camera composition. Correct Widget constraints do not prove that the world camera shows the desired area.

## Property ownership

- UITransform owns contentSize and anchor point. Keep ordinary layout scale at one; change dimensions or constraints rather than stretching transforms to approximate a design.
- Widget owns selected edges/centers and may overwrite position or size. Choose ONCE, ON_WINDOW_RESIZE, or ALWAYS from actual behavior; do not animate a property continuously rewritten by Widget.
- Layout drives children or container according to ResizeMode. Putting Layout and Widget on the same node can create competing ownership. Read back driven sizes after layout settles; call updateLayout only when same-frame measurement is required.
- Verify grid cell/constraint policy, padding, spacing, axis and growth direction. Keep nested layout chains shallow and batch repeated content changes.
- Responsive region patterns are options, not permission to reorganize existing prefabs. Reposition only the regions needed by the requested aspect-ratio change; retain roots, identities, references and animation tracks.

## Scrolling and clipping

- Use a ScrollView root, masked view and content node. Verify the actual content reference, enabled axes, inertia/brake/bounce, child-button cancellation and nested scrolling.
- Respect Mask renderer constraints and clipping boundaries. Do not add Sprite/Label renderers to a Mask node where its renderer is owned by the mask implementation.
- Pool large repeated lists. Test first/last items, resize, overflow and dynamic content in preview; dimensions alone do not prove visibility or input.

Sources: [Widget](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/widget.html), [Layout](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/layout.html), [SafeArea](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/safearea.html), [multi-resolution adaptation](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/engine/multi-resolution.html).\n`,
  'references/sprites-and-importers.md': `# SpriteFrames, nine-slice, and importer edits

- Resolve the source image, its .meta ownership and exact SpriteFrame subasset UUID before assignment or importer edits. Texture, ImageAsset and SpriteFrame are different asset types; never fabricate a subasset UUID.
- Inspect source dimensions, rect/trim/rotation, cap insets, Sprite type, sizeMode and UITransform dimensions. Set CUSTOM sizeMode before assigning a SpriteFrame when authored dimensions must remain fixed, then read back the final size after assignment.
- For sliced borders, retain source-coordinate insets and surviving SpriteFrame identities. Check that left+right and top+bottom fit the source rect and that corners/borders remain intact at the intended sizes. Do not derive importer coordinates from a downscaled screenshot.
- Use focused importer/AssetDB operations when available. If a narrowly scoped .meta edit is necessary, preserve unrelated importer settings, UUIDs, submeta mappings and atlas references, refresh the exact source, and verify imported state. Do not recreate metadata or copy a .meta file to duplicate an asset.
- Changing atlas membership, trimming or slicing can affect animation tracks, nested prefabs and material/batching behavior. Inspect incoming references before a structural change and report unsupported identity preservation rather than rebuilding references by name.
- After import, \`check_asset_ready\` verifies only the imported AssetDB identity; inspect the actual SpriteFrame and saved component binding separately. Save/reopen when persistence is required and visually inspect corners at the target size.
- Group compatible materials/textures only while preserving intended render order. Editor node/component counts are not a runtime draw-call or GPU measurement.

Sources: [Sprite](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/sprite.html) and [image assets](https://docs.cocos.com/creator/3.8/manual/en/asset/image.html).\n`,
  'references/text-and-localization.md': `# Fonts, text sizing, and requested localization

- Preserve the project's font system: system font, imported TTF/OTF, bitmap font, RichText, or a project-specific localization component. Resolve font assets and their actual component bindings; do not replace the font strategy merely to silence a warning.
- Verify fontSize, lineHeight, alignment, wrapping, contentSize, cacheMode and overflow at the intended viewport. CLAMP clips, SHRINK changes readable size and can cost CPU on dynamic text, and RESIZE_HEIGHT transfers height ownership to the label. Choose from project policy rather than applying SHRINK everywhere.
- Check CJK, punctuation, digits, icons and other required glyphs in representative strings. Include line breaks, long translations and dynamic/code-composed strings when localization is requested. A successful string assignment does not establish glyph coverage or readability.
- Bitmap-font atlas glyphs, character-cache capacity, fallback behavior and persisted font assets need separate checks. If coverage cannot be measured, report unknown rather than assuming all characters render.
- For requested localization, identify the existing locale IDs and mapping, text keys, authored labels, runtime formatting and fallback policy. Change only requested languages/scope and preserve existing services; do not install an unrelated localization package by default.
- Read back persisted font/text/localization references and representative outputs. Report covered, missing and unverified strings separately; inspecting authored labels does not prove coverage of runtime-generated text.
- Capture representative languages and aspect ratios and inspect missing glyphs, clipping, wrapping and layout growth. Native/device performance and input-method behavior require corresponding platform evidence.

Sources: [Label](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/label.html) and [font assets](https://docs.cocos.com/creator/3.8/manual/en/asset/font.html).\n`,
  'references/input-and-validation.md': `# Input, animation, and visual verification

- Verify Button/Toggle/Slider/EditBox target nodes, serialized component/handler/custom data, disabled state, hit area and focus behavior. Bind once; don't make duplicate listeners to compensate for an unresolved reference.
- Emitting Button click events checks callbacks, not real pointer dispatch. For hit testing use the actual Game View/preview and calibrated screenshot coordinates; verify the resulting state or screenshot rather than treating event delivery as the business outcome.
- Screenshot \`captureId\` identifies one image and its observed geometry. Use \`coordinateSpace="image-pixels"\` with coordinates in that exact PNG. Calibration maps to Electron content coordinates and rejects stale or changed targets. It does not identify a Button or prove absence of occlusion.
- Keep UIOpacity, active state, Button interactability and BlockInputEvents consistent. A transparent modal may still block input; a visible scrim may not block anything. Check sibling order, masks and hidden states in preview.
- Animate a Visual/Container child when Widget or Layout owns the root. Cancel/reconcile prior tweens, and verify deterministic position, scale, opacity, active state and close/reopen behavior. Use an explicit UI clock only if menus must animate during gameplay pause.
- Test only requested interactions. An input with unknown delivery/outcome must be followed by readback, not automatic replay. Restore temporary preview state only if still owned by this task.
- Use \`validate_scene\`, exact component/reference readback and screenshots as complementary evidence. A complete hierarchy or non-empty image does not prove correct layout, visible text, hit testing or business behavior.
- \`get_performance_snapshot\` reports edit-scene node/component/UI/depth/memory counters, not browser/Game View draw calls or GPU performance. Use actual runtime/platform measurements before making performance claims.
- Choose representative aspect ratios and locales for the target project. Record which checks passed, failed, were incomplete or require a device; avoid claiming universal validation from one screenshot.

Sources: [UI system](https://docs.cocos.com/creator/3.8/manual/en/2d-object/ui-system/) and [node hierarchy](https://docs.cocos.com/creator/3.8/manual/en/concepts/scene/node-tree.html).\n`,
});

function getProjectSkillReferences(skillName) {
  const templates = skillName === 'funplay-cocos-mcp-workflow' ? WORKFLOW_REFERENCES
    : skillName === 'funplay-cocos-ui-composition' ? UI_REFERENCES : {};
  return Object.entries(templates).map(([filePath, content]) => ({ path: filePath, content }));
}

module.exports = { getProjectSkillReferences };

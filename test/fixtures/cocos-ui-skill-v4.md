---
name: funplay-cocos-ui-composition
description: "Build and revise responsive Cocos Creator UI for mobile, desktop, and web, including portrait and landscape layouts, safe areas, prefabs, Widget and Layout behavior, scrolling, text, input, animation, and performance validation."
---

# Funplay Cocos UI Composition

## Instructions

For MCP writes, reconnects, or interactive drag tests, read [project identity and input](references/project-identity-and-input.md). Renderer frames are not native Game View engine updates or gameplay acceptance.

## UI Workflow

1. Inspect the active scene, Canvas, design resolution, target viewports, `UITransform`, `Widget`, `Layout`, existing `SafeArea` policy, prefab ownership and serialized references.
2. Preserve the user's design requirements and established project baseline. A full-page reference may define a new screen's baseline; clarify cropped or conflicting references instead of imposing a fixed resolution.
3. Preserve existing roots, node/component identities, event bindings, animation targets and nested prefabs. Change only what the request requires; do not rebuild the entire prefab unless explicitly requested.
4. Choose one owner for each position/size property. Avoid conflicting Widget, Layout, animation and manual writes. Use supported Cocos scene/prefab/AssetDB workflows for authored assets.
5. Read back exact dimensions, anchors, constraints, SpriteFrame/font references and event bindings. Save/reopen when persistence matters; use preview input and screenshots for visual or interaction claims.

## Design Fidelity

- Preserve authored spacing and the project's adaptation. Do not proactively add SafeArea containers, adaptation scripts or extra insets. New adaptation requires an explicit request or a demonstrated overlap confirmed with the user.
- Keep complete UI pages in saved prefabs when that fits the project; runtime hierarchy creation is not a substitute for requested authored UI.
- A tool response, hierarchy, edit-scene performance counter and screenshot prove different things. Report unverified runtime, device, glyph or business behavior explicitly.

## Read Only the Relevant References

- For resolution, orientation, SafeArea, Widget/Layout, scrolling or masks: [layout and adaptation](references/layout-and-adaptation.md).
- For SpriteFrames, nine-slice, atlas or importer edits: [sprites and importers](references/sprites-and-importers.md).
- For fonts, text overflow, glyph coverage or requested localization: [text and localization](references/text-and-localization.md).
- For event bindings, real input, animation, screenshots or performance evidence: [input and validation](references/input-and-validation.md).

These references are conditional; do not load every file for a focused edit.

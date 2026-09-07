---
name: funplay-cocos-ui-composition
description: "Build and revise responsive Cocos Creator UI for mobile, desktop, and web, including portrait and landscape layouts, safe areas, prefabs, Widget and Layout behavior, scrolling, text, input, animation, and performance validation."
---

# Funplay Cocos UI Composition

## Instructions

## Operating Loop

1. Inspect before editing.
   - Confirm the active scene, Canvas, design resolution, Fit Width/Fit Height policy, target orientations, SafeArea usage, and relevant prefab asset paths.
   - Inspect the existing hierarchy, `UITransform` sizes and anchor points, `Widget` constraints and align modes, `Layout` ownership, sibling order, render order, serialized references, animation targets, and prefab instance state.
   - Treat screenshots and design coordinates as visual intent, not as permission to replace a working hierarchy.
2. Classify each region.
   - Mark art as full-bleed or safe-area content.
   - Mark placement as edge-aligned by Widget, stretched between edges, content-sized by Layout, repeated content, scrollable content, modal, overlay, or world-space UI.
   - Decide which system owns position and size. Avoid letting Widget, Layout, animation, and manual code fight over the same property.
3. Make the smallest coherent change.
   - Preserve the prefab root, existing children, components, names, UUID-backed references, animation tracks, nested prefab links, and scene overrides unless a specific replacement is required.
   - Modify only the necessary nodes, components, fields, and children; do not rebuild the entire prefab unless explicitly requested.
   - Prefer Cocos MCP scene, prefab, and asset-db workflows over generic text replacement for serialized assets.
4. Read back and validate.
   - Read exact hierarchy, node UUIDs, `UITransform` sizes and anchors, Widget edges, Layout settings, sprites, labels, opacity, input blockers, event bindings, and prefab ownership back from Cocos.
   - Test layout, input, safe area, localization, animation interruption, close/reopen state, and runtime data changes.
   - Capture preview screenshots at representative aspect ratios. Use native builds on representative devices before claiming device performance or platform validation.

## Component Selection

| Component | Use it for | Configure deliberately | Avoid |
| --- | --- | --- | --- |
| `Canvas` | Root 2D/UI render space and design-resolution adaptation | Verify project design resolution, Fit Width/Fit Height, camera and layer behavior | Adding duplicate Canvases only to organize folders or assuming one resolution fits every aspect ratio |
| `UITransform` | UI size, anchor point, coordinate conversion, hit testing, and render priority | Set `contentSize` and anchor point intentionally; keep scale for visual effects rather than basic layout | Treating one screenshot position as universal or changing scale when size/Widget constraints should change |
| `Widget` | Edge, center, stretch, and parent-relative alignment | Choose top/bottom/left/right/center constraints and `ONCE`, `ON_WINDOW_RESIZE`, or `ALWAYS` based on runtime needs | Animating properties that an `ALWAYS` Widget rewrites at the end of the frame |
| `SafeArea` | Keeping critical controls inside notches and system gesture areas | Put it on the top interaction container; allow full-bleed backgrounds outside it | Applying safe-area insets twice or placing important controls outside the safe rectangle |
| `Layout` | Horizontal, vertical, or grid arrangement and container/child resizing | Choose type, resize mode, padding, spacing, constraint, and start axis; call `updateLayout` only when same-frame measurement is necessary | Putting Layout and Widget on the same node or manually positioning children driven by Layout |
| `Sprite` | Icons, panels, progress fills, and sliced or tiled UI art | Use sliced frames for scalable borders, preserve SpriteFrame references, and choose fill/type intentionally | Stretching bordered art as a simple Sprite or leaving decorative nodes interactive |
| `Label` / `RichText` | Localized text and formatted text | Set fonts, fallback coverage, alignment, wrapping, line height, overflow, and cache mode from actual update frequency | Broad `SHRINK` use on frequently changing labels or shipping without required CJK and symbol glyphs |
| `ScrollView` + `Mask` | Content larger than a viewport | Use a dedicated view/mask and content node, enable only required axes, and configure inertia, brake, bounce, and nested input deliberately | Combining Widget and Layout on the same Content node, or creating thousands of live rows without pooling |
| `Mask` | Rectangular, ellipse, graphics, or sprite-stencil clipping | Match the mask type to the visual requirement and keep renderer constraints in mind | Adding Sprite or Label renderers to a Mask node where Cocos requires the mask-owned Graphics/Sprite |
| `Button`, `Toggle`, `Slider`, `EditBox` | Semantic interaction | Verify transition state, target node, event handlers, hit area, keyboard/focus behavior, and disabled state | Duplicate event bindings, tiny touch targets, or visual-only disabled states |
| `UIOpacity` | Fading a UI subtree | Coordinate opacity with active state and input blocking | Hiding a modal visually while it still receives or blocks input |
| `BlockInputEvents` | Preventing pointer/touch events from passing through overlays and modals | Put it on the intended blocking region and validate sibling order and active state | Assuming a visible scrim blocks gameplay input by itself |
| `PageView` | Paged horizontal or vertical content | Recompute page and content sizes when the viewport changes and test drag thresholds | Hard-coding page positions from one device width |

## Design Resolution, Widget, and Safe Area

- Treat the design resolution as the coordinate baseline, not a physical-device whitelist. Verify the project Fit Width/Fit Height policy and any runtime `view.setDesignResolutionSize` policy before changing layout.
- Use Widget to express attachment and stretch. Use `ON_WINDOW_RESIZE` for resizable desktop/web or large-screen layouts, and use `ALWAYS` only when continuous alignment is worth its property ownership cost.
- When Widget owns an edge or size, change the Widget offsets or align mode rather than writing a Node position or UITransform size that will be overwritten later.
- Keep UI scale at one for ordinary layout. Resize through `UITransform.contentSize`, Widget constraints, Layout properties, or a deliberate design-resolution policy.
- Put decorative backgrounds outside the SafeArea interaction root so they can bleed to physical edges. Put buttons, labels, navigation, and other critical content under SafeArea.
- SafeArea already obtains `sys.getSafeAreaRect` and adjusts through Widget. Do not add a second manual inset unless the project has a documented additional margin.
- Re-evaluate layout on window resize, orientation change, or safe-area change when the target platform can change dimensions at runtime.

## Portrait and Landscape Patterns

- For portrait screens, organize persistent UI into Top, flexible Center, and Bottom regions. Let tall screens expand the center instead of multiplying every vertical coordinate by aspect ratio.
- For landscape screens, use Left, Center, Right, and stable corner regions. Verify 16:9, ultrawide, 16:10, and 4:3 instead of treating landscape as one shape.
- Separate camera/world composition from Canvas UI adaptation. A correct Widget layout does not prove the gameplay camera shows the intended world area.
- Use alternate art or deliberate cover/crop behavior when one background cannot preserve composition across phone, tablet, and desktop aspect ratios.
- Reposition only regions whose composition genuinely changes. Do not fork or rebuild the entire screen prefab for a few aspect-dependent offsets.

## Auto Layout and Dynamic Content

- A Layout component drives its children or container according to `ResizeMode`. Do not manually write the driven dimensions and expect them to survive the next layout update.
- For `ResizeMode.CHILDREN`, verify the container size and the resulting child sizes. For `ResizeMode.CONTAINER`, verify anchor point and growth direction so the container expands predictably.
- Grid Layout uses its configured cell and constraint policy. Use fixed rows or columns deliberately and do not expect heterogeneous child preferred sizes to define every cell.
- Runtime Layout property changes normally settle on the next frame. Call `updateLayout` only when code must read the final result in the same operation.
- Keep nested Layout chains shallow, batch data changes, pool repeated items, and avoid rebuilding a large hierarchy for every small model update.

## Sprites, Text, Scrolling, and Input

- Use sliced SpriteFrames for scalable bordered panels and buttons. Preserve caps/insets and inspect the actual SpriteFrame reference after prefab edits.
- For Label, choose `CLAMP`, `SHRINK`, or `RESIZE_HEIGHT` from a documented overflow policy. `SHRINK` can cost more CPU when text updates; `RESIZE_HEIGHT` transfers height ownership to the label.
- Choose Label cache mode from content behavior: avoid caching assumptions for highly dynamic text, and verify character coverage and atlas capacity for localized content.
- Structure a ScrollView as root, masked view, and content. Enable only the needed direction, verify the content reference, and test child-button cancellation and nested scroll behavior.
- Keep one intentional interactive target per control, bind events once, and validate the serialized target, component, handler, and custom event data.
- Give touch controls a project-defined minimum hit area even when the visible art is smaller. Verify with preview input rather than only inspecting dimensions.
- Synchronize modal visibility, `UIOpacity`, active state, Button interactability, and `BlockInputEvents` so hidden panels neither receive nor leak input.

## Animation and Prefab Safety

- Animate a `Visual` or `Container` child when the root is driven by Widget or Layout. Do not animate a property that layout rewrites every frame.
- Stop or cancel an existing tween/animation before replaying it and restore deterministic position, scale, opacity, active state, and input blocking on disable or close.
- Use unscaled scheduling or an explicit UI clock when menus and modal transitions must continue while gameplay time scale is zero.
- Preserve existing prefab objects by default. Replacing a prefab hierarchy can break internal object IDs, animation tracks, serialized component references, nested prefabs, and scene overrides even when the asset UUID remains stable.
- Prefer serialized references and stable semantic names over repeated `getChildByPath` lookups. If a path is required, verify it and fail clearly rather than silently creating an alternate hierarchy.

## Performance and Validation

- Profile before restructuring. Common UI costs include excessive nodes, draw-call breaks, masks/stencils, overdraw, dynamic text generation, repeated Layout work, and large unpooled lists.
- Preserve render batching by grouping compatible sprites and materials without changing intended sibling/render order. Use dynamic atlas or static batching only after verifying asset eligibility and runtime behavior.
- Use `get_performance_snapshot` to compare node, component, UI, depth, and memory-oriented counters before and after material changes.
- Validate portrait at 16:9, 19.5:9 or 20:9, a cutout phone, and a portrait tablet. Validate landscape at 16:9, ultrawide, 16:10, 4:3, and both cutout sides.
- In every profile, verify full-bleed art, safe interactive content, text overflow and glyphs, scroll bounds, modal blocking, touch targets, animation interruption, and close/reopen state.

## Official Cocos References

- [Cocos Creator 3.8 UI system](https://docs.cocos.com/creator/3.8/manual/en/ui-system/)
- [UITransform](https://docs.cocos.com/creator/3.8/api/en/class/UITransform) and [Widget](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/widget.html)
- [SafeArea](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/safearea.html) and [multi-resolution adaptation](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/engine/multi-resolution.html)
- [Layout](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/layout.html) and [ScrollView](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/scrollview.html)
- [Label](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/label.html) and [Mask](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/mask.html)
- [Node hierarchy and UI rendering order](https://docs.cocos.com/creator/3.8/manual/en/concepts/scene/node-tree.html)

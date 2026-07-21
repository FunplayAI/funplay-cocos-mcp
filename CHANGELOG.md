# Changelog

All notable changes to Funplay MCP for Cocos will be documented in this file.

This project follows a simple changelog format inspired by [Keep a Changelog](https://keepachangelog.com/), and uses semantic versioning when releases are tagged.

## [Unreleased]

## [0.4.4] - 2026-07-20

### Added

- Added English and Chinese localization for extension menus, panel titles, controls, status messages, prompts, and empty states.
- Added a project-level language setting with `Auto / 跟随 Cocos Creator`, `中文`, and `English` options.
- Added Chinese descriptions and localized profile labels for all 105 tools shown in the Tool Exposure window while preserving MCP tool IDs and schemas in English.

### Optimized

- Kept the four focused management windows on one shared localization layer so language changes remain consistent across dashboard, tool exposure, settings, and activity workflows.
- Prevented interface-only configuration changes, including language selection, from rebuilding MCP runtime state or clearing activity logs.

### Fixed

- Fixed 12-hour timestamps such as `11:37:12 PM` overlapping tool names in the Activity window.

## [0.4.3] - 2026-07-16

### Added

- Added `get_preview_mode` and `set_preview_mode` with explicit `browser`, `gameView`, and `simulator` semantics.

### Changed

- Reworked `run_project_preview` to use the Cocos Creator 3.8.x preview APIs, return the effective mode and browser preview URL, and retain `platform` as a deprecated alias for `mode`.

### Fixed

- Fixed [#3](https://github.com/FunplayAI/funplay-cocos-mcp/issues/3): restored preview launch on Cocos Creator 3.8.8 by replacing the nonexistent `preview.start`, `preview.open-preview`, and `builder.preview` messages.

## [0.4.2] - 2026-07-12

### Added

- Added `create_scene` to the default `core` profile for creating an empty scene or copying the active scene directly to an assets path without an interactive save dialog.

### Optimized

- Expanded the default `core` profile to 38 tools and the `full` profile to 103 tools, with synchronized English, Chinese, and generated tool documentation.

### Fixed

- Fixed `run_script_diagnostics` returning `spawn EINVAL` on Windows by running the TypeScript compiler script through Node instead of launching `tsc.cmd` directly.
- Fixed TypeScript diagnostics inside Cocos Creator incorrectly treating the Creator executable as a normal Node runtime, which could report a false successful result without running `tsc`.

## [0.4.1] - 2026-07-02

### Added

- Added `create_prefab_from_node`, a Cocos Creator 3.8.x-friendly prefab creation tool that serializes a scene node in the scene process and persists the prefab through asset-db instead of relying on the brittle `scene:create-prefab` message.
- Added automatic release checks and panel actions for opening the latest GitHub Release or installing a verified update package.
- Added a checksum-verified one-click updater that downloads the release zip, verifies `SHA256SUMS.txt`, backs up the current extension, replaces package files, and reloads the extension when the Cocos package API supports it.
- Added focused Cocos panel windows for Tool Exposure, MCP Settings, and Activity & Logs, with the main MCP Server panel reduced to a dashboard-style workflow.
- Added a Unity MCP-style Tool Exposure window with grouped tool lists, per-tool toggles, category select/clear actions, and a single-card Recent Activity stream with status badges.

### Fixed

- Treat undefined editor message responses as inconclusive for prefab creation and verify the resulting prefab file/asset before reporting success.
- Refuse one-click updates for symlink or git-worktree extension installs so local development checkouts are not overwritten accidentally.

## [0.4.0] - 2026-06-11

### Added

- Added project identity metadata to `/health` and MCP `initialize` responses so clients and duplicate listeners can verify the active Cocos project safely.
- Added same-project listener attach behavior before port fallback, preventing accidental attachment to a different Cocos project on the same port.
- Added default-on JavaScript safety checks for `execute_javascript`, `execute_scene_script`, and `execute_editor_script`, with per-call `safety_checks` overrides.
- Added named tool profiles in the Cocos panel, including save, apply, delete, import, and export workflows.
- Added category-level tool exposure controls in the panel for quick enable, disable, and clear actions.
- Added asset dependency tools: `inspect_asset_dependencies` and `validate_asset_dependencies`.
- Added Cocos project/editor tools: `get_build_status`, `open_build_panel`, `run_project_preview`, `save_current_scene`, `get_editor_preference`, `set_editor_preference`, and `broadcast_editor_message`.
- Added Button event binding tools: `list_button_click_events` and `bind_button_click_event`.
- Added `create_cocos_mcp_project_skill` for generating a recommended local Codex workflow skill.
- Added release package sensitive-content scanning for npm/GitHub/MCP token-like values and private keys.

### Optimized

- Improved tool exposure UX for larger projects by making custom profiles reusable and shareable.
- Expanded generated tool documentation and README coverage for the new 37-tool `core` profile and 101-tool `full` profile.
- Improved release packaging confidence with checksum verification and content scanning.

### Changed

- Expanded the default `core` profile from 34 tools to 37 tools.
- Expanded the `full` profile from 89 tools to 101 tools.
- Split more tool implementations into focused modules under `lib/tools/`, including advanced assets, Cocos project/editor helpers, and scene event helpers.
- Persisted `executeJavascriptSafetyChecks`, active tool profile names, and saved tool profiles in project configuration.

### Fixed

- Fixed the GitHub Release workflow so release pages use generated English changelog-style `RELEASE_NOTES.md` instead of the artifact installation README.
- Fixed release package scanning false positives around normal MCP server config names while preserving credential detection.

### Security

- Added guardrails for JavaScript execution against obvious risky file-system and shell patterns, including delete/truncate calls, raw writable streams, path traversal, user/system absolute paths, and `child_process`.

## [0.3.3] - 2026-05-20

### Added

- Added generated tool reference documentation in `docs/TOOLS.md`.
- Added `docs:generate` and `docs:check` scripts to keep tool counts, profiles, categories, and descriptions synchronized with `lib/tool-registry.js`.
- Added a read-only `GET /tools` debug endpoint with curl examples for quick local troubleshooting.
- Added panel activity previews for recent tool calls and runtime logs.
- Added panel curl copy actions for `/health` and `/tools`.

### Optimized

- Added CI and release validation for generated tool documentation.
- Improved the MCP client config panel so the preview follows the selected client target.
- Improved the panel information architecture around troubleshooting and maintenance: version, update status, tool profile, client config, recent calls, and logs.

### Changed

- Refined tool category inference so `get_tool_catalog` is grouped with project/context tools.
- Split file-system tools and asset refresh helpers into `lib/tools/files.js` as the first registry modularization step.

### Fixed

- No runtime bug fixes in this release; this release focuses on product polish, debugging ergonomics, and maintainability.

## [0.3.2] - 2026-05-20

### Added

- Added an npm-installable `funplay-cocos-mcp` stdio wrapper that bridges MCP clients to the local Cocos HTTP endpoint.
- Added MCP Registry metadata in `server.json`, including npm package ownership metadata via `mcpName`.
- Added wrapper tests, npm pack dry-run verification, and registry validation scripts.

## [0.3.1] - 2026-05-20

### Added

- Added a documented release workflow and release checklist for Cocos extension publishing.
- Added release packaging scripts that generate a Cocos extension zip, release manifest, checksum file, and per-release README.
- Added CI validation for release metadata.

## [0.3.0] - 2026-05-20

### Added

- Added MCP `outputSchema` and `annotations` to listed tools.
- Added a standard structured tool result envelope with `ok`, `tool`, `callId`, `summary`, `data`, and follow-up `refs`.
- Added prefab workflow tools: `inspect_prefab`, `validate_prefab_references`, `duplicate_prefab`, `edit_prefab_json`, `create_prefab_instance`, `inspect_prefab_instance`, `apply_prefab_instance`, and `revert_prefab_instance`.
- Added `get_performance_snapshot` and expanded `validate_scene` with scene scale/performance-oriented counters.
- Added project AI instruction tools: `list_project_instructions`, `read_project_instruction`, `write_project_instruction`, and `create_project_skill`.
- Added tests for tool metadata, result envelopes, and project instruction helpers.

### Changed

- Expanded the default `core` profile from 28 tools to 34 tools.
- Expanded the `full` profile from 76 tools to 89 tools.
- Updated tool interaction logs to store concise result summaries from the standard envelope.

## [0.2.0] - 2026-05-20

### Added

- Added a panel and tool-level update checker for comparing the installed extension version with the latest GitHub release.
- Added `custom` tool exposure with per-category and per-tool include/exclude configuration.
- Added `get_tool_catalog`, `check_for_updates`, `get_recent_logs`, `search_project_logs`, `clear_logs`, and `validate_scene`.
- Added MCP log resources: `cocos://logs/editor` and `cocos://logs/project`.
- Added in-memory runtime logs alongside the existing MCP interaction history.
- Added optional Streamable HTTP session support via `enableSessions` and `Mcp-Session-Id`.

### Changed

- Expanded the default `core` profile from 22 tools to 28 tools.
- Expanded the `full` profile from 70 tools to 76 tools.
- Updated the Cocos panel to show installed version, update status, session toggle, and tool exposure controls.
- Tightened Streamable HTTP behavior for `Accept` headers, JSON-RPC notifications/responses, `202 Accepted`, unsupported GET/SSE requests, and DELETE session termination.

### Fixed

- Improved project log tailing so trailing blank lines do not hide the last useful log entries.

## [0.1.4] - 2026-05-11

### Fixed

- Fixed CI test expectations after expanding the documented `core` and `full` tool profiles.
- Aligned the latest release line with the current tested `main` branch state.

## [0.1.3] - 2026-05-11

### Added

- Added `get_editor_state` as a compact structured editor-state summary tool.
- Added `get_selection` and `set_selection` as explicit selection workflow tools for editor-side automation.
- Added persistence for the selected one-click MCP client target in the Cocos panel configuration.

### Changed

- Expanded the default `core` profile from 19 tools to 22 tools by promoting editor-state and selection workflows.
- Expanded the `full` profile from 67 tools to 70 tools.
- Updated panel config persistence so changing the selected MCP client target no longer restarts the server unnecessarily.

## [0.1.2] - 2026-04-30

### Added

- Added Node.js unit tests for MCP protocol negotiation, tool profile exports, tool execution errors, and project file path safety.

### Changed

- Updated the MCP initialize response to negotiate protocol version `2025-11-25` by default while retaining compatibility with older supported protocol versions.
- Added `structuredContent` to tool call results when a tool returns structured JSON data.
- Changed tool execution failures to return MCP tool errors instead of JSON-RPC internal errors, improving client-side self-correction.
- Updated CI to run the new Node.js test suite.

### Security

- Restricted project file and asset-path resources to paths inside the active Cocos project root.
- Added HTTP request body size limits and invalid `Origin` header rejection for the embedded MCP server.

## [0.1.1] - 2026-04-16

### Added

- Added automatic port fallback when the configured MCP port is already occupied.
- Added actual-running-port reporting in MCP server status and panel state.
- Added `.github/pull_request_template.md` for repository contribution guidance.
- Added `.github/workflows/ci.yml` for lightweight GitHub validation.
- Added a lightweight GitHub Star promotion log after successful MCP server startup.

### Changed

- Updated one-click MCP client configuration to write the actual running server port instead of the requested port when port fallback is active.
- Updated the MCP panel status line to show configured-port to actual-port fallback information.
- Updated the English and Chinese README files to document automatic port fallback behavior.

### Fixed

- Fixed VS Code one-click configuration to use platform-specific config paths with macOS fallback behavior.
- Fixed Windows one-click MCP configuration path resolution by using a more reliable home/appdata lookup strategy.

## [0.1.0] - 2026-04-15

### Added

- Embedded HTTP MCP server inside a Cocos Creator extension.
- `Funplay > MCP Server` editor panel for service management and one-click MCP client configuration.
- One-click configuration support for Claude Code / Claude Desktop, Cursor, VS Code, Trae, Kiro, and Codex.
- Primary unified tool: `execute_javascript`.
  - `context: "scene"` for active scene/runtime automation.
  - `context: "editor"` for Cocos editor/browser automation.
- Compatibility execution tools:
  - `execute_scene_script`
  - `execute_editor_script`
- MCP protocol capabilities:
  - `initialize`
  - `tools/list`
  - `tools/call`
  - `resources/list`
  - `resources/read`
  - `resources/templates/list`
  - `prompts/list`
  - `prompts/get`
- `core` tool profile with 19 high-signal tools.
- `full` tool profile with 67 tools.
- Scene and hierarchy inspection tools.
- Node, component, UI, camera, animation, prefab, and asset tools.
- File read/write/search tools and asset refresh helpers.
- TypeScript diagnostic tools for Cocos projects.
- Runtime state and time-scale control tools.
- Button, node event, component method, mouse, keyboard, and preview input simulation tools.
- Desktop, editor, scene, game, and preview screenshot tools.
- MCP resources for project context, scene state, selection, script errors, and interaction history.
- MCP prompts for script repair, playable prototype creation, scene validation, and scene auto-wiring.
- Debug logs for server lifecycle events.
- English and Chinese README files.
- MIT license file.

### Changed

- Promoted `execute_javascript` as the recommended primary tool across tool descriptions, prompts, and documentation.
- Simplified the Cocos panel to focus on service management and MCP client configuration.
- Changed the menu entry to `Funplay > MCP Server`.
- Slimmed the default `core` profile from 50 tools to 19 high-signal tools centered on project understanding, diagnostics, and visual validation.

### Fixed

- Fixed panel initialization issues caused by unsafe DOM querying.
- Fixed relative-path handling for asset open/select workflows.
- Fixed bundled Cocos TypeScript diagnostic lookup.
- Improved scene/game screenshot targeting with panel-level cropping when available.
- Improved low-level mouse drag coordinates for panel-relative input injection.

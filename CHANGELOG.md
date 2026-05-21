# Changelog

All notable changes to Funplay MCP for Cocos will be documented in this file.

This project follows a simple changelog format inspired by [Keep a Changelog](https://keepachangelog.com/), and uses semantic versioning when releases are tagged.

## [Unreleased]

## [0.3.3] - 2026-05-20

### Added

- Added generated tool reference documentation in `docs/TOOLS.md`.
- Added `docs:generate` and `docs:check` scripts to keep tool counts, profiles, categories, and descriptions synchronized with `lib/tool-registry.js`.
- Added CI and release validation for generated tool documentation.
- Added a read-only `GET /tools` debug endpoint with curl examples for quick local troubleshooting.
- Added panel activity previews for recent tool calls and runtime logs.
- Added panel curl copy actions for `/health` and `/tools`.

### Changed

- Refined tool category inference so `get_tool_catalog` is grouped with project/context tools.
- Updated the MCP client config panel so the preview follows the selected client target.
- Split file-system tools and asset refresh helpers into `lib/tools/files.js` as the first registry modularization step.

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

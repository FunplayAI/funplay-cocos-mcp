# Changelog

All notable changes to Funplay MCP for Cocos will be documented in this file.

This project follows a simple changelog format inspired by [Keep a Changelog](https://keepachangelog.com/), and uses semantic versioning when releases are tagged.

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

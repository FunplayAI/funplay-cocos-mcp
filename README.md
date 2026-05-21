<p align="center">
  <h1 align="center">Funplay MCP for Cocos</h1>
  <p align="center">
    <strong>An Embedded MCP Server for Cocos Creator Editor</strong>
  </p>
  <p align="center">
    <a href="#"><img src="https://img.shields.io/badge/Cocos%20Creator-3.8%2B-blue" alt="Cocos Creator 3.8+"></a>
    <a href="#"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
    <a href="#"><img src="https://img.shields.io/badge/MCP-Compatible-green" alt="MCP Compatible"></a>
    <a href="#"><img src="https://img.shields.io/badge/Platform-Editor%20Only-orange" alt="Editor Only"></a>
  </p>
  <p align="center">
    <a href="./README_CN.md">中文</a> | English
  </p>
</p>

> If this project helps your Cocos workflow, please consider giving it a Star. It helps more developers discover the project and supports ongoing development.

---

Funplay MCP for Cocos is an MIT-licensed Cocos Creator extension that embeds an HTTP MCP server directly inside the editor. It lets AI assistants such as Claude Code, Cursor, Codex, VS Code Copilot, Trae, and Kiro inspect and operate your running Cocos project.

The package follows the same product direction as Funplay MCP for Unity: keep the default tool surface focused, provide a one-click client configuration window, and make one high-flexibility execution tool the primary workflow.

For Cocos, the primary tool is `execute_javascript`:

- `context: "scene"` runs JavaScript in the active Cocos scene/runtime context
- `context: "editor"` runs JavaScript in the Cocos editor/browser context

> *"Create a login page UI with account/password fields and a main login button."*
>
> Your AI assistant can call `execute_javascript`, build the UI hierarchy under the active Canvas, attach Cocos components, inspect the result, and capture a screenshot for validation.

## Quick Start

If you just want to connect quickly, do these three things:

- Install this repository as a Cocos Creator extension
- Open `Funplay > MCP Server`
- Use the built-in one-click MCP client configuration

### 1. Install as a Cocos Creator Extension

Clone or copy this repository into your Cocos project extension directory:

```bash
cd /path/to/your-cocos-project
mkdir -p extensions
git clone https://github.com/FunplayAI/funplay-cocos-mcp.git extensions/funplay-cocos-mcp
```

Then restart Cocos Creator or reload extensions from the editor.

For a non-git install, download `Funplay.CocosMcp.v<version>.zip` from the GitHub Releases page, unzip it, and move the extracted `funplay-cocos-mcp` folder into your project `extensions/` directory.

You can also install it globally by copying the folder into your Cocos Creator user extensions directory.

### 2. Start the MCP Server

Open the editor menu:

```text
Funplay > MCP Server
```

The server runs on `http://127.0.0.1:8765/` by default.

If the configured port is already occupied, the extension automatically falls back to the next available local port and uses the actual running port for one-click MCP client configuration.

The panel is intentionally small:

- Enable or disable the MCP server
- Change the server port
- Switch tool exposure between `core`, `full`, and `custom`
- Check the installed version against the latest GitHub release
- Inspect recent tool calls and runtime log previews
- Tune tool exposure by category or individual tool
- Configure AI clients with one click and preview the selected client config
- Copy quick `curl` commands for `/health` and `/tools`
- Expand debug output only when needed

### 3. Configure Your AI Client

Use the built-in **MCP Client Config** section in the `Funplay > MCP Server` panel first.

Select your target client, click **One-Click Configure**, and the extension writes the recommended MCP config entry for you.

The MCP server name written to clients is:

```text
funplay_cocos
```

If you prefer to edit config files manually, use the examples below as fallback references.

<details>
<summary>Claude Code / Claude Desktop</summary>

```json
{
  "mcpServers": {
    "funplay_cocos": {
      "type": "http",
      "url": "http://127.0.0.1:8765/"
    }
  }
}
```

</details>

<details>
<summary>Cursor</summary>

```json
{
  "mcpServers": {
    "funplay_cocos": {
      "url": "http://127.0.0.1:8765/"
    }
  }
}
```

</details>

<details>
<summary>VS Code</summary>

```json
{
  "servers": {
    "funplay_cocos": {
      "type": "http",
      "url": "http://127.0.0.1:8765/"
    }
  }
}
```

</details>

<details>
<summary>Trae</summary>

```json
{
  "mcpServers": {
    "funplay_cocos": {
      "url": "http://127.0.0.1:8765/"
    }
  }
}
```

</details>

<details>
<summary>Kiro</summary>

```json
{
  "mcpServers": {
    "funplay_cocos": {
      "type": "http",
      "url": "http://127.0.0.1:8765/"
    }
  }
}
```

</details>

<details>
<summary>Codex</summary>

```toml
[mcp_servers.funplay_cocos]
url = "http://127.0.0.1:8765/"
```

</details>

### Optional: npm stdio Wrapper

If your MCP client prefers a local `stdio` command, install the npm wrapper after starting the Cocos editor server:

```bash
npm install -g funplay-cocos-mcp
```

Example MCP client entry:

```json
{
  "mcpServers": {
    "funplay_cocos": {
      "command": "funplay-cocos-mcp",
      "env": {
        "FUNPLAY_COCOS_MCP_URL": "http://127.0.0.1:8765/"
      }
    }
  }
}
```

The wrapper bridges stdio MCP traffic to the embedded Cocos HTTP endpoint. You can also run it with `npx funplay-cocos-mcp --url http://127.0.0.1:8765/`.

### 4. Verify the Connection

Open your AI client and try a few safe requests first:

- "Call `get_project_info` and summarize the current Cocos project."
- "Read `cocos://project/context` and tell me the editor status."
- "Use `execute_javascript` with `context: \"scene\"` to return the active scene name."
- "Use `execute_javascript` with `context: \"editor\"` to return the project path."

If these work, the MCP server, resources, prompts, and primary execution tool are connected correctly.

For local transport debugging, the panel can copy these commands, or you can run them directly:

```bash
curl http://127.0.0.1:8765/health
curl http://127.0.0.1:8765/tools
```

### 5. Start Building

Try a higher-level prompt in your AI client:

> Create a login page UI in the current Cocos scene with account/password fields, a login button, and a guest-login button. Use `execute_javascript` first, inspect the hierarchy, then capture a screenshot.

## Before You Start

- This extension is **Editor-only**. It is meant to automate Cocos Creator, not to add runtime dependencies to your final game build.
- The MCP server listens on `http://127.0.0.1:8765/` by default.
- If the configured port is busy, the server automatically falls back to the next available port and the panel/client config use the actual running port.
- `GET /health` and `GET /tools` are read-only debug endpoints for quick local checks outside an MCP client.
- The default `core` profile exposes 34 high-signal tools. Switch to `full` for all 89 tools, or use `custom` to include/exclude tool categories and individual tools.
- The panel includes a manual update check against the latest GitHub release.
- Streamable HTTP responses follow the MCP transport requirements for `Accept`, `MCP-Protocol-Version`, JSON-RPC notifications/responses, and optional `Mcp-Session-Id` sessions.
- Tool listings include MCP `outputSchema` and `annotations`; structured tool results use a standard envelope with `ok`, `tool`, `callId`, `summary`, `data`, and follow-up `refs`.
- All exposed MCP tools execute directly. There is no extra approval toggle inside the Cocos extension.
- File tools and `cocos://asset/path/...` resources are restricted to the active Cocos project root.
- The recommended workflow is `execute_javascript` first, then focused helper tools for screenshots, diagnostics, assets, and inspection.
- If you change the server port or tool exposure in the panel, the extension saves the config and restarts the server when needed.

## Why This Project

- **`execute_javascript` First** — One high-flexibility JavaScript tool can orchestrate scene/runtime work and editor-side automation without flooding AI clients with too many narrow tool calls
- **Embedded Cocos Extension** — No separate Python daemon or external bridge process is required for the Cocos-side plugin
- **One-Click Client Configuration** — Configure Claude Code, Cursor, VS Code, Trae, Kiro, and Codex directly from Cocos Creator
- **Project Context Built In** — Exposes live project, scene, selection, script diagnostics, logs, and interaction-history resources
- **Focused by Default, Full When Needed** — `core` reduces tool-list noise; `full` exposes every available tool; `custom` lets you tune by category or tool
- **Visual Validation** — Scene/editor/preview screenshots and input simulation help AI verify UI and gameplay changes

## Highlights

- **89 Built-in Tools** — Scene hierarchy, editor state, selection workflows, prefabs, assets, project instructions, UI creation, components, files, logs, script diagnostics, screenshots, runtime control, and input simulation
- **Primary Unified Tool** — `execute_javascript` supports both `scene` and `editor` contexts
- **Resources & Prompts** — Live project/log resources plus reusable workflows like script fixing, scene validation, and playable prototype creation
- **Cocos Panel UI** — A compact `Funplay > MCP Server` panel for service management, update checks, tool exposure, recent activity, logs, curl diagnostics, and MCP client setup
- **Screenshot and Input Support** — Capture editor/scene/game/preview screenshots and send Electron-level mouse/keyboard events
- **Vendor Agnostic** — Works with any AI client that supports MCP over HTTP JSON-RPC

## Relationship to Funplay MCP for Unity

Funplay MCP for Cocos follows the same design principles as Funplay MCP for Unity, adapted to Cocos Creator's JavaScript/TypeScript editor environment.

| Area | Funplay MCP for Cocos | Funplay MCP for Unity |
|------|------------------------|------------------------|
| Editor integration | Cocos Creator extension | Unity Editor package |
| Embedded server | Built-in HTTP MCP server | Built-in HTTP MCP server |
| Primary execution tool | `execute_javascript` | `execute_code` |
| Primary language | JavaScript in scene/editor contexts | C# in Unity editor/runtime contexts |
| Default profile | `core` with 34 tools | `core` focused tool profile |
| Full profile | 89 tools plus `custom` exposure | 79 tools |
| Client setup | One-click config panel | One-click config window |

## MCP Capabilities

The current package exposes four capability layers:

- **Tools** — 34 tools in `core`, 89 tools in `full`, plus `custom` include/exclude rules
- **Primary execution** — `execute_javascript` for scene/runtime and editor/browser automation
- **Prompts** — `fix_script_errors`, `create_playable_prototype`, `scene_validation`, and `auto_wire_scene`
- **Resources** — project context, scene summaries, current selection, script diagnostics, asset selection, logs, and MCP interaction history

For the generated tool reference, including categories, profiles, and read/mutation hints, see [docs/TOOLS.md](./docs/TOOLS.md).

The default `core` set is intentionally small: `execute_javascript`, `execute_scene_script`, `execute_editor_script`, `get_editor_state`, `get_tool_catalog`, `check_for_updates`, `get_selection`, `list_project_instructions`, `read_project_instruction`, `set_selection`, `get_project_info`, `get_scene_info`, `get_hierarchy`, `list_scenes`, `open_scene`, `inspect_prefab`, `validate_prefab_references`, `inspect_prefab_instance`, `list_assets`, `inspect_asset`, `open_asset`, `select_asset`, `run_script_diagnostics`, `get_recent_logs`, `search_project_logs`, `clear_logs`, `validate_scene`, `get_performance_snapshot`, `get_script_diagnostic_context`, `get_runtime_state`, `capture_editor_screenshot`, `capture_scene_screenshot`, `capture_preview_screenshot`, and `list_editor_windows`.

## Built-in Resources

| Resource | Description |
|----------|-------------|
| `cocos://project/context` | Full project and editor context |
| `cocos://project/summary` | Short project summary |
| `cocos://scene/active` | Active scene snapshot |
| `cocos://scene/current` | Alias for the current scene |
| `cocos://selection/current` | Current editor selection |
| `cocos://selection/asset` | Current selected asset |
| `cocos://errors/scripts` | Script diagnostics |
| `cocos://logs/editor` | Recent MCP runtime logs and tool interactions |
| `cocos://logs/project` | Recent tails from common project log files |
| `cocos://mcp/interactions` | Recent MCP interaction history |

## Built-in Tools

Funplay MCP for Cocos currently ships with **89 tool functions** in the `full` profile:

| Category | Tools |
|----------|-------|
| **Script Execution** | `execute_javascript`, `execute_scene_script`, `execute_editor_script` |
| **Editor State** | `get_editor_state`, `get_tool_catalog`, `check_for_updates`, `get_selection`, `set_selection`, `get_editor_selection` |
| **Project Instructions** | `list_project_instructions`, `read_project_instruction`, `write_project_instruction`, `create_project_skill` |
| **Project & Scene** | `get_project_info`, `get_scene_info`, `get_hierarchy`, `find_nodes`, `inspect_node`, `list_scenes`, `open_scene`, `run_scene_asset` |
| **Node Editing** | `create_node`, `delete_node`, `set_node_transform` |
| **Assets & Prefabs** | `list_assets`, `inspect_asset`, `open_asset`, `select_asset`, `delete_asset`, `list_prefabs`, `inspect_prefab`, `validate_prefab_references`, `duplicate_prefab`, `edit_prefab_json`, `create_prefab_instance`, `inspect_prefab_instance`, `apply_prefab_instance`, `revert_prefab_instance`, `instantiate_prefab` |
| **Components** | `list_components`, `inspect_component`, `add_component`, `remove_component`, `set_component_property`, `reset_component_property` |
| **UI** | `create_canvas`, `create_label`, `create_button`, `create_sprite` |
| **Camera** | `list_cameras`, `create_camera`, `set_camera_properties` |
| **Animation** | `list_animations`, `add_animation_clip`, `play_animation`, `stop_animation` |
| **Files** | `read_file`, `get_file_snippet`, `write_file`, `replace_in_file`, `search_files`, `list_directory`, `exists`, `refresh_assets` |
| **Diagnostics & Logs** | `run_script_diagnostics`, `get_script_diagnostic_context`, `get_recent_logs`, `search_project_logs`, `clear_logs`, `validate_scene`, `get_performance_snapshot` |
| **Runtime** | `get_runtime_state`, `pause_runtime`, `resume_runtime`, `set_time_scale` |
| **Interaction** | `emit_node_event`, `simulate_button_click`, `invoke_component_method`, `simulate_mouse_click`, `simulate_mouse_drag`, `simulate_key_press`, `simulate_key_combo`, `simulate_preview_input` |
| **Screenshots & Windows** | `capture_desktop_screenshot`, `capture_editor_screenshot`, `capture_scene_screenshot`, `capture_game_screenshot`, `capture_preview_screenshot`, `list_editor_windows` |

## Primary Tool Examples

### Scene Context

```json
{
  "context": "scene",
  "code": "return { sceneName: scene.name, rootCount: scene.children.length };",
  "args": {}
}
```

### Editor Context

```json
{
  "context": "editor",
  "code": "return { projectPath: context.projectPath, toolCount: helpers.listTools().length };",
  "args": {}
}
```

Editor-context scripts receive `Editor`, `fs`, `path`, `os`, `require`, `context`, `args`, and helper functions such as `helpers.getStatus()`, `helpers.listTools()`, `helpers.readResource(uri)`, `helpers.callTool(name, args)`, and `helpers.configureClient(targetId)`.

## Optional Configuration

Place `funplay-cocos-mcp.config.json` in the Cocos project root:

```json
{
  "host": "127.0.0.1",
  "port": 8765,
  "toolProfile": "core",
  "enabledToolCategories": [],
  "disabledToolCategories": [],
  "enabledTools": [],
  "disabledTools": [],
  "enableSessions": false,
  "autostart": true,
  "maxInteractionLogEntries": 50
}
```

Environment variables are also supported:

- `COCOS_MCP_HOST`
- `COCOS_MCP_PORT`
- `COCOS_MCP_PROFILE`

`toolProfile: "custom"` starts from the `core` set, then adds `enabledToolCategories` / `enabledTools` and removes `disabledToolCategories` / `disabledTools`. `enableSessions` is off by default because this server does not need cross-request client state for normal editor automation.

## Architecture

```text
Cocos Creator Extension
    ├─ browser.js
    │   ├─ Embedded HTTP MCP Server
    │   ├─ Tool Registry
    │   ├─ Resource Provider
    │   ├─ Prompt Provider
    │   └─ One-Click Client Configuration
    ├─ scene.js
    │   └─ Scene/runtime execution bridge
    ├─ panel/index.js
    │   └─ Minimal MCP Server panel
    └─ lib/
        ├─ assets, diagnostics, screenshots, input
        └─ server, resources, prompts, tool registry
```

The server speaks MCP-style HTTP JSON-RPC 2.0 and supports tools, resources, resource templates, prompts, health checks, and a read-only `/tools` debug endpoint.

## Development

Run checks before publishing changes:

```bash
npm run check
npm test
npm run docs:check
npm run release:check
npm run pack:dry-run
```

Regenerate the tool reference after changing `lib/tool-registry.js`:

```bash
npm run docs:generate
```

To generate a GitHub Release-ready extension package:

```bash
npm run release:package
```

The package is written to `releases/<version>/` with a zip, manifest, checksum file, and release README. See [RELEASE_WORKFLOW.md](./RELEASE_WORKFLOW.md) and [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) for the full process.

Validate MCP Registry metadata before publishing:

```bash
npm run registry:validate
```

## License

MIT License. See [LICENSE](./LICENSE).

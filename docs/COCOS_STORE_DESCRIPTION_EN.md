# Funplay MCP for Cocos

## 【Feature Introduction】

Funplay MCP for Cocos is an open-source AI development extension for **Cocos Creator 3.8 and later**. It embeds an MCP Server directly in the Cocos Creator editor, allowing MCP-compatible coding assistants such as Claude Code, Cursor, Codex, VS Code Copilot, Trae, and Kiro to connect to the active project, read real editor context, and execute development workflows.

Unlike an assistant that can only analyze project files, Funplay MCP for Cocos can inspect the active scene, node hierarchy, components, assets, prefabs, logs, script diagnostics, editor state, and screenshots. This lets AI work from the project's actual state and helps reduce repeated switching between the editor, terminal, and AI client.

### Key Features

- **Unified JavaScript execution**: Use `execute_javascript` in scene or editor context to combine operations such as creating UI, editing nodes, inspecting runtime state, and automating repetitive editor tasks.
- **105 built-in tools**: Covers scenes and nodes, components, assets and prefabs, files, logs, script diagnostics, screenshots, runtime state, builds, previews, event binding, and input simulation.
- **Live editor context**: Read the current project, active scene, hierarchy, selection, asset metadata, script errors, editor logs, and recent MCP activity.
- **Scene and asset automation**: Create and open scenes, inspect or edit nodes and components, create prefabs, analyze asset dependencies, validate prefab references, and refresh the asset database.
- **Preview and visual verification**: Use Browser Preview, Editor Game View, or Simulator Preview; retrieve the browser preview URL and verify results with editor, scene, or preview screenshots.
- **One-click AI client setup**: Generate or write MCP configuration for Claude Code, Cursor, Codex, VS Code, Trae, Kiro, and other compatible clients from the extension panel.
- **Flexible tool profiles**: The default `core` profile exposes 39 high-signal tools. Switch to `full` for all tools, or create a custom profile by category or individual tool.
- **Focused management windows**: Separate MCP Server, Tool Exposure, MCP Settings, and Activity windows keep service controls, tool exposure, client setup, calls, and logs organized.
- **English and Chinese UI**: Menus and native panel titles follow Cocos Creator; panel controls and status messages can follow Creator or use a project-specific language override.
- **Update checks and one-click updates**: Detect new GitHub Releases, download the extension package, and verify its SHA256 checksum before installation.
- **Local operation and guardrails**: The server listens on `127.0.0.1` by default, file tools stay inside the active project, and risky `execute_javascript` patterns are checked by default.
- **Open MCP compatibility**: Provides MCP Tools, Resources, and Prompts for clients using Streamable HTTP or a stdio MCP configuration.

### Typical Use Cases

- Help AI understand the scenes, assets, and code structure of an existing Cocos project.
- Create or adjust UI, nodes, components, prefabs, and common editor content.
- Diagnose TypeScript errors, editor logs, asset dependencies, and broken prefab references.
- Start and switch preview modes, then verify the result through screenshots or a browser URL.
- Build reusable project instructions, tool profiles, and AI workflows for a team.

### Compatibility and Notes

- Minimum supported version: **Cocos Creator 3.8**.
- This is an editor-only extension and does not add runtime code to the final game build.
- AI clients and model services must be installed and configured separately; no third-party AI service is bundled with the extension.
- The default endpoint is `http://127.0.0.1:8765/`. If the port is occupied, the server automatically selects the next available port and displays the active address in the panel.
- Tools with write or mutation capabilities operate directly on the current project. Use Git or another version control system and review the intended scope before major changes.

## 【Usage Guide】

1. **Install the extension**

   Install Funplay MCP for Cocos from Cocos Store into the target project, then open the project with Cocos Creator 3.8 or later.

2. **Open the control panel**

   From the Cocos Creator top menu, select:

   `Funplay > MCP Server`

3. **Start the MCP Server**

   Check the server status in the panel and start it. The default endpoint is:

   `http://127.0.0.1:8765/`

   If that port is already in use, use the active port displayed in the panel.

4. **Select and configure an AI client**

   Choose Claude Code, Cursor, Codex, VS Code, Trae, or Kiro in the client configuration section, then use one-click setup. You can also copy the generated configuration into another MCP-compatible client manually.

5. **Confirm the connection**

   Return to the AI client and confirm that `funplay-cocos-mcp` is connected and its tools are available. For a first test, call `get_project_info`, `get_scene_info`, or `get_hierarchy` to inspect the active project and scene.

6. **Start working**

   Example requests:

   > Inspect the current scene hierarchy and script errors, then identify the most important issues.

   > Create a login UI with a title, input fields, and buttons in the active scene, then capture a screenshot to verify it.

   > Switch to Browser Preview, launch the active scene, and return the preview URL.

7. **Adjust tool exposure when needed**

   The default `core` profile is suitable for common inspection and development tasks. For file writes, complete scene editing, preview switching, and other advanced operations, open `Funplay > Tool Exposure` and select `full` or create a custom profile.

8. **Check for updates**

   Use the MCP Server panel to check for a new release. Standard Store installations can use one-click update. Git worktree or symlink development installations should continue using Git so the updater does not overwrite development files.

## 【Contact】

**Open-source repository**

https://github.com/FunplayAI/funplay-cocos-mcp

**Issue reports and feature requests**

https://github.com/FunplayAI/funplay-cocos-mcp/issues

**Author**

Funplay / FunplayAI

**Contact email**

3256714392@qq.com

This project is available under the MIT License. Compatibility reports, feature requests, and usage feedback are welcome through GitHub Issues.

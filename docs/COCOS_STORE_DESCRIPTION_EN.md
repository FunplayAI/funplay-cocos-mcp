# Funplay MCP for Cocos

## 【Feature Introduction】

Funplay MCP for Cocos is an AI workflow extension for Cocos Creator 3.8+. It starts a local MCP Server inside the Cocos Creator editor, allowing AI coding assistants such as Claude Code, Cursor, Codex, VS Code Copilot, Trae, and Kiro to connect to the active Cocos project with real editor context.

With this plugin, AI assistants can do more than read project files. They can inspect scenes, nodes, components, assets, logs, screenshots, project settings, and editor status, helping developers analyze projects, debug issues, validate assets, and automate common editor workflows.

Main features include:

- Start a local MCP Server directly inside Cocos Creator.
- Connect supported AI clients to the current Cocos project.
- Inspect scenes, nodes, components, assets, logs, and screenshots.
- Validate asset dependencies and project state.
- Access build status, preview launch, scene save, editor preferences, and editor helper actions.
- List and bind Button click events.
- Configure tool profiles for different AI client workflows.
- Generate recommended AI project skills to help assistants understand your Cocos project.
- Use a built-in control panel for server status, tool management, client configuration, logs, and diagnostics.

Funplay MCP for Cocos is designed for developers who want AI assistants to work with the actual Cocos Creator editor environment, making project analysis, debugging, and repetitive editor operations faster and more reliable.

## 【Usage Guide】

1. Install Funplay MCP for Cocos from Cocos Store.

2. Open the Cocos Creator project you want to work on.

3. Open the plugin panel from the top menu:

   `Funplay > MCP Server`

4. Start the MCP Server in the `Funplay Cocos MCP` panel.

   The default local server URL is:

   `http://127.0.0.1:8765/`

5. In the MCP Client Config section, select your AI client, such as Claude Code, Cursor, Codex, VS Code Copilot, Trae, or Kiro.

6. Click one-click configure, or copy the displayed configuration into your AI client manually.

7. Return to your AI client and start using it to inspect the Cocos project, analyze scenes and assets, review logs, debug issues, and assist with Cocos editor workflows.

For first-time use, it is recommended to test the plugin in a sample project and confirm that the MCP Server starts successfully before using it in a production project.

## 【Contact】

Open source repository:

https://github.com/FunplayAI/funplay-cocos-mcp

Issue reports and feature requests:

https://github.com/FunplayAI/funplay-cocos-mcp/issues

Author:

Funplay

Contact email:

3256714392@qq.com

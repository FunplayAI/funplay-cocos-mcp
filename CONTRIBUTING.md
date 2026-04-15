# Contributing to Funplay MCP for Cocos

Thanks for your interest in contributing to Funplay MCP for Cocos.

This repository is a Cocos Creator editor extension that embeds an MCP server. Contributions that improve reliability, editor compatibility, documentation, and AI-driven Cocos workflows are welcome.

## Development Setup

1. Clone the repository:

```bash
git clone https://github.com/FunplayAI/funplay-cocos-mcp.git
cd funplay-cocos-mcp
```

2. Install it into a Cocos project as an extension:

```bash
mkdir -p /path/to/your-cocos-project/extensions
ln -s "$PWD" /path/to/your-cocos-project/extensions/funplay-cocos-mcp
```

You can also copy the repository folder instead of using a symlink.

3. Restart Cocos Creator or reload extensions.

4. Open the panel:

```text
Funplay > MCP Server
```

## Validation

Before opening a pull request, run:

```bash
npm run check
```

This validates the JavaScript syntax for the extension entry points and helper modules.

If your change affects live MCP behavior, also test against a running Cocos project:

```bash
curl -sS http://127.0.0.1:8765/health
```

If you use a custom port, replace `8765` with your configured port.

## Project Structure

```text
browser.js          Cocos browser/editor extension entry and service lifecycle
scene.js            Scene-side execution bridge and scene tool implementations
panel/index.js      Minimal MCP Server panel UI
lib/server.js       HTTP JSON-RPC MCP server
lib/tool-registry.js Tool definitions and handlers
lib/resources.js    MCP resources
lib/prompts.js      MCP prompts
lib/client-config.js One-click MCP client configuration
lib/assets.js       Asset database helpers
lib/diagnostics.js  TypeScript diagnostics
lib/input.js        Electron input simulation
lib/screenshots.js  Screenshot helpers
```

## Contribution Guidelines

- Keep the `core` profile focused. Avoid adding noisy tools to `core` unless they are broadly useful for AI clients.
- Prefer improving `execute_javascript` workflows when one flexible tool is better than many narrow tools.
- Add tools to `full` when they are useful but not essential for the default AI workflow.
- Keep the Cocos panel simple. The main panel should focus on service management and MCP client configuration.
- Avoid adding runtime dependencies to built games; this extension should remain editor-only.
- Keep changes small and focused.
- Update `README.md`, `README_CN.md`, or `CHANGELOG.md` when behavior changes.
- Do not commit generated Cocos folders such as `library/`, `temp/`, or build output.

## Tool Design Notes

When adding a new tool:

1. Add the tool definition in `lib/tool-registry.js`.
2. Use `profile: "core"` only for high-signal tools.
3. Put scene/runtime work behind `sceneBridge.call(...)` when it must run in the active Cocos scene.
4. Use editor-side helpers for asset-db, filesystem, and panel/client configuration workflows.
5. Return JSON-serializable data where possible.
6. Add clear input schema descriptions so AI clients can choose the tool correctly.
7. Test the tool with `tools/list` and `tools/call`.

## Documentation

The documentation is bilingual:

- `README.md` for English
- `README_CN.md` for Chinese

When adding user-facing behavior, update both files when possible.

## Pull Requests

A good pull request should include:

- A clear summary of the change
- What Cocos Creator version was tested
- Whether the MCP server was tested through an AI client or direct HTTP calls
- Any screenshots if the change affects the panel or visual scene output
- Notes about compatibility or limitations

## License

By contributing, you agree that your contributions will be licensed under the MIT License used by this repository.

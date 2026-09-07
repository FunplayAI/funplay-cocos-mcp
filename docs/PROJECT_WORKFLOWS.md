# Project isolation, Skills, and workflows

## 多项目与迁移

- 新项目按项目路径生成稳定端口，并使用 `cocos-<project>-<hash>` 配置名称。同名目录位于不同路径时也使用不同名称；端口哈希仍可能冲突，面板会明确显示回退状态。
- 已有 `funplay-cocos-mcp.config.json` 保留固定端口。点击“使用项目独立端口”可以主动切换；“固定当前端口”可保存当前实际端口。切换后需重新配置客户端。
- 临时回退端口不会被一键配置写入客户端。先解决冲突或固定端口，避免重启后指向错误项目。
- 一键配置保留其他 MCP 配置。只有当前编辑器正在运行、旧 `funplay_cocos` 条目准确指向当前端口且仍是工具生成的简单格式时，才会迁移旧条目；其他旧条目保留供人工检查。手动改过地址的项目条目不会被静默覆盖。
- Claude Code 使用 `~/.claude.json` 的 `projects[Git 仓库根目录].mcpServers`，不是所有项目共享的顶层条目。没有 Git 仓库时使用 Cocos 项目目录。这里的 Claude Code 配置不是 Claude Desktop 配置。

## Client-specific managed Skills

Open **Funplay > Project Skills**, choose a client, then install either built-in Skill. The MCP Server dashboard checks the selected client's managed directory. Unsupported clients do not show an install/update notice.

The dashboard's **Configure + Skills** action configures the selected MCP client and installs any missing built-in Skills. Existing Skills are kept, including old versions, legacy-path installs and local edits; use Project Skills to review, back up and update them. If configuration succeeds but a Skill cannot be installed, the dashboard reports partial completion instead of claiming the whole setup succeeded.

All management pages share aligned controls, lightweight sections, and responsive layouts. Extension update and global-install controls are in **Settings**. Project Skills hides unavailable actions and collapses file/backup details. Recent Activity preserves each result's field order, nested objects, array items, and scalar values instead of flattening six selected fields. Branches and JSON disclosures retain their expanded state across refreshes. Preview limits are 200 nodes, 6 nested levels, 24 keys per object, 12 items per array, 800 characters per string, and approximately 16,000 total characters; truncation is marked and sensitive fields/file bodies are omitted. Clear removes only MCP interaction history without clearing runtime logs. Output sections and the standalone Activity/log-viewing window are removed. Successful actions show a short, auto-dismissed notice; failures remain visible until dismissed. Diagnostic logs and MCP interaction summaries remain available through the existing MCP tools/resources.

Script cards separate the execution summary, scoped console logs, and return value. `execute_javascript` and both compatibility aliases inject a per-invocation `console` with `log/info/warn/error/debug` capture; `run(env)` and module-export functions also receive `env.console`. Logs before a thrown error survive scene IPC. Capture stops when the script settles and never patches the global console, so concurrent/nested calls, unrelated project logs, separately required modules, and later background callbacks cannot contaminate another call. Console forwarding is unchanged. Capture retains up to 50 entries, 1,000 characters per message, and about 20,000 characters per call, with redaction and an explicit `logsOmitted` count. Protocol responses keep their existing `data` and add optional `execution: { context, durationMs, logs, logsOmitted }` metadata, also on script error envelopes.

**Settings > Console Logs > Print MCP logs** controls only the extension and HTTP server's Cocos console printing, including warnings and errors. It defaults on and is saved as `enableConsoleLogging` in the project config. Changes apply immediately without restarting MCP, disconnecting clients, clearing Recent Activity/internal diagnostics, or muting project-script logs. A saved off setting also suppresses startup printing.

| Client | Managed project directory |
| --- | --- |
| Codex | `.agents/skills` |
| Claude Code | `.claude/skills` |
| Cursor | `.cursor/skills` |
| Qoder | `.qoder/skills` |
| Kimi Code | `<nearest Git root>/.kimi-code/skills` (project directory when no Git root exists) |

The manager checks these **managed project directories**, not every user-level or cross-client compatibility directory an agent may also discover. It does not change global Skills, agent rules, or user-authored `AGENTS.md` / `CLAUDE.md` files. Open the AI client at the relevant project/Git root so it can discover the files.

Client paths were checked against the official [Codex](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills), [Claude Code](https://code.claude.com/docs/en/skills#where-skills-live), [Cursor](https://cursor.com/docs/skills), [Qoder](https://docs.qoder.com/cli/Skills), and [Kimi Code](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html#skill-locations) documentation.

### Legacy Codex installs

The manager detects the two built-in Skills in `.codex/skills` when their new `.agents/skills` destination is absent. Updating backs up the old content and installs the current template in the new directory. The original file is retained. Modified content requires explicit confirmation; an existing new-directory file always takes precedence. Older `.codex/skill-backups` remain available to restore. Custom legacy Skills are not automatically moved: review and migrate them manually.

New backups are stored alongside each client's Skills directory, under `skill-backups/<skill-name>/`. Updating one client's managed copy does not overwrite another client's managed copy.

## Project-authored MCP prompts

Create Markdown files in `<Cocos project>/mcp-prompts/`. These are MCP workflow templates, not executable scripts or automatically applied instructions. A client explicitly requests a template through `prompts/get`.

Example: `mcp-prompts/inspect-prefab.md`

```markdown
---
name: inspect_prefab
description: Inspect a Cocos prefab without modifying it.
arguments: prefab_path(required), focus
---
Inspect prefab {prefab_path}. Focus: {focus}.
1. Read cocos://project/context and confirm the active Cocos project.
2. Resolve the exact asset URL and UUID. Inspect the prefab and its references using the exposed tool catalog.
3. Report missing references, unexpected layers, or hierarchy problems with exact asset/node identifiers.
This workflow is read-only. Do not rebuild or modify the prefab.
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "prompts/get",
  "params": {
    "name": "inspect_prefab",
    "arguments": {
      "prefab_path": "db://assets/ui/Main.prefab",
      "focus": "UI_2D layers and serialized references"
    }
  }
}
```

- The frontmatter is a small dependency-free format, **not general YAML**: unquoted single-line `name`, `description`, and comma-separated `arguments` only. A `(required)` suffix marks mandatory arguments.
- Names match `[a-z][a-z0-9_-]{0,63}`. Descriptions are at most 512 characters. The body must not be empty.
- Argument values must be strings. Missing required values, unknown names/arguments, and non-string values return JSON-RPC `-32602`. Omitted optional placeholders become empty strings. Substitution is single-pass and never evaluates code.
- Built-in names cannot be shadowed. Duplicate names, oversized files, malformed definitions, and symlinks are skipped with warnings in the Cocos editor console and MCP diagnostic logs.
- Discovery is limited to the first 100 top-level `.md` files in name order, each at most 256 KiB. Prompt arguments are limited to 65,536 characters each.
- Files are re-read on `prompts/list` and `prompts/get`; no editor restart is required. Clients that cache the prompt list may need a refresh/reconnect. The server does not advertise prompt-list change notifications.
- Existing built-in prompts remain callable without arguments. Optional context arguments are `touched_paths`, `idea`, `focus`, and `target` / `component_type`, respectively.

## Connection examples

Use the exact server name and URL in the MCP Server panel. Documentation examples containing `funplay_cocos` and port `8765` illustrate a legacy/fixed endpoint, not the new default. The stdio wrapper's legacy default is also `8765`; pass `--url` or `FUNPLAY_COCOS_MCP_URL` explicitly for a project-derived port.

Generated JSON preserves unrelated settings and entries. JSONC or malformed/non-object configuration is left untouched with an error. TOML updates preserve unrelated sections and options; ambiguous forms such as inline MCP tables or multiline strings currently require manual configuration. Configuration writes preserve file permissions and reject a changed read snapshot before atomic replacement.

To pin a port explicitly in `funplay-cocos-mcp.config.json`:

```json
{
  "host": "127.0.0.1",
  "portMode": "fixed",
  "port": 8765
}
```

Use `"portMode": "project"` to derive the port again. `COCOS_MCP_PORT` overrides the saved choice for that editor process.

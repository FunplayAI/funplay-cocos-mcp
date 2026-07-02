<p align="center">
  <h1 align="center">Funplay MCP for Cocos</h1>
  <p align="center">
    <strong>嵌入 Cocos Creator 编辑器的 MCP Server</strong>
  </p>
  <p align="center">
    <a href="#"><img src="https://img.shields.io/badge/Cocos%20Creator-3.8%2B-blue" alt="Cocos Creator 3.8+"></a>
    <a href="#"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
    <a href="#"><img src="https://img.shields.io/badge/MCP-Compatible-green" alt="MCP Compatible"></a>
    <a href="#"><img src="https://img.shields.io/badge/Platform-Editor%20Only-orange" alt="Editor Only"></a>
    <a href="https://store.cocos.com/app/detail/8913"><img src="https://img.shields.io/badge/Cocos%20Store-Install-brightgreen" alt="Install from Cocos Store"></a>
  </p>
  <p align="center">
    中文 | <a href="./README.md">English</a>
  </p>
</p>

> 如果这个项目对你有帮助，欢迎顺手点一个 Star。它能帮助更多 Cocos 开发者发现项目，也能支持后续持续维护。

---

Funplay MCP for Cocos 是一个采用 MIT 协议的 Cocos Creator 扩展，它把 HTTP MCP Server 直接嵌入编辑器，让 Claude Code、Cursor、Codex、VS Code Copilot、Trae、Kiro 等 AI 助手可以直接检查和操作正在运行的 Cocos 项目。

这个项目延续 Funplay MCP for Unity 的产品方向：默认工具面保持聚焦，提供一键客户端配置，并围绕一个高灵活度主执行工具组织工作流。

在 Cocos 里，主工具是 `execute_javascript`：

- `context: "scene"` 在当前 Cocos 场景/运行态上下文执行 JavaScript
- `context: "editor"` 在 Cocos 编辑器/browser 上下文执行 JavaScript

> *“在当前场景里创建一个登录页 UI，包含账号/密码输入框和登录按钮。”*
>
> AI 助手可以调用 `execute_javascript`，在当前 Canvas 下生成 UI 层级，挂载 Cocos 组件，检查层级，并截图验证效果。

## 快速开始

如果你只想尽快连上，先做这三步：

- 把这个仓库安装为 Cocos Creator 扩展
- 打开 `Funplay > MCP Server`
- 使用内置的一键 MCP 客户端配置

### 1. 安装为 Cocos Creator 扩展

推荐安装方式：通过官方 [Cocos Store 页面](https://store.cocos.com/app/detail/8913) 安装到目标 Cocos Creator 项目。

如果要本地开发或使用未发布版本，可以把仓库 clone 或复制到 Cocos 项目的扩展目录：

```bash
cd /path/to/your-cocos-project
mkdir -p extensions
git clone https://github.com/FunplayAI/funplay-cocos-mcp.git extensions/funplay-cocos-mcp
```

然后重启 Cocos Creator，或在编辑器里重新加载扩展。

如果不想用 git 安装，可以从 GitHub Releases 下载 `Funplay.CocosMcp.v<version>.zip`，解压后把 `funplay-cocos-mcp` 目录移动到项目的 `extensions/` 目录。

你也可以把目录复制到 Cocos Creator 的全局用户扩展目录中。

### 2. 启动 MCP Server

打开编辑器菜单：

```text
Funplay > MCP Server
```

服务默认运行在 `http://127.0.0.1:8765/`。

如果配置端口已被占用，扩展会先检查已有 listener 是否属于同一个 Cocos 项目；同项目 listener 会被安全复用，无关 listener 才会自动回退到下一个可用本地端口。

面板刻意保持精简：

- 启用或停用 MCP Server
- 打开聚焦的 Tool Exposure、MCP Settings 和 Activity 子窗口
- 自动检查当前安装版本是否落后于 GitHub 最新 Release
- 从面板打开 Release 页面，或安装已校验的 Release 包
- 一键配置 AI 客户端，并随目标客户端预览对应配置
- 把高级工具 profile 编辑、传输设置、诊断和日志从主窗口拆出去

独立的 Tool Exposure 窗口使用按分类分组的工具列表，支持单个工具开关和分类 Select/Clear。Activity 窗口使用单列最近调用流，并显示 `OK` / `ERR` / `INT` 状态徽标，整体信息架构更接近 Funplay Unity MCP，而不是把所有维护流程都塞进主窗口。

### 3. 配置 AI 客户端

优先使用 `Funplay > MCP Server` 面板里的 **MCP Client Config** 区域。

选择目标客户端，点击 **One-Click Configure**，扩展会直接写入推荐的 MCP 配置项。

写入客户端的 MCP server 名称是：

```text
funplay_cocos
```

如果你更想手动编辑配置文件，再参考下面这些示例。

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

### 可选：npm stdio Wrapper

如果 MCP 客户端更适合使用本地 `stdio` 命令，可以在启动 Cocos 编辑器内置服务后安装 npm wrapper：

```bash
npm install -g funplay-cocos-mcp
```

示例 MCP 客户端配置：

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

这个 wrapper 会把 stdio MCP 流量桥接到 Cocos 内置 HTTP endpoint。也可以直接运行 `npx funplay-cocos-mcp --url http://127.0.0.1:8765/`。

### 4. 验证连接

先在 AI 客户端里试几个安全请求：

- “调用 `get_project_info`，总结当前 Cocos 项目。”
- “读取 `cocos://project/context`，告诉我当前编辑器状态。”
- “用 `execute_javascript` 的 `context: \"scene\"` 返回当前场景名。”
- “用 `execute_javascript` 的 `context: \"editor\"` 返回项目路径。”

如果这些都正常返回，说明 MCP server、resources、prompts 和主执行工具已经连通。

如果要排查本地传输链路，面板可以直接复制下面的命令，也可以手动执行：

```bash
curl http://127.0.0.1:8765/health
curl http://127.0.0.1:8765/tools
```

### 5. 开始构建

可以在 AI 客户端里尝试：

> 在当前 Cocos 场景里创建一个登录页 UI，包含账号/密码输入框、登录按钮和游客登录按钮。优先使用 `execute_javascript`，创建后检查层级并截图验证。

## 开始前说明

- 这是一个 **仅限 Editor** 的扩展，用于自动化 Cocos Creator，不会给最终游戏包添加运行时依赖。
- MCP Server 默认监听 `http://127.0.0.1:8765/`。
- 如果配置端口被占用，服务会先通过项目身份识别同项目已有 listener；无法确认同项目时才会自动回退到下一个可用端口，面板与一键客户端配置会使用实际运行端口。
- `GET /health` 和 `GET /tools` 是只读调试端点，方便不用 MCP 客户端也能快速检查本地服务。
- 默认 `core` profile 暴露 37 个高频工具；如果需要完整工具集，可在面板切到 `full`，暴露全部 102 个工具；也可以用 `custom` 按分类或工具名增删。
- 面板会自动检查 GitHub Release，也支持手动检查。
- 一键更新会下载 GitHub Release zip，校验 `SHA256SUMS.txt`，备份当前扩展目录，替换插件文件，并在 Cocos package API 支持时 reload 扩展；如果当前 Cocos 版本没有可靠 reload 能力，安装后重启 Cocos Creator 即可。Git worktree 和 symlink 安装会保留为手动 `git pull` 或手动替换包，避免覆盖开发目录。
- Streamable HTTP 响应已补齐 MCP 传输层要求，包括 `Accept`、`MCP-Protocol-Version`、JSON-RPC notification/response，以及可选 `Mcp-Session-Id` session。
- 工具列表会包含 MCP `outputSchema` 和 `annotations`；结构化工具结果统一使用包含 `ok`、`tool`、`callId`、`summary`、`data`、`refs` 的标准 envelope。
- `execute_javascript` 安全检查默认开启，会拦截明显高风险的文件系统和 shell 模式，例如删除/截断调用、原始写入流、路径穿越、用户/系统绝对路径和 `child_process`。这是防护栏，不是完整沙箱；确认风险后可在单次调用中显式传入 `safety_checks: false`。
- 所有已暴露的 MCP 工具都会直接执行，Cocos 扩展里没有额外 approval 开关。
- 文件工具和 `cocos://asset/path/...` 资源默认只能访问当前 Cocos 项目根目录内的路径。
- 推荐工作流是优先使用 `execute_javascript`，再配合截图、诊断、资产、检查类工具。
- 如果在面板里修改端口或工具暴露模式，扩展会自动保存配置，并在需要时重启服务。

## 为什么做这个项目

- **`execute_javascript` 主工具优先** — 一个高灵活度 JavaScript 工具就能编排场景/运行态和编辑器自动化，避免 AI 客户端被大量细碎工具干扰
- **嵌入式 Cocos 扩展** — Cocos 侧不需要单独 Python 守护进程或外部 bridge
- **一键客户端配置** — 在 Cocos Creator 内直接配置 Claude Code、Cursor、VS Code、Trae、Kiro、Codex
- **内建项目上下文** — 直接暴露项目、场景、选择、脚本诊断、日志和交互历史资源
- **默认聚焦，必要时全量** — `core` 降低工具列表噪音，需要时切到 `full` 暴露全部工具；`custom` 与保存的 profile 可按分类或工具名调整并恢复
- **可视化验证** — 截图和输入模拟让 AI 能验证 UI 与玩法改动

## 核心特性

- **102 个内置工具** — 覆盖场景层级、编辑器状态、选择工作流、Prefab、资产、资产依赖、项目指令、UI 创建、组件、文件、日志、脚本诊断、截图、运行态控制、构建/预览辅助、编辑器偏好、事件绑定和输入模拟
- **统一主工具** — `execute_javascript` 同时支持 `scene` 和 `editor` 两种上下文
- **Resources 与 Prompts** — 实时项目/日志资源，以及脚本修复、场景验证、可玩原型等可复用工作流
- **Cocos 图形面板** — `Funplay > MCP Server` 是精简 Dashboard，并提供 Tool Exposure、MCP Settings、Activity 子窗口承载复杂工作流
- **截图与输入支持** — 支持编辑器/场景/Game/Preview 截图，以及 Electron 级鼠标键盘事件
- **厂商无关** — 兼容任意支持 HTTP JSON-RPC MCP 的 AI 客户端

## 与 Funplay MCP for Unity 的关系

Funplay MCP for Cocos 延续 Funplay MCP for Unity 的设计原则，并针对 Cocos Creator 的 JavaScript/TypeScript 编辑器环境做了适配。

| 维度 | Funplay MCP for Cocos | Funplay MCP for Unity |
|------|------------------------|------------------------|
| 编辑器集成 | Cocos Creator 扩展 | Unity Editor 包 |
| 内置服务 | 内嵌 HTTP MCP Server | 内嵌 HTTP MCP Server |
| 主执行工具 | `execute_javascript` | `execute_code` |
| 主语言 | 场景/编辑器上下文中的 JavaScript | Unity 编辑器/运行态中的 C# |
| 默认工具集 | `core`，37 个工具 | 聚焦版 `core` 工具集 |
| 完整工具集 | 102 个工具，并支持 `custom` 暴露 | 79 个工具 |
| 客户端配置 | 一键配置面板 | 一键配置窗口 |

## MCP 能力结构

当前包提供四层能力：

- **Tools** — `core` 下 37 个工具，`full` 下 102 个工具，并支持 `custom` include/exclude 规则和命名工具 profile
- **Primary execution** — `execute_javascript` 用于场景/运行态和编辑器/browser 自动化
- **Prompts** — `fix_script_errors`、`create_playable_prototype`、`scene_validation`、`auto_wire_scene`
- **Resources** — 项目上下文、场景摘要、当前选择、脚本诊断、资产选择、日志和 MCP 交互历史

自动生成的工具参考文档见 [docs/TOOLS.md](./docs/TOOLS.md)，里面包含工具分类、profile 和读写/变更提示。

当前默认 `core` 工具集刻意保持精简，只包含：`execute_javascript`、`execute_scene_script`、`execute_editor_script`、`get_editor_state`、`get_tool_catalog`、`check_for_updates`、`get_selection`、`list_project_instructions`、`read_project_instruction`、`set_selection`、`get_project_info`、`get_build_status`、`get_scene_info`、`get_hierarchy`、`list_scenes`、`open_scene`、`inspect_prefab`、`validate_prefab_references`、`inspect_prefab_instance`、`list_assets`、`inspect_asset`、`inspect_asset_dependencies`、`validate_asset_dependencies`、`open_asset`、`select_asset`、`run_script_diagnostics`、`get_recent_logs`、`search_project_logs`、`clear_logs`、`validate_scene`、`get_performance_snapshot`、`get_script_diagnostic_context`、`get_runtime_state`、`capture_editor_screenshot`、`capture_scene_screenshot`、`capture_preview_screenshot`、`list_editor_windows`。

## 内置 Resources

| Resource | 说明 |
|----------|------|
| `cocos://project/context` | 完整项目与编辑器上下文 |
| `cocos://project/summary` | 项目摘要 |
| `cocos://scene/active` | 当前场景快照 |
| `cocos://scene/current` | 当前场景别名 |
| `cocos://selection/current` | 当前编辑器选择 |
| `cocos://selection/asset` | 当前选中资产 |
| `cocos://errors/scripts` | 脚本诊断信息 |
| `cocos://logs/editor` | 最近 MCP 运行日志和工具交互 |
| `cocos://logs/project` | 常见项目日志文件的尾部内容 |
| `cocos://mcp/interactions` | 最近 MCP 交互历史 |

## 内置工具

Funplay MCP for Cocos 当前在 `full` profile 下提供 **102 个工具函数**：

| 分类 | 工具 |
|------|------|
| **脚本执行** | `execute_javascript`, `execute_scene_script`, `execute_editor_script` |
| **编辑器状态** | `get_editor_state`, `get_tool_catalog`, `check_for_updates`, `get_selection`, `set_selection`, `get_editor_selection` |
| **项目指令** | `list_project_instructions`, `read_project_instruction`, `write_project_instruction`, `create_project_skill`, `create_cocos_mcp_project_skill` |
| **项目与场景** | `get_project_info`, `get_scene_info`, `get_hierarchy`, `find_nodes`, `inspect_node`, `list_scenes`, `open_scene`, `run_scene_asset` |
| **节点编辑** | `create_node`, `delete_node`, `set_node_transform` |
| **资产与 Prefab** | `list_assets`, `inspect_asset`, `inspect_asset_dependencies`, `validate_asset_dependencies`, `open_asset`, `select_asset`, `delete_asset`, `list_prefabs`, `inspect_prefab`, `validate_prefab_references`, `duplicate_prefab`, `edit_prefab_json`, `create_prefab_from_node`, `create_prefab_instance`, `inspect_prefab_instance`, `apply_prefab_instance`, `revert_prefab_instance`, `instantiate_prefab` |
| **组件** | `list_components`, `inspect_component`, `add_component`, `remove_component`, `set_component_property`, `reset_component_property` |
| **UI** | `create_canvas`, `create_label`, `create_button`, `create_sprite` |
| **相机** | `list_cameras`, `create_camera`, `set_camera_properties` |
| **动画** | `list_animations`, `add_animation_clip`, `play_animation`, `stop_animation` |
| **文件** | `read_file`, `get_file_snippet`, `write_file`, `replace_in_file`, `search_files`, `list_directory`, `exists`, `refresh_assets` |
| **诊断与日志** | `run_script_diagnostics`, `get_script_diagnostic_context`, `get_recent_logs`, `search_project_logs`, `clear_logs`, `validate_scene`, `get_performance_snapshot` |
| **构建与编辑器** | `get_build_status`, `open_build_panel`, `run_project_preview`, `save_current_scene`, `get_editor_preference`, `set_editor_preference`, `broadcast_editor_message` |
| **运行态** | `get_runtime_state`, `pause_runtime`, `resume_runtime`, `set_time_scale` |
| **交互与事件** | `emit_node_event`, `simulate_button_click`, `list_button_click_events`, `bind_button_click_event`, `invoke_component_method`, `simulate_mouse_click`, `simulate_mouse_drag`, `simulate_key_press`, `simulate_key_combo`, `simulate_preview_input` |
| **截图与窗口** | `capture_desktop_screenshot`, `capture_editor_screenshot`, `capture_scene_screenshot`, `capture_game_screenshot`, `capture_preview_screenshot`, `list_editor_windows` |

## 主工具示例

### Scene 上下文

```json
{
  "context": "scene",
  "code": "return { sceneName: scene.name, rootCount: scene.children.length };",
  "args": {}
}
```

### Editor 上下文

```json
{
  "context": "editor",
  "code": "return { projectPath: context.projectPath, toolCount: helpers.listTools().length };",
  "args": {}
}
```

Editor 上下文脚本可以访问 `Editor`、`fs`、`path`、`os`、`require`、`context`、`args`，以及 `helpers.getStatus()`、`helpers.listTools()`、`helpers.readResource(uri)`、`helpers.callTool(name, args)`、`helpers.configureClient(targetId)` 等辅助函数。

## 可选配置

在 Cocos 项目根目录放置 `funplay-cocos-mcp.config.json`：

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
  "executeJavascriptSafetyChecks": true,
  "autostart": true,
  "maxInteractionLogEntries": 50,
  "activeToolProfileName": "",
  "savedToolProfiles": []
}
```

也支持环境变量：

- `COCOS_MCP_HOST`
- `COCOS_MCP_PORT`
- `COCOS_MCP_PROFILE`

`toolProfile: "custom"` 会从 `core` 集合开始，再加入 `enabledToolCategories` / `enabledTools`，并移除 `disabledToolCategories` / `disabledTools`。面板可以把这些暴露设置保存为命名 `savedToolProfiles`，方便恢复或分享。`enableSessions` 默认关闭，因为常规编辑器自动化不需要跨请求客户端状态。

## 架构

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
    │   └─ Minimal MCP Server dashboard
    ├─ panel/tool-exposure.js, panel/settings.js, panel/activity.js
    │   └─ Focused maintenance windows
    └─ lib/
        ├─ assets, diagnostics, screenshots, input
        ├─ tool-profiles, javascript-safety
        ├─ tools/
        │   ├─ files
        │   ├─ assets-advanced
        │   ├─ cocos-project
        │   └─ scene-events
        └─ server, resources, prompts, tool registry
```

服务使用 MCP 风格的 HTTP JSON-RPC 2.0，支持 tools、resources、resource templates、prompts、health check 和只读 `/tools` 调试端点。

## 开发

发布改动前可以跑检查：

```bash
npm run check
npm test
npm run docs:check
npm run release:check
npm run pack:dry-run
```

修改 `lib/tool-registry.js` 后可以重新生成工具参考：

```bash
npm run docs:generate
```

生成可上传到 GitHub Release 的扩展包：

```bash
npm run release:package
```

产物会写入 `releases/<version>/`，包含 zip、manifest、checksum 和 release README。完整流程见 [RELEASE_WORKFLOW.md](./RELEASE_WORKFLOW.md) 和 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。

发布 MCP Registry 前可以验证元数据：

```bash
npm run registry:validate
```

## 协议

MIT License。详见 [LICENSE](./LICENSE)。

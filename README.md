# Funplay Cocos MCP

一个嵌入在 `Cocos Creator 3.x` 扩展里的 MCP Server，对齐了你现有 `unity-mcp` 的核心思路：

- 编辑器内嵌 HTTP MCP 服务
- `execute_javascript` 作为统一主工具
- `tools / resources / prompts` 三层能力
- 场景树、节点、文件系统、项目上下文的统一访问

当前实现更偏向 Unity MCP 的 `core` 能力集，而不是一次性把全部 Unity 工具逐个照搬。

## 已实现能力

- MCP 协议：
  - `initialize`
  - `tools/list`
  - `tools/call`
  - `resources/list`
  - `resources/read`
  - `resources/templates/list`
  - `prompts/list`
  - `prompts/get`
- 核心工具：
  - `execute_javascript`
  - `execute_scene_script`
  - `execute_editor_script`
  - `get_scene_info`
  - `get_hierarchy`
  - `find_nodes`
  - `inspect_node`
  - `list_components`
  - `inspect_component`
  - `list_cameras`
  - `list_animations`
  - `play_animation`
  - `stop_animation`
  - `get_project_info`
  - `list_scenes`
  - `open_scene`
  - `list_prefabs`
  - `list_assets`
  - `inspect_asset`
  - `open_asset`
  - `select_asset`
  - `get_editor_selection`
  - `read_file`
  - `get_file_snippet`
  - `write_file`
  - `replace_in_file`
  - `search_files`
  - `list_directory`
  - `exists`
  - `refresh_assets`
  - `run_script_diagnostics`
  - `get_script_diagnostic_context`
  - `capture_desktop_screenshot`
  - `capture_editor_screenshot`
  - `capture_scene_screenshot`
  - `capture_game_screenshot`
  - `capture_preview_screenshot`
  - `list_editor_windows`
  - `get_runtime_state`
  - `pause_runtime`
  - `resume_runtime`
  - `set_time_scale`
  - `emit_node_event`
  - `simulate_button_click`
  - `invoke_component_method`
  - `simulate_mouse_click`
  - `simulate_mouse_drag`
  - `simulate_key_press`
  - `simulate_key_combo`
  - `simulate_preview_input`
- `full` 模式附加工具：
  - `create_node`
  - `delete_node`
  - `set_node_transform`
  - `add_component`
  - `remove_component`
  - `set_component_property`
  - `reset_component_property`
  - `create_canvas`
  - `create_label`
  - `create_button`
  - `create_sprite`
  - `create_camera`
  - `set_camera_properties`
  - `add_animation_clip`
  - `instantiate_prefab`
  - `run_scene_asset`
  - `delete_asset`
- 资源：
  - `cocos://project/context`
  - `cocos://project/summary`
  - `cocos://scene/active`
  - `cocos://scene/current`
  - `cocos://selection/current`
  - `cocos://selection/asset`
  - `cocos://errors/scripts`
  - `cocos://mcp/interactions`

## 安装方式

把当前目录作为 Cocos Creator 扩展放到：

- 项目级：`<你的项目>/extensions/funplay-cocos-mcp`
- 全局级：`<Cocos Creator 用户扩展目录>/funplay-cocos-mcp`

然后重启 Cocos Creator，扩展会默认自动启动 MCP 服务。

默认地址：

- `http://127.0.0.1:8765/`

## 图形化面板

扩展启用后，可以在 Cocos Creator 顶部菜单打开：

- `Funplay -> MCP Server`

面板里可以直接完成：

- 启动 / 停止 / 重启 MCP Server
- 查看当前 URL、端口、Profile、项目名
- 保存 `host / port / toolProfile / autostart` 配置
- 一键写入 MCP Client 配置
- 复制 Codex TOML 或 JSON MCP Client 配置
- 查看工具列表、资源列表、最近交互日志
- 直接从 Cocos 里调用工具并填写 JSON 参数
- Quick Actions 优先给出 `execute_javascript`
- 一键测试 `execute_javascript`、`get_project_info`、`get_scene_info`、`get_hierarchy`、截图、诊断等常用工具

一键配置当前支持：

- Claude Code / Claude Desktop：`~/.claude.json`
- Cursor：`~/.cursor/mcp.json`
- VS Code：`~/.vscode/mcp.json`
- Trae：`~/.trae/mcp.json`
- Kiro：`~/.kiro/settings/mcp.json`
- Codex：`~/.codex/config.toml`

面板会使用当前端口写入 `funplay_cocos` MCP server。写入后请重启对应客户端。

## 可选配置

在 Cocos 项目根目录放一个 `funplay-cocos-mcp.config.json`：

```json
{
  "host": "127.0.0.1",
  "port": 8765,
  "toolProfile": "core",
  "autostart": true,
  "maxInteractionLogEntries": 50
}
```

也支持环境变量：

- `COCOS_MCP_HOST`
- `COCOS_MCP_PORT`
- `COCOS_MCP_PROFILE`

## MCP Client 示例

### Codex

```toml
[mcp_servers.funplay_cocos]
url = "http://127.0.0.1:8765/"
```

### Claude / Cursor

```json
{
  "mcpServers": {
    "funplay_cocos": {
      "url": "http://127.0.0.1:8765/"
    }
  }
}
```

## 推荐首测

先在 MCP Client 里调用：

1. `get_project_info`
2. `get_scene_info`
3. `get_hierarchy`
4. `resources/read` with `cocos://project/context`
5. `execute_javascript`（`context: "scene"`）
6. `execute_javascript`（`context: "editor"`）
7. `run_script_diagnostics`
8. `capture_desktop_screenshot`
9. `list_components`
10. `get_script_diagnostic_context`
11. `get_runtime_state`
12. `capture_editor_screenshot`
13. `list_editor_windows`
14. `capture_scene_screenshot`
15. `simulate_mouse_click`

其中 `execute_javascript` 是统一主工具，`execute_scene_script` / `execute_editor_script` 主要保留给兼容调用。

`execute_javascript` 示例，场景上下文：

```json
{
  "context": "scene",
  "code": "return { sceneName: scene.name, rootCount: scene.children.length };"
}
```

`execute_javascript` 示例，编辑器上下文：

```json
{
  "context": "editor",
  "code": "return { projectPath: context.projectPath, toolCount: helpers.listTools().length };"
}
```

`execute_scene_script.code` 兼容示例：

```js
return {
  sceneName: scene.name,
  rootChildren: scene.children.map((node) => node.name),
};
```

## 和 Unity MCP 的对应关系

- Unity `execute_code` → Cocos `execute_javascript`
- Unity `execute_code` 的场景/编辑器兼容拆分入口 → `execute_scene_script` / `execute_editor_script`
- Unity `get_scene_info` → Cocos `get_scene_info`
- Unity `get_hierarchy` → Cocos `get_hierarchy`
- Unity `read_file/write_file/search_files` → 同名 Cocos 文件工具
- Unity `resources/prompts` → 同结构的 Cocos 资源与提示词
- Unity `core/full` → Cocos `toolProfile=core|full`

## 当前边界

这版已经进入第二阶段，补上了：

- 资产查询 / 打开 / 删除 / 选中
- TypeScript 脚本诊断
- 本机桌面截图回传 MCP image

现在第三段也补上了：

- 组件增删查改
- Scene / Prefab 资产工具
- 脚本修复辅助链路：`get_script_diagnostic_context` + `replace_in_file`

第四段继续补上了：

- UI 专用工具：Canvas / Label / Button / Sprite 创建
- Camera 专用工具：列出、创建、属性设置
- Animation 专用工具：列出、添加 Clip、播放、停止
- 运行态控制：暂停、恢复、时间缩放、状态查询
- 输入/交互模拟：按钮点击、节点事件、组件方法调用
- 截图增强：桌面截图、Editor 窗口截图、场景截图别名

这次把之前两块缺口也补了：

- `capture_scene_screenshot` 现在优先按 Editor 内部面板区域裁剪，不再只是整窗截图别名
- 新增 `capture_game_screenshot` / `capture_preview_screenshot`
- 新增 `list_editor_windows` 方便先看 Cocos/Electron 当前有哪些窗口
- 新增基于 Electron `webContents.sendInputEvent` 的底层输入注入：
  - `simulate_mouse_click`
  - `simulate_mouse_drag`
  - `simulate_key_press`
  - `simulate_key_combo`
  - `simulate_preview_input`

暂时还没有直接补齐 Unity MCP 里的这些能力：

- 对 Scene/Game 面板做“语义级”识别仍然是 best-effort，依赖当前 Cocos 面板 DOM 结构
- Preview/Simulator 底层输入已经支持，但不同窗口标题和焦点状态可能需要先用 `list_editor_windows` 确认目标
- 动画曲线/状态机深度编辑

如果你要，我下一步可以继续补下一阶段，专门给你做：

1. `SceneView/GameView 精确截图裁剪`  
2. `Preview/Simulator 键鼠事件注入`  
3. `动画曲线和状态机编辑`  
4. `更像 unity-mcp 的完整工具分层`

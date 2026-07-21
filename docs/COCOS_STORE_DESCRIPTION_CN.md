# Funplay MCP for Cocos

## 【功能介绍】

Funplay MCP for Cocos 是一款面向 **Cocos Creator 3.8 及以上版本**的开源 AI 开发插件。它将 MCP Server 直接嵌入 Cocos Creator 编辑器，让 Claude Code、Cursor、Codex、VS Code Copilot、Trae、Kiro 等支持 MCP 的 AI 编程助手连接当前项目，读取真实编辑器上下文并执行开发工作流。

与只能分析项目文件的普通 AI 助手不同，本插件能够访问当前打开的场景、节点层级、组件、资源、Prefab、日志、脚本诊断、编辑器状态和截图。AI 可以基于项目的实际状态进行分析、修改和验证，减少开发者在编辑器、终端和 AI 客户端之间反复切换。

### 核心能力

- **统一 JavaScript 执行工具**：通过 `execute_javascript` 在场景或编辑器上下文中执行组合操作，适合创建 UI、调整节点、检查运行状态和处理重复性编辑器工作。
- **105 个内置工具**：覆盖场景与节点、组件、资源与 Prefab、文件、日志、脚本诊断、截图、运行状态、构建、预览、事件绑定和输入模拟等常见工作流。
- **真实编辑器上下文**：读取当前项目、活动场景、节点层级、选中对象、资源信息、脚本错误、编辑器日志和最近 MCP 调用记录。
- **场景与资源自动化**：支持创建和打开场景、检查和修改节点及组件、创建 Prefab、分析资源依赖、验证 Prefab 引用并刷新资源数据库。
- **预览与可视化验证**：支持浏览器预览、编辑器 Game View 和模拟器模式，可获取浏览器预览地址，并通过编辑器、场景或预览截图验证结果。
- **一键配置 AI 客户端**：可在插件面板中为 Claude Code、Cursor、Codex、VS Code、Trae、Kiro 等客户端生成或写入 MCP 配置。
- **灵活的工具 Profile**：默认 `core` Profile 提供 39 个高频工具；需要完整能力时可切换到 `full`，也可以按分类或工具名称自定义暴露范围。
- **多窗口管理面板**：提供 MCP Server、Tool Exposure、MCP Settings、Activity 等独立窗口，用于管理服务、工具范围、客户端配置、调用记录和日志。
- **中英文界面**：菜单和窗口标题跟随 Cocos Creator；窗口内控件与状态提示可跟随 Creator，也可按项目手动指定中文或英文。
- **自动更新与一键更新**：可检查 GitHub Release 新版本，下载更新包并校验 SHA256；普通安装支持面板内更新。
- **本地运行与安全边界**：服务默认只监听 `127.0.0.1`，文件工具限制在当前项目目录内，`execute_javascript` 默认启用高风险操作检查。
- **开放兼容**：同时提供 MCP Tools、Resources 和 Prompts，兼容支持 Streamable HTTP 或 stdio MCP 配置的客户端。

### 适用场景

- 让 AI 快速理解已有 Cocos 项目的场景、资源和代码结构。
- 创建或调整 UI、节点、组件、Prefab 和常用编辑器内容。
- 排查 TypeScript 错误、编辑器日志、资源依赖和 Prefab 引用问题。
- 启动并切换预览模式，通过截图或浏览器地址验证实际效果。
- 为团队建立可复用的 AI 项目指令、工具 Profile 和自动化工作流。

### 兼容性与说明

- 最低支持版本：**Cocos Creator 3.8**。
- 本插件仅在编辑器中运行，不会向最终游戏包添加运行时代码。
- AI 客户端及其模型服务需要由用户自行安装和配置，本插件不包含第三方 AI 服务。
- 默认服务地址为 `http://127.0.0.1:8765/`；端口被占用时会自动切换到后续可用端口，并在面板中显示实际地址。
- 具备修改能力的工具会直接操作当前项目，建议使用 Git 或其他版本管理工具，并在重要操作前确认改动范围。

## 【使用教程】

1. **安装插件**

   从 Cocos Store 将 Funplay MCP for Cocos 安装到目标项目，然后使用 Cocos Creator 3.8 或更高版本打开该项目。

2. **打开控制面板**

   在 Cocos Creator 顶部菜单中选择：

   `Funplay > MCP Server`

3. **启动 MCP Server**

   在面板中确认服务状态并点击启动。默认地址为：

   `http://127.0.0.1:8765/`

   如果默认端口被占用，请以面板显示的实际运行端口为准。

4. **选择并配置 AI 客户端**

   在客户端配置区域选择 Claude Code、Cursor、Codex、VS Code、Trae 或 Kiro，然后点击一键配置。也可以复制面板生成的配置，手动添加到其他支持 MCP 的客户端。

5. **确认连接**

   回到 AI 客户端，确认 `funplay-cocos-mcp` 已连接并能看到工具列表。首次使用可以先调用 `get_project_info`、`get_scene_info` 或 `get_hierarchy` 检查项目和场景信息。

6. **开始使用**

   例如可以向 AI 提出：

   > 检查当前场景层级和脚本错误，并告诉我最需要处理的问题。

   > 在当前场景创建一个包含标题、输入框和按钮的登录界面，完成后截图验证。

   > 切换到浏览器预览模式，启动当前场景并返回预览地址。

7. **按需调整工具范围**

   默认 `core` Profile 适合常用检查和开发任务。如果需要文件写入、完整场景编辑、预览切换等更多能力，可在 `Funplay > Tool Exposure` 中切换到 `full` 或创建自定义 Profile。

8. **检查更新**

   在 MCP Server 面板中可以检查新版本。普通商店安装可使用一键更新；Git worktree 或软链接开发安装请继续使用 Git 更新，避免覆盖开发目录。

## 【联系方式】

**开源仓库**

https://github.com/FunplayAI/funplay-cocos-mcp

**问题反馈与功能建议**

https://github.com/FunplayAI/funplay-cocos-mcp/issues

**作者**

Funplay / FunplayAI

**联系邮箱**

3256714392@qq.com

本项目采用 MIT 开源协议。欢迎通过 GitHub Issue 提交兼容性问题、功能建议和使用反馈。

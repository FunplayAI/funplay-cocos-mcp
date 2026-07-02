# Funplay MCP for Cocos

## 【功能介绍】

Funplay MCP for Cocos 是一个面向 Cocos Creator 3.8+ 的 AI 工作流插件。插件会在 Cocos Creator 编辑器内启动本地 MCP Server，让 Claude Code、Cursor、Codex、VS Code Copilot、Trae、Kiro 等 AI 编程助手可以连接到当前 Cocos 项目，并读取真实的编辑器上下文。

安装后，AI 助手不仅可以分析项目文件，还可以查看当前编辑器中的场景、节点、组件、资源、日志、截图、项目配置和运行状态，从而更好地辅助开发者完成项目分析、问题排查、资源检查和编辑器自动化操作。

主要能力包括：

- 在 Cocos Creator 内启动本地 MCP Server。
- 支持 AI 客户端连接当前 Cocos 项目。
- 支持查看场景、节点、组件、资源、日志和截图。
- 支持资源依赖检查和项目状态校验。
- 支持构建状态、预览运行、场景保存、编辑器偏好设置等辅助操作。
- 支持 Button 点击事件查看与绑定。
- 支持工具 Profile，可为不同 AI 客户端配置不同工具范围。
- 支持一键生成推荐的 AI 项目 Skill，让 AI 更理解当前 Cocos 项目。
- 内置图形化控制面板，方便管理服务状态、工具列表、客户端配置和日志信息。

Funplay MCP for Cocos 适合希望把 AI 助手接入真实 Cocos Creator 编辑器环境的开发者，可以提升项目理解、调试排查和重复性编辑器操作的效率。

## 【使用教程】

1. 在 Cocos Store 中安装 Funplay MCP for Cocos 插件。

2. 打开需要使用 AI 辅助开发的 Cocos Creator 项目。

3. 在 Cocos Creator 顶部菜单中打开：

   `Funplay > MCP Server`

4. 在 `Funplay Cocos MCP` 面板中启动 MCP Server。

   默认服务地址为：

   `http://127.0.0.1:8765/`

5. 在面板中的 MCP Client Config 区域选择你使用的 AI 客户端，例如 Claude Code、Cursor、Codex、VS Code Copilot、Trae 或 Kiro。

6. 点击一键配置，或根据面板中展示的配置内容手动复制到对应 AI 客户端。

7. 回到 AI 客户端后，即可让 AI 读取 Cocos 项目状态、检查场景和资源、查看日志、分析问题，并辅助执行 Cocos 编辑器相关工作流。

建议首次使用时先打开一个测试项目，确认 MCP Server 启动成功后，再在正式项目中使用。

## 【联系方式】

开源仓库：

https://github.com/FunplayAI/funplay-cocos-mcp

问题反馈与功能建议：

https://github.com/FunplayAI/funplay-cocos-mcp/issues

作者：

Funplay

联系邮箱：

3256714392@qq.com

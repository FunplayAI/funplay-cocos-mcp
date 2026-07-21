'use strict';

const ZH_PROFILE_LABELS = {
  primary: '主要',
  compat: '兼容',
  specialist: '专用',
  core: '核心',
};

const ZH_TOOL_DESCRIPTIONS = {
  execute_javascript: '在场景或编辑器上下文中执行 JavaScript。使用 context="scene" 检查和修改实时场景或运行时；使用 context="editor" 调用 Editor API、处理 asset-db、编排 MCP、访问本地文件系统及执行高级自动化。当多个窄工具会产生过多调用时，优先使用此主要通用工具。',
  execute_scene_script: '在当前 Cocos 场景上下文中执行 JavaScript。优先使用 context="scene" 的 execute_javascript 作为统一入口；仅在明确需要场景专用兼容入口时使用此工具。',
  execute_editor_script: '在编辑器或浏览器上下文中执行 JavaScript。优先使用 context="editor" 的 execute_javascript 作为统一入口；仅在明确需要编辑器专用兼容入口时使用此工具。',
  get_editor_state: '返回结构化编辑器状态快照，包括项目信息、运行时服务状态、当前选择和可见的 Electron 窗口。需要一份紧凑编辑器摘要时优先使用。',
  get_tool_catalog: '返回所有内置 MCP 工具及其 profile、分类和当前开放状态。修改自定义工具开放范围前使用。',
  check_for_updates: '检查最新的 Funplay Cocos MCP GitHub Release，并与当前安装版本比较。',
  get_selection: '以紧凑结构返回当前编辑器选择。下一步操作依赖选择状态时优先使用。',
  list_project_instructions: '列出项目 AI 指令文件和本地 Codex 项目技能。',
  read_project_instruction: '读取 AGENTS.md、CLAUDE.md 或 .codex 技能 SKILL.md 等项目 AI 指令文件。',
  write_project_instruction: '在 Cocos 项目内创建或更新项目 AI 指令文件。',
  create_project_skill: '在 .codex/skills/{skillName}/SKILL.md 创建本地 Codex 项目技能。',
  create_cocos_mcp_project_skill: '为 Funplay Cocos MCP 工作流创建推荐的本地 Codex 项目技能。',
  set_selection: '设置或清除编辑器中选中的资源或节点。后续编辑器流程依赖选择状态时使用。',
  get_scene_info: '返回当前 Cocos 场景的结构化摘要。多步检查或修改优先使用 execute_javascript；仅需要紧凑场景快照时使用此工具。',
  get_hierarchy: '返回当前场景或指定节点路径下的结构化层级树。复杂推理或修复优先使用 execute_javascript；需要稳定层级快照时使用此工具。',
  find_nodes: '按精确名称、部分路径或组件类型查找场景节点。',
  inspect_node: '按路径、uuid 或名称检查指定节点。',
  create_node: '在当前场景或指定父节点路径下创建新节点。',
  delete_node: '按路径、uuid 或名称删除节点。',
  set_node_transform: '更新节点的位置、旋转、缩放或激活状态。',
  get_project_info: '返回当前 Cocos 项目路径、版本和 MCP 服务配置。需要快速结构化项目摘要时优先使用；需要在检查后立即操作时使用 execute_javascript。',
  save_current_scene: '使用可用的编辑器场景消息保存当前打开的 Cocos 场景。',
  open_build_panel: '打开 Cocos 构建面板，默认使用 builder 面板 ID。',
  get_build_status: '通过已知的 builder 消息变体查询 Cocos 构建和预览状态。',
  get_preview_mode: '查询当前 Cocos Creator 预览模式和浏览器预览地址。支持 browser、gameView 和 simulator。',
  set_preview_mode: '通过 Cocos Creator 3.8.x 支持的 Preview profile 和工具栏消息切换预览模式。',
  run_project_preview: '在浏览器、编辑器 Game View 或模拟器中启动 Cocos Creator 3.8.x 预览，并在可用时返回实际模式和浏览器预览地址。',
  get_editor_preference: '在 Editor.Profile 可用时读取 Cocos 编辑器偏好设置。',
  set_editor_preference: '在 Editor.Profile 可用时写入 Cocos 编辑器偏好设置。',
  broadcast_editor_message: '发送或广播 Cocos 编辑器消息，用于高级编辑器自动化。',
  create_scene: '在明确的 assets 路径创建空场景或当前场景副本，不打开交互式保存对话框。',
  list_scenes: '列出项目中的场景资源。打开场景前需要精确查找时优先使用；更广泛的工作流使用 execute_javascript。',
  open_scene: '按 uuid、db url 或路径在 Cocos Creator 中打开场景资源。明确需要切换场景时使用；其他情况继续以 execute_javascript 作为主要规划工具。',
  list_prefabs: '列出项目中的 Prefab 资源。',
  inspect_prefab: '检查 Prefab 资源、元数据、序列化文件路径和类似 UUID 的资源引用。',
  validate_prefab_references: '通过 asset-db 检查序列化 UUID 引用，验证 Prefab 资源引用。',
  duplicate_prefab: '复制现有 Prefab 文件创建新 Prefab 资源，但不复制其 .meta UUID。',
  edit_prefab_json: '通过 JSON 路径赋值或文本查找替换编辑 Prefab JSON 文件，然后验证引用。',
  create_prefab_from_node: '通过场景进程序列化和 asset-db 持久化，从现有场景节点创建 Prefab 资源。在 Cocos Creator 3.8.x 中使用此工具替代原始 scene:create-prefab。',
  create_prefab_instance: '在可用时使用 Cocos 场景 create-node 消息，在编辑器层级中创建关联的 Prefab 实例。',
  inspect_prefab_instance: '检查场景节点是否关联到 Prefab 实例，并在可用时返回 Prefab 元数据。',
  apply_prefab_instance: '使用 Cocos 编辑器场景 apply-prefab 消息，将场景中的 Prefab 实例改动应用回关联资源。',
  revert_prefab_instance: '使用可用的 Cocos 编辑器 Prefab 还原消息，将场景 Prefab 实例还原为关联资源状态。',
  instantiate_prefab: '按 Prefab uuid 将 Prefab 实例化到当前场景。',
  run_scene_asset: '按 uuid 将场景资源直接加载到当前运行时场景上下文。',
  list_assets: '按模式或资源类型从 asset-db 查询项目资源。需要精确查找资源时优先使用；更广泛的自动化使用 execute_javascript。',
  inspect_asset: '按 uuid 或路径检查 asset-db 信息、元数据和序列化资源数据。需要精确结构化资源读取时优先使用。',
  open_asset: '按 uuid、db url 或路径在 Cocos Creator 中打开资源。仅当明确需要打开资源本身时使用。',
  delete_asset: '按 uuid、db url 或路径从 asset-db 删除资源。',
  select_asset: '在 Cocos 编辑器中选择资源。编辑器选择状态很重要时使用；其他情况继续以 execute_javascript 作为主要工作流。',
  inspect_asset_dependencies: '检查 Cocos 序列化资源中引用的 UUID 类型依赖。',
  validate_asset_dependencies: '验证单个资源或项目资源查询结果中的 UUID 类型依赖。',
  get_editor_selection: '返回 Cocos 编辑器当前选择的节点和资源。优先使用 get_selection 作为主要结构化选择读取工具。',
  list_components: '列出场景节点上挂载的组件。',
  inspect_component: '检查节点上挂载的组件。',
  add_component: '按组件类名向节点添加组件。',
  remove_component: '按名称或索引从节点移除组件。',
  set_component_property: '使用 JSON 值按点路径设置组件属性。',
  reset_component_property: '按点路径重置或清除组件属性。',
  create_canvas: '创建带有 UITransform 的 Cocos Canvas 节点。',
  create_label: '在父节点下创建 UI Label 节点。',
  create_button: '创建带有子 Label 的 UI Button 节点。',
  create_sprite: '创建 UI Sprite 节点，并可选择指定 SpriteFrame 资源 uuid。',
  list_cameras: '列出当前场景中的 Camera 组件。',
  create_camera: '在当前场景中创建 Camera 节点。',
  set_camera_properties: '设置所选 Camera 组件的属性。',
  list_animations: '列出当前场景或指定节点下的 Animation 组件。',
  add_animation_clip: '向节点的 Animation 组件添加 AnimationClip 资源。',
  play_animation: '在节点上播放 Animation 组件中的动画片段。',
  stop_animation: '停止节点上 Animation 组件播放的动画片段。',
  read_file: '读取 Cocos 项目中的文件。',
  get_file_snippet: '读取文件指定行附近的聚焦代码片段。',
  write_file: '写入或覆盖 Cocos 项目中的文件。',
  replace_in_file: '替换文件中的文本，适合脚本自动修复循环。',
  search_files: '使用简单通配符模式搜索项目文件。',
  list_directory: '列出项目目录内的文件和子目录。',
  exists: '检查项目文件或目录是否存在。',
  refresh_assets: '尽力刷新指定文件或 assets 根目录的资源数据库。',
  run_script_diagnostics: '对当前 Cocos 项目运行 TypeScript no-emit 检查并返回解析后的诊断。需要诊断脚本错误时优先使用此专用工具。',
  get_recent_logs: '返回最近的 MCP 运行日志、工具调用记录和常见项目日志文件尾部内容。',
  search_project_logs: '使用字符串或正则表达式搜索常见 Cocos 项目日志文件。',
  clear_logs: '清除内存中的 MCP 日志；仅在明确确认后截断常见项目日志文件。',
  validate_scene: '对当前场景、运行时状态、TypeScript 诊断和最近项目日志错误执行紧凑验证。',
  get_performance_snapshot: '返回场景规模和运行时性能计数，包括节点/组件数量、UI 数量、深度、内存和警告。',
  get_runtime_state: '返回结构化 Cocos 运行时状态，包括暂停状态、帧数和调度器时间缩放。需要紧凑验证快照时优先使用。',
  pause_runtime: '暂停 Cocos director 的游戏逻辑执行。',
  resume_runtime: '恢复 Cocos director 的游戏逻辑执行。',
  set_time_scale: '设置 Cocos 调度器时间缩放，用于运行时验证。',
  emit_node_event: '在目标场景节点上触发自定义事件，并可附带 JSON 数据。',
  simulate_button_click: '通过在目标按钮节点上触发点击事件，模拟 Cocos Button 点击。',
  list_button_click_events: '列出 Cocos Button 组件的点击事件绑定。',
  bind_button_click_event: '将 Cocos Button 点击事件绑定到目标节点的组件方法。',
  invoke_component_method: '调用组件方法，用于运行时验证和测试钩子。',
  get_script_diagnostic_context: '运行 TypeScript 诊断并为每个错误附加源码片段。修复前分析编译错误时优先使用此专用工具。',
  capture_desktop_screenshot: '截取本地桌面，并以 MCP 图片数据返回。',
  capture_editor_screenshot: '截取当前聚焦的 Cocos Creator 编辑器窗口，并以 MCP 图片数据返回。仅在明确需要视觉验证时优先使用截图工具。',
  capture_scene_screenshot: '截取编辑器 Scene 面板区域，并在可用时按面板裁剪。仅用于场景侧结果的视觉验证。',
  capture_game_screenshot: '截取编辑器 Game/Preview 面板区域，并在可用时按面板裁剪。',
  list_editor_windows: '列出可用的 Electron 窗口，便于截图或输入工具选择正确目标。明确需要处理窗口目标问题时使用。',
  simulate_mouse_click: '向编辑器、预览或模拟器窗口发送底层 Electron 鼠标点击。',
  simulate_mouse_drag: '向编辑器、预览或模拟器窗口发送底层 Electron 鼠标拖拽。',
  simulate_key_press: '向编辑器、预览或模拟器窗口发送底层 Electron 按键。',
  simulate_key_combo: '向编辑器、预览或模拟器窗口发送底层 Electron 组合按键，例如 Ctrl+S 或 Cmd+P。',
  simulate_preview_input: '底层预览或模拟器输入的便捷封装。默认模拟鼠标点击；提供 keyCode 时模拟按键。',
  capture_preview_screenshot: '截取预览或模拟器窗口，并以 MCP 图片数据返回。仅在需要游戏或预览输出的视觉证明时使用。',
};

function localizeToolDescription(tool, language) {
  const description = String(tool && tool.description || '');
  if (language !== 'zh') {
    return description;
  }

  const translated = ZH_TOOL_DESCRIPTIONS[tool && tool.name];
  if (!translated) {
    return description;
  }

  const profileMatch = description.match(/^\[([a-z]+)\]\s*/i);
  if (!profileMatch) {
    return translated;
  }
  const profile = profileMatch[1].toLowerCase();
  const label = ZH_PROFILE_LABELS[profile] || profile;
  return `[${label}] ${translated}`;
}

module.exports = {
  ZH_PROFILE_LABELS,
  ZH_TOOL_DESCRIPTIONS,
  localizeToolDescription,
};

'use strict';

class PromptProvider {
  constructor(getRuntimeContext) {
    this.getRuntimeContext = getRuntimeContext;
  }

  listPrompts() {
    const { projectName } = this.getRuntimeContext();
    return [
      this.createPrompt('fix_script_errors', `In core mode, default to execute_javascript first and only switch to specialist tools when they are clearly better for diagnostics, screenshots, or resource reads in '${projectName}'.`),
      this.createPrompt('create_playable_prototype', `In core mode, default to execute_javascript first and only switch to specialist tools when they are clearly better for screenshots, asset lookup, or scene opening in '${projectName}'.`),
      this.createPrompt('scene_validation', `In core mode, default to execute_javascript first and only switch to specialist tools when they are clearly better for screenshots, diagnostics, or structured resource reads in '${projectName}'.`),
      this.createPrompt('auto_wire_scene', `In core mode, default to execute_javascript first and only switch to specialist tools when they are clearly better for asset lookup, scene opening, diagnostics, or screenshots in '${projectName}'.`),
    ];
  }

  getPrompt(name) {
    const { projectName, projectPath } = this.getRuntimeContext();
    let text = '';

    switch (name) {
      case 'fix_script_errors':
        text = 'In `core` mode, assume `execute_javascript` is the default first tool. Start with `context="editor"` for diagnosis, local file edits, asset-db workflows, and orchestration; switch to `context="scene"` only when runtime or scene state must be inspected directly. Only use specialist tools when they are strictly better primitives: `run_script_diagnostics` and `get_script_diagnostic_context` for TypeScript errors, `resources/read` for structured project context, and screenshot tools for visual verification. Avoid hopping across many narrow tools when one `execute_javascript` call can inspect, decide, and act. Patch the smallest safe regions, refresh assets if needed, and verify the project returns to a healthy state.';
        break;
      case 'create_playable_prototype':
        text = 'In `core` mode, treat `execute_javascript` as the primary tool for almost the entire workflow. Use `context="scene"` for node, component, UI, and runtime orchestration, and use `context="editor"` only when editor-side automation, file work, or asset-db access is required. Reach for specialist tools only when they provide a clearly better primitive: `open_scene` to load a scene, asset tools when you need exact asset identification, and screenshot tools when you need visual proof. Build the prototype in a few high-leverage `execute_javascript` steps instead of many tiny tool calls, then verify with runtime state and screenshots.';
        break;
      case 'scene_validation':
        text = 'In `core` mode, start with `execute_javascript`, usually with `context="scene"`, and keep it as the main tool unless a specialist tool is clearly superior. Use it to inspect hierarchy, nodes, components, prefab instances, cameras, animations, and runtime state in one place. Only switch to specialist tools when you specifically need a screenshot, a structured resource read, or TypeScript diagnostics. Prefer a small number of high-signal validation steps over broad tool hopping.';
        break;
      case 'auto_wire_scene':
        text = 'In `core` mode, begin with `execute_javascript` and assume it will handle nearly all inspection and repair. Use `context="scene"` for hierarchy, node, component, and UI wiring repair, and use `context="editor"` only when file edits, asset-db access, or editor-side orchestration is required. Switch to specialist tools only for exact asset lookup, scene opening, diagnostics, or screenshots. Inspect the target structure, identify missing references or expected children, and repair them with the smallest safe change rather than scattering work across many narrow tools.';
        break;
      default:
        text = `Prompt not found: ${name}`;
        break;
    }

    const fullText = `Target Cocos project: ${projectName}\nProject path: ${projectPath}\n\n${text}`;
    return {
      description: fullText,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: fullText,
          },
        },
      ],
    };
  }

  createPrompt(name, description) {
    return {
      name,
      description,
      arguments: [],
    };
  }
}

module.exports = {
  PromptProvider,
};

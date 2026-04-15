'use strict';

class PromptProvider {
  constructor(getRuntimeContext) {
    this.getRuntimeContext = getRuntimeContext;
  }

  listPrompts() {
    const { projectName } = this.getRuntimeContext();
    return [
      this.createPrompt('fix_script_errors', `Use execute_javascript first to diagnose and repair current Cocos script problems in '${projectName}'.`),
      this.createPrompt('create_playable_prototype', `Use execute_javascript first to build a playable Cocos prototype in '${projectName}' from a short idea.`),
      this.createPrompt('scene_validation', `Use execute_javascript first to validate a scene change in '${projectName}' with hierarchy checks and focused inspection.`),
      this.createPrompt('auto_wire_scene', `Use execute_javascript first to inspect a target setup in '${projectName}' and wire missing scene relationships.`),
    ];
  }

  getPrompt(name) {
    const { projectName, projectPath } = this.getRuntimeContext();
    let text = '';

    switch (name) {
      case 'fix_script_errors':
        text = 'Prefer `execute_javascript` first: use `context="editor"` for diagnostics, filesystem edits, and asset-db workflows, and `context="scene"` when runtime or scene validation is needed. Run script diagnostics, inspect source snippets for each error, patch the smallest safe regions with focused file edits, refresh assets, and verify the project returns to a healthy state.';
        break;
      case 'create_playable_prototype':
        text = 'Prefer `execute_javascript` as the primary tool: use `context="scene"` for node/component/runtime orchestration and `context="editor"` for editor-side automation. Create a playable Cocos prototype from the provided idea. Build scene nodes, scripts, prefabs, UI, camera, animation hooks, helper controls, and verify the result with runtime state and screenshots.';
        break;
      case 'scene_validation':
        text = 'Prefer `execute_javascript` as the first tool, usually with `context="scene"`. Inspect the active scene, verify hierarchy, nodes, components, prefab instances, cameras, animations, runtime state, screenshots, and targeted checks.';
        break;
      case 'auto_wire_scene':
        text = 'Prefer `execute_javascript` as the first tool, using `context="scene"` for hierarchy and component repair and `context="editor"` for file or asset-side repair. Inspect the target node structure, identify missing scene references, UI children, camera/animation setup, or expected children, and repair them with the smallest safe change.';
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

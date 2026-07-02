'use strict';

module.paths.push(Editor.App.path + '/node_modules');

const cc = require('cc');

const {
  Node,
  director,
  Vec3,
  Quat,
  Color,
  assetManager,
  instantiate,
  Prefab,
  SceneAsset,
  js,
  Component,
  EventHandler,
  Canvas,
  UITransform,
  Label,
  Sprite,
  Button,
  Widget,
  Camera,
  Animation,
  AnimationClip,
} = cc;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function getScene() {
  const scene = director.getScene();
  if (!scene) {
    throw new Error('No active scene is loaded.');
  }
  return scene;
}

function getComponentNames(node) {
  const components = Array.isArray(node.components) ? node.components : [];
  return components
    .map((component) => component && component.constructor && component.constructor.name)
    .filter(Boolean);
}

function getSerializableKeys(target) {
  const keys = new Set();
  let current = target;
  let depth = 0;
  while (current && current !== Object.prototype && depth < 4) {
    for (const key of Object.keys(current)) {
      if (!key.startsWith('_')) {
        keys.add(key);
      }
    }
    current = Object.getPrototypeOf(current);
    depth += 1;
  }
  return Array.from(keys);
}

function getNodePath(node) {
  const names = [];
  let current = node;
  const scene = getScene();

  while (current && current !== scene) {
    names.unshift(current.name);
    current = current.parent;
  }

  return names.join('/');
}

function vectorToObject(value) {
  if (!value) {
    return null;
  }
  return { x: value.x, y: value.y, z: value.z };
}

function quatToObject(value) {
  if (!value) {
    return null;
  }
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function colorToObject(value) {
  if (!value) {
    return null;
  }
  return { r: value.r, g: value.g, b: value.b, a: value.a };
}

function summarizeNode(node, depth, maxDepth, includeComponents, includeInactive) {
  if (!includeInactive && !node.active) {
    return null;
  }

  const summary = {
    name: node.name,
    path: getNodePath(node),
    uuid: node.uuid,
    active: Boolean(node.active),
    layer: node.layer,
    position: vectorToObject(node.position),
    rotation: quatToObject(node.rotation),
    scale: vectorToObject(node.scale),
  };

  if (includeComponents) {
    summary.components = getComponentNames(node);
  }

  if (depth < maxDepth) {
    const children = [];
    for (const child of node.children) {
      const childSummary = summarizeNode(child, depth + 1, maxDepth, includeComponents, includeInactive);
      if (childSummary) {
        children.push(childSummary);
      }
    }
    summary.children = children;
  } else {
    summary.childCount = node.children.length;
  }

  return summary;
}

function walkNodes(visitor, node) {
  visitor(node);
  for (const child of node.children) {
    walkNodes(visitor, child);
  }
}

function findNodeByPath(nodePath) {
  if (!nodePath) {
    return null;
  }

  const segments = String(nodePath)
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  let current = getScene();
  if (segments[0] === current.name) {
    segments.shift();
  }

  for (const segment of segments) {
    current = current.children.find((child) => child.name === segment);
    if (!current) {
      return null;
    }
  }

  return current;
}

function findNodeByUuid(uuid) {
  if (!uuid) {
    return null;
  }

  let match = null;
  walkNodes((node) => {
    if (!match && node.uuid === uuid) {
      match = node;
    }
  }, getScene());
  return match;
}

function findNodeByName(name) {
  if (!name) {
    return null;
  }

  let match = null;
  walkNodes((node) => {
    if (!match && node.name === name) {
      match = node;
    }
  }, getScene());
  return match;
}

function findNode(input) {
  return findNodeByUuid(input.uuid) || findNodeByPath(input.path) || findNodeByName(input.name);
}

function getCceSerializer() {
  const cceGlobal = typeof globalThis !== 'undefined' ? globalThis.cce : undefined;
  const serializer = cceGlobal && cceGlobal.Utils && cceGlobal.Utils.serialize;
  if (typeof serializer !== 'function') {
    throw new Error('cce.Utils.serialize is unavailable. Prefab serialization must run in the Cocos scene process.');
  }
  return serializer.bind(cceGlobal.Utils);
}

function resolveComponentClass(componentName) {
  if (!componentName) {
    return null;
  }
  if (typeof componentName !== 'string') {
    return componentName;
  }

  const direct = js && typeof js.getClassByName === 'function' ? js.getClassByName(componentName) : null;
  if (direct) {
    return direct;
  }

  const candidates = [componentName, `cc.${componentName}`];
  for (const candidate of candidates) {
    const found = js && typeof js.getClassByName === 'function' ? js.getClassByName(candidate) : null;
    if (found) {
      return found;
    }
  }

  return null;
}

function findComponent(node, options = {}) {
  if (!node) {
    return null;
  }

  if (Number.isInteger(options.index)) {
    return node.components[options.index] || null;
  }

  if (options.componentName) {
    const exact = node.components.find((component) => component && component.constructor && component.constructor.name === options.componentName);
    if (exact) {
      return exact;
    }

    const componentClass = resolveComponentClass(options.componentName);
    if (componentClass) {
      return node.getComponent(componentClass);
    }
  }

  return null;
}

function getEventHandlerClass() {
  return (Component && Component.EventHandler) || EventHandler || null;
}

function serializeEventHandler(handler) {
  if (!handler) {
    return null;
  }
  return {
    target: handler.target && handler.target.name ? getNodePath(handler.target) : '',
    targetUuid: handler.target && handler.target.uuid ? handler.target.uuid : '',
    component: handler.component || '',
    handler: handler.handler || '',
    customEventData: handler.customEventData || '',
  };
}

function getOrAddComponent(node, componentClass) {
  return node.getComponent(componentClass) || node.addComponent(componentClass);
}

function configureNodeBasics(node, options = {}) {
  if (options.position) {
    node.setPosition(options.position.x || 0, options.position.y || 0, options.position.z || 0);
  }
  if (options.scale) {
    node.setScale(options.scale.x || 1, options.scale.y || 1, options.scale.z || 1);
  }
  if (options.eulerAngles) {
    node.setRotationFromEuler(
      options.eulerAngles.x || 0,
      options.eulerAngles.y || 0,
      options.eulerAngles.z || 0
    );
  }
  if (typeof options.active === 'boolean') {
    node.active = options.active;
  }
}

function configureUITransform(node, options = {}) {
  const transform = getOrAddComponent(node, UITransform);
  const width = Number.isFinite(options.width) ? options.width : 160;
  const height = Number.isFinite(options.height) ? options.height : 60;
  transform.setContentSize(width, height);
  if (options.anchor) {
    transform.setAnchorPoint(options.anchor.x ?? 0.5, options.anchor.y ?? 0.5);
  }
  return transform;
}

function parseColor(value, fallback = Color.WHITE) {
  if (!value) {
    return fallback.clone ? fallback.clone() : fallback;
  }
  if (typeof value === 'string') {
    const normalized = value.startsWith('#') ? value.slice(1) : value;
    const number = Number.parseInt(normalized.length === 6 ? `${normalized}ff` : normalized, 16);
    if (Number.isFinite(number)) {
      return new Color(
        (number >> 24) & 255,
        (number >> 16) & 255,
        (number >> 8) & 255,
        number & 255
      );
    }
  }
  return new Color(value.r ?? 255, value.g ?? 255, value.b ?? 255, value.a ?? 255);
}

function findComponentsByClass(componentClass) {
  const results = [];
  walkNodes((node) => {
    if (node === getScene()) {
      return;
    }
    const component = node.getComponent(componentClass);
    if (component) {
      results.push(component);
    }
  }, getScene());
  return results;
}

function getPrefabInfo(node) {
  const prefab = node && node._prefab;
  if (!prefab) {
    return {
      linked: false,
    };
  }

  const asset = prefab.asset || prefab._asset || null;
  return {
    linked: Boolean(asset || prefab.fileId || prefab.root),
    fileId: prefab.fileId || '',
    asset: asset
      ? {
          name: asset.name || '',
          uuid: asset.uuid || asset._uuid || '',
        }
      : null,
    instance: prefab.instance ? plain(prefab.instance) : null,
    sync: prefab.sync,
    rawKeys: Object.keys(prefab).slice(0, 50),
  };
}

function collectSceneStats() {
  const stats = {
    nodeCount: 0,
    activeNodeCount: 0,
    inactiveNodeCount: 0,
    maxDepth: 0,
    componentCount: 0,
    componentsByType: {},
    prefabInstanceCount: 0,
    uiTransformCount: 0,
    canvasCount: 0,
    cameraCount: 0,
    labelCount: 0,
    spriteCount: 0,
    buttonCount: 0,
  };

  function visit(node, depth) {
    if (node !== getScene()) {
      stats.nodeCount += 1;
      stats.maxDepth = Math.max(stats.maxDepth, depth);
      if (node.active) stats.activeNodeCount += 1;
      else stats.inactiveNodeCount += 1;
      if (node._prefab) stats.prefabInstanceCount += 1;
    }

    for (const component of node.components || []) {
      const name = component && component.constructor ? component.constructor.name : 'UnknownComponent';
      stats.componentCount += 1;
      stats.componentsByType[name] = (stats.componentsByType[name] || 0) + 1;
      if (component instanceof UITransform) stats.uiTransformCount += 1;
      if (component instanceof Canvas) stats.canvasCount += 1;
      if (component instanceof Camera) stats.cameraCount += 1;
      if (component instanceof Label) stats.labelCount += 1;
      if (component instanceof Sprite) stats.spriteCount += 1;
      if (component instanceof Button) stats.buttonCount += 1;
    }

    for (const child of node.children) {
      visit(child, depth + 1);
    }
  }

  visit(getScene(), 0);
  return stats;
}

function buildSceneWarnings(stats) {
  const warnings = [];
  if (stats.nodeCount === 0) {
    warnings.push({ severity: 'warn', code: 'empty_scene', message: 'The active scene has no child nodes.' });
  }
  if (stats.cameraCount === 0) {
    warnings.push({ severity: 'warn', code: 'missing_camera', message: 'No Camera component was found in the active scene.' });
  }
  if (stats.nodeCount > 500) {
    warnings.push({ severity: 'info', code: 'large_node_count', message: `Scene has ${stats.nodeCount} nodes.` });
  }
  if (stats.maxDepth > 12) {
    warnings.push({ severity: 'info', code: 'deep_hierarchy', message: `Scene hierarchy depth is ${stats.maxDepth}.` });
  }
  if (stats.labelCount > 80) {
    warnings.push({ severity: 'info', code: 'many_labels', message: `Scene has ${stats.labelCount} Label components.` });
  }
  return warnings;
}

function getScheduler() {
  return typeof director.getScheduler === 'function' ? director.getScheduler() : null;
}

function loadAnimationClipByUuid(uuid) {
  return new Promise((resolve, reject) => {
    assetManager.loadAny(uuid, (error, asset) => {
      if (error) {
        reject(error);
        return;
      }
      if (!(asset instanceof AnimationClip)) {
        reject(new Error(`Asset '${uuid}' is not an AnimationClip.`));
        return;
      }
      resolve(asset);
    });
  });
}

function getValueByPath(target, propertyPath) {
  const segments = String(propertyPath || '')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);

  let current = target;
  for (const segment of segments) {
    if (current == null) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function setValueByPath(target, propertyPath, value) {
  const segments = String(propertyPath || '')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    throw new Error('propertyPath is required.');
  }

  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (current[segment] == null || typeof current[segment] !== 'object') {
      current[segment] = {};
    }
    current = current[segment];
  }

  current[segments[segments.length - 1]] = value;
}

function resetValueByPath(target, propertyPath) {
  const segments = String(propertyPath || '')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    throw new Error('propertyPath is required.');
  }

  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = current[segments[index]];
    if (current == null) {
      return;
    }
  }

  const key = segments[segments.length - 1];
  if (current && Object.prototype.hasOwnProperty.call(current, key)) {
    delete current[key];
  } else if (current) {
    current[key] = undefined;
  }
}

function loadAssetByUuid(uuid) {
  return new Promise((resolve, reject) => {
    assetManager.loadAny(uuid, (error, asset) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(asset);
    });
  });
}

function plain(value, depth = 0, seen = new WeakSet()) {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Node) {
    return {
      name: value.name,
      path: getNodePath(value),
      uuid: value.uuid,
      active: Boolean(value.active),
      components: getComponentNames(value),
    };
  }

  if (value instanceof Vec3) {
    return vectorToObject(value);
  }

  if (value instanceof Quat) {
    return quatToObject(value);
  }

  if (value instanceof Color) {
    return colorToObject(value);
  }

  if (Array.isArray(value)) {
    if (depth >= 5) {
      return `[Array(${value.length})]`;
    }
    return value.map((item) => plain(item, depth + 1, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    if (depth >= 5) {
      return `[${value.constructor && value.constructor.name ? value.constructor.name : 'Object'}]`;
    }

    const output = {};
    for (const key of Object.keys(value)) {
      try {
        output[key] = plain(value[key], depth + 1, seen);
      } catch (error) {
        output[key] = `[Unserializable: ${error.message}]`;
      }
    }
    return output;
  }

  return String(value);
}

async function executeUserCode(code, args) {
  const scene = getScene();
  const runner = new AsyncFunction('require', 'cc', 'Editor', 'scene', 'director', 'args', `
    const module = { exports: {} };
    const exports = module.exports;
    ${code}
    if (typeof run === 'function') {
      return await run({ cc, Editor, scene, director, args });
    }
    if (typeof module.exports === 'function') {
      return await module.exports({ cc, Editor, scene, director, args });
    }
    if (module.exports && typeof module.exports.run === 'function') {
      return await module.exports.run({ cc, Editor, scene, director, args });
    }
  `);
  return await runner(require, cc, global.Editor, scene, director, args || {});
}

exports.methods = {
  async getSceneInfo(options = {}) {
    const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 2;
    const includeComponents = options.includeComponents !== false;
    const scene = getScene();
    return {
      sceneName: scene.name,
      uuid: scene.uuid,
      childCount: scene.children.length,
      nodes: scene.children
        .map((child) => summarizeNode(child, 1, Math.max(1, maxDepth), includeComponents, true))
        .filter(Boolean),
    };
  },

  async getHierarchy(options = {}) {
    const root = options.rootPath ? findNodeByPath(options.rootPath) : getScene();
    if (!root) {
      throw new Error(`Node not found: ${options.rootPath}`);
    }

    const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 3;
    const includeComponents = options.includeComponents !== false;
    const includeInactive = options.includeInactive !== false;

    if (root === getScene()) {
      return {
        sceneName: root.name,
        nodes: root.children
          .map((child) => summarizeNode(child, 1, Math.max(1, maxDepth), includeComponents, includeInactive))
          .filter(Boolean),
      };
    }

    return summarizeNode(root, 0, Math.max(1, maxDepth), includeComponents, includeInactive);
  },

  async inspectNode(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }

    return {
      name: node.name,
      path: getNodePath(node),
      uuid: node.uuid,
      active: Boolean(node.active),
      layer: node.layer,
      siblingIndex: node.getSiblingIndex(),
      position: vectorToObject(node.position),
      rotation: quatToObject(node.rotation),
      scale: vectorToObject(node.scale),
      children: node.children.map((child) => ({
        name: child.name,
        path: getNodePath(child),
        uuid: child.uuid,
      })),
      components: getComponentNames(node),
    };
  },

  async findNodes(options = {}) {
    const name = options.name ? String(options.name) : '';
    const pathContains = options.pathContains ? String(options.pathContains) : '';
    const component = options.component ? String(options.component) : '';
    const includeInactive = options.includeInactive !== false;
    const results = [];

    walkNodes((node) => {
      if (node === getScene()) {
        return;
      }

      if (!includeInactive && !node.active) {
        return;
      }

      const nodePath = getNodePath(node);
      const components = getComponentNames(node);

      if (name && node.name !== name) {
        return;
      }

      if (pathContains && !nodePath.includes(pathContains)) {
        return;
      }

      if (component && !components.includes(component)) {
        return;
      }

      results.push({
        name: node.name,
        path: nodePath,
        uuid: node.uuid,
        active: Boolean(node.active),
        components,
      });
    }, getScene());

    return {
      count: results.length,
      nodes: results.slice(0, 200),
    };
  },

  async createNode(options = {}) {
    const name = String(options.name || '').trim();
    if (!name) {
      throw new Error('name is required.');
    }

    const parent = options.parentPath ? findNodeByPath(options.parentPath) : getScene();
    if (!parent) {
      throw new Error(`Parent not found: ${options.parentPath}`);
    }

    const node = new Node(name);
    node.parent = parent;

    if (options.position) {
      node.setPosition(options.position.x || 0, options.position.y || 0, options.position.z || 0);
    }

    if (options.scale) {
      node.setScale(options.scale.x || 1, options.scale.y || 1, options.scale.z || 1);
    }

    if (options.eulerAngles) {
      node.setRotationFromEuler(
        options.eulerAngles.x || 0,
        options.eulerAngles.y || 0,
        options.eulerAngles.z || 0
      );
    }

    if (typeof options.active === 'boolean') {
      node.active = options.active;
    }

    return {
      created: true,
      name: node.name,
      path: getNodePath(node),
      uuid: node.uuid,
    };
  },

  async deleteNode(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }

    const targetPath = getNodePath(node);
    node.removeFromParent();
    node.destroy();

    return {
      deleted: true,
      path: targetPath,
      uuid: node.uuid,
    };
  },

  async setNodeTransform(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }

    if (options.position) {
      node.setPosition(options.position.x || 0, options.position.y || 0, options.position.z || 0);
    }

    if (options.scale) {
      node.setScale(options.scale.x || 1, options.scale.y || 1, options.scale.z || 1);
    }

    if (options.eulerAngles) {
      node.setRotationFromEuler(
        options.eulerAngles.x || 0,
        options.eulerAngles.y || 0,
        options.eulerAngles.z || 0
      );
    }

    if (typeof options.active === 'boolean') {
      node.active = options.active;
    }

    return {
      updated: true,
      name: node.name,
      path: getNodePath(node),
      active: Boolean(node.active),
      position: vectorToObject(node.position),
      rotation: quatToObject(node.rotation),
      scale: vectorToObject(node.scale),
    };
  },

  async listComponents(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }

    return {
      node: {
        name: node.name,
        path: getNodePath(node),
        uuid: node.uuid,
      },
      components: node.components.map((component, index) => ({
        index,
        name: component && component.constructor ? component.constructor.name : 'UnknownComponent',
        enabled: typeof component.enabled === 'boolean' ? component.enabled : undefined,
        keys: getSerializableKeys(component).slice(0, 50),
      })),
    };
  },

  async addComponent(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }

    const componentClass = resolveComponentClass(options.componentName);
    if (!componentClass) {
      throw new Error(`Component class not found: ${options.componentName}`);
    }

    const component = node.addComponent(componentClass);
    return {
      added: true,
      node: getNodePath(node),
      component: component.constructor ? component.constructor.name : options.componentName,
      index: node.components.indexOf(component),
    };
  },

  async removeComponent(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }

    const component = findComponent(node, options);
    if (!component) {
      throw new Error('Target component was not found.');
    }

    const componentName = component.constructor ? component.constructor.name : 'UnknownComponent';
    node.removeComponent(component);
    return {
      removed: true,
      node: getNodePath(node),
      component: componentName,
    };
  },

  async inspectComponent(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }

    const component = findComponent(node, options);
    if (!component) {
      throw new Error('Target component was not found.');
    }

    return {
      node: {
        name: node.name,
        path: getNodePath(node),
        uuid: node.uuid,
      },
      component: {
        name: component.constructor ? component.constructor.name : 'UnknownComponent',
        enabled: typeof component.enabled === 'boolean' ? component.enabled : undefined,
        data: plain(component),
      },
    };
  },

  async setComponentProperty(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }

    const component = findComponent(node, options);
    if (!component) {
      throw new Error('Target component was not found.');
    }

    setValueByPath(component, options.propertyPath, options.value);
    return {
      updated: true,
      node: getNodePath(node),
      component: component.constructor ? component.constructor.name : 'UnknownComponent',
      propertyPath: options.propertyPath,
      value: plain(getValueByPath(component, options.propertyPath)),
    };
  },

  async resetComponentProperty(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }

    const component = findComponent(node, options);
    if (!component) {
      throw new Error('Target component was not found.');
    }

    resetValueByPath(component, options.propertyPath);
    return {
      reset: true,
      node: getNodePath(node),
      component: component.constructor ? component.constructor.name : 'UnknownComponent',
      propertyPath: options.propertyPath,
      value: plain(getValueByPath(component, options.propertyPath)),
    };
  },

  async instantiatePrefab(options = {}) {
    const prefabUuid = String(options.prefabUuid || '').trim();
    if (!prefabUuid) {
      throw new Error('prefabUuid is required.');
    }

    const parent = options.parentPath ? findNodeByPath(options.parentPath) : getScene();
    if (!parent) {
      throw new Error(`Parent not found: ${options.parentPath}`);
    }

    const asset = await loadAssetByUuid(prefabUuid);
    if (!(asset instanceof Prefab)) {
      throw new Error(`Asset '${prefabUuid}' is not a Prefab.`);
    }

    const node = instantiate(asset);
    node.parent = parent;

    if (options.name) {
      node.name = options.name;
    }
    if (options.position) {
      node.setPosition(options.position.x || 0, options.position.y || 0, options.position.z || 0);
    }

    return {
      instantiated: true,
      prefabUuid,
      node: {
        name: node.name,
        path: getNodePath(node),
        uuid: node.uuid,
      },
    };
  },

  async serializePrefabFromNode(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }

    const serialize = getCceSerializer();
    const prefab = new Prefab();
    if (typeof options.prefabName === 'string') {
      prefab.name = options.prefabName;
    }

    const root = instantiate(node);
    try {
      root.parent = null;
      if (options.rootName) {
        root.name = String(options.rootName);
      }

      prefab.data = root;
      const serialized = serialize(prefab);
      const content = typeof serialized === 'string'
        ? serialized
        : JSON.stringify(serialized, null, 2);

      JSON.parse(content);
      return {
        serialized: true,
        source: {
          name: node.name,
          path: getNodePath(node),
          uuid: node.uuid,
        },
        root: {
          name: root.name,
        },
        content,
      };
    } finally {
      if (root && typeof root.destroy === 'function') {
        root.destroy();
      }
    }
  },

  async runSceneAsset(options = {}) {
    const sceneUuid = String(options.sceneUuid || '').trim();
    if (!sceneUuid) {
      throw new Error('sceneUuid is required.');
    }

    const asset = await loadAssetByUuid(sceneUuid);
    if (!(asset instanceof SceneAsset)) {
      throw new Error(`Asset '${sceneUuid}' is not a SceneAsset.`);
    }

    director.runSceneImmediate(asset);
    const scene = getScene();
    return {
      loaded: true,
      sceneUuid,
      sceneName: scene.name,
      childCount: scene.children.length,
    };
  },

  async createCanvas(options = {}) {
    const parent = options.parentPath ? findNodeByPath(options.parentPath) : getScene();
    if (!parent) {
      throw new Error(`Parent not found: ${options.parentPath}`);
    }

    const node = new Node(options.name || 'Canvas');
    node.parent = parent;
    configureNodeBasics(node, options);
    getOrAddComponent(node, Canvas);
    configureUITransform(node, {
      width: Number.isFinite(options.width) ? options.width : 1280,
      height: Number.isFinite(options.height) ? options.height : 720,
    });

    return {
      created: true,
      name: node.name,
      path: getNodePath(node),
      uuid: node.uuid,
      components: getComponentNames(node),
    };
  },

  async createLabel(options = {}) {
    const parent = options.parentPath ? findNodeByPath(options.parentPath) : getScene();
    if (!parent) {
      throw new Error(`Parent not found: ${options.parentPath}`);
    }

    const node = new Node(options.name || 'Label');
    node.parent = parent;
    configureNodeBasics(node, options);
    configureUITransform(node, options);
    const label = getOrAddComponent(node, Label);
    label.string = options.text || 'Label';
    label.fontSize = Number.isFinite(options.fontSize) ? options.fontSize : 32;
    label.lineHeight = Number.isFinite(options.lineHeight) ? options.lineHeight : label.fontSize + 8;
    label.color = parseColor(options.color, Color.WHITE);

    return {
      created: true,
      path: getNodePath(node),
      uuid: node.uuid,
      text: label.string,
    };
  },

  async createButton(options = {}) {
    const parent = options.parentPath ? findNodeByPath(options.parentPath) : getScene();
    if (!parent) {
      throw new Error(`Parent not found: ${options.parentPath}`);
    }

    const node = new Node(options.name || 'Button');
    node.parent = parent;
    configureNodeBasics(node, options);
    configureUITransform(node, {
      ...options,
      width: Number.isFinite(options.width) ? options.width : 180,
      height: Number.isFinite(options.height) ? options.height : 64,
    });
    const sprite = getOrAddComponent(node, Sprite);
    sprite.color = parseColor(options.backgroundColor, new Color(64, 96, 255, 255));
    const button = getOrAddComponent(node, Button);
    button.target = node;

    const labelNode = new Node(options.labelName || 'Label');
    labelNode.parent = node;
    configureUITransform(labelNode, {
      width: Number.isFinite(options.width) ? options.width : 180,
      height: Number.isFinite(options.height) ? options.height : 64,
    });
    const label = getOrAddComponent(labelNode, Label);
    label.string = options.text || 'Button';
    label.fontSize = Number.isFinite(options.fontSize) ? options.fontSize : 28;
    label.lineHeight = Number.isFinite(options.lineHeight) ? options.lineHeight : label.fontSize + 8;
    label.color = parseColor(options.textColor, Color.WHITE);

    return {
      created: true,
      path: getNodePath(node),
      uuid: node.uuid,
      labelPath: getNodePath(labelNode),
      components: getComponentNames(node),
    };
  },

  async createSprite(options = {}) {
    const parent = options.parentPath ? findNodeByPath(options.parentPath) : getScene();
    if (!parent) {
      throw new Error(`Parent not found: ${options.parentPath}`);
    }

    const node = new Node(options.name || 'Sprite');
    node.parent = parent;
    configureNodeBasics(node, options);
    configureUITransform(node, options);
    const sprite = getOrAddComponent(node, Sprite);
    sprite.color = parseColor(options.color, Color.WHITE);
    if (options.spriteFrameUuid) {
      sprite.spriteFrame = await loadAssetByUuid(options.spriteFrameUuid);
    }

    return {
      created: true,
      path: getNodePath(node),
      uuid: node.uuid,
      components: getComponentNames(node),
    };
  },

  async listCameras() {
    const cameras = findComponentsByClass(Camera);
    return {
      count: cameras.length,
      cameras: cameras.map((camera) => ({
        node: camera.node ? getNodePath(camera.node) : '',
        uuid: camera.node ? camera.node.uuid : '',
        enabled: Boolean(camera.enabled),
        priority: camera.priority,
        projection: camera.projection,
        visibility: camera.visibility,
        clearFlags: camera.clearFlags,
      })),
    };
  },

  async createCamera(options = {}) {
    const parent = options.parentPath ? findNodeByPath(options.parentPath) : getScene();
    if (!parent) {
      throw new Error(`Parent not found: ${options.parentPath}`);
    }

    const node = new Node(options.name || 'Camera');
    node.parent = parent;
    configureNodeBasics(node, options);
    const camera = getOrAddComponent(node, Camera);
    if (Number.isFinite(options.priority)) {
      camera.priority = options.priority;
    }
    if (Number.isFinite(options.visibility)) {
      camera.visibility = options.visibility;
    }
    if (Number.isFinite(options.clearFlags)) {
      camera.clearFlags = options.clearFlags;
    }

    return {
      created: true,
      path: getNodePath(node),
      uuid: node.uuid,
      camera: plain(camera),
    };
  },

  async setCameraProperties(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target camera node was not found.');
    }
    const camera = node.getComponent(Camera);
    if (!camera) {
      throw new Error('Camera component was not found on target node.');
    }

    for (const key of ['priority', 'visibility', 'clearFlags', 'projection', 'orthoHeight', 'fov', 'near', 'far']) {
      if (options[key] !== undefined) {
        camera[key] = options[key];
      }
    }

    return {
      updated: true,
      node: getNodePath(node),
      camera: plain(camera),
    };
  },

  async listAnimations(options = {}) {
    const animations = options.path || options.uuid || options.name
      ? [findNode(options)].filter(Boolean).map((node) => node.getComponent(Animation)).filter(Boolean)
      : findComponentsByClass(Animation);

    return {
      count: animations.length,
      animations: animations.map((animation) => ({
        node: animation.node ? getNodePath(animation.node) : '',
        uuid: animation.node ? animation.node.uuid : '',
        enabled: Boolean(animation.enabled),
        defaultClip: animation.defaultClip ? animation.defaultClip.name : '',
        clips: Array.isArray(animation.clips) ? animation.clips.map((clip) => clip && clip.name).filter(Boolean) : [],
      })),
    };
  },

  async addAnimationClip(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }
    const clipUuid = String(options.clipUuid || '').trim();
    if (!clipUuid) {
      throw new Error('clipUuid is required.');
    }

    const clip = await loadAnimationClipByUuid(clipUuid);
    const animation = getOrAddComponent(node, Animation);
    const clips = Array.isArray(animation.clips) ? animation.clips.slice() : [];
    if (!clips.includes(clip)) {
      clips.push(clip);
      animation.clips = clips;
    }
    if (options.makeDefault !== false) {
      animation.defaultClip = clip;
    }

    return {
      added: true,
      node: getNodePath(node),
      clip: clip.name,
      clipUuid,
      clips: animation.clips.map((item) => item && item.name).filter(Boolean),
    };
  },

  async playAnimation(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }
    const animation = node.getComponent(Animation);
    if (!animation) {
      throw new Error('Animation component was not found on target node.');
    }
    const state = options.clipName ? animation.play(options.clipName) : animation.play();
    return {
      playing: true,
      node: getNodePath(node),
      clip: state && state.clip ? state.clip.name : options.clipName || '',
    };
  },

  async stopAnimation(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }
    const animation = node.getComponent(Animation);
    if (!animation) {
      throw new Error('Animation component was not found on target node.');
    }
    if (options.clipName) {
      animation.stop(options.clipName);
    } else {
      animation.stop();
    }
    return {
      stopped: true,
      node: getNodePath(node),
      clip: options.clipName || '(all)',
    };
  },

  async getRuntimeState() {
    const scheduler = getScheduler();
    return {
      sceneName: getScene().name,
      paused: typeof director.isPaused === 'function' ? director.isPaused() : false,
      timeScale: scheduler && typeof scheduler.getTimeScale === 'function' ? scheduler.getTimeScale() : 1,
      totalFrames: typeof director.getTotalFrames === 'function' ? director.getTotalFrames() : undefined,
    };
  },

  async getPerformanceSnapshot() {
    const scheduler = getScheduler();
    const stats = collectSceneStats();
    const memory = typeof performance !== 'undefined' && performance.memory
      ? {
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          usedJSHeapSize: performance.memory.usedJSHeapSize,
        }
      : null;

    return {
      sceneName: getScene().name,
      runtime: {
        paused: typeof director.isPaused === 'function' ? director.isPaused() : false,
        timeScale: scheduler && typeof scheduler.getTimeScale === 'function' ? scheduler.getTimeScale() : 1,
        totalFrames: typeof director.getTotalFrames === 'function' ? director.getTotalFrames() : undefined,
      },
      stats,
      memory,
      warnings: buildSceneWarnings(stats),
    };
  },

  async getPrefabInstanceInfo(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }
    return {
      node: {
        name: node.name,
        path: getNodePath(node),
        uuid: node.uuid,
      },
      prefab: getPrefabInfo(node),
    };
  },

  async pauseRuntime() {
    if (typeof director.pause === 'function') {
      director.pause();
    }
    return await exports.methods.getRuntimeState();
  },

  async resumeRuntime() {
    if (typeof director.resume === 'function') {
      director.resume();
    }
    return await exports.methods.getRuntimeState();
  },

  async setTimeScale(options = {}) {
    const scale = Number(options.scale);
    if (!Number.isFinite(scale) || scale < 0 || scale > 100) {
      throw new Error('scale must be a number between 0 and 100.');
    }
    const scheduler = getScheduler();
    if (!scheduler || typeof scheduler.setTimeScale !== 'function') {
      throw new Error('director scheduler time scale API is unavailable.');
    }
    scheduler.setTimeScale(scale);
    return await exports.methods.getRuntimeState();
  },

  async emitNodeEvent(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }
    const eventName = String(options.eventName || '').trim();
    if (!eventName) {
      throw new Error('eventName is required.');
    }
    node.emit(eventName, options.payload || {});
    return {
      emitted: true,
      node: getNodePath(node),
      eventName,
    };
  },

  async simulateButtonClick(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }
    const button = node.getComponent(Button);
    if (!button) {
      throw new Error('Button component was not found on target node.');
    }

    if (Component && Component.EventHandler && typeof Component.EventHandler.emitEvents === 'function') {
      Component.EventHandler.emitEvents(button.clickEvents, button);
    }
    node.emit(Button.EventType ? Button.EventType.CLICK : 'click', button);

    return {
      clicked: true,
      node: getNodePath(node),
      clickEventCount: Array.isArray(button.clickEvents) ? button.clickEvents.length : 0,
    };
  },

  async listButtonClickEvents(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }
    const button = node.getComponent(Button);
    if (!button) {
      throw new Error('Button component was not found on target node.');
    }

    return {
      node: getNodePath(node),
      uuid: node.uuid,
      clickEventCount: Array.isArray(button.clickEvents) ? button.clickEvents.length : 0,
      clickEvents: Array.isArray(button.clickEvents)
        ? button.clickEvents.map(serializeEventHandler).filter(Boolean)
        : [],
    };
  },

  async bindButtonClickEvent(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Button node was not found.');
    }
    const button = node.getComponent(Button);
    if (!button) {
      throw new Error('Button component was not found on target node.');
    }

    const target = findNode({
      path: options.targetPath,
      uuid: options.targetUuid,
      name: options.targetName,
    });
    if (!target) {
      throw new Error('Event target node was not found.');
    }

    const componentName = String(options.componentName || '').trim();
    const handlerName = String(options.handler || options.handlerName || '').trim();
    if (!componentName || !handlerName) {
      throw new Error('componentName and handler are required.');
    }

    const component = findComponent(target, { componentName });
    if (!component) {
      throw new Error(`Target component was not found: ${componentName}`);
    }
    if (typeof component[handlerName] !== 'function') {
      throw new Error(`Target component method was not found: ${componentName}.${handlerName}`);
    }

    const HandlerClass = getEventHandlerClass();
    if (!HandlerClass) {
      throw new Error('Cocos EventHandler class is unavailable.');
    }

    const existing = Array.isArray(button.clickEvents) ? button.clickEvents : [];
    const duplicate = existing.find((event) => (
      event &&
      event.target === target &&
      event.component === componentName &&
      event.handler === handlerName &&
      String(event.customEventData || '') === String(options.customEventData || '')
    ));
    if (duplicate && options.replace !== true) {
      return {
        bound: false,
        duplicate: true,
        node: getNodePath(node),
        event: serializeEventHandler(duplicate),
        clickEventCount: existing.length,
      };
    }

    const event = new HandlerClass();
    event.target = target;
    event.component = componentName;
    event.handler = handlerName;
    event.customEventData = String(options.customEventData || '');

    button.clickEvents = options.replace === true
      ? existing.filter((item) => item !== duplicate).concat(event)
      : existing.concat(event);

    return {
      bound: true,
      node: getNodePath(node),
      uuid: node.uuid,
      event: serializeEventHandler(event),
      clickEventCount: button.clickEvents.length,
    };
  },

  async invokeComponentMethod(options = {}) {
    const node = findNode(options);
    if (!node) {
      throw new Error('Target node was not found.');
    }
    const component = findComponent(node, options);
    if (!component) {
      throw new Error('Target component was not found.');
    }
    const methodName = String(options.methodName || '').trim();
    if (!methodName || typeof component[methodName] !== 'function') {
      throw new Error(`Component method not found: ${methodName}`);
    }

    const result = component[methodName](...(Array.isArray(options.args) ? options.args : []));
    return {
      invoked: true,
      node: getNodePath(node),
      component: component.constructor ? component.constructor.name : 'UnknownComponent',
      methodName,
      result: plain(result),
    };
  },

  async executeCode(options = {}) {
    const code = String(options.code || '');
    if (!code.trim()) {
      throw new Error('code is required.');
    }

    const result = await executeUserCode(code, options.args || {});
    return {
      ok: true,
      result: plain(result),
      sceneName: getScene().name,
    };
  },
};

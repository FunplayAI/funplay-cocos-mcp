'use strict';

const crypto = require('crypto');

const UI_2D_LAYER = 33554432;

function createPrefabFileId() {
  return crypto.randomBytes(16).toString('base64').replace(/=+$/, '');
}

function normalizePrefabNodeLayers(root, layer = UI_2D_LAYER) {
  if (!root || typeof root !== 'object') {
    throw new Error('Prefab root node is required.');
  }
  if (!Number.isSafeInteger(layer) || layer < 0) {
    throw new Error('Prefab node layer must be a non-negative integer.');
  }

  const visitedNodes = new Set();
  let nodeCount = 0;

  function visit(node) {
    if (!node || typeof node !== 'object' || visitedNodes.has(node)) {
      return;
    }
    visitedNodes.add(node);
    node.layer = layer;
    nodeCount += 1;

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      visit(child);
    }
  }

  visit(root);
  return { nodeCount, layer };
}

function attachPrefabMetadata(root, prefab, options = {}) {
  if (!root || typeof root !== 'object') {
    throw new Error('Prefab root node is required.');
  }
  if (!prefab || typeof prefab !== 'object') {
    throw new Error('Prefab asset is required.');
  }

  const prefabUtils = options.prefabUtils;
  const PrefabInfo = prefabUtils && prefabUtils.PrefabInfo;
  const CompPrefabInfo = prefabUtils && prefabUtils.CompPrefabInfo;
  if (typeof PrefabInfo !== 'function' || typeof CompPrefabInfo !== 'function') {
    throw new Error('Cocos PrefabInfo constructors are unavailable.');
  }

  const generateFileId = typeof options.createFileId === 'function'
    ? options.createFileId
    : createPrefabFileId;
  const usedFileIds = new Set();
  const visitedNodes = new Set();
  let nodeCount = 0;
  let componentCount = 0;

  function nextFileId() {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const fileId = String(generateFileId() || '').trim();
      if (fileId && !usedFileIds.has(fileId)) {
        usedFileIds.add(fileId);
        return fileId;
      }
    }
    throw new Error('Unable to generate a unique prefab fileId.');
  }

  function visit(node) {
    if (!node || typeof node !== 'object' || visitedNodes.has(node)) {
      return;
    }
    visitedNodes.add(node);

    const nodeInfo = new PrefabInfo();
    nodeInfo.root = root;
    nodeInfo.asset = prefab;
    nodeInfo.fileId = nextFileId();
    node._prefab = nodeInfo;
    nodeCount += 1;

    const components = Array.isArray(node.components) ? node.components : [];
    for (const component of components) {
      if (!component || typeof component !== 'object') {
        continue;
      }
      const componentInfo = new CompPrefabInfo();
      componentInfo.fileId = nextFileId();
      component.__prefab = componentInfo;
      componentCount += 1;
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      visit(child);
    }
  }

  visit(root);
  return {
    nodeCount,
    componentCount,
    fileIdCount: usedFileIds.size,
  };
}

function invalidMetadata(message) {
  throw new Error(`Invalid serialized prefab metadata: ${message}`);
}

function referenceId(value, label) {
  if (!value || typeof value !== 'object' || !Number.isInteger(value.__id__)) {
    invalidMetadata(`${label} is not an object reference.`);
  }
  return value.__id__;
}

function referencedObject(objects, reference, label) {
  const id = referenceId(reference, label);
  if (id < 0 || id >= objects.length || !objects[id] || typeof objects[id] !== 'object') {
    invalidMetadata(`${label} points to missing object ${id}.`);
  }
  return { id, value: objects[id] };
}

function assertFileId(info, label, fileIds) {
  const fileId = String(info.fileId || '').trim();
  if (!fileId) {
    invalidMetadata(`${label} has an empty fileId.`);
  }
  if (fileIds.has(fileId)) {
    invalidMetadata(`${label} reuses fileId '${fileId}'.`);
  }
  fileIds.add(fileId);
}

function assertSerializedPrefabMetadata(serialized, options = {}) {
  let objects;
  try {
    objects = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  } catch (error) {
    invalidMetadata(`content is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(objects)) {
    invalidMetadata('root value must be an object array.');
  }

  const prefabIndex = objects.findIndex((value) => value && value.__type__ === 'cc.Prefab');
  if (prefabIndex < 0) {
    invalidMetadata('cc.Prefab object is missing.');
  }
  const prefab = objects[prefabIndex];
  const rootRef = referencedObject(objects, prefab.data, 'cc.Prefab.data');
  if (rootRef.value.__type__ !== 'cc.Node') {
    invalidMetadata(`cc.Prefab.data points to ${rootRef.value.__type__ || 'an unknown type'}, not cc.Node.`);
  }

  const nodes = objects
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value && value.__type__ === 'cc.Node');
  if (!nodes.length) {
    invalidMetadata('cc.Node objects are missing.');
  }

  const fileIds = new Set();
  let componentCount = 0;
  for (const { value: node, index: nodeIndex } of nodes) {
    if (options.expectedLayer !== undefined && node._layer !== options.expectedLayer) {
      invalidMetadata(
        `cc.Node at index ${nodeIndex}._layer is ${String(node._layer)}, expected ${String(options.expectedLayer)}.`
      );
    }
    const nodeInfoRef = referencedObject(objects, node._prefab, `cc.Node at index ${nodeIndex}._prefab`);
    const nodeInfo = nodeInfoRef.value;
    if (nodeInfo.__type__ !== 'cc.PrefabInfo') {
      invalidMetadata(`cc.Node at index ${nodeIndex}._prefab does not reference cc.PrefabInfo.`);
    }
    if (referenceId(nodeInfo.root, `cc.PrefabInfo at index ${nodeInfoRef.id}.root`) !== rootRef.id) {
      invalidMetadata(`cc.PrefabInfo at index ${nodeInfoRef.id}.root does not reference the prefab root.`);
    }
    if (referenceId(nodeInfo.asset, `cc.PrefabInfo at index ${nodeInfoRef.id}.asset`) !== prefabIndex) {
      invalidMetadata(`cc.PrefabInfo at index ${nodeInfoRef.id}.asset does not reference the prefab asset.`);
    }
    assertFileId(nodeInfo, `cc.PrefabInfo at index ${nodeInfoRef.id}`, fileIds);

    const componentRefs = Array.isArray(node._components) ? node._components : [];
    for (let componentOffset = 0; componentOffset < componentRefs.length; componentOffset += 1) {
      const componentRef = referencedObject(
        objects,
        componentRefs[componentOffset],
        `cc.Node at index ${nodeIndex}._components[${componentOffset}]`
      );
      const componentInfoRef = referencedObject(
        objects,
        componentRef.value.__prefab,
        `component at index ${componentRef.id}.__prefab`
      );
      const componentInfo = componentInfoRef.value;
      if (componentInfo.__type__ !== 'cc.CompPrefabInfo') {
        invalidMetadata(`component at index ${componentRef.id}.__prefab does not reference cc.CompPrefabInfo.`);
      }
      assertFileId(componentInfo, `cc.CompPrefabInfo at index ${componentInfoRef.id}`, fileIds);
      componentCount += 1;
    }
  }

  return {
    valid: true,
    prefabIndex,
    rootIndex: rootRef.id,
    nodeCount: nodes.length,
    componentCount,
    fileIdCount: fileIds.size,
  };
}

module.exports = {
  UI_2D_LAYER,
  assertSerializedPrefabMetadata,
  attachPrefabMetadata,
  createPrefabFileId,
  normalizePrefabNodeLayers,
};

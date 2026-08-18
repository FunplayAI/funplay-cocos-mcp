'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  UI_2D_LAYER,
  assertSerializedPrefabMetadata,
  attachPrefabMetadata,
  createPrefabFileId,
  normalizePrefabNodeLayers,
} = require('../lib/prefab-metadata');

class PrefabInfo {}
class CompPrefabInfo {}

function validSerializedPrefab() {
  return [
    { __type__: 'cc.Prefab', data: { __id__: 1 } },
    {
      __type__: 'cc.Node',
      _name: 'Root',
      _layer: UI_2D_LAYER,
      _children: [{ __id__: 5 }],
      _components: [{ __id__: 2 }],
      _prefab: { __id__: 4 },
    },
    {
      __type__: 'cc.UITransform',
      node: { __id__: 1 },
      __prefab: { __id__: 3 },
    },
    { __type__: 'cc.CompPrefabInfo', fileId: 'component-root' },
    {
      __type__: 'cc.PrefabInfo',
      root: { __id__: 1 },
      asset: { __id__: 0 },
      fileId: 'node-root',
    },
    {
      __type__: 'cc.Node',
      _name: 'Child',
      _layer: UI_2D_LAYER,
      _parent: { __id__: 1 },
      _children: [],
      _components: [],
      _prefab: { __id__: 6 },
    },
    {
      __type__: 'cc.PrefabInfo',
      root: { __id__: 1 },
      asset: { __id__: 0 },
      fileId: 'node-child',
    },
  ];
}

test('createPrefabFileId returns Cocos-compatible compact ids', () => {
  const first = createPrefabFileId();
  const second = createPrefabFileId();

  assert.match(first, /^[A-Za-z0-9+/]{22}$/);
  assert.match(second, /^[A-Za-z0-9+/]{22}$/);
  assert.notEqual(first, second);
});

test('normalizePrefabNodeLayers assigns UI_2D to the entire cloned node tree', () => {
  const grandchild = { layer: 4, children: [] };
  const child = { layer: 1, children: [grandchild] };
  const root = { layer: 0, children: [child] };

  const result = normalizePrefabNodeLayers(root);

  assert.deepEqual(result, { nodeCount: 3, layer: UI_2D_LAYER });
  assert.equal(root.layer, UI_2D_LAYER);
  assert.equal(child.layer, UI_2D_LAYER);
  assert.equal(grandchild.layer, UI_2D_LAYER);
});

test('attachPrefabMetadata assigns root and asset references to every node and component', () => {
  const rootComponent = { __prefab: { stale: true } };
  const childComponent = { __prefab: null };
  const child = {
    children: [],
    components: [childComponent],
    _prefab: { stale: true },
  };
  const root = {
    children: [child],
    components: [rootComponent],
    _prefab: null,
  };
  const prefab = { data: root };
  const fileIds = ['node-root', 'component-root', 'node-child', 'component-child'];

  const result = attachPrefabMetadata(root, prefab, {
    prefabUtils: { PrefabInfo, CompPrefabInfo },
    createFileId: () => fileIds.shift(),
  });

  assert.deepEqual(result, { nodeCount: 2, componentCount: 2, fileIdCount: 4 });
  assert.equal(root._prefab instanceof PrefabInfo, true);
  assert.equal(child._prefab instanceof PrefabInfo, true);
  assert.equal(root._prefab.root, root);
  assert.equal(child._prefab.root, root);
  assert.equal(root._prefab.asset, prefab);
  assert.equal(child._prefab.asset, prefab);
  assert.equal(rootComponent.__prefab instanceof CompPrefabInfo, true);
  assert.equal(childComponent.__prefab instanceof CompPrefabInfo, true);
  assert.deepEqual(
    [
      root._prefab.fileId,
      rootComponent.__prefab.fileId,
      child._prefab.fileId,
      childComponent.__prefab.fileId,
    ],
    ['node-root', 'component-root', 'node-child', 'component-child']
  );
});

test('assertSerializedPrefabMetadata accepts complete node and component metadata', () => {
  const validation = assertSerializedPrefabMetadata(JSON.stringify(validSerializedPrefab()), {
    expectedLayer: UI_2D_LAYER,
  });

  assert.deepEqual(validation, {
    valid: true,
    prefabIndex: 0,
    rootIndex: 1,
    nodeCount: 2,
    componentCount: 1,
    fileIdCount: 3,
  });
});

test('assertSerializedPrefabMetadata rejects nodes outside the expected UI_2D layer', () => {
  const serialized = validSerializedPrefab();
  serialized[5]._layer = 1;

  assert.throws(
    () => assertSerializedPrefabMetadata(serialized, { expectedLayer: UI_2D_LAYER }),
    /cc\.Node at index 5\._layer is 1, expected 33554432/
  );
});

test('assertSerializedPrefabMetadata rejects null component metadata', () => {
  const serialized = validSerializedPrefab();
  serialized[2].__prefab = null;

  assert.throws(
    () => assertSerializedPrefabMetadata(serialized),
    /component at index 2\.__prefab is not an object reference/
  );
});

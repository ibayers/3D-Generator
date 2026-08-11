import { describe, it, expect } from 'vitest';
import { applySetMaterial } from './setMaterial.js';
import { sampleScene } from '../sampleScene.js';

describe('applySetMaterial', () => {
  it('sets color on node with existing material', () => {
    const result = applySetMaterial(sampleScene, {
      nodeId: 'box-01',
      color: '#ff0000',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'box-01');
      expect(node?.material?.color).toBe('#ff0000');
    }
  });

  it('adds material when missing', () => {
    const { material: _drop, ...nodeWithoutMaterial } = sampleScene.nodes[0]!;
    const sceneWithMissing: typeof sampleScene = {
      ...sampleScene,
      nodes: [
        { ...nodeWithoutMaterial, id: 'no-mat-node' },
        ...sampleScene.nodes.slice(1),
      ],
    };
    const result = applySetMaterial(sceneWithMissing, {
      nodeId: 'no-mat-node',
      color: '#00ff00',
    });
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'no-mat-node');
      expect(node?.material?.color).toBe('#00ff00');
    }
  });

  it('rejects invalid hex color', () => {
    const result = applySetMaterial(sampleScene, {
      nodeId: 'box-01',
      color: 'red',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('returns NODE_NOT_FOUND for missing node', () => {
    const result = applySetMaterial(sampleScene, {
      nodeId: 'nope',
      color: '#ff0000',
    });
    if (!result.ok) expect(result.error.code).toBe('NODE_NOT_FOUND');
  });

  it('does not mutate original scene', () => {
    const before = JSON.stringify(sampleScene);
    applySetMaterial(sampleScene, {
      nodeId: 'box-01',
      color: '#aabbcc',
    });
    expect(JSON.stringify(sampleScene)).toBe(before);
  });
});

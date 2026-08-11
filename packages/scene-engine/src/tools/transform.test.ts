import { describe, it, expect } from 'vitest';
import { applyTransform } from './transform';
import { sampleScene } from '../sampleScene';

describe('applyTransform', () => {
  it('updates position of target node immutably', () => {
    const result = applyTransform(sampleScene, {
      nodeId: 'box-01',
      position: [5, 5, 5],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'box-01');
      expect(node?.transform.position).toEqual([5, 5, 5]);
    }
  });

  it('preserves unspecified transform fields', () => {
    const original = sampleScene.nodes.find((n) => n.id === 'box-01');
    const result = applyTransform(sampleScene, {
      nodeId: 'box-01',
      position: [9, 9, 9],
    });
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'box-01');
      expect(node?.transform.rotation).toEqual(original?.transform.rotation);
      expect(node?.transform.scale).toEqual(original?.transform.scale);
    }
  });

  it('returns NODE_NOT_FOUND for missing node', () => {
    const result = applyTransform(sampleScene, {
      nodeId: 'nope',
      position: [0, 0, 0],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NODE_NOT_FOUND');
    }
  });

  it('returns INVALID_INPUT for bad input shape', () => {
    const result = applyTransform(sampleScene, { nodeId: 'box-01' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });

  it('does not mutate original scene', () => {
    const before = JSON.stringify(sampleScene);
    applyTransform(sampleScene, {
      nodeId: 'box-01',
      position: [1, 1, 1],
    });
    expect(JSON.stringify(sampleScene)).toBe(before);
  });
});

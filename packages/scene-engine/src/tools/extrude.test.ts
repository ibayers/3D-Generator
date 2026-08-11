import { describe, it, expect } from 'vitest';
import { applyExtrude } from './extrude';
import { sampleScene } from '../sampleScene';

describe('applyExtrude', () => {
  it('creates a new extrude node at top level', () => {
    const before = sampleScene.nodes.length;
    const result = applyExtrude(sampleScene, {
      id: 'wall-01',
      shape: [[0, 0], [2, 0], [2, 1], [0, 1]],
      depth: 0.2,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scene.nodes).toHaveLength(before + 1);
      const node = result.scene.nodes.find((n) => n.id === 'wall-01');
      expect(node?.type).toBe('extrude');
      expect(node?.parameters.shape).toEqual([[0, 0], [2, 0], [2, 1], [0, 1]]);
      expect(node?.parameters.depth).toBe(0.2);
    }
  });

  it('applies optional position and color', () => {
    const result = applyExtrude(sampleScene, {
      id: 'wall-02',
      shape: [[0, 0], [1, 0], [1, 1]],
      depth: 1,
      position: [5, 0, 0],
      color: '#ff0000',
    });
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'wall-02');
      expect(node?.transform.position).toEqual([5, 0, 0]);
      expect(node?.material?.color).toBe('#ff0000');
    }
  });

  it('rejects shape with fewer than 3 points', () => {
    const result = applyExtrude(sampleScene, {
      id: 'bad',
      shape: [[0, 0], [1, 1]],
      depth: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('rejects non-positive depth', () => {
    const result = applyExtrude(sampleScene, {
      id: 'bad',
      shape: [[0, 0], [1, 0], [1, 1]],
      depth: 0,
    });
    if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('does not mutate original scene', () => {
    const before = JSON.stringify(sampleScene);
    applyExtrude(sampleScene, {
      id: 'x',
      shape: [[0, 0], [1, 0], [1, 1]],
      depth: 1,
    });
    expect(JSON.stringify(sampleScene)).toBe(before);
  });
});

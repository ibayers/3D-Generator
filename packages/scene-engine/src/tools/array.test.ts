import { describe, it, expect } from 'vitest';
import { applyArray } from './array.js';
import { sampleScene } from '../sampleScene.js';

describe('applyArray', () => {
  it('clones node N times with offset positions', () => {
    const result = applyArray(sampleScene, {
      nodeId: 'box-01',
      count: 3,
      offset: [2, 0, 0],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const clones = result.scene.nodes.filter((n) =>
        n.id.startsWith('box-01#')
      );
      expect(clones).toHaveLength(3);
      expect(clones[0]?.transform.position[0]).toBe(
        sampleScene.nodes[0]!.transform.position[0] + 2
      );
      expect(clones[2]?.transform.position[0]).toBe(
        sampleScene.nodes[0]!.transform.position[0] + 6
      );
    }
  });

  it('rejects count > 100', () => {
    const result = applyArray(sampleScene, {
      nodeId: 'box-01',
      count: 101,
      offset: [1, 0, 0],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('rejects count < 1', () => {
    const result = applyArray(sampleScene, {
      nodeId: 'box-01',
      count: 0,
      offset: [1, 0, 0],
    });
    if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('returns NODE_NOT_FOUND for missing node', () => {
    const result = applyArray(sampleScene, {
      nodeId: 'nope',
      count: 2,
      offset: [0, 0, 0],
    });
    if (!result.ok) expect(result.error.code).toBe('NODE_NOT_FOUND');
  });

  it('does not mutate original scene', () => {
    const before = JSON.stringify(sampleScene);
    applyArray(sampleScene, {
      nodeId: 'box-01',
      count: 2,
      offset: [1, 0, 0],
    });
    expect(JSON.stringify(sampleScene)).toBe(before);
  });
});

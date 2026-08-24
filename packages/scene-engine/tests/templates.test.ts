import { describe, it, expect } from 'vitest';
import { executeToolCall } from '../src/tools/toolExecutor';
import type { Scene } from '../src/types';

function emptyScene(): Scene {
  return { version: '1.0', nodes: [] };
}

describe('toolExecutor template integration', () => {
  it('create_house adds walls and roof to the scene', () => {
    const scene = emptyScene();
    const res = executeToolCall(scene, {
      name: 'create_house',
      input: {
        id: 'h1',
        position: [0, 0, 0],
        size: [4, 3, 4],
        floors: 2,
        roofStyle: 'gable',
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scene.nodes.length).toBeGreaterThanOrEqual(2);
    expect(res.scene.nodes.some((n) => n.id === 'h1-walls')).toBe(true);
    expect(res.scene.nodes.some((n) => n.id === 'h1-roof-l')).toBe(true);
    expect(res.scene.nodes.some((n) => n.id === 'h1-roof-r')).toBe(true);
    expect(res.scene.nodes.some((n) => n.id === 'h1-floor-1')).toBe(true);
    // original scene is not mutated (immutable pattern)
    expect(scene.nodes).toHaveLength(0);
  });

  it('create_road adds one strip to the scene', () => {
    const scene = emptyScene();
    const res = executeToolCall(scene, {
      name: 'create_road',
      input: {
        id: 'r1',
        path: [
          [0, 0],
          [10, 0],
        ],
        width: 2,
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scene.nodes).toHaveLength(1);
    expect(res.scene.nodes[0]?.id).toBe('r1');
  });
});

describe('create_tree', () => {
  it('adds conifer nodes to the scene', () => {
    const result = executeToolCall(emptyScene(), {
      name: 'create_tree',
      input: { id: 'tree-01', position: [1, 0, 2], height: 5 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.nodes.map((n) => n.id)).toContain('tree-01-trunk');
    expect(result.scene.nodes).toHaveLength(4);
  });

  it('upserts by id — re-invocation replaces, not appends', () => {
    const first = executeToolCall(emptyScene(), {
      name: 'create_tree',
      input: { id: 'tree-01', position: [0, 0, 0] },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = executeToolCall(first.scene, {
      name: 'create_tree',
      input: { id: 'tree-01', position: [0, 0, 0], type: 'broadleaf' },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.scene.nodes).toHaveLength(3);
  });

  it('rejects invalid type with INVALID_INPUT', () => {
    const result = executeToolCall(emptyScene(), {
      name: 'create_tree',
      input: { id: 't', position: [0, 0, 0], type: 'palm' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });
});

describe('create_character', () => {
  it('adds one root node carrying six children', () => {
    const result = executeToolCall(emptyScene(), {
      name: 'create_character',
      input: { id: 'char-01', position: [1, 0, 1], height: 1.75 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.nodes).toHaveLength(1);
    expect(result.scene.nodes[0]!.children).toHaveLength(6);
  });

  it('upserts by id — re-invocation replaces, not appends', () => {
    const first = executeToolCall(emptyScene(), {
      name: 'create_character',
      input: { id: 'char-01', position: [0, 0, 0] },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = executeToolCall(first.scene, {
      name: 'create_character',
      input: { id: 'char-01', position: [0, 0, 0], build: 'stocky' },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.scene.nodes).toHaveLength(1);
    // replacement carried the NEW variant: stocky torso (0.26h) is wider than
    // regular (0.20h) at the same clamped height.
    const shape = second.scene.nodes[0]!.parameters.shape as [number, number][];
    expect(shape[1]![0]! - shape[0]![0]!).toBeCloseTo(1.7 * 0.26, 5);
  });

  it('rejects invalid build with INVALID_INPUT', () => {
    const result = executeToolCall(emptyScene(), {
      name: 'create_character',
      input: { id: 'c', position: [0, 0, 0], build: 'round' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });
});

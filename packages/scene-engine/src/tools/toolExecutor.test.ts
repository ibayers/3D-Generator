import { describe, it, expect } from 'vitest';
import { executeToolCall } from './toolExecutor';
import { sampleScene } from '../sampleScene';
import type { Scene } from '../types';

describe('executeToolCall integration', () => {
  it('applies transform → set_material → array in sequence', () => {
    let scene: Scene = sampleScene;

    const move = executeToolCall(scene, {
      name: 'transform',
      input: { nodeId: 'box-01', position: [0, 1, 0] },
    });
    expect(move.ok).toBe(true);
    if (move.ok) scene = move.scene;

    const paint = executeToolCall(scene, {
      name: 'set_material',
      input: { nodeId: 'box-01', color: '#ff8800' },
    });
    expect(paint.ok).toBe(true);
    if (paint.ok) scene = paint.scene;

    const clone = executeToolCall(scene, {
      name: 'array',
      input: {
        nodeId: 'box-01',
        count: 2,
        offset: [3, 0, 0],
      },
    });
    expect(clone.ok).toBe(true);
    if (clone.ok) scene = clone.scene;

    const box = scene.nodes.find((n) => n.id === 'box-01');
    expect(box?.transform.position).toEqual([0, 1, 0]);
    expect(box?.material?.color).toBe('#ff8800');
    const clones = scene.nodes.filter((n) => n.id.startsWith('box-01#'));
    expect(clones).toHaveLength(2);
  });

  it('returns error for unknown tool name', () => {
    const result = executeToolCall(sampleScene, {
      name: 'magic' as any,
      input: {},
    });
    expect(result.ok).toBe(false);
  });

  it('threads errors through chain without side effects', () => {
    const result = executeToolCall(sampleScene, {
      name: 'transform',
      input: { nodeId: 'missing', position: [0, 0, 0] },
    });
    expect(result.ok).toBe(false);
  });

  it('creates an extrude node via tool call', () => {
    const result = executeToolCall(sampleScene, {
      name: 'extrude',
      input: {
        id: 'wall-test',
        shape: [[0, 0], [1, 0], [1, 1], [0, 1]],
        depth: 0.5,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'wall-test');
      expect(node?.type).toBe('extrude');
      expect(node?.parameters.depth).toBe(0.5);
    }
  });

  it('creates a boolean node referencing existing operands', () => {
    const result = executeToolCall(sampleScene, {
      name: 'boolean',
      input: {
        id: 'cut-test',
        operation: 'subtract',
        a: 'box-01',
        b: 'sphere-01',
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'cut-test');
      expect(node?.type).toBe('boolean');
      expect(node?.parameters.a).toBe('box-01');
      expect(node?.parameters.b).toBe('sphere-01');
    }
  });

  it('rejects boolean when operand missing', () => {
    const result = executeToolCall(sampleScene, {
      name: 'boolean',
      input: {
        id: 'bad',
        operation: 'union',
        a: 'box-01',
        b: 'nope',
      },
    });
    expect(result.ok).toBe(false);
  });
});

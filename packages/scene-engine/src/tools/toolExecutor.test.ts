import { describe, it, expect } from 'vitest';
import { executeToolCall } from './toolExecutor.js';
import { sampleScene } from '../sampleScene.js';
import type { Scene } from '../types.js';

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
});

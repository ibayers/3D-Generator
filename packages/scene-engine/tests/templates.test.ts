import { describe, it, expect } from 'vitest';
import { executeToolCall } from '../src/tools/toolExecutor';
import type { Scene } from '../src/types';

function emptyScene(): Scene {
  return { version: '1.0', nodes: [] };
}

describe('toolExecutor template integration', () => {
  it('create_house adds walls, roof, and windows to the scene', () => {
    const scene = emptyScene();
    const res = executeToolCall(scene, {
      name: 'create_house',
      input: {
        id: 'h1',
        position: [0, 0, 0],
        size: [4, 3, 4],
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scene.nodes.length).toBeGreaterThanOrEqual(3);
    expect(res.scene.nodes.some((n) => n.id === 'h1-walls')).toBe(true);
    expect(res.scene.nodes.some((n) => n.id === 'h1-roof')).toBe(true);
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

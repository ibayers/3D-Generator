import { booleanToolInputSchema } from '@asset-studio/schema';
import type { Scene, SceneNode } from '../types';
import type { ToolResult } from './types';
import { findNode } from '../scene/immutable';

export function applyBoolean(scene: Scene, input: unknown): ToolResult {
  const parsed = booleanToolInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }
  const { id, operation, a, b } = parsed.data;
  if (!findNode(scene, a) || !findNode(scene, b)) {
    return {
      ok: false,
      error: {
        code: 'NODE_NOT_FOUND',
        message: `Operand node(s) not found: ${!findNode(scene, a) ? a : ''} ${!findNode(scene, b) ? b : ''}`.trim(),
      },
    };
  }
  const node: SceneNode = {
    id,
    type: 'boolean',
    name: id,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    parameters: { operation, a, b },
    material: { color: '#cccccc' },
    children: [],
  };
  return {
    ok: true,
    scene: { ...scene, nodes: [...scene.nodes, node] },
  };
}

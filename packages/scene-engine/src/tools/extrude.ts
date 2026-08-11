import { extrudeToolInputSchema } from '@asset-studio/schema';
import type { Scene, SceneNode } from '../types';
import type { ToolResult } from './types';

export function applyExtrude(scene: Scene, input: unknown): ToolResult {
  const parsed = extrudeToolInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }
  const { id, shape, depth, position, color } = parsed.data;
  const node: SceneNode = {
    id,
    type: 'extrude',
    name: id,
    transform: {
      position: position ?? [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    parameters: { shape, depth },
    material: color ? { color } : undefined,
    children: [],
  };
  return {
    ok: true,
    scene: { ...scene, nodes: [...scene.nodes, node] },
  };
}

import { arrayToolInputSchema } from '@asset-studio/schema';
import type { Scene, SceneNode } from '../types';
import type { ToolResult } from './types';
import { findNode } from '../scene/immutable';

export function applyArray(scene: Scene, input: unknown): ToolResult {
  const parsed = arrayToolInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }
  const { nodeId, count, offset } = parsed.data;
  const target = findNode(scene, nodeId);
  if (!target) {
    return {
      ok: false,
      error: { code: 'NODE_NOT_FOUND', message: `Node not found: ${nodeId}` },
    };
  }
  // ponytail: clones added as top-level siblings, not world-space children of the parent.
  // Arrayed children of a transformed parent will not inherit the parent's transform.
  // Upgrade path: world-space array in M4 if needed.
  const clones: SceneNode[] = [];
  for (let i = 1; i <= count; i++) {
    const clone = structuredClone(target);
    clone.id = `${nodeId}#${i}`;
    clone.transform.position = [
      target.transform.position[0] + offset[0] * i,
      target.transform.position[1] + offset[1] * i,
      target.transform.position[2] + offset[2] * i,
    ];
    clones.push(clone);
  }
  return {
    ok: true,
    scene: { ...scene, nodes: [...scene.nodes, ...clones] },
  };
}

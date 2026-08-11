import { transformToolInputSchema } from '@asset-studio/schema';
import type { Scene } from '../types.js';
import type { ToolResult } from './types.js';
import { findNode, mapScene } from '../scene/immutable.js';

export function applyTransform(
  scene: Scene,
  input: unknown,
): ToolResult {
  const parsed = transformToolInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }
  const { nodeId, position, rotation, scale } = parsed.data;
  if (position === undefined && rotation === undefined && scale === undefined) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'At least one of position, rotation, or scale must be provided' },
    };
  }
  if (!findNode(scene, nodeId)) {
    return {
      ok: false,
      error: { code: 'NODE_NOT_FOUND', message: `Node not found: ${nodeId}` },
    };
  }
  const next = mapScene(scene, (n) => {
    if (n.id !== nodeId) return n;
    return {
      ...n,
      transform: {
        position: position ?? n.transform.position,
        rotation: rotation ?? n.transform.rotation,
        scale: scale ?? n.transform.scale,
      },
    };
  });
  return { ok: true, scene: next };
}

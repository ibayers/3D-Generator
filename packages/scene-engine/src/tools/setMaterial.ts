import { setMaterialToolInputSchema } from '@asset-studio/schema';
import type { Scene } from '../types.js';
import type { ToolResult } from './types.js';
import { findNode, mapScene } from '../scene/immutable.js';

export function applySetMaterial(
  scene: Scene,
  input: unknown,
): ToolResult {
  const parsed = setMaterialToolInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }
  const { nodeId, color } = parsed.data;
  if (!findNode(scene, nodeId)) {
    return {
      ok: false,
      error: { code: 'NODE_NOT_FOUND', message: `Node not found: ${nodeId}` },
    };
  }
  const next = mapScene(scene, (n) =>
    n.id === nodeId ? { ...n, material: { color } } : n,
  );
  return { ok: true, scene: next };
}

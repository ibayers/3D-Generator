import type { Scene } from '../types.js';
import type { ToolCall, ToolResult } from './types.js';
import { applyTransform } from './transform.js';
import { applySetMaterial } from './setMaterial.js';
import { applyArray } from './array.js';

export function executeToolCall(
  scene: Scene,
  call: ToolCall
): ToolResult {
  switch (call.name) {
    case 'transform':
      return applyTransform(scene, call.input);
    case 'set_material':
      return applySetMaterial(scene, call.input);
    case 'array':
      return applyArray(scene, call.input);
  }
}

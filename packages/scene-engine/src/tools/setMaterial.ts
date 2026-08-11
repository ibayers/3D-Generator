import type { Scene } from '../types.js';
import type { ToolResult } from './types.js';

export function applySetMaterial(_scene: Scene, _input: unknown): ToolResult {
  return {
    ok: false,
    error: { code: 'TOOL_FAILED', message: 'set_material not yet implemented' },
  };
}

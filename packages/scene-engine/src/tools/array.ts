import type { Scene } from '../types.js';
import type { ToolResult } from './types.js';

export function applyArray(_scene: Scene, _input: unknown): ToolResult {
  return {
    ok: false,
    error: { code: 'TOOL_FAILED', message: 'array not yet implemented' },
  };
}

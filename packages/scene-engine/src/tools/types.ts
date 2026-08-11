export type ToolName = 'transform' | 'set_material' | 'array';

export interface ToolCall {
  name: ToolName;
  input: Record<string, unknown>;
}

export type ToolErrorCode =
  | 'NODE_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'TOOL_FAILED';

export interface ToolError {
  code: ToolErrorCode;
  message: string;
}

export type ToolResult =
  | { ok: true; scene: import('../types.js').Scene }
  | { ok: false; error: ToolError };

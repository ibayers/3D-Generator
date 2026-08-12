import type { ToolCall } from "./types";

// Anthropic API tool definition shape
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const SYSTEM_PROMPT = `You are a 3D scene orchestrator. You compose primitive tools (extrude, boolean, array, transform, set_material) and template tools (create_house, create_road) to build scenes described by the user.

Rules:
- Always call exactly one tool per turn.
- Read the current scene JSON provided in the user message to decide what to add.
- Use template tools (create_house, create_road) when the user asks for a recognizable object. Use primitive tools for refinements.
- IDs must be unique across the scene. Prefix with the object kind (e.g. wall-01, roof-01).
- Colors are hex strings like "#aabbcc".
- Vec3 values are [x, y, z] tuples.
- After calling a tool, stop and let the system execute it. You will receive the result in the next message.`;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "extrude",
    description: "Extrude a 2D shape (array of [x,z] points) along Y by depth.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        shape: {
          type: "array",
          items: {
            type: "array",
            items: { type: "number" },
          },
          description: "Array of [x, z] points forming the footprint (min 3)",
        },
        depth: { type: "number", description: "Height to extrude along Y (positive)" },
        position: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y, z] base position",
        },
        color: { type: "string", description: "Optional hex color like #aabbcc" },
      },
      required: ["id", "shape", "depth"],
    },
  },
  {
    name: "boolean",
    description: "Boolean operation (union/subtract/intersect) between two nodes by id.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        operation: { type: "string", enum: ["union", "subtract", "intersect"] },
        a: { type: "string", description: "Operand A node id" },
        b: { type: "string", description: "Operand B node id" },
      },
      required: ["id", "operation", "a", "b"],
    },
  },
  {
    name: "transform",
    description: "Translate, rotate, or scale a node by id.",
    input_schema: {
      type: "object",
      properties: {
        nodeId: { type: "string" },
        position: {
          type: "array",
          items: { type: "number" },
          description: "[x, y, z] translation",
        },
        rotation: {
          type: "array",
          items: { type: "number" },
          description: "[x, y, z] rotation",
        },
        scale: {
          type: "array",
          items: { type: "number" },
          description: "[x, y, z] scale",
        },
      },
      required: ["nodeId"],
    },
  },
  {
    name: "set_material",
    description: "Set material color on a node by id.",
    input_schema: {
      type: "object",
      properties: {
        nodeId: { type: "string" },
        color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      },
      required: ["nodeId", "color"],
    },
  },
  {
    name: "array",
    description: "Create N copies of a node along a vec3 offset.",
    input_schema: {
      type: "object",
      properties: {
        nodeId: { type: "string" },
        count: { type: "integer", minimum: 1, maximum: 100 },
        offset: {
          type: "array",
          items: { type: "number" },
          description: "[x, y, z] offset between copies",
        },
      },
      required: ["nodeId", "count", "offset"],
    },
  },
  {
    name: "create_house",
    description: "Template: build a house with walls, a roof, and decorative window panes at a given position.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "House group id" },
        position: {
          type: "array",
          items: { type: "number" },
          description: "[x, y, z] center of the house footprint",
        },
        size: {
          type: "array",
          items: { type: "number" },
          description: "[width, height, depth] of the house",
        },
        wallColor: { type: "string" },
        roofColor: { type: "string" },
      },
      required: ["id", "position", "size"],
    },
  },
  {
    name: "create_road",
    description: "Template: build a road as an extruded strip along a path of [x,z] points.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        path: {
          type: "array",
          items: { type: "array", items: { type: "number" } },
          description: "Array of [x, z] points the road follows",
        },
        width: { type: "number" },
        color: { type: "string" },
      },
      required: ["id", "path", "width"],
    },
  },
];

export function parseToolCall(raw: {
  id: string;
  name: string;
  input: unknown;
}): ToolCall {
  if (typeof raw.id !== "string") throw new Error("tool_call missing id");
  if (typeof raw.name !== "string") throw new Error("tool_call missing name");
  if (!raw.input || typeof raw.input !== "object") {
    throw new Error("tool_call missing input object");
  }
  return { id: raw.id, name: raw.name, input: raw.input as Record<string, unknown> };
}

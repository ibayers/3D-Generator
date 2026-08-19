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
- After calling a tool you will receive the result in the next message, including the updated scene JSON. Use it to verify and plan the next step.
- Keep the session short: at most 6 tool rounds per request, then summarize what was built.`;

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
    description:
      "Template: build a house with walls, floor bands, and a gable or flat roof. " +
      "Defaults: floors=1, roofStyle=gable (atap pelana), size=[8, floors*3, 6].",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "House group id" },
        position: {
          type: "array",
          items: { type: "number" },
          description: "[x, y, z] center of the house footprint (y = base)",
        },
        size: {
          type: "array",
          items: { type: "number" },
          minItems: 3,
          maxItems: 3,
          description: "Optional [width, height, depth]; default [8, floors*3, 6]",
        },
        floors: {
          type: "integer",
          minimum: 1,
          maximum: 3,
          description: "Number of storeys (1-3)",
        },
        roofStyle: {
          type: "string",
          enum: ["flat", "gable"],
          description: "Roof shape; default gable (atap pelana)",
        },
        roofHeight: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Gable ridge height; default max(1, width*0.22)",
        },
        wallColor: { type: "string" },
        roofColor: { type: "string" },
      },
      required: ["id", "position"],
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

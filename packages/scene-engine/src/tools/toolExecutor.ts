import type { Scene, SceneNode } from '../types';
import type { ToolCall, ToolResult } from './types';
import { applyTransform } from './transform';
import { applySetMaterial } from './setMaterial';
import { applyArray } from './array';
import { applyExtrude } from './extrude';
import { applyBoolean } from './boolean';
import {
  applyCreateHouse,
  applyCreateRoad,
  applyCreateTree,
} from '@asset-studio/llm-adapter';
import {
  createHouseToolInputSchema,
  createRoadToolInputSchema,
  createTreeToolInputSchema,
} from '@asset-studio/schema';

// ponytail: templates emit deterministic IDs from input.id, so a retry or
// re-invocation must replace existing nodes rather than append duplicates.
// Ceiling: O(n*m) per call — fine for scene graphs of this scale; switch to
// a Map if scene.nodes ever reaches thousands.
function upsertNodes(
  existing: SceneNode[],
  incoming: SceneNode[]
): SceneNode[] {
  const newIds = new Set(incoming.map((n) => n.id));
  return [...existing.filter((n) => !newIds.has(n.id)), ...incoming];
}

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
    case 'extrude':
      return applyExtrude(scene, call.input);
    case 'boolean':
      return applyBoolean(scene, call.input);
    case 'create_house': {
      const parsed = createHouseToolInputSchema.safeParse(call.input);
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: parsed.error.message },
        };
      }
      const result = applyCreateHouse(parsed.data, scene);
      return {
        ok: true,
        scene: { ...scene, nodes: upsertNodes(scene.nodes, result.newNodes) },
      };
    }
    case 'create_road': {
      const parsed = createRoadToolInputSchema.safeParse(call.input);
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: parsed.error.message },
        };
      }
      const result = applyCreateRoad(parsed.data, scene);
      return {
        ok: true,
        scene: { ...scene, nodes: upsertNodes(scene.nodes, result.newNodes) },
      };
    }
    case 'create_tree': {
      const parsed = createTreeToolInputSchema.safeParse(call.input);
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: parsed.error.message },
        };
      }
      const result = applyCreateTree(parsed.data, scene);
      // ponytail: tree variants emit different node counts (conifer 4,
      // broadleaf 3), so exact-id upsert would orphan e.g. canopy-3 on a
      // conifer→broadleaf switch. All template node ids are `${id}-`-prefixed,
      // so replace by prefix instead.
      const prefix = `${parsed.data.id}-`;
      const kept = scene.nodes.filter((n) => !n.id.startsWith(prefix));
      return {
        ok: true,
        scene: { ...scene, nodes: [...kept, ...result.newNodes] },
      };
    }
    default:
      // ponytail: unreachable at compile time (ToolName is exhaustive),
      // but defensive at runtime in case of bad input from JS callers
      return {
        ok: false,
        error: { code: 'TOOL_FAILED', message: `Unknown tool: ${String((call as { name: unknown }).name)}` },
      };
  }
}

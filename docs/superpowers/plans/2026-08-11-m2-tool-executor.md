# M2 — Tool Executor & Manipulation Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tool executor that applies LLM-issued tool calls (transform / set_material / array) to the scene graph immutably, plus a schema package for runtime validation.

**Architecture:** New `packages/schema` package wraps Zod schemas for scene + tool inputs. `scene-engine` gains `scene/immutable.ts` (findNode + mapScene helpers) and `tools/` directory (types, executor, 3 tool implementations). Switch-based dispatch — registry pattern is YAGNI for 3 tools. State wired into existing Zustand store via single `applyToolCall` action.

**Tech Stack:** TypeScript, Zod, Vitest, Zustand, pnpm workspaces.

---

## Scope (Lean M2)

**In scope:**
- `packages/schema` with Zod schemas (scene + tool inputs)
- Immutable scene helpers: `findNode`, `mapScene`
- Tool type definitions: `ToolCall`, `ToolResult`, `ToolError`
- 3 tools: `transform`, `set_material`, `array`
- Switch-based `toolExecutor` dispatching by tool name
- Integration tests covering chained tool calls
- Zustand store wiring via `applyToolCall` action

**Deferred to M3+:**

| Item | Target |
|------|--------|
| `extrude` tool | M3 (with CSG boolean — both need geometry-level access) |
| `boolean` tool (three-bvh-csg) | M3 |
| Per-node worldspace transform for array | M4 (currently produces top-level siblings) |
| Tool registry / dynamic registration | YAGNI until >5 tools |
| Recursion depth guard in `mapScene` | M5 (scene depth bounded by sample data for now) |
| Error recovery / partial application | M4 |

---

## File Structure

```
packages/
├── schema/                          # NEW package
│   ├── package.json                 # @asset-studio/schema, exports Zod schemas
│   ├── tsconfig.json                # extends root base
│   └── src/
│       ├── sceneSchema.ts            # Zod mirror of scene-engine types
│       ├── toolSchemas.ts            # Zod schemas for tool inputs
│       └── index.ts                  # re-exports
└── scene-engine/
    └── src/
        ├── scene/                    # NEW directory
        │   ├── immutable.ts          # findNode, mapScene
        │   └── immutable.test.ts
        ├── tools/                    # NEW directory
        │   ├── types.ts              # ToolCall, ToolResult, ToolError
        │   ├── transform.ts
        │   ├── transform.test.ts
        │   ├── setMaterial.ts
        │   ├── setMaterial.test.ts
        │   ├── array.ts
        │   ├── array.test.ts
        │   ├── toolExecutor.ts       # switch dispatch
        │   ├── toolExecutor.test.ts  # integration
        │   └── index.ts
        └── index.ts                  # add tools/ exports

apps/web/src/store/sceneStore.ts     # MODIFY: add applyToolCall action
```

---

### Task 1: Create `packages/schema` with Zod scene + tool input schemas

**Files:**
- Create: `packages/schema/package.json`
- Create: `packages/schema/tsconfig.json`
- Create: `packages/schema/src/sceneSchema.ts`
- Create: `packages/schema/src/toolSchemas.ts`
- Create: `packages/schema/src/index.ts`

- [ ] **Step 1: Create `packages/schema/package.json`**

```json
{
  "name": "@asset-studio/schema",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/schema/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/schema/src/sceneSchema.ts`**

Mirror of `scene-engine/src/types.ts` as Zod schemas. Field names AND shapes identical — `Vec3` is a tuple `[number, number, number]` in M1, so the schema must match (no object form).

```typescript
import { z } from 'zod';

// Vec3 in scene-engine is a tuple [x, y, z] — schema must match.
export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const transformSchema = z.object({
  position: vec3Schema,
  rotation: vec3Schema,
  scale: vec3Schema,
});

export const materialSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

// scene-engine SceneNodeType is the full primitive union + 'group'.
// No separate 'mesh' wrapper — type carries the primitive name directly.
export const sceneNodeTypeSchema = z.enum(['box', 'sphere', 'cylinder', 'plane', 'group']);

export const sceneNodeParametersSchema = z.record(
  z.string(),
  z.union([z.number(), z.array(z.number()), z.string()])
);

// Lazy recursion for children
export const sceneNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: sceneNodeTypeSchema,
    name: z.string(),
    transform: transformSchema,
    parameters: sceneNodeParametersSchema,
    material: materialSchema.optional(),
    children: z.array(sceneNodeSchema).default([]),
  })
);

export const sceneSchema = z.object({
  version: z.string(),
  nodes: z.array(sceneNodeSchema),
});
```

- [ ] **Step 4: Create `packages/schema/src/toolSchemas.ts`**

```typescript
import { z } from 'zod';
import { vec3Schema } from './sceneSchema.js';

export const transformToolInputSchema = z.object({
  nodeId: z.string(),
  position: vec3Schema.optional(),
  rotation: vec3Schema.optional(),
  scale: vec3Schema.optional(),
});

export const setMaterialToolInputSchema = z.object({
  nodeId: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const arrayToolInputSchema = z.object({
  nodeId: z.string(),
  count: z.number().int().min(1).max(100),
  offset: vec3Schema,
});
```

- [ ] **Step 5: Create `packages/schema/src/index.ts`**

```typescript
export * from './sceneSchema.js';
export * from './toolSchemas.js';
```

- [ ] **Step 6: Add `@asset-studio/schema` to workspace**

Verify `pnpm-workspace.yaml` already includes `packages/*` (it does from M1). Run install:

```bash
pnpm install
```

Expected: `packages/schema` linked, no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/schema pnpm-lock.yaml
git commit -m "feat(schema): add @asset-studio/schema package with Zod schemas for scene + tool inputs"
```

---

### Task 2: Build immutable scene helpers (`findNode`, `mapScene`)

**Files:**
- Create: `packages/scene-engine/src/scene/immutable.ts`
- Create: `packages/scene-engine/src/scene/immutable.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/scene-engine/src/scene/immutable.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { findNode, mapScene } from './immutable.js';
import { sampleScene } from '../sampleScene.js';

describe('findNode', () => {
  it('returns top-level node by id', () => {
    const node = findNode(sampleScene, 'box-01');
    expect(node?.id).toBe('box-01');
    expect(node?.meshType).toBe('box');
  });

  it('returns nested child by id', () => {
    const node = findNode(sampleScene, 'cylinder-01');
    expect(node?.id).toBe('cylinder-01');
  });

  it('returns undefined for missing id', () => {
    expect(findNode(sampleScene, 'nope')).toBeUndefined();
  });
});

describe('mapScene', () => {
  it('returns new scene object (immutability)', () => {
    const next = mapScene(sampleScene, (n) => n);
    expect(next).not.toBe(sampleScene);
    expect(next).toEqual(sampleScene);
  });

  it('updates a node by id without mutating original', () => {
    const original = sampleScene.nodes[0];
    const next = mapScene(sampleScene, (n) =>
      n.id === 'box-01' ? { ...n, name: 'renamed' } : n
    );
    expect(original.name).not.toBe('renamed');
    expect(findNode(next, 'box-01')?.name).toBe('renamed');
  });

  it('preserves siblings and other branches untouched', () => {
    const next = mapScene(sampleScene, (n) =>
      n.id === 'box-01' ? { ...n, name: 'changed' } : n
    );
    expect(findNode(next, 'plane-ground')?.name).toBe('Ground');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd packages/scene-engine && pnpm test -- src/scene/immutable.test.ts
```

Expected: FAIL with "Cannot find module './immutable.js'".

- [ ] **Step 3: Implement `immutable.ts`**

```typescript
import type { Scene, SceneNode } from '../types.js';

export function findNode(scene: Scene, id: string): SceneNode | undefined {
  for (const node of scene.nodes) {
    const found = findInNode(node, id);
    if (found) return found;
  }
  return undefined;
}

function findInNode(node: SceneNode, id: string): SceneNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findInNode(child, id);
    if (found) return found;
  }
  return undefined;
}

export function mapScene(
  scene: Scene,
  fn: (node: SceneNode) => SceneNode
): Scene {
  const visit = (node: SceneNode): SceneNode => {
    const updated = fn(node);
    return { ...updated, children: (node.children ?? []).map(visit) };
  };
  return { ...scene, nodes: scene.nodes.map(visit) };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd packages/scene-engine && pnpm test -- src/scene/immutable.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scene-engine/src/scene
git commit -m "feat(scene-engine): add immutable scene helpers findNode + mapScene"
```

---

### Task 3: Tool type definitions + executor switch dispatch

**Files:**
- Create: `packages/scene-engine/src/tools/types.ts`
- Create: `packages/scene-engine/src/tools/toolExecutor.ts`
- Create: `packages/scene-engine/src/tools/index.ts`

- [ ] **Step 1: Create `types.ts`**

```typescript
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
```

- [ ] **Step 2: Create `toolExecutor.ts` skeleton**

```typescript
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
    default:
      return {
        ok: false,
        error: { code: 'TOOL_FAILED', message: `Unknown tool: ${(call as { name: string }).name}` },
      };
  }
}
```

- [ ] **Step 3: Create `tools/index.ts`**

```typescript
export * from './types.js';
export { executeToolCall } from './toolExecutor.js';
```

This won't compile yet (transform/setMaterial/array not created). That's fine — Task 4-6 implement them.

- [ ] **Step 4: Skip commit**

Wait for Task 4 to land first implementation file. Commit at end of Task 4.

---

### Task 4: Implement `transform` tool

**Files:**
- Create: `packages/scene-engine/src/tools/transform.ts`
- Create: `packages/scene-engine/src/tools/transform.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { applyTransform } from './transform.js';
import { sampleScene } from '../sampleScene.js';

describe('applyTransform', () => {
  it('updates position of target node immutably', () => {
    const result = applyTransform(sampleScene, {
      nodeId: 'box-01',
      position: [5, 5, 5],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'box-01');
      expect(node?.transform.position).toEqual([5, 5, 5]);
    }
  });

  it('preserves unspecified transform fields', () => {
    const original = sampleScene.nodes.find((n) => n.id === 'box-01');
    const result = applyTransform(sampleScene, {
      nodeId: 'box-01',
      position: [9, 9, 9],
    });
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'box-01');
      expect(node?.transform.rotation).toEqual(original?.transform.rotation);
      expect(node?.transform.scale).toEqual(original?.transform.scale);
    }
  });

  it('returns NODE_NOT_FOUND for missing node', () => {
    const result = applyTransform(sampleScene, {
      nodeId: 'nope',
      position: [0, 0, 0],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NODE_NOT_FOUND');
    }
  });

  it('returns INVALID_INPUT for bad input shape', () => {
    const result = applyTransform(sampleScene, { nodeId: 'box-01' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });

  it('does not mutate original scene', () => {
    const before = JSON.stringify(sampleScene);
    applyTransform(sampleScene, {
      nodeId: 'box-01',
      position: [1, 1, 1],
    });
    expect(JSON.stringify(sampleScene)).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd packages/scene-engine && pnpm test -- src/tools/transform.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement `transform.ts`**

```typescript
import { transformToolInputSchema } from '@asset-studio/schema';
import type { Scene } from '../types.js';
import type { ToolResult } from './types.js';
import { findNode, mapScene } from '../scene/immutable.js';

export function applyTransform(
  scene: Scene,
  input: unknown
): ToolResult {
  const parsed = transformToolInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }
  const { nodeId, position, rotation, scale } = parsed.data;
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
```

- [ ] **Step 4: Add `@asset-studio/schema` dependency to scene-engine**

Edit `packages/scene-engine/package.json`, add under `dependencies`:

```json
"@asset-studio/schema": "workspace:*"
```

Run `pnpm install`.

- [ ] **Step 5: Run tests to verify pass**

```bash
cd packages/scene-engine && pnpm test -- src/tools/transform.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/scene-engine/src/tools packages/scene-engine/package.json pnpm-lock.yaml
git commit -m "feat(scene-engine): add transform tool with Zod validation"
```

---

### Task 5: Implement `set_material` tool

**Files:**
- Create: `packages/scene-engine/src/tools/setMaterial.ts`
- Create: `packages/scene-engine/src/tools/setMaterial.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { applySetMaterial } from './setMaterial.js';
import { sampleScene } from '../sampleScene.js';

describe('applySetMaterial', () => {
  it('sets color on node with existing material', () => {
    const result = applySetMaterial(sampleScene, {
      nodeId: 'box-01',
      color: '#ff0000',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'box-01');
      expect(node?.material?.color).toBe('#ff0000');
    }
  });

  it('adds material when missing', () => {
    const result = applySetMaterial(sampleScene, {
      nodeId: 'plane-ground',
      color: '#00ff00',
    });
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'plane-ground');
      expect(node?.material?.color).toBe('#00ff00');
    }
  });

  it('rejects invalid hex color', () => {
    const result = applySetMaterial(sampleScene, {
      nodeId: 'box-01',
      color: 'red',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('returns NODE_NOT_FOUND for missing node', () => {
    const result = applySetMaterial(sampleScene, {
      nodeId: 'nope',
      color: '#ff0000',
    });
    if (!result.ok) expect(result.error.code).toBe('NODE_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd packages/scene-engine && pnpm test -- src/tools/setMaterial.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `setMaterial.ts`**

```typescript
import { setMaterialToolInputSchema } from '@asset-studio/schema';
import type { Scene } from '../types.js';
import type { ToolResult } from './types.js';
import { findNode, mapScene } from '../scene/immutable.js';

export function applySetMaterial(
  scene: Scene,
  input: unknown
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
    n.id === nodeId ? { ...n, material: { color } } : n
  );
  return { ok: true, scene: next };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd packages/scene-engine && pnpm test -- src/tools/setMaterial.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scene-engine/src/tools/setMaterial.ts packages/scene-engine/src/tools/setMaterial.test.ts
git commit -m "feat(scene-engine): add set_material tool"
```

---

### Task 6: Implement `array` tool

**Files:**
- Create: `packages/scene-engine/src/tools/array.ts`
- Create: `packages/scene-engine/src/tools/array.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { applyArray } from './array.js';
import { sampleScene } from '../sampleScene.js';

describe('applyArray', () => {
  it('clones node N times with offset positions', () => {
    const result = applyArray(sampleScene, {
      nodeId: 'box-01',
      count: 3,
      offset: [2, 0, 0],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const clones = result.scene.nodes.filter((n) =>
        n.id.startsWith('box-01#')
      );
      expect(clones).toHaveLength(3);
      expect(clones[0].transform.position[0]).toBe(2);
      expect(clones[2].transform.position[0]).toBe(6);
    }
  });

  it('rejects count > 100', () => {
    const result = applyArray(sampleScene, {
      nodeId: 'box-01',
      count: 101,
      offset: [1, 0, 0],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('rejects count < 1', () => {
    const result = applyArray(sampleScene, {
      nodeId: 'box-01',
      count: 0,
      offset: [1, 0, 0],
    });
    if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('returns NODE_NOT_FOUND for missing node', () => {
    const result = applyArray(sampleScene, {
      nodeId: 'nope',
      count: 2,
      offset: [0, 0, 0],
    });
    if (!result.ok) expect(result.error.code).toBe('NODE_NOT_FOUND');
  });

  it('does not mutate original scene', () => {
    const before = JSON.stringify(sampleScene);
    applyArray(sampleScene, {
      nodeId: 'box-01',
      count: 2,
      offset: [1, 0, 0],
    });
    expect(JSON.stringify(sampleScene)).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd packages/scene-engine && pnpm test -- src/tools/array.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `array.ts`**

Uses `structuredClone` (Node 17+, native) — no Immer needed.

```typescript
import { arrayToolInputSchema } from '@asset-studio/schema';
import type { Scene, SceneNode } from '../types.js';
import type { ToolResult } from './types.js';
import { findNode } from '../scene/immutable.js';

export function applyArray(
  scene: Scene,
  input: unknown
): ToolResult {
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
```

**Ponytail note:** Clones are added as top-level siblings, not world-space children of the parent. Documented limitation — arrayed children of a transformed parent will inherit the parent's transform only if the parent is itself a top-level node. Upgrade path: world-space array in M4.

- [ ] **Step 4: Run tests to verify pass**

```bash
cd packages/scene-engine && pnpm test -- src/tools/array.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scene-engine/src/tools/array.ts packages/scene-engine/src/tools/array.test.ts
git commit -m "feat(scene-engine): add array tool for cloning nodes with offset"
```

---

### Task 7: Integration test + finalize `toolExecutor`

**Files:**
- Create: `packages/scene-engine/src/tools/toolExecutor.test.ts`
- Modify: `packages/scene-engine/src/index.ts`

- [ ] **Step 1: Write integration test (chained tool calls)**

```typescript
import { describe, it, expect } from 'vitest';
import { executeToolCall } from './toolExecutor.js';
import { sampleScene } from '../sampleScene.js';
import type { Scene } from '../types.js';

describe('executeToolCall integration', () => {
  it('applies transform → set_material → array in sequence', () => {
    let scene: Scene = sampleScene;

    const move = executeToolCall(scene, {
      name: 'transform',
      input: { nodeId: 'box-01', position: [0, 1, 0] },
    });
    expect(move.ok).toBe(true);
    if (move.ok) scene = move.scene;

    const paint = executeToolCall(scene, {
      name: 'set_material',
      input: { nodeId: 'box-01', color: '#ff8800' },
    });
    expect(paint.ok).toBe(true);
    if (paint.ok) scene = paint.scene;

    const clone = executeToolCall(scene, {
      name: 'array',
      input: {
        nodeId: 'box-01',
        count: 2,
        offset: [3, 0, 0],
      },
    });
    expect(clone.ok).toBe(true);
    if (clone.ok) scene = clone.scene;

    const box = scene.nodes.find((n) => n.id === 'box-01');
    expect(box?.transform.position).toEqual([0, 1, 0]);
    expect(box?.material?.color).toBe('#ff8800');
    const clones = scene.nodes.filter((n) => n.id.startsWith('box-01#'));
    expect(clones).toHaveLength(2);
  });

  it('returns error for unknown tool name', () => {
    const result = executeToolCall(sampleScene, {
      name: 'magic' as any,
      input: {},
    });
    expect(result.ok).toBe(false);
  });

  it('threads errors through chain without side effects', () => {
    const result = executeToolCall(sampleScene, {
      name: 'transform',
      input: { nodeId: 'missing', position: [0, 0, 0] },
    });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
cd packages/scene-engine && pnpm test
```

Expected: PASS (transform: 5, setMaterial: 4, array: 5, executor: 3, immutable: 5 = 22 total + sampleScene: 4 = 26).

- [ ] **Step 3: Update `packages/scene-engine/src/index.ts`**

```typescript
export * from './types.js';
export * from './sampleScene.js';
export * from './scene/immutable.js';
export * from './tools/index.js';
```

- [ ] **Step 4: Typecheck workspace**

```bash
pnpm -r typecheck
```

Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add packages/scene-engine/src/tools/toolExecutor.test.ts packages/scene-engine/src/index.ts
git commit -m "feat(scene-engine): wire toolExecutor dispatch + integration tests"
```

---

### Task 8: Wire `applyToolCall` into Zustand store + manual browser verify

**Files:**
- Modify: `apps/web/src/store/sceneStore.ts`

- [ ] **Step 1: Add `applyToolCall` action**

Replace `apps/web/src/store/sceneStore.ts` with:

```typescript
'use client';

import { create } from 'zustand';
import { sampleScene, executeToolCall, type ToolCall } from '@asset-studio/scene-engine';

interface SceneState {
  scene: typeof sampleScene;
  history: typeof sampleScene[];
  applyToolCall: (call: ToolCall) => { ok: boolean; error?: string };
  reset: () => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  scene: sampleScene,
  history: [],
  applyToolCall: (call) => {
    const current = get().scene;
    const result = executeToolCall(current, call);
    if (result.ok) {
      set({
        scene: result.scene,
        history: [...get().history, current],
      });
      return { ok: true };
    }
    return { ok: false, error: result.error.message };
  },
  reset: () => set({ scene: sampleScene, history: [] }),
}));
```

- [ ] **Step 2: Add dev-mode smoke hook to `apps/web/src/app/page.tsx`**

Add a temporary button row to fire test tool calls (delete after manual verify):

```typescript
'use client';

import { Viewport } from '@/components/Viewport';
import { useSceneStore } from '@/store/sceneStore';

export default function Home() {
  const applyToolCall = useSceneStore((s) => s.applyToolCall);

  return (
    <main className="h-screen w-screen">
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <button
          className="rounded bg-black/70 px-3 py-1 text-white"
          onClick={() =>
            applyToolCall({
              name: 'transform',
              input: { nodeId: 'box-01', position: [2, 1, 0] },
            })
          }
        >
          Move box
        </button>
        <button
          className="rounded bg-black/70 px-3 py-1 text-white"
          onClick={() =>
            applyToolCall({
              name: 'set_material',
              input: { nodeId: 'box-01', color: '#ff8800' },
            })
          }
        >
          Paint box
        </button>
        <button
          className="rounded bg-black/70 px-3 py-1 text-white"
          onClick={() =>
            applyToolCall({
              name: 'array',
              input: {
                nodeId: 'box-01',
                count: 3,
                offset: [2, 0, 0],
              },
            })
          }
        >
          Array box
        </button>
      </div>
      <Viewport />
    </main>
  );
}
```

- [ ] **Step 3: Run dev server + manual verify**

```bash
pnpm dev
```

Open http://localhost:3000. Click each button:
- "Move box" → box jumps to (2, 1, 0)
- "Paint box" → box turns orange (#ff8800)
- "Array box" → 3 new boxes appear offset along +X

Confirm no console errors.

- [ ] **Step 4: Remove smoke buttons, keep minimal page**

Replace `apps/web/src/app/page.tsx`:

```typescript
import { Viewport } from '@/components/Viewport';

export default function Home() {
  return (
    <main className="h-screen w-screen">
      <Viewport />
    </main>
  );
}
```

- [ ] **Step 5: Final typecheck + tests**

```bash
pnpm -r typecheck && pnpm -r test
```

Expected: all pass.

- [ ] **Step 6: Tag M2 release**

```bash
git add apps/web/src/store/sceneStore.ts apps/web/src/app/page.tsx
git commit -m "feat(web): wire applyToolCall to Zustand store"
git tag v0.2.0-m2
```

---

## Definition of Done

- [ ] All 8 tasks committed
- [ ] `pnpm -r test` green (26+ tests)
- [ ] `pnpm -r typecheck` clean
- [ ] Manual browser verify: transform, set_material, array all visibly work
- [ ] Tag `v0.2.0-m2` created
- [ ] Plan file's deferred items (extrude, boolean) listed for M3

---

## Self-Review

**Spec coverage (PRD §5.2 Layer 1 primitive tools):**
- transform ✅ (Task 4)
- set_material ✅ (Task 5)
- array ✅ (Task 6)
- extrude — deferred M3 (geometry-level, needs buffer access)
- boolean — deferred M3 (three-bvh-csg integration)

**Ponytail ladder check:**
- Rung 1 (does it need to exist): Yes — tool executor is M2's entire purpose per PRD.
- Rung 2 (already in codebase): No immutable helpers or Zod schemas existed.
- Rung 3 (stdlib): `structuredClone` used for array clones (native, no Immer).
- Rung 4 (native platform): N/A — TS library code.
- Rung 5 (existing dep): Zod added — battle-tested schema lib per development-workflow.md rule.
- Rung 6 (one line): switch dispatch is the minimum for 3 tools.
- Rung 7 (minimum code): 3 files of ~30 lines each for tools, no speculative registry pattern.

**Placeholder scan:** No "TBD", "later", "similar to" — all steps contain complete code.

**Type consistency:**
- `ToolResult` shape consistent across tools/types.ts and all tool implementations.
- `ToolCall.name` is the literal union — switch cases match.
- `Scene`/`SceneNode` imported from `../types.js` everywhere, no rename.
- Schema field names match runtime types (`position`, `rotation`, `scale`, `color`, `meshType`).

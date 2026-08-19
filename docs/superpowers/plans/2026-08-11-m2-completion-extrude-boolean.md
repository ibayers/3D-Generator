# M2 Completion — Extrude + Boolean Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete PRD M2 spec by adding `extrude` (Layer 1 primitive) and `boolean` (Layer 1 primitive using three-bvh-csg) tools. Both tools create declarative nodes; geometry is computed at render time.

**Architecture:** Two new node types (`extrude`, `boolean`) extend `SceneNodeType`. Two new tools add top-level nodes validated by Zod. Viewport gains two cases in `PrimitiveGeometry` switch — `extrude` builds `THREE.ExtrudeGeometry` from shape params, `boolean` resolves operand node IDs, builds `Brush` objects, runs `Evaluator.evaluate()`. Tools stay declarative (no geometry computation in tool layer).

**Tech Stack:** three.js (ExtrudeGeometry, Shape), three-bvh-csg (Brush, Evaluator, ADDITION/SUBTRACTION/INTERSECTION), Zod, Vitest.

---

## Scope

**In scope:**
- Types: `ExtrudeType`, `BooleanType` added to `SceneNodeType`
- Schemas: `extrudeToolInputSchema`, `booleanToolInputSchema`
- Tools: `applyExtrude`, `applyBoolean` (both create top-level nodes)
- Dispatch: extend `ToolName` union + switch
- Viewport: `extrude` case (THREE.ExtrudeGeometry), `boolean` case (three-bvh-csg)

**Deferred:**

| Item | Target |
|------|--------|
| Recursive boolean operands (boolean of extrude/boolean) | M4 |
| World-space CSG (operands transformed by parent groups) | M4 |
| Bevel support on extrude | M4 (PRD doesn't require for MVP) |
| Multiple-shape extrude (array of Shape) | YAGNI |
| Geometry caching / memo invalidation strategy | M4 (recompute per render is fine for MVP scene sizes) |

---

## File Structure

```
packages/
├── schema/src/
│   ├── sceneSchema.ts             # MODIFY: add extrude/boolean node schemas
│   └── toolSchemas.ts             # MODIFY: add extrude/boolean tool input schemas
└── scene-engine/src/
    ├── types.ts                   # MODIFY: add ExtrudeType, BooleanType, extend Parameters
    ├── tools/
    │   ├── types.ts               # MODIFY: extend ToolName union
    │   ├── extrude.ts             # NEW
    │   ├── extrude.test.ts        # NEW
    │   ├── boolean.ts             # NEW
    │   ├── boolean.test.ts        # NEW
    │   └── toolExecutor.ts        # MODIFY: add 2 switch cases
    └── tools/index.ts             # MODIFY: re-export applyExtrude, applyBoolean

apps/web/src/components/
├── Viewport.tsx                   # MODIFY: pass scene to NodeMesh, add extrude/boolean cases
└── geometry.ts                    # NEW: buildGeometry helper for boolean operand resolution
```

---

### Task 1: Extend types + schema for extrude and boolean node types

**Files:**
- Modify: `packages/scene-engine/src/types.ts`
- Modify: `packages/schema/src/sceneSchema.ts`
- Modify: `packages/schema/src/toolSchemas.ts`

- [ ] **Step 1: Extend `packages/scene-engine/src/types.ts`**

Add two new node type labels and extend the union. Also extend `SceneNodeParameters` to support booleans (needed for `bevelEnabled`):

```typescript
export type Vec3 = [number, number, number];

export type Transform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type Material = {
  color: string; // hex string e.g. "#8b5cf6"
};

export type PrimitiveMeshType = "box" | "sphere" | "cylinder" | "plane";
export type GroupType = "group";
export type ExtrudeType = "extrude";
export type BooleanType = "boolean";
export type SceneNodeType =
  | PrimitiveMeshType
  | GroupType
  | ExtrudeType
  | BooleanType;

// Extended to support booleans (bevelEnabled) and string references (operand IDs)
export type SceneNodeParameters = Record<
  string,
  number | number[] | string | boolean
>;

export type BooleanOperation = "union" | "subtract" | "intersect";

export type SceneNode = {
  id: string;
  type: SceneNodeType;
  name: string;
  transform: Transform;
  parameters: SceneNodeParameters;
  material?: Material;
  children: SceneNode[];
};

export type Scene = {
  version: string;
  nodes: SceneNode[];
};
```

- [ ] **Step 2: Extend `packages/schema/src/sceneSchema.ts`**

Add `extrude` and `boolean` to the node type enum. Add parameter schemas:

```typescript
import { z } from 'zod';

export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const transformSchema = z.object({
  position: vec3Schema,
  rotation: vec3Schema,
  scale: vec3Schema,
});

export const materialSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const sceneNodeTypeSchema = z.enum([
  'box', 'sphere', 'cylinder', 'plane',
  'group', 'extrude', 'boolean',
]);

export const sceneNodeParametersSchema = z.record(
  z.string(),
  z.union([z.number(), z.array(z.number()), z.string(), z.boolean()])
);

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

- [ ] **Step 3: Extend `packages/schema/src/toolSchemas.ts`**

Append two new schemas at the bottom of the file:

```typescript
export const extrudeToolInputSchema = z.object({
  id: z.string(),
  shape: z.array(z.tuple([z.number(), z.number()])).min(3),
  depth: z.number().positive(),
  position: vec3Schema.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const booleanToolInputSchema = z.object({
  id: z.string(),
  operation: z.enum(['union', 'subtract', 'intersect']),
  a: z.string(),
  b: z.string(),
});
```

- [ ] **Step 4: Typecheck**

```bash
pnpm -r typecheck
```

Expected: clean (no errors).

- [ ] **Step 5: Run tests to confirm no regression**

```bash
pnpm -r test
```

Expected: 28 tests still passing (no new tests yet, just type extension).

- [ ] **Step 6: Commit**

```bash
git add packages/scene-engine/src/types.ts packages/schema/src/sceneSchema.ts packages/schema/src/toolSchemas.ts
git commit -m "feat(schema): extend types for extrude + boolean node types and tool inputs"
```

---

### Task 2: Implement `extrude` tool

**Files:**
- Create: `packages/scene-engine/src/tools/extrude.ts`
- Create: `packages/scene-engine/src/tools/extrude.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/scene-engine/src/tools/extrude.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyExtrude } from './extrude.js';
import { sampleScene } from '../sampleScene.js';

describe('applyExtrude', () => {
  it('creates a new extrude node at top level', () => {
    const before = sampleScene.nodes.length;
    const result = applyExtrude(sampleScene, {
      id: 'wall-01',
      shape: [[0, 0], [2, 0], [2, 1], [0, 1]],
      depth: 0.2,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scene.nodes).toHaveLength(before + 1);
      const node = result.scene.nodes.find((n) => n.id === 'wall-01');
      expect(node?.type).toBe('extrude');
      expect(node?.parameters.shape).toEqual([[0, 0], [2, 0], [2, 1], [0, 1]]);
      expect(node?.parameters.depth).toBe(0.2);
    }
  });

  it('applies optional position and color', () => {
    const result = applyExtrude(sampleScene, {
      id: 'wall-02',
      shape: [[0, 0], [1, 0], [1, 1]],
      depth: 1,
      position: [5, 0, 0],
      color: '#ff0000',
    });
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'wall-02');
      expect(node?.transform.position).toEqual([5, 0, 0]);
      expect(node?.material?.color).toBe('#ff0000');
    }
  });

  it('rejects shape with fewer than 3 points', () => {
    const result = applyExtrude(sampleScene, {
      id: 'bad',
      shape: [[0, 0], [1, 1]],
      depth: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('rejects non-positive depth', () => {
    const result = applyExtrude(sampleScene, {
      id: 'bad',
      shape: [[0, 0], [1, 0], [1, 1]],
      depth: 0,
    });
    if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('does not mutate original scene', () => {
    const before = JSON.stringify(sampleScene);
    applyExtrude(sampleScene, {
      id: 'x',
      shape: [[0, 0], [1, 0], [1, 1]],
      depth: 1,
    });
    expect(JSON.stringify(sampleScene)).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd packages/scene-engine && pnpm test -- src/tools/extrude.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement `extrude.ts`**

Create `packages/scene-engine/src/tools/extrude.ts`:

```typescript
import { extrudeToolInputSchema } from '@asset-studio/schema';
import type { Scene, SceneNode } from '../types.js';
import type { ToolResult } from './types.js';

export function applyExtrude(
  scene: Scene,
  input: unknown
): ToolResult {
  const parsed = extrudeToolInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }
  const { id, shape, depth, position, color } = parsed.data;
  const node: SceneNode = {
    id,
    type: 'extrude',
    name: id,
    transform: {
      position: position ?? [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    parameters: { shape, depth },
    material: color ? { color } : undefined,
    children: [],
  };
  return {
    ok: true,
    scene: { ...scene, nodes: [...scene.nodes, node] },
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd packages/scene-engine && pnpm test -- src/tools/extrude.test.ts
```

Expected: PASS (5 tests).

Full suite:
```bash
cd packages/scene-engine && pnpm test
```

Expected: 33 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/scene-engine/src/tools/extrude.ts packages/scene-engine/src/tools/extrude.test.ts
git commit -m "feat(scene-engine): add extrude tool for creating extruded 2D shapes"
```

---

### Task 3: Implement `boolean` tool

**Files:**
- Create: `packages/scene-engine/src/tools/boolean.ts`
- Create: `packages/scene-engine/src/tools/boolean.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/scene-engine/src/tools/boolean.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyBoolean } from './boolean.js';
import { sampleScene } from '../sampleScene.js';

describe('applyBoolean', () => {
  it('creates a boolean node referencing two operands', () => {
    const before = sampleScene.nodes.length;
    const result = applyBoolean(sampleScene, {
      id: 'cut-01',
      operation: 'subtract',
      a: 'box-01',
      b: 'sphere-01',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scene.nodes).toHaveLength(before + 1);
      const node = result.scene.nodes.find((n) => n.id === 'cut-01');
      expect(node?.type).toBe('boolean');
      expect(node?.parameters.operation).toBe('subtract');
      expect(node?.parameters.a).toBe('box-01');
      expect(node?.parameters.b).toBe('sphere-01');
    }
  });

  it('returns NODE_NOT_FOUND when operand a is missing', () => {
    const result = applyBoolean(sampleScene, {
      id: 'cut-02',
      operation: 'union',
      a: 'nope',
      b: 'box-01',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NODE_NOT_FOUND');
  });

  it('returns NODE_NOT_FOUND when operand b is missing', () => {
    const result = applyBoolean(sampleScene, {
      id: 'cut-03',
      operation: 'intersect',
      a: 'box-01',
      b: 'nope',
    });
    if (!result.ok) expect(result.error.code).toBe('NODE_NOT_FOUND');
  });

  it('rejects invalid operation', () => {
    const result = applyBoolean(sampleScene, {
      id: 'cut-04',
      operation: 'xor' as any,
      a: 'box-01',
      b: 'sphere-01',
    });
    if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('does not mutate original scene', () => {
    const before = JSON.stringify(sampleScene);
    applyBoolean(sampleScene, {
      id: 'x',
      operation: 'union',
      a: 'box-01',
      b: 'sphere-01',
    });
    expect(JSON.stringify(sampleScene)).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd packages/scene-engine && pnpm test -- src/tools/boolean.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `boolean.ts`**

Create `packages/scene-engine/src/tools/boolean.ts`:

```typescript
import { booleanToolInputSchema } from '@asset-studio/schema';
import type { Scene, SceneNode } from '../types.js';
import type { ToolResult } from './types.js';
import { findNode } from '../scene/immutable.js';

export function applyBoolean(
  scene: Scene,
  input: unknown
): ToolResult {
  const parsed = booleanToolInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }
  const { id, operation, a, b } = parsed.data;
  if (!findNode(scene, a) || !findNode(scene, b)) {
    return {
      ok: false,
      error: {
        code: 'NODE_NOT_FOUND',
        message: `Operand node(s) not found: ${!findNode(scene, a) ? a : ''} ${!findNode(scene, b) ? b : ''}`.trim(),
      },
    };
  }
  const node: SceneNode = {
    id,
    type: 'boolean',
    name: id,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    parameters: { operation, a, b },
    material: { color: '#cccccc' },
    children: [],
  };
  return {
    ok: true,
    scene: { ...scene, nodes: [...scene.nodes, node] },
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd packages/scene-engine && pnpm test -- src/tools/boolean.test.ts
```

Expected: PASS (5 tests). Full suite: 38 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/scene-engine/src/tools/boolean.ts packages/scene-engine/src/tools/boolean.test.ts
git commit -m "feat(scene-engine): add boolean tool referencing operand nodes by ID"
```

---

### Task 4: Extend `toolExecutor` dispatch + `ToolName` + exports

**Files:**
- Modify: `packages/scene-engine/src/tools/types.ts`
- Modify: `packages/scene-engine/src/tools/toolExecutor.ts`
- Modify: `packages/scene-engine/src/tools/index.ts`

- [ ] **Step 1: Extend `ToolName` union in `types.ts`**

```typescript
export type ToolName = 'transform' | 'set_material' | 'array' | 'extrude' | 'boolean';
```

(Rest of types.ts unchanged.)

- [ ] **Step 2: Add cases to `toolExecutor.ts`**

```typescript
import type { Scene } from '../types.js';
import type { ToolCall, ToolResult } from './types.js';
import { applyTransform } from './transform.js';
import { applySetMaterial } from './setMaterial.js';
import { applyArray } from './array.js';
import { applyExtrude } from './extrude.js';
import { applyBoolean } from './boolean.js';

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
    default:
      // ponytail: unreachable at compile time (ToolName is exhaustive),
      // but defensive at runtime in case of bad input from JS callers
      return {
        ok: false,
        error: { code: 'TOOL_FAILED', message: `Unknown tool: ${String((call as { name: unknown }).name)}` },
      };
  }
}
```

- [ ] **Step 3: Update `tools/index.ts` exports**

```typescript
export * from './types.js';
export { executeToolCall } from './toolExecutor.js';
export { applyExtrude } from './extrude.js';
export { applyBoolean } from './boolean.js';
```

- [ ] **Step 4: Typecheck + run tests**

```bash
pnpm -r typecheck && pnpm -r test
```

Expected: clean typecheck, 38 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/scene-engine/src/tools/types.ts packages/scene-engine/src/tools/toolExecutor.ts packages/scene-engine/src/tools/index.ts
git commit -m "feat(scene-engine): wire extrude + boolean into toolExecutor dispatch"
```

---

### Task 5: Extend Viewport with `extrude` rendering

**Files:**
- Modify: `apps/web/src/components/Viewport.tsx`

- [ ] **Step 1: Add extrude case to PrimitiveGeometry**

In `apps/web/src/components/Viewport.tsx`, the `PrimitiveGeometry` switch needs a new case. Because `THREE.ExtrudeGeometry` requires imperative construction, use a separate component that builds geometry via `useMemo` and attaches via `<primitive>`.

Replace the existing `PrimitiveGeometry` function with:

```tsx
import * as THREE from "three";
import { useMemo } from "react";
// ... existing imports ...

function ExtrudeGeometryMesh({ shape, depth }: { shape: number[][]; depth: number }) {
  const geometry = useMemo(() => {
    const s = new THREE.Shape();
    if (shape.length < 3) throw new Error("extrude shape needs >= 3 points");
    s.moveTo(shape[0]![0], shape[0]![1]);
    for (let i = 1; i < shape.length; i++) {
      s.lineTo(shape[i]![0], shape[i]![1]);
    }
    s.lineTo(shape[0]![0], shape[0]![1]);
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  }, [shape, depth]);
  return <primitive object={geometry} attach="geometry" />;
}

function PrimitiveGeometry({ node }: { node: SceneNode }) {
  const p = node.parameters;
  switch (node.type) {
    case "box":
      return <boxGeometry args={(p.size as Vec3) ?? [1, 1, 1]} />;
    case "sphere":
      return <sphereGeometry args={[(p.radius as number) ?? 1, 32, 32]} />;
    case "cylinder":
      return (
        <cylinderGeometry
          args={[
            (p.radiusTop as number) ?? 0.5,
            (p.radiusBottom as number) ?? 0.5,
            (p.height as number) ?? 1,
            32,
          ]}
        />
      );
    case "plane":
      return (
        <planeGeometry
          args={[(p.width as number) ?? 1, (p.height as number) ?? 1]}
        />
      );
    case "extrude":
      return (
        <ExtrudeGeometryMesh
          shape={p.shape as number[][]}
          depth={p.depth as number}
        />
      );
    default:
      return null;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Smoke test via dev server**

```bash
pnpm dev
```

Open http://localhost:3000. Verify existing scene still renders (no regressions). The sample scene has no extrude nodes yet, so nothing new should appear. Just confirm no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/Viewport.tsx
git commit -m "feat(web): render extrude nodes via THREE.ExtrudeGeometry"
```

---

### Task 6: Install three-bvh-csg + extend Viewport with `boolean` rendering

**Files:**
- Modify: `apps/web/package.json` (install three-bvh-csg)
- Modify: `apps/web/src/components/Viewport.tsx`
- Create: `apps/web/src/components/geometry.ts`

- [ ] **Step 1: Install three-bvh-csg**

```bash
cd apps/web && pnpm add three-bvh-csg
```

Verify version installed (likely 0.0.16+).

- [ ] **Step 2: Create `apps/web/src/components/geometry.ts`**

Helper to build a THREE.BufferGeometry from a primitive node. Used by boolean to construct operand brushes.

```typescript
import * as THREE from "three";
import type { SceneNode } from "@asset-studio/scene-engine";

// ponytail: MVP only supports primitive operands (box/sphere/cylinder/plane).
// Extrude/group/boolean operands return null — upgrade path: recursive buildGeometry in M4.
export function buildPrimitiveGeometry(node: SceneNode): THREE.BufferGeometry | null {
  const p = node.parameters;
  switch (node.type) {
    case "box":
      return new THREE.BoxGeometry(
        ...((p.size as [number, number, number]) ?? [1, 1, 1])
      );
    case "sphere":
      return new THREE.SphereGeometry((p.radius as number) ?? 1, 32, 32);
    case "cylinder":
      return new THREE.CylinderGeometry(
        (p.radiusTop as number) ?? 0.5,
        (p.radiusBottom as number) ?? 0.5,
        (p.height as number) ?? 1,
        32
      );
    case "plane":
      return new THREE.PlaneGeometry(
        (p.width as number) ?? 1,
        (p.height as number) ?? 1
      );
    default:
      return null;
  }
}
```

- [ ] **Step 3: Add BooleanGeometryMesh component to Viewport.tsx**

At top of `Viewport.tsx`, add imports:

```tsx
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from "three-bvh-csg";
import { buildPrimitiveGeometry } from "./geometry";
```

Add new component (after `ExtrudeGeometryMesh`):

```tsx
const OP_MAP = {
  union: ADDITION,
  subtract: SUBTRACTION,
  intersect: INTERSECTION,
} as const;

function BooleanGeometryMesh({
  operation,
  aId,
  bId,
  nodes,
}: {
  operation: keyof typeof OP_MAP;
  aId: string;
  bId: string;
  nodes: SceneNode[];
}) {
  const geometry = useMemo(() => {
    const aNode = nodes.find((n) => n.id === aId);
    const bNode = nodes.find((n) => n.id === bId);
    if (!aNode || !bNode) return null;

    const geomA = buildPrimitiveGeometry(aNode);
    const geomB = buildPrimitiveGeometry(bNode);
    if (!geomA || !geomB) return null;

    const brushA = new Brush(geomA);
    brushA.updateMatrixWorld();
    const brushB = new Brush(geomB);
    brushB.updateMatrixWorld();

    const evaluator = new Evaluator();
    const result = evaluator.evaluate(brushA, brushB, OP_MAP[operation]);
    return result.geometry;
  }, [operation, aId, bId, nodes]);

  if (!geometry) return null;
  return <primitive object={geometry} attach="geometry" />;
}
```

- [ ] **Step 4: Pass `scene.nodes` into `NodeMesh` and add `boolean` case**

Modify `NodeMesh` to receive the full nodes array so boolean can resolve operand IDs. Replace the current `NodeMesh` and `Viewport`:

```tsx
function NodeMesh({ node, allNodes }: { node: SceneNode; allNodes: SceneNode[] }) {
  const { position, rotation, scale } = node.transform;

  if (node.type === "group") {
    return (
      <group position={position} rotation={rotation} scale={scale}>
        {node.children.map((child) => (
          <NodeMesh key={child.id} node={child} allNodes={allNodes} />
        ))}
      </group>
    );
  }

  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      {node.type === "boolean" ? (
        <BooleanGeometryMesh
          operation={node.parameters.operation as keyof typeof OP_MAP}
          aId={node.parameters.a as string}
          bId={node.parameters.b as string}
          nodes={allNodes}
        />
      ) : (
        <PrimitiveGeometry node={node} />
      )}
      <meshStandardMaterial color={node.material?.color ?? "#888888"} />
    </mesh>
  );
}

export default function Viewport() {
  const scene = useSceneStore((s) => s.scene);

  return (
    <Canvas camera={{ position: [6, 5, 6], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      {scene.nodes.map((node) => (
        <NodeMesh key={node.id} node={node} allNodes={scene.nodes} />
      ))}
      <OrbitControls makeDefault />
    </Canvas>
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Smoke test (no boolean nodes yet, just confirm no regression)**

```bash
pnpm dev
```

Open http://localhost:3000. Confirm scene renders. No boolean nodes exist yet, so no CSG runs — just verify existing primitives still show.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/src/components/geometry.ts apps/web/src/components/Viewport.tsx pnpm-lock.yaml
git commit -m "feat(web): render boolean nodes via three-bvh-csg"
```

---

### Task 7: Integration test for extrude + boolean + existing tools

**Files:**
- Modify: `packages/scene-engine/src/tools/toolExecutor.test.ts`

- [ ] **Step 1: Add 3 new integration tests**

Append to the existing `describe('executeToolCall integration', ...)` block in `toolExecutor.test.ts`:

```typescript
  it('creates an extrude node via tool call', () => {
    const result = executeToolCall(sampleScene, {
      name: 'extrude',
      input: {
        id: 'wall-test',
        shape: [[0, 0], [1, 0], [1, 1], [0, 1]],
        depth: 0.5,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'wall-test');
      expect(node?.type).toBe('extrude');
      expect(node?.parameters.depth).toBe(0.5);
    }
  });

  it('creates a boolean node referencing existing operands', () => {
    const result = executeToolCall(sampleScene, {
      name: 'boolean',
      input: {
        id: 'cut-test',
        operation: 'subtract',
        a: 'box-01',
        b: 'sphere-01',
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const node = result.scene.nodes.find((n) => n.id === 'cut-test');
      expect(node?.type).toBe('boolean');
      expect(node?.parameters.a).toBe('box-01');
      expect(node?.parameters.b).toBe('sphere-01');
    }
  });

  it('rejects boolean when operand missing', () => {
    const result = executeToolCall(sampleScene, {
      name: 'boolean',
      input: {
        id: 'bad',
        operation: 'union',
        a: 'box-01',
        b: 'nope',
      },
    });
    expect(result.ok).toBe(false);
  });
```

- [ ] **Step 2: Run tests**

```bash
cd packages/scene-engine && pnpm test
```

Expected: 41 tests passing (38 + 3 new).

- [ ] **Step 3: Commit**

```bash
git add packages/scene-engine/src/tools/toolExecutor.test.ts
git commit -m "test(scene-engine): add integration tests for extrude + boolean tools"
```

---

### Task 8: Manual verify + tag

**Files:**
- Modify: `apps/web/src/app/page.tsx` (temporary smoke buttons, then revert)

- [ ] **Step 1: Add temporary smoke buttons to `page.tsx`**

```tsx
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
              name: 'extrude',
              input: {
                id: `wall-${Date.now()}`,
                shape: [[0, 0], [2, 0], [2, 1], [0, 1]],
                depth: 0.2,
                color: '#aabbcc',
              },
            })
          }
        >
          Add wall
        </button>
        <button
          className="rounded bg-black/70 px-3 py-1 text-white"
          onClick={() =>
            applyToolCall({
              name: 'boolean',
              input: {
                id: `cut-${Date.now()}`,
                operation: 'subtract',
                a: 'box-01',
                b: 'sphere-01',
              },
            })
          }
        >
          Cut box with sphere
        </button>
      </div>
      <Viewport />
    </main>
  );
}
```

- [ ] **Step 2: Run dev server + manual verify**

```bash
pnpm dev
```

Open http://localhost:3000. Click each button:
- **Add wall** → a flat extruded rectangle appears at origin
- **Cut box with sphere** → a new mesh appears showing the boolean subtraction of sphere from box

Confirm no console errors.

- [ ] **Step 3: Revert `page.tsx` to minimal**

```tsx
import { Viewport } from '@/components/Viewport';

export default function Home() {
  return (
    <main className="h-screen w-screen">
      <Viewport />
    </main>
  );
}
```

- [ ] **Step 4: Final verification**

```bash
pnpm -r typecheck && pnpm -r test
```

Expected: 41 tests pass, typecheck clean.

- [ ] **Step 5: Commit + tag**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): verify extrude + boolean rendering end-to-end"
git tag v0.2.1-m2-complete
```

---

## Definition of Done

- [ ] All 8 tasks committed
- [ ] `pnpm -r test` green (41 tests)
- [ ] `pnpm -r typecheck` clean
- [ ] Manual browser verify: extrude wall renders, boolean cut renders
- [ ] Tag `v0.2.1-m2-complete` created
- [ ] PRD M2 spec fully satisfied (all 5 primitive tools working)

---

## Self-Review

**Spec coverage (PRD §5.2 Layer 1 primitive tools — M2 spec):**
- transform ✅ (M2 done)
- set_material ✅ (M2 done)
- array ✅ (M2 done)
- extrude ✅ (this plan, Task 2)
- boolean ✅ (this plan, Task 3)

**Ponytail ladder check:**
- Rung 1 (need to exist): Yes — required by PRD M2 spec.
- Rung 2 (in codebase): No — new functionality.
- Rung 3 (stdlib): three.js (already installed) provides ExtrudeGeometry. three-bvh-csg is the battle-tested CSG lib per PRD §6.5.
- Rung 4 (native platform): N/A.
- Rung 5 (existing dep): three-bvh-csg added because no existing dep provides CSG.
- Rung 6 (one line): No — both tools need validation + node creation.
- Rung 7 (minimum code): Tools are ~25 lines each (validate + create node). Renderer is the only place with real logic — unavoidable.

**Placeholder scan:** No "TBD", "later", "similar to" — all code shown complete.

**Type consistency:**
- `ToolName` extended in step with `toolExecutor` switch cases.
- `SceneNodeType` includes both new types; `sceneNodeTypeSchema` matches.
- `SceneNodeParameters` extended to support `boolean` (for `bevelEnabled`) — schema mirrors.
- `OP_MAP` keyed by `'union' | 'subtract' | 'intersect'` matching `BooleanOperation` type.
- Operand IDs stored as `string` in parameters, retrieved via `as string` cast in renderer (safe because schema validated at tool layer).
- New component `BooleanGeometryMesh` receives `nodes: SceneNode[]` to resolve operand IDs — single source of truth from store.

**Known limitation documented:**
- Boolean operands restricted to primitives (`buildPrimitiveGeometry` returns null for extrude/group/boolean). Ponytail comment in `geometry.ts` calls out M4 upgrade path.

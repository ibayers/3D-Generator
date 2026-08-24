# M6 — create_tree (Organic Proof-of-Concept) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan template generator `create_tree(type, height)` sebagai proof-of-concept organic pertama (PRD §5.2, §12 M6) — pohon low-poly yang tersusun visibel dari primitif Layer 1 (extrude), callable oleh LLM lewat tool `create_tree`.

**Architecture:** Mengikuti pola `create_house`/`create_road` persis: Zod schema di `packages/schema` → template `applyCreateTree` di `packages/llm-adapter/src/templates/` yang mengemit node `extrude` → case baru di `packages/scene-engine` toolExecutor (ToolName + upsert) → definisi tool + system prompt di `packages/llm-adapter/src/tools.ts` → copy UI (SceneRail Layer 2, chip prompt). Dua varian: `conifer` (batang + 3 tingkat kanopi heksagon mengecil) dan `broadleaf` (batang + 2 cakram oktagon). Semua shape poligon beraturan **terpusat di origin** + posisi dunia pada node — preseden slab atap pelana yang sudah terverifikasi visual (bukan footprint world-baked seperti dinding rumah).

**Tech Stack:** Zod (schema), TypeScript strict, Vitest 2.1.9 di tiap package, pnpm monorepo.

---

## Konteks wajib dibaca implementer (pola yang harus diikuti)

| Apa | File | Pola kunci |
|---|---|---|
| Template house | `packages/llm-adapter/src/templates/createHouse.ts` | interface Input/Result manual, konstanta named, helper `extrudeNode(id, shape, depth, color, position, rotation?)`, emit `SceneNode[]` flat dengan id `${input.id}-<bagian>` |
| Schema tool | `packages/schema/src/toolSchemas.ts` | `z.object({...})` + `export type X = z.infer<...>` |
| Executor | `packages/scene-engine/src/tools/toolExecutor.ts` | case `create_tree` parse schema → `applyCreateTree` → `upsertNodes` |
| ToolName | `packages/scene-engine/src/tools/types.ts` | union type — tambah `'create_tree'` |
| Definisi tool | `packages/llm-adapter/src/tools.ts` | `TOOL_DEFINITIONS` bentuk Anthropic + SYSTEM_PROMPT |
| Copy UI | `apps/web/src/components/SceneRail.tsx` (`LAYER2_TOOLS`), `apps/web/src/components/ChatPanel.tsx` (`STARTER_CHIPS`) | daftar statis jujur |

**Kontrak renderer (dari createHouse, terverifikasi):** node `extrude` dengan `parameters: { shape: [x,y][], depth }` di-render ExtrudeGeometry + `rotateX(-π/2)`; shape-Y → world −Z; `transform.position` meng-offset mesh. Shape **terpusat** (simetris di 0,0) + posisi dunia `[px, pyTier, pz]` = pola slab atap — untuk poligon beraturan simetris, negasi Z tidak mengubah hasil, jadi helper `xz()` TIDAK diperlukan di template ini.

---

### Task 1: Schema + template `create_tree` (llm-adapter + schema)

**Files:**
- Modify: `packages/schema/src/toolSchemas.ts`
- Create: `packages/llm-adapter/src/templates/createTree.ts`
- Modify: `packages/llm-adapter/src/templates/index.ts` (re-export; cek nama file persisnya)
- Test: `packages/llm-adapter/tests/templates.test.ts`

- [ ] **Step 1: Write the failing tests** — tambah di akhir `packages/llm-adapter/tests/templates.test.ts`:

```typescript
import { applyCreateTree } from "../src/templates/createTree";

describe("applyCreateTree", () => {
  it("conifer (default): trunk + 3 canopy tiers, all extrude nodes", () => {
    const { newNodes } = applyCreateTree(
      { id: "tree-01", position: [2, 0, 3] },
      { nodes: [] },
    );
    expect(newNodes.map((n) => n.id)).toEqual([
      "tree-01-trunk",
      "tree-01-canopy-1",
      "tree-01-canopy-2",
      "tree-01-canopy-3",
    ]);
    expect(newNodes.every((n) => n.type === "extrude")).toBe(true);
    expect(newNodes.every((n) => n.children.length === 0)).toBe(true);
  });

  it("conifer: canopy tier radii decrease upward and canopy sits above trunk base", () => {
    const H = 6;
    const { newNodes } = applyCreateTree(
      { id: "t", position: [0, 0, 0], height: H },
      { nodes: [] },
    );
    // parameters bertipe union — test existing tidak pernah mengaritmetikanya
    // langsung; pakai helper cast seperti ini agar lolos tsc strict.
    const depth = (n: SceneNode) => n.parameters.depth as number;
    const shape = (n: SceneNode) => n.parameters.shape as [number, number][];
    const radius = (n: SceneNode) =>
      Math.max(...shape(n).map(([x, y]) => Math.hypot(x, y)));
    const [trunk, c1, c2, c3] = newNodes;
    expect(radius(trunk!)).toBeLessThan(radius(c1!));
    expect(radius(c1!)).toBeGreaterThan(radius(c2!));
    expect(radius(c2!)).toBeGreaterThan(radius(c3!));
    // Semua bagian berada di atas tanah (y >= 0) dan puncak <= H.
    const tops = newNodes.map((n) => n.transform.position[1] + depth(n));
    expect(Math.min(...tops)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...tops)).toBeLessThanOrEqual(H);
    // Batang mulai dari tanah.
    expect(trunk!.transform.position[1]).toBe(0);
  });

  it("broadleaf: trunk + 2 canopy discs", () => {
    const { newNodes } = applyCreateTree(
      { id: "b", position: [1, 0, 1], type: "broadleaf" },
      { nodes: [] },
    );
    expect(newNodes).toHaveLength(3);
    expect(newNodes.map((n) => n.id)).toEqual([
      "b-trunk",
      "b-canopy-1",
      "b-canopy-2",
    ]);
  });

  it("position offsets every node; colors default and overridable", () => {
    const [x, y, z] = [5, 1, -2];
    const { newNodes } = applyCreateTree(
      { id: "p", position: [x, y, z] },
      { nodes: [] },
    );
    for (const n of newNodes) {
      expect(n.transform.position[0]).toBe(x);
      expect(n.transform.position[2]).toBe(z);
    }
    const trunk = newNodes[0]!;
    expect(trunk.material?.color).toBe("#6b4a2f");
    const canopy = newNodes[1]!;
    expect(canopy.material?.color).toBe("#2f7d3a");

    const custom = applyCreateTree(
      { id: "c", position: [0, 0, 0], trunkColor: "#111111", canopyColor: "#222222" },
      { nodes: [] },
    );
    expect(custom.newNodes[0]!.material?.color).toBe("#111111");
    expect(custom.newNodes[1]!.material?.color).toBe("#222222");
  });

  it("height is clamped to a sane minimum", () => {
    const { newNodes } = applyCreateTree(
      { id: "tiny", position: [0, 0, 0], height: 0.01 },
      { nodes: [] },
    );
    const trunk = newNodes[0]!;
    expect(trunk.parameters.depth as number).toBeGreaterThanOrEqual(0.3);
  });
});
```

Jika file test mengimpor template via barrel (`../src/templates`), letakkan import `applyCreateTree` mengikuti gaya import yang ada (jangan dobel-import).

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run templates`
Expected: FAIL — modul `../src/templates/createTree` tidak ditemukan.

- [ ] **Step 3: Implement template** — buat `packages/llm-adapter/src/templates/createTree.ts`:

```typescript
import type { SceneNode, Vec3 } from "@asset-studio/scene-engine";

export interface CreateTreeInput {
  id: string;
  position: [number, number, number];
  /** Default "conifer" (pinus). */
  type?: "conifer" | "broadleaf";
  /** Total tree height in meters; default 6, clamped to >= 1. */
  height?: number;
  trunkColor?: string;
  canopyColor?: string;
}

export interface CreateTreeResult {
  newNodes: SceneNode[];
}

const DEFAULT_HEIGHT = 6;
const MIN_HEIGHT = 1;
const TRUNK_COLOR_DEFAULT = "#6b4a2f";
const CONIFER_CANOPY_COLOR = "#2f7d3a";
const BROADLEAF_CANOPY_COLOR = "#3d8b40";
const TRUNK_SIDES = 6;
const CONIFER_SIDES = 6;
const BROADLEAF_SIDES = 8;
const CONIFER_TRUNK_RATIO = 0.4;
const BROADLEAF_TRUNK_RATIO = 0.55;
/** Trunk radius relative to height — low-poly proportions. */
const TRUNK_RADIUS_RATIO = 0.04;

type XY = [number, number];

/** Regular polygon centered on (0,0) — shape-local coords; world offset comes
 * from transform.position (same contract as the gable roof slabs). */
function regularPolygon(sides: number, radius: number): XY[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = (2 * Math.PI * i) / sides;
    return [radius * Math.cos(a), radius * Math.sin(a)] as XY;
  });
}

function extrudeNode(
  id: string,
  shape: XY[],
  depth: number,
  color: string,
  position: Vec3
): SceneNode {
  return {
    id,
    type: "extrude",
    name: id,
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
    parameters: { shape, depth },
    material: { color },
    children: [],
  };
}

/**
 * ponytail: template = composition of Layer-1 extrudes, per PRD §5.2 — the
 * organic PoC must visibly be built from the same primitives as houses/roads.
 * Conifer: hexagon trunk + 3 tapering hexagon tiers. Broadleaf: hexagon trunk
 * + 2 octagon discs (larger below, smaller above) for a rounded crown read.
 */
export function applyCreateTree(
  input: CreateTreeInput,
  _scene: { nodes: SceneNode[] }
): CreateTreeResult {
  const type = input.type ?? "conifer";
  const h = Math.max(input.height ?? DEFAULT_HEIGHT, MIN_HEIGHT);
  const [px, py, pz] = input.position;
  const trunkColor = input.trunkColor ?? TRUNK_COLOR_DEFAULT;
  const canopyColor =
    input.canopyColor ?? (type === "broadleaf" ? BROADLEAF_CANOPY_COLOR : CONIFER_CANOPY_COLOR);

  const trunkRadius = Math.max(h * TRUNK_RADIUS_RATIO, 0.15);
  const nodes: SceneNode[] = [];

  if (type === "broadleaf") {
    const trunkH = h * BROADLEAF_TRUNK_RATIO;
    nodes.push(
      extrudeNode(
        `${input.id}-trunk`,
        regularPolygon(TRUNK_SIDES, trunkRadius),
        trunkH,
        trunkColor,
        [px, py, pz]
      )
    );
    // Dua cakram kanopi: bawah besar (60% tinggi), atas kecil (40%).
    const lowerH = h * 0.28;
    const upperH = h * 0.2;
    nodes.push(
      extrudeNode(
        `${input.id}-canopy-1`,
        regularPolygon(BROADLEAF_SIDES, h * 0.24),
        lowerH,
        canopyColor,
        [px, py + trunkH - lowerH * 0.3, pz]
      )
    );
    nodes.push(
      extrudeNode(
        `${input.id}-canopy-2`,
        regularPolygon(BROADLEAF_SIDES, h * 0.16),
        upperH,
        canopyColor,
        [px, py + trunkH + lowerH * 0.55, pz]
      )
    );
    return { newNodes: nodes };
  }

  // Conifer.
  const trunkH = h * CONIFER_TRUNK_RATIO;
  nodes.push(
    extrudeNode(
      `${input.id}-trunk`,
      regularPolygon(TRUNK_SIDES, trunkRadius),
      trunkH,
      trunkColor,
      [px, py, pz]
    )
  );
  // 3 tingkat kanopi mengecil, tumpang-tindih dari ~45% h hingga puncak.
  const tierHeights = [h * 0.24, h * 0.2, h * 0.16];
  const tierRadii = [h * 0.22, h * 0.16, h * 0.1];
  const tierBase = [h * 0.45, h * 0.62, h * 0.78];
  for (let k = 0; k < 3; k++) {
    nodes.push(
      extrudeNode(
        `${input.id}-canopy-${k + 1}`,
        regularPolygon(CONIFER_SIDES, tierRadii[k]!),
        tierHeights[k]!,
        canopyColor,
        [px, py + tierBase[k]!, pz]
      )
    );
  }
  return { newNodes: nodes };
}
```

Catatan presisi konstanta agar test lolos: tierRadii menurun (0.22h > 0.16h > 0.1h) dan trunkRadius (0.04h, min 0.15) < 0.22h ✓. Puncak conifer = tierBase[2] + tierHeights[2] = 0.78h + 0.16h = 0.94h ≤ h ✓. Trunk mulai di py ✓. Clamp MIN_HEIGHT=1 membuat test height 0.01 → h=1 → trunk depth = 0.4 ≥ 0.3 ✓. Broadleaf canopy-1 base = trunkH − 0.3·lowerH ≥ 0 ✓, puncak = trunkH + 0.55·lowerH + upperH = 0.55h + 0.154h + 0.2h = 0.904h ≤ h ✓.

Tambahkan re-export di `packages/llm-adapter/src/templates/index.ts`: `export * from "./createTree";` (ikuti baris createHouse/createRoad yang ada).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run templates`
Expected: PASS semua (existing + 5 baru). Lalu `pnpm --filter @asset-studio/llm-adapter exec tsc --noEmit` → clean.

- [ ] **Step 5: Tambah schema** — di `packages/schema/src/toolSchemas.ts`, setelah `createRoadToolInputSchema`:

```typescript
export const createTreeToolInputSchema = z.object({
  id: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  /** Default "conifer" in the template. */
  type: z.enum(['conifer', 'broadleaf']).optional(),
  height: z.number().positive().optional(),
  trunkColor: z.string().optional(),
  canopyColor: z.string().optional(),
});
export type CreateTreeToolInput = z.infer<typeof createTreeToolInputSchema>;
```

File test schema ada: `packages/schema/tests/toolSchemas.test.ts`. Tambahkan di akhir file tersebut (ikuti gaya import-nya):

```typescript
describe('createTreeToolInputSchema', () => {
  it('accepts a minimal valid input', () => {
    const parsed = createTreeToolInputSchema.safeParse({ id: 't1', position: [1, 0, 2] });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown type and non-positive height', () => {
    const badType = createTreeToolInputSchema.safeParse({
      id: 't',
      position: [0, 0, 0],
      type: 'palm',
    });
    expect(badType.success).toBe(false);
    const badHeight = createTreeToolInputSchema.safeParse({
      id: 't',
      position: [0, 0, 0],
      height: -1,
    });
    expect(badHeight.success).toBe(false);
  });
});
```

(dengan `createTreeToolInputSchema` ditambahkan ke import yang ada dari `../src/toolSchemas`). Run: `pnpm --filter @asset-studio/schema test -- --run` → PASS (5 existing + 2 baru). File test ikut di-commit Step 6 (`git add packages/schema/tests/toolSchemas.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/toolSchemas.ts packages/schema/tests/toolSchemas.test.ts packages/llm-adapter/src/templates/createTree.ts packages/llm-adapter/src/templates/index.ts packages/llm-adapter/tests/templates.test.ts
git commit -m "feat(llm-adapter): create_tree template composing extrude primitives"
```

---

### Task 2: Executor `create_tree` (scene-engine)

**Files:**
- Modify: `packages/scene-engine/src/tools/types.ts`
- Modify: `packages/scene-engine/src/tools/toolExecutor.ts`
- Test: `packages/scene-engine/tests/templates.test.ts`

- [ ] **Step 1: Write the failing tests** — tambah di akhir `packages/scene-engine/tests/templates.test.ts` (ikuti pola describe `create_road` yang ada, termasuk fixture scene kosong lokalnya):

```typescript
describe('create_tree', () => {
  it('adds conifer nodes to the scene', () => {
    const result = executeToolCall(EMPTY_SCENE, {
      name: 'create_tree',
      input: { id: 'tree-01', position: [1, 0, 2], height: 5 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.nodes.map((n) => n.id)).toContain('tree-01-trunk');
    expect(result.scene.nodes).toHaveLength(4);
  });

  it('upserts by id — re-invocation replaces, not appends', () => {
    const first = executeToolCall(EMPTY_SCENE, {
      name: 'create_tree',
      input: { id: 'tree-01', position: [0, 0, 0] },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = executeToolCall(first.scene, {
      name: 'create_tree',
      input: { id: 'tree-01', position: [0, 0, 0], type: 'broadleaf' },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.scene.nodes).toHaveLength(3);
  });

  it('rejects invalid type with INVALID_INPUT', () => {
    const result = executeToolCall(EMPTY_SCENE, {
      name: 'create_tree',
      input: { id: 't', position: [0, 0, 0], type: 'palm' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });
});
```

Sesuaikan `EMPTY_SCENE` dengan nama fixture yang dipakai file test tersebut.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @asset-studio/scene-engine test -- --run templates`
Expected: FAIL — `create_tree` jatuh ke default case (`Unknown tool`).

- [ ] **Step 3: Implement**

`packages/scene-engine/src/tools/types.ts` — union `ToolName` tambah `| 'create_tree';` (setelah `'create_road'`).

`packages/scene-engine/src/tools/toolExecutor.ts` — import `applyCreateTree` (gabung ke import `@asset-studio/llm-adapter` yang ada) dan `createTreeToolInputSchema` (gabung ke import `@asset-studio/schema`). Tambah case setelah `create_road`:

```typescript
    case 'create_tree': {
      const parsed = createTreeToolInputSchema.safeParse(call.input);
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: parsed.error.message },
        };
      }
      const result = applyCreateTree(parsed.data, scene);
      return {
        ok: true,
        scene: { ...scene, nodes: upsertNodes(scene.nodes, result.newNodes) },
      };
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @asset-studio/scene-engine test -- --run`
Expected: PASS semua. `pnpm --filter @asset-studio/scene-engine exec tsc --noEmit` → clean (memverifikasi kecukupan `ToolName` union juga).

- [ ] **Step 5: Commit**

```bash
git add packages/scene-engine/src/tools/types.ts packages/scene-engine/src/tools/toolExecutor.ts packages/scene-engine/tests/templates.test.ts
git commit -m "feat(scene-engine): execute create_tree tool via template composition"
```

---

### Task 3: Definisi tool + system prompt (llm-adapter/tools.ts)

**Files:**
- Modify: `packages/llm-adapter/src/tools.ts`
- Test: `packages/llm-adapter/tests/tools.test.ts`

- [ ] **Step 1: Write the failing tests** — tambah di `packages/llm-adapter/tests/tools.test.ts`:

```typescript
describe("create_tree definition", () => {
  const tree = TOOL_DEFINITIONS.find((t) => t.name === "create_tree");

  it("exists with required fields", () => {
    expect(tree).toBeDefined();
    expect(tree?.description).toContain("tree");
    expect(tree?.input_schema.required).toEqual(["id", "position"]);
  });

  it("documents type enum and height", () => {
    const props = tree?.input_schema.properties as Record<string, { enum?: string[] }>;
    expect(props.type?.enum).toEqual(["conifer", "broadleaf"]);
    expect(props.height).toBeDefined();
  });
});
```

Dan satu test system prompt:

```typescript
it("SYSTEM_PROMPT mentions create_tree", () => {
  expect(SYSTEM_PROMPT).toContain("create_tree");
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run tools`
Expected: FAIL — `tree` undefined.

- [ ] **Step 3: Implement** — di `packages/llm-adapter/src/tools.ts`:

SYSTEM_PROMPT baris pertama, ubah `(create_house, create_road)` menjadi `(create_house, create_road, create_tree)`.

TOOL_DEFINITIONS, tambah entri setelah `create_road`:

```typescript
  {
    name: "create_tree",
    description:
      "Template: build a low-poly tree composed of extruded polygons. " +
      "Defaults: type=conifer (pinus, 3 tapering canopy tiers), height=6.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Tree group id" },
        position: {
          type: "array",
          items: { type: "number" },
          description: "[x, y, z] center of the trunk base (y = base)",
        },
        type: {
          type: "string",
          enum: ["conifer", "broadleaf"],
          description: "conifer = pinus-like tiers; broadleaf = rounded crown; default conifer",
        },
        height: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Total tree height in meters; default 6",
        },
        trunkColor: { type: "string" },
        canopyColor: { type: "string" },
      },
      required: ["id", "position"],
    },
  },
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run`
Expected: PASS semua file test.

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/tools.ts packages/llm-adapter/tests/tools.test.ts
git commit -m "feat(llm-adapter): expose create_tree tool to LLM providers"
```

---

### Task 4: Copy UI — SceneRail Layer 2 + chip prompt

**Files:**
- Modify: `apps/web/src/components/SceneRail.tsx`
- Modify: `apps/web/src/components/ChatPanel.tsx`

- [ ] **Step 1: SceneRail** — `LAYER2_TOOLS` tambah entri ketiga:

```tsx
  {
    tn: "create_tree(type, height)",
    comp: "= extrude (batang + kanopi)",
  },
```

- [ ] **Step 2: ChatPanel** — `STARTER_CHIPS` tambah chip keempat:

```tsx
  "Buat pohon pinus setinggi 5 meter",
```

- [ ] **Step 3: Typecheck + test web**

Run: `pnpm --filter @asset-studio/web exec tsc --noEmit && pnpm --filter @asset-studio/web test -- --run`
Expected: clean + PASS (21).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/SceneRail.tsx apps/web/src/components/ChatPanel.tsx
git commit -m "feat(web): surface create_tree in tool rail and starter chips"
```

---

### Task 5: Verifikasi penuh + fix-forward

**Files:**
- Modify: sesuai temuan (harapannya tidak ada)

- [ ] **Step 1: Full gates**

```bash
pnpm -r --filter './packages/*' --filter '@asset-studio/web' exec tsc --noEmit
pnpm -r test
pnpm --filter @asset-studio/web build
```

Expected: typecheck bersih; semua test PASS (110 baseline + 13 baru: 5 template, 2 schema, 3 executor, 3 tools); build 4 halaman statis.

- [ ] **Step 2: Manual golden checklist (browser :3000, provider aktif)**

1. Klik chip baru / prompt *"Buat pohon pinus setinggi 5 meter"* → pohon conifer muncul (batang cokelat + 3 tingkat kanopi hijau mengecil ke atas), ToolCard `create_tree` hijau.
2. Prompt *"Buat pohon rimbun di sebelahnya"* (atau "pohon broadleaf") → varian kedua dengan 2 cakram kanopi.
3. Prompt *"Ubah warna kanopi pohon jadi oranye"* → `set_material` mengenai node canopy.
4. Ctrl+Z dua kali → kedua pohon hilang bertahap (history shared).
5. Export GLB dari Topbar → file terunduh tanpa error.
6. Panel Scene: node `…-trunk`/`…-canopy-*` muncul; tombol trash menghapus satu pohon utuh.

- [ ] **Step 3: Fix-forward jika ada galat** — tulis test reproduksi → perbaiki → jalankan ulang gates. Penyimpangan disengaja ditandai `// ponytail:`.

- [ ] **Step 4: Update memori project state (controller)** — M6 create_tree selesai; sisa menuju v0.1 hanya M7 (eval set + docs) karena export GLB & multi-provider sudah jalan.

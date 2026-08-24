# M7 — Eval Set + Dokumentasi Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lengkapi M7 (milestone terakhir v0.1): eval set `(prompt, expected_tool_call)` sesuai PRD §11.2 sebagai regression test berbayar-opsional, plus dokumentasi portfolio (README + decision log); demo video direkam user sendiri dengan script yang disediakan README.

**Architecture:** Dua bagian. (1) Eval: cases + matcher sebagai modul murni (unit test deterministik, tanpa network), lalu harness live berupa file test vitest yang `describe.skipIf` tanpa env `EVAL_API_KEY` — suite normal tetap offline & gratis; saat prompt/tool schema berubah, jalankan `pnpm --filter @asset-studio/llm-adapter eval` dengan key untuk mengukur akurasi tool-selection (PRD §11.1). (2) Docs: root README.md (belum ada) + docs/DECISIONS.md berisi decision log dari devlog yang tercodifikasi di commit history.

**Tech Stack:** Vitest 2 (harness eval, tanpa dependensi baru — tsx tidak ditambahkan), adapter existing (`createClaudeAdapter`/`createGLMAdapter`/`createN9RouterAdapter`, `TOOL_DEFINITIONS`, `SYSTEM_PROMPT` di packages/llm-adapter/src/tools.ts), TypeScript strict.

---

### Task 1: Eval cases + matcher murni (llm-adapter/src/eval)

**Files:**
- Create: `packages/llm-adapter/src/eval/cases.ts`
- Create: `packages/llm-adapter/src/eval/match.ts`
- Modify: `packages/llm-adapter/src/index.ts`
- Test: `packages/llm-adapter/tests/evalMatch.test.ts`

- [ ] **Step 1: Write the failing tests**

Buat `packages/llm-adapter/tests/evalMatch.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { EVAL_CASES, buildUserMessage } from "../src/eval/cases";
import { evaluateCase, score, type CaseResult } from "../src/eval/match";
import type { ToolCall } from "../src/types";

const tc = (name: string, input: Record<string, unknown>): ToolCall => ({
  id: "x",
  name,
  input,
});

describe("EVAL_CASES", () => {
  it("has 8 cases with unique ids and non-empty prompts", () => {
    expect(EVAL_CASES).toHaveLength(8);
    const ids = EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(8);
    for (const c of EVAL_CASES) expect(c.prompt.length).toBeGreaterThan(0);
  });

  it("expected tools all exist in the real ToolName catalog", () => {
    const known = [
      "extrude",
      "boolean",
      "array",
      "transform",
      "set_material",
      "create_house",
      "create_road",
      "create_tree",
    ];
    for (const c of EVAL_CASES) expect(known).toContain(c.expectedTool);
  });

  it("buildUserMessage appends scene JSON only when present", () => {
    const withScene = EVAL_CASES.find((c) => c.sceneJson);
    const without = EVAL_CASES.find((c) => !c.sceneJson);
    expect(withScene && buildUserMessage(withScene)).toContain("Current scene JSON:");
    expect(without && buildUserMessage(without)).not.toContain("Current scene JSON:");
  });
});

describe("evaluateCase", () => {
  const caseMat = {
    id: "mat",
    prompt: "p",
    expectedTool: "set_material",
    expectArgs: (input: Record<string, unknown>) =>
      typeof input.color === "string" && /^#[0-9a-fA-F]{6}$/.test(input.color),
  };

  it("passes on tool + args match", () => {
    const r = evaluateCase(caseMat, [tc("set_material", { nodeId: "roof-01", color: "#00ff00" })]);
    expect(r.pass).toBe(true);
  });

  it("fails on wrong tool, empty calls, and bad args", () => {
    expect(evaluateCase(caseMat, [tc("transform", {})]).pass).toBe(false);
    expect(evaluateCase(caseMat, []).pass).toBe(false);
    expect(evaluateCase(caseMat, [tc("set_material", { nodeId: "r", color: "green" })]).pass).toBe(false);
  });

  it("reports gotTool for diagnostics", () => {
    const r = evaluateCase(caseMat, [tc("extrude", {})]);
    expect(r.gotTool).toBe("extrude");
  });
});

describe("score", () => {
  it("computes accuracy over results", () => {
    const results: CaseResult[] = [
      { caseId: "a", pass: true },
      { caseId: "b", pass: false },
      { caseId: "c", pass: true },
    ];
    const s = score(results);
    expect(s).toEqual({ passed: 2, total: 3, accuracy: 2 / 3 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run evalMatch`
Expected: FAIL — modul `../src/eval/cases` tidak ditemukan.

- [ ] **Step 3: Write minimal implementation**

Buat `packages/llm-adapter/src/eval/cases.ts`:

```typescript
import type { ToolCall } from "../types";

export interface EvalCase {
  id: string;
  prompt: string;
  expectedTool: string;
  /** Optional arg assertions on the first tool call. */
  expectArgs?: (input: Record<string, unknown>) => boolean;
  /** Scene state appended to the prompt (PRD: model reads scene from user message). */
  sceneJson?: string;
}

const TREE_SCENE = JSON.stringify({
  version: "0.1",
  nodes: [
    {
      id: "tree-01",
      type: "extrude",
      name: "Pohon pinus",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      parameters: { depth: 2, color: "#6b4a2f" },
      children: [
        {
          id: "tree-01-canopy-1",
          type: "extrude",
          name: "Kanopi",
          transform: { position: [0, 2.25, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          parameters: { depth: 1.2, color: "#2f7d3a" },
          children: [],
        },
      ],
    },
  ],
});

const HOUSE_SCENE = JSON.stringify({
  version: "0.1",
  nodes: [
    {
      id: "house-01",
      type: "extrude",
      name: "Rumah",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      parameters: { depth: 6, color: "#d9cbb0" },
      children: [
        {
          id: "house-01-roof",
          type: "extrude",
          name: "Atap",
          transform: { position: [0, 6, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          parameters: { depth: 2, color: "#8b3a2f" },
          children: [],
        },
      ],
    },
  ],
});

const isHexColor = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** PRD §11.2 — regression set; run via tests/eval.live.test.ts when a key is set. */
export const EVAL_CASES: EvalCase[] = [
  {
    id: "house-gable-2f",
    prompt: "Buat rumah 2 lantai dengan atap pelana",
    expectedTool: "create_house",
    expectArgs: (input) => input.floors === 2 && input.roofStyle === "gable",
  },
  {
    id: "road-front",
    prompt: "Buat jalan lurus selebar 3 meter di depan rumah",
    expectedTool: "create_road",
    expectArgs: (input) => input.width === 3,
  },
  {
    id: "tree-conifer-5m",
    prompt: "Buat pohon pinus setinggi 5 meter",
    expectedTool: "create_tree",
    expectArgs: (input) => input.height === 5,
  },
  {
    id: "tree-broadleaf",
    prompt: "Tambahkan pohon rimbun dengan tajuk membulat di sebelah jalan",
    expectedTool: "create_tree",
    expectArgs: (input) => input.type === "broadleaf",
  },
  {
    id: "material-canopy",
    prompt: "Scene saat ini sudah berisi pohon tree-01. Ganti warna kanopinya jadi hijau muda #7cfc00",
    expectedTool: "set_material",
    sceneJson: TREE_SCENE,
    expectArgs: (input) =>
      typeof input.nodeId === "string" && input.nodeId.includes("canopy") && isHexColor(input.color),
  },
  {
    id: "array-four-trees",
    prompt: "Scene saat ini sudah berisi pohon tree-01. Gandakan pohon itu menjadi 4 salinan berjajar",
    expectedTool: "array",
    sceneJson: TREE_SCENE,
    expectArgs: (input) => input.count === 4,
  },
  {
    id: "transform-move-house",
    prompt: "Scene saat ini berisi rumah house-01. Pindahkan rumah itu 3 meter ke kanan",
    expectedTool: "transform",
    sceneJson: HOUSE_SCENE,
    expectArgs: (input) =>
      Array.isArray(input.position) &&
      (input.position as number[]).length === 3 &&
      typeof (input.position as number[])[0] === "number",
  },
  {
    id: "extrude-floor",
    prompt: "Buat lantai teras persegi panjang dari titik asal, cukup sebuah slab datar",
    expectedTool: "extrude",
    expectArgs: (input) => Array.isArray(input.shape) && input.shape.length >= 3,
  },
];

export function buildUserMessage(c: EvalCase): string {
  return c.sceneJson ? `${c.prompt}\n\nCurrent scene JSON:\n${c.sceneJson}` : c.prompt;
}

export type { ToolCall };
```

Buat `packages/llm-adapter/src/eval/match.ts`:

```typescript
import type { EvalCase } from "./cases";
import type { ToolCall } from "../types";

export interface CaseResult {
  caseId: string;
  pass: boolean;
  gotTool?: string;
  reason?: string;
}

/** First tool call must match expectedTool (and optional arg predicate). */
export function evaluateCase(c: EvalCase, toolCalls: ToolCall[]): CaseResult {
  const first = toolCalls[0];
  if (!first) return { caseId: c.id, pass: false, reason: "no tool call" };
  if (first.name !== c.expectedTool) {
    return { caseId: c.id, pass: false, gotTool: first.name, reason: "wrong tool" };
  }
  if (c.expectArgs && !c.expectArgs(first.input)) {
    return { caseId: c.id, pass: false, gotTool: first.name, reason: "args mismatch" };
  }
  return { caseId: c.id, pass: true, gotTool: first.name };
}

export function score(results: CaseResult[]): {
  passed: number;
  total: number;
  accuracy: number;
} {
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  return { passed, total, accuracy: total === 0 ? 0 : passed / total };
}
```

Di `packages/llm-adapter/src/index.ts`, tambah dua baris setelah `export * from "./templates";`:

```typescript
export * from "./eval/cases";
export * from "./eval/match";
```

Catatan: `cases.ts` mengimpor `ToolCall` hanya untuk re-export — jika tidak dipakai lain, HAPUS baris `export type { ToolCall };` beserta import-nya (Task 2 mengimpor `ToolCall` dari `../src/index` yang sudah mengekspornya via `./types`). Jangan sisakan dead export.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run evalMatch`
Expected: PASS (8 test baru). Lalu `pnpm --filter @asset-studio/llm-adapter exec tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/eval packages/llm-adapter/src/index.ts packages/llm-adapter/tests/evalMatch.test.ts
git commit -m "feat(llm-adapter): eval cases and tool-call matcher"
```

---

### Task 2: Harness eval live (env-gated)

**Files:**
- Create: `packages/llm-adapter/tests/eval.live.test.ts`
- Modify: `packages/llm-adapter/package.json` (script `eval`)

- [ ] **Step 1: Write the harness test**

Buat `packages/llm-adapter/tests/eval.live.test.ts`:

```typescript
import { beforeAll, describe, expect, it } from "vitest";
import {
  createClaudeAdapter,
  createGLMAdapter,
  createN9RouterAdapter,
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  type LLMAdapter,
} from "../src/index";
import { EVAL_CASES, buildUserMessage } from "../src/eval/cases";
import { evaluateCase, score, type CaseResult } from "../src/eval/match";

// PRD §11.2: run when SYSTEM_PROMPT or tool schemas change, with a real key.
//   EVAL_PROVIDER=claude|glm|n9router (default claude)
//   EVAL_API_KEY=...  EVAL_MODEL=... (optional override)
// Suite is SKIPPED (green, zero cost) when EVAL_API_KEY is unset.
const RUN = !!process.env.EVAL_API_KEY;
const PROVIDER = (process.env.EVAL_PROVIDER ?? "claude") as
  | "claude"
  | "glm"
  | "n9router";
const MODEL_DEFAULTS: Record<typeof PROVIDER, string> = {
  claude: "claude-sonnet-4-6",
  glm: "glm-4.6",
  n9router: "glm/glm-5.1",
};

const results: CaseResult[] = [];
let adapter: LLMAdapter;

describe.skipIf(!RUN)(`live tool-selection eval (${RUN ? PROVIDER : "skipped"})`, () => {
  beforeAll(() => {
    const apiKey = process.env.EVAL_API_KEY as string;
    const model = process.env.EVAL_MODEL ?? MODEL_DEFAULTS[PROVIDER];
    const tools = TOOL_DEFINITIONS;
    adapter =
      PROVIDER === "claude"
        ? createClaudeAdapter({ apiKey, model, tools })
        : PROVIDER === "glm"
          ? createGLMAdapter({ apiKey, model, tools })
          : createN9RouterAdapter({ apiKey, model, tools });
  });

  for (const c of EVAL_CASES) {
    it(
      `${c.id} → ${c.expectedTool}`,
      async () => {
        const result = await adapter.chat(
          [{ role: "user", content: buildUserMessage(c) }],
          SYSTEM_PROMPT,
        );
        const r = evaluateCase(c, result.toolCalls);
        results.push(r);
        if (!r.pass) {
          console.error(
            `[eval] ${c.id} FAIL (${r.reason}) got=${r.gotTool ?? "-"} ` +
              `calls=${JSON.stringify(result.toolCalls.map((t) => t.name))}`,
          );
        }
        expect(r.pass).toBe(true);
      },
      120_000,
    );
  }

  it("summary: accuracy >= 0.75 (6 of 8)", () => {
    const s = score(results);
    console.table(
      results.map((r) => ({ case: r.caseId, pass: r.pass ? "PASS" : "FAIL", got: r.gotTool ?? r.reason })),
    );
    console.log(`[eval] ${PROVIDER}: ${s.passed}/${s.total} (accuracy ${(s.accuracy * 100).toFixed(0)}%)`);
    expect(s.total).toBe(EVAL_CASES.length);
    expect(s.accuracy).toBeGreaterThanOrEqual(0.75);
  });
});
```

Catatan: `describe.skipIf(cond)` dipanggil sebagai fungsi — `describe.skipIf(!RUN)("name", fn)`. `console.error`/`console.table` di file test adalah bagian harness (bukan production code). Test dalam satu file berjalan sekuensial secara default, jadi `results` terisi berurutan sebelum summary.

- [ ] **Step 2: Verify skip path (offline, tanpa key)**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run`
Expected: semua PASS; suite `live tool-selection eval (skipped)` SKIPPED; total paket = 48 + 8 (Task 1) = 56.

- [ ] **Step 3: Tambah script eval**

Di `packages/llm-adapter/package.json`, bagian `scripts` tambah setelah `"test:watch"`:

```json
    "eval": "vitest run tests/eval.live.test.ts"
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @asset-studio/llm-adapter exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/tests/eval.live.test.ts packages/llm-adapter/package.json
git commit -m "feat(llm-adapter): env-gated live eval harness with accuracy gate"
```

---

### Task 3: README + decision log (dokumentasi portfolio)

**Files:**
- Create: `README.md` (root repo — belum ada, diverifikasi Glob)
- Create: `docs/DECISIONS.md`

- [ ] **Step 1: Tulis README.md**

```markdown
# AI Procedural Asset Studio

Editor aset 3D local-first: buat dan edit scene 3D lewat percakapan natural language. LLM berperan sebagai **orchestrator** yang memanggil tool terstruktur (bukan generator mesh) — setiap objek adalah hasil komposisi primitif geometris yang deterministik, jadi scene selalu bisa di-undo, di-inspect, dan di-export.

> Status: v0.1 — MVP sesuai PRD. Portfolio piece: fokus pada arsitektur AI + tool-calling terstruktur.

## Cara kerja

```
prompt → LLM (tool_call JSON) → Zod validation → Tool Executor → Scene Graph → Three.js viewport
                ↑                                                          |
                └──────────── scene JSON sebagai konteks ronde berikutnya ──┘
```

- **Layer 1 — primitif:** `extrude`, `boolean`, `array`, `transform`, `set_material`
- **Layer 2 — template komposisi:** `create_house`, `create_road`, `create_tree` — dibangun terlihat dari primitif Layer 1, bukan mesh ajaib
- **Undo/history:** full-snapshot per aksi; edit manual (hapus node) dan edit prompt masuk ke stack yang sama (Ctrl+Z / Ctrl+Shift+Z)
- **Provider:** Claude (Anthropic SDK), GLM (OpenAI-compat), 9Router (proxy lokal) — satu antarmuka `LLMAdapter`. API key disimpan di browser, panggilan langsung client → provider.

## Monorepo

| Paket | Isi |
|---|---|
| `packages/schema` | Skema Zod untuk scene JSON & input tool |
| `packages/scene-engine` | Scene graph, tool executor, komposisi template |
| `packages/llm-adapter` | Adapter provider, orchestrator retry loop, eval set |
| `apps/web` | Next.js app: viewport R3F, chat panel, scene rail, topbar |

## Menjalankan

```bash
pnpm install
pnpm --filter @asset-studio/web dev   # http://localhost:3000, isi API key via UI
```

```bash
pnpm -r --filter './packages/*' --filter '@asset-studio/web' exec tsc --noEmit  # typecheck
pnpm -r test                                                          # semua unit test
pnpm --filter @asset-studio/web build                                 # build produksi
```

## Eval set (PRD §11.2)

Regression set 8 prompt `(prompt → expected_tool_call)` di `packages/llm-adapter/src/eval/cases.ts`. Suite test normal **skip** eval live (offline, gratis). Saat mengubah SYSTEM_PROMPT atau tool schema, jalankan dengan key:

```bash
EVAL_PROVIDER=claude EVAL_API_KEY=sk-... pnpm --filter @asset-studio/llm-adapter eval
```

Gate akurasi tool-selection: ≥ 75%. Lihat hasil per-case di output console.

## Demo

Rekam video pendek (±60 detik) dengan script ini di http://localhost:3000:

1. Chip "Buat rumah 2 lantai dengan atap pelana" → rumah muncul, ToolCard hijau.
2. "Buat jalan lurus selebar 3 meter di depan rumah" → jalan.
3. "Buat pohon pinus setinggi 5 meter" → pohon conifer.
4. Klik node di Scene Rail → hapus → Ctrl+Z → kembali.
5. Export GLB dari Topbar → file terunduh.

## Batasan v1 (disengaja)

- End cap atap gable terbuka (tanpa infill segitiga)
- Jalan melengkung belum didukung (hanya segmen pertama path)
- Scene JSON dikirim penuh tiap ronde (tanpa truncation)
- `create_tree` re-invocation mengganti semua node dengan prefix `{id}-`; id yang merupakan prefix id lain (mis. `tree` vs `tree-big`) dapat saling menimpa

Arsitektur & tradeoff: lihat [docs/DECISIONS.md](docs/DECISIONS.md). Rencana per milestone: `docs/superpowers/plans/`.
```

- [ ] **Step 2: Tulis docs/DECISIONS.md**

```markdown
# Decision Log

Keputusan arsitektur yang membentuk v0.1, urut kronologis. Format: konteks → keputusan → konsekuensi.

## D1 — LLM sebagai orchestrator, bukan generator mesh
**Konteks:** produk sejenis (Meshy/Tripo) generate mesh langsung; kualitas visual bagus tapi hasilnya black box.
**Keputusan:** LLM hanya mengeluarkan tool_call terstruktur; geometri dibangun primitif deterministik.
**Konsekuensi:** scene inspectable + undo-able, render deterministik; kualitas organic dibatasi kemampuan primitif (lihat `create_tree` sebagai batas atas PoC).

## D2 — Manual SDK, bukan Vercel AI SDK
**Konteks:** PRD §6.4 meminta Unified LLM Adapter Layer terlihat engineering depth-nya.
**Keputusan:** `@anthropic-ai/sdk` manual untuk Claude; `openai` SDK untuk GLM & 9Router (endpoint OpenAI-compat); antarmuka tunggal `LLMAdapter.chat(messages, systemPrompt)`.
**Konsekuensi:** lebih banyak glue code; kontrol penuh atas retry, timeout, dan bentuk `ChatResult` — dipakai ulang oleh eval harness tanpa layer tambahan.

## D3 — API key client-side + localStorage
**Konteks:** local-first, tanpa backend proxy.
**Keputusan:** panggilan langsung browser → provider; key di localStorage, tidak pernah dikirim ke server lain.
**Konsekuensi:** nol biaya infrastruktur; CORS ditangani `dangerouslyAllowBrowser` per SDK; bukan pola untuk app multi-user production.

## D4 — Ekstrusi dulu (flat shape → depth)
**Konteks:** butuh primitif geometris yang murah dan bisa dikomposisikan.
**Keputusan:** semua solid v0.1 lahir dari `extrude` (footprint 2D + kedalaman); boolean CSG untuk modifikasi.
**Konsekuensi:** bentuk tersusun dari prisma poligon — estetika low-poly konsisten; permukaan bebas (spline) out of scope.

## D5 — Undo full-snapshot, custom stack (deviasi PRD §6.4)
**Konteks:** PRD mengusulkan middleware `zundo`.
**Keputusan:** stack `history`/`future` manual di `sceneStore`, label per aksi (`delete:{id}`, dsb.); edit manual UI dan edit prompt masuk stack yang sama.
**Konsekuensi:** memori per aksi lebih besar tapi implementasi ~30 baris tanpa dependensi; undo/redo keyboard global jadi trivial.

## D6 — Retry policy milik orchestrator
**Konteks:** tool_call LLM kadang invalid (arg menyalahi skema).
**Keputusan:** retry SDK dimatikan (`sdkMaxRetries: 0`); `runWithRetry` memberi feedback error validasi kembali ke model, maks 2 retry, maks 6 ronde tool.
**Konsekuensi:** satu tempat kebijakan; limit prompt `maxTokens: 1024` (GLM memotong arg JSON di 512).

## D7 — Template Layer 2 = komposisi terlihat, id deterministik
**Konteks:** objek dikenali (rumah/jalan/pohon) harus tetap "dibangun dari primitif".
**Keputusan:** template memancarkan node `${id}-{part}`; re-invocation mengganti (upsert), bukan menambah.
**Konsekuensi:** scene idempotent by id; `create_tree` sedikit menyimpang (prefix-replacement, lihat D8) karena jumlah node beda antar varian.

## D8 — create_tree: prefix-replacement, bukan exact upsert
**Konteks:** conifer = 4 node, broadleaf = 3; exact-ID upsert meninggalkan `canopy-3` yatim saat ganti varian.
**Keputusan:** case `create_tree` menghapus semua node ber-prefix `${id}-` sebelum append (scoped hanya di case ini).
**Konsekuensi:** ganti varian bersih; edge case id bersarang (`tree` vs `tree-big`) bisa saling menimpa — dicatat sebagai batasan v1.

## D9 — Eval set sebagai test env-gated
**Konteks:** PRD §11.2 minta regression set prompt→tool_call, tapi panggilan LLM berbayar & non-deterministik.
**Keputusan:** matcher murni (unit test gratis); harness live `describe.skipIf(!EVAL_API_KEY)` dengan gate akurasi 75%.
**Konsekuensi:** suite harian tetap offline; mengukur regresi prompt/schema jadi perintah eksplisit satu baris.
```

- [ ] **Step 3: Verifikasi path + commit**

Run: `ls README.md docs/DECISIONS.md` → kedua file ada. Path yang dirujuk README valid: `docs/DECISIONS.md`, `packages/llm-adapter/src/eval/cases.ts`.

```bash
git add README.md docs/DECISIONS.md
git commit -m "docs: portfolio README and architecture decision log"
```

---

### Task 4: Verifikasi penuh + eval live + fix-forward

**Files:**
- Modify: sesuai temuan (harapannya tidak ada)

- [ ] **Step 1: Full gates (offline)**

```bash
pnpm -r --filter './packages/*' --filter '@asset-studio/web' exec tsc --noEmit
pnpm -r test
pnpm --filter @asset-studio/web build
```

Expected: typecheck clean; test PASS (baseline 123 + 8 evalMatch = 131; suite eval.live SKIPPED, tidak menambah hitung test); build 4 halaman statis.

- [ ] **Step 2: Eval live dengan key asli (user)**

User menjalankan (atau berikan key via env ke asisten):

```bash
EVAL_PROVIDER=claude EVAL_API_KEY=<key> pnpm --filter @asset-studio/llm-adapter eval
```

Expected: 8 case dijalankan, tabel hasil, akurasi ≥ 75%. Jika ada case FAIL karena nondeterminisme ringan (mis. `type: "broadleaf"` tidak dikirim model), perbaiki PROMPT kasusnya (pertegas kata kunci), bukan melonggarkan assert — lalu jalankan ulang.

- [ ] **Step 3: Fix-forward jika ada galat**

Reproduksi → test → perbaiki → gates ulang. Penyimpangan disengaja ditandai `// ponytail:`.

- [ ] **Step 4: Final review + update memori (controller)**

Review subagent untuk keseluruhan M7; update `project_state.md`: M7 selesai, v0.1 lengkap (M1-M7; Ollama tertunda), cara menjalankan eval, sisa opsional (demo video oleh user).

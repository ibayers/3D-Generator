# M8 — Karakter dari Gambar (Fase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foto karakter → LLM vision (glm-4.5v) memanggil `create_character` → humanoid low-poly dari primitif extrude, sesuai spec `docs/superpowers/specs/2026-08-24-character-from-image-design.md`.

**Architecture:** Tiga lapis: (1) adapter — `ChatMessage` dapat `images?`, tiga wrapper OpenAI-compat disatukan jadi `createOpenAICompatAdapter` (refactor yang diantisipasi komentar ponytail n9router.ts), provider baru `glm-vision` (endpoint standard Z.ai); (2) tool — template `create_character` root+children (torso root, 6 children) sehingga trash/undo bekerja per-karakter dan upsert exact-ID bersih; (3) UI — provider keempat + paperclip yang hanya aktif untuk provider `supportsImages` + chip preview + validasi 5 MB.

**Tech Stack:** pnpm monorepo, TypeScript strict, Zod, Vitest 2 (mock OpenAI SDK), Zustand 5, React 19/Next 16. Tanpa dependensi baru.

---

## Riset kunci (dibaca oleh controller; implementer tidak perlu membaca ulang)

- `glm.ts` & `n9router.ts` identik kecuali baseURL + pesan error (`GLM chat failed:` / `9Router chat failed:`). Test `tests/glm.test.ts` (6 test) mem-mock `openai` dan **meng-assert wire format pesan plain-string** (`messages: [{role:"system",content:...},{role:"user",content:"go"}]`) — mapper unified HARUS menghasilkan string content saat tidak ada gambar.
- `runWithRetry` (orchestrator.ts:32) menerima `userPrompt: string` — perlu field opsional `userImages?: string[]` untuk pesan user pertama (deviasi kecil dari spec "orchestrator tidak berubah"; passthrough saja).
- SceneNode template pattern (createTree.ts): `parameters: { shape, depth }`, `material: { color }`, `transform.position` offset world. Viewport merender `node.children` rekursif (Viewport.tsx:147); `deleteNode` rekursif.
- llmStore/ChatPanel/Topbar memakai `Record<Provider, ...>` — menambah `'glm-vision'` ke union memaksa semua Record diperbarui (compiler sebagai checklist). Web app pakai single quotes; llm-adapter pakai double quotes.
- Eval: `EVAL_CASES` 8 case; `evalMatch.test.ts` meng-assert `toHaveLength(8)` → update ke 9; deskripsi gate live "(6 of 8)" → "(7 of 9)" (0.75×9=6.75 → butuh 7).

---

### Task 1: Unifikasi OpenAI-compat + `ChatMessage.images` + `userImages` orchestrator

**Files:**
- Modify: `packages/llm-adapter/src/types.ts`
- Create: `packages/llm-adapter/src/openaiCompat.ts`
- Modify: `packages/llm-adapter/src/glm.ts`, `packages/llm-adapter/src/n9router.ts`
- Modify: `packages/llm-adapter/src/orchestrator.ts`
- Test: `packages/llm-adapter/tests/openaiCompat.test.ts` (baru)

- [ ] **Step 1: Write the failing tests** — buat `packages/llm-adapter/tests/openaiCompat.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOpenAICompatAdapter } from "../src/openaiCompat";

vi.mock("openai", () => {
  const create = vi.fn();
  return {
    default: class MockOpenAI {
      chat = { completions: { create } };
    },
    __mockCreate: create,
  };
});

import { __mockCreate } from "openai";

const okResponse = {
  choices: [
    { finish_reason: "stop", message: { role: "assistant", content: "ok", tool_calls: null } },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
};

describe("createOpenAICompatAdapter message mapping", () => {
  beforeEach(() => {
    __mockCreate.mockReset();
  });

  it("keeps plain string content when the message has no images", async () => {
    __mockCreate.mockResolvedValueOnce(okResponse);
    const adapter = createOpenAICompatAdapter({
      apiKey: "k",
      model: "m",
      tools: [],
      baseURL: "https://example.test/v1",
      label: "Test",
    });
    await adapter.chat([{ role: "user", content: "go" }], "sys");
    const callArg = __mockCreate.mock.calls[0]![0];
    expect(callArg.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "go" },
    ]);
  });

  it("maps images to OpenAI multimodal content parts", async () => {
    __mockCreate.mockResolvedValueOnce(okResponse);
    const adapter = createOpenAICompatAdapter({
      apiKey: "k",
      model: "m",
      tools: [],
      baseURL: "https://example.test/v1",
      label: "Test",
    });
    await adapter.chat(
      [{ role: "user", content: "like this", images: ["data:image/png;base64,QUJD"] }],
      "sys",
    );
    const callArg = __mockCreate.mock.calls[0]![0];
    expect(callArg.messages).toEqual([
      { role: "system", content: "sys" },
      {
        role: "user",
        content: [
          { type: "text", text: "like this" },
          { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
        ],
      },
    ]);
  });

  it("wraps SDK errors with the adapter label", async () => {
    __mockCreate.mockRejectedValueOnce(new Error("boom"));
    const adapter = createOpenAICompatAdapter({
      apiKey: "k",
      model: "m",
      tools: [],
      baseURL: "https://example.test/v1",
      label: "Test",
    });
    await expect(adapter.chat([{ role: "user", content: "x" }], "s")).rejects.toThrow(
      /Test chat failed: boom/,
    );
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run openaiCompat`
Expected: FAIL — modul `../src/openaiCompat` tidak ditemukan.

- [ ] **Step 3: Implement**

`packages/llm-adapter/src/types.ts` — tambah field ke `ChatMessage`:

```typescript
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Data-URL gambar (opsional) — dipetakan adapter yang mendukung multimodal. */
  images?: string[];
}
```

Buat `packages/llm-adapter/src/openaiCompat.ts`:

```typescript
import OpenAI from "openai";
import { ADAPTER_DEFAULTS } from "./defaults";
import type { ChatMessage, ChatResult, LLMAdapter } from "./types";
import type { ToolDefinition } from "./tools";

export interface OpenAICompatOptions {
  apiKey: string;
  model: string;
  tools: ToolDefinition[];
  baseURL: string;
  maxTokens?: number;
  /** Error prefix, e.g. "GLM" — preserves each adapter's historical message. */
  label: string;
}

// ponytail: SDK's ChatCompletionMessageParam is stricter than the wire format
// we produce; we cast at the boundary rather than importing SDK domain types.
type OpenAIMessage = { role: string; content: unknown };
type OpenAITool = {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
};

const FINISH_REASON_MAP: Record<string, string> = {
  stop: "end_turn",
  tool_calls: "tool_use",
  length: "max_tokens",
};

function toOpenAITools(tools: ToolDefinition[]): OpenAITool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

/** Plain string when no images (wire-compatible with the old adapters);
 * multimodal parts when present. */
export function toOpenAIMessage(m: ChatMessage): OpenAIMessage {
  if (!m.images || m.images.length === 0) {
    return { role: m.role, content: m.content };
  }
  return {
    role: m.role,
    content: [
      { type: "text", text: m.content },
      ...m.images.map((url) => ({ type: "image_url", image_url: { url } })),
    ],
  };
}

export function createOpenAICompatAdapter(opts: OpenAICompatOptions): LLMAdapter {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    dangerouslyAllowBrowser: true,
    timeout: ADAPTER_DEFAULTS.timeoutMs,
    maxRetries: ADAPTER_DEFAULTS.sdkMaxRetries,
  });
  const maxTokens = opts.maxTokens ?? ADAPTER_DEFAULTS.maxTokens;

  return {
    async chat(
      messages: ChatMessage[],
      systemPrompt: string,
    ): Promise<ChatResult> {
      try {
        const openaiMessages: OpenAIMessage[] = [
          { role: "system", content: systemPrompt },
          ...messages.map(toOpenAIMessage),
        ];

        const response = await client.chat.completions.create({
          model: opts.model,
          max_tokens: maxTokens,
          messages: openaiMessages as never,
          tools: toOpenAITools(opts.tools) as never,
        });

        const choice = response.choices[0];
        const message = choice?.message;
        const finishReason = String(choice?.finish_reason ?? "stop");
        const stopReason = FINISH_REASON_MAP[finishReason] ?? finishReason;

        const textContent =
          typeof message?.content === "string" ? message.content : "";
        const toolCalls: ChatResult["toolCalls"] = [];

        for (const tc of message?.tool_calls ?? []) {
          const fn = (
            tc as { function?: { name?: string; arguments?: string } }
          ).function;
          if (!fn) continue;
          let parsedInput: Record<string, unknown> = {};
          try {
            parsedInput = fn.arguments ? JSON.parse(fn.arguments) : {};
          } catch {
            // ponytail: malformed arguments become empty object; orchestrator's
            // applyToolCall will reject with a descriptive Zod error.
            parsedInput = {};
          }
          toolCalls.push({
            id: String((tc as { id?: string }).id ?? ""),
            name: String(fn.name ?? ""),
            input: parsedInput,
          });
        }

        return {
          content: textContent,
          toolCalls,
          stopReason,
          rawUsage: {
            inputTokens: (response.usage?.prompt_tokens as number) ?? 0,
            outputTokens: (response.usage?.completion_tokens as number) ?? 0,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${opts.label} chat failed: ${msg}`);
      }
    },
  };
}
```

`packages/llm-adapter/src/glm.ts` — ganti SELURUH isi menjadi:

```typescript
import { createOpenAICompatAdapter } from "./openaiCompat";
import type { LLMAdapter } from "./types";
import type { ToolDefinition } from "./tools";

export interface GLMAdapterOptions {
  apiKey: string;
  model: string;
  tools: ToolDefinition[];
  maxTokens?: number;
  baseURL?: string;
}

// ponytail: Z.ai has two endpoints with SEPARATE billing:
//   - Standard API:  https://api.z.ai/api/paas/v4/         (pay-as-you-go credits)
//   - Coding Plan:   https://api.z.ai/api/coding/paas/v4/  (monthly subscription)
// Default here is Coding Plan because that's the common subscription path; pass
// `baseURL` to override. Vision lives on Standard — see glmVision.ts.
const GLM_CODING_PLAN_BASE_URL = "https://api.z.ai/api/coding/paas/v4/";

export function createGLMAdapter(opts: GLMAdapterOptions): LLMAdapter {
  return createOpenAICompatAdapter({
    ...opts,
    baseURL: opts.baseURL ?? GLM_CODING_PLAN_BASE_URL,
    label: "GLM",
  });
}
```

`packages/llm-adapter/src/n9router.ts` — ganti SELURUH isi menjadi:

```typescript
import { createOpenAICompatAdapter } from "./openaiCompat";
import type { LLMAdapter } from "./types";
import type { ToolDefinition } from "./tools";

export interface N9RouterAdapterOptions {
  apiKey: string;
  model: string;
  tools: ToolDefinition[];
  maxTokens?: number;
  baseURL?: string;
}

// 9Router is a local proxy (default http://localhost:20128/v1) exposing an
// OpenAI-compatible endpoint with smart fallback across 40+ upstream providers.
const N9ROUTER_DEFAULT_BASE_URL = "http://localhost:20128/v1";

export function createN9RouterAdapter(
  opts: N9RouterAdapterOptions,
): LLMAdapter {
  return createOpenAICompatAdapter({
    ...opts,
    baseURL: opts.baseURL ?? N9ROUTER_DEFAULT_BASE_URL,
    label: "9Router",
  });
}
```

`packages/llm-adapter/src/orchestrator.ts` — di `RunWithRetryOptions` tambah setelah `userPrompt: string;`:

```typescript
  /** Data-URL images attached to the FIRST user message (vision providers). */
  userImages?: string[];
```

Dan di awal `runWithRetry`, ganti deklarasi `messages`:

```typescript
  const messages: ChatMessage[] = [
    { role: "user", content: opts.userPrompt, images: opts.userImages },
  ];
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run`
Expected: PASS semua — **test glm.test.ts & n9router lama hijau tanpa perubahan** (bukti refactor menjaga perilaku) + 3 test openaiCompat baru. `pnpm --filter @asset-studio/llm-adapter exec tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/openaiCompat.ts packages/llm-adapter/src/glm.ts packages/llm-adapter/src/n9router.ts packages/llm-adapter/src/types.ts packages/llm-adapter/src/orchestrator.ts packages/llm-adapter/tests/openaiCompat.test.ts
git commit -m "refactor(llm-adapter): unify OpenAI-compat adapters, add message images"
```

---

### Task 2: Provider `glm-vision` (glm-4.5v, endpoint standard Z.ai)

**Files:**
- Create: `packages/llm-adapter/src/glmVision.ts`
- Modify: `packages/llm-adapter/src/index.ts`
- Test: `packages/llm-adapter/tests/glmVision.test.ts` (baru)

- [ ] **Step 1: Write the failing tests** — buat `packages/llm-adapter/tests/glmVision.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGLMVisionAdapter } from "../src/glmVision";

vi.mock("openai", () => {
  const create = vi.fn();
  return {
    default: class MockOpenAI {
      chat = { completions: { create } };
    },
    __mockCreate: create,
  };
});

import OpenAI from "openai";
import { __mockCreate } from "openai";

const okResponse = {
  choices: [
    { finish_reason: "stop", message: { role: "assistant", content: "ok", tool_calls: null } },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
};

describe("createGLMVisionAdapter", () => {
  beforeEach(() => {
    __mockCreate.mockReset();
  });

  it("constructs the client against the Z.ai STANDARD endpoint", async () => {
    __mockCreate.mockResolvedValueOnce(okResponse);
    const adapter = createGLMVisionAdapter({
      apiKey: "zai-std",
      model: "glm-4.5v",
      tools: [],
    });
    await adapter.chat([{ role: "user", content: "hi" }], "s");
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "zai-std", baseURL: "https://api.z.ai/api/paas/v4/" }),
    );
  });

  it("sends multimodal parts for image messages", async () => {
    __mockCreate.mockResolvedValueOnce(okResponse);
    const adapter = createGLMVisionAdapter({
      apiKey: "zai-std",
      model: "glm-4.5v",
      tools: [],
    });
    await adapter.chat(
      [{ role: "user", content: "like this", images: ["data:image/jpeg;base64,QUJD"] }],
      "s",
    );
    const callArg = __mockCreate.mock.calls[0]![0];
    expect(callArg.messages[1]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "like this" },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD" } },
      ],
    });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run glmVision`
Expected: FAIL — modul tidak ditemukan.

- [ ] **Step 3: Implement** — buat `packages/llm-adapter/src/glmVision.ts`:

```typescript
import { createOpenAICompatAdapter } from "./openaiCompat";
import type { LLMAdapter } from "./types";
import type { ToolDefinition } from "./tools";

export interface GLMVisionAdapterOptions {
  apiKey: string;
  model: string;
  tools: ToolDefinition[];
  maxTokens?: number;
  baseURL?: string;
}

// Z.ai STANDARD API (pay-as-you-go) — separate billing from the Coding Plan
// used by glm.ts. Vision models (glm-4.5v) live here.
const GLM_STANDARD_BASE_URL = "https://api.z.ai/api/paas/v4/";

export function createGLMVisionAdapter(opts: GLMVisionAdapterOptions): LLMAdapter {
  return createOpenAICompatAdapter({
    ...opts,
    baseURL: opts.baseURL ?? GLM_STANDARD_BASE_URL,
    label: "GLM Vision",
  });
}
```

Di `packages/llm-adapter/src/index.ts`, tambah setelah `export * from "./glm";`:

```typescript
export * from "./glmVision";
export * from "./openaiCompat";
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run` → PASS (semua sebelumnya + 2 baru). `exec tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/glmVision.ts packages/llm-adapter/src/index.ts packages/llm-adapter/tests/glmVision.test.ts
git commit -m "feat(llm-adapter): glm-vision provider on Z.ai standard endpoint"
```

---

### Task 3: Schema `createCharacterToolInputSchema`

**Files:**
- Modify: `packages/schema/src/toolSchemas.ts`
- Test: `packages/schema/tests/toolSchemas.test.ts`

- [ ] **Step 1: Write the failing tests** — tambah di akhir `packages/schema/tests/toolSchemas.test.ts` (tambahkan `createCharacterToolInputSchema` ke import yang ada dari `../src/toolSchemas`):

```typescript
describe('createCharacterToolInputSchema', () => {
  it('accepts a minimal valid input', () => {
    const parsed = createCharacterToolInputSchema.safeParse({
      id: 'char-01',
      position: [0, 0, 2],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown build and bad height', () => {
    const badBuild = createCharacterToolInputSchema.safeParse({
      id: 'c',
      position: [0, 0, 0],
      build: 'round',
    });
    expect(badBuild.success).toBe(false);
    const badHeight = createCharacterToolInputSchema.safeParse({
      id: 'c',
      position: [0, 0, 0],
      height: -1,
    });
    expect(badHeight.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @asset-studio/schema test -- --run`
Expected: FAIL — `createCharacterToolInputSchema` tidak diekspor.

- [ ] **Step 3: Implement** — di `packages/schema/src/toolSchemas.ts`, setelah blok `createTreeToolInputSchema` + typenya:

```typescript
export const createCharacterToolInputSchema = z.object({
  id: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  /** Total height in meters; default 1.7, clamped to [0.5, 3] in the template. */
  height: z.number().positive().optional(),
  /** Default "regular". */
  build: z.enum(['slim', 'regular', 'stocky']).optional(),
  skinColor: z.string().optional(),
  shirtColor: z.string().optional(),
  pantsColor: z.string().optional(),
  hairColor: z.string().optional(),
});
export type CreateCharacterToolInput = z.infer<typeof createCharacterToolInputSchema>;
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @asset-studio/schema test -- --run` → PASS (7 + 2 = 9).

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/toolSchemas.ts packages/schema/tests/toolSchemas.test.ts
git commit -m "feat(schema): create_character tool input schema"
```

---

### Task 4: Template `createCharacter` (root + children)

**Files:**
- Create: `packages/llm-adapter/src/templates/createCharacter.ts`
- Modify: `packages/llm-adapter/src/templates/index.ts`
- Test: `packages/llm-adapter/tests/templates.test.ts`

- [ ] **Step 1: Write the failing tests** — tambah di akhir `packages/llm-adapter/tests/templates.test.ts` (tambah `applyCreateCharacter` ke import dari `../src/templates`):

```typescript
describe('applyCreateCharacter', () => {
  const EMPTY = { nodes: [] };

  it('emits one root (torso) with six children', () => {
    const { newNodes } = applyCreateCharacter(
      { id: 'char-01', position: [0, 0, 0] },
      EMPTY,
    );
    expect(newNodes).toHaveLength(1);
    const root = newNodes[0]!;
    expect(root.id).toBe('char-01');
    expect(root.children.map((c) => c.id).sort()).toEqual([
      'char-01-arm-l',
      'char-01-arm-r',
      'char-01-hair',
      'char-01-head',
      'char-01-leg-l',
      'char-01-leg-r',
    ]);
  });

  it('keeps every part within [0, height] for all builds', () => {
    for (const build of ['slim', 'regular', 'stocky'] as const) {
      const h = 1.7;
      const { newNodes } = applyCreateCharacter(
        { id: 'c', position: [0, 0, 0], height: h, build },
        EMPTY,
      );
      const parts = [newNodes[0]!, ...newNodes[0]!.children];
      for (const p of parts) {
        const base = p.transform.position[1] as number;
        const depth = p.parameters.depth as number;
        expect(base).toBeGreaterThanOrEqual(0);
        expect(base + depth).toBeLessThanOrEqual(h + 1e-9);
      }
    }
  });

  it('applies default colors per part and honors overrides', () => {
    const def = applyCreateCharacter({ id: 'c', position: [0, 0, 0] }, EMPTY);
    const rootDef = def.newNodes[0]!;
    const byId = (id: string) =>
      [rootDef, ...rootDef.children].find((n) => n.id === id)!;
    expect(byId('c').material?.color).toBe('#4a6fa5'); // shirt torso
    expect(byId('c-leg-l').material?.color).toBe('#2f3b4c');
    expect(byId('c-head').material?.color).toBe('#e0ac69');
    expect(byId('c-hair').material?.color).toBe('#3b2a20');

    const custom = applyCreateCharacter(
      { id: 'c', position: [0, 0, 0], shirtColor: '#ff0000' },
      EMPTY,
    );
    expect(custom.newNodes[0]!.material?.color).toBe('#ff0000');
  });

  it('clamps height into [0.5, 3]', () => {
    const tall = applyCreateCharacter({ id: 'c', position: [0, 0, 0], height: 99 }, EMPTY);
    expect(tall.newNodes[0]!.parameters.depth as number).toBeCloseTo(3 * 0.32, 5);
    const tiny = applyCreateCharacter({ id: 'c', position: [0, 0, 0], height: 0.01 }, EMPTY);
    expect(tiny.newNodes[0]!.parameters.depth as number).toBeCloseTo(0.5 * 0.32, 5);
  });

  it('widens torso by build', () => {
    const slim = applyCreateCharacter({ id: 'c', position: [0, 0, 0], build: 'slim' }, EMPTY);
    const stocky = applyCreateCharacter({ id: 'c', position: [0, 0, 0], build: 'stocky' }, EMPTY);
    const w = (r: { newNodes: SceneNode[] }) => {
      const shape = r.newNodes[0]!.parameters.shape as [number, number][];
      return shape[1]![0]! - shape[0]![0]!;
    };
    expect(w(stocky)).toBeGreaterThan(w(slim));
  });
});
```

(Tambahkan `import type { SceneNode } from '@asset-studio/scene-engine';` di test file bila belum ada.)

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run templates`
Expected: FAIL — `applyCreateCharacter` tidak diekspor.

- [ ] **Step 3: Implement** — buat `packages/llm-adapter/src/templates/createCharacter.ts`:

```typescript
import type { SceneNode, Vec3 } from "@asset-studio/scene-engine";
import type { CreateCharacterToolInput } from "@asset-studio/schema";

export type { CreateCharacterToolInput };

export interface CreateCharacterResult {
  newNodes: SceneNode[];
}

const DEFAULT_HEIGHT = 1.7;
const MIN_HEIGHT = 0.5;
const MAX_HEIGHT = 3;
const SKIN_DEFAULT = "#e0ac69";
const SHIRT_DEFAULT = "#4a6fa5";
const PANTS_DEFAULT = "#2f3b4c";
const HAIR_DEFAULT = "#3b2a20";

// Vertical proportions (fractions of total height h).
const LEG_H = 0.45;
const TORSO_H = 0.32;
const ARM_H = 0.34;
const ARM_TOP = 0.75; // arms hang from the shoulder line
const HEAD_BASE = 0.78;
const HEAD_H = 1 / 7; // classic 7-head canon
const HAIR_BASE = 0.9;
const HAIR_H = 0.05;

// Widths (fractions of h) per build.
const TORSO_W: Record<"slim" | "regular" | "stocky", number> = {
  slim: 0.16,
  regular: 0.2,
  stocky: 0.26,
};
const HEAD_W = 0.13;
const HEAD_D = 0.12;

type XY = [number, number];

/** Centered rectangle footprint — shape-local coords; world offset comes from
 * transform.position (same contract as the other templates). */
function rect(w: number, d: number): XY[] {
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
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
 * ponytail: root + children (NOT flat siblings like create_tree) so the rail,
 * deleteNode (recursive), and hide all treat the character as one object —
 * and a single root makes exact-id upsert sufficient (no prefix replacement).
 */
export function applyCreateCharacter(
  input: CreateCharacterToolInput,
  _scene: { nodes: SceneNode[] }
): CreateCharacterResult {
  const build = input.build ?? "regular";
  const h = Math.min(
    Math.max(input.height ?? DEFAULT_HEIGHT, MIN_HEIGHT),
    MAX_HEIGHT,
  );
  const [px, py, pz] = input.position;
  const skin = input.skinColor ?? SKIN_DEFAULT;
  const shirt = input.shirtColor ?? SHIRT_DEFAULT;
  const pants = input.pantsColor ?? PANTS_DEFAULT;
  const hair = input.hairColor ?? HAIR_DEFAULT;

  const torsoW = TORSO_W[build] * h;
  const torsoD = torsoW * 0.55;
  const legW = torsoW * 0.32;
  const legD = torsoD * 0.9;
  const armW = torsoW * 0.26;
  const armD = torsoD * 0.7;
  const legX = legW / 2 + torsoW * 0.06;
  const armX = torsoW / 2 + armW / 2 + h * 0.01;

  const legL = extrudeNode(
    `${input.id}-leg-l`,
    rect(legW, legD),
    LEG_H * h,
    pants,
    [px - legX, py, pz]
  );
  const legR = extrudeNode(
    `${input.id}-leg-r`,
    rect(legW, legD),
    LEG_H * h,
    pants,
    [px + legX, py, pz]
  );
  const armL = extrudeNode(
    `${input.id}-arm-l`,
    rect(armW, armD),
    ARM_H * h,
    skin,
    [px - armX, py + (ARM_TOP - ARM_H) * h, pz]
  );
  const armR = extrudeNode(
    `${input.id}-arm-r`,
    rect(armW, armD),
    ARM_H * h,
    skin,
    [px + armX, py + (ARM_TOP - ARM_H) * h, pz]
  );
  const head = extrudeNode(
    `${input.id}-head`,
    rect(HEAD_W * h, HEAD_D * h),
    HEAD_H * h,
    skin,
    [px, py + HEAD_BASE * h, pz]
  );
  const hair = extrudeNode(
    `${input.id}-hair`,
    rect(HEAD_W * h * 1.15, HEAD_D * h * 1.15),
    HAIR_H * h,
    hair,
    [px, py + HAIR_BASE * h, pz]
  );

  const root: SceneNode = {
    ...extrudeNode(
      input.id,
      rect(torsoW, torsoD),
      TORSO_H * h,
      shirt,
      [px, py + LEG_H * h, pz]
    ),
    children: [legL, legR, armL, armR, head, hair],
  };

  return { newNodes: [root] };
}
```

Di `packages/llm-adapter/src/templates/index.ts` tambah: `export * from "./createCharacter";`

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run templates` → PASS (existing + 5 baru). `exec tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/templates/createCharacter.ts packages/llm-adapter/src/templates/index.ts packages/llm-adapter/tests/templates.test.ts
git commit -m "feat(llm-adapter): create_character template as root+children extrudes"
```

---

### Task 5: Executor `create_character`

**Files:**
- Modify: `packages/scene-engine/src/tools/types.ts`
- Modify: `packages/scene-engine/src/tools/toolExecutor.ts`
- Test: `packages/scene-engine/tests/templates.test.ts`

- [ ] **Step 1: Write the failing tests** — tambah di akhir `packages/scene-engine/tests/templates.test.ts`:

```typescript
describe('create_character', () => {
  it('adds one root node carrying six children', () => {
    const result = executeToolCall(EMPTY_SCENE, {
      name: 'create_character',
      input: { id: 'char-01', position: [1, 0, 1], height: 1.75 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.nodes).toHaveLength(1);
    expect(result.scene.nodes[0]!.children).toHaveLength(6);
  });

  it('upserts by id — re-invocation replaces, not appends', () => {
    const first = executeToolCall(EMPTY_SCENE, {
      name: 'create_character',
      input: { id: 'char-01', position: [0, 0, 0] },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = executeToolCall(first.scene, {
      name: 'create_character',
      input: { id: 'char-01', position: [0, 0, 0], build: 'stocky' },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.scene.nodes).toHaveLength(1);
  });

  it('rejects invalid build with INVALID_INPUT', () => {
    const result = executeToolCall(EMPTY_SCENE, {
      name: 'create_character',
      input: { id: 'c', position: [0, 0, 0], build: 'round' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });
});
```

(Sesuaikan `EMPTY_SCENE` dengan nama fixture lokal file tersebut.)

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @asset-studio/scene-engine test -- --run templates`
Expected: FAIL — default case `Unknown tool`.

- [ ] **Step 3: Implement**

`packages/scene-engine/src/tools/types.ts` — union `ToolName` tambah `| 'create_character';` (setelah `'create_tree'`).

`packages/scene-engine/src/tools/toolExecutor.ts` — gabungkan `applyCreateCharacter` ke import `@asset-studio/llm-adapter` dan `createCharacterToolInputSchema` ke import `@asset-studio/schema`. Tambah case setelah `create_tree`:

```typescript
    case 'create_character': {
      const parsed = createCharacterToolInputSchema.safeParse(call.input);
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: parsed.error.message },
        };
      }
      const result = applyCreateCharacter(parsed.data, scene);
      // Single root node — exact-id upsert is sufficient (unlike create_tree,
      // whose variants emit different child counts).
      return {
        ok: true,
        scene: { ...scene, nodes: upsertNodes(scene.nodes, result.newNodes) },
      };
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @asset-studio/scene-engine test -- --run` → PASS (47 + 3 = 50). `exec tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/scene-engine/src/tools/types.ts packages/scene-engine/src/tools/toolExecutor.ts packages/scene-engine/tests/templates.test.ts
git commit -m "feat(scene-engine): execute create_character tool"
```

---

### Task 6: Definisi tool + system prompt (llm-adapter/tools.ts)

**Files:**
- Modify: `packages/llm-adapter/src/tools.ts`
- Test: `packages/llm-adapter/tests/tools.test.ts`

- [ ] **Step 1: Write the failing tests** — tambah di `packages/llm-adapter/tests/tools.test.ts`:

```typescript
describe("create_character definition", () => {
  const character = TOOL_DEFINITIONS.find((t) => t.name === "create_character");

  it("exists with required fields", () => {
    expect(character).toBeDefined();
    expect(character?.description).toContain("character");
    expect(character?.input_schema.required).toEqual(["id", "position"]);
  });

  it("documents build enum and height", () => {
    const props = character?.input_schema.properties as Record<
      string,
      { enum?: string[] }
    >;
    expect(props.build?.enum).toEqual(["slim", "regular", "stocky"]);
    expect(props.height).toBeDefined();
  });
});
```

Dan di dalam describe SYSTEM_PROMPT yang ada, tambah:

```typescript
  it("SYSTEM_PROMPT mentions create_character", () => {
    expect(SYSTEM_PROMPT).toContain("create_character");
  });
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run tools`
Expected: FAIL — `character` undefined.

- [ ] **Step 3: Implement** — di `packages/llm-adapter/src/tools.ts`:

Baris pertama SYSTEM_PROMPT: `(create_house, create_road, create_tree)` → `(create_house, create_road, create_tree, create_character)`.
Bullet rule: `Use template tools (create_house, create_road, create_tree)` → `Use template tools (create_house, create_road, create_tree, create_character)` — **dua-duanya** (pelajaran M6: jangan sampai satu baris ketinggalan).

TOOL_DEFINITIONS, entri setelah `create_tree`:

```typescript
  {
    name: "create_character",
    description:
      "Template: build a low-poly humanoid character composed of extruded " +
      "boxes. Defaults: height=1.7m, build=regular. Colors: skin, shirt, " +
      "pants, hair.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Character group id" },
        position: {
          type: "array",
          items: { type: "number" },
          description: "[x, y, z] center of the feet (y = ground)",
        },
        height: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Total height in meters; default 1.7, clamped [0.5, 3]",
        },
        build: {
          type: "string",
          enum: ["slim", "regular", "stocky"],
          description: "Body width preset; default regular",
        },
        skinColor: { type: "string" },
        shirtColor: { type: "string" },
        pantsColor: { type: "string" },
        hairColor: { type: "string" },
      },
      required: ["id", "position"],
    },
  },
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run` → PASS semua. `exec tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/tools.ts packages/llm-adapter/tests/tools.test.ts
git commit -m "feat(llm-adapter): expose create_character tool to providers"
```

---

### Task 7: Web stores + Topbar — provider `glm-vision`, `supportsImages`, adapter branch

**Files:**
- Modify: `apps/web/src/store/llmStore.ts`
- Modify: `apps/web/src/store/chatStore.ts`
- Modify: `apps/web/src/components/Topbar.tsx`
- Modify: `apps/web/src/components/ChatPanel.tsx` (hanya Record + cabang key, agar typecheck hijau — paperclip di Task 8)
- Test: typecheck + suite web

- [ ] **Step 1: llmStore** — perubahan di `apps/web/src/store/llmStore.ts` (single quotes):

1. Union: `export type Provider = 'claude' | 'glm' | 'n9router' | 'glm-vision';`
2. Konstanta + defaults + capability:

```typescript
const GLM_VISION_KEY_STORAGE = 'asset-studio:glm-vision-api-key';
```

```typescript
export const DEFAULT_MODELS: Record<Provider, string> = {
  claude: 'claude-sonnet-4-6',
  glm: 'glm-4.6',
  n9router: 'glm/glm-5.1',
  'glm-vision': 'glm-4.5v',
};

/** Providers whose adapter maps ChatMessage.images to the wire format. */
export const SUPPORTS_IMAGES: Record<Provider, boolean> = {
  claude: false,
  glm: false,
  n9router: false,
  'glm-vision': true,
};
```

3. State tambah `glmVisionApiKey: string` + `setGlmVisionApiKey` + `clearGlmVisionApiKey` (cermin persis pola glm: `writeKey(GLM_VISION_KEY_STORAGE, key)`, update `apiKey` via `activeKey`).
4. `activeKey(provider, claudeKey, glmKey, n9routerKey, glmVisionKey)` — tambah parameter + cabang `if (provider === 'glm-vision') return glmVisionKey;`; perbarui SEMUA pemanggil (setProvider, set×4 key, hydrate).
5. `readProvider`: `if (v === 'glm' || v === 'n9router' || v === 'glm-vision') return v;`
6. `hydrateFromStorage`: baca `glmVisionApiKey` dari `GLM_VISION_KEY_STORAGE` + `models['glm-vision']` via `readModel`.

- [ ] **Step 2: chatStore** — di `apps/web/src/store/chatStore.ts`:

1. Tambah `createGLMVisionAdapter` ke import `@asset-studio/llm-adapter`.
2. `createAdapter` — cabang baru sebelum fallback claude:

```typescript
  if (provider === 'glm-vision') {
    return createGLMVisionAdapter({ apiKey, model, tools: TOOL_DEFINITIONS });
  }
```

3. `providerLabel`: `if (provider === 'glm-vision') return 'GLM Vision (Z.ai standard)';`
4. Interface + impl: `sendPrompt: (prompt: string, images?: string[]) => Promise<void>;`. Dalam `runWithRetry({...})` tambah `userImages: images,`. Bubble user: `push({ kind: 'user', text: prompt, images });`.
5. Union `ChatEntry`: `{ kind: 'user'; text: string; images?: string[] }`.

- [ ] **Step 3: Topbar** — `PROVIDER_OPTIONS` (Topbar.tsx:7-11) tambah:

```typescript
  { value: "glm-vision", label: "GLM Vision · z.ai-standard" },
```

- [ ] **Step 4: ChatPanel Record + cabang key (agar Record<Provider,…> lengkap)**

`PROVIDER_LABEL` tambah: `glmVision: "GLM Vision (Z.ai)"` — HATI-HATI: key Record adalah `'glm-vision'`, bukan `glmVision`:

```tsx
const PROVIDER_LABEL: Record<Provider, string> = {
  claude: "Claude",
  glm: "GLM (Z.ai)",
  n9router: "9Router",
  "glm-vision": "GLM Vision (Z.ai)",
};

const PROVIDER_PLACEHOLDER: Record<Provider, string> = {
  claude: "sk-ant-…",
  glm: "kunci Z.ai…",
  n9router: "kunci 9Router…",
  "glm-vision": "kunci Z.ai standard…",
};
```

`handleSaveKey`: tambah `else if (provider === "glm-vision") setGlmVisionApiKey(trimmed);` (+ selector store `setGlmVisionApiKey`). `handleClearKey`: `else if (provider === "glm-vision") clearGlmVisionApiKey();` (+ selector).

- [ ] **Step 5: Typecheck + test web**

Run: `pnpm --filter @asset-studio/web exec tsc --noEmit && pnpm --filter @asset-studio/web test -- --run`
Expected: clean + PASS (21).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/store/llmStore.ts apps/web/src/store/chatStore.ts apps/web/src/components/Topbar.tsx apps/web/src/components/ChatPanel.tsx
git commit -m "feat(web): glm-vision provider with image-capable sendPrompt"
```

---

### Task 8: Paperclip composer + chip preview + validasi 5 MB

**Files:**
- Modify: `apps/web/src/components/ChatPanel.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: ChatPanel** — di `apps/web/src/components/ChatPanel.tsx`:

1. Tambah `SUPPORTS_IMAGES` ke import dari `"../store/llmStore"`.
2. State/refs (di sebelah state `input`):

```tsx
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canAttach = SUPPORTS_IMAGES[provider];
```

3. Ganti `submit` dan tambah `pickImage` di atasnya:

```tsx
  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      useChatStore.getState().pushNote("format gambar harus jpg/png/webp");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      useChatStore.getState().pushNote("gambar maks 5 MB — kecilkan dulu");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setPendingImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    const image = pendingImage;
    setPendingImage(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    void sendPrompt(text, image ? [image] : undefined);
  };
```

4. Bubble user dengan thumbnail — ganti case `user` di `EntryView`:

```tsx
    case "user":
      return (
        <div className="msg-u">
          {entry.images?.[0] && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="msg-thumb" src={entry.images[0]} alt="" />
          )}
          {entry.text}
        </div>
      );
```

5. Chip preview di atas composer + input file & tombol paperclip di dalam composer (sebelum `<textarea>`):

```tsx
      {canAttach && pendingImage && (
        <div className="attach-chip">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage} alt="pratinjau lampiran" />
          <button
            type="button"
            className="ghost"
            onClick={() => setPendingImage(null)}
            aria-label="Hapus lampiran gambar"
          >
            hapus
          </button>
        </div>
      )}

      <div className="composer">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            pickImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {canAttach && (
          <button
            type="button"
            className="ghost attach"
            onClick={() => fileRef.current?.click()}
            disabled={thinking}
            title="Lampirkan gambar (provider vision)"
            aria-label="Lampirkan gambar"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l8.57-8.57a4 4 0 1 1 5.66 5.66l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
        )}
```

(textarea + tombol send yang ada tetap setelahnya.)

- [ ] **Step 2: globals.css** — tambah di akhir `apps/web/src/app/globals.css`:

```css
.attach-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin: 0 14px 6px;
  border: 1px solid #2a2f3a;
  border-radius: 8px;
}
.attach-chip img {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 6px;
}
.composer .attach {
  align-self: flex-end;
  margin-bottom: 6px;
}
.msg-thumb {
  display: block;
  max-width: 140px;
  border-radius: 8px;
  margin-bottom: 6px;
  border: 1px solid #2a2f3a;
}
```

- [ ] **Step 3: Typecheck + test web**

Run: `pnpm --filter @asset-studio/web exec tsc --noEmit && pnpm --filter @asset-studio/web test -- --run`
Expected: clean + PASS (21).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ChatPanel.tsx apps/web/src/app/globals.css
git commit -m "feat(web): image attachment in composer for vision providers"
```

---

### Task 9: Eval case ke-9 + rail copy + chip starter

**Files:**
- Modify: `packages/llm-adapter/src/eval/cases.ts`
- Modify: `packages/llm-adapter/tests/evalMatch.test.ts`
- Modify: `packages/llm-adapter/tests/eval.live.test.ts`
- Modify: `apps/web/src/components/SceneRail.tsx`
- Modify: `apps/web/src/components/ChatPanel.tsx`

- [ ] **Step 1: Eval case** — di `packages/llm-adapter/src/eval/cases.ts`, tambah setelah case `extrude-floor` (terakhir):

```typescript
  {
    id: "character-170cm",
    prompt: "Buat karakter pria setinggi 170 cm berbaju biru",
    expectedTool: "create_character",
    expectArgs: (input) => input.height === 1.7,
  },
```

Di `packages/llm-adapter/tests/evalMatch.test.ts`: `expect(EVAL_CASES).toHaveLength(8);` → `toHaveLength(9);` dan tambah `"create_character"` ke array `known`.

Di `packages/llm-adapter/tests/eval.live.test.ts`: judul `it("summary: accuracy >= 0.75 (6 of 8)", ...)` → `it("summary: accuracy >= 0.75 (7 of 9)", ...)` (logika threshold tidak berubah).

- [ ] **Step 2: Rail + chip** — `apps/web/src/components/SceneRail.tsx`:

`LAYER2_TOOLS` entri keempat:

```tsx
  {
    tn: "create_character(height, build)",
    comp: "= extrude (torso + anggota)",
  },
```

`TOOL_TAGS` tambah `"create_character",` setelah `"create_tree",`.

`apps/web/src/components/ChatPanel.tsx` — `STARTER_CHIPS` chip kelima: `"Buat karakter pria setinggi 170 cm",`.

- [ ] **Step 3: Verifikasi**

Run: `pnpm --filter @asset-studio/llm-adapter test -- --run evalMatch` → PASS (9 case terverifikasi).
Run: `pnpm --filter @asset-studio/web exec tsc --noEmit && pnpm --filter @asset-studio/web test -- --run` → clean + PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/llm-adapter/src/eval/cases.ts packages/llm-adapter/tests/evalMatch.test.ts packages/llm-adapter/tests/eval.live.test.ts apps/web/src/components/SceneRail.tsx apps/web/src/components/ChatPanel.tsx
git commit -m "feat: ninth eval case and UI copy for create_character"
```

---

### Task 10: Verifikasi penuh + eval live + manual checklist + memori

**Files:**
- Modify: sesuai temuan (harapannya tidak ada)

- [ ] **Step 1: Full gates (offline)**

```bash
pnpm -r --filter './packages/*' --filter '@asset-studio/web' exec tsc --noEmit
pnpm -r test
pnpm --filter @asset-studio/web build
```

Expected: typecheck clean; test PASS = 130 + 17 baru (openaiCompat 3, glmVision 2, schema 2, template 5, executor 3, tools 2) = **147**; build 4 halaman statis.

- [ ] **Step 2: Eval live (user, key Z.ai standard)**

```bash
EVAL_PROVIDER=glm-vision EVAL_MODEL=glm-4.5v EVAL_API_KEY=<key-zai-standard> pnpm --filter @asset-studio/llm-adapter eval
```

Expected: 9 case, gate ≥75% (7/9). Catatan: seluruh case berjalan lewat glm-4.5v — jika akurasi <75% karena model vision lebih lemah di tool-calling TEKS (bukan karena fitur rusak), isolasi dengan `EVAL_PROVIDER=claude` sekali lagi; yang wajib lolos di glm-vision minimal `character-170cm`. Jika glm-4.5v terbukti goyah secara umum → jangan paksa: itu pemicu fallback spec (pendekatan 3, `analyze_image`) — diskusikan dengan user dulu (perubahan spec).

- [ ] **Step 3: Manual golden checklist (browser :3000, dev server, provider GLM Vision + key Z.ai standard)**

1. Topbar pilih **GLM Vision** → tempel key → tersimpan (indikator key aktif).
2. Paperclip tampil; pilih foto karakter (jpg <5 MB) → chip preview → tulis "buat karakter seperti gambar ini" → Enter.
3. Karakter humanoid muncul: torso baju, kaki celana, lengan kulit, kepala, rambut; ToolCard `create_character` hijau; height/build/colors mengikuti gambar (masuk akal).
4. "Ganti warna bajunya jadi merah" → `set_material` mengenai node karakter.
5. Scene Rail: node karakter + 6 children; trash → seluruh karakter hilang; Ctrl+Z → kembali.
6. Export GLB → file berisi karakter.
7. Ganti provider ke Claude → paperclip TIDAK tampil; chip teks lama tetap jalan (tanpa regressi).
8. Coba file >5 MB → note penolakan; tidak terkirim.

- [ ] **Step 4: Fix-forward jika ada galat**

Reproduksi → test → perbaiki → gates ulang. Penyimpangan disengaja ditandai `// ponytail:`.

- [ ] **Step 5: Final review + update memori (controller)**

Review subagent keseluruhan M8; update `project_state.md`: M8 fase A selesai (commit, cara pakai glm-vision, key Z.ai standard terpisah), fallback analyze_image belum aktif, fase B (Meshy) menyusul, batasan baru (approx stilasi — bukan rekonstruksi foto).

# LLM → 3D End-to-End (Golden Path Hardening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the golden path reliable with a real LLM key: paste key → click chip "Buat rumah 2 lantai dengan atap pelana" → LLM emits `create_house` tool call → engine executes → a 2-storey gable-roof house renders in the viewport with a tool card in chat and nodes in SceneRail.

**Architecture:** The full chain already exists (ChatPanel → chatStore.sendPrompt → runWithRetry → adapter → sceneStore.applyToolCall → toolExecutor → Viewport). This plan fixes the defects that break it live: (1) orchestrator pushes empty assistant messages which the Claude API rejects with 400, (2) tool results are never fed back so the model loops blindly, (3) the success loop is unbounded, (4) adapter/network errors are invisible in the UI, (5) the house template cannot produce the gable roof the starter chip promises. Plus small reliability/UX additions: SDK timeouts, per-provider model override, live assistant bubbles, web test harness.

**Tech Stack:** TypeScript, pnpm monorepo (`packages/schema`, `packages/llm-adapter`, `packages/scene-engine`, `apps/web`), Zod (schema), vitest (all packages), Zustand stores, Next.js 16.3.0 + React 19 + R3F, `@anthropic-ai/sdk` + `openai` SDK (browser mode).

**Baseline audit (verified 2026-08-19):**
- `packages/llm-adapter/src/orchestrator.ts` — `runWithRetry` loop, `retries <= maxRetries`, pushes `result.content` even when empty, `continue`s after success without feedback.
- `packages/llm-adapter/src/tools.ts` — `SYSTEM_PROMPT` (promises "You will receive the result in the next message" — currently a lie), `TOOL_DEFINITIONS` (7 tools; `create_house` requires `id, position, size`).
- `packages/llm-adapter/src/{claude,glm,n9router}.ts` — 3 adapters; GLM `maxTokens` default 512; no SDK `timeout`/`maxRetries` options (SDK default retries=2 silently triples wait).
- `packages/schema/src/toolSchemas.ts` — `createHouseToolInputSchema` has no `floors`/`roofStyle`.
- `packages/llm-adapter/src/templates/createHouse.ts` — walls + FLAT roof slab only.
- `apps/web/src/store/chatStore.ts` — `sendPrompt` wired end-to-end; catch sets `lastError` but pushes NO thread entry (silent failure); assistant entries appended only after the whole loop; `MODELS` hardcoded here.
- `apps/web/src/store/llmStore.ts` — per-provider keys + provider persistence; no model override.
- `apps/web` has NO test script/vitest (only llm-adapter 22 + scene-engine 44 tests run today).
- Working tree has UNCOMMITTED redesign changes (12+ files) — Task 0 commits them first.

**Non-goals (v1):** multi-turn transcript memory (scene JSON grounds each turn), curved roads/lane markings, CSG window cuts, gable end-cap triangles, camera auto-fit, token streaming.

---

### Task 0: Commit pending redesign work

**Files:** none (git only)

- [ ] **Step 1: Review what is pending**

Run: `git status --short`
Expected: modified `apps/web/src/**` (redesign), `packages/**` (n9router + template fixes), untracked `PRD-AI-Procedural-Asset-Studio.md`, `docs/`, `packages/llm-adapter/src/n9router.ts`.

- [ ] **Step 2: Verify suite is green before committing**

Run: `npx tsc --noEmit -p apps/web && pnpm -r test`
Expected: clean typecheck; llm-adapter 22 passed, scene-engine 44 passed, schema 0 (passWithNoTests).

- [ ] **Step 3: Commit in two logical commits**

```bash
git add PRD-AI-Procedural-Asset-Studio.md docs/
git commit -m "docs: add PRD and superpowers plans"
git add apps/web packages
git commit -m "feat(web): apply Open Design editor-dark UI across shell, chat, rail, viewport"
```

Run: `git status --short` → Expected: clean tree.

---

### Task 1: Orchestrator — never push empty assistant messages

**Files:**
- Modify: `packages/llm-adapter/src/orchestrator.ts:40-41`
- Test: `packages/llm-adapter/tests/orchestrator.test.ts`

Why: when a model answers with ONLY a tool call (`content: ""`, the most common shape for GLM and frequent for Claude), the orchestrator today pushes `{role:"assistant", content:""}` into `messages`. The next loop iteration sends that to the Anthropic API, which rejects empty content with 400 `text content blocks must be non-empty` — the golden path dies on the first retry round.

- [ ] **Step 1: Write the failing tests**

Replace the `makeAdapter` helper and add a new test in `packages/llm-adapter/tests/orchestrator.test.ts`. The helper now records every message array the adapter receives:

```ts
function makeAdapter(responses: ChatResult[]): {
  adapter: LLMAdapter;
  calls: ChatMessage[][];
} {
  const calls: ChatMessage[][] = [];
  let i = 0;
  return {
    calls,
    adapter: {
      chat: vi.fn(async (messages: ChatMessage[]): Promise<ChatResult> => {
        calls.push(messages.map((m) => ({ ...m })));
        const r = responses[i];
        i++;
        if (!r) throw new Error("adapter ran out of scripted responses");
        return r;
      }),
    },
  };
}
```

Add `ChatMessage` to the type import on line 3:

```ts
import type { LLMAdapter, ChatResult, ChatMessage } from "../src/types";
```

Update the four existing tests from `const adapter = makeAdapter([...])` to destructure: `const { adapter } = makeAdapter([...])` (assertions unchanged). Then add:

```ts
it("does not push an empty assistant message when the turn is tool-only", async () => {
  const { adapter, calls } = makeAdapter([
    { content: "", toolCalls: [{ id: "tu1", name: "create_house", input: { id: "h1" } }], stopReason: "tool_use" },
    { content: "done", toolCalls: [], stopReason: "end_turn" },
  ]);
  const exec = makeExecutor();
  const result = await runWithRetry({
    adapter, systemPrompt: "s", userPrompt: "build",
    tools: [], applyToolCall: exec.apply, maxRetries: 2,
  });

  // Second adapter call must contain NO empty-content assistant message
  const second = calls[1]!;
  expect(second.every((m) => m.content.length > 0)).toBe(true);
  expect(result.assistantMessages.every((m) => m.content.length > 0)).toBe(true);
  expect(result.assistantMessages.at(-1)?.content).toBe("done");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: FAIL — `second.every(...)` is false because the empty assistant message IS present.

- [ ] **Step 3: Implement**

In `packages/llm-adapter/src/orchestrator.ts`, replace lines 40-41:

```ts
    assistantMessages.push({ role: "assistant", content: result.content });
    messages.push({ role: "assistant", content: result.content });
```

with:

```ts
    // ponytail: Anthropic API rejects empty-content messages with 400, and a
    // tool-only turn legitimately has content "". Only record non-empty turns.
    if (result.content.trim().length > 0) {
      const msg = { role: "assistant" as const, content: result.content };
      assistantMessages.push(msg);
      messages.push(msg);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: PASS (5 orchestrator tests).

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/orchestrator.ts packages/llm-adapter/tests/orchestrator.test.ts
git commit -m "fix(llm-adapter): skip empty assistant messages in retry history"
```

---

### Task 2: Orchestrator — feed tool results back with updated scene JSON

**Files:**
- Modify: `packages/llm-adapter/src/orchestrator.ts`
- Test: `packages/llm-adapter/tests/orchestrator.test.ts`

Why: `SYSTEM_PROMPT` promises "You will receive the result in the next message", but on success the loop just `continue`s — the model sees nothing new and may re-call the same tool or hallucinate completion. Multi-step prompts ("rumah + jalan") need the model to see the UPDATED scene between rounds.

- [ ] **Step 1: Write the failing tests**

Add to `packages/llm-adapter/tests/orchestrator.test.ts`:

```ts
it("sends a success feedback user message with updated scene JSON after tools run", async () => {
  const { adapter, calls } = makeAdapter([
    { content: "", toolCalls: [{ id: "tu1", name: "create_house", input: { id: "h1" } }], stopReason: "tool_use" },
    { content: "done", toolCalls: [], stopReason: "end_turn" },
  ]);
  const exec = makeExecutor();
  await runWithRetry({
    adapter, systemPrompt: "s", userPrompt: "build",
    tools: [], applyToolCall: exec.apply, maxRetries: 2,
    getSceneState: () => '{"nodes":[{"id":"h1-walls"}]}',
  });

  const second = calls[1]!;
  const feedback = second.at(-1)!;
  expect(feedback.role).toBe("user");
  expect(feedback.content).toContain("create_house");
  expect(feedback.content).toContain("succeeded");
  expect(feedback.content).toContain('{"nodes":[{"id":"h1-walls"}]}');
});

it("multi-tool round reports every tool name in the feedback message", async () => {
  const { adapter, calls } = makeAdapter([
    {
      content: "", stopReason: "tool_use",
      toolCalls: [
        { id: "tu1", name: "create_house", input: { id: "h1" } },
        { id: "tu2", name: "create_road", input: { id: "r1" } },
      ],
    },
    { content: "done", toolCalls: [], stopReason: "end_turn" },
  ]);
  const exec = makeExecutor();
  await runWithRetry({
    adapter, systemPrompt: "s", userPrompt: "build",
    tools: [], applyToolCall: exec.apply, maxRetries: 2,
  });

  const feedback = calls[1]!.at(-1)!;
  expect(feedback.content).toContain("create_house");
  expect(feedback.content).toContain("create_road");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: FAIL — `feedback.role` is undefined; no feedback message exists (`calls[1]` has no trailing user message).

- [ ] **Step 3: Implement**

In `orchestrator.ts`, extend `RunWithRetryOptions`:

```ts
export interface RunWithRetryOptions {
  adapter: LLMAdapter;
  systemPrompt: string;
  userPrompt: string;
  tools: ToolDefinition[];
  applyToolCall: ApplyToolCall;
  maxRetries: number;
  /** Serialized scene appended to success feedback so the model sees the new state. */
  getSceneState?: () => string;
}
```

Replace the success branch (current lines 57-60, `if (!failed) { ... continue; }`) with:

```ts
    if (!failed) {
      // All tools succeeded; report back so the model can chain the next step.
      const names = result.toolCalls.map((tc) => `"${tc.name}"`).join(", ");
      const sceneState = opts.getSceneState?.() ?? "";
      messages.push({
        role: "user",
        content:
          `Tool${result.toolCalls.length > 1 ? "s" : ""} ${names} succeeded. ` +
          `Continue with the next step, or reply with a short summary if the request is complete.` +
          (sceneState ? `\n\nUpdated scene JSON:\n${sceneState}` : ""),
      });
      continue;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: PASS (7 orchestrator tests). Note: existing test "executes one tool_call then ends" still passes because the scripted second response is `end_turn` regardless of the extra user message.

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/orchestrator.ts packages/llm-adapter/tests/orchestrator.test.ts
git commit -m "feat(llm-adapter): feed tool results and updated scene back to model"
```

---

### Task 3: Orchestrator — cap tool rounds + live onAssistant callback

**Files:**
- Modify: `packages/llm-adapter/src/orchestrator.ts`
- Test: `packages/llm-adapter/tests/orchestrator.test.ts`

Why: the while loop is only bounded by FAILURES — a model that keeps emitting tool calls on success loops forever (unbounded API spend). And assistant text is only returned at the end, so a multi-round session looks frozen in the UI; a callback lets chatStore push bubbles live.

- [ ] **Step 1: Write the failing tests**

Add to `packages/llm-adapter/tests/orchestrator.test.ts`:

```ts
it("stops after maxToolRounds successful rounds even without failures", async () => {
  const loopResponse: ChatResult = {
    content: "", stopReason: "tool_use",
    toolCalls: [{ id: "tu", name: "create_road", input: { id: "r" } }],
  };
  const { adapter } = makeAdapter(Array.from({ length: 20 }, () => loopResponse));
  const exec = makeExecutor();
  const result = await runWithRetry({
    adapter, systemPrompt: "s", userPrompt: "go",
    tools: [], applyToolCall: exec.apply, maxRetries: 2,
    maxToolRounds: 3,
  });

  expect(exec.calls).toHaveLength(3);
  expect(result.finalStatus).toBe("ok");
  expect(result.lastError).toMatch(/3 tool rounds/);
});

it("defaults the round cap to 6", async () => {
  const loopResponse: ChatResult = {
    content: "", stopReason: "tool_use",
    toolCalls: [{ id: "tu", name: "create_road", input: { id: "r" } }],
  };
  const { adapter } = makeAdapter(Array.from({ length: 20 }, () => loopResponse));
  const exec = makeExecutor();
  await runWithRetry({
    adapter, systemPrompt: "s", userPrompt: "go",
    tools: [], applyToolCall: exec.apply, maxRetries: 2,
  });
  expect(exec.calls).toHaveLength(6);
});

it("invokes onAssistant for each non-empty assistant turn", async () => {
  const { adapter } = makeAdapter([
    { content: "planning the house", toolCalls: [{ id: "tu1", name: "create_house", input: { id: "h1" } }], stopReason: "tool_use" },
    { content: "done", toolCalls: [], stopReason: "end_turn" },
  ]);
  const exec = makeExecutor();
  const seen: string[] = [];
  await runWithRetry({
    adapter, systemPrompt: "s", userPrompt: "build",
    tools: [], applyToolCall: exec.apply, maxRetries: 2,
    onAssistant: (content) => seen.push(content),
  });
  expect(seen).toEqual(["planning the house", "done"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: FAIL — `maxToolRounds`/`onAssistant` not accepted, round-cap tests run 20 rounds.

- [ ] **Step 3: Implement**

Final shape of `orchestrator.ts` (whole file):

```ts
import type { ChatMessage, ChatResult, LLMAdapter, ToolCall } from "./types";
import type { ToolDefinition } from "./tools";

export type ApplyToolCall = (
  name: string,
  input: Record<string, unknown>
) => Promise<{ ok: boolean; error?: string }>;

const DEFAULT_MAX_TOOL_ROUNDS = 6;

export interface RunWithRetryOptions {
  adapter: LLMAdapter;
  systemPrompt: string;
  userPrompt: string;
  tools: ToolDefinition[];
  applyToolCall: ApplyToolCall;
  maxRetries: number;
  /** Max successful tool rounds before forcing a stop. Default 6. */
  maxToolRounds?: number;
  /** Serialized scene appended to success feedback so the model sees the new state. */
  getSceneState?: () => string;
  /** Live notification of each non-empty assistant turn. */
  onAssistant?: (content: string) => void;
}

export interface RunResult {
  assistantMessages: ChatMessage[];
  finalStatus: "ok" | "error";
  lastError?: string;
}

export async function runWithRetry(
  opts: RunWithRetryOptions
): Promise<RunResult> {
  const maxToolRounds = opts.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const messages: ChatMessage[] = [
    { role: "user", content: opts.userPrompt },
  ];
  const assistantMessages: ChatMessage[] = [];
  let retries = 0;
  let rounds = 0;
  let lastError: string | undefined;

  while (retries <= opts.maxRetries) {
    const result: ChatResult = await opts.adapter.chat(
      messages,
      opts.systemPrompt
    );

    // ponytail: Anthropic API rejects empty-content messages with 400, and a
    // tool-only turn legitimately has content "". Only record non-empty turns.
    if (result.content.trim().length > 0) {
      const msg = { role: "assistant" as const, content: result.content };
      assistantMessages.push(msg);
      messages.push(msg);
      opts.onAssistant?.(result.content);
    }

    if (result.toolCalls.length === 0) {
      return { assistantMessages, finalStatus: "ok" };
    }

    rounds++;
    if (rounds > maxToolRounds) {
      return {
        assistantMessages,
        finalStatus: "ok",
        lastError: `Stopped after ${maxToolRounds} tool rounds (limit).`,
      };
    }

    let failed: ToolCall | undefined;
    for (const tc of result.toolCalls) {
      const res = await opts.applyToolCall(tc.name, tc.input);
      if (!res.ok) {
        failed = tc;
        lastError = res.error;
        break;
      }
    }

    if (!failed) {
      // All tools succeeded; report back so the model can chain the next step.
      const names = result.toolCalls.map((tc) => `"${tc.name}"`).join(", ");
      const sceneState = opts.getSceneState?.() ?? "";
      messages.push({
        role: "user",
        content:
          `Tool${result.toolCalls.length > 1 ? "s" : ""} ${names} succeeded. ` +
          `Continue with the next step, or reply with a short summary if the request is complete.` +
          (sceneState ? `\n\nUpdated scene JSON:\n${sceneState}` : ""),
      });
      continue;
    }

    retries++;
    if (retries > opts.maxRetries) {
      return {
        assistantMessages,
        finalStatus: "error",
        lastError,
      };
    }

    // Feed failure back to the model.
    messages.push({
      role: "user",
      content: `Tool "${failed.name}" (id ${failed.id}) failed: ${lastError}. Please correct and retry, or reply without that tool.`,
    });
  }

  // Unreachable in practice; guard for safety.
  return { assistantMessages, finalStatus: "error", lastError };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: PASS (10 orchestrator tests).

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/orchestrator.ts packages/llm-adapter/tests/orchestrator.test.ts
git commit -m "feat(llm-adapter): cap tool rounds, add onAssistant streaming callback"
```

---

### Task 4: Adapter defaults — 60s timeout, no SDK retries, maxTokens 1024

**Files:**
- Create: `packages/llm-adapter/src/defaults.ts`
- Modify: `packages/llm-adapter/src/claude.ts`, `glm.ts`, `n9router.ts`, `index.ts`
- Test: `packages/llm-adapter/tests/defaults.test.ts`

Why: the user hit "thinking lama sekali" — SDKs default to 2 silent retries with long timeouts, so a dead endpoint stalls minutes with zero feedback. GLM `max_tokens: 512` can truncate tool-call JSON mid-arguments.

- [ ] **Step 1: Write the failing test**

Create `packages/llm-adapter/tests/defaults.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ADAPTER_DEFAULTS } from "../src/defaults";

describe("ADAPTER_DEFAULTS", () => {
  it("caps request latency and disables silent SDK retries", () => {
    expect(ADAPTER_DEFAULTS.timeoutMs).toBe(60_000);
    expect(ADAPTER_DEFAULTS.sdkMaxRetries).toBe(0);
  });
  it("gives every adapter enough tokens for tool-call JSON", () => {
    expect(ADAPTER_DEFAULTS.maxTokens).toBeGreaterThanOrEqual(1024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: FAIL — `../src/defaults` does not exist.

- [ ] **Step 3: Implement**

Create `packages/llm-adapter/src/defaults.ts`:

```ts
/** Shared adapter tuning — see docs/superpowers/plans/2026-08-19-llm-3d-end-to-end.md Task 4. */
export const ADAPTER_DEFAULTS = {
  /** Per-request timeout. SDKs otherwise stall for minutes on dead endpoints. */
  timeoutMs: 60_000,
  /** SDK-level retries disabled: the orchestrator owns retry policy. */
  sdkMaxRetries: 0,
  /** Tool-call JSON needs headroom; 512 truncated GLM arguments. */
  maxTokens: 1024,
} as const;
```

In `claude.ts`, import and wire:

```ts
import { ADAPTER_DEFAULTS } from "./defaults";
```

```ts
  const client = new Anthropic({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: true, // PRD §10: client-side direct call
    timeout: ADAPTER_DEFAULTS.timeoutMs,
    maxRetries: ADAPTER_DEFAULTS.sdkMaxRetries,
  });
  const maxTokens = opts.maxTokens ?? ADAPTER_DEFAULTS.maxTokens;
```

(replacing `const maxTokens = opts.maxTokens ?? 1024;`)

In `glm.ts` and `n9router.ts`, same import, then:

```ts
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL ?? GLM_BASE_URL, // n9router.ts: N9ROUTER_DEFAULT_BASE_URL
    dangerouslyAllowBrowser: true,
    timeout: ADAPTER_DEFAULTS.timeoutMs,
    maxRetries: ADAPTER_DEFAULTS.sdkMaxRetries,
  });
  const maxTokens = opts.maxTokens ?? ADAPTER_DEFAULTS.maxTokens;
```

(replacing `?? 512` in glm.ts and `?? 1024` in n9router.ts)

In `packages/llm-adapter/src/index.ts` add:

```ts
export * from "./defaults";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @asset-studio/llm-adapter test && pnpm --filter @asset-studio/llm-adapter typecheck`
Expected: PASS (12 tests incl. defaults), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/defaults.ts packages/llm-adapter/src/claude.ts packages/llm-adapter/src/glm.ts packages/llm-adapter/src/n9router.ts packages/llm-adapter/src/index.ts packages/llm-adapter/tests/defaults.test.ts
git commit -m "feat(llm-adapter): 60s timeout, no SDK retries, 1024 max tokens"
```

---

### Task 5: Schema — create_house gains floors, roofStyle, roofHeight; size optional

**Files:**
- Modify: `packages/schema/src/toolSchemas.ts:37-43`
- Test: `packages/schema/tests/toolSchemas.test.ts` (new; `vitest run --passWithNoTests` already scripted)

Why: the starter chip promises "2 lantai dengan atap pelana" but the schema can only express a box + flat slab. `floors` + `roofStyle: 'flat'|'gable'` make the chip directly expressible; `size` becomes optional with a floors-derived default so the LLM has less to get wrong.

- [ ] **Step 1: Write the failing tests**

Create `packages/schema/tests/toolSchemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createHouseToolInputSchema } from '../src/toolSchemas';

describe('createHouseToolInputSchema', () => {
  it('accepts id + position only (everything else defaulted)', () => {
    const r = createHouseToolInputSchema.safeParse({ id: 'h', position: [0, 0, 0] });
    expect(r.success).toBe(true);
  });

  it('accepts floors and roofStyle without size', () => {
    const r = createHouseToolInputSchema.safeParse({
      id: 'h',
      position: [1, 0, 2],
      floors: 2,
      roofStyle: 'gable',
      roofHeight: 1.8,
    });
    expect(r.success).toBe(true);
  });

  it('rejects floors outside 1-3', () => {
    expect(
      createHouseToolInputSchema.safeParse({ id: 'h', position: [0, 0, 0], floors: 4 }).success
    ).toBe(false);
    expect(
      createHouseToolInputSchema.safeParse({ id: 'h', position: [0, 0, 0], floors: 0 }).success
    ).toBe(false);
  });

  it('rejects unknown roofStyle', () => {
    expect(
      createHouseToolInputSchema.safeParse({ id: 'h', position: [0, 0, 0], roofStyle: 'dome' }).success
    ).toBe(false);
  });

  it('still rejects a malformed size tuple', () => {
    expect(
      createHouseToolInputSchema.safeParse({ id: 'h', position: [0, 0, 0], size: [4, 3] }).success
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @asset-studio/schema test`
Expected: FAIL — under the old schema `floors: 4` parses successfully (zod strips unknown keys), so the rejection tests fail.

- [ ] **Step 3: Implement**

Replace `createHouseToolInputSchema` in `packages/schema/src/toolSchemas.ts`:

```ts
export const createHouseToolInputSchema = z.object({
  id: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  /** [width, height, depth]; default [8, floors*3, 6] in the template. */
  size: z.tuple([z.number(), z.number(), z.number()]).optional(),
  floors: z.number().int().min(1).max(3).optional(),
  roofStyle: z.enum(['flat', 'gable']).optional(),
  roofHeight: z.number().positive().optional(),
  wallColor: z.string().optional(),
  roofColor: z.string().optional(),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @asset-studio/schema test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/toolSchemas.ts packages/schema/tests/toolSchemas.test.ts
git commit -m "feat(schema): create_house accepts floors, roofStyle, optional size"
```

---

### Task 6: Template — gable roof + floor bands

**Files:**
- Modify: `packages/llm-adapter/src/templates/createHouse.ts` (rewrite)
- Test: `packages/llm-adapter/tests/templates.test.ts` (update house cases)
- Test: `packages/scene-engine/tests/templates.test.ts:12-28` (update roof ids)

Why: `applyCreateHouse` currently emits a flat 0.3m slab — "atap pelana" (gable) is impossible. Gable is composed from Layer-1 primitives exactly as the PRD prescribes: two tilted extrude slabs meeting at a ridge along Z. Floor bands give "2 lantai" a visible meaning.

Geometry (used verbatim below): house center `(px, py, pz)`, size `(w, h, d)`, ridge height `hr` (default `max(1, w*0.22)`), overhang `o = 0.3`. Slope run `run = w/2 + o`, slope length `L = hypot(run, hr)`, angle `θ = atan2(hr, run)`. For the +X slab: local footprint `L × (d + 2o)` centered at origin, node position `(px + run/2, py + h + hr/2, pz)`, rotation `[0, 0, -θ]` (rotation about Z by -θ maps local +X onto the downhill direction `(cos θ, -sin θ, 0)`). The −X slab mirrors position and sign.

- [ ] **Step 1: Write the failing tests**

In `packages/llm-adapter/tests/templates.test.ts`, replace the four `applyCreateHouse` tests with these six (road tests unchanged):

```ts
describe("applyCreateHouse", () => {
  it("produces walls + two gable roof slabs by default", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      { id: "house-01", position: [0, 0, 0], size: [4, 3, 4], wallColor: "#cccccc", roofColor: "#882222" },
      scene
    );
    const ids = result.newNodes.map((n) => n.id);
    expect(ids).toContain("house-01-walls");
    expect(ids).toContain("house-01-roof-l");
    expect(ids).toContain("house-01-roof-r");
    expect(ids).toHaveLength(3);
  });

  it("walls extrude footprint of size[0] x size[2], height size[1]", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      { id: "h", position: [0, 0, 0], size: [6, 4, 5], wallColor: "#ffffff", roofColor: "#000000" },
      scene
    );
    const walls = result.newNodes.find((n) => n.id === "h-walls");
    expect(walls).toBeDefined();
    expect(walls?.type).toBe("extrude");
    expect(walls?.parameters.depth).toBe(4);
    expect(walls?.parameters.shape).toHaveLength(4);
  });

  it("gable slabs are tilted ±theta and sit above the walls", () => {
    const scene = { nodes: [] as SceneNode[] };
    const w = 6;
    const result = applyCreateHouse(
      { id: "h", position: [0, 0, 0], size: [w, 4, 5] },
      scene
    );
    const hr = Math.max(1, w * 0.22);
    const theta = Math.atan2(hr, w / 2 + 0.3);
    const right = result.newNodes.find((n) => n.id === "h-roof-r");
    const left = result.newNodes.find((n) => n.id === "h-roof-l");
    expect(right?.transform.rotation?.[2]).toBeCloseTo(-theta);
    expect(left?.transform.rotation?.[2]).toBeCloseTo(theta);
    expect(right?.transform.position[1]).toBeGreaterThanOrEqual(4);
    expect(left?.transform.position[1]).toBeGreaterThanOrEqual(4);
  });

  it("flat roof is a single slab with zero rotation", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      { id: "h", position: [0, 0, 0], size: [4, 3, 4], roofStyle: "flat" },
      scene
    );
    const roof = result.newNodes.find((n) => n.id === "h-roof");
    expect(roof).toBeDefined();
    expect(roof?.transform.rotation).toEqual([0, 0, 0]);
    expect(roof?.transform.position[1]).toBeGreaterThanOrEqual(3);
    expect(result.newNodes.filter((n) => n.id.startsWith("h-roof"))).toHaveLength(1);
  });

  it("floors=2 without size defaults height to 6 and adds a floor band", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse(
      { id: "h", position: [0, 0, 0], floors: 2, roofStyle: "flat" },
      scene
    );
    const walls = result.newNodes.find((n) => n.id === "h-walls");
    expect(walls?.parameters.depth).toBe(6); // 2 floors * 3m
    const band = result.newNodes.find((n) => n.id === "h-floor-1");
    expect(band).toBeDefined();
    expect(band?.transform.position[1]).toBeGreaterThan(2.5);
    expect(band?.transform.position[1]).toBeLessThan(3.5);
  });

  it("returns only new nodes; does not mutate input scene", () => {
    const scene = { nodes: [] as SceneNode[] };
    const result = applyCreateHouse({ id: "h", position: [1, 0, 1], size: [4, 3, 4] }, scene);
    expect(scene.nodes).toHaveLength(0);
    expect(result.newNodes.length).toBeGreaterThan(0);
    for (const n of result.newNodes) {
      expect(n.type).toBe("extrude");
      expect(n.name).toBe(n.id);
      expect(n.parameters.shape).toBeDefined();
      expect(n.parameters.depth).toBeGreaterThan(0);
    }
  });
});
```

In `packages/scene-engine/tests/templates.test.ts`, update the `create_house` test — new input and roof assertions:

```ts
    const res = executeToolCall(scene, {
      name: 'create_house',
      input: {
        id: 'h1',
        position: [0, 0, 0],
        size: [4, 3, 4],
        floors: 2,
        roofStyle: 'gable',
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scene.nodes.length).toBeGreaterThanOrEqual(2);
    expect(res.scene.nodes.some((n) => n.id === 'h1-walls')).toBe(true);
    expect(res.scene.nodes.some((n) => n.id === 'h1-roof-l')).toBe(true);
    expect(res.scene.nodes.some((n) => n.id === 'h1-roof-r')).toBe(true);
    expect(res.scene.nodes.some((n) => n.id === 'h1-floor-1')).toBe(true);
    // original scene is not mutated (immutable pattern)
    expect(scene.nodes).toHaveLength(0);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @asset-studio/llm-adapter test && pnpm --filter @asset-studio/scene-engine test`
Expected: FAIL — no `h-roof-l`/`h-roof-r`/`h-floor-1` nodes; default is a flat slab; scene-engine `h1-roof` lookup misses.

- [ ] **Step 3: Implement — rewrite `createHouse.ts`**

```ts
import type { SceneNode, Vec3 } from "@asset-studio/scene-engine";

export interface CreateHouseInput {
  id: string;
  position: [number, number, number];
  /** [width, height, depth]; default [8, floors*3, 6]. */
  size?: [number, number, number];
  /** Storeys 1-3; default 1. */
  floors?: number;
  /** Default "gable" (atap pelana). */
  roofStyle?: "flat" | "gable";
  /** Gable ridge height; default max(1, width * 0.22). */
  roofHeight?: number;
  wallColor?: string;
  roofColor?: string;
}

export interface CreateHouseResult {
  newNodes: SceneNode[];
}

const FLOOR_HEIGHT = 3;
const DEFAULT_WIDTH = 8;
const DEFAULT_DEPTH = 6;
const ROOF_OVERHANG = 0.3;
const ROOF_SLAB_THICKNESS = 0.15;
const FLAT_ROOF_THICKNESS = 0.3;
const FLOOR_BAND_THICKNESS = 0.12;
const FLOOR_BAND_MARGIN = 0.05;
const FLOOR_BAND_COLOR = "#3a4150";
const WALL_COLOR_DEFAULT = "#cccccc";
const ROOF_COLOR_DEFAULT = "#882222";

type XY = [number, number];

function extrudeNode(
  id: string,
  shape: XY[],
  depth: number,
  color: string,
  position: Vec3,
  rotation?: Vec3
): SceneNode {
  return {
    id,
    type: "extrude",
    name: id,
    transform: { position, rotation: rotation ?? [0, 0, 0], scale: [1, 1, 1] },
    parameters: { shape, depth },
    material: { color },
    children: [],
  };
}

/**
 * ponytail: template = composition of Layer-1 extrudes, per PRD M3. Gable roof
 * is two tilted slabs meeting at a ridge along Z (end caps stay open — M4
 * polish). Floor bands are thin slabs at storey boundaries so "2 lantai" reads
 * visually without CSG window cuts.
 */
export function applyCreateHouse(
  input: CreateHouseInput,
  _scene: { nodes: SceneNode[] }
): CreateHouseResult {
  const floors = input.floors ?? 1;
  const [w, h, d] = input.size ?? [DEFAULT_WIDTH, floors * FLOOR_HEIGHT, DEFAULT_DEPTH];
  const [px, py, pz] = input.position;
  const wallColor = input.wallColor ?? WALL_COLOR_DEFAULT;
  const roofColor = input.roofColor ?? ROOF_COLOR_DEFAULT;
  const roofStyle = input.roofStyle ?? "gable";

  const halfW = w / 2;
  const halfD = d / 2;

  const wallShape: XY[] = [
    [px - halfW, pz - halfD],
    [px + halfW, pz - halfD],
    [px + halfW, pz + halfD],
    [px - halfW, pz + halfD],
  ];
  const nodes: SceneNode[] = [
    extrudeNode(`${input.id}-walls`, wallShape, h, wallColor, [0, py, 0]),
  ];

  // Floor bands between storeys (k = 1 .. floors-1).
  const floorH = h / floors;
  for (let k = 1; k < floors; k++) {
    const m = FLOOR_BAND_MARGIN;
    const bandShape: XY[] = [
      [px - halfW - m, pz - halfD - m],
      [px + halfW + m, pz - halfD - m],
      [px + halfW + m, pz + halfD + m],
      [px - halfW - m, pz + halfD + m],
    ];
    nodes.push(
      extrudeNode(
        `${input.id}-floor-${k}`,
        bandShape,
        FLOOR_BAND_THICKNESS,
        FLOOR_BAND_COLOR,
        [0, py + k * floorH - FLOOR_BAND_THICKNESS / 2, 0]
      )
    );
  }

  if (roofStyle === "flat") {
    const o = ROOF_OVERHANG;
    const roofShape: XY[] = [
      [px - halfW - o, pz - halfD - o],
      [px + halfW + o, pz - halfD - o],
      [px + halfW + o, pz + halfD + o],
      [px - halfW - o, pz + halfD + o],
    ];
    nodes.push(
      extrudeNode(`${input.id}-roof`, roofShape, FLAT_ROOF_THICKNESS, roofColor, [0, py + h, 0])
    );
  } else {
    // Gable: ridge along Z at (px, py + h + hr, pz). Each slab is an extrude
    // centered at its slope midpoint, tilted ±theta about Z (see plan Task 6).
    const hr = input.roofHeight ?? Math.max(1, w * 0.22);
    const run = halfW + ROOF_OVERHANG;
    const slope = Math.hypot(run, hr);
    const theta = Math.atan2(hr, run);
    const zSpan = d + 2 * ROOF_OVERHANG;
    const slabShape: XY[] = [
      [-slope / 2, -zSpan / 2],
      [slope / 2, -zSpan / 2],
      [slope / 2, zSpan / 2],
      [-slope / 2, zSpan / 2],
    ];
    nodes.push(
      extrudeNode(
        `${input.id}-roof-r`,
        slabShape,
        ROOF_SLAB_THICKNESS,
        roofColor,
        [px + run / 2, py + h + hr / 2, pz],
        [0, 0, -theta]
      )
    );
    nodes.push(
      extrudeNode(
        `${input.id}-roof-l`,
        slabShape,
        ROOF_SLAB_THICKNESS,
        roofColor,
        [px - run / 2, py + h + hr / 2, pz],
        [0, 0, theta]
      )
    );
  }

  return { newNodes: nodes };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @asset-studio/llm-adapter test && pnpm --filter @asset-studio/scene-engine test`
Expected: PASS — llm-adapter (orchestrator 10 + defaults 2 + house 6 + road 4 + glm 6 + claude 4 = 32), scene-engine 44.

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/templates/createHouse.ts packages/llm-adapter/tests/templates.test.ts packages/scene-engine/tests/templates.test.ts
git commit -m "feat(llm-adapter): gable roof + floor bands in create_house template"
```

---

### Task 7: Tool definitions + system prompt match the new contract

**Files:**
- Modify: `packages/llm-adapter/src/tools.ts` (`create_house` definition, `SYSTEM_PROMPT`)
- Test: `packages/llm-adapter/tests/tools.test.ts` (new)

Why: the LLM can only call what `TOOL_DEFINITIONS` advertises. Without `floors`/`roofStyle` in the schema the model will keep sending `size`-only boxes; and the prompt should tell the model that results arrive as feedback messages and that rounds are capped.

- [ ] **Step 1: Write the failing tests**

Create `packages/llm-adapter/tests/tools.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS, SYSTEM_PROMPT } from "../src/tools";

describe("TOOL_DEFINITIONS", () => {
  const house = TOOL_DEFINITIONS.find((t) => t.name === "create_house");
  it("includes create_house", () => expect(house).toBeDefined());

  it("create_house exposes floors and roofStyle, requires only id+position", () => {
    if (!house) throw new Error("missing create_house");
    expect(Object.keys(house.input_schema.properties)).toContain("floors");
    expect(Object.keys(house.input_schema.properties)).toContain("roofStyle");
    expect(Object.keys(house.input_schema.properties)).toContain("roofHeight");
    expect(house.input_schema.required).toEqual(["id", "position"]);
  });
});

describe("SYSTEM_PROMPT", () => {
  it("documents the tool-result feedback loop and round cap", () => {
    expect(SYSTEM_PROMPT).toMatch(/result in the next message/);
    expect(SYSTEM_PROMPT).toMatch(/at most \d+ tool rounds/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: FAIL — required is `["id","position","size"]`, no `roofStyle` property, no round-cap sentence.

- [ ] **Step 3: Implement**

In `tools.ts`, replace the `create_house` entry of `TOOL_DEFINITIONS`:

```ts
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
          description: "Gable ridge height; default max(1, width*0.22)",
        },
        wallColor: { type: "string" },
        roofColor: { type: "string" },
      },
      required: ["id", "position"],
    },
  },
```

Replace the `Rules:` block of `SYSTEM_PROMPT` with:

```text
Rules:
- Always call exactly one tool per turn.
- Read the current scene JSON provided in the user message to decide what to add.
- Use template tools (create_house, create_road) when the user asks for a recognizable object. Use primitive tools for refinements.
- IDs must be unique across the scene. Prefix with the object kind (e.g. wall-01, roof-01).
- Colors are hex strings like "#aabbcc".
- Vec3 values are [x, y, z] tuples.
- After calling a tool you will receive the result in the next message, including the updated scene JSON. Use it to verify and plan the next step.
- Keep the session short: at most 6 tool rounds per request, then summarize what was built.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: PASS (35 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/tools.ts packages/llm-adapter/tests/tools.test.ts
git commit -m "feat(llm-adapter): advertise floors/roofStyle, document feedback loop"
```

---

### Task 8: apps/web vitest harness

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`

Why: `chatStore.sendPrompt` is the integration heart and currently untested; every subsequent store task needs a runner. Node environment is enough (Zustand stores guard `window` internally).

- [ ] **Step 1: Add vitest**

```bash
pnpm --filter @asset-studio/web add -D vitest@^2.1.0
```

- [ ] **Step 2: Create `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

- [ ] **Step 3: Add the test script**

In `apps/web/package.json` scripts add:

```json
    "test": "vitest run"
```

- [ ] **Step 4: Verify the binary runs**

Run: `pnpm --filter @asset-studio/web exec vitest --version`
Expected: prints `2.1.x`. (`vitest run` with zero tests exits 1, so the first real run happens in Task 9.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(web): add vitest harness"
```

---

### Task 9: llmStore — per-provider model override (moves MODELS here)

**Files:**
- Modify: `apps/web/src/store/llmStore.ts`
- Test: `apps/web/src/store/llmStore.test.ts` (new)

Why: model IDs are hardcoded in chatStore (`glm-4.5-air` on the Coding-Plan endpoint is a suspect pairing). A persisted per-provider override lets the user fix a 404 model error in the UI without a code edit, and gives ChatPanel one source of truth.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/store/llmStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
});

import { useLlmStore, DEFAULT_MODELS } from "./llmStore";

beforeEach(() => {
  store.clear();
  useLlmStore.setState({
    provider: "claude",
    claudeApiKey: "",
    glmApiKey: "",
    n9routerApiKey: "",
    apiKey: "",
    models: { ...DEFAULT_MODELS },
  });
});

describe("llmStore models", () => {
  it("defaults to DEFAULT_MODELS", () => {
    expect(useLlmStore.getState().models.glm).toBe(DEFAULT_MODELS.glm);
  });

  it("setModel persists per provider and updates state", () => {
    useLlmStore.getState().setModel("glm", "glm-4.6");
    expect(useLlmStore.getState().models.glm).toBe("glm-4.6");
    expect(store.get("asset-studio:model:glm")).toBe("glm-4.6");
  });

  it("setModel with empty string reverts to default and clears storage", () => {
    useLlmStore.getState().setModel("glm", "glm-4.6");
    useLlmStore.getState().setModel("glm", "");
    expect(useLlmStore.getState().models.glm).toBe(DEFAULT_MODELS.glm);
    expect(store.has("asset-studio:model:glm")).toBe(false);
  });

  it("hydrate reads persisted models with defaults for the rest", () => {
    store.set("asset-studio:model:claude", "claude-haiku-4-5");
    useLlmStore.getState().hydrateFromStorage();
    expect(useLlmStore.getState().models.claude).toBe("claude-haiku-4-5");
    expect(useLlmStore.getState().models.n9router).toBe(DEFAULT_MODELS.n9router);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @asset-studio/web test`
Expected: FAIL — no `DEFAULT_MODELS` export, no `models` state.

- [ ] **Step 3: Implement**

In `apps/web/src/store/llmStore.ts`:

Add after the storage-key constants:

```ts
const MODEL_STORAGE_PREFIX = "asset-studio:model:";

// ponytail: GLM defaults to the Coding Plan endpoint; 'glm-4.6' is the
// subscription model. Users can override per provider in the chat panel.
export const DEFAULT_MODELS: Record<Provider, string> = {
  claude: "claude-sonnet-4-6",
  glm: "glm-4.6",
  n9router: "glm/glm-5.1",
};
```

Extend `LlmState`:

```ts
  /** Active model per provider (override persisted in localStorage). */
  models: Record<Provider, string>;
  setModel: (provider: Provider, model: string) => void;
```

Add to initial state:

```ts
  models: { ...DEFAULT_MODELS },
```

Add the action (inside `create`):

```ts
  setModel: (provider, model) => {
    const trimmed = model.trim();
    if (typeof window !== "undefined") {
      try {
        if (trimmed) {
          window.localStorage.setItem(MODEL_STORAGE_PREFIX + provider, trimmed);
        } else {
          window.localStorage.removeItem(MODEL_STORAGE_PREFIX + provider);
        }
      } catch {
        // ignore quota / privacy errors
      }
    }
    set((s) => ({
      models: {
        ...s.models,
        [provider]: trimmed || DEFAULT_MODELS[provider],
      },
    }));
  },
```

In `hydrateFromStorage`, read models before the final `set(...)`:

```ts
    const readModel = (p: Provider): string => {
      try {
        return (
          window.localStorage.getItem(MODEL_STORAGE_PREFIX + p) ??
          DEFAULT_MODELS[p]
        );
      } catch {
        return DEFAULT_MODELS[p];
      }
    };
    const models: Record<Provider, string> = {
      claude: readModel("claude"),
      glm: readModel("glm"),
      n9router: readModel("n9router"),
    };
```

and include `models` in the final `set({ ... })` call.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @asset-studio/web test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/store/llmStore.ts apps/web/src/store/llmStore.test.ts
git commit -m "feat(web): per-provider model override in llmStore"
```

---

### Task 10: chatStore — surface errors, live assistant bubbles, model override, feedback wiring

**Files:**
- Modify: `apps/web/src/store/chatStore.ts`
- Modify: `apps/web/src/components/ChatPanel.tsx` (MODELS import fix)
- Test: `apps/web/src/store/chatStore.test.ts` (new)

Why: today an adapter throw (401 bad key, 404 model, network) sets `lastError` but pushes nothing to the thread — the UI just stops spinning with no explanation. Assistant text arrives only after the whole loop. And `createAdapter` should use the new `llmStore.models`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/store/chatStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const runWithRetryMock = vi.fn();
vi.mock("@asset-studio/llm-adapter", () => ({
  SYSTEM_PROMPT: "sys",
  TOOL_DEFINITIONS: [],
  runWithRetry: (...args: unknown[]) => runWithRetryMock(...args),
  createClaudeAdapter: vi.fn(() => ({})),
  createGLMAdapter: vi.fn(() => ({})),
  createN9RouterAdapter: vi.fn(() => ({})),
}));

import { useChatStore } from "./chatStore";
import { useLlmStore } from "./llmStore";
import { useSceneStore } from "./sceneStore";

beforeEach(() => {
  runWithRetryMock.mockReset();
  useLlmStore.setState({
    provider: "claude",
    claudeApiKey: "test-key",
    glmApiKey: "",
    n9routerApiKey: "",
    apiKey: "test-key",
  });
  useSceneStore.setState({
    scene: { version: "0.1", nodes: [] },
    history: [],
    future: [],
    selectedId: null,
    hiddenIds: [],
    lastAction: "",
    triCount: 0,
    exportTick: 0,
  });
  useChatStore.getState().reset();
});

describe("sendPrompt", () => {
  it("pushes an error entry when the adapter throws", async () => {
    runWithRetryMock.mockRejectedValue(new Error("Claude chat failed: 401"));
    await useChatStore.getState().sendPrompt("buat rumah");
    const entries = useChatStore.getState().entries;
    expect(entries.at(-1)?.kind).toBe("error");
    if (entries.at(-1)?.kind !== "error") return;
    expect(entries.at(-1)?.text).toContain("401");
    expect(useChatStore.getState().status).toBe("error");
  });

  it("pushes an error entry when finalStatus is error", async () => {
    runWithRetryMock.mockResolvedValue({
      assistantMessages: [],
      finalStatus: "error",
      lastError: 'Tool "create_house" failed: INVALID_INPUT',
    });
    await useChatStore.getState().sendPrompt("buat rumah");
    const entries = useChatStore.getState().entries;
    expect(entries.at(-1)?.kind).toBe("error");
    if (entries.at(-1)?.kind !== "error") return;
    expect(entries.at(-1)?.text).toContain("INVALID_INPUT");
  });

  it("forwards onAssistant as live assistant entries without tail duplicates", async () => {
    runWithRetryMock.mockImplementation(async (opts) => {
      opts.onAssistant?.("membuat rumah…");
      opts.onAssistant?.("selesai");
      return { assistantMessages: [], finalStatus: "ok" };
    });
    await useChatStore.getState().sendPrompt("buat rumah");
    const kinds = useChatStore.getState().entries.map((e) => e.kind);
    expect(kinds).toEqual(["user", "assistant", "assistant"]);
  });

  it("wires getSceneState, maxToolRounds and the system prompt", async () => {
    runWithRetryMock.mockResolvedValue({ assistantMessages: [], finalStatus: "ok" });
    await useChatStore.getState().sendPrompt("buat rumah");
    const opts = runWithRetryMock.mock.calls[0]![1];
    expect(opts.maxToolRounds).toBe(6);
    expect(typeof opts.getSceneState).toBe("function");
    expect(opts.getSceneState()).toContain('"version"');
    expect(opts.systemPrompt).toBe("sys");
  });

  it("errors without key and never calls the adapter", async () => {
    useLlmStore.setState({ claudeApiKey: "", apiKey: "" });
    await useChatStore.getState().sendPrompt("buat rumah");
    expect(runWithRetryMock).not.toHaveBeenCalled();
    const entries = useChatStore.getState().entries;
    expect(entries.at(-1)?.kind).toBe("error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @asset-studio/web test`
Expected: FAIL — `opts` missing `maxToolRounds`/`getSceneState`; error entries not pushed; live assistant not forwarded.

- [ ] **Step 3: Implement**

In `apps/web/src/store/chatStore.ts`:

Delete the local `MODELS` map (lines 22-26 including its ponytail comment); import from llmStore instead:

```ts
import { useLlmStore, DEFAULT_MODELS, type Provider } from './llmStore';
```

Update `createAdapter`:

```ts
function createAdapter(provider: string, apiKey: string): LLMAdapter {
  const model =
    useLlmStore.getState().models[provider as Provider] ??
    DEFAULT_MODELS[provider as Provider];
  if (provider === 'glm') {
    return createGLMAdapter({ apiKey, model, tools: TOOL_DEFINITIONS });
  }
  if (provider === 'n9router') {
    return createN9RouterAdapter({ apiKey, model, tools: TOOL_DEFINITIONS });
  }
  return createClaudeAdapter({ apiKey, model, tools: TOOL_DEFINITIONS });
}
```

Add a constant next to `MAX_RETRIES`:

```ts
const MAX_TOOL_ROUNDS = 6;
```

Replace the try-block of `sendPrompt` (from `const adapter = ...` through the final `set(...)`) with:

```ts
      const adapter = createAdapter(llm.provider, llm.apiKey);

      const result = await runWithRetry({
        adapter,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userPayload,
        tools: TOOL_DEFINITIONS,
        maxRetries: MAX_RETRIES,
        maxToolRounds: MAX_TOOL_ROUNDS,
        getSceneState: () =>
          JSON.stringify(useSceneStore.getState().scene),
        onAssistant: (content) =>
          push({ kind: 'assistant', text: content }),
        applyToolCall: async (name, input) => {
          const t0 = performance.now();
          const res = useSceneStore
            .getState()
            .applyToolCall({ name, input } as ToolCall);
          const ms = Math.round(performance.now() - t0);
          push({
            kind: 'tool',
            name,
            input: input as Record<string, unknown>,
            ok: res.ok,
            error: res.error,
            ms,
          });
          return res;
        },
      });

      // ponytail: assistant bubbles already streamed via onAssistant; only
      // surface an error tail here.
      if (result.finalStatus === 'error') {
        const msg = result.lastError ?? 'unknown error';
        push({ kind: 'error', text: `Sesi berhenti dengan galat: ${msg}` });
      }
      set({
        status: result.finalStatus === 'ok' ? 'idle' : 'error',
        lastError: result.lastError ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      push({ kind: 'error', text: msg });
      set({ status: 'error', lastError: msg });
    }
```

Note: `result.assistantMessages` is intentionally no longer appended — `onAssistant` already pushed each non-empty turn live, and the orchestrator filters empties.

Fix the now-broken import in `apps/web/src/components/ChatPanel.tsx` (it imports `MODELS` from chatStore):
- Change line 4 to `import { useChatStore, type ChatEntry } from "../store/chatStore";`
- Add reactive model read: `const model = useLlmStore((s) => s.models[provider]);`
- Chip becomes `{`${model} · tool-calling`}`

- [ ] **Step 4: Run tests + typecheck to verify they pass**

Run: `pnpm --filter @asset-studio/web test && npx tsc --noEmit -p apps/web`
Expected: chatStore 5 + llmStore 4 PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/store/chatStore.ts apps/web/src/store/chatStore.test.ts apps/web/src/components/ChatPanel.tsx
git commit -m "feat(web): surface LLM errors in thread, stream assistant turns live"
```

---

### Task 11: UI — model override input + thinking timer + honest rail copy

**Files:**
- Modify: `apps/web/src/components/ChatPanel.tsx`
- Modify: `apps/web/src/components/SceneRail.tsx:74-77`

Why: (a) the model override from Task 9 needs an input; (b) "menyusun rencana…" with no progress was the user's "thinking lama" complaint — an elapsed timer plus live bubbles (Task 10) make waits legible; (c) SceneRail advertises `create_house(floors, roof_style)` — only now true; keep copy exact.

- [ ] **Step 1: ChatPanel — model input + timer**

In `ChatPanel.tsx`:

Merge the llmStore import to include `DEFAULT_MODELS`:

```ts
import { DEFAULT_MODELS, useLlmStore, type Provider } from "../store/llmStore";
```

Add state/selectors in the component:

```ts
  const model = useLlmStore((s) => s.models[provider]);
  const setModel = useLlmStore((s) => s.setModel);
  const [modelInput, setModelInput] = useState("");
```

Elapsed timer (below the existing `thinking` derivation):

```ts
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (status !== "thinking") {
      setElapsed(0);
      return;
    }
    const t0 = performance.now();
    const id = window.setInterval(
      () => setElapsed((performance.now() - t0) / 1000),
      100,
    );
    return () => window.clearInterval(id);
  }, [status]);
```

Model row — render directly under `.chat-head` (always visible, so users can fix a 404 model instantly):

```tsx
      <div className="keyform">
        <div className="keyrow">
          <input
            className="num"
            type="text"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder={`model · default ${DEFAULT_MODELS[provider]}`}
            aria-label={`Override model ${PROVIDER_LABEL[provider]}`}
            style={{ flex: 1 }}
          />
          <button
            className="ghost"
            type="button"
            disabled={thinking || !modelInput.trim()}
            onClick={() => {
              setModel(provider, modelInput.trim());
              setModelInput("");
            }}
          >
            set model
          </button>
          {model !== DEFAULT_MODELS[provider] && (
            <button
              className="ghost"
              type="button"
              disabled={thinking}
              onClick={() => setModel(provider, "")}
            >
              reset
            </button>
          )}
        </div>
      </div>
```

Thinking bubble text becomes:

```tsx
            <span>{`menyusun rencana… ${elapsed.toFixed(1)}s`}</span>
```

- [ ] **Step 2: SceneRail — honest Layer-2 copy**

Replace `LAYER2_TOOLS` (lines 74-77) with:

```ts
const LAYER2_TOOLS = [
  {
    tn: "create_house(floors, roof_style)",
    comp: "= extrude dinding + band + atap",
  },
  { tn: "create_road(path, width)", comp: "= extrude ×1" },
];
```

- [ ] **Step 3: Verify visually**

Run: `pnpm --filter @asset-studio/web dev` (or reuse the running server on :3000)
Open http://localhost:3000 → check: model row under chat header; chip shows active model; with no key, sending a prompt shows the red error bubble; thinking state shows a counting timer.

- [ ] **Step 4: Run full checks**

Run: `npx tsc --noEmit -p apps/web && pnpm -r test`
Expected: all green (schema 5, llm-adapter 35, scene-engine 44, web 9).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ChatPanel.tsx apps/web/src/components/SceneRail.tsx
git commit -m "feat(web): model override input, thinking timer, honest rail copy"
```

---

### Task 12: End-to-end verification (real key golden path)

**Files:** none (verification + fix-forward if needed)

- [ ] **Step 1: Full suite + build**

Run: `pnpm -r test && npx tsc --noEmit -p apps/web && pnpm --filter @asset-studio/web build`
Expected: all tests pass; production build succeeds (4 static pages).

- [ ] **Step 2: Manual golden path (user provides a real key)**

Start dev server, open http://localhost:3000, then:

1. Topbar → pilih provider (mis. GLM, atau 9Router jika proxy lokal jalan).
2. Paste API key → "Simpan". Refresh halaman — key masih ada (localStorage).
3. Klik chip **"Buat rumah 2 lantai dengan atap pelana"**.
4. EXPECT: bubble user → kartu tool `create_house` hijau (params memuat `floors: 2`, `roofStyle: "gable"`) → bubble asisten ringkas. Tidak ada error kosong / 400.
5. EXPECT viewport: rumah 2 lantai — dinding, band lantai di tengah, DUA bidang atap miring membentuk pelana (bukan slab datar).
6. EXPECT SceneRail: node `house-01-walls`, `house-01-floor-1`, `house-01-roof-l`/`-r`; stats strip objek/tri bertambah; snapshot # bertambah.
7. Klik chip **"Buat jalan sepanjang 8 meter"** → strip jalan muncul; rumah tetap.
8. Prompt "Ubah material objek pertama jadi hijau" → kartu `set_material` hijau; dinding berubah warna.
9. Topbar → Ekspor GLB → file `procedural-scene-v1.glb` terunduh.
10. Negative: hapus key lalu kirim prompt → error bubble jelas; key salah → bubble error memuat pesan 401 dari provider.

- [ ] **Step 3: Fix-forward anything broken, then final commit**

```bash
git add -A
git commit -m "fix: golden-path corrections from manual verification"
```

(only if changes were needed)

---

## Self-Review

1. **Spec coverage** — Golden path: key UI exists (already), prompt→tool-call→execute→render exists; this plan fixes every link that breaks live: empty-message 400 (T1), feedback loop (T2), loop cap (T3), timeouts/tokens (T4), gable/floors expressibility (T5-T7), error visibility + live bubbles (T10), model debugging (T9/T11), regression safety (T8, T12). PRD §6.4 constraints honored (manual SDK, pnpm monorepo, localStorage keys).
2. **Placeholder scan** — every step carries exact code/commands; no TBD/TODO.
3. **Type consistency** — `RunWithRetryOptions.maxToolRounds`/`getSceneState`/`onAssistant` defined in T2/T3, consumed in T10; `DEFAULT_MODELS` defined in T9, consumed in T10 (chatStore + ChatPanel) and T11; roof ids `-roof-l`/`-roof-r` consistent between T6 template, T6 tests, and scene-engine tests; `models: Record<Provider, string>` consistent across T9 store/tests and T10/T11 ChatPanel usage. Deliberate deviation: Task 4's SDK-option wiring is verified by the constants test + typecheck, not SDK-client introspection.

## Risks

- GLM Coding-Plan model name (`glm-4.6`) unverified without a live key — mitigated by the Task 11 override input.
- Gable end caps are open (no triangle infill) — accepted v1 limitation, noted in the template ponytail.
- `pnpm --filter @asset-studio/web add -D vitest` may resolve a different vitest major than sibling packages — pin `^2.1.0` (same as schema/llm-adapter).

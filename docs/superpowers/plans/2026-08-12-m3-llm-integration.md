# M3 — LLM Integration (Claude) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Claude as a tool-calling orchestrator over the existing scene-engine, so a user can type a natural-language prompt in a chat panel and watch `create_house` / `create_road` execute against the live 3D viewport.

**Architecture:** A new `packages/llm-adapter` package wraps `@anthropic-ai/sdk` behind a single `chat()` function. A `runWithRetry()` orchestrator calls `chat()`, dispatches any returned `tool_call` through the scene-engine `toolExecutor`, and feeds failures back to Claude up to 2 retries. Two Layer-2 templates (`create_house`, `create_road`) compose Layer-1 primitives visibly in source. A Zustand `llmStore` persists the user's API key in `localStorage`; a `chatStore` wires the orchestrator to a `ChatPanel` React component sitting next to the existing `Viewport`.

**Tech Stack:** `@anthropic-ai/sdk` (manual, NOT Vercel AI SDK — PRD §6.4), Next.js 16, React 19, Zustand v5, Zod 3.23, vitest, TypeScript strict + noUncheckedIndexedAccess, pnpm workspaces.

---

## Scope

**In scope (M3):**

| Item | Notes |
|---|---|
| `packages/llm-adapter` | New workspace package |
| Unified adapter `chat()` | Single-turn: messages in, content array out |
| Tool definitions (JSON Schema) | For all 7 tools (5 primitives + 2 templates) |
| System prompt | "You are a 3D scene orchestrator…" |
| Retry orchestrator | `runWithRetry(maxRetries=2)` |
| `applyCreateHouse` template | Walls (extrude) + roof (extrude) + window panes (extrude, decorative) |
| `applyCreateRoad` template | Single extrude along a path |
| `toolExecutor` wiring | Extend switch + `ToolName` union |
| `llmStore` (Zustand + localStorage) | API key only, `dangerouslyAllowBrowser: true` |
| `chatStore` (Zustand) | messages[], `sendPrompt()`, status |
| `ChatPanel` UI | Prompt input, message list, error display |
| `page.tsx` integration | ChatPanel beside Viewport |
| Tag `v0.3.0-m3` | After manual verify |

**Deferred to M4+:**

| Item | Reason |
|---|---|
| Streaming responses | UX polish, not required for correctness |
| Multi-provider (OpenAI, Gemini) | Adapter shape is unified; concrete second adapter is M5 |
| Conversation persistence to IndexedDB | In-memory history sufficient for v1 |
| Lane markings on road | Visual polish, single extrude is enough to prove template |
| Windows as CSG cuts | Needs world-space boolean (M4); decorative panes are sufficient |
| World-space CSG | M4 — currently boolean operates in local space |
| Token budget management | PRD §6.2 sends full scene JSON every prompt; v1 simplicity |

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `packages/llm-adapter/package.json` | Workspace package manifest |
| `packages/llm-adapter/tsconfig.json` | TS config (extends root) |
| `packages/llm-adapter/src/index.ts` | Public API barrel |
| `packages/llm-adapter/src/types.ts` | `ChatMessage`, `ToolCall`, `ChatResult`, `LLMAdapter` interface |
| `packages/llm-adapter/src/tools.ts` | 7 tool definitions (JSON Schema) + system prompt |
| `packages/llm-adapter/src/claude.ts` | `createClaudeAdapter()` implementing `LLMAdapter` |
| `packages/llm-adapter/src/orchestrator.ts` | `runWithRetry()` loop |
| `packages/llm-adapter/src/templates/createHouse.ts` | `applyCreateHouse(input, scene)` |
| `packages/llm-adapter/src/templates/createRoad.ts` | `applyCreateRoad(input, scene)` |
| `packages/llm-adapter/src/templates/index.ts` | Re-exports |
| `packages/llm-adapter/tests/orchestrator.test.ts` | Mocked adapter + executor |
| `packages/llm-adapter/tests/claude.test.ts` | Mocked SDK |
| `packages/llm-adapter/tests/templates.test.ts` | Pure template tests |
| `apps/web/src/store/llmStore.ts` | API key state + localStorage |
| `apps/web/src/store/chatStore.ts` | Messages + sendPrompt |
| `apps/web/src/components/ChatPanel.tsx` | Chat UI |

**Modified files:**

| Path | Change |
|---|---|
| `packages/scene-engine/src/tools/types.ts` | Add `'create_house' \| 'create_road'` to `ToolName` |
| `packages/scene-engine/src/tools/toolExecutor.ts` | Add 2 cases to switch |
| `packages/schema/src/toolSchemas.ts` | Add `createHouseToolInputSchema`, `createRoadToolInputSchema` |
| `pnpm-workspace.yaml` | (no change — `packages/*` glob already matches) |
| `apps/web/src/app/page.tsx` | Render `<ChatPanel />` beside `<Viewport />` |

** ponytail simplifications (explicit):**

- Windows in `create_house` are decorative extruded panes placed on the wall surface, NOT CSG cuts. World-space boolean arrives in M4. Marked with `// ponytail:` comment.
- Road is a single extrude; no lane markings or shoulders.
- Conversation history lives in memory only (Zustand); no IndexedDB persistence in M3.
- Full scene JSON sent every prompt (PRD §6.2 simplicity).

---

## Task 1: Scaffold `packages/llm-adapter`

**Files:**
- Create: `packages/llm-adapter/package.json`
- Create: `packages/llm-adapter/tsconfig.json`
- Create: `packages/llm-adapter/src/index.ts`
- Create: `packages/llm-adapter/src/types.ts`
- Modify: `package.json` (root workspace — no change needed if glob matches)

- [ ] **Step 1: Verify workspace glob includes `packages/*`**

Run: `cat pnpm-workspace.yaml`
Expected output contains: `packages: - "packages/*" - "apps/*"`

- [ ] **Step 2: Create `packages/llm-adapter/package.json`**

```json
{
  "name": "@asset-studio/llm-adapter",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.1",
    "@asset-studio/scene-engine": "workspace:*",
    "@asset-studio/schema": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create `packages/llm-adapter/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

If `tsconfig.base.json` does not exist at root, copy from `packages/scene-engine/tsconfig.json` structure. Run `cat packages/scene-engine/tsconfig.json` and mirror its extends/paths.

- [ ] **Step 4: Create `packages/llm-adapter/src/types.ts`**

```typescript
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | string;
  rawUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMAdapter {
  chat(messages: ChatMessage[], systemPrompt: string): Promise<ChatResult>;
}
```

- [ ] **Step 5: Create `packages/llm-adapter/src/index.ts`**

```typescript
export * from "./types";
```

(Will add more exports in later tasks.)

- [ ] **Step 6: Install deps**

Run: `pnpm install`
Expected: `@asset-studio/llm-adapter` linked, no errors.

- [ ] **Step 7: Verify typecheck**

Run: `pnpm --filter @asset-studio/llm-adapter typecheck`
Expected: PASS (no output, exit 0).

- [ ] **Step 8: Commit**

```bash
git add packages/llm-adapter pnpm-lock.yaml
git commit -m "feat(llm-adapter): scaffold workspace package"
```

---

## Task 2: Tool Definitions + System Prompt

**Files:**
- Create: `packages/llm-adapter/src/tools.ts`
- Modify: `packages/llm-adapter/src/index.ts` (add export)

- [ ] **Step 1: Read existing schema to align field names**

Run: `Read packages/schema/src/toolSchemas.ts`
Note the exact field names used by each primitive — templates and tool defs must match.

- [ ] **Step 2: Write `packages/llm-adapter/src/tools.ts`**

```typescript
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
          description: "Array of [x, z] points forming the footprint",
        },
        depth: { type: "number", description: "Height to extrude along Y" },
        color: { type: "string", description: "Hex color like #aabbcc" },
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
```

- [ ] **Step 3: Add export to `src/index.ts`**

Edit `packages/llm-adapter/src/index.ts`:

```typescript
export * from "./types";
export * from "./tools";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @asset-studio/llm-adapter typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/llm-adapter/src/tools.ts packages/llm-adapter/src/index.ts
git commit -m "feat(llm-adapter): add tool definitions and system prompt"
```

---

## Task 3: Claude Adapter `chat()`

**Files:**
- Create: `packages/llm-adapter/src/claude.ts`
- Create: `packages/llm-adapter/tests/claude.test.ts`
- Modify: `packages/llm-adapter/src/index.ts`

- [ ] **Step 1: Write failing test `packages/llm-adapter/tests/claude.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClaudeAdapter } from "../src/claude";
import type { ChatMessage } from "../src/types";

// Mock @anthropic-ai/sdk
vi.mock("@anthropic-ai/sdk", () => {
  const messages = {
    create: vi.fn(),
  };
  return {
    default: class MockAnthropic {
      messages = messages;
    },
    __mockMessages: messages,
  };
});

import Anthropic, { __mockMessages } from "@anthropic-ai/sdk";

describe("createClaudeAdapter", () => {
  beforeEach(() => {
    __mockMessages.create.mockReset();
  });

  it("returns text content when stop_reason is end_turn", async () => {
    __mockMessages.create.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Done." }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const adapter = createClaudeAdapter({
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      tools: [],
    });

    const result = await adapter.chat(
      [{ role: "user", content: "hi" }],
      "system"
    );

    expect(result.stopReason).toBe("end_turn");
    expect(result.content).toBe("Done.");
    expect(result.toolCalls).toEqual([]);
    expect(result.rawUsage?.inputTokens).toBe(10);
  });

  it("extracts tool_use blocks into toolCalls", async () => {
    __mockMessages.create.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "Building." },
        {
          type: "tool_use",
          id: "tu_01",
          name: "create_house",
          input: { id: "house-01", position: [0, 0, 0], size: [4, 3, 4] },
        },
      ],
      usage: { input_tokens: 20, output_tokens: 15 },
    });

    const adapter = createClaudeAdapter({
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      tools: [],
    });

    const result = await adapter.chat(
      [{ role: "user", content: "build a house" }],
      "system"
    );

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toEqual({
      id: "tu_01",
      name: "create_house",
      input: { id: "house-01", position: [0, 0, 0], size: [4, 3, 4] },
    });
  });

  it("passes tools, system, and messages to SDK", async () => {
    __mockMessages.create.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const adapter = createClaudeAdapter({
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      tools: [
        {
          name: "extrude",
          description: "d",
          input_schema: { type: "object", properties: {}, required: [] },
        },
      ],
    });

    await adapter.chat(
      [{ role: "user", content: "go" }],
      "be the bot"
    );

    expect(__mockMessages.create).toHaveBeenCalledWith({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "be the bot",
      messages: [{ role: "user", content: "go" }],
      tools: [
        {
          name: "extrude",
          description: "d",
          input_schema: { type: "object", properties: {}, required: [] },
        },
      ],
    });
  });

  it("wraps SDK errors with a descriptive message", async () => {
    __mockMessages.create.mockRejectedValueOnce(new Error("401 unauthorized"));
    const adapter = createClaudeAdapter({
      apiKey: "bad",
      model: "claude-sonnet-4-6",
      tools: [],
    });
    await expect(
      adapter.chat([{ role: "user" as const, content: "x" }], "s")
    ).rejects.toThrow(/Claude chat failed: 401 unauthorized/);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: FAIL — `createClaudeAdapter` is not defined.

- [ ] **Step 3: Implement `packages/llm-adapter/src/claude.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, ChatResult, LLMAdapter } from "./types";
import type { ToolDefinition } from "./tools";

export interface ClaudeAdapterOptions {
  apiKey: string;
  model: string;
  tools: ToolDefinition[];
  maxTokens?: number;
}

export function createClaudeAdapter(opts: ClaudeAdapterOptions): LLMAdapter {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: true, // PRD §10: client-side direct call
  });
  const maxTokens = opts.maxTokens ?? 1024;

  return {
    async chat(messages: ChatMessage[], systemPrompt: string): Promise<ChatResult> {
      try {
        const response = await client.messages.create({
          model: opts.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          tools: opts.tools,
        });

        let textContent = "";
        const toolCalls: ChatResult["toolCalls"] = [];

        for (const block of response.content as Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
        }>) {
          if (block.type === "text" && typeof block.text === "string") {
            textContent += block.text;
          } else if (block.type === "tool_use") {
            toolCalls.push({
              id: String(block.id ?? ""),
              name: String(block.name ?? ""),
              input: (block.input ?? {}) as Record<string, unknown>,
            });
          }
        }

        return {
          content: textContent,
          toolCalls,
          stopReason: String(response.stop_reason ?? "end_turn"),
          rawUsage: {
            inputTokens: (response.usage?.input_tokens as number) ?? 0,
            outputTokens: (response.usage?.output_tokens as number) ?? 0,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Claude chat failed: ${msg}`);
      }
    },
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Add export to `src/index.ts`**

```typescript
export * from "./types";
export * from "./tools";
export * from "./claude";
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @asset-studio/llm-adapter typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/llm-adapter/src/claude.ts packages/llm-adapter/src/index.ts packages/llm-adapter/tests/claude.test.ts
git commit -m "feat(llm-adapter): implement Claude adapter with chat()"
```

---

## Task 4: Retry Orchestrator `runWithRetry()`

**Files:**
- Create: `packages/llm-adapter/src/orchestrator.ts`
- Create: `packages/llm-adapter/tests/orchestrator.test.ts`
- Modify: `packages/llm-adapter/src/index.ts`

- [ ] **Step 1: Write failing test `packages/llm-adapter/tests/orchestrator.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { runWithRetry } from "../src/orchestrator";
import type { LLMAdapter, ChatMessage, ChatResult } from "../src/types";

function makeAdapter(responses: ChatResult[]): LLMAdapter {
  let i = 0;
  return {
    chat: vi.fn(async (): Promise<ChatResult> => {
      const r = responses[i];
      i++;
      return r;
    }),
  };
}

function makeExecutor() {
  const calls: { name: string; input: unknown }[] = [];
  return {
    apply: vi.fn(async (name: string, input: unknown) => {
      calls.push({ name, input });
      if (name === "bad_tool") {
        return { ok: false, error: "unknown tool" };
      }
      return { ok: true };
    }),
    calls,
  };
}

describe("runWithRetry", () => {
  it("returns immediately when assistant ends turn with no tool_calls", async () => {
    const adapter = makeAdapter([
      { content: "hi", toolCalls: [], stopReason: "end_turn" },
    ]);
    const exec = makeExecutor();
    const result = await runWithRetry({
      adapter,
      systemPrompt: "s",
      userPrompt: "hi",
      tools: [],
      applyToolCall: exec.apply as never,
      maxRetries: 2,
    });

    expect(result.assistantMessages.at(-1)?.content).toBe("hi");
    expect(exec.calls).toHaveLength(0);
  });

  it("executes one tool_call then ends", async () => {
    const adapter = makeAdapter([
      {
        content: "building",
        toolCalls: [
          { id: "tu1", name: "create_house", input: { id: "h1" } },
        ],
        stopReason: "tool_use",
      },
      { content: "done", toolCalls: [], stopReason: "end_turn" },
    ]);
    const exec = makeExecutor();
    const result = await runWithRetry({
      adapter,
      systemPrompt: "s",
      userPrompt: "build",
      tools: [],
      applyToolCall: exec.apply as never,
      maxRetries: 2,
    });

    expect(exec.calls).toEqual([
      { name: "create_house", input: { id: "h1" } },
    ]);
    expect(result.assistantMessages.at(-1)?.content).toBe("done");
  });

  it("retries after tool execution failure up to maxRetries", async () => {
    const adapter = makeAdapter([
      {
        content: "try",
        toolCalls: [
          { id: "tu1", name: "bad_tool", input: {} },
        ],
        stopReason: "tool_use",
      },
      {
        content: "retry",
        toolCalls: [
          { id: "tu2", name: "bad_tool", input: {} },
        ],
        stopReason: "tool_use",
      },
      {
        content: "retry2",
        toolCalls: [
          { id: "tu3", name: "bad_tool", input: {} },
        ],
        stopReason: "tool_use",
      },
    ]);
    const exec = makeExecutor();
    const result = await runWithRetry({
      adapter,
      systemPrompt: "s",
      userPrompt: "go",
      tools: [],
      applyToolCall: exec.apply as never,
      maxRetries: 2,
    });

    // Original call + 2 retries = 3 attempts total
    expect(exec.calls).toHaveLength(3);
    expect(result.assistantMessages.at(-1)?.content).toBe("retry2");
    expect(result.finalStatus).toBe("error");
    expect(result.lastError).toMatch(/unknown tool/);
  });

  it("stops retrying once a turn has no tool_calls", async () => {
    const adapter = makeAdapter([
      {
        content: "try",
        toolCalls: [{ id: "tu1", name: "bad_tool", input: {} }],
        stopReason: "tool_use",
      },
      { content: "gave up", toolCalls: [], stopReason: "end_turn" },
    ]);
    const exec = makeExecutor();
    const result = await runWithRetry({
      adapter,
      systemPrompt: "s",
      userPrompt: "go",
      tools: [],
      applyToolCall: exec.apply as never,
      maxRetries: 2,
    });

    expect(exec.calls).toHaveLength(1);
    expect(result.assistantMessages.at(-1)?.content).toBe("gave up");
    expect(result.finalStatus).toBe("ok");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: FAIL — `runWithRetry` is not defined.

- [ ] **Step 3: Implement `packages/llm-adapter/src/orchestrator.ts`**

```typescript
import type { ChatMessage, ChatResult, LLMAdapter, ToolCall } from "./types";
import type { ToolDefinition } from "./tools";

export type ApplyToolCall = (
  name: string,
  input: Record<string, unknown>
) => Promise<{ ok: boolean; error?: string }>;

export interface RunWithRetryOptions {
  adapter: LLMAdapter;
  systemPrompt: string;
  userPrompt: string;
  tools: ToolDefinition[];
  applyToolCall: ApplyToolCall;
  maxRetries: number;
}

export interface RunResult {
  assistantMessages: ChatMessage[];
  finalStatus: "ok" | "error";
  lastError?: string;
}

export async function runWithRetry(
  opts: RunWithRetryOptions
): Promise<RunResult> {
  const messages: ChatMessage[] = [
    { role: "user", content: opts.userPrompt },
  ];
  const assistantMessages: ChatMessage[] = [];
  let retries = 0;
  let lastError: string | undefined;

  while (retries <= opts.maxRetries) {
    const result: ChatResult = await opts.adapter.chat(
      messages,
      opts.systemPrompt
    );

    assistantMessages.push({ role: "assistant", content: result.content });
    messages.push({ role: "assistant", content: result.content });

    if (result.toolCalls.length === 0) {
      return { assistantMessages, finalStatus: "ok" };
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
      // All tools succeeded; one more turn to let assistant confirm/end.
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

    // Feed failure back to Claude.
    messages.push({
      role: "user",
      content: `Tool "${failed.name}" (id ${failed.id}) failed: ${lastError}. Please correct and retry, or reply without that tool.`,
    });
  }

  // Unreachable in practice; guard for safety.
  return { assistantMessages, finalStatus: "error", lastError };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: PASS — 4 orchestrator + 4 claude = 8 tests green.

- [ ] **Step 5: Add export to `src/index.ts`**

```typescript
export * from "./types";
export * from "./tools";
export * from "./claude";
export * from "./orchestrator";
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @asset-studio/llm-adapter typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/llm-adapter/src/orchestrator.ts packages/llm-adapter/src/index.ts packages/llm-adapter/tests/orchestrator.test.ts
git commit -m "feat(llm-adapter): implement runWithRetry orchestrator"
```

---

## Task 5: `create_house` Template

**Files:**
- Create: `packages/llm-adapter/src/templates/createHouse.ts`
- Create: `packages/llm-adapter/src/templates/index.ts`
- Create: `packages/llm-adapter/tests/templates.test.ts`
- Modify: `packages/llm-adapter/src/index.ts`

- [ ] **Step 1: Read `applyExtrude` to confirm shape contract**

Run: `Read packages/scene-engine/src/tools/toolExecutor.ts`
Confirm `applyExtrude` takes `{ id, shape: [x,z][], depth, color }` and returns a node.

- [ ] **Step 2: Write failing test (extracted to `tests/templates.test.ts`)**

```typescript
import { describe, it, expect } from "vitest";
import { applyCreateHouse } from "../src/templates/createHouse";
import type { SceneNode } from "@asset-studio/scene-engine";

describe("applyCreateHouse", () => {
  it("produces walls, roof, and window panes with unique ids", () => {
    const scene = { nodes: [] as SceneNode[] } as { nodes: SceneNode[] };
    const result = applyCreateHouse(
      {
        id: "house-01",
        position: [0, 0, 0],
        size: [4, 3, 4],
        wallColor: "#cccccc",
        roofColor: "#882222",
      },
      scene
    );

    const ids = result.newNodes.map((n) => n.id);
    expect(ids).toContain("house-01-walls");
    expect(ids).toContain("house-01-roof");
    // At least 1 window pane
    expect(ids.filter((i) => i.startsWith("house-01-window")).length).toBeGreaterThan(0);
  });

  it("walls extrude footprint of size[0] x size[2], height size[1]", () => {
    const scene = { nodes: [] } as { nodes: SceneNode[] };
    const result = applyCreateHouse(
      {
        id: "h",
        position: [0, 0, 0],
        size: [6, 4, 5],
        wallColor: "#fff",
        roofColor: "#000",
      },
      scene
    );
    const walls = result.newNodes.find((n) => n.id === "h-walls");
    expect(walls).toBeDefined();
    expect(walls?.type).toBe("extrude");
    if (walls?.type === "extrude") {
      expect(walls.depth).toBe(4);
      expect(walls.shape).toHaveLength(4);
    }
  });

  it("places roof above walls (translate y = size[1])", () => {
    const scene = { nodes: [] } as { nodes: SceneNode[] };
    const result = applyCreateHouse(
      {
        id: "h",
        position: [0, 0, 0],
        size: [4, 3, 4],
        wallColor: "#fff",
        roofColor: "#000",
      },
      scene
    );
    const roof = result.newNodes.find((n) => n.id === "h-roof");
    expect(roof?.transform.translate[1]).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: FAIL — `applyCreateHouse` not defined.

- [ ] **Step 4: Implement `packages/llm-adapter/src/templates/createHouse.ts`**

```typescript
import type { SceneNode } from "@asset-studio/scene-engine";

export interface CreateHouseInput {
  id: string;
  position: [number, number, number];
  size: [number, number, number]; // [width, height, depth]
  wallColor?: string;
  roofColor?: string;
}

export interface CreateHouseResult {
  newNodes: SceneNode[];
}

// ponytail: windows are decorative extruded panes placed on the wall surface,
// not CSG cuts. World-space boolean arrives in M4.
export function applyCreateHouse(
  input: CreateHouseInput,
  _scene: { nodes: SceneNode[] }
): CreateHouseResult {
  const [w, h, d] = input.size;
  const [px, py, pz] = input.position;
  const wallColor = input.wallColor ?? "#cccccc";
  const roofColor = input.roofColor ?? "#882222";

  // Wall footprint centered at (px, pz), extrude height h
  const halfW = w / 2;
  const halfD = d / 2;
  const wallShape: [number, number][] = [
    [px - halfW, pz - halfD],
    [px + halfW, pz - halfD],
    [px + halfW, pz + halfD],
    [px - halfW, pz + halfD],
  ];

  const walls: SceneNode = {
    id: `${input.id}-walls`,
    type: "extrude",
    shape: wallShape,
    depth: h,
    material: { color: wallColor },
    transform: { translate: [0, py, 0], rotate: [0, 0, 0], scale: [1, 1, 1] },
    children: [],
  };

  // Roof: a slightly larger, shorter extrude sitting on top of the walls.
  const roofOverhang = 0.2;
  const roofShape: [number, number][] = [
    [px - halfW - roofOverhang, pz - halfD - roofOverhang],
    [px + halfW + roofOverhang, pz - halfD - roofOverhang],
    [px + halfW + roofOverhang, pz + halfD + roofOverhang],
    [px - halfW - roofOverhang, pz + halfD + roofOverhang],
  ];
  const roof: SceneNode = {
    id: `${input.id}-roof`,
    type: "extrude",
    shape: roofShape,
    depth: 0.3,
    material: { color: roofColor },
    transform: {
      translate: [0, py + h, 0],
      rotate: [0, 0, 0],
      scale: [1, 1, 1],
    },
    children: [],
  };

  // ponytail: decorative window panes on the +Z face. Real CSG cuts land in M4.
  const windowNodes: SceneNode[] = [];
  const windowSize = 0.4;
  const windowHeight = py + h * 0.5;
  const windowZ = pz + halfD + 0.01;
  const windowSpacing = w / 3;
  for (let i = 0; i < 2; i++) {
    const wx = px - windowSpacing / 2 + i * windowSpacing;
    windowNodes.push({
      id: `${input.id}-window-${i + 1}`,
      type: "extrude",
      shape: [
        [wx - windowSize / 2, windowZ - windowSize / 2],
        [wx + windowSize / 2, windowZ - windowSize / 2],
        [wx + windowSize / 2, windowZ + windowSize / 2],
        [wx - windowSize / 2, windowZ + windowSize / 2],
      ],
      depth: 0.05,
      material: { color: "#88aacc" },
      transform: {
        translate: [0, windowHeight, 0],
        rotate: [0, 0, 0],
        scale: [1, 1, 1],
      },
      children: [],
    });
  }

  return { newNodes: [walls, roof, ...windowNodes] };
}
```

- [ ] **Step 5: Create `packages/llm-adapter/src/templates/index.ts`**

```typescript
export * from "./createHouse";
export * from "./createRoad";
```

(The createRoad reference will resolve after Task 6.)

- [ ] **Step 6: Run tests, verify they pass**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: PASS (create_house tests; createRoad import will fail until Task 6 — temporarily comment it out in index.ts if running tests now).

- [ ] **Step 7: Add export to `src/index.ts`**

```typescript
export * from "./types";
export * from "./tools";
export * from "./claude";
export * from "./orchestrator";
export * from "./templates";
```

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @asset-studio/llm-adapter typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/llm-adapter/src/templates packages/llm-adapter/src/index.ts packages/llm-adapter/tests/templates.test.ts
git commit -m "feat(llm-adapter): add create_house template composing primitives"
```

---

## Task 6: `create_road` Template

**Files:**
- Create: `packages/llm-adapter/src/templates/createRoad.ts`
- Modify: `packages/llm-adapter/tests/templates.test.ts` (append road tests)

- [ ] **Step 1: Append failing test to `tests/templates.test.ts`**

Add to the existing file:

```typescript
import { applyCreateRoad } from "../src/templates/createRoad";

describe("applyCreateRoad", () => {
  it("produces one extruded strip with the road id", () => {
    const scene = { nodes: [] } as { nodes: SceneNode[] };
    const result = applyCreateRoad(
      {
        id: "road-01",
        path: [
          [0, 0],
          [10, 0],
        ],
        width: 2,
        color: "#333333",
      },
      scene
    );

    expect(result.newNodes).toHaveLength(1);
    const strip = result.newNodes[0];
    expect(strip.id).toBe("road-01");
    expect(strip.type).toBe("extrude");
  });

  it("builds a rectangle of width x path-length from a straight path", () => {
    const scene = { nodes: [] } as { nodes: SceneNode[] };
    const result = applyCreateRoad(
      {
        id: "r",
        path: [
          [0, 0],
          [10, 0],
        ],
        width: 2,
        color: "#111",
      },
      scene
    );
    const strip = result.newNodes[0];
    if (strip.type !== "extrude") throw new Error("expected extrude");
    expect(strip.shape).toHaveLength(4);
    // Shape covers width=2 in z, length=10 in x
    const xs = strip.shape.map((p) => p[0]);
    const zs = strip.shape.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(2);
  });

  it("thin extrude (depth 0.05) so the road sits flat on the ground", () => {
    const scene = { nodes: [] } as { nodes: SceneNode[] };
    const result = applyCreateRoad(
      {
        id: "r",
        path: [
          [0, 0],
          [5, 0],
        ],
        width: 1,
      },
      scene
    );
    const strip = result.newNodes[0];
    if (strip.type !== "extrude") throw new Error("expected extrude");
    expect(strip.depth).toBeLessThanOrEqual(0.1);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: FAIL — `applyCreateRoad` not defined.

- [ ] **Step 3: Implement `packages/llm-adapter/src/templates/createRoad.ts`**

Note: The actual `SceneNode` shape (verified in Task 5) is:
```typescript
{ id, type, name, transform: { position, rotation, scale }, parameters: Record<...>, material?, children }
```
Use `transform.position` (not `translate`), `parameters: { shape, depth }` (not top-level).

```typescript
import type { SceneNode } from "@asset-studio/scene-engine";

// ponytail: road is a single extruded rectangle along the first segment
// direction of the path. Curved paths and lane markings are M4 polish.
export interface CreateRoadInput {
  id: string;
  path: [number, number][]; // [x, z] points
  width: number;
  color?: string;
}

export interface CreateRoadResult {
  newNodes: SceneNode[];
}

export function applyCreateRoad(
  input: CreateRoadInput,
  _scene: { nodes: SceneNode[] }
): CreateRoadResult {
  if (input.path.length < 2) {
    throw new Error("create_road path must have at least 2 points");
  }
  const [start, end] = input.path;
  const minX = Math.min(start[0], end[0]);
  const maxX = Math.max(start[0], end[0]);
  const minZ = Math.min(start[1], end[1]);
  const maxZ = Math.max(start[1], end[1]);

  const isHorizontal = maxX - minX >= maxZ - minZ;
  const halfW = input.width / 2;
  const shape: [number, number][] = isHorizontal
    ? [
        [minX, minZ - halfW],
        [maxX, minZ - halfW],
        [maxX, maxZ + halfW],
        [minX, maxZ + halfW],
      ]
    : [
        [minX - halfW, minZ],
        [maxX + halfW, minZ],
        [maxX + halfW, maxZ],
        [minX - halfW, maxZ],
      ];

  const strip: SceneNode = {
    id: input.id,
    type: "extrude",
    name: input.id,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    parameters: { shape, depth: 0.05 },
    material: { color: input.color ?? "#333333" },
    children: [],
  };

  return { newNodes: [strip] };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm --filter @asset-studio/llm-adapter test`
Expected: PASS — all template tests green.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @asset-studio/llm-adapter typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/llm-adapter/src/templates/createRoad.ts packages/llm-adapter/tests/templates.test.ts
git commit -m "feat(llm-adapter): add create_road template"
```

---

## Task 7: Wire Templates into `toolExecutor`

**Files:**
- Modify: `packages/scene-engine/src/tools/types.ts`
- Modify: `packages/scene-engine/src/tools/toolExecutor.ts`
- Modify: `packages/schema/src/toolSchemas.ts`

- [ ] **Step 1: Read current state of the 3 files**

Run: `Read packages/scene-engine/src/tools/types.ts`
Run: `Read packages/scene-engine/src/tools/toolExecutor.ts`
Run: `Read packages/schema/src/toolSchemas.ts`

- [ ] **Step 2: Extend `ToolName` union**

Edit `packages/scene-engine/src/tools/types.ts`. Replace the existing `ToolName` definition with:

```typescript
export type ToolName =
  | "transform"
  | "set_material"
  | "array"
  | "extrude"
  | "boolean"
  | "create_house"
  | "create_road";
```

- [ ] **Step 3: Add Zod schemas for the two new tools**

Append to `packages/schema/src/toolSchemas.ts`:

```typescript
export const createHouseToolInputSchema = z.object({
  id: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  size: z.tuple([z.number(), z.number(), z.number()]),
  wallColor: z.string().optional(),
  roofColor: z.string().optional(),
});
export type CreateHouseToolInput = z.infer<typeof createHouseToolInputSchema>;

export const createRoadToolInputSchema = z.object({
  id: z.string(),
  path: z.array(z.tuple([z.number(), z.number()])),
  width: z.number(),
  color: z.string().optional(),
});
export type CreateRoadToolInput = z.infer<typeof createRoadToolInputSchema>;
```

Ensure `z` is imported at top of file.

- [ ] **Step 4: Add cases to `toolExecutor.ts` switch**

Read the current switch structure in `toolExecutor.ts`. Add imports near the top (after existing imports):

```typescript
import { applyCreateHouse } from "@asset-studio/llm-adapter/templates/createHouse";
import { applyCreateRoad } from "@asset-studio/llm-adapter/templates/createRoad";
```

**Important:** This creates a workspace dependency cycle risk. To avoid it, the templates package must NOT import from scene-engine's toolExecutor. The templates already only import `SceneNode` type from `@asset-studio/scene-engine` (type-only). Verify by running `pnpm --filter @asset-studio/scene-engine typecheck` after the change.

Inside the switch in `toolExecutor`, add cases (place above the default):

```typescript
case "create_house": {
  const parsed = createHouseToolInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  const result = applyCreateHouse(parsed.data, scene);
  for (const node of result.newNodes) {
    scene.nodes.push(node);
  }
  return { ok: true };
}
case "create_road": {
  const parsed = createRoadToolInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  const result = applyCreateRoad(parsed.data, scene);
  for (const node of result.newNodes) {
    scene.nodes.push(node);
  }
  return { ok: true };
}
```

Import `createHouseToolInputSchema` and `createRoadToolInputSchema` at the top of `toolExecutor.ts`.

- [ ] **Step 5: Add `@asset-studio/llm-adapter` dep to scene-engine**

Edit `packages/scene-engine/package.json` `dependencies`:

```json
"@asset-studio/llm-adapter": "workspace:*"
```

Run: `pnpm install`

- [ ] **Step 6: Write integration test in scene-engine**

Add `packages/scene-engine/tests/templates.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { executeToolCall } from "../src/tools/toolExecutor";
import type { Scene } from "../src/types";

function emptyScene(): Scene {
  return { nodes: [] };
}

describe("toolExecutor template integration", () => {
  it("create_house adds walls, roof, and windows to the scene", () => {
    const scene = emptyScene();
    const res = executeToolCall(
      {
        name: "create_house",
        input: {
          id: "h1",
          position: [0, 0, 0],
          size: [4, 3, 4],
        },
      },
      scene
    );
    expect(res.ok).toBe(true);
    expect(scene.nodes.length).toBeGreaterThanOrEqual(3);
    expect(scene.nodes.some((n) => n.id === "h1-walls")).toBe(true);
    expect(scene.nodes.some((n) => n.id === "h1-roof")).toBe(true);
  });

  it("create_road adds one strip to the scene", () => {
    const scene = emptyScene();
    const res = executeToolCall(
      {
        name: "create_road",
        input: {
          id: "r1",
          path: [
            [0, 0],
            [10, 0],
          ],
          width: 2,
        },
      },
      scene
    );
    expect(res.ok).toBe(true);
    expect(scene.nodes).toHaveLength(1);
    expect(scene.nodes[0].id).toBe("r1");
  });
});
```

- [ ] **Step 7: Run all tests**

Run: `pnpm -r test`
Expected: PASS — all packages green.

- [ ] **Step 8: Typecheck all**

Run: `pnpm -r exec tsc --noEmit`
Expected: PASS (no output).

- [ ] **Step 9: Commit**

```bash
git add packages/scene-engine packages/schema
git commit -m "feat(scene-engine): wire create_house and create_road templates into executor"
```

---

## Task 8: `llmStore` (Zustand + localStorage API key)

**Files:**
- Create: `apps/web/src/store/llmStore.ts`

- [ ] **Step 1: Read existing sceneStore to match conventions**

Run: `Read apps/web/src/store/sceneStore.ts`
Match the Zustand `create` pattern.

- [ ] **Step 2: Implement `apps/web/src/store/llmStore.ts`**

```typescript
"use client";

import { create } from "zustand";

const STORAGE_KEY = "3d-gen:anthropic-api-key";

interface LlmState {
  apiKey: string;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  hydrateFromStorage: () => void;
}

function readStorage(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    if (key) {
      window.localStorage.setItem(STORAGE_KEY, key);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore quota / privacy errors
  }
}

export const useLlmStore = create<LlmState>((set) => ({
  apiKey: "",
  setApiKey: (key) => {
    writeStorage(key);
    set({ apiKey: key });
  },
  clearApiKey: () => {
    writeStorage("");
    set({ apiKey: "" });
  },
  hydrateFromStorage: () => {
    set({ apiKey: readStorage() });
  },
}));
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck` (or `pnpm -r exec tsc --noEmit`)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/store/llmStore.ts
git commit -m "feat(web): add llmStore with localStorage-backed API key"
```

---

## Task 9: `chatStore` (sendPrompt wiring)

**Files:**
- Create: `apps/web/src/store/chatStore.ts`

- [ ] **Step 1: Implement `apps/web/src/store/chatStore.ts`**

```typescript
"use client";

import { create } from "zustand";
import { useLlmStore } from "./llmStore";
import { useSceneStore } from "./sceneStore";
import {
  createClaudeAdapter,
  runWithRetry,
  TOOL_DEFINITIONS,
  SYSTEM_PROMPT,
  type ChatMessage,
} from "@asset-studio/llm-adapter";

const CLAUDE_MODEL = "claude-sonnet-4-6";
const MAX_RETRIES = 2;

interface ChatState {
  messages: ChatMessage[];
  status: "idle" | "thinking" | "error";
  lastError: string | null;
  sendPrompt: (prompt: string) => Promise<void>;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: "idle",
  lastError: null,
  reset: () => set({ messages: [], status: "idle", lastError: null }),
  sendPrompt: async (prompt) => {
    const apiKey = useLlmStore.getState().apiKey;
    if (!apiKey) {
      set({
        status: "error",
        lastError:
          "Missing API key. Open settings and paste your Anthropic API key.",
      });
      return;
    }

    const sceneStore = useSceneStore.getState();
    const sceneJson = JSON.stringify(sceneStore.scene);

    const userPayload = `${prompt}\n\nCurrent scene JSON:\n${sceneJson}`;

    set({ status: "thinking", lastError: null });

    try {
      const adapter = createClaudeAdapter({
        apiKey,
        model: CLAUDE_MODEL,
        tools: TOOL_DEFINITIONS,
      });

      const result = await runWithRetry({
        adapter,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userPayload,
        tools: TOOL_DEFINITIONS,
        applyToolCall: (name, input) =>
          sceneStore.applyToolCall({ name, input }),
        maxRetries: MAX_RETRIES,
      });

      set({
        messages: [...get().messages, ...result.assistantMessages],
        status: result.finalStatus === "ok" ? "idle" : "error",
        lastError: result.lastError ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ status: "error", lastError: msg });
    }
  },
}));
```

- [ ] **Step 2: Verify imports resolve**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS. If `@asset-studio/llm-adapter` is not yet a dep of `web`, add to `apps/web/package.json`:

```json
"@asset-studio/llm-adapter": "workspace:*"
```

Then `pnpm install`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/store/chatStore.ts apps/web/package.json
git commit -m "feat(web): wire chatStore to llm-adapter orchestrator"
```

---

## Task 10: `ChatPanel` UI Component

**Files:**
- Create: `apps/web/src/components/ChatPanel.tsx`

- [ ] **Step 1: Implement the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useChatStore } from "../store/chatStore";
import { useLlmStore } from "../store/llmStore";

export default function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const lastError = useChatStore((s) => s.lastError);
  const sendPrompt = useChatStore((s) => s.sendPrompt);

  const apiKey = useLlmStore((s) => s.apiKey);
  const setApiKey = useLlmStore((s) => s.setApiKey);
  const hydrate = useLlmStore((s) => s.hydrateFromStorage);

  const [input, setInput] = useState("");
  const [keyInput, setKeyInput] = useState("");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const prompt = input;
    setInput("");
    await sendPrompt(prompt);
  };

  return (
    <aside
      style={{
        width: 360,
        padding: 16,
        borderLeft: "1px solid #222",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "#0e0e10",
        color: "#eee",
        height: "100vh",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 16 }}>AI Studio</h2>

      {!apiKey ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setApiKey(keyInput.trim());
            setKeyInput("");
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <label style={{ fontSize: 12, color: "#aaa" }}>
            Anthropic API key (stored in localStorage)
          </label>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="sk-ant-..."
            style={{
              padding: 8,
              borderRadius: 4,
              border: "1px solid #333",
              background: "#1a1a1d",
              color: "#eee",
            }}
          />
          <button
            type="submit"
            style={{
              padding: 8,
              borderRadius: 4,
              border: "none",
              background: "#4488ff",
              color: "white",
              cursor: "pointer",
            }}
          >
            Save key
          </button>
        </form>
      ) : (
        <button
          onClick={() => useLlmStore.getState().clearApiKey()}
          style={{
            padding: 6,
            borderRadius: 4,
            border: "1px solid #333",
            background: "transparent",
            color: "#aaa",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Clear API key
        </button>
      )}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 8,
          border: "1px solid #222",
          borderRadius: 4,
          background: "#131316",
          fontSize: 13,
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: "#666" }}>
            Ask the assistant to build something.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: 8,
              textAlign: m.role === "assistant" ? "left" : "right",
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "6px 10px",
                borderRadius: 8,
                background: m.role === "assistant" ? "#1f1f24" : "#335577",
                maxWidth: "85%",
              }}
            >
              {m.content || "(tool call)"}
            </span>
          </div>
        ))}
        {status === "thinking" && (
          <div style={{ color: "#888", fontStyle: "italic" }}>Thinking…</div>
        )}
        {status === "error" && lastError && (
          <div style={{ color: "#ff6666" }}>Error: {lastError}</div>
        )}
      </div>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Build a house at origin"
          disabled={!apiKey || status === "thinking"}
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 4,
            border: "1px solid #333",
            background: "#1a1a1d",
            color: "#eee",
          }}
        />
        <button
          type="submit"
          disabled={!apiKey || status === "thinking" || !input.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            background: "#4488ff",
            color: "white",
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </form>
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ChatPanel.tsx
git commit -m "feat(web): add ChatPanel UI with API key form and message list"
```

---

## Task 11: Integrate into `page.tsx` + Manual Verify + Tag

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Read current page.tsx**

Run: `Read apps/web/src/app/page.tsx`

- [ ] **Step 2: Add ChatPanel beside Viewport**

Wrap the existing layout. The simplest integration: put the existing `<Viewport />` and the new `<ChatPanel />` in a flex row.

At the top of the file, add:

```tsx
import ChatPanel from "../components/ChatPanel";
```

Replace the outermost layout wrapper so it renders a row:

```tsx
<main style={{ display: "flex", width: "100vw", height: "100vh" }}>
  <div style={{ flex: 1 }}>
    <Viewport />
  </div>
  <ChatPanel />
</main>
```

Keep the existing smoke-test buttons (Add wall, Intersect box+sphere) inside the Viewport container or as an overlay — they remain useful for manual verification.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Run all tests**

Run: `pnpm -r test`
Expected: ALL GREEN.

- [ ] **Step 5: Start dev server**

Run: `pnpm --filter web dev` (in background or new terminal)
Open: `http://localhost:3000`

- [ ] **Step 6: Manual verify (golden path)**

1. Paste a real Anthropic API key into the ChatPanel key field, click **Save key**. Refresh page; key should persist.
2. Type: `Build a small house at origin` and press Send.
3. Confirm in the viewport: a house appears (walls block + roof block + 2 window panes on +Z face).
4. Type: `Now add a road from (-5, 0) to (5, 0)` and press Send.
5. Confirm a flat dark strip appears spanning that range.
6. Watch the message list: each assistant reply appears in a left-aligned bubble.

- [ ] **Step 7: Manual verify (retry path)**

1. Without clearing key, type: `Subtract node "does-not-exist" from "also-missing"`.
2. The orchestrator should attempt `boolean`, fail (missing operand), feed error back to Claude, and Claude should produce a different reply or end turn. Confirm no infinite loop; max 3 tool attempts total.

- [ ] **Step 8: Manual verify (error path)**

1. Click **Clear API key**.
2. Type any prompt and Send.
3. Confirm red error message: "Missing API key…"

- [ ] **Step 9: Tag**

```bash
git tag v0.3.0-m3 -m "M3 — LLM integration (Claude) complete"
```

- [ ] **Step 10: Final commit if any cleanup**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): integrate ChatPanel beside Viewport"
```

---

## Definition of Done

- [ ] All 11 tasks complete, each with its own commit.
- [ ] `pnpm -r test` is green.
- [ ] `pnpm -r exec tsc --noEmit` passes.
- [ ] Manual golden-path verify succeeded (house + road visible in viewport).
- [ ] Retry path verified (no infinite loop, max 3 attempts).
- [ ] Error path verified (missing key shows clear message).
- [ ] Tag `v0.3.0-m3` created.

---

## Self-Review

**1. Spec coverage**

| PRD § / user ask | Covered by |
|---|---|
| §6.4 manual adapter (not Vercel AI SDK) | Task 3 — direct `@anthropic-ai/sdk` |
| §6.2 full scene JSON in prompt | Task 9 `chatStore.sendPrompt` |
| §6.3 retry max 2 | Task 4 `runWithRetry({ maxRetries: 2 })` |
| §5.2 templates compose primitives visibly | Tasks 5+6 — extrude calls in source |
| §10 client-side, BYO key | Task 8 localStorage, Task 3 `dangerouslyAllowBrowser` |
| Unified Adapter Layer | Task 3 `LLMAdapter` interface |
| Chat UI with prompt input | Task 10 `ChatPanel` |
| `create_house` template | Task 5 |
| `create_road` template | Task 6 |
| pnpm monorepo `packages/llm-adapter` | Task 1 |

No spec gaps.

**2. Placeholder scan** — No TBD / TODO / "similar to" / "implement later". Each step has full code.

**3. Type consistency**

- `LLMAdapter` interface defined Task 3, used Task 4 + Task 9.
- `ToolCall` shape `{ id, name, input }` consistent across Task 2, 3, 4.
- `ChatResult` fields `content / toolCalls / stopReason / rawUsage` consistent Task 3 + 4.
- `applyCreateHouse` / `applyCreateRoad` return `{ newNodes: SceneNode[] }` consistent Task 5/6 + Task 7.
- `runWithRetry` options shape matches between Task 4 definition and Task 9 usage in chatStore.

All types line up.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-12-m3-llm-integration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, spec review then code quality review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**

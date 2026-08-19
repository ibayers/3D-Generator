import { describe, it, expect, vi } from "vitest";
import { runWithRetry } from "../src/orchestrator";
import type { LLMAdapter, ChatResult, ChatMessage } from "../src/types";

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
    const { adapter } = makeAdapter([
      { content: "hi", toolCalls: [], stopReason: "end_turn" },
    ]);
    const exec = makeExecutor();
    const result = await runWithRetry({
      adapter,
      systemPrompt: "s",
      userPrompt: "hi",
      tools: [],
      applyToolCall: exec.apply,
      maxRetries: 2,
    });

    expect(result.assistantMessages.at(-1)?.content).toBe("hi");
    expect(exec.calls).toHaveLength(0);
  });

  it("executes one tool_call then ends", async () => {
    const { adapter } = makeAdapter([
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
      applyToolCall: exec.apply,
      maxRetries: 2,
    });

    expect(exec.calls).toEqual([
      { name: "create_house", input: { id: "h1" } },
    ]);
    expect(result.assistantMessages.at(-1)?.content).toBe("done");
  });

  it("retries after tool execution failure up to maxRetries", async () => {
    const { adapter } = makeAdapter([
      {
        content: "try",
        toolCalls: [{ id: "tu1", name: "bad_tool", input: {} }],
        stopReason: "tool_use",
      },
      {
        content: "retry",
        toolCalls: [{ id: "tu2", name: "bad_tool", input: {} }],
        stopReason: "tool_use",
      },
      {
        content: "retry2",
        toolCalls: [{ id: "tu3", name: "bad_tool", input: {} }],
        stopReason: "tool_use",
      },
    ]);
    const exec = makeExecutor();
    const result = await runWithRetry({
      adapter,
      systemPrompt: "s",
      userPrompt: "go",
      tools: [],
      applyToolCall: exec.apply,
      maxRetries: 2,
    });

    // Original call + 2 retries = 3 attempts total
    expect(exec.calls).toHaveLength(3);
    expect(result.assistantMessages.at(-1)?.content).toBe("retry2");
    expect(result.finalStatus).toBe("error");
    expect(result.lastError).toMatch(/unknown tool/);
  });

  it("stops retrying once a turn has no tool_calls", async () => {
    const { adapter } = makeAdapter([
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
      applyToolCall: exec.apply,
      maxRetries: 2,
    });

    expect(exec.calls).toHaveLength(1);
    expect(result.assistantMessages.at(-1)?.content).toBe("gave up");
    expect(result.finalStatus).toBe("ok");
  });

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

    const second = calls[1]!;
    expect(second.every((m) => m.content.length > 0)).toBe(true);
    expect(result.assistantMessages.every((m) => m.content.length > 0)).toBe(true);
    expect(result.assistantMessages.at(-1)?.content).toBe("done");
  });

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
});

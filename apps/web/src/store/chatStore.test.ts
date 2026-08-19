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
    const last = entries.at(-1);
    expect(last?.kind).toBe("error");
    if (last?.kind !== "error") return;
    expect(last?.text).toContain("401");
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
    const last = entries.at(-1);
    expect(last?.kind).toBe("error");
    if (last?.kind !== "error") return;
    expect(last?.text).toContain("INVALID_INPUT");
  });

  it("pushes a note entry when ok with a round-cap lastError", async () => {
    runWithRetryMock.mockResolvedValue({
      assistantMessages: [],
      finalStatus: "ok",
      lastError: "Stopped after 6 tool rounds (limit).",
    });
    await useChatStore.getState().sendPrompt("buat rumah");
    const entries = useChatStore.getState().entries;
    const last = entries.at(-1);
    expect(last?.kind).toBe("note");
    if (last?.kind !== "note") return;
    expect(last?.text).toContain("Stopped after 6 tool rounds");
    expect(useChatStore.getState().status).toBe("idle");
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
    const opts = runWithRetryMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts.maxToolRounds).toBe(6);
    expect(typeof opts.getSceneState).toBe("function");
    expect((opts.getSceneState as () => string)()).toContain('"version"');
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

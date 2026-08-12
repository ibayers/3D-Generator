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

import { __mockMessages } from "@anthropic-ai/sdk";

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
      [{ role: "user", content: "hi" }] as ChatMessage[],
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
      [{ role: "user", content: "build a house" }] as ChatMessage[],
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
      [{ role: "user", content: "go" }] as ChatMessage[],
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
      adapter.chat([{ role: "user", content: "x" }] as ChatMessage[], "s")
    ).rejects.toThrow(/Claude chat failed: 401 unauthorized/);
  });
});

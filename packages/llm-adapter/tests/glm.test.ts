import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGLMAdapter } from "../src/glm";

// Mock the openai SDK
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

describe("createGLMAdapter", () => {
  beforeEach(() => {
    __mockCreate.mockReset();
  });

  it("returns text content when finish_reason is stop", async () => {
    __mockCreate.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "Hello.", tool_calls: null },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    });

    const adapter = createGLMAdapter({
      apiKey: "zai-test",
      model: "glm-5.2",
      tools: [],
    });

    const result = await adapter.chat(
      [{ role: "user", content: "hi" }],
      "system"
    );

    expect(result.stopReason).toBe("end_turn");
    expect(result.content).toBe("Hello.");
    expect(result.toolCalls).toEqual([]);
    expect(result.rawUsage?.inputTokens).toBe(12);
  });

  it("extracts tool_calls and parses JSON arguments", async () => {
    __mockCreate.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_01",
                type: "function",
                function: {
                  name: "create_house",
                  arguments:
                    '{"id":"h1","position":[0,0,0],"size":[4,3,4]}',
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 30, completion_tokens: 20 },
    });

    const adapter = createGLMAdapter({
      apiKey: "zai-test",
      model: "glm-5.2",
      tools: [],
    });

    const result = await adapter.chat(
      [{ role: "user", content: "build" }],
      "system"
    );

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toEqual([
      {
        id: "call_01",
        name: "create_house",
        input: { id: "h1", position: [0, 0, 0], size: [4, 3, 4] },
      },
    ]);
  });

  it("translates TOOL_DEFINITIONS (Anthropic shape) to OpenAI function shape on the wire", async () => {
    __mockCreate.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "ok", tool_calls: null },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    const adapter = createGLMAdapter({
      apiKey: "zai-test",
      model: "glm-5.2",
      tools: [
        {
          name: "extrude",
          description: "extrude a shape",
          input_schema: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
        },
      ],
    });

    await adapter.chat([{ role: "user", content: "go" }], "be the bot");

    expect(__mockCreate).toHaveBeenCalledTimes(1);
    const callArg = __mockCreate.mock.calls[0]![0];
    expect(callArg.model).toBe("glm-5.2");
    expect(callArg.messages).toEqual([
      { role: "system", content: "be the bot" },
      { role: "user", content: "go" },
    ]);
    expect(callArg.tools).toEqual([
      {
        type: "function",
        function: {
          name: "extrude",
          description: "extrude a shape",
          parameters: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
        },
      },
    ]);
  });

  it("maps length finish_reason to max_tokens", async () => {
    __mockCreate.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "length",
          message: { role: "assistant", content: "cut off", tool_calls: null },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    const adapter = createGLMAdapter({
      apiKey: "zai-test",
      model: "glm-5.2",
      tools: [],
    });

    const result = await adapter.chat(
      [{ role: "user", content: "x" }],
      "s"
    );

    expect(result.stopReason).toBe("max_tokens");
  });

  it("wraps SDK errors with a descriptive message", async () => {
    __mockCreate.mockRejectedValueOnce(new Error("401 invalid api key"));
    const adapter = createGLMAdapter({
      apiKey: "bad",
      model: "glm-5.2",
      tools: [],
    });
    await expect(
      adapter.chat([{ role: "user", content: "x" }], "s")
    ).rejects.toThrow(/GLM chat failed: 401 invalid api key/);
  });

  it("handles malformed JSON in tool_call arguments gracefully", async () => {
    __mockCreate.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_bad",
                type: "function",
                function: {
                  name: "extrude",
                  arguments: "{not valid json",
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    const adapter = createGLMAdapter({
      apiKey: "zai-test",
      model: "glm-5.2",
      tools: [],
    });

    const result = await adapter.chat(
      [{ role: "user", content: "x" }],
      "s"
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.name).toBe("extrude");
    expect(result.toolCalls[0]?.input).toEqual({});
  });
});

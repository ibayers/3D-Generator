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

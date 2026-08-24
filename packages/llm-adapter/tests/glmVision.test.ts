import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGLMVisionAdapter } from "../src/glmVision";

vi.mock("openai", () => {
  const create = vi.fn();
  return {
    default: vi.fn(function MockOpenAI(this: { chat: object }) {
      this.chat = { completions: { create } };
    }),
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

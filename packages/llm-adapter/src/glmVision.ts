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

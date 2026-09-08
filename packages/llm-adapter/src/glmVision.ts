import { createOpenAICompatAdapter, zaiBaseURL } from "./openaiCompat";
import type { LLMAdapter } from "./types";
import type { ToolDefinition } from "./tools";

export interface GLMVisionAdapterOptions {
  apiKey: string;
  model: string;
  tools: ToolDefinition[];
  maxTokens?: number;
  baseURL?: string;
}

// ponytail: defaults to the CODING PLAN endpoint so subscribers pay nothing —
// glm-5.3-flash is natively multimodal (image input) AND tools-capable AND
// included in every plan. Standard endpoint (glm-4.6v, pay-as-you-go) stays
// available via baseURL override.
const GLM_CODING_PLAN_BASE_URL = "https://api.z.ai/api/coding/paas/v4/";

export function createGLMVisionAdapter(opts: GLMVisionAdapterOptions): LLMAdapter {
  return createOpenAICompatAdapter({
    ...opts,
    // Browser: same-origin Next rewrite (z.ai has no CORS). Node: direct.
    baseURL: opts.baseURL ?? zaiBaseURL("/api/zai-coding/", GLM_CODING_PLAN_BASE_URL),
    label: "GLM Vision",
  });
}

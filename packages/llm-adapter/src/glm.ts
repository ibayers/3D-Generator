import { createOpenAICompatAdapter, zaiBaseURL } from "./openaiCompat";
import type { LLMAdapter } from "./types";
import type { ToolDefinition } from "./tools";

export interface GLMAdapterOptions {
  apiKey: string;
  model: string;
  tools: ToolDefinition[];
  maxTokens?: number;
  baseURL?: string;
}

// ponytail: Z.ai has two endpoints with SEPARATE billing:
//   - Standard API:  https://api.z.ai/api/paas/v4/         (pay-as-you-go credits)
//   - Coding Plan:   https://api.z.ai/api/coding/paas/v4/  (monthly subscription)
// Default here is Coding Plan because that's the common subscription path; pass
// `baseURL` to override. Vision lives on Standard — see glmVision.ts.
const GLM_CODING_PLAN_BASE_URL = "https://api.z.ai/api/coding/paas/v4/";

export function createGLMAdapter(opts: GLMAdapterOptions): LLMAdapter {
  return createOpenAICompatAdapter({
    ...opts,
    // Browser: same-origin Next rewrite (z.ai has no CORS). Node: direct.
    baseURL: opts.baseURL ?? zaiBaseURL("/api/zai-coding/", GLM_CODING_PLAN_BASE_URL),
    label: "GLM",
  });
}

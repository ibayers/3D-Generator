import { createOpenAICompatAdapter } from "./openaiCompat";
import type { LLMAdapter } from "./types";
import type { ToolDefinition } from "./tools";

export interface N9RouterAdapterOptions {
  apiKey: string;
  model: string;
  tools: ToolDefinition[];
  maxTokens?: number;
  baseURL?: string;
}

// 9Router is a local proxy (default http://localhost:20128/v1) exposing an
// OpenAI-compatible endpoint with smart fallback across 40+ upstream providers.
const N9ROUTER_DEFAULT_BASE_URL = "http://localhost:20128/v1";

export function createN9RouterAdapter(
  opts: N9RouterAdapterOptions,
): LLMAdapter {
  return createOpenAICompatAdapter({
    ...opts,
    baseURL: opts.baseURL ?? N9ROUTER_DEFAULT_BASE_URL,
    label: "9Router",
  });
}

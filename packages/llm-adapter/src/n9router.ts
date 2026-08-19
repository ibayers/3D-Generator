import OpenAI from "openai";
import { ADAPTER_DEFAULTS } from "./defaults";
import type { ChatMessage, ChatResult, LLMAdapter } from "./types";
import type { ToolDefinition } from "./tools";

// ponytail: near-duplicate of glm.ts — both wrap OpenAI SDK with a different
// baseURL. 9Router is a local proxy (default http://localhost:20128/v1) that
// exposes an OpenAI-compatible endpoint with smart fallback across 40+
// upstream providers. Could be unified with glm.ts into a single
// createOpenAICompatAdapter({ baseURL, ... }), but we only have three
// targets today. Refactor when a fourth appears.
type OpenAIMessage = { role: string; content: string };
type OpenAITool = {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
};

export interface N9RouterAdapterOptions {
  apiKey: string;
  model: string;
  tools: ToolDefinition[];
  maxTokens?: number;
  baseURL?: string;
}

const N9ROUTER_DEFAULT_BASE_URL = "http://localhost:20128/v1";

const FINISH_REASON_MAP: Record<string, string> = {
  stop: "end_turn",
  tool_calls: "tool_use",
  length: "max_tokens",
};

function toOpenAITools(tools: ToolDefinition[]): OpenAITool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

export function createN9RouterAdapter(
  opts: N9RouterAdapterOptions,
): LLMAdapter {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL ?? N9ROUTER_DEFAULT_BASE_URL,
    dangerouslyAllowBrowser: true,
    timeout: ADAPTER_DEFAULTS.timeoutMs,
    maxRetries: ADAPTER_DEFAULTS.sdkMaxRetries,
  });
  const maxTokens = opts.maxTokens ?? ADAPTER_DEFAULTS.maxTokens;

  return {
    async chat(
      messages: ChatMessage[],
      systemPrompt: string,
    ): Promise<ChatResult> {
      try {
        const openaiMessages: OpenAIMessage[] = [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ];

        const response = await client.chat.completions.create({
          model: opts.model,
          max_tokens: maxTokens,
          messages: openaiMessages as never,
          tools: toOpenAITools(opts.tools) as never,
        });

        const choice = response.choices[0];
        const message = choice?.message;
        const finishReason = String(choice?.finish_reason ?? "stop");
        const stopReason = FINISH_REASON_MAP[finishReason] ?? finishReason;

        const textContent =
          typeof message?.content === "string" ? message.content : "";
        const toolCalls: ChatResult["toolCalls"] = [];

        for (const tc of message?.tool_calls ?? []) {
          const fn = (tc as { function?: { name?: string; arguments?: string } }).function;
          if (!fn) continue;
          let parsedInput: Record<string, unknown> = {};
          try {
            parsedInput = fn.arguments ? JSON.parse(fn.arguments) : {};
          } catch {
            // ponytail: malformed arguments → empty object; orchestrator's
            // applyToolCall will reject with a descriptive Zod error.
            parsedInput = {};
          }
          toolCalls.push({
            id: String((tc as { id?: string }).id ?? ""),
            name: String(fn.name ?? ""),
            input: parsedInput,
          });
        }

        return {
          content: textContent,
          toolCalls,
          stopReason,
          rawUsage: {
            inputTokens: (response.usage?.prompt_tokens as number) ?? 0,
            outputTokens: (response.usage?.completion_tokens as number) ?? 0,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`9Router chat failed: ${msg}`);
      }
    },
  };
}

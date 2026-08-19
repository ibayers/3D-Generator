import OpenAI from "openai";
import { ADAPTER_DEFAULTS } from "./defaults";
import type { ChatMessage, ChatResult, LLMAdapter } from "./types";
import type { ToolDefinition } from "./tools";

// ponytail: SDK's ChatCompletionTool/ChatCompletionMessageParam are stricter than
// the wire format we produce; we cast at the boundary rather than importing SDK
// domain types into our union, since this adapter is the only consumer.
type OpenAIMessage = { role: string; content: string };
type OpenAITool = {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
};

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
// The Coding Plan endpoint is what `zai-coding-plan/*` models in opencode use.
// Default here is Coding Plan because that's the common subscription path; pass
// `baseURL` option to override if you only have standard API credits.
const GLM_CODING_PLAN_BASE_URL = "https://api.z.ai/api/coding/paas/v4/";
const GLM_BASE_URL = GLM_CODING_PLAN_BASE_URL;

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

export function createGLMAdapter(opts: GLMAdapterOptions): LLMAdapter {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL ?? GLM_BASE_URL,
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
          const fn = (
            tc as { function?: { name?: string; arguments?: string } }
          ).function;
          if (!fn) continue;
          let parsedInput: Record<string, unknown> = {};
          try {
            parsedInput = fn.arguments ? JSON.parse(fn.arguments) : {};
          } catch {
            // ponytail: malformed arguments become empty object; orchestrator's
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
        throw new Error(`GLM chat failed: ${msg}`);
      }
    },
  };
}

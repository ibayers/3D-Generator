import OpenAI from "openai";
import { ADAPTER_DEFAULTS } from "./defaults";
import type { ChatMessage, ChatResult, LLMAdapter } from "./types";
import type { ToolDefinition } from "./tools";

export interface OpenAICompatOptions {
  apiKey: string;
  model: string;
  tools: ToolDefinition[];
  baseURL: string;
  maxTokens?: number;
  /** Error prefix, e.g. "GLM" — preserves each adapter's historical message. */
  label: string;
}

// ponytail: SDK's ChatCompletionMessageParam is stricter than the wire format
// we produce; we cast at the boundary rather than importing SDK domain types.
type OpenAIMessage = { role: string; content: unknown };
type OpenAITool = {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
};

const FINISH_REASON_MAP: Record<string, string> = {
  stop: "end_turn",
  tool_calls: "tool_use",
  length: "max_tokens",
};

/** api.z.ai ships no CORS headers — in the browser, route through the
 * same-origin Next rewrite proxy (apps/web/next.config.ts); under node
 * (eval harness) hit the endpoint directly. */
export function zaiBaseURL(proxyPath: string, direct: string): string {
  return typeof window === "undefined"
    ? direct
    : new URL(proxyPath, window.location.origin).toString();
}

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

/** Plain string when no images (wire-compatible with the old adapters);
 * multimodal parts when present. */
export function toOpenAIMessage(m: ChatMessage): OpenAIMessage {
  if (!m.images || m.images.length === 0) {
    return { role: m.role, content: m.content };
  }
  return {
    role: m.role,
    content: [
      { type: "text", text: m.content },
      ...m.images.map((url) => ({ type: "image_url", image_url: { url } })),
    ],
  };
}

export function createOpenAICompatAdapter(opts: OpenAICompatOptions): LLMAdapter {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
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
          ...messages.map(toOpenAIMessage),
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
        throw new Error(`${opts.label} chat failed: ${msg}`);
      }
    },
  };
}

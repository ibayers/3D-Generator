import Anthropic from "@anthropic-ai/sdk";
import { ADAPTER_DEFAULTS } from "./defaults";
import type { ChatMessage, ChatResult, LLMAdapter } from "./types";
import type { ToolDefinition } from "./tools";

export interface ClaudeAdapterOptions {
  apiKey: string;
  model: string;
  tools: ToolDefinition[];
  maxTokens?: number;
}

export function createClaudeAdapter(opts: ClaudeAdapterOptions): LLMAdapter {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: true, // PRD §10: client-side direct call
    timeout: ADAPTER_DEFAULTS.timeoutMs,
    maxRetries: ADAPTER_DEFAULTS.sdkMaxRetries,
  });
  const maxTokens = opts.maxTokens ?? ADAPTER_DEFAULTS.maxTokens;

  return {
    async chat(messages: ChatMessage[], systemPrompt: string): Promise<ChatResult> {
      try {
        const response = await client.messages.create({
          model: opts.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          tools: opts.tools,
        });

        let textContent = "";
        const toolCalls: ChatResult["toolCalls"] = [];

        for (const block of response.content as Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
        }>) {
          if (block.type === "text" && typeof block.text === "string") {
            textContent += block.text;
          } else if (block.type === "tool_use") {
            toolCalls.push({
              id: String(block.id ?? ""),
              name: String(block.name ?? ""),
              input: (block.input ?? {}) as Record<string, unknown>,
            });
          }
        }

        return {
          content: textContent,
          toolCalls,
          stopReason: String(response.stop_reason ?? "end_turn"),
          rawUsage: {
            inputTokens: (response.usage?.input_tokens as number) ?? 0,
            outputTokens: (response.usage?.output_tokens as number) ?? 0,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Claude chat failed: ${msg}`);
      }
    },
  };
}

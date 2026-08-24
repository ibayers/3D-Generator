import type { ChatMessage, ChatResult, LLMAdapter, ToolCall } from "./types";
import type { ToolDefinition } from "./tools";

export type ApplyToolCall = (
  name: string,
  input: Record<string, unknown>
) => Promise<{ ok: boolean; error?: string }>;

const DEFAULT_MAX_TOOL_ROUNDS = 6;

export interface RunWithRetryOptions {
  adapter: LLMAdapter;
  systemPrompt: string;
  userPrompt: string;
  /** Data-URL images attached to the FIRST user message (vision providers). */
  userImages?: string[];
  tools: ToolDefinition[];
  applyToolCall: ApplyToolCall;
  maxRetries: number;
  /** Max successful tool rounds before forcing a stop. Default 6. */
  maxToolRounds?: number;
  /** Serialized scene appended to success feedback so the model sees the new state. */
  getSceneState?: () => string;
  /** Live notification of each non-empty assistant turn. */
  onAssistant?: (content: string) => void;
}

export interface RunResult {
  assistantMessages: ChatMessage[];
  finalStatus: "ok" | "error";
  lastError?: string;
}

export async function runWithRetry(
  opts: RunWithRetryOptions
): Promise<RunResult> {
  const maxToolRounds = opts.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const messages: ChatMessage[] = [
    { role: "user", content: opts.userPrompt, images: opts.userImages },
  ];
  const assistantMessages: ChatMessage[] = [];
  let retries = 0;
  let rounds = 0;
  let lastError: string | undefined;

  while (retries <= opts.maxRetries) {
    const result: ChatResult = await opts.adapter.chat(
      messages,
      opts.systemPrompt
    );

    // ponytail: Anthropic API rejects empty-content messages with 400, and a
    // tool-only turn legitimately has content "". Only record non-empty turns.
    if (result.content.trim().length > 0) {
      const msg = { role: "assistant" as const, content: result.content };
      assistantMessages.push(msg);
      messages.push(msg);
      opts.onAssistant?.(result.content);
    }

    if (result.toolCalls.length === 0) {
      return { assistantMessages, finalStatus: "ok" };
    }

    rounds++;
    if (rounds > maxToolRounds) {
      return {
        assistantMessages,
        finalStatus: "ok",
        lastError: `Stopped after ${maxToolRounds} tool rounds (limit).`,
      };
    }

    let failed: ToolCall | undefined;
    for (const tc of result.toolCalls) {
      const res = await opts.applyToolCall(tc.name, tc.input);
      if (!res.ok) {
        failed = tc;
        lastError = res.error;
        break;
      }
    }

    if (!failed) {
      // All tools succeeded; report back so the model can chain the next step.
      const names = result.toolCalls.map((tc) => `"${tc.name}"`).join(", ");
      const sceneState = opts.getSceneState?.() ?? "";
      messages.push({
        role: "user",
        content:
          `Tool${result.toolCalls.length > 1 ? "s" : ""} ${names} succeeded. ` +
          `Continue with the next step, or reply with a short summary if the request is complete.` +
          (sceneState ? `\n\nUpdated scene JSON:\n${sceneState}` : ""),
      });
      continue;
    }

    retries++;
    if (retries > opts.maxRetries) {
      return {
        assistantMessages,
        finalStatus: "error",
        lastError,
      };
    }

    // Feed failure back to the model.
    messages.push({
      role: "user",
      content: `Tool "${failed.name}" (id ${failed.id}) failed: ${lastError}. Please correct and retry, or reply without that tool.`,
    });
  }

  // Unreachable in practice; guard for safety.
  return { assistantMessages, finalStatus: "error", lastError };
}

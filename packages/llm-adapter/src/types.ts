export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | string;
  rawUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMAdapter {
  chat(messages: ChatMessage[], systemPrompt: string): Promise<ChatResult>;
}

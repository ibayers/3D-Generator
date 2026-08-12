'use client';

import { create } from 'zustand';
import { useLlmStore } from './llmStore';
import { useSceneStore } from './sceneStore';
import {
  createClaudeAdapter,
  createGLMAdapter,
  runWithRetry,
  TOOL_DEFINITIONS,
  SYSTEM_PROMPT,
  type ChatMessage,
  type LLMAdapter,
} from '@asset-studio/llm-adapter';

const MAX_RETRIES = 2;

const MODELS: Record<string, string> = {
  claude: 'claude-sonnet-4-6',
  glm: 'glm-5.2',
};

function createAdapter(provider: string, apiKey: string): LLMAdapter {
  const model = MODELS[provider] ?? MODELS.claude!;
  if (provider === 'glm') {
    return createGLMAdapter({ apiKey, model, tools: TOOL_DEFINITIONS });
  }
  return createClaudeAdapter({ apiKey, model, tools: TOOL_DEFINITIONS });
}

interface ChatState {
  messages: ChatMessage[];
  status: 'idle' | 'thinking' | 'error';
  lastError: string | null;
  sendPrompt: (prompt: string) => Promise<void>;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: 'idle',
  lastError: null,
  reset: () => set({ messages: [], status: 'idle', lastError: null }),
  sendPrompt: async (prompt) => {
    const llm = useLlmStore.getState();
    const apiKey = llm.apiKey;
    if (!apiKey) {
      const providerLabel =
        llm.provider === 'glm' ? 'Z.ai (GLM)' : 'Anthropic (Claude)';
      set({
        status: 'error',
        lastError: `Missing API key for ${providerLabel}. Paste your key in the panel above.`,
      });
      return;
    }

    const sceneStore = useSceneStore.getState();
    const sceneJson = JSON.stringify(sceneStore.scene);
    const userPayload = `${prompt}\n\nCurrent scene JSON:\n${sceneJson}`;

    set({ status: 'thinking', lastError: null });

    try {
      const adapter = createAdapter(llm.provider, apiKey);

      const result = await runWithRetry({
        adapter,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userPayload,
        tools: TOOL_DEFINITIONS,
        applyToolCall: (name, input) =>
          Promise.resolve(
            sceneStore.applyToolCall({ name, input } as never),
          ),
        maxRetries: MAX_RETRIES,
      });

      set({
        messages: [...get().messages, ...result.assistantMessages],
        status: result.finalStatus === 'ok' ? 'idle' : 'error',
        lastError: result.lastError ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ status: 'error', lastError: msg });
    }
  },
}));

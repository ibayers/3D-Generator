'use client';

import { create } from 'zustand';
import { useLlmStore } from './llmStore';
import { useSceneStore } from './sceneStore';
import {
  createClaudeAdapter,
  runWithRetry,
  TOOL_DEFINITIONS,
  SYSTEM_PROMPT,
  type ChatMessage,
} from '@asset-studio/llm-adapter';
import type { ToolCall } from '@asset-studio/scene-engine';

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const MAX_RETRIES = 2;

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
    const apiKey = useLlmStore.getState().apiKey;
    if (!apiKey) {
      set({
        status: 'error',
        lastError:
          'Missing API key. Open settings and paste your Anthropic API key.',
      });
      return;
    }

    const sceneStore = useSceneStore.getState();
    const sceneJson = JSON.stringify(sceneStore.scene);
    const userPayload = `${prompt}\n\nCurrent scene JSON:\n${sceneJson}`;

    set({ status: 'thinking', lastError: null });

    try {
      const adapter = createClaudeAdapter({
        apiKey,
        model: CLAUDE_MODEL,
        tools: TOOL_DEFINITIONS,
      });

      const result = await runWithRetry({
        adapter,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userPayload,
        tools: TOOL_DEFINITIONS,
        applyToolCall: (name, input) => {
          // Orchestrator hands us `name: string`; scene-engine's ToolCall
          // narrows name to a ToolName union. The runtime value is one of
          // the union members because TOOL_DEFINITIONS constrains Claude.
          const call = { name, input } as ToolCall;
          const res = sceneStore.applyToolCall(call);
          return Promise.resolve(res);
        },
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

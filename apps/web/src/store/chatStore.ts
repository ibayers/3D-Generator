'use client';

import { create } from 'zustand';
import { DEFAULT_MODELS, useLlmStore, type Provider } from './llmStore';
import { useSceneStore } from './sceneStore';
import type { ToolCall } from '@asset-studio/scene-engine';
import {
  createClaudeAdapter,
  createGLMAdapter,
  createGLMVisionAdapter,
  createN9RouterAdapter,
  runWithRetry,
  TOOL_DEFINITIONS,
  SYSTEM_PROMPT,
  type LLMAdapter,
} from '@asset-studio/llm-adapter';

const MAX_RETRIES = 2;
const MAX_TOOL_ROUNDS = 6;

function createAdapter(provider: string, apiKey: string): LLMAdapter {
  const model =
    useLlmStore.getState().models[provider as Provider] ??
    DEFAULT_MODELS[provider as Provider];
  if (provider === 'glm') {
    return createGLMAdapter({ apiKey, model, tools: TOOL_DEFINITIONS });
  }
  if (provider === 'n9router') {
    return createN9RouterAdapter({ apiKey, model, tools: TOOL_DEFINITIONS });
  }
  if (provider === 'glm-vision') {
    return createGLMVisionAdapter({ apiKey, model, tools: TOOL_DEFINITIONS });
  }
  return createClaudeAdapter({ apiKey, model, tools: TOOL_DEFINITIONS });
}

/** Transkrip chat — satu union untuk bubble user/asisten, note, kartu tool, error. */
export type ChatEntry =
  | { kind: 'user'; text: string; images?: string[] }
  | { kind: 'assistant'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'error'; text: string }
  | {
      kind: 'tool';
      name: string;
      input: Record<string, unknown>;
      ok: boolean;
      error?: string;
      ms: number;
    };

interface ChatState {
  entries: ChatEntry[];
  status: 'idle' | 'thinking' | 'error';
  lastError: string | null;
  sendPrompt: (prompt: string, images?: string[]) => Promise<void>;
  pushNote: (text: string) => void;
  reset: () => void;
}

function providerLabel(provider: Provider): string {
  if (provider === 'glm') return 'Z.ai (GLM)';
  if (provider === 'n9router') return '9Router';
  if (provider === 'glm-vision') return 'GLM Vision (Z.ai standard)';
  return 'Anthropic (Claude)';
}

export const useChatStore = create<ChatState>((set, get) => ({
  entries: [],
  status: 'idle',
  lastError: null,

  pushNote: (text) =>
    set((s) => ({ entries: [...s.entries, { kind: 'note', text }] })),

  reset: () => set({ entries: [], status: 'idle', lastError: null }),

  sendPrompt: async (prompt, images) => {
    const push = (entry: ChatEntry) =>
      set((s) => ({ entries: [...s.entries, entry] }));

    push({ kind: 'user', text: prompt, images });

    const llm = useLlmStore.getState();
    if (!llm.apiKey) {
      const msg = `API key untuk ${providerLabel(llm.provider)} belum diatur — tempel kunci Anda di formulir kunci di atas.`;
      push({ kind: 'error', text: msg });
      set({ status: 'error', lastError: msg });
      return;
    }

    const sceneJson = JSON.stringify(useSceneStore.getState().scene);
    const userPayload = `${prompt}\n\nCurrent scene JSON:\n${sceneJson}`;

    set({ status: 'thinking', lastError: null });

    try {
      const adapter = createAdapter(llm.provider, llm.apiKey);

      const result = await runWithRetry({
        adapter,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userPayload,
        userImages: images,
        tools: TOOL_DEFINITIONS,
        maxRetries: MAX_RETRIES,
        maxToolRounds: MAX_TOOL_ROUNDS,
        getSceneState: () =>
          JSON.stringify(useSceneStore.getState().scene),
        onAssistant: (content) =>
          push({ kind: 'assistant', text: content }),
        applyToolCall: async (name, input) => {
          const t0 = performance.now();
          const res = useSceneStore
            .getState()
            .applyToolCall({ name, input } as ToolCall);
          const ms = Math.round(performance.now() - t0);
          push({
            kind: 'tool',
            name,
            input: input as Record<string, unknown>,
            ok: res.ok,
            error: res.error,
            ms,
          });
          return res;
        },
      });

      // ponytail: assistant bubbles already streamed via onAssistant; only
      // surface result tails here (error, or a round-cap note).
      if (result.finalStatus === 'error') {
        const msg = result.lastError ?? 'unknown error';
        push({ kind: 'error', text: `Sesi berhenti dengan galat: ${msg}` });
      } else if (result.finalStatus === 'ok' && result.lastError) {
        push({ kind: 'note', text: result.lastError });
      }
      set({
        status: result.finalStatus === 'ok' ? 'idle' : 'error',
        lastError: result.lastError ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      push({ kind: 'error', text: msg });
      set({ status: 'error', lastError: msg });
    }
  },
}));

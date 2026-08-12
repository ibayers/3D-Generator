'use client';

import { create } from 'zustand';

export type Provider = 'claude' | 'glm';

const CLAUDE_KEY_STORAGE = 'asset-studio:anthropic-api-key';
const GLM_KEY_STORAGE = 'asset-studio:glm-api-key';
const PROVIDER_STORAGE = 'asset-studio:provider';
const LEGACY_KEY_STORAGE = 'asset-studio:anthropic-api-key';

interface LlmState {
  provider: Provider;
  claudeApiKey: string;
  glmApiKey: string;
  /** Derived: returns the active provider's key. */
  apiKey: string;
  setProvider: (provider: Provider) => void;
  setClaudeApiKey: (key: string) => void;
  setGlmApiKey: (key: string) => void;
  clearClaudeApiKey: () => void;
  clearGlmApiKey: () => void;
  hydrateFromStorage: () => void;
}

function readKey(storageKey: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
}

function writeKey(storageKey: string, key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (key) {
      window.localStorage.setItem(storageKey, key);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // ignore quota / privacy errors
  }
}

function readProvider(): Provider {
  if (typeof window === 'undefined') return 'claude';
  try {
    const v = window.localStorage.getItem(PROVIDER_STORAGE);
    return v === 'glm' ? 'glm' : 'claude';
  } catch {
    return 'claude';
  }
}

function writeProvider(provider: Provider): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROVIDER_STORAGE, provider);
  } catch {
    // ignore
  }
}

function activeKey(provider: Provider, claudeKey: string, glmKey: string): string {
  return provider === 'glm' ? glmKey : claudeKey;
}

export const useLlmStore = create<LlmState>((set, get) => ({
  provider: 'claude',
  claudeApiKey: '',
  glmApiKey: '',
  apiKey: '',
  setProvider: (provider) => {
    writeProvider(provider);
    const { claudeApiKey, glmApiKey } = get();
    set({ provider, apiKey: activeKey(provider, claudeApiKey, glmApiKey) });
  },
  setClaudeApiKey: (key) => {
    writeKey(CLAUDE_KEY_STORAGE, key);
    const { provider, glmApiKey } = get();
    set({ claudeApiKey: key, apiKey: activeKey(provider, key, glmApiKey) });
  },
  setGlmApiKey: (key) => {
    writeKey(GLM_KEY_STORAGE, key);
    const { provider, claudeApiKey } = get();
    set({ glmApiKey: key, apiKey: activeKey(provider, claudeApiKey, key) });
  },
  clearClaudeApiKey: () => get().setClaudeApiKey(''),
  clearGlmApiKey: () => get().setGlmApiKey(''),
  hydrateFromStorage: () => {
    const claudeApiKey = readKey(CLAUDE_KEY_STORAGE) || readKey(LEGACY_KEY_STORAGE);
    const glmApiKey = readKey(GLM_KEY_STORAGE);
    const provider = readProvider();
    set({
      claudeApiKey,
      glmApiKey,
      provider,
      apiKey: activeKey(provider, claudeApiKey, glmApiKey),
    });
  },
}));

'use client';

import { create } from 'zustand';

export type Provider = 'claude' | 'glm' | 'n9router' | 'glm-vision';

const CLAUDE_KEY_STORAGE = 'asset-studio:anthropic-api-key';
const GLM_KEY_STORAGE = 'asset-studio:glm-api-key';
const N9ROUTER_KEY_STORAGE = 'asset-studio:n9router-api-key';
const GLM_VISION_KEY_STORAGE = 'asset-studio:glm-vision-api-key';
const PROVIDER_STORAGE = 'asset-studio:provider';
const LEGACY_KEY_STORAGE = 'asset-studio:anthropic-api-key';
const MODEL_STORAGE_PREFIX = 'asset-studio:model:';

// ponytail: GLM defaults to the Coding Plan endpoint; 'glm-4.6' is the
// subscription model. Users can override per provider in the chat panel.
export const DEFAULT_MODELS: Record<Provider, string> = {
  claude: 'claude-sonnet-4-6',
  glm: 'glm-4.6',
  n9router: 'glm/glm-5.1',
  'glm-vision': 'glm-5.3-flash',
};

/** Providers whose adapter maps ChatMessage.images to the wire format. */
export const SUPPORTS_IMAGES: Record<Provider, boolean> = {
  claude: false,
  glm: false,
  n9router: false,
  'glm-vision': true,
};

interface LlmState {
  provider: Provider;
  claudeApiKey: string;
  glmApiKey: string;
  n9routerApiKey: string;
  glmVisionApiKey: string;
  /** Derived: returns the active provider's key. */
  apiKey: string;
  setProvider: (provider: Provider) => void;
  setClaudeApiKey: (key: string) => void;
  setGlmApiKey: (key: string) => void;
  setN9RouterApiKey: (key: string) => void;
  setGlmVisionApiKey: (key: string) => void;
  /** Active model per provider (override persisted in localStorage). */
  models: Record<Provider, string>;
  setModel: (provider: Provider, model: string) => void;
  clearClaudeApiKey: () => void;
  clearGlmApiKey: () => void;
  clearN9RouterApiKey: () => void;
  clearGlmVisionApiKey: () => void;
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
    if (v === 'glm' || v === 'n9router' || v === 'glm-vision') return v;
    return 'claude';
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

function activeKey(
  provider: Provider,
  claudeKey: string,
  glmKey: string,
  n9routerKey: string,
  glmVisionKey: string,
): string {
  if (provider === 'glm') return glmKey;
  if (provider === 'n9router') return n9routerKey;
  if (provider === 'glm-vision') return glmVisionKey;
  return claudeKey;
}

export const useLlmStore = create<LlmState>((set, get) => ({
  provider: 'claude',
  claudeApiKey: '',
  glmApiKey: '',
  n9routerApiKey: '',
  glmVisionApiKey: '',
  apiKey: '',
  models: { ...DEFAULT_MODELS },
  setModel: (provider, model) => {
    const trimmed = model.trim();
    writeKey(MODEL_STORAGE_PREFIX + provider, trimmed);
    set((s) => ({
      models: {
        ...s.models,
        [provider]: trimmed || DEFAULT_MODELS[provider],
      },
    }));
  },
  setProvider: (provider) => {
    writeProvider(provider);
    const { claudeApiKey, glmApiKey, n9routerApiKey, glmVisionApiKey } = get();
    set({
      provider,
      apiKey: activeKey(
        provider,
        claudeApiKey,
        glmApiKey,
        n9routerApiKey,
        glmVisionApiKey,
      ),
    });
  },
  setClaudeApiKey: (key) => {
    writeKey(CLAUDE_KEY_STORAGE, key);
    const { provider, glmApiKey, n9routerApiKey, glmVisionApiKey } = get();
    set({
      claudeApiKey: key,
      apiKey: activeKey(
        provider,
        key,
        glmApiKey,
        n9routerApiKey,
        glmVisionApiKey,
      ),
    });
  },
  setGlmApiKey: (key) => {
    writeKey(GLM_KEY_STORAGE, key);
    const { provider, claudeApiKey, n9routerApiKey, glmVisionApiKey } = get();
    set({
      glmApiKey: key,
      apiKey: activeKey(
        provider,
        claudeApiKey,
        key,
        n9routerApiKey,
        glmVisionApiKey,
      ),
    });
  },
  setN9RouterApiKey: (key) => {
    writeKey(N9ROUTER_KEY_STORAGE, key);
    const { provider, claudeApiKey, glmApiKey, glmVisionApiKey } = get();
    set({
      n9routerApiKey: key,
      apiKey: activeKey(
        provider,
        claudeApiKey,
        glmApiKey,
        key,
        glmVisionApiKey,
      ),
    });
  },
  setGlmVisionApiKey: (key) => {
    writeKey(GLM_VISION_KEY_STORAGE, key);
    const { provider, claudeApiKey, glmApiKey, n9routerApiKey } = get();
    set({
      glmVisionApiKey: key,
      apiKey: activeKey(
        provider,
        claudeApiKey,
        glmApiKey,
        n9routerApiKey,
        key,
      ),
    });
  },
  clearClaudeApiKey: () => get().setClaudeApiKey(''),
  clearGlmApiKey: () => get().setGlmApiKey(''),
  clearN9RouterApiKey: () => get().setN9RouterApiKey(''),
  clearGlmVisionApiKey: () => get().setGlmVisionApiKey(''),
  hydrateFromStorage: () => {
    const claudeApiKey =
      readKey(CLAUDE_KEY_STORAGE) || readKey(LEGACY_KEY_STORAGE);
    const glmApiKey = readKey(GLM_KEY_STORAGE);
    const n9routerApiKey = readKey(N9ROUTER_KEY_STORAGE);
    const glmVisionApiKey = readKey(GLM_VISION_KEY_STORAGE);
    const provider = readProvider();
    const readModel = (p: Provider): string =>
      readKey(MODEL_STORAGE_PREFIX + p) || DEFAULT_MODELS[p];
    const models: Record<Provider, string> = {
      claude: readModel('claude'),
      glm: readModel('glm'),
      n9router: readModel('n9router'),
      'glm-vision': readModel('glm-vision'),
    };
    set({
      claudeApiKey,
      glmApiKey,
      n9routerApiKey,
      glmVisionApiKey,
      provider,
      models,
      apiKey: activeKey(
        provider,
        claudeApiKey,
        glmApiKey,
        n9routerApiKey,
        glmVisionApiKey,
      ),
    });
  },
}));

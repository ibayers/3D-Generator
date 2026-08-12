'use client';

import { create } from 'zustand';

const STORAGE_KEY = 'asset-studio:anthropic-api-key';

interface LlmState {
  apiKey: string;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  hydrateFromStorage: () => void;
}

function readStorage(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (key) {
      window.localStorage.setItem(STORAGE_KEY, key);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore quota / privacy errors
  }
}

export const useLlmStore = create<LlmState>((set) => ({
  apiKey: '',
  setApiKey: (key) => {
    writeStorage(key);
    set({ apiKey: key });
  },
  clearApiKey: () => {
    writeStorage('');
    set({ apiKey: '' });
  },
  hydrateFromStorage: () => {
    set({ apiKey: readStorage() });
  },
}));

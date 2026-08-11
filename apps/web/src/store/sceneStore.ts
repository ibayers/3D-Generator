'use client';

import { create } from 'zustand';
import {
  sampleScene,
  executeToolCall,
  type Scene,
  type ToolCall,
} from '@asset-studio/scene-engine';

interface SceneState {
  scene: Scene;
  history: Scene[];
  applyToolCall: (call: ToolCall) => { ok: boolean; error?: string };
  reset: () => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  scene: sampleScene,
  history: [],
  applyToolCall: (call) => {
    const current = get().scene;
    const result = executeToolCall(current, call);
    if (result.ok) {
      set({
        scene: result.scene,
        history: [...get().history, current],
      });
      return { ok: true };
    }
    return { ok: false, error: result.error.message };
  },
  reset: () => set({ scene: sampleScene, history: [] }),
}));

'use client';

import { create } from 'zustand';
import {
  executeToolCall,
  type Scene,
  type ToolCall,
} from '@asset-studio/scene-engine';

const EMPTY_SCENE: Scene = { version: '0.1', nodes: [] };

interface Snapshot {
  scene: Scene;
  label: string;
}

interface SceneState {
  scene: Scene;
  /** Undo stack — setiap entry adalah scene sebelum satu mutasi. */
  history: Snapshot[];
  /** Redo stack — terisi saat undo, dikosongkan saat mutasi baru. */
  future: Snapshot[];
  selectedId: string | null;
  hiddenIds: string[];
  /** Deskripsi aksi terakhir untuk status strip, mis. "create_house · snapshot #3". */
  lastAction: string;
  /** Dihitung bridge component di Viewport via traverse mesh three.js. */
  triCount: number;
  /** Counter — Topbar menaikkan, ExportBridge di dalam Canvas merespons. */
  exportTick: number;
  applyToolCall: (call: ToolCall) => { ok: boolean; error?: string };
  undo: () => string | null;
  redo: () => string | null;
  select: (id: string | null) => void;
  toggleHidden: (id: string) => void;
  setTriCount: (count: number) => void;
  requestExport: () => void;
  reset: () => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  scene: EMPTY_SCENE,
  history: [],
  future: [],
  selectedId: null,
  hiddenIds: [],
  lastAction: 'siap — menunggu instruksi',
  triCount: 0,
  exportTick: 0,

  applyToolCall: (call) => {
    const { scene, history } = get();
    const result = executeToolCall(scene, call);
    if (result.ok) {
      set({
        scene: result.scene,
        history: [...history, { scene, label: call.name }],
        future: [],
        lastAction: `${call.name} · snapshot #${history.length + 1}`,
      });
      return { ok: true };
    }
    set({ lastAction: `${call.name} · gagal — ${result.error.message}` });
    return { ok: false, error: result.error.message };
  },

  undo: () => {
    const { history, future, scene } = get();
    const last = history[history.length - 1];
    if (!last) return null;
    set({
      scene: last.scene,
      history: history.slice(0, -1),
      future: [...future, { scene, label: last.label }],
      selectedId: null,
      lastAction: `undo · snapshot #${history.length - 1} dipulihkan (${last.label})`,
    });
    return last.label;
  },

  redo: () => {
    const { history, future, scene } = get();
    const next = future[future.length - 1];
    if (!next) return null;
    set({
      scene: next.scene,
      history: [...history, { scene, label: next.label }],
      future: future.slice(0, -1),
      selectedId: null,
      lastAction: `redo · snapshot #${history.length + 1} diterapkan ulang (${next.label})`,
    });
    return next.label;
  },

  select: (id) => set({ selectedId: id }),

  toggleHidden: (id) => {
    const { hiddenIds } = get();
    set({
      hiddenIds: hiddenIds.includes(id)
        ? hiddenIds.filter((h) => h !== id)
        : [...hiddenIds, id],
    });
  },

  setTriCount: (count) => set({ triCount: count }),

  requestExport: () => set((s) => ({ exportTick: s.exportTick + 1 })),

  reset: () =>
    set({
      scene: EMPTY_SCENE,
      history: [],
      future: [],
      selectedId: null,
      hiddenIds: [],
      lastAction: 'siap — menunggu instruksi',
      triCount: 0,
      exportTick: 0,
    }),
}));

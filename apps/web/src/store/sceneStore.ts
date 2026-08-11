import { create } from "zustand";
import { sampleScene, type Scene } from "@asset-studio/scene-engine";

type SceneStore = {
  scene: Scene;
  setScene: (next: Scene) => void;
};

export const useSceneStore = create<SceneStore>()((set) => ({
  scene: sampleScene,
  setScene: (next) => set({ scene: next }),
}));

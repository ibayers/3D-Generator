import type { Scene, SceneNode } from '../types';

export function findNode(scene: Scene, id: string): SceneNode | undefined {
  for (const node of scene.nodes) {
    const found = findInNode(node, id);
    if (found) return found;
  }
  return undefined;
}

function findInNode(node: SceneNode, id: string): SceneNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findInNode(child, id);
    if (found) return found;
  }
  return undefined;
}

export function mapScene(
  scene: Scene,
  fn: (node: SceneNode) => SceneNode,
): Scene {
  const visit = (node: SceneNode): SceneNode => {
    const updated = fn(node);
    return { ...updated, children: node.children.map(visit) };
  };
  return { ...scene, nodes: scene.nodes.map(visit) };
}

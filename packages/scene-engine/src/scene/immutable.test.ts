import { describe, it, expect } from 'vitest';
import { findNode, mapScene } from './immutable.js';
import { sampleScene } from '../sampleScene.js';

describe('findNode', () => {
  it('returns top-level node by id', () => {
    const node = findNode(sampleScene, 'box-01');
    expect(node?.id).toBe('box-01');
    expect(node?.type).toBe('box');
  });

  it('returns nested child by id', () => {
    const node = findNode(sampleScene, 'cylinder-01');
    expect(node?.id).toBe('cylinder-01');
  });

  it('returns undefined for missing id', () => {
    expect(findNode(sampleScene, 'nope')).toBeUndefined();
  });
});

describe('mapScene', () => {
  it('returns new scene object (immutability)', () => {
    const next = mapScene(sampleScene, (n) => n);
    expect(next).not.toBe(sampleScene);
    expect(next).toEqual(sampleScene);
  });

  it('updates a node by id without mutating original', () => {
    const original = sampleScene.nodes[0]!;
    const next = mapScene(sampleScene, (n) =>
      n.id === 'box-01' ? { ...n, name: 'renamed' } : n
    );
    expect(original.name).not.toBe('renamed');
    expect(findNode(next, 'box-01')?.name).toBe('renamed');
  });

  it('preserves siblings and other branches untouched', () => {
    const next = mapScene(sampleScene, (n) =>
      n.id === 'box-01' ? { ...n, name: 'changed' } : n
    );
    expect(findNode(next, 'plane-ground')?.name).toBe('Ground');
  });
});

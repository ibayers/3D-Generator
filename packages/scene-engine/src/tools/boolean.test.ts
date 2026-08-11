import { describe, it, expect } from 'vitest';
import { applyBoolean } from './boolean';
import { sampleScene } from '../sampleScene';

describe('applyBoolean', () => {
  it('creates a boolean node referencing two operands', () => {
    const before = sampleScene.nodes.length;
    const result = applyBoolean(sampleScene, {
      id: 'cut-01',
      operation: 'subtract',
      a: 'box-01',
      b: 'sphere-01',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scene.nodes).toHaveLength(before + 1);
      const node = result.scene.nodes.find((n) => n.id === 'cut-01');
      expect(node?.type).toBe('boolean');
      expect(node?.parameters.operation).toBe('subtract');
      expect(node?.parameters.a).toBe('box-01');
      expect(node?.parameters.b).toBe('sphere-01');
    }
  });

  it('returns NODE_NOT_FOUND when operand a is missing', () => {
    const result = applyBoolean(sampleScene, {
      id: 'cut-02',
      operation: 'union',
      a: 'nope',
      b: 'box-01',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NODE_NOT_FOUND');
  });

  it('returns NODE_NOT_FOUND when operand b is missing', () => {
    const result = applyBoolean(sampleScene, {
      id: 'cut-03',
      operation: 'intersect',
      a: 'box-01',
      b: 'nope',
    });
    if (!result.ok) expect(result.error.code).toBe('NODE_NOT_FOUND');
  });

  it('rejects invalid operation', () => {
    const result = applyBoolean(sampleScene, {
      id: 'cut-04',
      operation: 'xor' as any,
      a: 'box-01',
      b: 'sphere-01',
    });
    if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('does not mutate original scene', () => {
    const before = JSON.stringify(sampleScene);
    applyBoolean(sampleScene, {
      id: 'x',
      operation: 'union',
      a: 'box-01',
      b: 'sphere-01',
    });
    expect(JSON.stringify(sampleScene)).toBe(before);
  });
});

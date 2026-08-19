import { describe, it, expect } from 'vitest';
import { createHouseToolInputSchema } from '../src/toolSchemas';

describe('createHouseToolInputSchema', () => {
  it('accepts id + position only (everything else defaulted)', () => {
    const r = createHouseToolInputSchema.safeParse({ id: 'h', position: [0, 0, 0] });
    expect(r.success).toBe(true);
  });

  it('accepts floors and roofStyle without size', () => {
    const r = createHouseToolInputSchema.safeParse({
      id: 'h',
      position: [1, 0, 2],
      floors: 2,
      roofStyle: 'gable',
      roofHeight: 1.8,
    });
    expect(r.success).toBe(true);
  });

  it('rejects floors outside 1-3', () => {
    expect(
      createHouseToolInputSchema.safeParse({ id: 'h', position: [0, 0, 0], floors: 4 }).success
    ).toBe(false);
    expect(
      createHouseToolInputSchema.safeParse({ id: 'h', position: [0, 0, 0], floors: 0 }).success
    ).toBe(false);
  });

  it('rejects unknown roofStyle', () => {
    expect(
      createHouseToolInputSchema.safeParse({ id: 'h', position: [0, 0, 0], roofStyle: 'dome' }).success
    ).toBe(false);
  });

  it('still rejects a malformed size tuple', () => {
    expect(
      createHouseToolInputSchema.safeParse({ id: 'h', position: [0, 0, 0], size: [4, 3] }).success
    ).toBe(false);
  });
});

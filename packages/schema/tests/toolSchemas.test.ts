import { describe, it, expect } from 'vitest';
import {
  createHouseToolInputSchema,
  createTreeToolInputSchema,
  createCharacterToolInputSchema,
} from '../src/toolSchemas';

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

describe('createTreeToolInputSchema', () => {
  it('accepts a minimal valid input', () => {
    const parsed = createTreeToolInputSchema.safeParse({ id: 't1', position: [1, 0, 2] });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown type and non-positive height', () => {
    const badType = createTreeToolInputSchema.safeParse({
      id: 't',
      position: [0, 0, 0],
      type: 'palm',
    });
    expect(badType.success).toBe(false);
    const badHeight = createTreeToolInputSchema.safeParse({
      id: 't',
      position: [0, 0, 0],
      height: -1,
    });
    expect(badHeight.success).toBe(false);
  });
});

describe('createCharacterToolInputSchema', () => {
  it('accepts a minimal valid input', () => {
    const parsed = createCharacterToolInputSchema.safeParse({
      id: 'char-01',
      position: [0, 0, 2],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown build and bad height', () => {
    const badBuild = createCharacterToolInputSchema.safeParse({
      id: 'c',
      position: [0, 0, 0],
      build: 'round',
    });
    expect(badBuild.success).toBe(false);
    const badHeight = createCharacterToolInputSchema.safeParse({
      id: 'c',
      position: [0, 0, 0],
      height: -1,
    });
    expect(badHeight.success).toBe(false);
  });
});

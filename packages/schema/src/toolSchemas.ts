import { z } from 'zod';
import { vec3Schema } from './sceneSchema';

export const transformToolInputSchema = z.object({
  nodeId: z.string(),
  position: vec3Schema.optional(),
  rotation: vec3Schema.optional(),
  scale: vec3Schema.optional(),
});

export const setMaterialToolInputSchema = z.object({
  nodeId: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const arrayToolInputSchema = z.object({
  nodeId: z.string(),
  count: z.number().int().min(1).max(100),
  offset: vec3Schema,
});

export const extrudeToolInputSchema = z.object({
  id: z.string(),
  shape: z.array(z.tuple([z.number(), z.number()])).min(3),
  depth: z.number().positive(),
  position: vec3Schema.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const booleanToolInputSchema = z.object({
  id: z.string(),
  operation: z.enum(['union', 'subtract', 'intersect']),
  a: z.string(),
  b: z.string(),
});

export const createHouseToolInputSchema = z.object({
  id: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  /** [width, height, depth]; default [8, floors*3, 6] in the template. */
  size: z.tuple([z.number(), z.number(), z.number()]).optional(),
  floors: z.number().int().min(1).max(3).optional(),
  roofStyle: z.enum(['flat', 'gable']).optional(),
  roofHeight: z.number().positive().optional(),
  wallColor: z.string().optional(),
  roofColor: z.string().optional(),
});
export type CreateHouseToolInput = z.infer<typeof createHouseToolInputSchema>;

export const createRoadToolInputSchema = z.object({
  id: z.string(),
  path: z.array(z.tuple([z.number(), z.number()])),
  width: z.number(),
  color: z.string().optional(),
});
export type CreateRoadToolInput = z.infer<typeof createRoadToolInputSchema>;

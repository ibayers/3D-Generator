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

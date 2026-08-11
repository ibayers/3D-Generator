import { z } from 'zod';
import { vec3Schema } from './sceneSchema.js';

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

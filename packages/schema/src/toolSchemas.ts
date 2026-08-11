import { z } from 'zod';

export const transformToolInputSchema = z.object({
  nodeId: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }).optional(),
  rotation: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }).optional(),
  scale: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }).optional(),
});

export const setMaterialToolInputSchema = z.object({
  nodeId: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const arrayToolInputSchema = z.object({
  nodeId: z.string(),
  count: z.number().int().min(1).max(100),
  offset: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
});

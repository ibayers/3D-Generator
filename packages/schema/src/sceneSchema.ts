import { z } from 'zod';

export const vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const transformSchema = z.object({
  position: vec3Schema,
  rotation: vec3Schema,
  scale: vec3Schema,
});

export const materialSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const primitiveMeshTypeSchema = z.enum(['box', 'sphere', 'cylinder', 'plane']);

// Lazy recursion for children
export const sceneNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.enum(['mesh', 'group']),
    name: z.string(),
    transform: transformSchema,
    meshType: primitiveMeshTypeSchema.optional(),
    material: materialSchema.optional(),
    parameters: z.record(z.string(), z.any()).optional(),
    children: z.array(sceneNodeSchema).default([]),
  })
);

export const sceneSchema = z.object({
  version: z.literal('1.0'),
  nodes: z.array(sceneNodeSchema),
});

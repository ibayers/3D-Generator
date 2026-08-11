import { z } from 'zod';

// Vec3 in scene-engine is a tuple [x, y, z] — schema must match.
export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const transformSchema = z.object({
  position: vec3Schema,
  rotation: vec3Schema,
  scale: vec3Schema,
});

export const materialSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

// scene-engine SceneNodeType is the full primitive union + 'group'.
// No separate 'mesh' wrapper — type carries the primitive name directly.
export const sceneNodeTypeSchema = z.enum(['box', 'sphere', 'cylinder', 'plane', 'group']);

export const sceneNodeParametersSchema = z.record(
  z.string(),
  z.union([z.number(), z.array(z.number()), z.string()])
);

// Lazy recursion for children
export const sceneNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: sceneNodeTypeSchema,
    name: z.string(),
    transform: transformSchema,
    parameters: sceneNodeParametersSchema,
    material: materialSchema.optional(),
    children: z.array(sceneNodeSchema).default([]),
  })
);

export const sceneSchema = z.object({
  version: z.string(),
  nodes: z.array(sceneNodeSchema),
});

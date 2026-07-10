import { z } from 'zod';

export const CreateProjectSchema = z.object({
  name: z
    .string()
    .min(2, 'Project name must be at least 2 characters')
    .max(128, 'Project name must not exceed 128 characters')
    .trim(),
  description: z.string().max(1000).trim().optional(),
  visibility: z.enum(['PRIVATE', 'WORKSPACE', 'PUBLIC']).default('PRIVATE'),
});

export const UpdateProjectSchema = z.object({
  name: z
    .string()
    .min(2, 'Project name must be at least 2 characters')
    .max(128, 'Project name must not exceed 128 characters')
    .trim()
    .optional(),
  description: z.string().max(1000).trim().nullable().optional(),
  visibility: z.enum(['PRIVATE', 'WORKSPACE', 'PUBLIC']).optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

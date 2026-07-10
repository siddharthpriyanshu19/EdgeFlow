import { z } from 'zod';

const WorkspaceRoleSchema = z.enum(['VIEWER', 'EDITOR', 'ADMIN', 'OWNER']);

export const CreateWorkspaceSchema = z.object({
  name: z
    .string()
    .min(2, 'Workspace name must be at least 2 characters')
    .max(64, 'Workspace name must not exceed 64 characters')
    .trim(),
  description: z.string().max(500).trim().optional(),
  logoUrl: z.string().url('Invalid URL').optional(),
});

export const UpdateWorkspaceSchema = z.object({
  name: z
    .string()
    .min(2, 'Workspace name must be at least 2 characters')
    .max(64, 'Workspace name must not exceed 64 characters')
    .trim()
    .optional(),
  description: z.string().max(500).trim().nullable().optional(),
  logoUrl: z.string().url('Invalid URL').nullable().optional(),
});

export const InviteMemberSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  role: WorkspaceRoleSchema.exclude(['OWNER']),
});

export const UpdateMemberRoleSchema = z.object({
  role: WorkspaceRoleSchema.exclude(['OWNER']),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;

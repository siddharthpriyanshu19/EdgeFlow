/**
 * Project domain types.
 */

export type ProjectVisibility = 'PRIVATE' | 'WORKSPACE' | 'PUBLIC';

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  visibility: ProjectVisibility;
  thumbnailUrl: string | null;
  createdByUserId: string;
  lastAccessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: import('./workspace.js').WorkspaceRole;
  createdAt: Date;
}

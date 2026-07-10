/**
 * Workspace and membership domain types.
 */

export type WorkspaceRole = 'VIEWER' | 'EDITOR' | 'ADMIN' | 'OWNER';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: Date;
}

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  invitedByUserId: string;
  email: string;
  role: WorkspaceRole;
  status: InvitationStatus;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

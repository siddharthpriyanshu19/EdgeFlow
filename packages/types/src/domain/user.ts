/**
 * Core user domain types shared across all EdgeFlow services.
 */

export type UserStatus = 'UNVERIFIED' | 'VERIFIED' | 'SUSPENDED';

export type AuthProvider = 'EMAIL' | 'GOOGLE' | 'GITHUB';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: UserStatus;
  provider: AuthProvider;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPublicProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Session {
  id: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

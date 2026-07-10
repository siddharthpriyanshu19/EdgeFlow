/**
 * User Repository
 *
 * Data access for the User entity.
 * All Prisma calls are isolated here — never in services.
 */

import type { PrismaClient } from '@prisma/client';

export interface CreateUserData {
  email: string;
  displayName: string;
  passwordHash?: string;
  provider: 'EMAIL' | 'GOOGLE' | 'GITHUB';
  status: 'UNVERIFIED' | 'VERIFIED';
  avatarUrl?: string;
  googleId?: string;
  githubId?: string;
}

export interface UpdateUserData {
  displayName?: string;
  avatarUrl?: string | null;
  status?: 'UNVERIFIED' | 'VERIFIED' | 'SUSPENDED';
  passwordHash?: string;
  googleId?: string;
  githubId?: string;
}

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        provider: true,
        passwordHash: true,
        googleId: true,
        githubId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        provider: true,
        passwordHash: true,
        googleId: true,
        githubId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  async findByGithubId(githubId: string) {
    return this.prisma.user.findUnique({ where: { githubId } });
  }

  async create(data: CreateUserData) {
    const createData = {
      email: data.email,
      displayName: data.displayName,
      provider: data.provider,
      status: data.status,
      ...(data.passwordHash !== undefined ? { passwordHash: data.passwordHash } : {}),
      ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      ...(data.googleId !== undefined ? { googleId: data.googleId } : {}),
      ...(data.githubId !== undefined ? { githubId: data.githubId } : {}),
    };

    return this.prisma.user.create({
      data: createData,
    });
  }

  async update(id: string, data: UpdateUserData) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async findManyByIds(ids: string[]) {
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        email: true,
      },
    });
  }
}

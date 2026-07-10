/**
 * Auth Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../application/auth/auth.service.js';
import { ConflictError, UnauthorizedError } from '../../domain/errors/app-errors.js';

// Mock dependencies
const mockUserRepo = {
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockSessionRepo = {
  create: vi.fn(),
  findById: vi.fn(),
  findActiveByUserId: vi.fn(),
  revoke: vi.fn(),
  revokeAllForUser: vi.fn(),
};

const mockTokenService = {
  issueTokens: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
};

const mockEmailService = {
  sendPasswordResetEmail: vi.fn(),
  sendWorkspaceInvitationEmail: vi.fn(),
};

const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  invalidatePattern: vi.fn(),
};

const mockAuditService = {
  log: vi.fn(),
};

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService(
      mockUserRepo as any,
      mockSessionRepo as any,
      mockTokenService as any,
      mockEmailService as any,
      mockCache as any,
      mockAuditService as any,
    );
  });

  describe('register', () => {
    it('should create a new verified user', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockUserRepo.create.mockResolvedValue({ id: 'user-123', email: 'test@test.com' });
      mockAuditService.log.mockResolvedValue(undefined);

      const result = await authService.register({
        email: 'test@test.com',
        password: 'Password123',
        displayName: 'Test User',
      });

      expect(result).toEqual({ userId: 'user-123' });
      expect(mockUserRepo.create).toHaveBeenCalledOnce();
      expect(mockUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'VERIFIED' }),
      );
    });

    it('should throw ConflictError if email is already registered', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({ id: 'existing', email: 'test@test.com' });

      await expect(
        authService.register({
          email: 'test@test.com',
          password: 'Password123',
          displayName: 'Test User',
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedError for invalid credentials', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login(
          { email: 'wrong@test.com', password: 'wrong', rememberMe: false },
          { ipAddress: '127.0.0.1', userAgent: 'test' },
        ),
      ).rejects.toThrow(UnauthorizedError);
    });
  });

});

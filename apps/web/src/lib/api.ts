/**
 * EdgeFlow REST API client.
 *
 * - Wraps the versioned `/api/v1` surface exposed by the Fastify backend.
 * - Attaches the bearer access token and transparently refreshes it once on 401
 *   using the HTTP-only refresh cookie.
 * - Unwraps the `{ success, data }` envelope and throws typed errors.
 */

// ─── Domain types (mirror the backend responses) ──────────────────────────────

export type UserStatus = 'UNVERIFIED' | 'VERIFIED' | 'SUSPENDED';

export type User = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  status: UserStatus;
  provider?: string;
};

export type WorkspaceRole = 'VIEWER' | 'EDITOR' | 'ADMIN' | 'OWNER';

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  ownerId?: string;
  role?: WorkspaceRole;
  updatedAt?: string;
  createdAt?: string;
  _count?: { members?: number; projects?: number };
};

export type ProjectVisibility = 'PRIVATE' | 'WORKSPACE' | 'PUBLIC';

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  visibility: ProjectVisibility;
  thumbnailUrl?: string | null;
  createdByUserId?: string;
  updatedAt?: string;
  createdAt?: string;
  lastAccessedAt?: string | null;
  _count?: { nodes?: number; connections?: number; comments?: number };
};

export type Member = {
  userId: string;
  role: WorkspaceRole;
  joinedAt?: string;
  user?: Pick<User, 'id' | 'email' | 'displayName' | 'avatarUrl'>;
};

export type SearchResult = {
  type: 'Project' | 'Node' | 'Connection' | 'Comment' | 'User';
  id: string;
  title: string;
  subtitle?: string;
  projectId?: string;
};

export type ExportFormat = 'JSON' | 'YAML' | 'SVG' | 'PNG' | 'PDF';

export type ExportStatus = {
  id: string;
  state: string;
  progress: number | object;
  result?: unknown;
  failedReason?: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: { message?: string; code?: string; fields?: Record<string, string> };
  message?: string;
};

export class ApiError extends Error {
  status: number;
  code?: string | undefined;
  fields?: Record<string, string> | undefined;
  constructor(status: number, message: string, code?: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

// ─── Token storage ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'edgeflow_access_token';
const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '/api/v1';

let accessToken = localStorage.getItem(TOKEN_KEY) ?? '';

export function getAccessToken(): string {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// ─── Core request pipeline ─────────────────────────────────────────────────────

let refreshInFlight: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    setAccessToken('');
    throw new ApiError(response.status, 'Session expired');
  }
  const payload = (await response.json()) as ApiEnvelope<{ accessToken: string }>;
  const token = payload.data.accessToken;
  setAccessToken(token);
  return token;
}

async function refreshToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function raw<T>(path: string, options: RequestInit, retryOn401: boolean): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (response.status === 204) return undefined as T;

  let payload: ApiEnvelope<T> | undefined;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = undefined;
  }

  if (response.status === 401 && retryOn401 && !path.startsWith('/auth/')) {
    try {
      await refreshToken();
      return raw<T>(path, options, false);
    } catch {
      /* fall through to error below */
    }
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ?? payload?.message ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, message, payload?.error?.code, payload?.error?.fields);
  }

  return (payload?.data ?? (payload as unknown)) as T;
}

function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  return raw<T>(path, options, true);
}

const body = (data: unknown) => JSON.stringify(data);

// ─── API surface ───────────────────────────────────────────────────────────────

export const api = {
  // ── Auth ────────────────────────────────────────────────────────────────────
  register(input: { email: string; password: string; displayName: string }) {
    return request<{ message: string; userId: string }>('/auth/register', {
      method: 'POST',
      body: body(input),
    });
  },
  async login(input: { email: string; password: string; rememberMe?: boolean }) {
    const result = await request<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: body(input),
    });
    setAccessToken(result.accessToken);
    return result;
  },
  async logout() {
    try {
      await request<{ message: string }>('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken('');
    }
  },
  me() {
    return request<User>('/auth/me');
  },
  forgotPassword(email: string) {
    return request<{ message: string }>('/auth/forgot-password', { method: 'POST', body: body({ email }) });
  },
  resetPassword(input: { token: string; password: string }) {
    return request<{ message: string }>('/auth/reset-password', { method: 'POST', body: body(input) });
  },
  listSessions() {
    return request<
      Array<{ id: string; ipAddress: string; userAgent: string; createdAt: string; lastUsedAt: string; current?: boolean }>
    >('/auth/sessions');
  },
  revokeSession(sessionId: string) {
    return request<void>(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
  },
  listApiKeys() {
    return request<Array<{ id: string; name: string; lastUsedAt?: string | null; expiresAt?: string | null; createdAt: string }>>(
      '/auth/api-keys',
    );
  },
  createApiKey(input: { name: string; expiresAt?: string }) {
    return request<{ id: string; name: string; key: string }>('/auth/api-keys', { method: 'POST', body: body(input) });
  },
  deleteApiKey(keyId: string) {
    return request<void>(`/auth/api-keys/${keyId}`, { method: 'DELETE' });
  },
  auditLog(page = 1, limit = 20) {
    return request<{ items: unknown[]; total: number }>(`/auth/audit?page=${page}&limit=${limit}`);
  },

  // ── Workspaces ────────────────────────────────────────────────────────────────
  listWorkspaces() {
    return request<Workspace[]>('/workspaces');
  },
  getWorkspace(workspaceId: string) {
    return request<Workspace>(`/workspaces/${workspaceId}`);
  },
  createWorkspace(input: { name: string; description?: string }) {
    return request<Workspace>('/workspaces', { method: 'POST', body: body(input) });
  },
  updateWorkspace(workspaceId: string, input: { name?: string; description?: string }) {
    return request<Workspace>(`/workspaces/${workspaceId}`, { method: 'PATCH', body: body(input) });
  },
  deleteWorkspace(workspaceId: string) {
    return request<void>(`/workspaces/${workspaceId}`, { method: 'DELETE' });
  },
  listMembers(workspaceId: string) {
    return request<Member[]>(`/workspaces/${workspaceId}/members`);
  },
  inviteMember(workspaceId: string, input: { email: string; role: WorkspaceRole }) {
    return request<{ id: string; email: string }>(`/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      body: body(input),
    });
  },
  acceptInvitation(token: string) {
    return request<{ workspaceId: string }>(`/workspaces/invitations/${token}/accept`, { method: 'POST' });
  },
  updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
    return request<{ message: string }>(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PATCH',
      body: body({ role }),
    });
  },
  removeMember(workspaceId: string, userId: string) {
    return request<void>(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' });
  },
  search(workspaceId: string, query: string, type?: SearchResult['type']) {
    const params = new URLSearchParams({ query });
    if (type) params.set('type', type);
    return request<SearchResult[]>(`/workspaces/${workspaceId}/search?${params.toString()}`);
  },

  // ── Projects ──────────────────────────────────────────────────────────────────
  listProjects(workspaceId: string) {
    return request<Project[]>(`/workspaces/${workspaceId}/projects`);
  },
  getProject(workspaceId: string, projectId: string) {
    return request<Project>(`/workspaces/${workspaceId}/projects/${projectId}`);
  },
  createProject(workspaceId: string, input: { name: string; description?: string; visibility?: ProjectVisibility }) {
    return request<Project>(`/workspaces/${workspaceId}/projects`, { method: 'POST', body: body(input) });
  },
  updateProject(
    workspaceId: string,
    projectId: string,
    input: { name?: string; description?: string; visibility?: ProjectVisibility },
  ) {
    return request<Project>(`/workspaces/${workspaceId}/projects/${projectId}`, {
      method: 'PATCH',
      body: body(input),
    });
  },
  deleteProject(workspaceId: string, projectId: string) {
    return request<void>(`/workspaces/${workspaceId}/projects/${projectId}`, { method: 'DELETE' });
  },
  exportProject(workspaceId: string, projectId: string, format: ExportFormat) {
    return request<{ jobId: string; message: string }>(
      `/workspaces/${workspaceId}/projects/${projectId}/export`,
      { method: 'POST', body: body({ format }) },
    );
  },
  exportStatus(workspaceId: string, projectId: string, jobId: string) {
    return request<ExportStatus>(`/workspaces/${workspaceId}/projects/${projectId}/exports/${jobId}`);
  },
};

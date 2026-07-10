import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Clock, FolderPlus, Layers3, Loader2, Mail, Search, Shield,
  UserPlus, Users, X,
} from 'lucide-react';
import {
  api, ApiError, type Member, type Project, type ProjectVisibility,
  type SearchResult, type User, type Workspace, type WorkspaceRole,
} from '../lib/api';

const ROLES: WorkspaceRole[] = ['VIEWER', 'EDITOR', 'ADMIN', 'OWNER'];

export function Dashboard(props: {
  user: User | null;
  workspace: Workspace | null;
  projects: Project[];
  onCreateProject: (input: { name: string; description?: string; visibility: ProjectVisibility }) => Promise<Project>;
  onOpenProject: (p: Project) => void;
  onToast: (msg: string) => void;
}) {
  const { workspace } = props;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ProjectVisibility>('WORKSPACE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [members, setMembers] = useState<Member[]>([]);
  const [showInvite, setShowInvite] = useState(false);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!workspace) return;
    setMembers([]);
    api.listMembers(workspace.id).then(setMembers).catch(() => setMembers([]));
  }, [workspace?.id]);

  // Debounced workspace search (Requirement 18).
  useEffect(() => {
    if (!workspace || search.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api.search(workspace.id, search.trim()).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [search, workspace?.id]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setBusy(true);
    try {
      const input: { name: string; description?: string; visibility: ProjectVisibility } = { name: name.trim(), visibility };
      if (description.trim()) input.description = description.trim();
      await props.onCreateProject(input);
      setName('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create project');
    } finally {
      setBusy(false);
    }
  }

  const changeRole = useCallback(
    async (userId: string, role: WorkspaceRole) => {
      if (!workspace) return;
      try {
        await api.updateMemberRole(workspace.id, userId, role);
        setMembers((cur) => cur.map((m) => (m.userId === userId ? { ...m, role } : m)));
        props.onToast('Member role updated');
      } catch (err) {
        props.onToast(err instanceof Error ? err.message : 'Could not update role');
      }
    },
    [workspace?.id],
  );

  const recentProjects = useMemo(
    () => [...props.projects].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
    [props.projects],
  );

  return (
    <div className="dashboard">
      <header className="topbar">
        <div>
          <span className="eyebrow">{workspace?.name ?? 'Workspace'}</span>
          <h2>Architecture projects</h2>
        </div>
        <label className="search-box wide">
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects, nodes, comments…" />
          {search && (
            <button className="icon-button ghost" onClick={() => setSearch('')}><X size={14} /></button>
          )}
        </label>
      </header>

      {results.length > 0 && (
        <div className="search-results">
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              className="search-result"
              onClick={() => {
                const target = props.projects.find((p) => p.id === (r.projectId ?? r.id));
                if (target) props.onOpenProject(target);
              }}
            >
              <span className="result-type">{r.type}</span>
              <strong>{r.title}</strong>
              {r.subtitle && <small>{r.subtitle}</small>}
            </button>
          ))}
        </div>
      )}

      <section className="metric-grid">
        <Metric label="Projects" value={String(props.projects.length)} icon={<Layers3 size={18} />} />
        <Metric label="Members" value={String(members.length || workspace?._count?.members || 1)} icon={<Users size={18} />} />
        <Metric label="Your role" value={(workspace?.role ?? 'OWNER').toLowerCase()} icon={<Shield size={18} />} />
      </section>

      <section className="dashboard-grid">
        <div className="stack">
          <form className="create-panel" onSubmit={createProject}>
            <h3><FolderPlus size={18} /> New diagram</h3>
            <label className="field">
              <span>Project name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Payments platform" />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What system does this model?" />
            </label>
            <label className="field">
              <span>Visibility</span>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as ProjectVisibility)}>
                <option value="PRIVATE">Private — only you</option>
                <option value="WORKSPACE">Workspace — all members</option>
                <option value="PUBLIC">Public — anyone with the link</option>
              </select>
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button" type="submit" disabled={busy || !workspace}>
              {busy && <Loader2 size={16} className="spin" />} Create canvas
            </button>
            {!workspace && <p className="empty-text sm">Create a workspace first.</p>}
          </form>

          <MembersCard
            workspace={workspace}
            members={members}
            showInvite={showInvite}
            onToggleInvite={() => setShowInvite((v) => !v)}
            onInvited={(m) => setMembers((cur) => [...cur, m])}
            onChangeRole={changeRole}
            onToast={props.onToast}
          />
        </div>

        <div className="project-list">
          {recentProjects.length === 0 && (
            <div className="empty-panel">
              <Box size={26} />
              <strong>No projects yet</strong>
              <span>Create your first architecture diagram to get started.</span>
            </div>
          )}
          {recentProjects.map((p) => (
            <button className="project-card" key={p.id} onClick={() => props.onOpenProject(p)}>
              <span className="project-icon"><Box size={18} /></span>
              <strong>{p.name}</strong>
              <span className="project-desc">{p.description || 'System architecture workspace'}</span>
              <div className="project-foot">
                <small>{p._count?.nodes ?? 0} nodes · {p.visibility.toLowerCase()}</small>
                {p.updatedAt && <small className="muted"><Clock size={11} /> {relativeTime(p.updatedAt)}</small>}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function MembersCard({
  workspace, members, showInvite, onToggleInvite, onInvited, onChangeRole, onToast,
}: {
  workspace: Workspace | null;
  members: Member[];
  showInvite: boolean;
  onToggleInvite: () => void;
  onInvited: (m: Member) => void;
  onChangeRole: (userId: string, role: WorkspaceRole) => void;
  onToast: (msg: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('EDITOR');
  const [busy, setBusy] = useState(false);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !email.trim()) return;
    setBusy(true);
    try {
      await api.inviteMember(workspace.id, { email: email.trim(), role });
      onToast(`Invitation sent to ${email.trim()}`);
      onInvited({ userId: `pending-${email}`, role, user: { id: '', email: email.trim(), displayName: email.trim(), avatarUrl: null } });
      setEmail('');
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not send invitation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="members-panel">
      <div className="members-head">
        <h3><Users size={17} /> Team</h3>
        <button className="ghost-button" onClick={onToggleInvite}>
          <UserPlus size={15} /> Invite
        </button>
      </div>

      {showInvite && (
        <form className="invite-form" onSubmit={invite}>
          <div className="invite-row">
            <Mail size={15} />
            <input type="email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="invite-row">
            <select value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
              {ROLES.filter((r) => r !== 'OWNER').map((r) => (
                <option key={r} value={r}>{r.toLowerCase()}</option>
              ))}
            </select>
            <button className="primary-button sm" type="submit" disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : 'Send'}
            </button>
          </div>
        </form>
      )}

      <div className="member-list">
        {members.length === 0 && <p className="empty-text sm">Just you for now.</p>}
        {members.map((m) => (
          <div className="member-row" key={m.userId}>
            <span className="user-avatar sm">{(m.user?.displayName ?? m.user?.email ?? '?')[0]?.toUpperCase()}</span>
            <div className="member-meta">
              <strong className="truncate">{m.user?.displayName ?? m.user?.email ?? m.userId}</strong>
              <small className="truncate">{m.user?.email}</small>
            </div>
            <select
              className="role-select"
              value={m.role}
              disabled={m.role === 'OWNER'}
              onChange={(e) => onChangeRole(m.userId, e.target.value as WorkspaceRole)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.toLowerCase()}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="metric">
      <span className="metric-icon">{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

import { useEffect, useRef, useState } from 'react';
import {
  Box, Check, ChevronsUpDown, Grid3X3, LayoutDashboard, LogOut,
  Moon, Plus, Sun,
} from 'lucide-react';
import type { Project, User, Workspace } from '../lib/api';

export function Shell(props: {
  user: User | null;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  projects: Project[];
  activeProject: Project | null;
  view: 'dashboard' | 'canvas';
  theme: 'light' | 'dark';
  children: React.ReactNode;
  onSelectWorkspace: (w: Workspace) => void;
  onCreateWorkspace: (input: { name: string; description?: string }) => Promise<void>;
  onOpenProject: (p: Project) => void;
  onOpenDashboard: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [wsName, setWsName] = useState('');
  const [wsDesc, setWsDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setSwitcherOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!wsName.trim()) return;
    setBusy(true);
    try {
      const input: { name: string; description?: string } = { name: wsName.trim() };
      if (wsDesc.trim()) input.description = wsDesc.trim();
      await props.onCreateWorkspace(input);
      setWsName('');
      setWsDesc('');
      setCreating(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand side-brand" onClick={props.onOpenDashboard}>
          <span className="brand-mark"><Grid3X3 size={18} /></span>
          EdgeFlow
        </button>

        <div className="sidebar-section">
          <div className="sidebar-title">Workspace</div>
          <div className="workspace-switcher" ref={switcherRef}>
            <button className="workspace-switch" onClick={() => setSwitcherOpen((v) => !v)}>
              <span className="ws-avatar">{initials(props.activeWorkspace?.name)}</span>
              <span className="ws-name">{props.activeWorkspace?.name ?? 'Select workspace'}</span>
              <ChevronsUpDown size={15} />
            </button>
            {switcherOpen && (
              <div className="switch-menu">
                {props.workspaces.map((w) => (
                  <button
                    key={w.id}
                    className={w.id === props.activeWorkspace?.id ? 'active' : ''}
                    onClick={() => {
                      props.onSelectWorkspace(w);
                      setSwitcherOpen(false);
                    }}
                  >
                    <span className="ws-avatar sm">{initials(w.name)}</span>
                    <span>{w.name}</span>
                    {w.id === props.activeWorkspace?.id && <Check size={14} />}
                  </button>
                ))}
                <button className="switch-create" onClick={() => { setCreating(true); setSwitcherOpen(false); }}>
                  <Plus size={14} /> New workspace
                </button>
              </div>
            )}
          </div>

          {creating && (
            <form className="compact-form" onSubmit={createWorkspace}>
              <input autoFocus placeholder="Workspace name" value={wsName} onChange={(e) => setWsName(e.target.value)} />
              <input placeholder="Description (optional)" value={wsDesc} onChange={(e) => setWsDesc(e.target.value)} />
              <div className="compact-actions">
                <button type="button" className="ghost" onClick={() => setCreating(false)}>Cancel</button>
                <button type="submit" disabled={busy}>Create</button>
              </div>
            </form>
          )}
        </div>

        <div className="sidebar-section">
          <button className={`nav-item ${props.view === 'dashboard' ? 'active' : ''}`} onClick={props.onOpenDashboard}>
            <LayoutDashboard size={16} /> Dashboard
          </button>
        </div>

        <div className="sidebar-section grow">
          <div className="sidebar-title">Projects</div>
          <div className="nav-list">
            {props.projects.length === 0 && <p className="empty-text sm">No projects yet.</p>}
            {props.projects.map((p) => (
              <button
                key={p.id}
                className={`nav-item ${props.activeProject?.id === p.id && props.view === 'canvas' ? 'active' : ''}`}
                onClick={() => props.onOpenProject(p)}
              >
                <Box size={16} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="user-strip">
          <span className="user-avatar">{initials(props.user?.displayName)}</span>
          <div className="user-meta">
            <strong className="truncate">{props.user?.displayName ?? 'User'}</strong>
            <span className="truncate">{props.user?.email}</span>
          </div>
          <button className="icon-button" onClick={props.onToggleTheme} title="Toggle theme">
            {props.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="icon-button" onClick={props.onLogout} title="Log out"><LogOut size={16} /></button>
        </div>
      </aside>

      <section className="main-surface">{props.children}</section>
    </main>
  );
}

function initials(name?: string | null): string {
  if (!name) return '·';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

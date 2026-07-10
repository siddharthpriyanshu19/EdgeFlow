import { useCallback, useEffect, useState } from 'react';
import { Grid3X3 } from 'lucide-react';
import {
  api, type Project, type ProjectVisibility, type User, type Workspace,
} from './lib/api';
import { AuthScreen, ResetPasswordScreen } from './components/AuthScreen';
import { Shell } from './components/Shell';
import { Dashboard } from './components/Dashboard';
import { CanvasWorkspace } from './components/CanvasWorkspace';

type View = 'loading' | 'auth' | 'reset' | 'dashboard' | 'canvas';
type Theme = 'light' | 'dark';

export function App() {
  const [view, setView] = useState<View>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [resetToken, setResetToken] = useState('');
  const [pendingInvite, setPendingInvite] = useState('');
  const [authError, setAuthError] = useState('');
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('edgeflow_theme') as Theme) ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );

  // Apply theme to document root.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('edgeflow_theme', theme);
  }, [theme]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((cur) => (cur === message ? '' : cur)), 4000);
  }, []);

  const loadWorkspaceData = useCallback(async (preferWorkspaceId?: string) => {
    const list = await api.listWorkspaces();
    setWorkspaces(list);
    const selected = list.find((w) => w.id === preferWorkspaceId) ?? list[0] ?? null;
    setActiveWorkspace(selected);
    if (selected) {
      const projectList = await api.listProjects(selected.id);
      setProjects(projectList);
    } else {
      setProjects([]);
    }
    return selected;
  }, []);

  // Accept a workspace invitation, then land on the joined workspace.
  const acceptInvite = useCallback(
    async (token: string) => {
      try {
        const { workspaceId } = await api.acceptInvitation(token);
        await loadWorkspaceData(workspaceId);
        showToast('Invitation accepted.');
      } catch (err) {
        await loadWorkspaceData();
        showToast(err instanceof Error ? err.message : 'Could not accept invitation.');
      } finally {
        setPendingInvite('');
      }
    },
    [loadWorkspaceData, showToast],
  );

  // ── Bootstrap: handle URL tokens, then resume session ────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cleanUrl = () => window.history.replaceState({}, '', window.location.pathname);

    async function bootstrap() {
      // Password reset (Requirement 4)
      const reset = params.get('reset');
      if (reset) {
        setResetToken(reset);
        setView('reset');
        cleanUrl();
        return;
      }

      const inviteToken = params.get('invite');
      if (inviteToken) {
        setPendingInvite(inviteToken);
        cleanUrl();
      }

      // Resume session
      try {
        const profile = await api.me();
        setUser(profile);
        if (inviteToken) {
          await acceptInvite(inviteToken);
        } else {
          await loadWorkspaceData();
        }
        setView('dashboard');
      } catch {
        // Not signed in yet — keep the invite pending. It is applied as soon
        // as the user signs in or creates an account (see onAuthenticated).
        setView('auth');
      }
    }

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAuthenticated = useCallback(
    async (profile: User) => {
      setUser(profile);
      if (pendingInvite) {
        await acceptInvite(pendingInvite);
      } else {
        await loadWorkspaceData();
      }
      setView('dashboard');
    },
    [pendingInvite, acceptInvite, loadWorkspaceData],
  );

  const selectWorkspace = useCallback(async (workspace: Workspace) => {
    setActiveWorkspace(workspace);
    setActiveProject(null);
    setView('dashboard');
    const projectList = await api.listProjects(workspace.id);
    setProjects(projectList);
  }, []);

  const createWorkspace = useCallback(async (input: { name: string; description?: string }) => {
    const workspace = await api.createWorkspace(input);
    setWorkspaces((cur) => [workspace, ...cur]);
    setActiveWorkspace(workspace);
    setProjects([]);
    showToast(`Workspace “${workspace.name}” created`);
  }, [showToast]);

  const createProject = useCallback(
    async (input: { name: string; description?: string; visibility: ProjectVisibility }) => {
      if (!activeWorkspace) throw new Error('Select a workspace first');
      const project = await api.createProject(activeWorkspace.id, input);
      setProjects((cur) => [project, ...cur]);
      setActiveProject(project);
      setView('canvas');
      return project;
    },
    [activeWorkspace],
  );

  const openProject = useCallback((project: Project) => {
    setActiveProject(project);
    setView('canvas');
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setWorkspaces([]);
    setProjects([]);
    setActiveWorkspace(null);
    setActiveProject(null);
    setView('auth');
  }, []);

  if (view === 'loading') return <Splash />;

  if (view === 'reset') {
    return (
      <ResetPasswordScreen
        token={resetToken}
        onDone={(msg) => {
          setAuthError('');
          showToast(msg);
          setView('auth');
        }}
      />
    );
  }

  if (view === 'auth') {
    return (
      <>
        <AuthScreen initialError={authError} onAuthenticated={onAuthenticated} />
        <Toast message={toast} />
      </>
    );
  }

  return (
    <>
      <Shell
        user={user}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        projects={projects}
        activeProject={activeProject}
        view={view === 'canvas' ? 'canvas' : 'dashboard'}
        theme={theme}
        onSelectWorkspace={selectWorkspace}
        onCreateWorkspace={createWorkspace}
        onOpenProject={openProject}
        onOpenDashboard={() => setView('dashboard')}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onLogout={logout}
      >
        {view === 'canvas' ? (
          <CanvasWorkspace workspace={activeWorkspace} project={activeProject} onToast={showToast} />
        ) : (
          <Dashboard
            user={user}
            workspace={activeWorkspace}
            projects={projects}
            onCreateProject={createProject}
            onOpenProject={openProject}
            onToast={showToast}
          />
        )}
      </Shell>
      <Toast message={toast} />
    </>
  );
}

function Splash() {
  return (
    <main className="splash">
      <div className="brand-mark lg"><Grid3X3 size={26} /></div>
      <p>Loading EdgeFlow…</p>
    </main>
  );
}

function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div className="toast" role="status">{message}</div>;
}

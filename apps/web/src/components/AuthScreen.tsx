import { useState } from 'react';
import { ArrowLeft, Grid3X3, Loader2, Sparkles } from 'lucide-react';
import { api, type User } from '../lib/api';

type Mode = 'login' | 'register' | 'forgot';

export function AuthScreen({
  initialError,
  onAuthenticated,
}: {
  initialError?: string;
  onAuthenticated: (user: User) => void;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [notice, setNotice] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const res = await api.login({ email, password, rememberMe });
        onAuthenticated(res.user);
      } else if (mode === 'register') {
        await api.register({ email, password, displayName });
        const res = await api.login({ email, password, rememberMe });
        onAuthenticated(res.user);
      } else {
        await api.forgotPassword(email);
        setNotice('If that email is registered, a reset link is on its way.');
        setMode('login');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="auth-nav">
          <div className="brand">
            <span className="brand-mark"><Grid3X3 size={18} /></span>
            EdgeFlow
          </div>
          <span className="pill"><Sparkles size={13} /> Realtime architecture canvas</span>
        </div>
        <div className="hero-copy">
          <h1>Design distributed systems together, in real time.</h1>
          <p>Map services, databases, queues and cloud resources on one infinite canvas — with live cursors, presence and event-sourced history built in.</p>
        </div>
        <div className="preview-board">
          <div className="preview-node blue">API Gateway</div>
          <div className="preview-line" />
          <div className="preview-node violet">Sync Engine</div>
          <div className="preview-line second" />
          <div className="preview-node green">Turso Cloud</div>
        </div>
        <ul className="hero-points">
          <li>Live multiplayer collaboration</li>
          <li>120+ system components</li>
          <li>Versioned, replayable event log</li>
        </ul>
      </section>

      <section className="auth-panel">
        {mode !== 'forgot' ? (
          <div className="segmented">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Create account</button>
          </div>
        ) : (
          <button className="link-back" onClick={() => setMode('login')}><ArrowLeft size={15} /> Back to sign in</button>
        )}

        <div className="auth-head">
          <h2>{mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset your password'}</h2>
          <p>{mode === 'forgot' ? 'Enter your email and we’ll send a reset link.' : 'Continue to your workspaces.'}</p>
        </div>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label className="field">
              <span>Display name</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={2} required placeholder="Ada Lovelace" />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" />
          </label>
          {mode !== 'forgot' && (
            <label className="field">
              <span>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required placeholder="At least 8 characters" />
            </label>
          )}
          {mode === 'login' && (
            <div className="auth-row">
              <label className="check-row">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                Keep me signed in
              </label>
              <button type="button" className="link" onClick={() => setMode('forgot')}>Forgot password?</button>
            </div>
          )}

          {error && <p className="form-error">{error}</p>}
          {notice && <p className="form-notice">{notice}</p>}

          <button className="primary-button" type="submit" disabled={busy}>
            {busy && <Loader2 size={16} className="spin" />}
            {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
          </button>
        </form>
      </section>
    </main>
  );
}

export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: (msg: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword({ token, password });
      onDone('Password updated. Please sign in with your new password.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page centered">
      <section className="auth-panel solo">
        <div className="brand">
          <span className="brand-mark"><Grid3X3 size={18} /></span>
          EdgeFlow
        </div>
        <div className="auth-head">
          <h2>Choose a new password</h2>
          <p>Your reset link is valid for one hour.</p>
        </div>
        <form onSubmit={submit}>
          <label className="field">
            <span>New password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </label>
          <label className="field">
            <span>Confirm password</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy && <Loader2 size={16} className="spin" />} Update password
          </button>
        </form>
      </section>
    </main>
  );
}

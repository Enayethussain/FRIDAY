import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { PageShell } from './layout';
import { globalAuthManager } from '../services/AuthManager';

/**
 * Web auth reuses the EXISTING FRIDAY authentication (local security
 * passcode via AuthManager + Firebase anonymous identity from main boot).
 * There is no username/password backend — so this screen honestly sets or
 * verifies the same security code the FRIDAY app itself uses. No passwords
 * are stored in localStorage (only hashes, managed by AuthManager) and
 * nothing secret is logged or transmitted.
 */

export function LoginPage() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const needsSetup = !globalAuthManager.hasPasscode();

  if (globalAuthManager.getProfile().isAuthenticated) return <Navigate to="/dashboard" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (code.trim().length < 4) {
      setError('Security code must be at least 4 characters.');
      return;
    }
    setBusy(true);
    try {
      const ok = await globalAuthManager.authenticateWithPasscode(
        code.trim(),
        name.trim() ? { commanderName: name.trim() } : undefined
      );
      if (ok) nav('/dashboard', { replace: true });
      else setError('Incorrect security code. Try again.');
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="Login" description="Log in to FRIDAY AI with your security code.">
      <div className="max-w-md mx-auto">
        <h1 className="font-display font-black text-3xl">Login</h1>
        <p className="mt-2 text-slate-400 text-sm">Same security code as your FRIDAY app. Verified on this device only.</p>
        {needsSetup ? (
          <p className="mt-4 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
            No security code exists on this browser yet. <Link to="/register" className="underline font-bold">Create one</Link>.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Commander name (optional)"
              autoComplete="nickname"
              className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-slate-900 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Security code"
              autoComplete="current-password"
              className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-slate-900 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={busy} className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-slate-950 disabled:opacity-50">
              {busy ? 'Verifying…' : 'Login to FRIDAY'}
            </button>
          </form>
        )}
      </div>
    </PageShell>
  );
}

export function RegisterPage() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (globalAuthManager.hasPasscode()) return <Navigate to="/login" replace />;
  if (globalAuthManager.getProfile().isAuthenticated) return <Navigate to="/dashboard" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (code.trim().length < 4) {
      setError('Security code must be at least 4 characters.');
      return;
    }
    if (code.trim() !== confirm.trim()) {
      setError('Codes do not match.');
      return;
    }
    setBusy(true);
    try {
      const ok = await globalAuthManager.authenticateWithPasscode(
        code.trim(),
        name.trim() ? { commanderName: name.trim() } : undefined
      );
      if (ok) nav('/dashboard', { replace: true });
      else setError('Registration failed. Please try again.');
    } catch {
      setError('Registration failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="Register" description="Create your FRIDAY AI security code.">
      <div className="max-w-md mx-auto">
        <h1 className="font-display font-black text-3xl">Create account</h1>
        <p className="mt-2 text-slate-400 text-sm">
          FRIDAY uses a local security code (hashed on this device — never stored in plaintext).
          Your backend plan and entitlements stay server-verified.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Commander name (optional)"
            autoComplete="nickname"
            className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-slate-900 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="New security code (min 4 chars)"
            autoComplete="new-password"
            className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-slate-900 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm security code"
            autoComplete="new-password"
            className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-slate-900 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button type="submit" disabled={busy} className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-slate-950 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create & Open FRIDAY'}
          </button>
        </form>
        <p className="mt-3 text-sm text-slate-400">Already have a code? <Link to="/login" className="text-amber-300 underline">Login</Link></p>
      </div>
    </PageShell>
  );
}

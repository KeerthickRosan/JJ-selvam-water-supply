import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Droplets, Eye, EyeOff, Lock, User } from 'lucide-react';
import { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username || !password) return setError('Enter your username and password.');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.response?.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-950 via-brand-800 to-sky-600 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur">
            <Droplets className="h-9 w-9 text-sky-200" />
          </div>
          <h1 className="text-2xl font-bold">JJ Selvam Water Supply</h1>
          <p className="text-sm text-sky-100/80">Business Management System</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6 shadow-2xl">
          <h2 className="text-lg font-bold text-slate-900">Sign in</h2>
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div>
            <label className="label">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className="input pl-9" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
            </div>
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className="input px-9" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button type="button" className="absolute right-3 top-2.5 text-slate-400" onClick={() => setShow(!show)}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </div>
          <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { DatabaseBackup, KeyRound, RefreshCcw, Save, Upload } from 'lucide-react';
import api, { download, errorMessage, fieldErrors } from '../api/client';
import { Field, Loading, PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';

function Card({ title, icon: Icon, children, desc }) {
  return (
    <div className="card card-pad">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></div>
        <div><h3 className="font-bold text-slate-900">{title}</h3>{desc && <p className="text-xs text-slate-500">{desc}</p>}</div>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { toast, confirm } = useUI();
  const { user, setToken } = useAuth();
  const [s, setS] = useState(null);
  const [errors, setErrors] = useState({});
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwErr, setPwErr] = useState({});
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);
  const isAdmin = user?.is_staff;

  useEffect(() => { api.get('/settings/').then((r) => setS(r.data)).catch((e) => toast(errorMessage(e), 'error')); }, [toast]);

  const saveSettings = async (e) => {
    e.preventDefault();
    setBusy('settings');
    try {
      const r = await api.patch('/settings/', s);
      setS(r.data);
      setErrors({});
      toast('Settings saved');
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), 'error');
    } finally { setBusy(''); }
  };

  const changePw = async (e) => {
    e.preventDefault();
    if (pw.new_password !== pw.confirm) return setPwErr({ confirm: 'Passwords do not match' });
    setBusy('pw');
    try {
      const r = await api.post('/auth/change-password/', { current_password: pw.current_password, new_password: pw.new_password });
      setToken(r.data.token);
      setPw({ current_password: '', new_password: '', confirm: '' });
      setPwErr({});
      toast('Password changed');
    } catch (err) {
      setPwErr(fieldErrors(err));
      toast(errorMessage(err), 'error');
    } finally { setBusy(''); }
  };

  const backup = async () => {
    setBusy('backup');
    try { await download('/backup/', {}, 'jj-selvam-backup.json'); toast('Backup downloaded. Keep it somewhere safe.'); } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(''); }
  };

  const restore = async (file) => {
    if (!file) return;
    const ok = await confirm({ title: 'Restore from backup?', danger: true, confirmText: 'Replace all data',
      message: `All current customers, drivers, deliveries and payments will be REPLACED with the contents of “${file.name}”. Download a fresh backup first if you are unsure. Login users are not changed.` });
    fileRef.current.value = '';
    if (!ok) return;
    setBusy('restore');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/restore/', fd);
      toast(`${r.data.detail} ${Object.entries(r.data.counts).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(''); }
  };

  const recalc = async () => {
    setBusy('recalc');
    try { const r = await api.post('/recalculate/'); toast(r.data.detail); } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(''); }
  };

  if (!s) return <Loading />;
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <PageHeader title="Settings" subtitle="Business details, password and data backup" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Business details" icon={Save}>
          <form onSubmit={saveSettings} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Business name" error={errors.business_name} className="sm:col-span-2"><input className="input" value={s.business_name} onChange={(e) => set('business_name', e.target.value)} disabled={!isAdmin} /></Field>
            <Field label="Phone" error={errors.phone}><input className="input" value={s.phone} onChange={(e) => set('phone', e.target.value)} disabled={!isAdmin} /></Field>
            <Field label="Email" error={errors.email}><input className="input" value={s.email} onChange={(e) => set('email', e.target.value)} disabled={!isAdmin} /></Field>
            <Field label="Address" error={errors.address} className="sm:col-span-2"><textarea className="input" rows={2} value={s.address} onChange={(e) => set('address', e.target.value)} disabled={!isAdmin} /></Field>
            {isAdmin && <div className="sm:col-span-2"><button className="btn-primary" disabled={busy === 'settings'}>{busy === 'settings' ? 'Saving…' : 'Save settings'}</button></div>}
          </form>
        </Card>
        <Card title="Change password" icon={KeyRound} desc={`Signed in as ${user?.username}`}>
          <form onSubmit={changePw} className="space-y-4">
            <Field label="Current password" error={pwErr.current_password}><input type="password" className="input" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} autoComplete="current-password" /></Field>
            <Field label="New password" error={pwErr.new_password} hint="At least 8 characters, not only numbers"><input type="password" className="input" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} autoComplete="new-password" /></Field>
            <Field label="Confirm new password" error={pwErr.confirm}><input type="password" className="input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
            <button className="btn-primary" disabled={busy === 'pw'}>{busy === 'pw' ? 'Saving…' : 'Change password'}</button>
          </form>
        </Card>
        {isAdmin && (
          <Card title="Backup & restore" icon={DatabaseBackup} desc="Download a full copy of all business records. Do this regularly (e.g. every week) and keep the file on a pen drive or Google Drive.">
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={backup} disabled={!!busy}><DatabaseBackup className="h-4 w-4" /> {busy === 'backup' ? 'Preparing…' : 'Download backup'}</button>
              <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload className="h-4 w-4" /> {busy === 'restore' ? 'Restoring…' : 'Restore from file'}</button>
              <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
            </div>
            <p className="mt-3 text-xs text-slate-500">Restore replaces all current data in one safe database transaction — if anything fails, nothing is changed.</p>
          </Card>
        )}
        {isAdmin && (
          <Card title="Maintenance" icon={RefreshCcw} desc="Rebuild every customer's balance and payment status from their deliveries and payments.">
            <button className="btn-secondary" onClick={recalc} disabled={!!busy}><RefreshCcw className="h-4 w-4" /> {busy === 'recalc' ? 'Working…' : 'Recalculate all balances'}</button>
            <p className="mt-3 text-xs text-slate-500">Extra login users can be added at <code className="rounded bg-slate-100 px-1">/admin</code> (Django admin) → Users.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

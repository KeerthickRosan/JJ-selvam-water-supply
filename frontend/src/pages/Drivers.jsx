import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardList, Pencil, Phone, Plus, Trash2, UserCheck } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../api/client';
import Modal from '../components/Modal';
import { Empty, Field, Loading, PageHeader } from '../components/ui';
import { useUI } from '../context/UIContext';
import { litres, money, presetRange, todayISO } from '../utils/format';
import { useFetch } from '../utils/hooks';

const blank = { name: '', phone: '', weekly_salary: '0', address: '', notes: '', is_active: true };

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weekRange(value) {
  const day = new Date(`${value}T00:00:00`).getDay();
  const start = addDays(value, -((day + 6) % 7));
  return [start, addDays(start, 6)];
}

function DriverModal({ open, driver, onClose, onSaved }) {
  const { toast } = useUI();
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setErrors({}); setF(driver ? { ...blank, ...driver } : blank); } }, [open, driver]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const body = { name: f.name, phone: f.phone, weekly_salary: f.weekly_salary, address: f.address, notes: f.notes, is_active: f.is_active };
      const r = driver ? await api.put(`/drivers/${driver.id}/`, body) : await api.post('/drivers/', body);
      toast(`Driver ${r.data.code} ${driver ? 'updated' : 'added'}`);
      onSaved();
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={driver ? `Edit driver ${driver.code}` : 'Add driver'} subtitle={driver ? '' : 'Driver ID (DRV001…) is generated automatically.'}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save driver'}</button></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Driver name *" error={errors.name}><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Contact number *" error={errors.phone}><input className="input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Weekly salary (₹) *" error={errors.weekly_salary}><input type="number" min="0" step="0.01" className="input" value={f.weekly_salary} onChange={(e) => set('weekly_salary', e.target.value)} /></Field>
        <Field label="Address" error={errors.address}><textarea className="input" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Active (can be selected for deliveries)</label>
      </form>
    </Modal>
  );
}

function DriverLeaveModal({ open, driver, onClose }) {
  const { toast, confirm } = useUI();
  const currentDate = todayISO();
  const currentMonth = currentDate.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [weekDate, setWeekDate] = useState(currentDate);
  const [date, setDate] = useState(currentDate);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const monthStart = `${month}-01`;
  const lastDay = month ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() : 0;
  const monthEnd = month ? `${month}-${String(lastDay).padStart(2, '0')}` : '';
  const [weekStart, weekEnd] = weekRange(weekDate);
  const queryStart = weekStart < monthStart ? weekStart : monthStart;
  const queryEnd = weekEnd > monthEnd ? weekEnd : monthEnd;
  const { data, loading, error, reload } = useFetch('/driver-leaves/', {
    driver: driver?.id, date_from: queryStart, date_to: queryEnd, page_size: 2000,
  }, { enabled: open && !!driver && !!month });
  const leaveDays = (data?.results || []).filter((leave) => leave.date >= monthStart && leave.date <= monthEnd);
  const weekLeaveDays = (data?.results || []).filter((leave) => leave.date >= weekStart && leave.date <= weekEnd);
  const weeklySalary = Number(driver?.weekly_salary || 0);
  const basePay = Math.round(weeklySalary * 4 * 100) / 100;
  const leaveDeduction = Math.round((weeklySalary / 7) * leaveDays.length * 100) / 100;
  const netPay = Math.max(0, Math.round((basePay - leaveDeduction) * 100) / 100);
  const weeklyLeaveDeduction = Math.round((weeklySalary / 7) * weekLeaveDays.length * 100) / 100;
  const weeklyNetPay = Math.max(0, Math.round((weeklySalary - weeklyLeaveDeduction) * 100) / 100);

  useEffect(() => {
    if (open) {
      const now = todayISO();
      setMonth(now.slice(0, 7));
      setWeekDate(now);
      setDate(now);
      setNotes('');
    }
  }, [open, driver]);

  const addLeave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/driver-leaves/', { driver: driver.id, date, notes });
      setNotes('');
      toast('Leave day recorded');
      await reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeLeave = async (leave) => {
    const ok = await confirm({ title: 'Remove leave day?', danger: true, confirmText: 'Remove', message: `Remove the leave recorded for ${leave.date}?` });
    if (!ok) return;
    try {
      await api.delete(`/driver-leaves/${leave.id}/`);
      toast('Leave day removed');
      await reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={`${driver?.name || 'Driver'} · Leave & salary`}
      subtitle="Monthly base pay is 4 × weekly salary. Leave deductions are based on weekly salary ÷ 7 per day.">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Weekly base</p><p className="font-bold">{money(weeklySalary)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Monthly base</p><p className="font-bold">{money(basePay)}</p></div>
          <div className="rounded-xl bg-rose-50 p-3"><p className="text-xs text-rose-600">Leave deduction · {leaveDays.length} days</p><p className="font-bold text-rose-700">{money(leaveDeduction)}</p></div>
          <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Pay after leave</p><p className="font-bold text-emerald-800">{money(netPay)}</p></div>
          <div className="rounded-xl bg-rose-50 p-3"><p className="text-xs text-rose-600">Weekly leave deduction · {weekLeaveDays.length} days</p><p className="font-bold text-rose-700">{money(weeklyLeaveDeduction)}</p></div>
          <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Weekly pay after leave</p><p className="font-bold text-emerald-800">{money(weeklyNetPay)}</p></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Month">
            <input id="leave-month" type="month" className="input" value={month} onChange={(e) => { setMonth(e.target.value); setDate(`${e.target.value}-01`); setWeekDate(`${e.target.value}-01`); }} />
          </Field>
          <Field label={`Week containing date (${weekStart} to ${weekEnd})`}>
            <input type="date" className="input" value={weekDate} onChange={(e) => setWeekDate(e.target.value)} />
          </Field>
        </div>
        <form onSubmit={addLeave} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <Field label="Leave date" error={date && (date < monthStart || date > monthEnd) ? 'Choose a date in the selected month' : ''}>
            <input type="date" className="input" value={date} min={monthStart} max={monthEnd} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Notes (optional)"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason or details" /></Field>
          <button className="btn-primary" disabled={saving || !date || date < monthStart || date > monthEnd}>{saving ? 'Saving…' : 'Mark leave'}</button>
        </form>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {loading ? <Loading /> : leaveDays.length === 0 ? <Empty text="No leave days recorded for this month" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Notes</th><th className="text-right">Deduction</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {leaveDays.map((leave) => (
                  <tr key={leave.id}>
                    <td>{leave.date}</td><td>{leave.notes || '—'}</td><td className="text-right text-rose-700">{money(weeklySalary / 7)}</td>
                    <td className="text-right"><button className="btn-ghost btn-sm text-rose-600" onClick={() => removeLeave(leave)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Drivers() {
  const { toast, confirm } = useUI();
  const [modal, setModal] = useState({ open: false, driver: null });
  const [leaveDriver, setLeaveDriver] = useState(null);
  const { data, loading, reload } = useFetch('/drivers/', { page_size: 200 });
  const today = presetRange('today');
  const stats = useFetch('/reports/drivers/', { date_from: today.from, date_to: today.to });
  const statFor = (id) => stats.data?.drivers?.find((d) => d.driver_id === id);

  const remove = async (d) => {
    const ok = await confirm({ title: `Delete ${d.name}?`, danger: true, confirmText: 'Delete driver', message: 'Drivers with delivery history cannot be deleted — mark them inactive instead so old records stay correct.' });
    if (!ok) return;
    try {
      await api.delete(`/drivers/${d.id}/`);
      toast(`${d.name} deleted`);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const rows = data?.results || [];
  return (
    <div>
      <PageHeader title="Drivers" subtitle="Add drivers and track their deliveries and collections"
        actions={<><Link to="/driver-reports" className="btn-secondary"><ClipboardList className="h-4 w-4" /> Driver reports</Link><button className="btn-primary" onClick={() => setModal({ open: true, driver: null })}><Plus className="h-4 w-4" /> Add driver</button></>} />
      {loading && !data ? <Loading /> : rows.length === 0 ? <div className="card"><Empty text="No drivers yet. Add your drivers to start recording deliveries." /></div> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((d) => {
            const s = statFor(d.id);
            return (
              <div key={d.id} className={`card card-pad ${d.is_active ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><UserCheck className="h-5 w-5" /></div>
                    <div>
                      <p className="font-bold text-slate-900">{d.name}</p>
                      <p className="text-xs text-slate-500"><span className="font-mono">{d.code}</span> · {d.is_active ? 'Active' : 'Inactive'}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <button className="icon-btn" onClick={() => setModal({ open: true, driver: d })}><Pencil className="h-4 w-4" /></button>
                    <button className="icon-btn hover:text-rose-600" onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <a href={`tel:${d.phone}`} className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand-700"><Phone className="h-3.5 w-3.5" /> {d.phone}</a>
                <p className="mt-2 text-sm"><span className="text-slate-500">Weekly salary:</span> <b>{money(d.weekly_salary)}</b></p>
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                  <div><p className="text-[11px] uppercase text-slate-500">Today trips</p><p className="font-bold">{s?.deliveries ?? 0}</p></div>
                  <div><p className="text-[11px] uppercase text-slate-500">Today litres</p><p className="font-bold">{litres(s?.litres)}</p></div>
                  <div><p className="text-[11px] uppercase text-slate-500">Collected</p><p className="font-bold text-emerald-700">{money(s?.collected)}</p></div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-slate-400">{d.delivery_count} deliveries in total</p>
                  <button className="btn-secondary btn-sm" onClick={() => setLeaveDriver(d)}><CalendarDays className="h-4 w-4" /> Leave days</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <DriverModal open={modal.open} driver={modal.driver} onClose={() => setModal({ open: false, driver: null })} onSaved={() => { reload(); stats.reload(); }} />
      <DriverLeaveModal open={!!leaveDriver} driver={leaveDriver} onClose={() => setLeaveDriver(null)} />
    </div>
  );
}

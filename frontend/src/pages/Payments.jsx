import { useState } from 'react';
import { CheckCheck, IndianRupee } from 'lucide-react';
import api, { errorMessage } from '../api/client';
import PaymentFormModal from '../components/PaymentFormModal';
import PaymentTable from '../components/PaymentTable';
import PeriodFilter, { initialPeriod } from '../components/PeriodFilter';
import { Empty, ExportButtons, Loading, PageHeader, Pagination, SearchInput, Select, StatCard } from '../components/ui';
import { useUI } from '../context/UIContext';
import { PAYMENT_METHODS } from '../utils/constants';
import { cleanParams, money } from '../utils/format';
import { useDebounce, useFetch, useLookups } from '../utils/hooks';

function AllPayments({ drivers, onEdit, reloadKey }) {
  const [period, setPeriod] = useState(initialPeriod('month'));
  const [f, setF] = useState({ search: '', received_by: '', payment_method: '', driver: '' });
  const [page, setPage] = useState(1);
  const search = useDebounce(f.search);
  const params = cleanParams({ ...f, search, date_from: period.from, date_to: period.to });
  const { data, loading, reload } = useFetch('/payments/', { ...params, page, _k: reloadKey });
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setPage(1); };
  const t = data?.totals;
  return (
    <>
      {t && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total received" value={money(t.total)} tone="green" sub={`${t.count} payments`} />
          <StatCard label="Paid directly to owner" value={money(t.owner)} tone="brand" />
          <StatCard label="Collected by drivers" value={money(t.driver)} tone="violet" />
          <StatCard label="Driver cash pending handover" value={money(t.pending_handover)} tone="amber" />
        </div>
      )}
      <div className="card">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <PeriodFilter value={period} onChange={(v) => { setPeriod(v); setPage(1); }} />
            <div className="flex gap-2"><ExportButtons url="/payments/export/" params={params} name="payments" /></div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <SearchInput value={f.search} onChange={(v) => set('search', v)} placeholder="Search customer, ID, reference" />
            <Select placeholder="Owner & drivers" options={[{ value: 'OWNER', label: 'Paid to owner' }, { value: 'DRIVER', label: 'Collected by drivers' }]} value={f.received_by} onChange={(e) => set('received_by', e.target.value)} />
            <Select placeholder="All methods" options={PAYMENT_METHODS} value={f.payment_method} onChange={(e) => set('payment_method', e.target.value)} />
            <Select placeholder="All drivers" options={drivers.map((d) => ({ value: d.id, label: d.name }))} value={f.driver} onChange={(e) => set('driver', e.target.value)} />
          </div>
        </div>
        {loading && !data ? <Loading /> : <PaymentTable rows={data?.results} totals={t} onEdit={onEdit} onChanged={reload} />}
        <Pagination page={data?.page} totalPages={data?.total_pages} count={data?.count} onChange={setPage} />
      </div>
    </>
  );
}

function DriverCollections({ drivers, onEdit, reloadKey }) {
  const { toast } = useUI();
  const [period, setPeriod] = useState(initialPeriod('today'));
  const [driver, setDriver] = useState('');
  const [selected, setSelected] = useState([]);
  const params = cleanParams({ date_from: period.from, date_to: period.to, driver });
  const { data, loading, reload } = useFetch('/reports/driver-collections/', { ...params, _k: reloadKey });

  const mark = async (undo = false) => {
    try {
      const r = await api.post('/payments/mark-handed-over/', { ids: selected, undo });
      toast(`${r.data.updated} collection(s) ${undo ? 'moved back to pending' : 'marked as handed over'}`);
      setSelected([]);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <div className="card mb-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <Select placeholder="All drivers" options={drivers.map((d) => ({ value: d.id, label: d.name }))} value={driver} onChange={(e) => setDriver(e.target.value)} />
          </div>
          <div className="flex gap-2"><ExportButtons url="/reports/driver-collections/export/" params={params} name="driver-collections" /></div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Money collected by drivers is recorded once as a customer payment. Mark it “handed over” when the driver gives the cash to the office — this reconciles driver cash without creating a second entry.</p>
      </div>
      {loading && !data ? <Loading /> : (
        <>
          <div className="card mb-4 overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold">Daily driver collection report</div>
            {data?.summary?.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Driver</th><th className="text-right">Collections</th><th className="text-right">Cash</th><th className="text-right">UPI</th><th className="text-right">Other</th><th className="text-right">Total collected</th><th className="text-right">Handed over</th><th className="text-right">Pending with driver</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.summary.map((s) => (
                      <tr key={s.driver_id}><td className="font-medium">{s.name} <span className="text-xs text-slate-400">{s.code}</span></td><td className="text-right">{s.count}</td><td className="text-right">{money(s.cash)}</td><td className="text-right">{money(s.upi)}</td><td className="text-right">{money(s.other)}</td><td className="text-right font-bold">{money(s.collected)}</td><td className="text-right text-emerald-700">{money(s.handed_over)}</td><td className={`text-right font-bold ${Number(s.pending) > 0 ? 'text-amber-600' : ''}`}>{money(s.pending)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty text="No driver collections in this period" />}
          </div>
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-bold">Collection entries</span>
              <div className="flex gap-2">
                <button className="btn-success btn-sm" disabled={!selected.length} onClick={() => mark(false)}><CheckCheck className="h-4 w-4" /> Mark handed over ({selected.length})</button>
              </div>
            </div>
            <PaymentTable rows={data?.collections} selectable selected={selected} onSelect={setSelected} onEdit={onEdit} onChanged={reload} />
          </div>
        </>
      )}
    </>
  );
}

export default function Payments() {
  const { drivers } = useLookups();
  const [tab, setTab] = useState('all');
  const [modal, setModal] = useState({ open: false, item: null });
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <div>
      <PageHeader title="Payments" subtitle="Record payments received later, track owner and driver collections"
        actions={<button className="btn-success" onClick={() => setModal({ open: true, item: null })}><IndianRupee className="h-4 w-4" /> Record payment</button>} />
      <div className="mb-4 inline-flex gap-1 rounded-xl bg-slate-100 p-1">
        {[['all', 'All payments'], ['drivers', 'Driver cash collection']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600'}`}>{l}</button>
        ))}
      </div>
      {tab === 'all'
        ? <AllPayments drivers={drivers} reloadKey={reloadKey} onEdit={(p) => setModal({ open: true, item: p })} />
        : <DriverCollections drivers={drivers} reloadKey={reloadKey} onEdit={(p) => setModal({ open: true, item: p })} />}
      <PaymentFormModal open={modal.open} payment={modal.item} onClose={() => setModal({ open: false, item: null })} onSaved={() => setReloadKey((k) => k + 1)} />
    </div>
  );
}

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Combobox from '../components/Combobox';
import { Empty, ExportButtons, Loading, PageHeader, StatCard, StatusBadge, WaterBadge } from '../components/ui';
import { cleanParams, fmtDate, litres, money } from '../utils/format';
import { useFetch, useLookups } from '../utils/hooks';

export default function Ledger() {
  const [sp, setSp] = useSearchParams();
  const customerId = sp.get('customer') || '';
  const { customers } = useLookups();
  const [range, setRange] = useState({ date_from: '', date_to: '' });
  const params = cleanParams(range);
  const { data, loading, error } = useFetch(customerId ? `/customers/${customerId}/ledger/` : null, params, { enabled: !!customerId });

  const options = customers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})`, sub: `Balance ${money(c.current_balance)}`, search: c.phone }));
  const c = data?.customer;

  return (
    <div>
      <PageHeader title="Customer Ledger" subtitle="Complete transaction history with running balance"
        actions={customerId && <ExportButtons url={`/customers/${customerId}/ledger/export/`} params={params} name="statement" />} />
      <div className="card mb-4 grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="label">Customer</label>
          <Combobox options={options} value={customerId} onChange={(v) => setSp(v ? { customer: v } : {})} placeholder="Select a customer to view ledger" />
        </div>
        <div><label className="label">From</label><input type="date" className="input" value={range.date_from} onChange={(e) => setRange((r) => ({ ...r, date_from: e.target.value }))} /></div>
        <div><label className="label">To</label>
          <div className="flex gap-1"><input type="date" className="input" value={range.date_to} onChange={(e) => setRange((r) => ({ ...r, date_to: e.target.value }))} />
            {(range.date_from || range.date_to) && <button className="btn-ghost btn-sm" onClick={() => setRange({ date_from: '', date_to: '' })}>All</button>}</div>
        </div>
      </div>
      {!customerId ? <div className="card"><Empty text="Choose a customer above to see their ledger" /></div> : loading && !data ? <Loading /> : error ? <p className="text-rose-600">{error}</p> : data && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Link to={`/customers/${c.id}`} className="text-lg font-bold text-slate-900 hover:text-brand-700">{c.name}</Link>
            <span className="chip bg-brand-50 font-mono text-brand-700">{c.code}</span>
            <span className="text-sm text-slate-500">{c.customer_type_label} · {c.phone}</span>
            <StatusBadge status={c.payment_status} />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label={range.date_from ? 'Balance brought forward' : 'Previous outstanding balance'} value={money(data.opening_balance)} tone="slate" />
            <StatCard label="Litres delivered" value={litres(data.total_litres)} tone="sky" />
            <StatCard label="Bill amount" value={money(data.total_bill)} tone="violet" />
            <StatCard label="Payment received" value={money(data.total_paid)} tone="green" />
            <StatCard label="Current outstanding balance" value={money(data.current_outstanding)} tone={Number(data.current_outstanding) > 0 ? 'rose' : 'green'} sub={range.date_to ? `Balance at ${fmtDate(range.date_to)}: ${money(data.closing_balance)}` : ''} />
          </div>
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Delivery / Payment ID</th><th>Details</th><th>Water type</th><th className="text-right">Litres</th><th className="text-right">Bill amount</th><th className="text-right">Payment received</th><th>Payment date</th><th className="text-right">Balance</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50"><td>{range.date_from ? fmtDate(range.date_from) : '—'}</td><td /><td className="font-semibold">{range.date_from ? 'Balance brought forward' : 'Previous outstanding balance'}</td><td /><td /><td /><td /><td /><td className="text-right font-bold">{money(data.opening_balance)}</td></tr>
                  {data.entries.map((e) => (
                    <tr key={`${e.type}-${e.id}`}>
                      <td>{fmtDate(e.date)}</td>
                      <td className={`font-mono text-xs font-semibold ${e.type === 'DELIVERY' ? 'text-brand-700' : 'text-emerald-700'}`}>{e.ref}</td>
                      <td className="max-w-xs whitespace-normal text-xs">{e.description}{e.status && <span className="ml-2"><StatusBadge status={e.status} /></span>}</td>
                      <td>{e.water_type ? <WaterBadge type={e.water_type} /> : ''}</td>
                      <td className="text-right">{e.litres ? litres(e.litres) : ''}</td>
                      <td className="text-right">{e.bill != null ? money(e.bill) : ''}</td>
                      <td className="text-right font-semibold text-emerald-700">{e.payment != null ? money(e.payment) : ''}</td>
                      <td>{e.payment_date ? fmtDate(e.payment_date) : ''}</td>
                      <td className={`text-right font-bold ${Number(e.balance) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(e.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={4}>Totals · {data.entries.length} transactions</td><td className="text-right">{litres(data.total_litres)}</td><td className="text-right">{money(data.total_bill)}</td><td className="text-right">{money(data.total_paid)}</td><td /><td className="text-right">{money(data.closing_balance)}</td></tr></tfoot>
              </table>
            </div>
            {data.entries.length === 0 && <Empty text="No transactions in this period" />}
          </div>
        </>
      )}
    </div>
  );
}

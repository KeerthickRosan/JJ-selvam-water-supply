import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IndianRupee, Phone } from 'lucide-react';
import PaymentFormModal from '../components/PaymentFormModal';
import { Empty, ExportButtons, Loading, PageHeader, Pagination, SearchInput, Select, StatusBadge } from '../components/ui';
import { CUSTOMER_TYPES, WATER_TYPES } from '../utils/constants';
import { cleanParams, fmtDate, litres, money } from '../utils/format';
import { useDebounce, useFetch, useLookups } from '../utils/hooks';

const FILTERS = [
  { key: 'ALL', label: 'All Customers', cls: 'border-slate-300 text-slate-700', active: 'bg-slate-800 text-white border-slate-800' },
  { key: 'UNPAID', label: 'Not Paid', cls: 'border-rose-200 text-rose-700', active: 'bg-rose-600 text-white border-rose-600' },
  { key: 'PARTIAL', label: 'Partially Paid', cls: 'border-amber-200 text-amber-700', active: 'bg-amber-500 text-white border-amber-500' },
  { key: 'PENDING', label: 'Balance Pending', cls: 'border-violet-200 text-violet-700', active: 'bg-violet-600 text-white border-violet-600' },
  { key: 'PAID', label: 'Fully Paid', cls: 'border-emerald-200 text-emerald-700', active: 'bg-emerald-600 text-white border-emerald-600' },
];

export default function CustomerBalances({ initialStatus = 'PENDING', title }) {
  const navigate = useNavigate();
  const { drivers } = useLookups();
  const [status, setStatus] = useState(initialStatus);
  const [f, setF] = useState({ search: '', customer_type: '', water_type: '', driver: '', date_from: '', date_to: '', ordering: '-current_balance' });
  const [page, setPage] = useState(1);
  const [pay, setPay] = useState({ open: false, customer: null });
  const search = useDebounce(f.search);
  const params = cleanParams({ ...f, search, status });
  const { data, loading, error, reload } = useFetch('/customers/balances/', { ...params, page });
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setPage(1); };
  const rows = data?.results || [];
  const active = FILTERS.find((x) => x.key === status);

  return (
    <div>
      <PageHeader title={title} subtitle="Find who has not paid and exactly how much each customer owes"
        actions={<ExportButtons url="/customers/balances/export/" params={params} name={`customers-${status.toLowerCase()}`} />} />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <button key={x.key} onClick={() => { setStatus(x.key); setPage(1); }} className={`filter-btn ${status === x.key ? x.active : `bg-white ${x.cls} hover:bg-slate-50`}`}>{x.label}</button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card card-pad border-l-4 border-l-rose-500 sm:col-span-1">
          <p className="text-xs font-semibold uppercase text-slate-500">Total outstanding · {active?.label}</p>
          <p className="mt-1 text-2xl font-bold text-rose-600">{money(data?.totals?.outstanding)}</p>
        </div>
        <div className="card card-pad"><p className="text-xs font-semibold uppercase text-slate-500">Customers in this list</p><p className="mt-1 text-2xl font-bold">{data?.totals?.count ?? '—'}</p></div>
        <div className="card card-pad"><p className="text-xs font-semibold uppercase text-slate-500">Billed / Paid</p><p className="mt-1 text-lg font-bold">{money(data?.totals?.billed)} <span className="text-sm font-normal text-slate-400">/</span> <span className="text-emerald-700">{money(data?.totals?.paid)}</span></p></div>
      </div>
      <div className="card">
        <div className="grid grid-cols-1 gap-2 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <SearchInput value={f.search} onChange={(v) => set('search', v)} placeholder="Customer name or ID" className="xl:col-span-2" />
          <Select placeholder="All types" options={CUSTOMER_TYPES} value={f.customer_type} onChange={(e) => set('customer_type', e.target.value)} />
          <Select placeholder="Any water type" options={WATER_TYPES} value={f.water_type} onChange={(e) => set('water_type', e.target.value)} />
          <Select placeholder="Any driver" options={drivers.map((d) => ({ value: d.id, label: d.name }))} value={f.driver} onChange={(e) => set('driver', e.target.value)} />
          <Select value={f.ordering} onChange={(e) => set('ordering', e.target.value)} options={[
            { value: '-current_balance', label: 'Highest balance first' }, { value: 'current_balance', label: 'Lowest balance first' },
            { value: 'name', label: 'Name A–Z' }, { value: 'code', label: 'Customer ID' }, { value: '-last_delivery_date', label: 'Latest delivery' },
            { value: 'last_payment_date', label: 'Oldest payment first' },
          ]} />
          <div className="flex items-center gap-1 xl:col-span-1">
            <input type="date" className="input px-2" title="Deliveries from" value={f.date_from} onChange={(e) => set('date_from', e.target.value)} />
          </div>
          <div className="flex items-center gap-1 sm:col-span-2 lg:col-span-1">
            <input type="date" className="input px-2" title="Deliveries to" value={f.date_to} onChange={(e) => set('date_to', e.target.value)} />
            {(f.date_from || f.date_to || f.water_type || f.driver) && <button className="btn-ghost btn-sm" onClick={() => setF((p) => ({ ...p, date_from: '', date_to: '', water_type: '', driver: '' }))}>Clear</button>}
          </div>
        </div>
        {data?.delivery_filtered && <p className="border-b border-slate-100 bg-brand-50/60 px-4 py-2 text-xs text-brand-800">Showing customers with deliveries matching the selected date / water type / driver. “Period litres/bill” shows those deliveries; balance is the customer’s full outstanding.</p>}
        {error && <p className="p-4 text-sm text-rose-600">{error}</p>}
        {loading && !data ? <Loading /> : rows.length === 0 ? <Empty text="No customers in this filter" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th>Customer ID</th><th>Customer</th><th>Contact</th><th>Type</th><th className="text-right">Total litres</th>
                {data.delivery_filtered && <th className="text-right">Period litres / bill</th>}
                <th className="text-right">Total bill</th><th className="text-right">Total paid</th><th className="text-right">Remaining balance</th>
                <th>Status</th><th>Last payment</th><th>Latest delivery</th><th />
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)}>
                    <td className="font-mono text-xs font-semibold text-brand-700">{c.code}</td>
                    <td className="font-medium text-slate-900">{c.name}</td>
                    <td onClick={(e) => e.stopPropagation()}>{c.phone ? <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-brand-700"><Phone className="h-3 w-3" />{c.phone}</a> : '—'}</td>
                    <td>{c.customer_type_label}</td>
                    <td className="text-right">{litres(c.total_litres)}</td>
                    {data.delivery_filtered && <td className="text-right text-xs">{litres(c.period_litres)}<div>{money(c.period_bill)}</div></td>}
                    <td className="text-right">{money(c.total_billed)}{Number(c.opening_balance) > 0 && <div className="text-[11px] text-slate-400">incl. prev. {money(c.opening_balance)}</div>}</td>
                    <td className="text-right text-emerald-700">{money(c.total_paid)}</td>
                    <td className={`text-right text-base font-bold ${Number(c.current_balance) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{Number(c.current_balance) < 0 ? `${money(-c.current_balance)} adv.` : money(c.current_balance)}</td>
                    <td><StatusBadge status={c.payment_status} /></td>
                    <td>{fmtDate(c.last_payment_date)}</td>
                    <td>{fmtDate(c.last_delivery_date)}</td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      {Number(c.current_balance) > 0 && <button className="btn-success btn-sm" onClick={() => setPay({ open: true, customer: c.id })}><IndianRupee className="h-3.5 w-3.5" /> Pay</button>}
                      <Link to={`/ledger?customer=${c.id}`} className="btn-ghost btn-sm">Ledger</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data?.page} totalPages={data?.total_pages} count={data?.count} onChange={setPage} />
      </div>
      <PaymentFormModal open={pay.open} presetCustomer={pay.customer} onClose={() => setPay({ open: false, customer: null })} onSaved={reload} />
    </div>
  );
}

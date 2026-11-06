import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookText, IndianRupee, MapPin, Pencil, Phone, Plus } from 'lucide-react';
import CustomerFormModal from '../components/CustomerFormModal';
import DeliveryFormModal from '../components/DeliveryFormModal';
import DeliveryTable from '../components/DeliveryTable';
import PaymentFormModal from '../components/PaymentFormModal';
import PaymentTable from '../components/PaymentTable';
import { Loading, Pagination, StatCard, StatusBadge, WaterBadge } from '../components/ui';
import { fmtDate, litres, money } from '../utils/format';
import { useFetch } from '../utils/hooks';

export default function CustomerProfile() {
  const { id } = useParams();
  const [tab, setTab] = useState('deliveries');
  const [page, setPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [delivery, setDelivery] = useState({ open: false, item: null });
  const [payment, setPayment] = useState({ open: false, item: null });
  const cust = useFetch(`/customers/${id}/`);
  const list = useFetch(tab === 'deliveries' ? '/deliveries/' : '/payments/', { customer: id, page });

  const refresh = () => { cust.reload(); list.reload(); };
  const c = cust.data;
  if (cust.error) return <p className="text-rose-600">{cust.error}</p>;
  if (!c) return <Loading />;

  return (
    <div>
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Customers</Link>
      <div className="card card-pad mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{c.name}</h1>
            <span className="chip bg-brand-50 font-mono text-brand-700">{c.code}</span>
            <StatusBadge status={c.payment_status} />
            {!c.is_active && <span className="chip bg-slate-200 text-slate-600">Inactive</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
            <span>{c.customer_type_label}</span>
            <WaterBadge type={c.water_type} />
            {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-brand-700"><Phone className="h-3.5 w-3.5" />{c.phone}</a>}
            {c.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{c.address}</span>}
            {c.regular_quantity && <span>Regular: {litres(c.regular_quantity)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</button>
          <Link to={`/ledger?customer=${c.id}`} className="btn-secondary"><BookText className="h-4 w-4" /> Ledger</Link>
          <button className="btn-success" onClick={() => setPayment({ open: true, item: null })}><IndianRupee className="h-4 w-4" /> Record payment</button>
          <button className="btn-primary" onClick={() => setDelivery({ open: true, item: null })} disabled={!c.is_active}><Plus className="h-4 w-4" /> New delivery</button>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Previous outstanding balance" value={money(c.opening_balance)} tone="slate" />
        <StatCard label="Total litres delivered" value={litres(c.total_litres)} tone="sky" />
        <StatCard label="Total billed" value={money(c.total_billed)} tone="violet" />
        <StatCard label="Total amount paid" value={money(c.total_paid)} tone="green" sub={c.last_payment_date ? `Last paid ${fmtDate(c.last_payment_date)}` : 'No payments yet'} />
        <StatCard label="Current outstanding" value={Number(c.current_balance) < 0 ? `${money(-c.current_balance)} adv.` : money(c.current_balance)} tone={Number(c.current_balance) > 0 ? 'rose' : 'green'} />
      </div>
      <div className="card">
        <div className="flex gap-1 border-b border-slate-100 p-2">
          {[['deliveries', 'Delivery history'], ['payments', 'Payment history']].map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); setPage(1); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>
          ))}
        </div>
        {list.loading && !list.data ? <Loading /> : tab === 'deliveries' ? (
          <DeliveryTable rows={list.data?.results} totals={list.data?.totals} onEdit={(d) => setDelivery({ open: true, item: d })} onChanged={refresh} />
        ) : (
          <PaymentTable rows={list.data?.results} onEdit={(p) => setPayment({ open: true, item: p })} onChanged={refresh} />
        )}
        <Pagination page={list.data?.page} totalPages={list.data?.total_pages} count={list.data?.count} onChange={setPage} />
      </div>
      <CustomerFormModal open={editOpen} customer={c} onClose={() => setEditOpen(false)} onSaved={refresh} />
      <DeliveryFormModal open={delivery.open} delivery={delivery.item} presetCustomer={c.id} onClose={() => setDelivery({ open: false, item: null })} onSaved={refresh} />
      <PaymentFormModal open={payment.open} payment={payment.item} presetCustomer={c.id} onClose={() => setPayment({ open: false, item: null })} onSaved={refresh} />
    </div>
  );
}

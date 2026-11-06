import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../api/client';
import CustomerFormModal from '../components/CustomerFormModal';
import { Empty, Loading, PageHeader, Pagination, SearchInput, Select, StatusBadge, WaterBadge } from '../components/ui';
import { useUI } from '../context/UIContext';
import { CUSTOMER_TYPES } from '../utils/constants';
import { cleanParams, fmtDate, litres, money } from '../utils/format';
import { useDebounce, useFetch } from '../utils/hooks';

export default function Customers() {
  const { toast, confirm } = useUI();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [active, setActive] = useState('true');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState({ open: false, customer: null });
  const q = useDebounce(search);
  const { data, loading, error, reload } = useFetch('/customers/', cleanParams({ search: q, customer_type: type, is_active: active, status, page }));

  const remove = async (c) => {
    const ok = await confirm({ title: `Delete ${c.name}?`, danger: true, confirmText: 'Delete customer', message: `Customer ${c.code} will be permanently deleted. Customers with deliveries or payments cannot be deleted — mark them inactive instead.` });
    if (!ok) return;
    try {
      await api.delete(`/customers/${c.id}/`);
      toast(`${c.name} deleted`);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const rows = data?.results || [];
  return (
    <div>
      <PageHeader title="Customers" subtitle="Hotels, houses, restaurants, shops and businesses you supply"
        actions={<button className="btn-primary" onClick={() => setModal({ open: true, customer: null })}><Plus className="h-4 w-4" /> Add customer</button>} />
      <div className="card">
        <div className="grid grid-cols-1 gap-2 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, Customer ID or phone" className="sm:col-span-2" />
          <Select placeholder="All customer types" options={CUSTOMER_TYPES} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} />
          <Select options={[{ value: 'true', label: 'Active customers' }, { value: 'false', label: 'Inactive customers' }]} placeholder="All" value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }} />
          <Select placeholder="All payment statuses" options={[
            { value: 'UNPAID', label: 'Unpaid' },
            { value: 'PARTIAL', label: 'Partially paid' },
            { value: 'PENDING', label: 'Balance pending' },
            { value: 'PAID', label: 'Fully paid' },
          ]} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} />
        </div>
        {error && <p className="p-4 text-sm text-rose-600">{error}</p>}
        {loading && !data ? <Loading /> : rows.length === 0 ? <Empty text="No customers found" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Customer ID</th><th>Name</th><th>Type</th><th>Contact</th><th>Water</th><th className="text-right">Regular qty</th><th className="text-right">Litres</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th><th>Last delivery</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)}>
                    <td className="font-mono text-xs font-semibold text-brand-700">{c.code}</td>
                    <td className="font-medium text-slate-900">{c.name}{!c.is_active && <span className="chip ml-2 bg-slate-200 text-slate-600">Inactive</span>}</td>
                    <td>{c.customer_type_label}</td>
                    <td>{c.phone || '—'}</td>
                    <td><WaterBadge type={c.water_type} /></td>
                    <td className="text-right">{c.regular_quantity ? litres(c.regular_quantity) : '—'}</td>
                    <td className="text-right">{litres(c.total_litres)}</td>
                    <td className="text-right text-emerald-700">{money(c.total_paid)}</td>
                    <td className={`text-right font-semibold ${Number(c.current_balance) > 0 ? 'text-rose-600' : 'text-slate-500'}`}>{money(c.current_balance)}</td>
                    <td><StatusBadge status={c.payment_status} /></td>
                    <td>{fmtDate(c.last_delivery_date)}</td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/customers/${c.id}`} className="icon-btn" title="View profile"><Eye className="h-4 w-4" /></Link>
                      <button className="icon-btn" title="Edit" onClick={() => setModal({ open: true, customer: c })}><Pencil className="h-4 w-4" /></button>
                      <button className="icon-btn hover:text-rose-600" title="Delete" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data?.page} totalPages={data?.total_pages} count={data?.count} onChange={setPage} />
      </div>
      <CustomerFormModal open={modal.open} customer={modal.customer} onClose={() => setModal({ open: false, customer: null })} onSaved={reload} />
    </div>
  );
}

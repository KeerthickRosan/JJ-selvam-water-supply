import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useUI } from '../context/UIContext';
import { fmtDate, money } from '../utils/format';
import { Empty, StatusBadge } from './ui';

export default function PaymentTable({ rows, totals, onEdit, onChanged, selectable, selected = [], onSelect }) {
  const { toast, confirm } = useUI();

  const remove = async (p) => {
    const ok = await confirm({
      title: `Delete payment ${p.code}?`, danger: true, confirmText: 'Delete payment',
      message: `${money(p.amount)} from ${p.customer_name} will be removed and the customer's outstanding balance will increase by that amount.`,
    });
    if (!ok) return;
    try {
      await api.delete(`/payments/${p.id}/`);
      toast(`Payment ${p.code} deleted`);
      onChanged?.();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  if (!rows?.length) return <Empty text="No payments found" />;
  const allIds = rows.filter((r) => r.collection_status === 'PENDING').map((r) => r.id);
  const toggle = (id) => onSelect(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {selectable && <th><input type="checkbox" className="h-4 w-4" checked={allIds.length > 0 && allIds.every((i) => selected.includes(i))} onChange={(e) => onSelect(e.target.checked ? allIds : [])} /></th>}
            <th>Payment ID</th><th>Date</th><th>Customer</th><th>Delivery No.</th><th className="text-right">Amount</th>
            <th>Method</th><th>Received by</th><th>Collection</th><th>Reference</th><th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((p) => (
            <tr key={p.id}>
              {selectable && <td>{p.collection_status === 'PENDING' && <input type="checkbox" className="h-4 w-4" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />}</td>}
              <td className="font-mono text-xs font-semibold text-emerald-700">{p.code}</td>
              <td>{fmtDate(p.payment_date)}</td>
              <td><Link to={`/customers/${p.customer}`} className="font-medium hover:text-brand-700">{p.customer_name}</Link><div className="text-xs text-slate-400">{p.customer_code}</div></td>
              <td className="font-mono text-xs">{p.delivery_code || <span className="text-slate-400">Balance payment</span>}</td>
              <td className="text-right font-bold text-emerald-700">{money(p.amount)}</td>
              <td>{p.payment_method_label}</td>
              <td>{p.received_by === 'DRIVER' ? <>Driver<div className="text-xs text-slate-400">{p.driver_name}</div></> : 'Owner / Office'}</td>
              <td>{p.received_by === 'DRIVER' ? <StatusBadge status={p.collection_status} /> : <span className="text-slate-400">—</span>}</td>
              <td className="max-w-[160px] truncate text-xs">{p.reference}</td>
              <td className="text-right">
                <button className="icon-btn" title="Edit" onClick={() => onEdit(p)}><Pencil className="h-4 w-4" /></button>
                <button className="icon-btn hover:text-rose-600" title="Delete" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr><td colSpan={selectable ? 5 : 4}>Total · {totals.count} payments</td><td className="text-right">{money(totals.total)}</td><td colSpan={5} className="text-xs font-normal">Owner {money(totals.owner)} · Drivers {money(totals.driver)} · Pending handover {money(totals.pending_handover)}</td></tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

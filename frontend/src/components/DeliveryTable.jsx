import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useUI } from '../context/UIContext';
import { fmtDate, fmtTime, litres, money, num } from '../utils/format';
import { Empty, StatusBadge, WaterBadge } from './ui';

export default function DeliveryTable({ rows, totals, onEdit, onChanged, showDate = true }) {
  const { toast, confirm } = useUI();

  const remove = async (d) => {
    const ok = await confirm({
      title: `Delete delivery ${d.code}?`, danger: true, confirmText: 'Delete',
      message: `${d.customer_name} · ${litres(d.quantity_litres)} · ${money(d.total_amount)}. Any payment entered with this delivery is removed too, and the customer balance is recalculated.`,
    });
    if (!ok) return;
    try {
      await api.delete(`/deliveries/${d.id}/`);
      toast(`Delivery ${d.code} deleted`);
      onChanged?.();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  if (!rows?.length) return <Empty text="No deliveries for this selection" />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Delivery No.</th>{showDate && <th>Date</th>}<th>Customer</th><th>Driver</th><th>Water</th>
            <th className="text-right">Litres</th><th className="text-right">Bill</th><th className="text-right">Paid amount</th>
            <th className="text-right">Balance amount</th><th>Status</th><th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="font-mono text-xs font-semibold text-brand-700">{d.code}</td>
              {showDate && <td>{fmtDate(d.delivery_date)}<div className="text-xs text-slate-400">{fmtTime(d.delivery_time)}</div></td>}
              <td>
                <Link to={`/customers/${d.customer}`} className="font-medium text-slate-900 hover:text-brand-700">{d.customer_name}</Link>
                <div className="text-xs text-slate-400">{d.customer_code} · {d.customer_type_label}</div>
              </td>
              <td>{d.driver_name}<div className="text-xs text-slate-400">{d.driver_code}</div></td>
              <td><WaterBadge type={d.water_type} /></td>
              <td className="text-right font-semibold">{num(d.quantity_litres)}</td>
              <td className="text-right">{money(d.total_amount)}</td>
              <td className="text-right text-emerald-700">{money(d.paid_amount)}</td>
              <td className={`text-right font-semibold ${Number(d.balance) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{money(d.balance)}</td>
              <td><StatusBadge status={d.payment_status} /></td>
              <td className="text-right">
                <button className="icon-btn" title="Edit" onClick={() => onEdit(d)}><Pencil className="h-4 w-4" /></button>
                <button className="icon-btn hover:text-rose-600" title="Delete" onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              <td colSpan={showDate ? 5 : 4}>Total · {totals.count} deliveries <span className="ml-2 text-xs font-normal text-slate-500">Drinking {litres(totals.drinking)} · Salt {litres(totals.salt)}</span></td>
              <td className="text-right">{num(totals.litres)}</td>
              <td className="text-right">{money(totals.bill)}</td>
              <td className="text-right">{money(totals.paid)}</td>
              <td className="text-right text-rose-700">{money(totals.balance)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

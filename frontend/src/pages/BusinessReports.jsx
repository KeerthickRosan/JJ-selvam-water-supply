import { useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Banknote, Droplet, IndianRupee, Truck, Users, Wallet, Waves, AlertCircle, CircleDollarSign, Gauge } from 'lucide-react';
import PeriodFilter, { initialPeriod } from '../components/PeriodFilter';
import { ExportButtons, Loading, PageHeader, StatCard } from '../components/ui';
import { PAYMENT_METHODS, labelOf } from '../utils/constants';
import { fmtDate, fmtShort, litres, money, moneyShort, num } from '../utils/format';
import { useFetch } from '../utils/hooks';

export default function BusinessReports() {
  const [period, setPeriod] = useState(initialPeriod('month'));
  const params = { date_from: period.from, date_to: period.to };
  const { data, loading, error } = useFetch('/reports/business/', params);
  const s = data?.summary;
  const chart = (data?.daily || []).map((r) => ({ ...r, day: fmtShort(r.date), sales: Number(r.sales), collected: Number(r.collected) }));

  return (
    <div>
      <PageHeader title="Business Reports" subtitle="Daily, weekly and monthly reports from actual delivery and payment records"
        actions={<ExportButtons url="/reports/business/export/" params={params} name="business-report" />} />
      <div className="card mb-4 p-4"><PeriodFilter value={period} onChange={setPeriod} /></div>
      {error && <p className="text-rose-600">{error}</p>}
      {loading && !data ? <Loading /> : s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Drinking water supplied" value={litres(s.drinking)} icon={Droplet} tone="sky" />
            <StatCard label="Salt water supplied" value={litres(s.salt)} icon={Waves} tone="teal" />
            <StatCard label="Total litres delivered" value={litres(s.litres)} icon={Gauge} tone="brand" />
            <StatCard label="Total deliveries" value={num(s.deliveries)} icon={Truck} tone="brand" />
            <StatCard label="Customers served" value={num(s.customers)} icon={Users} tone="violet" />
            <StatCard label="Total sales" value={money(s.sales)} icon={IndianRupee} tone="violet" />
            <StatCard label="Money collected" value={money(s.collected)} icon={Banknote} tone="green" sub={`Owner ${moneyShort(s.collected_by_owner)} · Drivers ${moneyShort(s.collected_by_drivers)}`} />
            <StatCard label="Unpaid amount" value={money(s.unpaid_amount)} icon={AlertCircle} tone="rose" sub="Deliveries in period with no payment" />
            <StatCard label="Partially paid balance" value={money(s.partial_amount)} icon={CircleDollarSign} tone="amber" sub="Remaining on part-paid deliveries" />
            <StatCard label="Total outstanding balance" value={money(s.total_outstanding)} icon={Wallet} tone="rose" sub="All customers, as of today" />
          </div>
          <div className="card mt-4 p-4">
            <p className="mb-2 text-sm font-bold">Litres and sales by day</p>
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis yAxisId="l" fontSize={11} />
                  <YAxis yAxisId="r" orientation="right" fontSize={11} tickFormatter={moneyShort} />
                  <Tooltip formatter={(v, n) => (n.includes('L') ? litres(v) : money(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="l" dataKey="drinking" name="Drinking (L)" stackId="a" fill="#0ea5e9" />
                  <Bar yAxisId="l" dataKey="salt" name="Salt (L)" stackId="a" fill="#14b8a6" />
                  <Line yAxisId="r" dataKey="sales" name="Sales" stroke="#6d28d9" strokeWidth={2} dot={false} />
                  <Line yAxisId="r" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="card overflow-hidden xl:col-span-2">
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold">Daily breakdown</div>
              <div className="table-wrap max-h-[480px]">
                <table className="table">
                  <thead><tr><th>Date</th><th className="text-right">Deliveries</th><th className="text-right">Drinking</th><th className="text-right">Salt</th><th className="text-right">Litres</th><th className="text-right">Sales</th><th className="text-right">Collected</th><th className="text-right">Pending</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.daily.filter((r) => r.deliveries || Number(r.collected)).map((r) => (
                      <tr key={r.date}><td>{fmtDate(r.date)}</td><td className="text-right">{r.deliveries}</td><td className="text-right">{num(r.drinking)}</td><td className="text-right">{num(r.salt)}</td><td className="text-right font-semibold">{num(r.litres)}</td><td className="text-right">{money(r.sales)}</td><td className="text-right text-emerald-700">{money(r.collected)}</td><td className="text-right text-rose-600">{money(r.pending)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td>Total</td><td className="text-right">{s.deliveries}</td><td className="text-right">{num(s.drinking)}</td><td className="text-right">{num(s.salt)}</td><td className="text-right">{num(s.litres)}</td><td className="text-right">{money(s.sales)}</td><td className="text-right">{money(s.collected)}</td><td className="text-right">{money(s.period_pending)}</td></tr></tfoot>
                </table>
              </div>
            </div>
            <div className="space-y-4">
              <div className="card overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold">By customer type</div>
                <table className="table"><tbody className="divide-y divide-slate-100">
                  {data.by_customer_type.map((r) => <tr key={r.customer_type}><td>{r.label}<div className="text-xs text-slate-400">{r.deliveries} deliveries · {litres(r.litres)}</div></td><td className="text-right font-semibold">{money(r.sales)}</td></tr>)}
                  {!data.by_customer_type.length && <tr><td className="text-slate-400">No deliveries</td></tr>}
                </tbody></table>
              </div>
              <div className="card overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold">Collections by payment method</div>
                <table className="table"><tbody className="divide-y divide-slate-100">
                  {data.by_payment_method.map((r) => <tr key={r.method}><td>{labelOf(PAYMENT_METHODS, r.method)}<div className="text-xs text-slate-400">{r.count} payments</div></td><td className="text-right font-semibold text-emerald-700">{money(r.amount)}</td></tr>)}
                  {!data.by_payment_method.length && <tr><td className="text-slate-400">No payments</td></tr>}
                </tbody></table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

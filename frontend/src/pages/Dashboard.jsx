import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertCircle, Banknote, Droplet, IndianRupee, Plus, RefreshCw, Truck, Users, Wallet, Waves,
} from 'lucide-react';
import DeliveryFormModal from '../components/DeliveryFormModal';
import PaymentFormModal from '../components/PaymentFormModal';
import { Empty, Loading, PageHeader, StatCard, StatusBadge, WaterBadge } from '../components/ui';
import { addDays, fmtDate, fmtShort, litres, money, moneyShort, num, todayISO } from '../utils/format';
import { useFetch } from '../utils/hooks';

function Section({ title, link, children, className = '' }) {
  return (
    <div className={`card overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {link && <Link to={link} className="text-xs font-semibold text-brand-600 hover:underline">View all</Link>}
      </div>
      {children}
    </div>
  );
}

function AlertList({ title, tone, items, count, link }) {
  const tones = { rose: 'border-rose-200 bg-rose-50/60', amber: 'border-amber-200 bg-amber-50/60', violet: 'border-violet-200 bg-violet-50/60' };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">{title} <span className="ml-1 text-slate-500">({count ?? items.length})</span></p>
        <Link to={link} className="text-xs font-semibold text-brand-700 hover:underline">Open</Link>
      </div>
      {items.length === 0 ? <p className="text-xs text-slate-500">None 🎉</p> : (
        <ul className="space-y-1.5">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <Link to={`/customers/${c.id}`} className="truncate hover:text-brand-700">{c.name} <span className="text-xs text-slate-400">{c.code}</span></Link>
              <span className="shrink-0 font-semibold text-rose-600">{money(c.current_balance)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [date, setDate] = useState(todayISO());
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { data, loading, error, reload } = useFetch('/dashboard/', { date });
  const navigate = useNavigate();
  const isToday = date === todayISO();

  const t = data?.today;
  const series = (data?.series || []).map((r) => ({ ...r, day: fmtShort(r.date), sales: Number(r.sales), collected: Number(r.collected) }));

  return (
    <div>
      <PageHeader
        title={isToday ? "Today's Business Overview" : `Business Overview · ${fmtDate(date)}`}
        subtitle="Live figures from your delivery and payment records"
        actions={<>
          <div className="flex items-center gap-1">
            <button className="btn-secondary btn-sm" onClick={() => setDate(addDays(date, -1))}>‹</button>
            <input type="date" className="input w-auto py-1.5" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
            <button className="btn-secondary btn-sm" onClick={() => setDate(addDays(date, 1))} disabled={isToday}>›</button>
          </div>
          <button className="btn-secondary" onClick={reload}><RefreshCw className="h-4 w-4" /></button>
          <button className="btn-success" onClick={() => setPaymentOpen(true)}><IndianRupee className="h-4 w-4" /> Payment</button>
          <button className="btn-primary" onClick={() => setDeliveryOpen(true)}><Plus className="h-4 w-4" /> New delivery</button>
        </>}
      />
      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Drinking water supplied" value={litres(t.drinking_litres)} icon={Droplet} tone="sky" />
            <StatCard label="Salt water supplied" value={litres(t.salt_litres)} icon={Waves} tone="teal" />
            <StatCard label="Total deliveries" value={num(t.deliveries)} icon={Truck} tone="brand" sub={`${litres(t.total_litres)} in total`} onClick={() => navigate('/logbook')} />
            <StatCard label="Total sales" value={money(t.sales)} icon={IndianRupee} tone="violet" />
            <StatCard label="Amount collected" value={money(t.collected)} icon={Banknote} tone="green" sub={`Owner ${moneyShort(t.collected_by_owner)} · Drivers ${moneyShort(t.collected_by_drivers)}`} />
            <StatCard label="Total outstanding" value={money(t.total_outstanding)} icon={Wallet} tone="rose" sub={`${t.customers_with_balance} customers owe money`} onClick={() => navigate('/pending')} />
            <StatCard label="Unpaid customers" value={num(t.unpaid_customers)} icon={AlertCircle} tone="rose" onClick={() => navigate('/unpaid')} />
            <StatCard label="Partially paid customers" value={num(t.partial_customers)} icon={Users} tone="amber" onClick={() => navigate('/pending')} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[['Daily', data.stats.daily], ['Last 7 days', data.stats.weekly], ['This month', data.stats.monthly]].map(([label, s]) => (
              <div key={label} className="card card-pad">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{label}</p>
                <div className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
                  <span className="text-slate-500">Deliveries</span><span className="text-right font-semibold">{num(s.deliveries)}</span>
                  <span className="text-slate-500">Litres</span><span className="text-right font-semibold">{litres(s.litres)}</span>
                  <span className="text-slate-500">Sales</span><span className="text-right font-semibold">{money(s.sales)}</span>
                  <span className="text-slate-500">Collected</span><span className="text-right font-semibold text-emerald-700">{money(s.collected)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Section title="Litres delivered · last 14 days">
              <div className="h-64 p-3">
                <ResponsiveContainer>
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="day" fontSize={11} tickLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => litres(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="drinking" name="Drinking" stackId="a" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="salt" name="Salt" stackId="a" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
            <Section title="Sales vs collection · last 14 days">
              <div className="h-64 p-3">
                <ResponsiveContainer>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="day" fontSize={11} tickLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={moneyShort} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="sales" name="Sales" stroke="#1d6ef1" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>

          <h3 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Payment reminders</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <AlertList title="Unpaid bills" tone="rose" items={data.alerts.unpaid} count={t.unpaid_customers} link="/unpaid" />
            <AlertList title="Partially paid bills" tone="amber" items={data.alerts.partial} count={t.partial_customers} link="/pending" />
            <AlertList title="Previous pending balances" tone="violet" items={data.alerts.previous_pending} count={data.alerts.previous_pending_count} link="/pending" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Section title="Recent deliveries" link="/deliveries" className="xl:col-span-2">
              {data.recent_deliveries.length === 0 ? <Empty /> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>No.</th><th>Date</th><th>Customer</th><th>Driver</th><th>Water</th><th className="text-right">Litres</th><th className="text-right">Bill</th><th>Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.recent_deliveries.map((d) => (
                        <tr key={d.id}>
                          <td className="font-mono text-xs text-brand-700">{d.code}</td>
                          <td>{fmtShort(d.delivery_date)}</td>
                          <td><Link className="hover:text-brand-700" to={`/customers/${d.customer}`}>{d.customer_name}</Link></td>
                          <td>{d.driver_name}</td>
                          <td><WaterBadge type={d.water_type} /></td>
                          <td className="text-right">{num(d.quantity_litres)}</td>
                          <td className="text-right">{money(d.total_amount)}</td>
                          <td><StatusBadge status={d.payment_status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
            <Section title="Outstanding payment overview" link="/pending">
              {data.top_outstanding.length === 0 ? <Empty text="No outstanding balances" /> : (
                <ul className="divide-y divide-slate-100">
                  {data.top_outstanding.map((c) => (
                    <li key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link to={`/customers/${c.id}`} className="block truncate font-medium hover:text-brand-700">{c.name}</Link>
                        <span className="text-xs text-slate-400">{c.code} · {c.customer_type_label}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-rose-600">{money(c.current_balance)}</p>
                        <StatusBadge status={c.payment_status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title={`Driver-wise summary · ${fmtShort(date)}`} link="/driver-reports">
              {data.driver_summary.length === 0 ? <Empty text="No driver activity" /> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Driver</th><th className="text-right">Trips</th><th className="text-right">Litres</th><th className="text-right">Sales</th><th className="text-right">Collected</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.driver_summary.map((r) => (
                        <tr key={r.driver_id}><td>{r.name}<div className="text-xs text-slate-400">{r.code}</div></td><td className="text-right">{r.deliveries}</td><td className="text-right">{num(r.litres)}</td><td className="text-right">{money(r.sales)}</td><td className="text-right text-emerald-700">{money(r.collected)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
            <Section title={`Customer-wise summary · ${fmtShort(date)}`} link="/logbook">
              {data.customer_summary.length === 0 ? <Empty text="No deliveries" /> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Customer</th><th className="text-right">Litres</th><th className="text-right">Bill</th><th className="text-right">Due</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.customer_summary.map((r) => (
                        <tr key={r.customer_id}><td><Link className="hover:text-brand-700" to={`/customers/${r.customer_id}`}>{r.name}</Link><div className="text-xs text-slate-400">{r.code} · {r.deliveries} trip(s)</div></td><td className="text-right">{num(r.litres)}</td><td className="text-right">{money(r.bill)}</td><td className="text-right text-rose-600">{money(r.balance)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
            <Section title="Recent payment transactions" link="/payments">
              {data.recent_payments.length === 0 ? <Empty text="No payments yet" /> : (
                <ul className="divide-y divide-slate-100">
                  {data.recent_payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.customer_name}</p>
                        <p className="text-xs text-slate-400">{p.code} · {fmtShort(p.payment_date)} · {p.payment_method_label} · {p.driver_name || 'Owner'}</p>
                      </div>
                      <span className="font-bold text-emerald-700">{money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}
      <DeliveryFormModal open={deliveryOpen} onClose={() => setDeliveryOpen(false)} onSaved={reload} defaultDate={date} />
      <PaymentFormModal open={paymentOpen} onClose={() => setPaymentOpen(false)} onSaved={reload} />
    </div>
  );
}

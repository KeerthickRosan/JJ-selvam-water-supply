import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { UserCheck } from 'lucide-react';
import PeriodFilter, { initialPeriod } from '../components/PeriodFilter';
import { Empty, ExportButtons, Loading, PageHeader, Select } from '../components/ui';
import { cleanParams, fmtShort, litres, money, num } from '../utils/format';
import { useFetch, useLookups } from '../utils/hooks';

function Row({ label, value, strong, tone = '' }) {
  return <div className="flex justify-between py-1 text-sm"><span className="text-slate-500">{label}</span><span className={`${strong ? 'font-bold' : 'font-semibold'} ${tone}`}>{value}</span></div>;
}

export default function DriverReports() {
  const { drivers } = useLookups();
  const [period, setPeriod] = useState(initialPeriod('today'));
  const [driver, setDriver] = useState('');
  const params = cleanParams({ date_from: period.from, date_to: period.to, driver });
  const { data, loading, error } = useFetch('/reports/drivers/', params);

  return (
    <div>
      <PageHeader title="Driver-wise Reports" subtitle="Deliveries, litres, sales and money collected by each driver"
        actions={<ExportButtons url="/reports/drivers/export/" params={params} name="driver-report" />} />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="w-full sm:w-56"><Select placeholder="All drivers" options={drivers.map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }))} value={driver} onChange={(e) => setDriver(e.target.value)} /></div>
      </div>
      {error && <p className="text-rose-600">{error}</p>}
      {loading && !data ? <Loading /> : !data?.drivers?.length ? <div className="card"><Empty text="No drivers or activity" /></div> : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.drivers.map((d) => (
              <div key={d.driver_id} className="card card-pad">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><UserCheck className="h-5 w-5" /></div>
                  <div><p className="font-bold">{d.name}</p><p className="font-mono text-xs text-slate-500">{d.code}{!d.is_active && ' · inactive'}</p></div>
                </div>
                <div className="divide-y divide-slate-100">
                  <Row label="Total deliveries completed" value={num(d.deliveries)} />
                  <Row label="Customers served" value={num(d.customers)} />
                  <Row label="Drinking water delivered" value={litres(d.drinking)} tone="text-sky-700" />
                  <Row label="Salt water delivered" value={litres(d.salt)} tone="text-teal-700" />
                  <Row label="Total litres delivered" value={litres(d.litres)} strong />
                  <Row label="Total sales generated" value={money(d.sales)} strong />
                  <Row label="Total money collected" value={money(d.collected)} strong tone="text-emerald-700" />
                  <Row label="  Handed over to office" value={money(d.handed_over)} />
                  <Row label="  Pending with driver" value={money(d.pending_handover)} tone={Number(d.pending_handover) > 0 ? 'text-amber-600' : ''} />
                  <Row label="Pending customer payments" value={money(d.pending_payments)} tone="text-rose-600" />
                </div>
              </div>
            ))}
          </div>
          {data.daily?.length > 0 && (
            <div className="card mt-4 p-4">
              <p className="mb-2 text-sm font-bold">Day-by-day litres</p>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={data.daily.map((r) => ({ ...r, day: fmtShort(r.date) }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="day" fontSize={11} /><YAxis fontSize={11} />
                    <Tooltip formatter={(v) => litres(v)} /><Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="drinking" name="Drinking" stackId="a" fill="#0ea5e9" />
                    <Bar dataKey="salt" name="Salt" stackId="a" fill="#14b8a6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

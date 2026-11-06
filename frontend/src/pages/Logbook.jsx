import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import DeliveryFilters from '../components/DeliveryFilters';
import DeliveryFormModal from '../components/DeliveryFormModal';
import DeliveryTable from '../components/DeliveryTable';
import { ExportButtons, Loading, PageHeader, StatCard } from '../components/ui';
import { addDays, cleanParams, fmtDate, litres, money, todayISO } from '../utils/format';
import { useDebounce, useFetch, useLookups } from '../utils/hooks';

export default function Logbook() {
  const { drivers } = useLookups();
  const [date, setDate] = useState(todayISO());
  const [filters, setFilters] = useState({ search: '', driver: '', water_type: '', status: '' });
  const [modal, setModal] = useState({ open: false, item: null });
  const search = useDebounce(filters.search);
  const params = cleanParams({ ...filters, search, date });
  const { data, loading, error, reload } = useFetch('/deliveries/', { ...params, page_size: 2000 });
  const t = data?.totals;

  return (
    <div>
      <PageHeader title="Daily Delivery Logbook" subtitle={`Every delivery made on ${fmtDate(date)}`}
        actions={<>
          <ExportButtons url="/deliveries/export/" params={params} name={`logbook-${date}`} />
          <button className="btn-primary" onClick={() => setModal({ open: true, item: null })}><Plus className="h-4 w-4" /> Add delivery</button>
        </>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-secondary" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="h-4 w-4" /> Previous day</button>
        <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value || todayISO())} />
        <button className="btn-secondary" onClick={() => setDate(addDays(date, 1))}>Next day <ChevronRight className="h-4 w-4" /></button>
        {date !== todayISO() && <button className="btn-ghost" onClick={() => setDate(todayISO())}>Today</button>}
      </div>
      {t && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Deliveries" value={t.count} />
          <StatCard label="Drinking water" value={litres(t.drinking)} tone="sky" />
          <StatCard label="Salt water" value={litres(t.salt)} tone="teal" />
          <StatCard label="Total bill" value={money(t.bill)} tone="violet" />
          <StatCard label="Paid" value={money(t.paid)} tone="green" />
          <StatCard label="Balance" value={money(t.balance)} tone="rose" />
        </div>
      )}
      <div className="card">
        <div className="grid grid-cols-1 gap-2 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <DeliveryFilters value={filters} drivers={drivers} onChange={setFilters} />
        </div>
        {error && <p className="p-4 text-sm text-rose-600">{error}</p>}
        {loading && !data ? <Loading /> : (
          <DeliveryTable rows={data?.results} totals={t} showDate={false} onEdit={(d) => setModal({ open: true, item: d })} onChanged={reload} />
        )}
      </div>
      <DeliveryFormModal open={modal.open} delivery={modal.item} defaultDate={date} onClose={() => setModal({ open: false, item: null })} onSaved={reload} />
    </div>
  );
}

import { useState } from 'react';
import { Plus } from 'lucide-react';
import DeliveryFilters from '../components/DeliveryFilters';
import DeliveryFormModal from '../components/DeliveryFormModal';
import DeliveryTable from '../components/DeliveryTable';
import PeriodFilter, { initialPeriod } from '../components/PeriodFilter';
import { ExportButtons, Loading, PageHeader, Pagination } from '../components/ui';
import { cleanParams } from '../utils/format';
import { useDebounce, useFetch, useLookups } from '../utils/hooks';

export default function Deliveries() {
  const { drivers } = useLookups();
  const [period, setPeriod] = useState(initialPeriod('week'));
  const [filters, setFilters] = useState({ search: '', driver: '', water_type: '', status: '' });
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState({ open: false, item: null });
  const search = useDebounce(filters.search);
  const params = cleanParams({ ...filters, search, date_from: period.from, date_to: period.to });
  const { data, loading, error, reload } = useFetch('/deliveries/', { ...params, page });

  return (
    <div>
      <PageHeader title="Water Deliveries" subtitle="All delivery records with bills and payment status"
        actions={<>
          <ExportButtons url="/deliveries/export/" params={params} name="deliveries" />
          <button className="btn-primary" onClick={() => setModal({ open: true, item: null })}><Plus className="h-4 w-4" /> New delivery</button>
        </>} />
      <div className="card">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <PeriodFilter value={period} onChange={(v) => { setPeriod(v); setPage(1); }} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <DeliveryFilters value={filters} drivers={drivers} onChange={(v) => { setFilters(v); setPage(1); }} />
          </div>
        </div>
        {error && <p className="p-4 text-sm text-rose-600">{error}</p>}
        {loading && !data ? <Loading /> : (
          <DeliveryTable rows={data?.results} totals={data?.totals} onEdit={(d) => setModal({ open: true, item: d })} onChanged={reload} />
        )}
        <Pagination page={data?.page} totalPages={data?.total_pages} count={data?.count} onChange={setPage} />
      </div>
      <DeliveryFormModal open={modal.open} delivery={modal.item} onClose={() => setModal({ open: false, item: null })} onSaved={reload} />
    </div>
  );
}

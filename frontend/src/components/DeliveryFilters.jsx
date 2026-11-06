import { PAYMENT_STATUSES, WATER_TYPES } from '../utils/constants';
import { SearchInput, Select } from './ui';

export default function DeliveryFilters({ value, onChange, drivers }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <>
      <SearchInput value={value.search} onChange={(v) => set('search', v)} placeholder="Search customer, ID, delivery no." />
      <Select placeholder="All drivers" options={drivers.map((d) => ({ value: d.id, label: d.name }))} value={value.driver} onChange={(e) => set('driver', e.target.value)} />
      <Select placeholder="All water types" options={WATER_TYPES} value={value.water_type} onChange={(e) => set('water_type', e.target.value)} />
      <Select placeholder="All payment statuses" options={PAYMENT_STATUSES} value={value.status} onChange={(e) => set('status', e.target.value)} />
    </>
  );
}

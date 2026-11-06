import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../api/client';
import { useUI } from '../context/UIContext';
import { PAYMENT_METHODS, QUICK_QUANTITIES, RECEIVED_BY, WATER_TYPES, labelOf, CUSTOMER_TYPES } from '../utils/constants';
import { money, nowTime, todayISO } from '../utils/format';
import { useLookups } from '../utils/hooks';
import Combobox from './Combobox';
import CustomerFormModal from './CustomerFormModal';
import Modal from './Modal';
import { Field, Select, StatusBadge } from './ui';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const blank = (date, customer) => ({
  delivery_date: date || todayISO(), delivery_time: nowTime(), customer: customer || '', driver: '', water_type: 'DRINKING',
  quantity_litres: '', amount_paid: '', balance_amount: '',
  payment_method: 'CASH', received_by: 'DRIVER', notes: '',
});

export default function DeliveryFormModal({ open, onClose, onSaved, delivery, defaultDate, presetCustomer }) {
  const { toast } = useUI();
  const { customers, drivers, reload } = useLookups();
  const [f, setF] = useState(blank());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const editing = !!delivery;

  useEffect(() => {
    if (!open) {
      setAddingCustomer(false);
      return;
    }
    reload().catch(() => {});
    setErrors({});
    if (delivery) {
      setF({
        delivery_date: delivery.delivery_date, delivery_time: delivery.delivery_time.slice(0, 5), customer: delivery.customer,
        driver: delivery.driver, water_type: delivery.water_type, quantity_litres: delivery.quantity_litres,
        amount_paid: delivery.initial_payment ? Number(delivery.initial_payment.amount) : 0,
        balance_amount: Math.max(Number(delivery.total_amount) - Number(delivery.initial_payment?.amount || 0), 0),
        payment_method: delivery.initial_payment?.payment_method || 'CASH', received_by: delivery.initial_payment?.received_by || 'DRIVER',
        notes: delivery.notes || '',
      });
    } else {
      setF(blank(defaultDate, presetCustomer));
    }
  }, [open, delivery, defaultDate, presetCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

  const customer = customers.find((c) => String(c.id) === String(f.customer));
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // fill defaults when the customer changes (new entries only)
  useEffect(() => {
    if (!customer || editing) return;
    setF((p) => ({
      ...p,
      water_type: customer.water_type !== 'BOTH' ? customer.water_type : p.water_type,
      quantity_litres: p.quantity_litres || customer.regular_quantity || '',
    }));
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const paid = round2(f.amount_paid || 0);
  const remaining = round2(f.balance_amount || 0);
  const total = useMemo(() => round2(paid + remaining), [paid, remaining]);
  const status = remaining === 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';

  const customerOptions = customers
    .filter((c) => c.is_active || String(c.id) === String(f.customer))
    .map((c) => ({ value: c.id, label: `${c.name} (${c.code})`, sub: `${labelOf(CUSTOMER_TYPES, c.customer_type)} · ${c.phone || 'no phone'}${Number(c.current_balance) > 0 ? ` · Due ${money(c.current_balance)}` : ''}`, search: c.phone }));
  const driverOptions = drivers.filter((d) => d.is_active || String(d.id) === String(f.driver)).map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));

  const submit = async (e, another = false) => {
    e?.preventDefault();
    const errs = {};
    if (!f.customer) errs.customer = 'Select a customer';
    if (!f.driver) errs.driver = 'Select a driver';
    if (!f.quantity_litres || Number(f.quantity_litres) <= 0) errs.quantity_litres = 'Enter litres delivered';
    if (Number(f.amount_paid) < 0) errs.amount_paid = 'Cannot be negative';
    if (Number(f.balance_amount) < 0) errs.balance_amount = 'Cannot be negative';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const body = {
      delivery_date: f.delivery_date, delivery_time: f.delivery_time, customer: f.customer, driver: f.driver,
      water_type: f.water_type, quantity_litres: Number(f.quantity_litres), pricing_mode: 'FIXED',
      total_amount: total,
      amount_paid: paid, payment_method: f.payment_method, received_by: f.received_by, notes: f.notes,
    };

    setSaving(true);
    try {
      const r = editing ? await api.put(`/deliveries/${delivery.id}/`, body) : await api.post('/deliveries/', body);
      toast(`${editing ? 'Updated' : 'Saved'} delivery ${r.data.code} — ${r.data.payment_status_label}`);
      onSaved?.(r.data);
      if (another) setF({ ...blank(f.delivery_date), driver: f.driver });
      else onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCustomerSaved = async (newCustomer) => {
    try {
      await reload();
      set('customer', newCustomer.id);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  return (
    <>
    <Modal open={open && !addingCustomer} onClose={onClose} size="lg" title={editing ? `Edit delivery ${delivery.code}` : 'New water delivery'}
      subtitle={editing ? 'Changes update the customer balance and reports automatically.' : 'Delivery ID is generated automatically when you save.'}
      footer={<>
        <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        {!editing && <button className="btn-secondary" onClick={(e) => submit(e, true)} disabled={saving}>Save & add another</button>}
        <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save delivery'}</button>
      </>}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Delivery date" error={errors.delivery_date}>
          <input type="date" className="input" value={f.delivery_date} onChange={(e) => set('delivery_date', e.target.value)} required />
        </Field>
        <Field label="Time" error={errors.delivery_time}>
          <input type="time" className="input" value={f.delivery_time} onChange={(e) => set('delivery_time', e.target.value)} required />
        </Field>
        <Field label="Customer *" error={errors.customer} className="sm:col-span-2">
          <Combobox options={customerOptions} value={f.customer} onChange={(v) => set('customer', v)} placeholder="Search customer name, ID or phone" />
          {!editing && (
            <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => setAddingCustomer(true)}>
              <Plus className="h-4 w-4" /> Add new customer
            </button>
          )}
          {customer && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>ID: <b>{customer.code}</b></span>
              <span>Type: <b>{labelOf(CUSTOMER_TYPES, customer.customer_type)}</b></span>
              <span>Usual water: <b>{customer.water_type === 'BOTH' ? 'Both' : labelOf(WATER_TYPES, customer.water_type)}</b></span>
              <span className={Number(customer.current_balance) > 0 ? 'font-semibold text-rose-600' : ''}>Previous balance: <b>{money(customer.current_balance)}</b></span>
            </div>
          )}
        </Field>
        <Field label="Driver *" error={errors.driver}>
          <Combobox options={driverOptions} value={f.driver} onChange={(v) => set('driver', v)} placeholder="Select driver" />
        </Field>
        <Field label="Water type *" error={errors.water_type}>
          <div className="grid grid-cols-2 gap-2">
            {WATER_TYPES.map((w) => (
              <button type="button" key={w.value} onClick={() => set('water_type', w.value)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${f.water_type === w.value ? (w.value === 'SALT' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-sky-500 bg-sky-50 text-sky-700') : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                {w.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Quantity delivered (litres) *" error={errors.quantity_litres} className="sm:col-span-2">
          <input type="number" min="1" step="1" inputMode="numeric" className="input text-lg font-semibold" value={f.quantity_litres}
            onChange={(e) => set('quantity_litres', e.target.value)} placeholder="e.g. 1000" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_QUANTITIES.map((q) => (
              <button type="button" key={q} onClick={() => set('quantity_litres', q)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${Number(f.quantity_litres) === q ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {q.toLocaleString('en-IN')} L
              </button>
            ))}
          </div>
        </Field>
        <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4 sm:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="label">Total bill (paid + balance)</p>
              <p className="text-2xl font-bold text-slate-900">{money(total)}</p>
            </div>
            <Field label="Paid amount (₹)" error={errors.amount_paid}>
              <div className="flex gap-1">
                <input type="number" min="0" step="0.01" className="input" value={f.amount_paid} onChange={(e) => set('amount_paid', e.target.value)} placeholder="0" />
                <button type="button" className="btn-secondary btn-sm" onClick={() => setF((p) => ({ ...p, amount_paid: round2(Number(p.amount_paid || 0) + Number(p.balance_amount || 0)), balance_amount: 0 }))}>Full</button>
              </div>
            </Field>
            <Field label="Balance amount (₹)" error={errors.balance_amount}>
              <input type="number" min="0" step="0.01" className="input" value={f.balance_amount} onChange={(e) => set('balance_amount', e.target.value)} placeholder="0" />
              <div className="mt-1"><StatusBadge status={status} /></div>
            </Field>
          </div>
          {paid > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Payment method"><Select options={PAYMENT_METHODS} value={f.payment_method} onChange={(e) => set('payment_method', e.target.value)} /></Field>
              <Field label="Money received by"><Select options={RECEIVED_BY} value={f.received_by} onChange={(e) => set('received_by', e.target.value)} /></Field>
            </div>
          )}
        </div>
        <Field label="Notes" className="sm:col-span-2">
          <textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional" />
        </Field>
      </form>
    </Modal>
    <CustomerFormModal
      open={open && addingCustomer}
      onClose={() => setAddingCustomer(false)}
      onSaved={handleCustomerSaved}
    />
    </>
  );
}

import { useEffect, useState } from 'react';
import api, { errorMessage, fieldErrors, fetchAll } from '../api/client';
import { useUI } from '../context/UIContext';
import { CUSTOMER_TYPES, PAYMENT_METHODS, RECEIVED_BY, labelOf } from '../utils/constants';
import { fmtDate, litres, money, todayISO } from '../utils/format';
import { useLookups } from '../utils/hooks';
import Combobox from './Combobox';
import Modal from './Modal';
import { Field, Select } from './ui';

const blank = (customer) => ({
  customer: customer || '', delivery: '', amount: '', payment_date: todayISO(), payment_method: 'CASH',
  received_by: 'OWNER', driver: '', reference: '', notes: '',
});

export default function PaymentFormModal({ open, onClose, onSaved, payment, presetCustomer }) {
  const { toast, confirm } = useUI();
  const { customers, drivers, reload } = useLookups();
  const [f, setF] = useState(blank());
  const [dues, setDues] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const editing = !!payment;
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open) return;
    reload().catch(() => {});
    setErrors({});
    if (payment) {
      setF({
        customer: payment.customer, delivery: payment.delivery || '', amount: Number(payment.amount), payment_date: payment.payment_date,
        payment_method: payment.payment_method, received_by: payment.received_by, driver: payment.driver || '',
        reference: payment.reference || '', notes: payment.notes || '',
      });
    } else setF(blank(presetCustomer));
  }, [open, payment, presetCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !f.customer) { setDues([]); return; }
    fetchAll('/deliveries/', { customer: f.customer, outstanding: 1 }).then(setDues).catch(() => setDues([]));
  }, [open, f.customer]);

  const customer = customers.find((c) => String(c.id) === String(f.customer));
  const balance = Number(customer?.current_balance || 0);
  const after = balance - Number(f.amount || 0) + (editing && String(payment.customer) === String(f.customer) ? Number(payment.amount) : 0);

  const save = async (allowDuplicate = false) => {
    const errs = {};
    if (!f.customer) errs.customer = 'Select a customer';
    if (!f.amount || Number(f.amount) <= 0) errs.amount = 'Enter the amount received';
    if (f.received_by === 'DRIVER' && !f.driver) errs.driver = 'Select the driver who collected';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = { ...f, amount: Number(f.amount), delivery: f.delivery || null, driver: f.received_by === 'DRIVER' ? f.driver : null, allow_duplicate: allowDuplicate };
    setSaving(true);
    try {
      const r = editing ? await api.put(`/payments/${payment.id}/`, body) : await api.post('/payments/', body);
      toast(`Payment ${r.data.code} of ${money(r.data.amount)} ${editing ? 'updated' : 'recorded'}`);
      onSaved?.(r.data);
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      if (fe.duplicate) {
        setSaving(false);
        const ok = await confirm({ title: 'Possible duplicate payment', message: fe.duplicate, confirmText: 'Yes, record it again' });
        if (ok) return await save(true);
        return;
      }
      setErrors(fe);
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const customerOptions = customers
    .filter((c) => c.is_active || String(c.id) === String(f.customer))
    .map((c) => ({ value: c.id, label: `${c.name} (${c.code})`, sub: `${labelOf(CUSTOMER_TYPES, c.customer_type)}${Number(c.current_balance) > 0 ? ` · Due ${money(c.current_balance)}` : ' · No dues'}`, search: c.phone }));

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit payment ${payment.code}` : 'Record payment'}
      subtitle="Payments are linked to the customer and clear the oldest dues first. No delivery entry is created."
      footer={<>
        <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn-success" onClick={() => save(false)} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Record payment'}</button>
      </>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Customer *" error={errors.customer} className="sm:col-span-2">
          <Combobox options={customerOptions} value={f.customer} onChange={(v) => setF((p) => ({ ...p, customer: v, delivery: '' }))} placeholder="Search customer" disabled={editing && payment.is_delivery_payment} />
        </Field>
        {customer && (
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center sm:col-span-2">
            <div><p className="text-[11px] uppercase text-slate-500">Outstanding now</p><p className={`font-bold ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(balance)}</p></div>
            <div><p className="text-[11px] uppercase text-slate-500">This payment</p><p className="font-bold text-slate-800">{money(f.amount)}</p></div>
            <div><p className="text-[11px] uppercase text-slate-500">After payment</p><p className={`font-bold ${after > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{after < 0 ? `${money(-after)} advance` : money(after)}</p></div>
          </div>
        )}
        <Field label="Amount received (₹) *" error={errors.amount}>
          <div className="flex gap-1">
            <input type="number" min="0.01" step="0.01" className="input text-lg font-semibold" value={f.amount} onChange={(e) => set('amount', e.target.value)} />
            {balance > 0 && !editing && <button type="button" className="btn-secondary btn-sm" onClick={() => set('amount', balance)}>Full due</button>}
          </div>
        </Field>
        <Field label="Payment date *" error={errors.payment_date}>
          <input type="date" className="input" value={f.payment_date} onChange={(e) => set('payment_date', e.target.value)} />
        </Field>
        <Field label="Payment method"><Select options={PAYMENT_METHODS} value={f.payment_method} onChange={(e) => set('payment_method', e.target.value)} /></Field>
        <Field label="Received by"><Select options={RECEIVED_BY} value={f.received_by} onChange={(e) => set('received_by', e.target.value)} /></Field>
        {f.received_by === 'DRIVER' && (
          <Field label="Driver who collected *" error={errors.driver}>
            <Select placeholder="Select driver" options={drivers.map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }))} value={f.driver} onChange={(e) => set('driver', e.target.value)} />
          </Field>
        )}
        <Field label="Apply to" error={errors.delivery} hint="Leave as 'Oldest dues first' for normal balance payments">
          <Select value={f.delivery} onChange={(e) => set('delivery', e.target.value)} placeholder="Oldest dues first (automatic)"
            options={[
              ...(payment?.delivery && !dues.some((d) => d.id === payment.delivery) ? [{ value: payment.delivery, label: payment.delivery_code }] : []),
              ...dues.map((d) => ({ value: d.id, label: `${d.code} · ${fmtDate(d.delivery_date)} · ${litres(d.quantity_litres)} · due ${money(d.balance)}` })),
            ]} />
        </Field>
        <Field label="Reference (UPI / cheque no.)"><input className="input" value={f.reference} onChange={(e) => set('reference', e.target.value)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

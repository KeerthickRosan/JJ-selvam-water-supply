import { useEffect, useState } from 'react';
import api, { errorMessage, fieldErrors } from '../api/client';
import { useUI } from '../context/UIContext';
import { CUSTOMER_TYPES, CUSTOMER_WATER_TYPES } from '../utils/constants';
import Modal from './Modal';
import { Field, Select } from './ui';

const blank = { name: '', customer_type: 'HOTEL', phone: '', address: '', water_type: 'DRINKING', regular_quantity: '', opening_balance: '', notes: '', is_active: true };

export default function CustomerFormModal({ open, onClose, onSaved, customer }) {
  const { toast } = useUI();
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(customer ? { ...blank, ...customer, regular_quantity: customer.regular_quantity ?? '', opening_balance: Number(customer.opening_balance) || '' } : blank);
  }, [open, customer]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!f.name.trim()) return setErrors({ name: 'Customer name is required' });
    setSaving(true);
    const body = {
      name: f.name, customer_type: f.customer_type, phone: f.phone, address: f.address, water_type: f.water_type,
      regular_quantity: f.regular_quantity === '' ? null : Number(f.regular_quantity),
      opening_balance: f.opening_balance === '' ? 0 : Number(f.opening_balance), notes: f.notes, is_active: f.is_active,
    };
    try {
      const r = customer ? await api.put(`/customers/${customer.id}/`, body) : await api.post('/customers/', body);
      toast(`Customer ${r.data.code} ${customer ? 'updated' : 'added'}`);
      onSaved?.(r.data);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={customer ? `Edit customer ${customer.code}` : 'Add customer'}
      subtitle={customer ? 'Old deliveries keep the name they were recorded with.' : 'Customer ID (CUST001…) is generated automatically.'}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save customer'}</button>
      </>}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Customer / hotel / house name *" error={errors.name} className="sm:col-span-2">
          <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="Customer type" error={errors.customer_type}><Select options={CUSTOMER_TYPES} value={f.customer_type} onChange={(e) => set('customer_type', e.target.value)} /></Field>
        <Field label="Contact number" error={errors.phone}><input className="input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Address" error={errors.address} className="sm:col-span-2"><textarea className="input" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Water type" error={errors.water_type}><Select options={CUSTOMER_WATER_TYPES} value={f.water_type} onChange={(e) => set('water_type', e.target.value)} /></Field>
        <Field label="Regular delivery quantity (L)" error={errors.regular_quantity} hint="Optional — pre-fills the delivery form">
          <input type="number" min="0" className="input" value={f.regular_quantity} onChange={(e) => set('regular_quantity', e.target.value)} />
        </Field>
        <Field label="Previous outstanding balance (₹)" error={errors.opening_balance} hint="Amount the customer owed before using this system">
          <input type="number" min="0" step="0.01" className="input" value={f.opening_balance} onChange={(e) => set('opening_balance', e.target.value)} />
        </Field>
        <Field label="Status">
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-4 w-4 rounded" /> Active customer</label>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

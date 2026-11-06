import { useState } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Inbox, Loader2 } from 'lucide-react';
import { download, errorMessage } from '../api/client';
import { useUI } from '../context/UIContext';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

export function Select({ options, placeholder, ...props }) {
  return (
    <select className="input" {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const STATUS_STYLES = {
  PAID: 'bg-emerald-100 text-emerald-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  UNPAID: 'bg-rose-100 text-rose-700',
  PENDING: 'bg-amber-100 text-amber-700',
  HANDED_OVER: 'bg-emerald-100 text-emerald-700',
  NA: 'bg-slate-100 text-slate-600',
};
const STATUS_LABELS = { PAID: 'Paid', PARTIAL: 'Partially Paid', UNPAID: 'Unpaid', PENDING: 'Pending handover', HANDED_OVER: 'Handed over', NA: '—' };

export function StatusBadge({ status, label }) {
  return <span className={`chip ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600'}`}>{label || STATUS_LABELS[status] || status}</span>;
}

export function WaterBadge({ type }) {
  return type === 'SALT'
    ? <span className="chip bg-teal-50 text-teal-700 ring-1 ring-teal-200">Salt Water</span>
    : type === 'BOTH'
      ? <span className="chip bg-violet-50 text-violet-700 ring-1 ring-violet-200">Both</span>
      : <span className="chip bg-sky-50 text-sky-700 ring-1 ring-sky-200">Drinking Water</span>;
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin text-brand-600 ${className}`} />;
}

export function Loading({ text = 'Loading…' }) {
  return <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Spinner /> {text}</div>;
}

export function Empty({ text = 'No records found', action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-slate-500">
      <Inbox className="h-8 w-8 text-slate-300" />
      {text}
      {action}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'brand', sub, onClick }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600', sky: 'bg-sky-50 text-sky-600', teal: 'bg-teal-50 text-teal-600',
    green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', rose: 'bg-rose-50 text-rose-600',
    violet: 'bg-violet-50 text-violet-600', slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className={`card card-pad flex items-start gap-3 ${onClick ? 'cursor-pointer transition hover:border-brand-300 hover:shadow-md' : ''}`} onClick={onClick}>
      {Icon && <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></div>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 break-words text-base font-bold leading-tight text-slate-900 sm:text-xl">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

export function Pagination({ page, totalPages, count, onChange }) {
  if (!totalPages || totalPages <= 1) return count ? <div className="px-4 py-3 text-xs text-slate-500">{count} records</div> : null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm">
      <span className="text-xs text-slate-500">{count} records · page {page} of {totalPages}</span>
      <div className="flex gap-1">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft className="h-4 w-4" /></button>
        <button className="btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function ExportButtons({ url, params, name, formats = ['xlsx', 'pdf'] }) {
  const { toast } = useUI();
  const [busy, setBusy] = useState('');
  const run = async (fmt) => {
    setBusy(fmt);
    try {
      await download(url, { ...params, export: fmt }, `${name}.${fmt}`);
    } catch (e) {
      toast(errorMessage(e, 'Export failed'), 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      {formats.includes('xlsx') && (
        <button className="btn-secondary" onClick={() => run('xlsx')} disabled={!!busy}>
          {busy === 'xlsx' ? <Spinner className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-600" />} Excel
        </button>
      )}
      {formats.includes('pdf') && (
        <button className="btn-secondary" onClick={() => run('pdf')} disabled={!!busy}>
          {busy === 'pdf' ? <Spinner className="h-4 w-4" /> : <FileText className="h-4 w-4 text-rose-600" />} PDF
        </button>
      )}
    </>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <input className={`input ${className}`} type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

/** Searchable dropdown. options: [{ value, label, sub }] */
export default function Combobox({ options, value, onChange, placeholder = 'Select…', disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? options.filter((o) => `${o.label} ${o.sub || ''} ${o.search || ''}`.toLowerCase().includes(s)) : options;
    return list.slice(0, 100);
  }, [q, options]);

  return (
    <div className="relative" ref={ref}>
      <div className={`input flex items-center gap-2 ${disabled ? 'bg-slate-100' : 'cursor-text'}`} onClick={() => !disabled && setOpen(true)}>
        {open ? (
          <input autoFocus className="w-full bg-transparent outline-none" value={q} placeholder={selected?.label || placeholder}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); onChange(filtered[0].value); setOpen(false); setQ(''); }
              if (e.key === 'Escape') setOpen(false);
            }} />
        ) : (
          <span className={`flex-1 truncate ${selected ? '' : 'text-slate-400'}`}>{selected ? selected.label : placeholder}</span>
        )}
        {selected && !disabled && !open && (
          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={(e) => { e.stopPropagation(); onChange(''); }}><X className="h-4 w-4" /></button>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">No match</div>}
          {filtered.map((o) => (
            <button type="button" key={o.value}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-brand-50 ${String(o.value) === String(value) ? 'bg-brand-50 font-semibold' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); setQ(''); }}>
              <div className="truncate">{o.label}</div>
              {o.sub && <div className="truncate text-xs text-slate-500">{o.sub}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

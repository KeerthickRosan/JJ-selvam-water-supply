import { presetRange } from '../utils/format';

const PRESETS = [
  { key: 'today', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'last_month', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
];

/** value = { preset, from, to } */
export default function PeriodFilter({ value, onChange }) {
  const pick = (key) => {
    if (key === 'custom') onChange({ ...value, preset: 'custom' });
    else onChange({ preset: key, ...presetRange(key) });
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => pick(p.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${value.preset === p.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input type="date" className="input w-auto py-1.5" value={value.from} max={value.to}
          onChange={(e) => onChange({ ...value, preset: 'custom', from: e.target.value })} />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" className="input w-auto py-1.5" value={value.to} min={value.from}
          onChange={(e) => onChange({ ...value, preset: 'custom', to: e.target.value })} />
      </div>
    </div>
  );
}

export const initialPeriod = (preset = 'today') => ({ preset, ...presetRange(preset) });

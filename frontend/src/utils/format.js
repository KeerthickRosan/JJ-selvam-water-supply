export const money = (v) =>
  '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const moneyShort = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (Math.abs(n) >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

export const litres = (v) => Number(v || 0).toLocaleString('en-IN') + ' L';
export const num = (v) => Number(v || 0).toLocaleString('en-IN');

export const toISO = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const todayISO = () => toISO(new Date());
export const nowTime = () => new Date().toTimeString().slice(0, 5);

export const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const fmtDate = (s) =>
  s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtShort = (s) =>
  s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';

export const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hh = Number(h);
  return `${((hh + 11) % 12) + 1}:${m} ${hh >= 12 ? 'PM' : 'AM'}`;
};

export const fmtDateTime = (s) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Date ranges for daily / weekly / monthly reports. */
export function presetRange(preset) {
  const t = todayISO();
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: t, to: t };
    case 'yesterday':
      return { from: addDays(t, -1), to: addDays(t, -1) };
    case 'week':
      return { from: addDays(t, -6), to: t };
    case 'month':
      return { from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: t };
    case 'last_month':
      return {
        from: toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toISO(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    default:
      return { from: t, to: t };
  }
}

export const cleanParams = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined));

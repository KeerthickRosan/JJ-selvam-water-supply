import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errorMessage, fetchAll } from '../api/client';

export function useDebounce(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Load a GET endpoint; re-runs whenever `params` (serialised) change. */
export function useFetch(url, params = {}, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const key = JSON.stringify(params);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || !url) return;
    const my = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const r = await api.get(url, { params: JSON.parse(key) });
      if (my === seq.current) setData(r.data);
    } catch (e) {
      if (my === seq.current) setError(errorMessage(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [url, key, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}

/** Customers + drivers for dropdowns. */
export function useLookups({ activeOnly = false } = {}) {
  const [customers, setCustomers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const load = useCallback(async () => {
    const p = activeOnly ? { is_active: 'true' } : {};
    const [c, d] = await Promise.all([fetchAll('/customers/', p), fetchAll('/drivers/', p)]);
    setCustomers(c);
    setDrivers(d);
  }, [activeOnly]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  return { customers, drivers, reload: load };
}

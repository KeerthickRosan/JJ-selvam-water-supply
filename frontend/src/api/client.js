import axios from 'axios';

export const TOKEN_KEY = 'jj_token';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 60000 });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) cfg.headers.Authorization = `Token ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

const prettyKey = (k) => (k === 'non_field_errors' || k === 'detail' || k === 'duplicate' ? '' : `${k.replace(/_/g, ' ')}: `);

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err?.response) return err?.message === 'Network Error' ? 'Cannot reach the server. Check that the backend is running.' : err?.message || fallback;
  const d = err.response.data;
  if (!d || d instanceof Blob || typeof d === 'string') return err.response.status >= 500 ? 'Server error. Please try again.' : fallback;
  if (d.detail) return d.detail;
  if (Array.isArray(d)) return d.join(' ');
  return Object.entries(d)
    .map(([k, v]) => prettyKey(k) + (Array.isArray(v) ? v.join(' ') : typeof v === 'object' ? JSON.stringify(v) : v))
    .join(' • ');
}

export function fieldErrors(err) {
  const d = err?.response?.data;
  if (!d || typeof d !== 'object' || d instanceof Blob) return {};
  const out = {};
  Object.entries(d).forEach(([k, v]) => (out[k] = Array.isArray(v) ? v.join(' ') : String(v)));
  return out;
}

/** Download a file from an authenticated endpoint. */
export async function download(url, params, filename) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const cd = res.headers['content-disposition'] || '';
  const m = cd.match(/filename="?([^"]+)"?/);
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = m ? m[1] : filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Fetch every row of a list endpoint (for dropdowns). */
export async function fetchAll(url, params = {}) {
  const { data } = await api.get(url, { params: { page_size: 2000, ...params } });
  return data.results ?? data;
}

export default api;

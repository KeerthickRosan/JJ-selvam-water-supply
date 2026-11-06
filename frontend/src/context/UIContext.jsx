import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import Modal from '../components/Modal';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);

  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 7000 : 3500);
  }, []);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setDialog({ title: 'Are you sure?', confirmText: 'Confirm', danger: false, ...opts });
      }),
    [],
  );

  const close = (val) => {
    resolver.current?.(val);
    resolver.current = null;
    setDialog(null);
  };

  const icons = { success: CheckCircle2, error: XCircle, info: Info };
  const colors = { success: 'border-emerald-200 bg-emerald-50 text-emerald-800', error: 'border-rose-200 bg-rose-50 text-rose-800', info: 'border-brand-200 bg-brand-50 text-brand-800' };

  return (
    <UIContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-5">
        {toasts.map((t) => {
          const Icon = icons[t.type] || Info;
          return (
            <div key={t.id} className={`pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg ${colors[t.type]}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
      <Modal open={!!dialog} onClose={() => close(false)} title={dialog?.title} size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => close(false)}>Cancel</button>
          <button className={dialog?.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)} autoFocus>{dialog?.confirmText}</button>
        </>}>
        <div className="flex gap-3">
          {dialog?.danger && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100"><AlertTriangle className="h-5 w-5 text-rose-600" /></div>}
          <div className="text-sm text-slate-600">{dialog?.message}</div>
        </div>
      </Modal>
    </UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);

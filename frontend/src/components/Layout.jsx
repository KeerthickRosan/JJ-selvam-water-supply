import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle, BarChart3, BookOpen, BookText, Droplets, IndianRupee, LayoutDashboard, LogOut, Menu,
  Settings, Truck, UserCheck, Users, Wallet, X, ClipboardList,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/drivers', label: 'Drivers', icon: UserCheck },
  { to: '/deliveries', label: 'Water Deliveries', icon: Truck },
  { to: '/logbook', label: 'Daily Logbook', icon: BookOpen },
  { to: '/payments', label: 'Payments', icon: IndianRupee },
  { to: '/unpaid', label: 'Unpaid Customers', icon: AlertCircle },
  { to: '/pending', label: 'Pending Balances', icon: Wallet },
  { to: '/ledger', label: 'Customer Ledger', icon: BookText },
  { to: '/driver-reports', label: 'Driver Reports', icon: ClipboardList },
  { to: '/reports', label: 'Business Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Sidebar({ onNavigate }) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-brand-950 via-brand-900 to-brand-950 text-white">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
          <Droplets className="h-6 w-6 text-sky-300" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold">JJ Selvam</p>
          <p className="text-xs text-sky-200/80">Water Supply</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white text-brand-900 shadow' : 'text-sky-100/90 hover:bg-white/10 hover:text-white'}`}>
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 text-[11px] text-sky-200/60">© {new Date().getFullYear()} JJ Selvam Water Supply</div>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const current = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label || 'JJ Selvam Water Supply';

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            <button className="absolute right-3 top-5 z-10 text-white/80" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="icon-btn lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{current}</p>
            <p className="hidden text-xs text-slate-500 sm:block">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">{user?.first_name || user?.username}</p>
              <p className="text-xs text-slate-500">{user?.is_staff ? 'Administrator' : 'Staff'}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
              {(user?.first_name || user?.username || '?').slice(0, 1).toUpperCase()}
            </div>
            <button className="btn-ghost" onClick={doLogout} title="Logout"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Logout</span></button>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}

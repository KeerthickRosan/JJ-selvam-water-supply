import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import { useAuth } from './context/AuthContext';
import BusinessReports from './pages/BusinessReports';
import CustomerBalances from './pages/CustomerBalances';
import CustomerProfile from './pages/CustomerProfile';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Deliveries from './pages/Deliveries';
import DriverReports from './pages/DriverReports';
import Drivers from './pages/Drivers';
import Ledger from './pages/Ledger';
import Logbook from './pages/Logbook';
import Login from './pages/Login';
import Payments from './pages/Payments';
import Settings from './pages/Settings';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading text="Starting…" />;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerProfile />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="logbook" element={<Logbook />} />
        <Route path="payments" element={<Payments />} />
        <Route path="unpaid" element={<CustomerBalances key="unpaid" initialStatus="UNPAID" title="Unpaid Customers" />} />
        <Route path="pending" element={<CustomerBalances key="pending" initialStatus="PENDING" title="Pending Balances" />} />
        <Route path="ledger" element={<Ledger />} />
        <Route path="driver-reports" element={<DriverReports />} />
        <Route path="reports" element={<BusinessReports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

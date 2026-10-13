import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from '@/lib/auth';
import { StoreProvider } from '@/lib/store';
import AppLayout from '@/layouts/AppLayout';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Inventory from '@/pages/Inventory';
import Issues from '@/pages/Issues';
import Renewals from '@/pages/Renewals';
import MyItems from '@/pages/MyItems';
import History from '@/pages/History';

function Routed() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 font-display text-2xl uppercase">Loading…</div>;
  if (!user) return <Login />;

  const isCoordinator = user.role === 'COORDINATOR';
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={isCoordinator ? <Dashboard /> : <MyItems />} />
        {isCoordinator ? (
          <>
            <Route path="inventory" element={<Inventory />} />
            <Route path="issues" element={<Issues />} />
            <Route path="renewals" element={<Renewals />} />
          </>
        ) : (
          <Route path="history" element={<History />} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <BrowserRouter><Routed /></BrowserRouter>
      </StoreProvider>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}

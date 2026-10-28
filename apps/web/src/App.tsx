import { Center, Loader } from '@mantine/core';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { useSession } from './lib/session';
import { getStation } from './lib/station';
import { AdminPage } from './pages/admin/AdminPage';
import { LineDashboard } from './pages/line/LineDashboard';
import { Login } from './pages/Login';
import { PersonPage } from './pages/people/PersonPage';
import { QualityPage } from './pages/quality/QualityPage';
import { RepairHome } from './pages/repair/RepairHome';
import { TicketPage } from './pages/repair/TicketPage';
import { StationSetup } from './pages/StationSetup';
import { UnitPage } from './pages/units/UnitPage';
import { UnitsPage } from './pages/units/UnitsPage';

function Home() {
  const { can } = useSession();
  const station = getStation();
  // Open the interface that matches this PC, if the person is allowed to use it.
  if (station?.type === 'quality' && can('test')) return <Navigate to="/quality" replace />;
  if (station?.type === 'repair' && can('repair')) return <Navigate to="/repair" replace />;
  if (can('test') && !can('repair')) return <Navigate to="/quality" replace />;
  if (can('repair')) return <Navigate to="/repair" replace />;
  return <Navigate to="/units" replace />;
}

function Protected({ children }: { children: ReactNode }) {
  const { user, ready } = useSession();
  if (!ready)
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  if (!getStation()) return <Navigate to="/setup" replace />;
  if (getStation()?.type === 'display' && !user) return <Navigate to="/line" replace />;
  if (!user) return <Login />;
  return <AppLayout>{children}</AppLayout>;
}

function Gate({ allow, children }: { allow: boolean; children: ReactNode }) {
  return allow ? <>{children}</> : <Navigate to="/" replace />;
}

export function App() {
  const { can } = useSession();
  return (
    <Routes>
      <Route path="/setup" element={<StationSetup />} />
      <Route path="/line" element={<LineDashboard />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/quality" element={<Protected><Gate allow={can('test')}><QualityPage /></Gate></Protected>} />
      <Route path="/repair" element={<Protected><Gate allow={can('repair')}><RepairHome /></Gate></Protected>} />
      <Route path="/repair/ticket/:id" element={<Protected><TicketPage /></Protected>} />
      <Route path="/units" element={<Protected><UnitsPage /></Protected>} />
      <Route path="/units/:serial" element={<Protected><UnitPage /></Protected>} />
      <Route path="/people/:id" element={<Protected><PersonPage /></Protected>} />
      <Route path="/admin" element={<Protected><Gate allow={can('admin')}><AdminPage /></Gate></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

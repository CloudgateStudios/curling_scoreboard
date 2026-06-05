import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { ClubAdminDashboard } from './pages/ClubAdminDashboard';
import { ClubDetail } from './pages/ClubDetail';
import { GameHistory } from './pages/GameHistory';
import { Layout } from './components/Layout';

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <span style={{ color: '#666', fontSize: '0.9rem' }}>Loading…</span>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (user.role === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: '#d93025' }}>Your account has not been assigned to a club. Contact your administrator.</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Layout user={user}>
        <Routes>
          {user.role === 'superadmin' ? (
            <>
              <Route path="/" element={<SuperAdminDashboard />} />
              <Route path="/clubs/:clubId" element={<ClubDetail />} />
              <Route path="/clubs/:clubId/sheets/:sheetId/games" element={<GameHistory />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<ClubAdminDashboard user={user} />} />
              <Route path="/sheets/:sheetId/games" element={<GameHistory />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

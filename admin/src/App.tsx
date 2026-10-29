import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { ClubAdminDashboard } from './pages/ClubAdminDashboard';
import { ClubDetail } from './pages/ClubDetail';
import { GameHistory } from './pages/GameHistory';
import { LeagueDetail } from './pages/LeagueDetail';
import { BonspielDetail } from './pages/BonspielDetail';
import { Help } from './pages/Help';
import { Layout } from './components/Layout';

export function App() {
  const { user, loading } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* The guides need no sign-in. */}
        <Route path="/help/:guide?" element={<Layout user={user}><Help /></Layout>} />
        <Route path="*" element={<Portal user={user} loading={loading} />} />
      </Routes>
    </BrowserRouter>
  );
}

function Portal({ user, loading }: ReturnType<typeof useAuth>) {
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
    <Layout user={user}>
      <Routes>
        {user.role === 'superadmin' ? (
          <>
            <Route path="/" element={<SuperAdminDashboard />} />
            <Route path="/clubs/:clubId" element={<ClubDetail />} />
            <Route path="/clubs/:clubId/sheets/:sheetId/games" element={<GameHistory />} />
            <Route path="/clubs/:clubId/leagues/:leagueId" element={<LeagueDetail user={user} />} />
            <Route path="/clubs/:clubId/bonspiels/:bonspielId" element={<BonspielDetail user={user} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<ClubAdminDashboard user={user} />} />
            <Route path="/sheets/:sheetId/games" element={<GameHistory />} />
            {user.role === 'clubadmin' && (
              <Route path="/leagues/:leagueId" element={<LeagueDetail user={user} />} />
            )}
            <Route path="/bonspiels/:bonspielId" element={<BonspielDetail user={user} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </Layout>
  );
}

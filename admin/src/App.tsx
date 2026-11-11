import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { ServiceControls } from './pages/ServiceControls';
import { NewClub } from './pages/NewClub';
import { SystemDataProvider } from './hooks/useSystemData';
import { ClubWorkspace } from './pages/ClubWorkspace';
import { Help } from './pages/Help';
import { Layout } from './components/Layout';
import { bonspielPath, clubPath, landingSection, leaguePath, sectionFromOldQuery, sheetGamesPath } from './lib/clubPaths';
import type { AuthUser } from './types';

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
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading…</span>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (user.role === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--bad)' }}>Your account has not been assigned to a club. Contact your administrator.</p>
      </div>
    );
  }

  // Every role uses the same club paths. Super admins open on every club;
  // everyone else opens on their own.
  const portal = (
    <Layout user={user}>
      <Routes>
        {user.role === 'superadmin' ? (
          <>
            <Route path="/" element={<SuperAdminDashboard />} />
            <Route path="/service" element={<ServiceControls />} />
            <Route path="/new-club" element={<NewClub />} />
          </>
        ) : (
          <Route path="/" element={<OwnClub user={user} />} />
        )}
        <Route path="/clubs/:clubId/*" element={<ClubRoute user={user} />} />
        {/* Club admin paths from before every role shared the club paths. */}
        <Route path="/sheets/:sheetId/games" element={<OldPath user={user} to={(c, id) => sheetGamesPath(c, id)} />} />
        <Route path="/leagues/:id" element={<OldPath user={user} to={(c, id) => leaguePath(c, id)} />} />
        <Route path="/bonspiels/:id" element={<OldPath user={user} to={(c, id) => bonspielPath(c, id)} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
  // Super admins share one set of listeners over every club.
  return user.role === 'superadmin' ? <SystemDataProvider>{portal}</SystemDataProvider> : portal;
}

/** A club admin's or bonspiel admin's `/`: their club, on the section an old
 *  `?tab=` link named, or on the one their role starts on. */
function OwnClub({ user }: { user: AuthUser }) {
  const { search } = useLocation();
  if (!user.clubId) return <Navigate to="/help" replace />;
  const section = sectionFromOldQuery(search) ?? landingSection(user.role);
  return <Navigate to={clubPath(user.clubId, section)} replace />;
}

/** A club's pages, for super admins any club and for everyone else their own. */
function ClubRoute({ user }: { user: AuthUser }) {
  const { clubId } = useParams<{ clubId: string }>();
  if (!clubId) return <Navigate to="/" replace />;
  if (user.role !== 'superadmin' && clubId !== user.clubId) return <Navigate to="/" replace />;
  // Keyed so moving between clubs starts every section afresh.
  return <ClubWorkspace key={clubId} clubId={clubId} user={user} />;
}

function OldPath({ user, to }: { user: AuthUser; to: (clubId: string, id: string) => string }) {
  const { sheetId, id } = useParams<{ sheetId?: string; id?: string }>();
  const { search } = useLocation();
  if (!user.clubId) return <Navigate to="/" replace />;
  return <Navigate to={to(user.clubId, (sheetId ?? id)!) + search} replace />;
}

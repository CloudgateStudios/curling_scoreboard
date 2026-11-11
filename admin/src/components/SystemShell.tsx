import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSystemData } from '../hooks/useSystemData';
import { clubPath } from '../lib/clubPaths';
import { recentClubIds } from '../lib/recentClubs';
import sidebar from './club/ClubSidebar.module.css';
import workspace from '../pages/ClubWorkspace.module.css';

const PAGES = [
  { path: '/', label: 'Overview' },
  { path: '/service', label: 'Service controls' },
] as const;

/** The super admin's own pages, across every club, with a sidebar like a
 *  club's: the pages, then the clubs opened last. */
export function SystemShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const system = useSystemData();
  // The page the phone menu was opened on, so opening another page closes it.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const open = menuOpenOn === pathname;
  const close = useCallback(() => setMenuOpenOn(null), []);
  const [recent] = useState(recentClubIds);
  const recentClubs = recent
    .map((id) => system?.clubs?.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const current = PAGES.find((p) => p.path === pathname);
  const off = system?.switchesOff.length ?? 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <div className={workspace.workspace}>
      {open && <button type="button" className={sidebar.backdrop} aria-label="Close menu" onClick={close} />}
      <nav className={open ? sidebar.sidebarOpen : sidebar.sidebar} aria-label="Every club">
        <div className={sidebar.club}>
          <span className={sidebar.clubName}>Every club</span>
          <span className={sidebar.clubId}>super admin</span>
        </div>
        <div className={sidebar.group}>
          {PAGES.map((p) => (
            <Link
              key={p.path}
              to={p.path}
              aria-current={current?.path === p.path ? 'page' : undefined}
              className={current?.path === p.path ? sidebar.linkSelected : sidebar.link}
            >
              {p.label}
              {p.path === '/service' && off > 0 && <span className={sidebar.countAlert}>{off} off</span>}
            </Link>
          ))}
        </div>
        {recentClubs.length > 0 && (
          <div className={sidebar.group}>
            <span className={sidebar.groupLabel}>Opened lately</span>
            {recentClubs.map((club) => (
              <Link key={club.id} to={clubPath(club.id)} className={sidebar.link}>{club.name}</Link>
            ))}
          </div>
        )}
      </nav>

      <div className={workspace.content}>
        <button type="button" className={workspace.menuBar} aria-expanded={open} onClick={() => setMenuOpenOn(pathname)}>
          <span className={workspace.menuIcon} aria-hidden="true">☰</span>
          <span className={workspace.menuClub}>Every club</span>
          {current && <span className={workspace.menuSection}>{current.label}</span>}
        </button>
        {children}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { compareLeagues, leagueFrom } from '../lib/leagues';
import { bonspielFrom, today } from '../lib/bonspiels';
import { bonspielToOpen } from '../lib/clubNow';
import { bonspielPath, clubPath, landingSection, leaguePath, sectionFromOldQuery, sheetGamesPath, type ClubSection } from '../lib/clubPaths';
import { confirmLeave } from '../lib/unsavedChanges';
import { guideFor } from '../lib/guides';
import type { AuthUser, Bonspiel, Club, League, Sheet } from '../types';
import { ClubSidebar } from '../components/club/ClubSidebar';
import { sectionOfPath, sectionsFor, type SectionInfo } from '../components/club/sections';
import { RecentGames } from '../components/club/RecentGames';
import { ClubOverview } from '../components/club/ClubOverview';
import { DevicesSection } from '../components/club/DevicesSection';
import { rememberClub } from '../lib/recentClubs';
import { ApiKeySection } from '../components/club/ApiKeySection';
import { LeaguesSection } from '../components/club/LeaguesSection';
import { RockColorsSection } from '../components/club/RockColorsSection';
import { ScoreboardPinSection } from '../components/club/ScoreboardPinSection';
import { StreamsSection } from '../components/club/StreamsSection';
import { TimeZoneSection } from '../components/club/TimeZoneSection';
import { WebhookSection } from '../components/club/WebhookSection';
import { DisplaysSection } from '../components/club/DisplaysSection';
import { DisplayBrandingSection } from '../components/club/DisplayBrandingSection';
import { PublicScoresSection } from '../components/club/PublicScoresSection';
import { AdminsSection } from '../components/club/AdminsSection';
import { SheetsSection } from '../components/club/SheetsSection';
import { BonspielsSection } from '../components/club/BonspielsSection';
import { ClubNameSection } from '../components/club/ClubNameSection';
import { GameHistory } from './GameHistory';
import { LeagueDetail } from './LeagueDetail';
import { BonspielDetail } from './BonspielDetail';
import common from '../styles/common.module.css';
import styles from './ClubWorkspace.module.css';

interface Props {
  clubId: string;
  user: AuthUser;
}

/** Everything in one club, the same for every role at the same paths: a
 *  sidebar of the club's pages beside the one open. What a role cannot use
 *  is left out of the sidebar and not mounted. */
export function ClubWorkspace({ clubId, user }: Props) {
  const realRole = user.role ?? 'clubadmin';
  // A super admin can see the club as its own admins do. It changes what is
  // shown, never what they can do or what is saved.
  const [viewAs, setViewAs] = useState<ViewAs>('superadmin');
  const role = realRole === 'superadmin' ? viewAs : realRole;
  const isBonspielAdmin = role === 'bonspieladmin';
  const sections = sectionsFor(role);
  // The path after /clubs/:clubId/, such as "leagues" or "leagues/abc".
  const rest = useParams()['*'] ?? '';
  const current = sectionOfPath(rest, sections);
  const onSectionPage = current?.id === rest;
  const { pathname } = useLocation();

  const [club, setClub] = useState<Club | null>(null);
  const [missing, setMissing] = useState(false);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [bonspiels, setBonspiels] = useState<Bonspiel[] | null>(null);
  // Reported by the Displays page, which holds the list, for its count.
  const [displayLinkCount, setDisplayLinkCount] = useState<number | undefined>(undefined);
  // The page the phone menu was opened on, so opening another page closes it.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === pathname;
  const closeMenu = useCallback(() => setMenuOpenOn(null), []);

  // For the super admin's list of clubs opened lately.
  useEffect(() => {
    if (realRole === 'superadmin') rememberClub(clubId);
  }, [clubId, realRole]);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'clubs', clubId),
      (snap) => {
        if (snap.exists()) setClub({ id: snap.id, ...(snap.data() as Omit<Club, 'id'>) });
        else setMissing(true);
      },
      () => setMissing(true),
    );
  }, [clubId]);

  // Here rather than in each page so the sidebar can show the counts.
  useEffect(() => {
    return onSnapshot(collection(db, 'clubs', clubId, 'sheets'), (snap) => {
      setSheets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Sheet, 'id'>) })));
    });
  }, [clubId]);

  // Bonspiel admins have no access to leagues.
  useEffect(() => {
    if (isBonspielAdmin) return;
    return onSnapshot(collection(db, 'clubs', clubId, 'leagues'), (snap) => {
      setLeagues(snap.docs.map((d) => leagueFrom(d.id, d.data())).sort(compareLeagues));
    });
  }, [clubId, isBonspielAdmin]);

  // Newest first. The club waits for them, so a bonspiel admin can open on
  // the one on now; one that cannot be read leaves the list empty.
  useEffect(() => {
    return onSnapshot(
      collection(db, 'clubs', clubId, 'bonspiels'),
      (snap) => {
        setBonspiels(
          snap.docs
            .map((d) => bonspielFrom(d.id, d.data()))
            .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name)),
        );
      },
      () => setBonspiels([]),
    );
  }, [clubId]);

  if (missing) return <p className={common.error}>Club not found. Contact your administrator.</p>;
  if (!club || !bonspiels) return <p className={styles.loading}>Loading…</p>;

  const counts: Partial<Record<ClubSection, number>> = {
    sheets: sheets.length,
    leagues: leagues.length,
    bonspiels: bonspiels.length,
    displays: displayLinkCount,
  };

  return (
    <div className={styles.workspace}>
      <ClubSidebar
        club={club}
        sections={sections}
        current={current?.id}
        counts={counts}
        showAllClubs={realRole === 'superadmin'}
        onDetailPage={!onSectionPage}
        open={menuOpen}
        onClose={closeMenu}
      />

      <div className={styles.content}>
        {realRole === 'superadmin' && <ViewAsBar viewAs={viewAs} onChange={setViewAs} clubName={club.name} />}
        {/* Phones: the sidebar is a menu opened from here. */}
        <button type="button" className={styles.menuBar} aria-expanded={menuOpen} onClick={() => setMenuOpenOn(pathname)}>
          <span className={styles.menuIcon} aria-hidden="true">☰</span>
          <span className={styles.menuClub}>{club.name}</span>
          {current && <span className={styles.menuSection}>{current.label}</span>}
        </button>

        <Routes>
          <Route index element={<ClubIndex clubId={clubId} role={role} bonspiels={bonspiels} />} />
          <Route path="sheets/:sheetId/games" element={<GameHistory clubId={clubId} />} />
          {!isBonspielAdmin && <Route path="leagues/:leagueId" element={<LeagueDetail clubId={clubId} />} />}
          <Route path="bonspiels/:bonspielId" element={<BonspielDetail clubId={clubId} />} />
          <Route path="settings" element={<Navigate to={clubPath(clubId, 'settings/club')} replace />} />
          <Route
            path="*"
            element={
              current && onSectionPage ? (
                <ClubSections
                  club={club}
                  role={role}
                  section={current}
                  sheets={sheets}
                  leagues={leagues}
                  bonspiels={bonspiels}
                  onDisplayCount={setDisplayLinkCount}
                />
              ) : (
                <Navigate to={clubPath(clubId, landingSection(role))} replace />
              )
            }
          />
        </Routes>
      </div>
    </div>
  );
}

type ViewAs = 'superadmin' | 'clubadmin' | 'bonspieladmin';

const VIEW_AS: { id: ViewAs; label: string }[] = [
  { id: 'superadmin', label: 'Super admin' },
  { id: 'clubadmin', label: 'Club admin' },
  { id: 'bonspieladmin', label: 'Bonspiel admin' },
];

/** Says a super admin is in someone else's club, and lets them see it as
 *  the club's admins do. */
function ViewAsBar({ viewAs, onChange, clubName }: { viewAs: ViewAs; onChange: (v: ViewAs) => void; clubName: string }) {
  return (
    <div className={styles.viewAs}>
      <span className={styles.viewAsText}>
        {viewAs === 'superadmin'
          ? <>You are in {clubName} as a super admin. Purple is hidden from the club's own admins.</>
          : <>Showing {clubName} as a {viewAs === 'clubadmin' ? 'club' : 'bonspiel'} admin sees it. What you do still counts as you.</>}
      </span>
      <span className={styles.viewAsChoice} role="group" aria-label="See it as">
        <span className={styles.viewAsLabel}>See it as</span>
        {VIEW_AS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={viewAs === v.id}
            className={viewAs === v.id ? styles.viewAsOn : styles.viewAsOff}
            onClick={() => onChange(v.id)}
          >
            {v.label}
          </button>
        ))}
      </span>
    </div>
  );
}

/** The club's own address opens the role's first page, or the one an old
 *  `?tab=` link named. Bonspiel admins go straight to the bonspiel on now,
 *  or the next one; bonspiel dates are the club's, and the browser's date
 *  stands in for them, as bonspiel admins cannot read the club's zone. */
function ClubIndex({ clubId, role, bonspiels }: { clubId: string; role: string; bonspiels: Bonspiel[] }) {
  const { search } = useLocation();
  const old = sectionFromOldQuery(search);
  if (old) return <Navigate to={clubPath(clubId, old)} replace />;
  const bonspiel = role === 'bonspieladmin' ? bonspielToOpen(bonspiels, today()) : null;
  if (bonspiel) return <Navigate to={bonspielPath(clubId, bonspiel.id)} replace />;
  return <Navigate to={clubPath(clubId, landingSection(role))} replace />;
}

interface SectionsProps {
  club: Club;
  role: 'superadmin' | 'clubadmin' | 'bonspieladmin';
  section: SectionInfo;
  sheets: Sheet[];
  leagues: League[];
  bonspiels: Bonspiel[];
  onDisplayCount: (count: number) => void;
}

/** The club's pages. Every one stays mounted and the others are hidden, so a
 *  half-made change (rock colors, a new sheet) survives moving between them. */
function ClubSections({ club, role, section, sheets, leagues, bonspiels, onDisplayCount }: SectionsProps) {
  const navigate = useNavigate();
  const isSuperAdmin = role === 'superadmin';
  const isBonspielAdmin = role === 'bonspieladmin';
  const clubId = club.id;
  // Connecting a scoreboard is done in Settings, which bonspiel admins
  // cannot open, so their sheets page has no guide.
  const guide = section.guide && !(isBonspielAdmin && section.id === 'sheets') ? guideFor(section.guide) : undefined;
  const shown = (id: ClubSection) => section.id === id;

  function open(path: string) {
    if (confirmLeave()) navigate(path);
  }

  // Every page stays mounted, so moving between them loses nothing.
  const openSection = (next: ClubSection) => navigate(clubPath(clubId, next));

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={common.title}>{section.title}</h1>
        {guide && (
          <a className={styles.guideLink} href={guide.path} target="_blank" rel="noopener">
            Guide: {guide.title}
          </a>
        )}
      </div>

      <div hidden={!shown('sheets')}>
        <SheetsSection
          clubId={clubId}
          sheets={sheets}
          canManageSheets={isSuperAdmin}
          readOnly={isBonspielAdmin}
          onViewGames={(sheetId) => open(sheetGamesPath(clubId, sheetId))}
        />
      </div>

      <div hidden={!shown('games')} className={styles.columns}>
        <RecentGames clubId={clubId} clubName={club.name} sheets={sheets} />
        <div className={common.section}>
          <h2 className={common.sectionTitle}>Each sheet's games</h2>
          <p className={common.blurb}>Every game a sheet has finished, fifty at a time, with a CSV export.</p>
          <div className={styles.sheetLinks}>
            {[...sheets].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((sheet) => (
              <button key={sheet.id} className={common.ghostButton} onClick={() => open(sheetGamesPath(clubId, sheet.id))}>
                {sheet.name}
              </button>
            ))}
            {sheets.length === 0 && <p className={common.empty}>No sheets yet.</p>}
          </div>
        </div>
      </div>

      <div hidden={!shown('bonspiels')}>
        <BonspielsSection clubId={clubId} bonspiels={bonspiels} onOpenBonspiel={(id) => open(bonspielPath(clubId, id))} />
      </div>

      {/* The rest is not mounted at all for bonspiel admins, whom the rules
          keep from reading it. */}
      {!isBonspielAdmin && (
        <>
          <div hidden={!shown('overview')}>
            <ClubOverview
              club={club}
              sheets={sheets}
              leagues={leagues}
              bonspiels={bonspiels}
              onOpen={open}
              onSection={openSection}
            />
          </div>

          <div hidden={!shown('leagues')}>
            <LeaguesSection clubId={clubId} leagues={leagues} sheets={sheets} onOpenLeague={(id) => open(leaguePath(clubId, id))} />
          </div>

          <div hidden={!shown('displays')} className={styles.columns}>
            <DisplaysSection clubId={clubId} sheets={sheets} bonspiels={bonspiels} onCount={onDisplayCount} />
            <DisplayBrandingSection clubId={clubId} clubName={club.name} />
          </div>

          <div hidden={!shown('devices')}>
            <DevicesSection club={club} sheets={sheets} />
          </div>

          <div hidden={!shown('settings/club')} className={styles.narrow}>
            <ClubNameSection club={club} canRename={isSuperAdmin} />
            <TimeZoneSection clubId={clubId} />
            {/* Super admins manage these under Users. */}
            {!isSuperAdmin && <AdminsSection clubId={clubId} clubName={club.name} readOnly />}
          </div>

          <div hidden={!shown('settings/scoreboards')} className={styles.narrow}>
            <RockColorsSection clubId={clubId} />
            <ScoreboardPinSection clubId={clubId} />
          </div>

          <div hidden={!shown('settings/public-page')} className={styles.narrow}>
            <PublicScoresSection clubId={clubId} />
          </div>

          <div hidden={!shown('settings/integrations')} className={styles.narrow}>
            <ApiKeySection clubId={clubId} canRegenerate={isSuperAdmin} />
            <WebhookSection clubId={clubId} />
            <StreamsSection clubId={clubId} />
          </div>

          {isSuperAdmin && (
            <div hidden={!shown('users')} className={styles.narrow}>
              <AdminsSection clubId={clubId} clubName={club.name} />
            </div>
          )}
        </>
      )}
    </>
  );
}

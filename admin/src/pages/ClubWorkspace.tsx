import { useCallback, useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { compareLeagues, leagueFrom } from '../lib/leagues';
import { bonspielFrom } from '../lib/bonspiels';
import { bonspielPath, clubPath, landingSection, leaguePath, sectionFromOldQuery, sheetGamesPath, type ClubSection } from '../lib/clubPaths';
import { confirmLeave } from '../lib/unsavedChanges';
import { guideFor } from '../lib/guides';
import type { AuthUser, Bonspiel, Club, League, Sheet } from '../types';
import { ClubSidebar } from '../components/club/ClubSidebar';
import { sectionOfPath, sectionsFor, type SectionInfo } from '../components/club/sections';
import { RecentGames } from '../components/club/RecentGames';
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
  const role = user.role ?? 'clubadmin';
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
  const [bonspiels, setBonspiels] = useState<Bonspiel[]>([]);
  // Reported by the Displays page, which holds the list, for its count.
  const [displayLinkCount, setDisplayLinkCount] = useState<number | undefined>(undefined);
  // The page the phone menu was opened on, so opening another page closes it.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === pathname;
  const closeMenu = useCallback(() => setMenuOpenOn(null), []);

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

  // Newest first.
  useEffect(() => {
    return onSnapshot(collection(db, 'clubs', clubId, 'bonspiels'), (snap) => {
      setBonspiels(
        snap.docs
          .map((d) => bonspielFrom(d.id, d.data()))
          .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name)),
      );
    });
  }, [clubId]);

  if (missing) return <p className={common.error}>Club not found. Contact your administrator.</p>;
  if (!club) return <p className={styles.loading}>Loading…</p>;

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
        showAllClubs={role === 'superadmin'}
        onDetailPage={!onSectionPage}
        open={menuOpen}
        onClose={closeMenu}
      />

      <div className={styles.content}>
        {/* Phones: the sidebar is a menu opened from here. */}
        <button type="button" className={styles.menuBar} aria-expanded={menuOpen} onClick={() => setMenuOpenOn(pathname)}>
          <span className={styles.menuIcon} aria-hidden="true">☰</span>
          <span className={styles.menuClub}>{club.name}</span>
          {current && <span className={styles.menuSection}>{current.label}</span>}
        </button>

        <Routes>
          <Route index element={<ClubIndex clubId={clubId} role={role} />} />
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

/** The club's own address opens the role's first page, or the one an old
 *  `?tab=` link named. */
function ClubIndex({ clubId, role }: { clubId: string; role: string }) {
  const { search } = useLocation();
  return <Navigate to={clubPath(clubId, sectionFromOldQuery(search) ?? landingSection(role))} replace />;
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

      <div hidden={!shown('sheets')} className={styles.columns}>
        <SheetsSection
          clubId={clubId}
          sheets={sheets}
          canManageSheets={isSuperAdmin}
          readOnly={isBonspielAdmin}
          onViewGames={(sheetId) => open(sheetGamesPath(clubId, sheetId))}
        />
        <RecentGames clubId={clubId} clubName={club.name} sheets={sheets} />
      </div>

      <div hidden={!shown('bonspiels')}>
        <BonspielsSection clubId={clubId} bonspiels={bonspiels} onOpenBonspiel={(id) => open(bonspielPath(clubId, id))} />
      </div>

      {/* The rest is not mounted at all for bonspiel admins, whom the rules
          keep from reading it. */}
      {!isBonspielAdmin && (
        <>
          <div hidden={!shown('leagues')}>
            <LeaguesSection clubId={clubId} leagues={leagues} sheets={sheets} onOpenLeague={(id) => open(leaguePath(clubId, id))} />
          </div>

          <div hidden={!shown('displays')} className={styles.columns}>
            <DisplaysSection clubId={clubId} sheets={sheets} bonspiels={bonspiels} onCount={onDisplayCount} />
            <DisplayBrandingSection clubId={clubId} clubName={club.name} />
          </div>

          <div hidden={!shown('settings/club')} className={styles.narrow}>
            <ClubNameSection club={club} canRename={isSuperAdmin} />
            <TimeZoneSection clubId={clubId} />
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

import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { compareLeagues, leagueFrom } from '../lib/leagues';
import { bonspielFrom } from '../lib/bonspiels';
import { confirmLeave } from '../lib/unsavedChanges';
import { guideFor } from '../lib/guides';
import type { Bonspiel, Club, League, Sheet, UserRole } from '../types';
import { RecentGames } from '../components/club/RecentGames';
import { ApiKeySection } from '../components/club/ApiKeySection';
import { LeaguesSection } from '../components/club/LeaguesSection';
import { RockColorsSection } from '../components/club/RockColorsSection';
import { ScoreboardPinSection } from '../components/club/ScoreboardPinSection';
import { WebhookSection } from '../components/club/WebhookSection';
import { DisplaysSection } from '../components/club/DisplaysSection';
import { DisplayBrandingSection } from '../components/club/DisplayBrandingSection';
import { PublicScoresSection } from '../components/club/PublicScoresSection';
import { AdminsSection } from '../components/club/AdminsSection';
import { SheetsSection } from '../components/club/SheetsSection';
import { BonspielsSection } from '../components/club/BonspielsSection';
import { ClubHeader } from '../components/club/ClubHeader';
import common from '../styles/common.module.css';
import styles from './ClubDetail.module.css';

// Bonspiel admins only get the sheets, read only, and the bonspiels. Each
// tab links to the guide in docs/guides for it.
const TABS = [
  { id: 'sheets', label: 'Sheets & Games', bonspielAdmin: true, guide: 'connect-a-scoreboard' },
  { id: 'leagues', label: 'Leagues', bonspielAdmin: false, guide: 'set-up-leagues' },
  { id: 'bonspiels', label: 'Bonspiels', bonspielAdmin: true, guide: 'run-a-bonspiel' },
  { id: 'displays', label: 'Displays', bonspielAdmin: false, guide: 'set-up-a-display' },
  { id: 'settings', label: 'Settings', bonspielAdmin: false, guide: null },
] as const;

type Tab = (typeof TABS)[number]['id'];

// The Settings tab shows one group at a time, so each fits on a screen.
const SETTINGS_GROUPS = [
  { id: 'scoreboards', label: 'Scoreboards', superAdminOnly: false, guide: 'connect-a-scoreboard' },
  { id: 'integrations', label: 'Integrations', superAdminOnly: false, guide: 'post-results-to-chat' },
  { id: 'admins', label: 'Users', superAdminOnly: true, guide: null },
] as const;

type SettingsGroup = (typeof SETTINGS_GROUPS)[number]['id'];

interface Props {
  // Optional: club admin dashboard passes the club directly to avoid an extra fetch
  club?: Club;
  /** Who is looking: super admins see everything, and come here by URL. */
  role?: Exclude<UserRole, null>;
}

export function ClubDetail({ club: clubProp, role = 'superadmin' }: Props) {
  const isSuperAdmin = role === 'superadmin';
  const isBonspielAdmin = role === 'bonspieladmin';
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  // The tab lives in the URL so going back from a league or a sheet's games
  // lands on the tab it was opened from.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = TABS.filter((t) => t.bonspielAdmin || !isBonspielAdmin);
  const tab: Tab = tabs.find((t) => t.id === searchParams.get('tab'))?.id ?? 'sheets';
  const settingsGroups = SETTINGS_GROUPS.filter((g) => !g.superAdminOnly || isSuperAdmin);
  const settingsGroup: SettingsGroup =
    settingsGroups.find((g) => g.id === searchParams.get('section'))?.id ?? 'scoreboards';
  // Connecting a scoreboard is done in Settings, which bonspiel admins
  // cannot open, so their sheets tab has no guide.
  const guideSlug = tab === 'settings'
    ? SETTINGS_GROUPS.find((g) => g.id === settingsGroup)?.guide
    : isBonspielAdmin && tab === 'sheets' ? null : TABS.find((t) => t.id === tab)?.guide;
  const guide = guideSlug ? guideFor(guideSlug) : undefined;

  const [fetchedClub, setFetchedClub] = useState<Club | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [bonspiels, setBonspiels] = useState<Bonspiel[]>([]);
  // Reported by the Displays tab, which holds the list, for the tab's count.
  const [displayLinkCount, setDisplayLinkCount] = useState(0);

  const resolvedClubId = clubProp?.id ?? clubId!;
  const club = clubProp ?? fetchedClub;

  // Only fetch club doc when we don't have it passed in (super admin navigating by URL)
  useEffect(() => {
    if (clubProp) return;
    return onSnapshot(doc(db, 'clubs', resolvedClubId), (snap) => {
      if (snap.exists()) {
        setFetchedClub({ id: snap.id, ...(snap.data() as Omit<Club, 'id'>) });
      }
    });
  }, [resolvedClubId, clubProp]);

  // Shared by the sheet list and recent games.
  useEffect(() => {
    return onSnapshot(collection(db, 'clubs', resolvedClubId, 'sheets'), (snap) => {
      setSheets(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Sheet, 'id'>) }))
      );
    });
  }, [resolvedClubId]);

  // Here rather than in the Leagues tab so the tab can show the count.
  // Bonspiel admins have no access to leagues.
  useEffect(() => {
    if (isBonspielAdmin) return;
    return onSnapshot(collection(db, 'clubs', resolvedClubId, 'leagues'), (snap) => {
      setLeagues(
        snap.docs.map((d) => leagueFrom(d.id, d.data())).sort(compareLeagues),
      );
    });
  }, [resolvedClubId, isBonspielAdmin]);

  // Here for the same reason, newest first.
  useEffect(() => {
    return onSnapshot(collection(db, 'clubs', resolvedClubId, 'bonspiels'), (snap) => {
      setBonspiels(
        snap.docs
          .map((d) => bonspielFrom(d.id, d.data()))
          .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name)),
      );
    });
  }, [resolvedClubId]);

  function handleViewGames(sheetId: string) {
    if (!confirmLeave()) return;
    // Club admins don't have /clubs/:clubId in their routes
    if (clubProp) {
      navigate(`/sheets/${sheetId}/games`);
    } else {
      navigate(`/clubs/${resolvedClubId}/sheets/${sheetId}/games`);
    }
  }

  function handleOpenLeague(leagueId: string) {
    if (!confirmLeave()) return;
    navigate(clubProp ? `/leagues/${leagueId}` : `/clubs/${resolvedClubId}/leagues/${leagueId}`);
  }

  function handleOpenBonspiel(bonspielId: string) {
    if (!confirmLeave()) return;
    navigate(clubProp ? `/bonspiels/${bonspielId}` : `/clubs/${resolvedClubId}/bonspiels/${bonspielId}`);
  }

  function selectTab(next: Tab) {
    setSearchParams(next === 'sheets' ? {} : { tab: next }, { replace: true });
  }

  function selectSettingsGroup(next: SettingsGroup) {
    setSearchParams(next === 'scoreboards' ? { tab: 'settings' } : { tab: 'settings', section: next }, { replace: true });
  }

  if (!club) {
    return <p style={{ color: '#666', padding: '2rem 0' }}>Loading…</p>;
  }

  return (
    <div>
      <div className={common.breadcrumb}>
        {!clubProp && (
          <button className={common.backButton} onClick={() => confirmLeave() && navigate('/')}>← All Clubs</button>
        )}
      </div>

      <ClubHeader club={club} canRename={isSuperAdmin} />

      <div className={styles.tabs} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? styles.tabSelected : styles.tab}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
            {t.id === 'sheets' && <span className={styles.tabCount}>{sheets.length}</span>}
            {t.id === 'leagues' && <span className={styles.tabCount}>{leagues.length}</span>}
            {t.id === 'bonspiels' && <span className={styles.tabCount}>{bonspiels.length}</span>}
            {t.id === 'displays' && <span className={styles.tabCount}>{displayLinkCount}</span>}
          </button>
        ))}
        {guide && (
          <a className={styles.guideLink} href={guide.path} target="_blank" rel="noopener">
            Guide: {guide.title}
          </a>
        )}
      </div>

      {/* Every tab stays mounted and the others are hidden, so a half-made
          change (rock colors, a new sheet) survives switching tabs. */}
      <div role="tabpanel" hidden={tab !== 'sheets'} className={styles.columns}>
        <SheetsSection
          clubId={resolvedClubId}
          sheets={sheets}
          canManageSheets={isSuperAdmin}
          readOnly={isBonspielAdmin}
          onViewGames={handleViewGames}
        />
        <RecentGames clubId={resolvedClubId} clubName={club.name} sheets={sheets} />
      </div>

      <div role="tabpanel" hidden={tab !== 'bonspiels'}>
        <BonspielsSection clubId={resolvedClubId} bonspiels={bonspiels} onOpenBonspiel={handleOpenBonspiel} />
      </div>

      {/* The rest is not mounted at all for bonspiel admins, whom the rules
          keep from reading it. */}
      {!isBonspielAdmin && (
        <>
          <div role="tabpanel" hidden={tab !== 'leagues'}>
            <LeaguesSection clubId={resolvedClubId} leagues={leagues} onOpenLeague={handleOpenLeague} />
          </div>

          <div role="tabpanel" hidden={tab !== 'displays'} className={styles.columns}>
            <DisplaysSection clubId={resolvedClubId} sheets={sheets} bonspiels={bonspiels} onCount={setDisplayLinkCount} />
            <div className={styles.stack}>
              <DisplayBrandingSection clubId={resolvedClubId} clubName={club.name} />
              <PublicScoresSection clubId={resolvedClubId} />
            </div>
          </div>

          {/* Every group stays mounted too, for the same reason. */}
          <div role="tabpanel" hidden={tab !== 'settings'} className={styles.settingsLayout}>
            <nav className={styles.settingsNav} aria-label="Settings">
              {settingsGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-current={settingsGroup === g.id ? 'page' : undefined}
                  className={settingsGroup === g.id ? styles.settingsNavSelected : styles.settingsNavItem}
                  onClick={() => selectSettingsGroup(g.id)}
                >
                  {g.label}
                  {g.superAdminOnly && <span className={common.adminTag}>Super admin</span>}
                </button>
              ))}
            </nav>
            <select
              className={`${common.input} ${styles.settingsSelect}`}
              aria-label="Settings"
              value={settingsGroup}
              onChange={(e) => selectSettingsGroup(e.target.value as SettingsGroup)}
            >
              {settingsGroups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>

            <div>
              <div hidden={settingsGroup !== 'scoreboards'}>
                <RockColorsSection clubId={resolvedClubId} />
                <ScoreboardPinSection clubId={resolvedClubId} />
              </div>
              <div hidden={settingsGroup !== 'integrations'}>
                <ApiKeySection clubId={resolvedClubId} canRegenerate={isSuperAdmin} />
                <WebhookSection clubId={resolvedClubId} />
              </div>
              {isSuperAdmin && (
                <div hidden={settingsGroup !== 'admins'}>
                  <AdminsSection clubId={resolvedClubId} clubName={club.name} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

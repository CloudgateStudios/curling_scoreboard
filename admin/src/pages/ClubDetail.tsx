import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { leagueFrom } from '../lib/leagues';
import type { Club, League, Sheet } from '../types';
import { RecentGames } from '../components/club/RecentGames';
import { ApiKeySection } from '../components/club/ApiKeySection';
import { LeaguesSection } from '../components/club/LeaguesSection';
import { RockColorsSection } from '../components/club/RockColorsSection';
import { AdminsSection } from '../components/club/AdminsSection';
import { SheetsSection } from '../components/club/SheetsSection';
import common from '../styles/common.module.css';
import styles from './ClubDetail.module.css';

const TABS = [
  { id: 'sheets', label: 'Sheets & Games' },
  { id: 'leagues', label: 'Leagues' },
  { id: 'settings', label: 'Settings' },
] as const;

type Tab = (typeof TABS)[number]['id'];

interface Props {
  // Optional: club admin dashboard passes the club directly to avoid an extra fetch
  club?: Club;
  isClubAdmin?: boolean;
}

export function ClubDetail({ club: clubProp, isClubAdmin = false }: Props) {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  // The tab lives in the URL so going back from a league or a sheet's games
  // lands on the tab it was opened from.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.id === searchParams.get('tab'))?.id ?? 'sheets';

  const [fetchedClub, setFetchedClub] = useState<Club | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);

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
  useEffect(() => {
    return onSnapshot(collection(db, 'clubs', resolvedClubId, 'leagues'), (snap) => {
      setLeagues(
        snap.docs
          .map((d) => leagueFrom(d.id, d.data()))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  }, [resolvedClubId]);

  function handleViewGames(sheetId: string) {
    // Club admins don't have /clubs/:clubId in their routes
    if (clubProp) {
      navigate(`/sheets/${sheetId}/games`);
    } else {
      navigate(`/clubs/${resolvedClubId}/sheets/${sheetId}/games`);
    }
  }

  function handleOpenLeague(leagueId: string) {
    navigate(clubProp ? `/leagues/${leagueId}` : `/clubs/${resolvedClubId}/leagues/${leagueId}`);
  }

  function selectTab(next: Tab) {
    setSearchParams(next === 'sheets' ? {} : { tab: next }, { replace: true });
  }

  if (!club) {
    return <p style={{ color: '#666', padding: '2rem 0' }}>Loading…</p>;
  }

  return (
    <div>
      <div className={common.breadcrumb}>
        {!clubProp && (
          <button className={common.backButton} onClick={() => navigate('/')}>← All Clubs</button>
        )}
      </div>

      <div className={common.header}>
        <div>
          <h1 className={common.title}>{club.name}</h1>
          <p className={common.subtitle}>ID: {club.id}</p>
        </div>
      </div>

      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
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
          </button>
        ))}
      </div>

      {/* Every tab stays mounted and the others are hidden, so a half-made
          change (rock colors, a new sheet) survives switching tabs. */}
      <div role="tabpanel" hidden={tab !== 'sheets'} className={styles.columns}>
        <SheetsSection
          clubId={resolvedClubId}
          sheets={sheets}
          canAddSheets={!isClubAdmin}
          onViewGames={handleViewGames}
        />
        <RecentGames clubId={resolvedClubId} sheets={sheets} />
      </div>

      <div role="tabpanel" hidden={tab !== 'leagues'}>
        <LeaguesSection clubId={resolvedClubId} leagues={leagues} onOpenLeague={handleOpenLeague} />
      </div>

      <div role="tabpanel" hidden={tab !== 'settings'} className={styles.settingsGrid}>
        <RockColorsSection clubId={resolvedClubId} />
        <div>
          <ApiKeySection clubId={resolvedClubId} canRegenerate={!isClubAdmin} />
          {!isClubAdmin && <AdminsSection clubId={resolvedClubId} clubName={club.name} />}
        </div>
      </div>
    </div>
  );
}

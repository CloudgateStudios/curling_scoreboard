import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import type { Club, Sheet } from '../types';
import { RecentGames } from '../components/club/RecentGames';
import { ApiKeySection } from '../components/club/ApiKeySection';
import { LeaguesSection } from '../components/club/LeaguesSection';
import { RockColorsSection } from '../components/club/RockColorsSection';
import { AdminsSection } from '../components/club/AdminsSection';
import { SheetsSection } from '../components/club/SheetsSection';
import styles from './ClubDetail.module.css';

interface Props {
  // Optional: club admin dashboard passes the club directly to avoid an extra fetch
  club?: Club;
  isClubAdmin?: boolean;
}

export function ClubDetail({ club: clubProp, isClubAdmin = false }: Props) {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();

  const [fetchedClub, setFetchedClub] = useState<Club | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);

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

  if (!club) {
    return <p style={{ color: '#666', padding: '2rem 0' }}>Loading…</p>;
  }

  return (
    <div>
      <div className={styles.breadcrumb}>
        {!clubProp && (
          <button className={styles.backButton} onClick={() => navigate('/')}>← All Clubs</button>
        )}
      </div>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{club.name}</h1>
          <p className={styles.clubId}>ID: {club.id}</p>
        </div>
      </div>

      <RecentGames clubId={resolvedClubId} sheets={sheets} />
      <ApiKeySection clubId={resolvedClubId} canRegenerate={!isClubAdmin} />
      {!isClubAdmin && <AdminsSection clubId={resolvedClubId} clubName={club.name} />}
      <LeaguesSection clubId={resolvedClubId} onOpenLeague={handleOpenLeague} />
      <RockColorsSection clubId={resolvedClubId} />
      <SheetsSection
        clubId={resolvedClubId}
        sheets={sheets}
        canAddSheets={!isClubAdmin}
        onViewGames={handleViewGames}
      />
    </div>
  );
}

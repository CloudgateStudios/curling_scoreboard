import { useState, useEffect } from 'react';
import {
  collection, doc, onSnapshot, updateDoc, deleteField, addDoc,
  getDocs, query, where, orderBy, Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useParams, useNavigate } from 'react-router-dom';
import { db, functions } from '../lib/firebase';
import type { Club, Sheet, Game } from '../types';
import styles from './ClubDetail.module.css';

interface RecentGame extends Game {
  sheetId: string;
  sheetName: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function groupByDay(games: RecentGame[]): { label: string; games: RecentGame[] }[] {
  const map = new Map<string, RecentGame[]>();
  for (const game of games) {
    const key = game.startedAt.toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(game);
  }
  return Array.from(map.entries()).map(([label, games]) => ({ label, games }));
}

function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // cspell:ignore ABCDEFGHJKLMNPQRSTUVWXYZ
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateApiKey(): string {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

interface Props {
  // Optional: club admin dashboard passes the club directly to avoid an extra fetch
  club?: Club;
  isClubAdmin?: boolean;
}

export function ClubDetail({ club: clubProp, isClubAdmin = false }: Props) {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();

  const [club, setClub] = useState<Club | null>(clubProp ?? null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [newSheetName, setNewSheetName] = useState('');
  const [addingSheet, setAddingSheet] = useState(false);
  const [savingSheet, setSavingSheet] = useState(false);

  const [clubAdmins, setClubAdmins] = useState<{ uid: string; email: string; displayName: string | null }[]>([]);

  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [addAdminError, setAddAdminError] = useState('');
  const [addAdminSuccess, setAddAdminSuccess] = useState('');

  // Stable sheet metadata (id + name only) — insulated from liveGame updates
  const [sheetMeta, setSheetMeta] = useState<{ id: string; name: string }[]>([]);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [recentGamesLoading, setRecentGamesLoading] = useState(false);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

  const resolvedClubId = clubProp?.id ?? clubId!;

  // Only fetch club doc when we don't have it passed in (super admin navigating by URL)
  useEffect(() => {
    if (clubProp) return;
    return onSnapshot(doc(db, 'clubs', resolvedClubId), (snap) => {
      if (snap.exists()) {
        setClub({ id: snap.id, ...(snap.data() as Omit<Club, 'id'>) });
      }
    });
  }, [resolvedClubId, clubProp]);

  useEffect(() => {
    return onSnapshot(collection(db, 'clubs', resolvedClubId, 'sheets'), (snap) => {
      setSheets(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Sheet, 'id'>) }))
      );
    });
  }, [resolvedClubId]);

  useEffect(() => {
    if (isClubAdmin) return;
    return onSnapshot(collection(db, 'clubs', resolvedClubId, 'admins'), (snap) => {
      setClubAdmins(
        snap.docs.map((d) => ({ uid: d.id, ...(d.data() as { email: string; displayName: string | null }) }))
      );
    });
  }, [resolvedClubId, isClubAdmin]);

  // Keep sheetMeta stable — only update when sheet ids or names change (not liveGame)
  useEffect(() => {
    const next = sheets.map(s => ({ id: s.id, name: s.name }));
    setSheetMeta(prev => {
      const prevKey = prev.map(s => s.id + s.name).join('|');
      const nextKey = next.map(s => s.id + s.name).join('|');
      return prevKey === nextKey ? prev : next;
    });
  }, [sheets]);

  // Fetch recent games across all sheets for the past 7 days
  useEffect(() => {
    if (!sheetMeta.length) return;
    let cancelled = false;
    setRecentGamesLoading(true);
    const sevenDaysAgo = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    Promise.all(
      sheetMeta.map(sheet =>
        getDocs(query(
          collection(db, 'clubs', resolvedClubId, 'sheets', sheet.id, 'games'),
          where('startedAt', '>=', sevenDaysAgo),
          orderBy('startedAt', 'desc'),
        )).then(snap =>
          snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              sheetId: sheet.id,
              sheetName: sheet.name,
              startedAt: data.startedAt?.toDate?.() ?? new Date(),
              finishedAt: data.finishedAt?.toDate?.() ?? new Date(),
            } as RecentGame;
          })
        )
      )
    ).then(results => {
      if (cancelled) return;
      const all = results.flat().sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      setRecentGames(all);
      setRecentGamesLoading(false);
    });
    return () => { cancelled = true; };
  }, [resolvedClubId, sheetMeta]);

  async function handleGeneratePairingCode(sheetId: string) {
    const code = generatePairingCode();
    await updateDoc(doc(db, 'clubs', resolvedClubId, 'sheets', sheetId), {
      pairingCode: code,
    });
  }

  async function handleClearPairingCode(sheetId: string) {
    await updateDoc(doc(db, 'clubs', resolvedClubId, 'sheets', sheetId), {
      pairingCode: deleteField(),
    });
  }

  async function handleAddSheet(e: React.FormEvent) {
    e.preventDefault();
    setSavingSheet(true);
    await addDoc(collection(db, 'clubs', resolvedClubId, 'sheets'), {
      name: newSheetName,
    });
    setNewSheetName('');
    setAddingSheet(false);
    setSavingSheet(false);
  }

  async function handleRegenerateApiKey() {
    if (!confirm('Regenerate API key? Existing integrations using the current key will break.')) return;
    const newKey = generateApiKey();
    await updateDoc(doc(db, 'clubs', resolvedClubId), { apiKey: newKey });
  }

  function handleViewGames(sheetId: string) {
    // Club admins don't have /clubs/:clubId in their routes
    if (clubProp) {
      navigate(`/sheets/${sheetId}/games`);
    } else {
      navigate(`/clubs/${resolvedClubId}/sheets/${sheetId}/games`);
    }
  }

  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAddingAdmin(true);
    setAddAdminError('');
    setAddAdminSuccess('');
    try {
      const addClubAdmin = httpsCallable(functions, 'addClubAdmin');
      await addClubAdmin({ clubId: resolvedClubId, adminEmail, adminPassword });
      setAddAdminSuccess(`Admin account created for ${adminEmail}.`);
      setAdminEmail('');
      setAdminPassword('');
    } catch (err) {
      setAddAdminError(err instanceof Error ? err.message : 'Failed to add admin.');
    } finally {
      setAddingAdmin(false);
    }
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

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Games — Last 7 Days</h2>
          <span className={styles.gameCount}>
            {recentGamesLoading ? '…' : `${recentGames.length} game${recentGames.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {recentGamesLoading && <p className={styles.empty}>Loading…</p>}

        {!recentGamesLoading && recentGames.length === 0 && (
          <p className={styles.empty}>No completed games in the last 7 days.</p>
        )}

        {!recentGamesLoading && groupByDay(recentGames).map(({ label, games }) => (
          <div key={label} className={styles.dayGroup}>
            <h3 className={styles.dayLabel}>{label}</h3>
            <div className={styles.gameList}>
              {games.map(game => (
                <div key={`${game.sheetId}-${game.id}`} className={styles.gameCard}>
                  <button
                    className={styles.gameHeader}
                    onClick={() => setExpandedGameId(expandedGameId === game.id ? null : game.id)}
                  >
                    <div className={styles.gameScore}>
                      <span className={game.team1.totalScore >= game.team2.totalScore ? styles.winnerName : styles.loserName}>
                        {game.team1.name}
                      </span>
                      <span className={styles.scoreDisplay}>
                        {game.team1.totalScore} – {game.team2.totalScore}
                      </span>
                      <span className={game.team2.totalScore >= game.team1.totalScore ? styles.winnerName : styles.loserName}>
                        {game.team2.name}
                      </span>
                    </div>
                    <div className={styles.gameMeta}>
                      <span className={styles.sheetChip}>{game.sheetName}</span>
                      <span>{game.startedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                      {game.ends.length > 0 && (
                        <span>{formatDuration(game.ends[game.ends.length - 1].gameTimeInSeconds)}</span>
                      )}
                      <span>{game.numberOfEnds} ends</span>
                      <span className={styles.expandIcon}>{expandedGameId === game.id ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {expandedGameId === game.id && (
                    <div className={styles.endsTable}>
                      <table>
                        <thead>
                          <tr>
                            <th>End</th>
                            {game.ends.map(e => <th key={e.endNumber}>{e.endNumber}</th>)}
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className={styles.teamLabel}>{game.team1.name}</td>
                            {game.ends.map(e => (
                              <td key={e.endNumber} className={e.scoringTeam === game.team1.name ? styles.scoringEnd : ''}>
                                {e.scoringTeam === game.team1.name ? e.score : e.scoringTeam === null ? '—' : '0'}
                              </td>
                            ))}
                            <td className={styles.totalCell}>{game.team1.totalScore}</td>
                          </tr>
                          <tr>
                            <td className={styles.teamLabel}>{game.team2.name}</td>
                            {game.ends.map(e => (
                              <td key={e.endNumber} className={e.scoringTeam === game.team2.name ? styles.scoringEnd : ''}>
                                {e.scoringTeam === game.team2.name ? e.score : e.scoringTeam === null ? '—' : '0'}
                              </td>
                            ))}
                            <td className={styles.totalCell}>{game.team2.totalScore}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>API Access</h2>
        <div className={styles.apiKeyRow}>
          <code className={styles.apiKey}>{club.apiKey || '—'}</code>
          <button className={styles.ghostButton} onClick={handleRegenerateApiKey}>
            Regenerate Key
          </button>
        </div>
      </div>

      {!isClubAdmin && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Admins ({clubAdmins.length})</h2>
            <button className={styles.primaryButton} onClick={() => { setShowAddAdmin(true); setAddAdminError(''); setAddAdminSuccess(''); }}>
              + Add Admin
            </button>
          </div>

          <div className={styles.adminList}>
            {clubAdmins.map((admin) => (
              <div key={admin.uid} className={styles.adminRow}>
                <div>
                  {admin.displayName && <span className={styles.adminName}>{admin.displayName}</span>}
                  <span className={styles.adminEmail}>{admin.email}</span>
                </div>
              </div>
            ))}
            {clubAdmins.length === 0 && <p className={styles.empty}>No admins yet.</p>}
          </div>

          {showAddAdmin && (
            <div className={styles.modal}>
              <div className={styles.modalCard}>
                <h2 className={styles.modalTitle}>Add Admin to {club.name}</h2>
                <form onSubmit={handleAddAdmin} className={styles.form}>
                  <label className={styles.label}>
                    Admin Email
                    <input
                      type="email"
                      className={styles.input}
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      required
                    />
                  </label>
                  <label className={styles.label}>
                    Password
                    <input
                      type="password"
                      className={styles.input}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                  </label>
                  {addAdminError && <p className={styles.error}>{addAdminError}</p>}
                  {addAdminSuccess && <p className={styles.success}>{addAdminSuccess}</p>}
                  <div className={styles.modalActions}>
                    <button type="button" className={styles.ghostButton} onClick={() => setShowAddAdmin(false)}>
                      Close
                    </button>
                    <button type="submit" className={styles.primaryButton} disabled={addingAdmin}>
                      {addingAdmin ? 'Adding…' : 'Add Admin'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Sheets ({sheets.length})</h2>
          {!isClubAdmin && (
            <button className={styles.primaryButton} onClick={() => setAddingSheet(true)}>
              + Add Sheet
            </button>
          )}
        </div>

        {addingSheet && (
          <form onSubmit={handleAddSheet} className={styles.addSheetForm}>
            <input
              className={styles.input}
              placeholder="Sheet name (e.g. Sheet 1)"
              value={newSheetName}
              onChange={(e) => setNewSheetName(e.target.value)}
              required
              autoFocus
            />
            <button type="submit" className={styles.primaryButton} disabled={savingSheet}>
              {savingSheet ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className={styles.ghostButton} onClick={() => setAddingSheet(false)}>
              Cancel
            </button>
          </form>
        )}

        <div className={styles.sheetList}>
          {sheets.map((sheet) => (
            <div key={sheet.id} className={styles.sheetRow}>
              <div className={styles.sheetInfo}>
                <span className={styles.sheetName}>{sheet.name}</span>
                <div className={styles.sheetMeta}>
                  {sheet.liveGame ? (
                    <span className={styles.liveChip}>
                      LIVE — End {sheet.liveGame.currentEnd} &nbsp;
                      {sheet.liveGame.team1.name} {sheet.liveGame.team1.score}–{sheet.liveGame.team2.score} {sheet.liveGame.team2.name}
                    </span>
                  ) : (
                    <span className={styles.idleChip}>Idle</span>
                  )}
                  {sheet.scoreboardUid ? (
                    <span className={styles.pairedChip}>Paired</span>
                  ) : (
                    <span className={styles.unpairedChip}>Unpaired</span>
                  )}
                </div>
              </div>
              <div className={styles.sheetActions}>
                {sheet.pairingCode ? (
                  <div className={styles.pairingCodeRow}>
                    <code className={styles.pairingCode}>{sheet.pairingCode}</code>
                    <button
                      className={styles.ghostButton}
                      onClick={() => handleClearPairingCode(sheet.id)}
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <button
                    className={styles.ghostButton}
                    onClick={() => handleGeneratePairingCode(sheet.id)}
                  >
                    Generate Pairing Code
                  </button>
                )}
                <button
                  className={styles.linkButton}
                  onClick={() => handleViewGames(sheet.id)}
                >
                  View Games →
                </button>
              </div>
            </div>
          ))}
          {sheets.length === 0 && <p className={styles.empty}>No sheets yet.</p>}
        </div>
      </div>
    </div>
  );
}

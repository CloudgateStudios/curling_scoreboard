import { useState, useEffect } from 'react';
import {
  collection, doc, onSnapshot, updateDoc, deleteField, addDoc,
} from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import type { Club, Sheet } from '../types';
import styles from './ClubDetail.module.css';

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
        <h2 className={styles.sectionTitle}>API Access</h2>
        <div className={styles.apiKeyRow}>
          <code className={styles.apiKey}>{club.apiKey || '—'}</code>
          <button className={styles.ghostButton} onClick={handleRegenerateApiKey}>
            Regenerate Key
          </button>
        </div>
      </div>

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

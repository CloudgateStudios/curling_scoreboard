import { useState, useEffect } from 'react';
import {
  collection, doc, onSnapshot, updateDoc, deleteField, addDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Club, Sheet } from '../types';
import { GameHistory } from './GameHistory';
import styles from './ClubDetail.module.css';

interface Props {
  club: Club;
  onBack?: () => void;
}

function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateApiKey(): string {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

export function ClubDetail({ club, onBack }: Props) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<Sheet | null>(null);
  const [newSheetName, setNewSheetName] = useState('');
  const [addingSheet, setAddingSheet] = useState(false);
  const [savingSheet, setSavingSheet] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, 'clubs', club.id, 'sheets'), (snap) => {
      setSheets(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Sheet, 'id'>) }))
      );
    });
  }, [club.id]);

  async function handleGeneratePairingCode(sheetId: string) {
    const code = generatePairingCode();
    await updateDoc(doc(db, 'clubs', club.id, 'sheets', sheetId), {
      pairingCode: code,
    });
  }

  async function handleClearPairingCode(sheetId: string) {
    await updateDoc(doc(db, 'clubs', club.id, 'sheets', sheetId), {
      pairingCode: deleteField(),
    });
  }

  async function handleAddSheet(e: React.FormEvent) {
    e.preventDefault();
    setSavingSheet(true);
    await addDoc(collection(db, 'clubs', club.id, 'sheets'), {
      name: newSheetName,
    });
    setNewSheetName('');
    setAddingSheet(false);
    setSavingSheet(false);
  }

  async function handleRegenerateApiKey() {
    if (!confirm('Regenerate API key? Existing integrations using the current key will break.')) return;
    const newKey = generateApiKey();
    await updateDoc(doc(db, 'clubs', club.id), { apiKey: newKey });
  }

  if (selectedSheet) {
    return (
      <GameHistory
        club={club}
        sheet={selectedSheet}
        onBack={() => setSelectedSheet(null)}
      />
    );
  }

  return (
    <div>
      <div className={styles.breadcrumb}>
        {onBack && (
          <button className={styles.backButton} onClick={onBack}>← All Clubs</button>
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
          <button className={styles.primaryButton} onClick={() => setAddingSheet(true)}>
            + Add Sheet
          </button>
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
                  onClick={() => setSelectedSheet(sheet)}
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

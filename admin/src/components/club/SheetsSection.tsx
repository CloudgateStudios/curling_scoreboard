import { useEffect, useState } from 'react';
import { addDoc, collection, deleteField, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { generatePairingCode } from '../../lib/credentials';
import { errorMessage } from '../../lib/format';
import { activeLiveGame } from '../../lib/liveGame';
import type { Sheet } from '../../types';
import { SheetDeviceStatus } from './SheetDeviceStatus';
import styles from '../../pages/ClubDetail.module.css';

interface Props {
  clubId: string;
  sheets: Sheet[];
  canAddSheets: boolean;
  onViewGames: (sheetId: string) => void;
}

/** Each sheet's live game, pairing state, scoreboard status and pairing code. */
export function SheetsSection({ clubId, sheets, canAddSheets, onViewGames }: Props) {
  const [adding, setAdding] = useState(false);
  const [newSheetName, setNewSheetName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deployedBuildId, setDeployedBuildId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // The build the deploy workflow last published, which is what every
  // scoreboard should end up running.
  useEffect(() => {
    return onSnapshot(doc(db, 'appConfig', 'scoreboard'), (snap) => {
      setDeployedBuildId((snap.get('buildId') as string | undefined) ?? null);
    });
  }, []);

  // Keeps "seen 5m ago" and the online chips moving while the page is open.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function handleGeneratePairingCode(sheetId: string) {
    try {
      await updateDoc(doc(db, 'clubs', clubId, 'sheets', sheetId), {
        pairingCode: generatePairingCode(),
      });
    } catch (err) {
      setError(errorMessage(err, 'Could not generate a pairing code.'));
    }
  }

  async function handleClearPairingCode(sheetId: string) {
    try {
      await updateDoc(doc(db, 'clubs', clubId, 'sheets', sheetId), {
        pairingCode: deleteField(),
      });
    } catch (err) {
      setError(errorMessage(err, 'Could not clear the pairing code.'));
    }
  }

  async function handleAddSheet(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await addDoc(collection(db, 'clubs', clubId, 'sheets'), { name: newSheetName });
      setNewSheetName('');
      setAdding(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not add the sheet.'));
    } finally {
      // Always clear the saving flag, otherwise a failure leaves the Save
      // button disabled for good.
      setSaving(false);
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Sheets ({sheets.length})</h2>
        {canAddSheets && (
          <button className={styles.primaryButton} onClick={() => setAdding(true)}>
            + Add Sheet
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleAddSheet} className={styles.addSheetForm}>
          <input
            className={styles.input}
            placeholder="Sheet name (e.g. Sheet 1)"
            value={newSheetName}
            onChange={(e) => setNewSheetName(e.target.value)}
            required
            autoFocus
          />
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className={styles.ghostButton} onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.sheetList}>
        {sheets.map((sheet) => {
          // An abandoned game stays on the sheet, so it is aged out here.
          const liveGame = activeLiveGame(sheet.liveGame, now.getTime());
          return (
          <div key={sheet.id} className={styles.sheetRow}>
            <div className={styles.sheetInfo}>
              <span className={styles.sheetName}>{sheet.name}</span>
              <div className={styles.sheetMeta}>
                {liveGame ? (
                  <span className={styles.liveChip}>
                    LIVE — End {liveGame.currentEnd} &nbsp;
                    {liveGame.team1.name} {liveGame.team1.score}–{liveGame.team2.score} {liveGame.team2.name}
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
              {sheet.scoreboardUid && (
                <SheetDeviceStatus sheet={sheet} deployedBuildId={deployedBuildId} now={now} />
              )}
            </div>
            <div className={styles.sheetActions}>
              {sheet.pairingCode ? (
                <div className={styles.pairingCodeRow}>
                  <code className={styles.pairingCode}>{sheet.pairingCode}</code>
                  <button className={styles.ghostButton} onClick={() => handleClearPairingCode(sheet.id)}>
                    Clear
                  </button>
                </div>
              ) : (
                <button className={styles.ghostButton} onClick={() => handleGeneratePairingCode(sheet.id)}>
                  Generate Pairing Code
                </button>
              )}
              <button className={styles.linkButton} onClick={() => onViewGames(sheet.id)}>
                View Games →
              </button>
            </div>
          </div>
          );
        })}
        {sheets.length === 0 && <p className={styles.empty}>No sheets yet.</p>}
      </div>
    </div>
  );
}

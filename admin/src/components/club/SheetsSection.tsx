import { useState } from 'react';
import { addDoc, collection, deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { generatePairingCode } from '../../lib/credentials';
import { errorMessage } from '../../lib/format';
import type { Sheet } from '../../types';
import styles from '../../pages/ClubDetail.module.css';

interface Props {
  clubId: string;
  sheets: Sheet[];
  canAddSheets: boolean;
  onViewGames: (sheetId: string) => void;
}

/** Each sheet's live game, pairing state and pairing code. */
export function SheetsSection({ clubId, sheets, canAddSheets, onViewGames }: Props) {
  const [adding, setAdding] = useState(false);
  const [newSheetName, setNewSheetName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
        ))}
        {sheets.length === 0 && <p className={styles.empty}>No sheets yet.</p>}
      </div>
    </div>
  );
}

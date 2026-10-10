import { useState } from 'react';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { generatePairingCode } from '../../lib/credentials';
import { errorMessage } from '../../lib/format';
import { activeLiveGame } from '../../lib/liveGame';
import type { Sheet } from '../../types';
import { SheetDeviceStatus } from './SheetDeviceStatus';
import common from '../../styles/common.module.css';
import styles from './SheetsSection.module.css';

interface Props {
  clubId: string;
  sheet: Sheet;
  /** Super admins only: deleting a sheet removes its game history. */
  canDelete: boolean;
  deployedBuildId: string | null;
  now: Date;
  onViewGames: (sheetId: string) => void;
}

/** One sheet: its live game, scoreboard and pairing code, and the editor
 *  for renaming, unpairing and deleting it. */
export function SheetRow({ clubId, sheet, canDelete, deployedBuildId, now, onViewGames }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(sheet.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sheetRef = doc(db, 'clubs', clubId, 'sheets', sheet.id);
  // An abandoned game stays on the sheet, so it is aged out here.
  const liveGame = activeLiveGame(sheet.liveGame, now.getTime());

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch (err) {
      setError(errorMessage(err, failure));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openEditor() {
    setName(sheet.name);
    setError('');
    setEditing(true);
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === sheet.name) {
      setEditing(false);
      return;
    }
    if (await run(() => updateDoc(sheetRef, { name: trimmed }), 'Could not rename the sheet.')) {
      setEditing(false);
    }
  }

  async function handleUnpair() {
    if (!confirm(`Unpair the scoreboard from ${sheet.name}? It stops showing this sheet until it is paired again with a new code.`)) return;
    // The device status and any live game belong to the scoreboard going away.
    await run(
      () => updateDoc(sheetRef, {
        scoreboardUid: deleteField(),
        pairedAt: deleteField(),
        device: deleteField(),
        liveGame: deleteField(),
      }),
      'Could not unpair the scoreboard.',
    );
  }

  async function handleDelete() {
    if (!confirm(`Delete ${sheet.name} and all of its game history? This cannot be undone.`)) return;
    // Through a function, which also deletes the games: a client delete would
    // leave them behind with no sheet to reach them from.
    await run(
      () => httpsCallable(functions, 'deleteSheet')({ clubId, sheetId: sheet.id }),
      'Could not delete the sheet.',
    );
  }

  async function handleGeneratePairingCode() {
    await run(() => updateDoc(sheetRef, { pairingCode: generatePairingCode() }), 'Could not generate a pairing code.');
  }

  async function handleClearPairingCode() {
    await run(() => updateDoc(sheetRef, { pairingCode: deleteField() }), 'Could not clear the pairing code.');
  }

  return (
    <div className={common.row}>
      <div className={common.rowInfo}>
        {editing ? (
          <form onSubmit={handleRename} className={styles.renameForm}>
            <input
              className={common.input}
              aria-label="Sheet name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
              autoFocus
            />
            <button type="submit" className={common.primaryButton} disabled={busy || !name.trim()}>
              Save
            </button>
            <button type="button" className={common.ghostButton} onClick={() => setEditing(false)}>
              Done
            </button>
          </form>
        ) : (
          <span className={common.rowName}>{sheet.name}</span>
        )}
        <div className={common.rowMeta}>
          {liveGame ? (
            <span className={common.liveChip}>
              LIVE — End {liveGame.currentEnd} &nbsp;
              {liveGame.team1.name} {liveGame.team1.score}–{liveGame.team2.score} {liveGame.team2.name}
            </span>
          ) : (
            <span className={common.idleChip}>Idle</span>
          )}
          {sheet.scoreboardUid ? (
            <span className={common.pairedChip}>Paired</span>
          ) : (
            <span className={common.unpairedChip}>Unpaired</span>
          )}
        </div>
        {sheet.scoreboardUid && (
          <SheetDeviceStatus sheet={sheet} deployedBuildId={deployedBuildId} now={now} />
        )}
        {editing && (
          <div className={styles.dangerActions}>
            {sheet.scoreboardUid && (
              <button className={common.ghostButton} onClick={handleUnpair} disabled={busy}>
                Unpair Scoreboard
              </button>
            )}
            {canDelete && (
              <button className={styles.dangerButton} onClick={handleDelete} disabled={busy}>
                Delete Sheet
              </button>
            )}
          </div>
        )}
        {error && <p className={common.error}>{error}</p>}
      </div>
      <div className={common.rowActions}>
        {sheet.pairingCode ? (
          <div className={styles.pairingCodeRow}>
            <code className={styles.pairingCode}>{sheet.pairingCode}</code>
            <button className={common.ghostButton} onClick={handleClearPairingCode}>
              Clear
            </button>
          </div>
        ) : (
          <button className={common.ghostButton} onClick={handleGeneratePairingCode}>
            Generate Pairing Code
          </button>
        )}
        {!editing && (
          <button className={common.linkButton} onClick={openEditor}>
            Edit
          </button>
        )}
        <button className={common.linkButton} onClick={() => onViewGames(sheet.id)}>
          View Games →
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import { bonspielData, formatDates, newBonspiel, today } from '../../lib/bonspiels';
import type { Bonspiel } from '../../types';
import common from '../../styles/common.module.css';

interface Props {
  clubId: string;
  /** Newest first. */
  bonspiels: Bonspiel[];
  onOpenBonspiel: (bonspielId: string) => void;
}

/** The club's bonspiels, each planned on its own page. */
export function BonspielsSection({ clubId, bonspiels, onOpenBonspiel }: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const ref = await addDoc(
        collection(db, 'clubs', clubId, 'bonspiels'),
        bonspielData(newBonspiel(newName, today())),
      );
      setNewName('');
      setAdding(false);
      // Straight to the bonspiel, where its dates, teams and draws are set.
      onOpenBonspiel(ref.id);
    } catch (err) {
      setError(errorMessage(err, 'Could not add the bonspiel.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={common.section}>
      <div className={common.sectionHeader}>
        <h2 className={common.sectionTitle}>Bonspiels ({bonspiels.length})</h2>
        <button className={common.primaryButton} onClick={() => setAdding(true)}>
          + Add Bonspiel
        </button>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className={common.inlineForm}>
          <input
            className={common.input}
            placeholder="Bonspiel name (e.g. Fall Spiel)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={80}
            required
            autoFocus
          />
          <button type="submit" className={common.primaryButton} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className={common.ghostButton} onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}

      {error && <p className={common.error}>{error}</p>}

      <div className={common.list}>
        {bonspiels.map((bonspiel) => (
          <div key={bonspiel.id} className={common.row}>
            <div className={common.rowInfo}>
              <span className={common.rowName}>{bonspiel.name}</span>
              <div className={common.rowMeta}>
                <span className={bonspiel.active ? common.pairedChip : common.idleChip}>
                  {bonspiel.active ? 'Active' : 'Inactive'}
                </span>
                <span className={common.versionChip}>
                  {bonspiel.teams.length} team{bonspiel.teams.length !== 1 ? 's' : ''}
                </span>
                <span className={common.versionChip}>
                  {bonspiel.games.length} game{bonspiel.games.length !== 1 ? 's' : ''}
                </span>
                <span className={common.muted}>{formatDates(bonspiel.startDate, bonspiel.endDate)}</span>
              </div>
            </div>
            <div className={common.rowActions}>
              <button className={common.linkButton} onClick={() => onOpenBonspiel(bonspiel.id)}>
                Open →
              </button>
            </div>
          </div>
        ))}
        {bonspiels.length === 0 && (
          <p className={common.empty}>
            No bonspiels yet. Add one to plan its draws, teams and brackets.
          </p>
        )}
      </div>
    </div>
  );
}

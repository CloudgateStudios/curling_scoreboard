import { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import { formatDraws, leagueData } from '../../lib/leagues';
import type { League } from '../../types';
import { LeagueImportDialog } from './LeagueImportDialog';
import common from '../../styles/common.module.css';

interface Props {
  clubId: string;
  /** Sorted by name. */
  leagues: League[];
  onOpenLeague: (leagueId: string) => void;
}

/** The club's leagues, whose teams scoreboards offer for league games. */
export function LeaguesSection({ clubId, leagues, onOpenLeague }: Props) {
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const ref = await addDoc(
        collection(db, 'clubs', clubId, 'leagues'),
        leagueData({ name: newName, active: true, draws: [], teams: [] }),
      );
      setNewName('');
      setAdding(false);
      // Straight to the league, where its schedule and teams are set.
      onOpenLeague(ref.id);
    } catch (err) {
      setError(errorMessage(err, 'Could not add the league.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={common.section}>
      <div className={common.sectionHeader}>
        <h2 className={common.sectionTitle}>Leagues ({leagues.length})</h2>
        <div className={common.rowActions}>
          <button className={common.ghostButton} onClick={() => setImporting(true)}>
            Import CSV
          </button>
          <button className={common.primaryButton} onClick={() => setAdding(true)}>
            + Add League
          </button>
        </div>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className={common.inlineForm}>
          <input
            className={common.input}
            placeholder="League name (e.g. Monday Night)"
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
        {leagues.map((league) => (
          <div key={league.id} className={common.row}>
            <div className={common.rowInfo}>
              <span className={common.rowName}>{league.name}</span>
              <div className={common.rowMeta}>
                <span className={league.active ? common.pairedChip : common.idleChip}>
                  {league.active ? 'Active' : 'Inactive'}
                </span>
                <span className={common.versionChip}>
                  {league.teams.length} team{league.teams.length !== 1 ? 's' : ''}
                </span>
                <span className={common.muted}>{formatDraws(league.draws)}</span>
              </div>
            </div>
            <div className={common.rowActions}>
              <button className={common.linkButton} onClick={() => onOpenLeague(league.id)}>
                Edit →
              </button>
            </div>
          </div>
        ))}
        {leagues.length === 0 && (
          <p className={common.empty}>
            No leagues yet. Add one, or import your leagues and teams from a CSV file.
          </p>
        )}
      </div>

      {importing && (
        <LeagueImportDialog clubId={clubId} leagues={leagues} onClose={() => setImporting(false)} />
      )}
    </div>
  );
}

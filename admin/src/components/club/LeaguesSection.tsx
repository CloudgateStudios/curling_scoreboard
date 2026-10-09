import { useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import { compareLeagues, formatDraws, leagueData, leagueFrom } from '../../lib/leagues';
import type { League } from '../../types';
import { LeagueImportDialog } from './LeagueImportDialog';
import { LeagueWeek } from './LeagueWeek';
import styles from '../../pages/ClubDetail.module.css';

interface Props {
  clubId: string;
  onOpenLeague: (leagueId: string) => void;
}

/** The club's leagues, whose teams scoreboards offer for league games. */
export function LeaguesSection({ clubId, onOpenLeague }: Props) {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'clubs', clubId, 'leagues'), (snap) => {
      setLeagues(
        snap.docs.map((d) => leagueFrom(d.id, d.data())).sort(compareLeagues),
      );
    });
  }, [clubId]);

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
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Leagues ({leagues.length})</h2>
        <div className={styles.sheetActions}>
          <button className={styles.ghostButton} onClick={() => setImporting(true)}>
            Import CSV
          </button>
          <button className={styles.primaryButton} onClick={() => setAdding(true)}>
            + Add League
          </button>
        </div>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className={styles.addSheetForm}>
          <input
            className={styles.input}
            placeholder="League name (e.g. Monday Night)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={80}
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

      <LeagueWeek leagues={leagues} onOpenLeague={onOpenLeague} />

      <div className={styles.sheetList}>
        {leagues.map((league) => (
          <div key={league.id} className={styles.sheetRow}>
            <div className={styles.sheetInfo}>
              <span className={styles.sheetName}>{league.name}</span>
              <div className={styles.sheetMeta}>
                <span className={league.active ? styles.pairedChip : styles.idleChip}>
                  {league.active ? 'Active' : 'Inactive'}
                </span>
                <span className={styles.versionChip}>
                  {league.teams.length} team{league.teams.length !== 1 ? 's' : ''}
                </span>
                <span className={styles.rockColorName}>{formatDraws(league.draws)}</span>
              </div>
            </div>
            <div className={styles.sheetActions}>
              <button className={styles.linkButton} onClick={() => onOpenLeague(league.id)}>
                Edit →
              </button>
            </div>
          </div>
        ))}
        {leagues.length === 0 && (
          <p className={styles.empty}>
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

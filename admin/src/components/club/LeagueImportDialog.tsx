import { useMemo, useState } from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import {
  CSV_EXAMPLE, parseLeagueCsv, planLeagueImport,
  type ImportMode, type ParsedCsv,
} from '../../lib/leagueCsv';
import { formatDraws, leagueData, newTeamId } from '../../lib/leagues';
import type { League } from '../../types';
import common from '../../styles/common.module.css';
import styles from './LeagueImportDialog.module.css';

const SAMPLE_CSV_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(`${CSV_EXAMPLE}\n`)}`;

interface Props {
  clubId: string;
  leagues: League[];
  onClose: () => void;
}

/** Imports leagues and teams from a CSV file, showing what will change
 *  before anything is written. */
export function LeagueImportDialog({ clubId, leagues, onClose }: Props) {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Recomputed when the mode changes, so the preview always shows exactly
  // what Import will write.
  const plans = useMemo(
    () => (parsed ? planLeagueImport(leagues, parsed.leagues, mode, newTeamId) : []),
    [parsed, leagues, mode],
  );

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setFileName(file.name);
    setParsed(parseLeagueCsv(await file.text()));
  }

  async function handleImport() {
    setSaving(true);
    setError('');
    try {
      // One batch, so a failure part way through cannot leave half the
      // leagues updated.
      const batch = writeBatch(db);
      const leaguesRef = collection(db, 'clubs', clubId, 'leagues');
      for (const plan of plans) {
        const ref = plan.existingId ? doc(leaguesRef, plan.existingId) : doc(leaguesRef);
        batch.set(ref, leagueData(plan.league));
      }
      await batch.commit();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not import the leagues.'));
      setSaving(false);
    }
  }

  return (
    <div className={common.modal}>
      <div className={`${common.modalCard} ${common.wideModalCard}`}>
        <h2 className={common.modalTitle}>Import Leagues from CSV</h2>

        <p className={common.blurb}>
          One row per team. Only <code>league</code> and <code>team</code> are required; leave the
          schedule columns out to keep a league's current schedule.
        </p>
        <pre className={styles.csvExample}>{CSV_EXAMPLE}</pre>
        <p className={common.blurb}>
          {/* The same text as shown above, so the sample is always a file
              this dialog accepts. */}
          <a href={SAMPLE_CSV_HREF} download="leagues-sample.csv">
            Download this as a sample CSV
          </a>{' '}
          to fill in with your own leagues and teams.
        </p>

        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {parsed && (
          <>
            <fieldset className={styles.importMode}>
              <legend>Teams already in a league that are not in the file</legend>
              <label>
                <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Keep them
              </label>
              <label>
                <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Remove them
              </label>
            </fieldset>

            {parsed.problems.length > 0 && (
              <div className={common.error}>
                {parsed.problems.length} row{parsed.problems.length !== 1 ? 's' : ''} in {fileName} will be skipped:
                <ul className={styles.importProblems}>
                  {parsed.problems.slice(0, 10).map((p) => (
                    <li key={`${p.line}-${p.message}`}>Line {p.line}: {p.message}</li>
                  ))}
                  {parsed.problems.length > 10 && <li>…and {parsed.problems.length - 10} more</li>}
                </ul>
              </div>
            )}

            <div className={styles.importPreview}>
              {plans.map((plan) => (
                <div key={plan.league.name} className={styles.importLeague}>
                  <div className={common.rowName}>
                    {plan.league.name}{' '}
                    <span className={plan.existingId ? common.idleChip : common.pairedChip}>
                      {plan.existingId ? 'Update' : 'New league'}
                    </span>
                  </div>
                  <div className={common.muted}>
                    {formatDraws(plan.league.draws)} · {plan.league.teams.length} team
                    {plan.league.teams.length !== 1 ? 's' : ''} after import
                  </div>
                  <ul className={styles.importChanges}>
                    {plan.added.length > 0 && <li>Add {plan.added.length}: {plan.added.join(', ')}</li>}
                    {plan.renamed.map((r) => (
                      <li key={r.from}>Rename {r.from} → {r.to}</li>
                    ))}
                    {plan.removed.length > 0 && <li>Remove {plan.removed.length}: {plan.removed.join(', ')}</li>}
                    {plan.unchanged > 0 && <li>{plan.unchanged} unchanged</li>}
                  </ul>
                </div>
              ))}
              {plans.length === 0 && <p className={common.empty}>Nothing to import from this file.</p>}
            </div>
          </>
        )}

        {error && <p className={common.error}>{error}</p>}

        <div className={common.modalActions}>
          <button type="button" className={common.ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={common.primaryButton}
            onClick={handleImport}
            disabled={saving || plans.length === 0}
          >
            {saving ? 'Importing…' : `Import ${plans.length} league${plans.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

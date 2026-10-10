import { useEffect, useState } from 'react';
import { addDoc, collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { sheetsHealth } from '../../lib/deviceHealth';
import { errorMessage } from '../../lib/format';
import type { Sheet } from '../../types';
import { SheetRow } from './SheetRow';
import common from '../../styles/common.module.css';
import styles from './SheetsSection.module.css';

interface Props {
  clubId: string;
  sheets: Sheet[];
  /** Super admins add and delete sheets; club admins rename and unpair them. */
  canManageSheets: boolean;
  onViewGames: (sheetId: string) => void;
}

/** How the club's scoreboards are doing, then each sheet's live game,
 *  pairing state, scoreboard status and pairing code. */
export function SheetsSection({ clubId, sheets, canManageSheets, onViewGames }: Props) {
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
    <div className={common.section}>
      <div className={common.sectionHeader}>
        <h2 className={common.sectionTitle}>Sheets ({sheets.length})</h2>
        {canManageSheets && (
          <button className={common.primaryButton} onClick={() => setAdding(true)}>
            + Add Sheet
          </button>
        )}
      </div>

      {sheets.length > 0 && <HealthSummary sheets={sheets} deployedBuildId={deployedBuildId} now={now} />}

      {adding && (
        <form onSubmit={handleAddSheet} className={common.inlineForm}>
          <input
            className={common.input}
            placeholder="Sheet name (e.g. Sheet 1)"
            value={newSheetName}
            onChange={(e) => setNewSheetName(e.target.value)}
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
        {sheets.map((sheet) => (
          <SheetRow
            key={sheet.id}
            clubId={clubId}
            sheet={sheet}
            canDelete={canManageSheets}
            deployedBuildId={deployedBuildId}
            now={now}
            onViewGames={onViewGames}
          />
        ))}
        {sheets.length === 0 && <p className={common.empty}>No sheets yet.</p>}
      </div>
    </div>
  );
}

/** One line that says whether anything needs looking at before a draw. */
function HealthSummary({ sheets, deployedBuildId, now }: { sheets: Sheet[]; deployedBuildId: string | null; now: Date }) {
  const health = sheetsHealth(sheets, deployedBuildId, now.getTime());
  const paired = sheets.length - health.unpaired;
  const problems = health.offline + health.updatePending + health.syncErrors;
  const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;

  return (
    <div className={paired > 0 && problems === 0 ? styles.healthGood : styles.healthAttention}>
      {paired > 0 && problems === 0 && (
        <span>{paired === 1 ? 'The scoreboard is' : `All ${paired} scoreboards are`} online and up to date.</span>
      )}
      {health.online > 0 && problems > 0 && <span className={common.onlineChip}>{health.online} online</span>}
      {health.offline > 0 && <span className={common.warningChip}>{health.offline} offline</span>}
      {health.updatePending > 0 && (
        <span className={common.warningChip}>{plural(health.updatePending, 'update')} pending</span>
      )}
      {health.syncErrors > 0 && (
        <span className={common.errorChip}>{plural(health.syncErrors, 'sync error')} today</span>
      )}
      {health.unpaired > 0 && (
        <span className={common.unpairedChip}>{plural(health.unpaired, 'sheet')} without a scoreboard</span>
      )}
    </div>
  );
}

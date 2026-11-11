import { useState } from 'react';
import { useDirtyEditors } from '../lib/unsavedChanges';
import styles from './SaveBar.module.css';

/** Pinned to the bottom of the club's pages while any setting has unsaved
 *  changes, on this page or one moved away from, with one button to save
 *  them all. Each section keeps its own Save too. */
export function SaveBar() {
  const editors = useDirtyEditors();
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);

  if (editors.length === 0) return null;

  async function saveAll() {
    setSaving(true);
    const cannot = editors.filter((e) => !e.canSave());
    setBlocked(cannot.map((e) => e.label));
    // Each editor shows its own error if its save fails.
    await Promise.allSettled(editors.filter((e) => e.canSave()).map((e) => e.save()));
    setSaving(false);
  }

  function discardAll() {
    setBlocked([]);
    for (const e of editors) e.discard();
  }

  const names = editors.map((e) => e.label);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];

  return (
    <div className={styles.bar} role="region" aria-label="Unsaved changes">
      <span className={styles.text}>
        Unsaved changes to {list}.
        {blocked.length > 0 && ` Fix ${blocked.join(' and ')} on ${blocked.length > 1 ? 'their pages' : 'its page'} first.`}
      </span>
      <span className={styles.buttons}>
        <button type="button" className={styles.discard} onClick={discardAll} disabled={saving}>Discard</button>
        <button type="button" className={styles.save} onClick={saveAll} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </span>
    </div>
  );
}

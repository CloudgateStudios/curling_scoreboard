import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import type { Club } from '../../types';
import common from '../../styles/common.module.css';
import styles from './ClubHeader.module.css';

interface Props {
  club: Club;
  /** Super admins only: the rules keep the club document from club admins. */
  canRename: boolean;
}

/** The club's name and ID, and renaming it. Scoreboards show the new name
 *  the next time they pair. */
export function ClubHeader({ club, canRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(club.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await updateDoc(doc(db, 'clubs', club.id), { name: name.trim() });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not rename the club.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={common.header}>
      <div className={styles.titleBlock}>
        {editing ? (
          <form onSubmit={handleSave} className={styles.renameForm}>
            <input
              className={`${common.input} ${styles.nameInput}`}
              aria-label="Club name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoFocus
            />
            <button type="submit" className={common.primaryButton} disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className={common.ghostButton} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <div className={styles.titleRow}>
            <h1 className={common.title}>{club.name}</h1>
            {canRename && (
              <button
                className={common.linkButton}
                onClick={() => {
                  setName(club.name);
                  setError('');
                  setEditing(true);
                }}
              >
                Rename
              </button>
            )}
          </div>
        )}
        <p className={common.subtitle}>ID: {club.id}</p>
        {error && <p className={common.error}>{error}</p>}
      </div>
    </div>
  );
}

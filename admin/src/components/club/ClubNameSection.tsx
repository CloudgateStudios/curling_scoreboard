import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import type { Club } from '../../types';
import common from '../../styles/common.module.css';
import styles from './ClubNameSection.module.css';

interface Props {
  club: Club;
  /** Super admins only: the rules keep the club document from club admins. */
  canRename: boolean;
}

/** The club's name and ID, and renaming it. Scoreboards show the new name
 *  the next time they pair. */
export function ClubNameSection({ club, canRename }: Props) {
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
    <div className={common.section}>
      <div className={common.sectionHeader}>
        <h2 className={common.sectionTitle}>Club</h2>
        {canRename && !editing && (
          <button
            className={common.linkButton}
            onClick={() => {
              setName(club.name);
              setError('');
              setEditing(true);
            }}
          >
            Rename <span className={common.adminTag}>Super admin</span>
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSave} className={styles.renameForm}>
          <input
            className={common.input}
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
        <dl className={styles.facts}>
          <dt>Name</dt>
          <dd>{club.name}</dd>
          <dt>ID</dt>
          <dd className={styles.id}>{club.id}</dd>
        </dl>
      )}
      {!canRename && (
        <p className={common.blurb}>Scoreboards show this name. Ask a super admin to change it.</p>
      )}
      {error && <p className={common.error}>{error}</p>}
    </div>
  );
}

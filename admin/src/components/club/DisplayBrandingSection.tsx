import { useEffect, useRef, useState } from 'react';
import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { MAX_TITLE_LENGTH, logoDataUrl } from '../../lib/displayBranding';
import { errorMessage } from '../../lib/format';
import { useUnsavedChanges } from '../../lib/unsavedChanges';
import common from '../../styles/common.module.css';
import styles from './DisplayBrandingSection.module.css';

interface Props {
  clubId: string;
  clubName: string;
}

interface Branding {
  title?: string;
  logo?: string;
}

// What the warm room shows without a title of the club's own.
const DEFAULT_TITLE = 'Live Scores';

/** The title and logo at the top of the club's warm room screen. Both are
 *  optional; without them it says "Live Scores". */
export function DisplayBrandingSection({ clubId, clubName }: Props) {
  const [saved, setSaved] = useState<Branding>({});
  const [title, setTitle] = useState('');
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<'save' | 'logo' | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'private', 'displayBranding'), (snap) => {
      const data = snap.data() ?? {};
      const next: Branding = {
        ...(typeof data.title === 'string' && { title: data.title }),
        ...(typeof data.logo === 'string' && { logo: data.logo }),
      };
      setSaved(next);
      setTitle(next.title ?? '');
      setLogo(next.logo);
    });
  }, [clubId]);

  const trimmedTitle = title.trim();
  const changed = trimmedTitle !== (saved.title ?? '') || logo !== saved.logo;
  useUnsavedChanges(changed);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('logo');
    setError('');
    try {
      setLogo(await logoDataUrl(file));
    } catch (err) {
      setError(errorMessage(err, 'Could not use that image.'));
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    setBusy('save');
    setError('');
    try {
      const ref = doc(db, 'clubs', clubId, 'private', 'displayBranding');
      if (!trimmedTitle && !logo) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, {
          ...(trimmedTitle && { title: trimmedTitle }),
          ...(logo && { logo }),
        });
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not save the warm room screen.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={common.section}>
      <h2 className={common.sectionTitle}>Warm Room Screen</h2>
      <p className={common.blurb}>
        The title and logo at the top of the warm room screen. Both are optional.
      </p>

      <label className={styles.field}>
        Title
        <input
          className={common.input}
          placeholder={`${DEFAULT_TITLE}, or e.g. ${clubName}`}
          maxLength={MAX_TITLE_LENGTH}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <div className={styles.preview} aria-label="Preview">
        {logo && <img className={styles.previewLogo} src={logo} alt="" />}
        <span className={styles.previewTitle}>{trimmedTitle || DEFAULT_TITLE}</span>
      </div>

      <div className={styles.actions}>
        <input
          ref={fileRef}
          className={styles.fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          onChange={handleFile}
        />
        <button className={common.ghostButton} onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === 'logo' ? 'Reading…' : logo ? 'Replace Logo' : 'Add Logo'}
        </button>
        {logo && (
          <button className={common.linkButton} onClick={() => setLogo(undefined)} disabled={busy !== null}>
            Remove logo
          </button>
        )}
        <button className={common.primaryButton} onClick={handleSave} disabled={!changed || busy !== null}>
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className={common.error}>{error}</p>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import {
  DEFAULT_ROCK_COLORS, ROCK_COLOR_PRESETS, isDefaultRockColors, rockColorsFrom,
} from '../../lib/rockColors';
import type { RockColor, RockColors, TeamSlot } from '../../types';
import styles from '../../pages/ClubDetail.module.css';

interface Props {
  clubId: string;
}

const SLOT_LABELS: Record<TeamSlot, string> = { team1: 'First color', team2: 'Second color' };

/** The two colors of rocks the club plays with, which its scoreboards use
 *  in place of red and yellow. */
export function RockColorsSection({ clubId }: Props) {
  const [saved, setSaved] = useState<RockColors>(DEFAULT_ROCK_COLORS);
  const [draft, setDraft] = useState<RockColors>(DEFAULT_ROCK_COLORS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Scoreboards read this document, so the colors live here and not on the
  // club document, which they cannot see.
  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'config', 'scoreboard'), (snap) => {
      const colors = rockColorsFrom(snap.data());
      setSaved(colors);
      setDraft(colors);
    });
  }, [clubId]);

  const sameColor = draft.team1.hex === draft.team2.hex;
  const changed = draft.team1.hex !== saved.team1.hex || draft.team2.hex !== saved.team2.hex;

  function choose(slot: TeamSlot, color: RockColor) {
    setDraft((current) => ({ ...current, [slot]: color }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      // Red and yellow are stored as no setting at all, so the scoreboard's
      // own defaults stay the single definition of them.
      await setDoc(
        doc(db, 'clubs', clubId, 'config', 'scoreboard'),
        { rockColors: isDefaultRockColors(draft) ? deleteField() : draft },
        { merge: true },
      );
    } catch (err) {
      setError(errorMessage(err, 'Could not save the rock colors.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Rock Colors</h2>
      <p className={styles.apiDocsBlurb}>
        The colors your scoreboards show and name the teams by. A change applies to the next game
        started on each paired scoreboard.
      </p>

      {(['team1', 'team2'] as const).map((slot) => (
        <div key={slot} className={styles.rockColorRow}>
          <span className={styles.rockColorLabel}>{SLOT_LABELS[slot]}</span>
          <div className={styles.rockColorSwatches} role="radiogroup" aria-label={SLOT_LABELS[slot]}>
            {ROCK_COLOR_PRESETS.map((color) => (
              <button
                key={color.hex}
                type="button"
                role="radio"
                aria-checked={draft[slot].hex === color.hex}
                aria-label={color.name}
                title={color.name}
                className={draft[slot].hex === color.hex ? styles.rockColorSwatchSelected : styles.rockColorSwatch}
                style={{ background: color.hex }}
                onClick={() => choose(slot, color)}
              />
            ))}
          </div>
          <span className={styles.rockColorName}>{draft[slot].name}</span>
        </div>
      ))}

      <div className={styles.rockColorActions}>
        <button
          className={styles.primaryButton}
          onClick={handleSave}
          disabled={saving || sameColor || !changed}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {!isDefaultRockColors(draft) && (
          <button className={styles.ghostButton} onClick={() => setDraft(DEFAULT_ROCK_COLORS)}>
            Back to Red and Yellow
          </button>
        )}
      </div>
      {sameColor && <p className={styles.error}>Choose two different colors.</p>}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

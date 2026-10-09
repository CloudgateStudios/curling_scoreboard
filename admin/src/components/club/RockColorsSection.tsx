import { useEffect, useState } from 'react';
import { deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import {
  DEFAULT_ROCK_COLORS, MAX_ROCK_COLOR_NAME_LENGTH, ROCK_COLOR_PRESETS, isDefaultRockColors,
  rockColorPreset, rockColorsFrom, rockColorsTooSimilar, rockTextColor, sameRockColor,
} from '../../lib/rockColors';
import type { RockColor, RockColors, TeamSlot } from '../../types';
import common from '../../styles/common.module.css';
import styles from './RockColorsSection.module.css';

interface Props {
  clubId: string;
}

const SLOT_LABELS: Record<TeamSlot, string> = { team1: 'First color', team2: 'Second color' };

const SLOTS = ['team1', 'team2'] as const;

/** Which slots are showing the custom color editor. */
type CustomSlots = Record<TeamSlot, boolean>;

function customSlotsFor(colors: RockColors): CustomSlots {
  return { team1: !rockColorPreset(colors.team1), team2: !rockColorPreset(colors.team2) };
}

/** The two colors of rocks the club plays with, which its scoreboards use
 *  in place of red and yellow. */
export function RockColorsSection({ clubId }: Props) {
  const [saved, setSaved] = useState<RockColors>(DEFAULT_ROCK_COLORS);
  const [draft, setDraft] = useState<RockColors>(DEFAULT_ROCK_COLORS);
  const [custom, setCustom] = useState<CustomSlots>({ team1: false, team2: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Scoreboards read this document, so the colors live here and not on the
  // club document, which they cannot see.
  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'config', 'scoreboard'), (snap) => {
      const colors = rockColorsFrom(snap.data());
      setSaved(colors);
      setDraft(colors);
      setCustom(customSlotsFor(colors));
    });
  }, [clubId]);

  const sameColor = draft.team1.hex.toUpperCase() === draft.team2.hex.toUpperCase();
  const tooSimilar = !sameColor && rockColorsTooSimilar(draft);
  const missingName = SLOTS.some((slot) => !draft[slot].name.trim());
  const changed = !sameRockColor(draft.team1, saved.team1) || !sameRockColor(draft.team2, saved.team2);

  function choosePreset(slot: TeamSlot, color: RockColor) {
    setDraft((current) => ({ ...current, [slot]: color }));
    setCustom((current) => ({ ...current, [slot]: false }));
  }

  function chooseCustom(slot: TeamSlot) {
    if (custom[slot]) return;
    // Start from the color already chosen, with a name left for the club to give it.
    setDraft((current) => ({ ...current, [slot]: { name: '', hex: current[slot].hex } }));
    setCustom((current) => ({ ...current, [slot]: true }));
  }

  function editCustom(slot: TeamSlot, change: Partial<RockColor>) {
    setDraft((current) => ({ ...current, [slot]: { ...current[slot], ...change } }));
  }

  function resetToDefaults() {
    setDraft(DEFAULT_ROCK_COLORS);
    setCustom(customSlotsFor(DEFAULT_ROCK_COLORS));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const colors: RockColors = {
      team1: { name: draft.team1.name.trim(), hex: draft.team1.hex.toUpperCase() },
      team2: { name: draft.team2.name.trim(), hex: draft.team2.hex.toUpperCase() },
    };
    try {
      // Red and yellow are stored as no setting at all, so the scoreboard's
      // own defaults stay the single definition of them.
      await setDoc(
        doc(db, 'clubs', clubId, 'config', 'scoreboard'),
        { rockColors: isDefaultRockColors(colors) ? deleteField() : colors },
        { merge: true },
      );
    } catch (err) {
      setError(errorMessage(err, 'Could not save the rock colors.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={common.section}>
      <h2 className={common.sectionTitle}>Rock Colors</h2>
      <p className={common.blurb}>
        The colors your scoreboards show and name the teams by. A change applies to the next game
        started on each paired scoreboard.
      </p>

      {SLOTS.map((slot) => (
        <div key={slot} className={styles.rockColorSlot}>
          <div className={styles.rockColorRow}>
            <span className={styles.rockColorLabel}>{SLOT_LABELS[slot]}</span>
            <div className={styles.rockColorSwatches} role="radiogroup" aria-label={SLOT_LABELS[slot]}>
              {ROCK_COLOR_PRESETS.map((color) => {
                const selected = !custom[slot] && sameRockColor(draft[slot], color);
                return (
                  <button
                    key={color.hex}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={color.name}
                    title={color.name}
                    className={selected ? styles.rockColorSwatchSelected : styles.rockColorSwatch}
                    style={{ background: color.hex }}
                    onClick={() => choosePreset(slot, color)}
                  />
                );
              })}
              <button
                type="button"
                role="radio"
                aria-checked={custom[slot]}
                aria-label="Custom color"
                title="Custom color"
                className={custom[slot] ? styles.rockColorSwatchSelected : styles.rockColorSwatch}
                style={{
                  background: custom[slot]
                    ? draft[slot].hex
                    : 'conic-gradient(#F44336, #FFEB3B, #4CAF50, #2196F3, #9C27B0, #F44336)',
                }}
                onClick={() => chooseCustom(slot)}
              />
            </div>
            {!custom[slot] && <span className={common.muted}>{draft[slot].name}</span>}
          </div>

          {custom[slot] && (
            <div className={styles.customColorRow}>
              <label className={styles.customColorField}>
                Color
                <input
                  type="color"
                  className={styles.colorInput}
                  value={draft[slot].hex.toLowerCase()}
                  onChange={(e) => editCustom(slot, { hex: e.target.value.toUpperCase() })}
                />
              </label>
              <label className={styles.customColorField}>
                Name
                <input
                  className={`${common.input} ${styles.customColorName}`}
                  placeholder="e.g. Navy"
                  maxLength={MAX_ROCK_COLOR_NAME_LENGTH}
                  value={draft[slot].name}
                  onChange={(e) => editCustom(slot, { name: e.target.value })}
                />
              </label>
              <code className={styles.customColorHex}>{draft[slot].hex.toUpperCase()}</code>
            </div>
          )}
        </div>
      ))}

      <div className={styles.rockPreview} aria-label="Scoreboard preview">
        {SLOTS.map((slot, i) => (
          <div
            key={slot}
            className={styles.rockPreviewTeam}
            style={{ background: draft[slot].hex, color: rockTextColor(draft[slot].hex) }}
          >
            <span className={styles.rockPreviewScore}>{i === 0 ? 3 : 2}</span>
            <span className={styles.rockPreviewName}>{draft[slot].name.trim() || 'Unnamed'}</span>
          </div>
        ))}
      </div>
      <p className={styles.rockPreviewCaption}>How the score looks on your scoreboards.</p>

      <div className={styles.rockColorActions}>
        <button
          className={common.primaryButton}
          onClick={handleSave}
          disabled={saving || sameColor || missingName || !changed}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {!isDefaultRockColors(draft) && (
          <button className={common.ghostButton} onClick={resetToDefaults}>
            Back to Red and Yellow
          </button>
        )}
      </div>
      {sameColor && <p className={common.error}>Choose two different colors.</p>}
      {tooSimilar && (
        <p className={common.warning}>
          These two colors look alike and may be hard to tell apart across the rink.
        </p>
      )}
      {missingName && <p className={common.error}>Give each custom color a name.</p>}
      {error && <p className={common.error}>{error}</p>}
    </div>
  );
}

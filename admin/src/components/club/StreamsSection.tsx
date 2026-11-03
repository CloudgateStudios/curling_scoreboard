import { useEffect, useRef, useState } from 'react';
import { deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import { useUnsavedChanges } from '../../lib/unsavedChanges';
import {
  DEFAULT_STREAM_TEMPLATES, MAX_DESCRIPTION_TEMPLATE_LENGTH, MAX_TITLE_LENGTH, MAX_TITLE_TEMPLATE_LENGTH,
  STREAM_KINDS, STREAM_VARIABLES, previewStream, streamTemplatesFrom, streamTemplatesToSave,
  unknownStreamVariables, type StreamKind, type StreamTemplate, type StreamTemplates,
} from '../../lib/streamMessage';
import common from '../../styles/common.module.css';
import styles from './StreamsSection.module.css';

interface Props {
  clubId: string;
}

type Field = keyof StreamTemplate;

const same = (a: StreamTemplates, b: StreamTemplates) =>
  STREAM_KINDS.every(({ kind }) => a[kind].title === b[kind].title && a[kind].description === b[kind].description);

/** The title and description the API's /now gives a stream on a sheet, for
 *  each kind of answer: a league draw, a bonspiel game, or nothing. */
export function StreamsSection({ clubId }: Props) {
  const [saved, setSaved] = useState<StreamTemplates>(DEFAULT_STREAM_TEMPLATES);
  const [draft, setDraft] = useState<StreamTemplates>(DEFAULT_STREAM_TEMPLATES);
  const [kind, setKind] = useState<StreamKind>('league');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Where a variable goes when its chip is clicked: the field last used.
  const [field, setField] = useState<Field>('title');
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'config', 'stream'), (snap) => {
      const templates = streamTemplatesFrom(snap.get('templates'));
      setSaved(templates);
      setDraft(templates);
    });
  }, [clubId]);

  const changed = !same(draft, saved);
  const template = draft[kind];
  const isGame = kind !== 'none';
  const before = previewStream(kind, template, false);
  const after = isGame ? previewStream(kind, template, true) : null;
  const tooLong = Math.max(before.titleLength, after?.titleLength ?? 0) > MAX_TITLE_LENGTH;
  const misspelled = unknownStreamVariables(`${template.title} ${template.description}`);
  const variables = STREAM_VARIABLES.filter((v) => v.kinds.includes(kind));
  const isDefault = template.title === DEFAULT_STREAM_TEMPLATES[kind].title
    && template.description === DEFAULT_STREAM_TEMPLATES[kind].description;

  useUnsavedChanges(changed);

  function edit(key: Field, value: string) {
    setDraft((current) => ({ ...current, [kind]: { ...current[kind], [key]: value } }));
  }

  // Puts the variable where the cursor is, or in place of the selection.
  function insertVariable(name: string) {
    const input = field === 'title' ? titleRef.current : descriptionRef.current;
    const value = template[field];
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const token = `{${name}}`;
    edit(field, value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const templates = streamTemplatesToSave(draft);
      // The defaults are stored as no setting, so they stay defined in one place.
      await setDoc(
        doc(db, 'clubs', clubId, 'config', 'stream'),
        { templates: templates ?? deleteField() },
        { merge: true },
      );
    } catch (err) {
      setError(errorMessage(err, 'Could not save the stream titles.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={common.section}>
      <h2 className={common.sectionTitle}>Stream Titles</h2>
      <p className={common.blurb}>
        What a stream on a sheet is called, for a streaming tool that asks the API what is on the
        sheet now. A part in square brackets, like <code>[ · {'{matchup}'}]</code>, is left out until
        everything in it is known.
      </p>
      <p className={styles.hint}>
        <code className={styles.endpoint}>GET /api/v1/clubs/{clubId}/sheets/{'{sheetId}'}/now</code>
      </p>

      <div className={styles.kinds} role="tablist" aria-label="Kind of stream">
        {STREAM_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="tab"
            aria-selected={kind === k.kind}
            title={k.description}
            className={kind === k.kind ? styles.kindSelected : styles.kind}
            onClick={() => setKind(k.kind)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <label className={styles.field}>
        Title
        <input
          ref={titleRef}
          className={common.input}
          maxLength={MAX_TITLE_TEMPLATE_LENGTH}
          value={template.title}
          onFocus={() => setField('title')}
          onChange={(e) => edit('title', e.target.value)}
        />
      </label>
      <label className={styles.field}>
        Description
        <textarea
          ref={descriptionRef}
          className={`${common.input} ${styles.description}`}
          rows={4}
          maxLength={MAX_DESCRIPTION_TEMPLATE_LENGTH}
          value={template.description}
          onFocus={() => setField('description')}
          onChange={(e) => edit('description', e.target.value)}
        />
      </label>
      <div className={styles.templateTools}>
        <span className={styles.hint}>Click a variable to add it where the cursor is.</span>
        {!isDefault && (
          <button
            className={common.linkButton}
            onClick={() => setDraft((current) => ({ ...current, [kind]: DEFAULT_STREAM_TEMPLATES[kind] }))}
          >
            Reset to default
          </button>
        )}
      </div>
      <div className={styles.variableChips}>
        {variables.map((variable) => (
          <button
            key={variable.name}
            type="button"
            className={styles.variableChip}
            title={`${variable.description}, e.g. ${variable.sample}`}
            // Keeps the cursor in the field, so the variable goes where it was.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertVariable(variable.name)}
          >
            {`{${variable.name}}`}
          </button>
        ))}
      </div>
      {misspelled.length > 0 && (
        <p className={common.warning}>
          Not a variable, so it will be shown as written: {misspelled.map((name) => `{${name}}`).join(', ')}
        </p>
      )}
      {tooLong && (
        <p className={common.warning}>
          YouTube titles are up to {MAX_TITLE_LENGTH} characters, so longer ones are cut short at a word.
        </p>
      )}

      <div className={styles.preview}>
        <span className={styles.previewLabel}>{isGame ? 'Preview, before the teams are picked' : 'Preview'}</span>
        <p className={styles.previewTitle}>{before.title}</p>
        <p className={styles.previewText}>{before.description}</p>
      </div>
      {after && (
        <div className={styles.preview}>
          <span className={styles.previewLabel}>Once the teams are picked</span>
          <p className={styles.previewTitle}>{after.title}</p>
          <p className={styles.previewText}>{after.description}</p>
        </div>
      )}

      <div className={styles.actions}>
        <button className={common.primaryButton} onClick={handleSave} disabled={saving || !changed}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {changed && (
          <button className={common.ghostButton} onClick={() => setDraft(saved)} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className={common.error}>{error}</p>}
    </div>
  );
}

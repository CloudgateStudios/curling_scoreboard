import { useState } from 'react';
import common from '../styles/common.module.css';
import styles from './SecretField.module.css';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Makes a new one, for the New button. */
  onGenerate: () => string;
  hint?: string;
  inputMode?: 'text' | 'numeric';
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  title?: string;
}

/** A password or PIN made for someone else, shown so it can be copied and
 *  sent, with a button for a new one. It can still be typed over. */
export function SecretField({ id, label, value, onChange, onGenerate, hint, ...input }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Blocked: the value is on screen to copy by hand.
    }
  }

  return (
    <div className={common.label}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.row}>
        <input
          id={id}
          className={`${common.input} ${styles.input}`}
          autoComplete="off"
          spellCheck={false}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...input}
        />
        <button type="button" className={common.ghostButton} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <button type="button" className={common.ghostButton} onClick={() => onChange(onGenerate())}>New</button>
      </div>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}

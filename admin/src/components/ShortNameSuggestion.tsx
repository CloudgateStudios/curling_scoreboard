import { suggestShortName } from '../lib/leagues';
import common from '../styles/common.module.css';
import styles from './ShortNameSuggestion.module.css';

interface Props {
  name: string;
  shortName?: string;
  onUse: (shortName: string) => void;
}

/** Offers a short name worked out from the full one, while there is none. */
export function ShortNameSuggestion({ name, shortName, onUse }: Props) {
  const suggestion = shortName ? null : suggestShortName(name);
  if (!suggestion) return null;
  return (
    <button type="button" className={`${common.linkButton} ${styles.suggestion}`} onClick={() => onUse(suggestion)}>
      Use “{suggestion}”
    </button>
  );
}

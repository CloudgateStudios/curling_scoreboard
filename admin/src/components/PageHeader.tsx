import styles from './PageHeader.module.css';

interface Props {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** The page's guide in docs/guides, which opens in a new tab so a
   *  half-made change is not lost. */
  guide?: { path: string; title: string };
  /** Buttons for the page as a whole, at the other end. */
  actions?: React.ReactNode;
}

/** The top of every page: what it is, its guide, and what can be done to it. */
export function PageHeader({ title, subtitle, guide, actions }: Props) {
  return (
    <div className={styles.header}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {(guide || actions) && (
        <div className={styles.end}>
          {guide && (
            <a className={styles.guide} href={guide.path} target="_blank" rel="noopener">
              Guide: {guide.title}
            </a>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

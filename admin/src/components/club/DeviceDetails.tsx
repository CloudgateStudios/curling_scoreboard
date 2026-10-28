import styles from './DeviceDetails.module.css';

/** The fold-out list of what a scoreboard or display page reported, leaving
 *  out what it did not. */
export function DeviceDetails({ details }: { details: [string, string | null | undefined][] }) {
  return (
    <details className={styles.deviceDetails}>
      <summary>Device details</summary>
      <dl className={styles.deviceDetailList}>
        {details.map(
          ([label, value]) =>
            value && (
              <div key={label} style={{ display: 'contents' }}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ),
        )}
      </dl>
    </details>
  );
}

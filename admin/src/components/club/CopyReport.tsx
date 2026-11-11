import { useState } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { deviceReport } from '../../lib/systemHealth';
import type { Club, DisplayLink, Sheet } from '../../types';
import common from '../../styles/common.module.css';
import styles from './CopyReport.module.css';

/** Puts a plain text summary of every scoreboard, screen and service in the
 *  club on the clipboard, for an issue or a message. What it needs is read
 *  once, when it is pressed, so the page listens to nothing extra. */
export function CopyReport({ club, sheets }: { club: Club; sheets: Sheet[] }) {
  const [state, setState] = useState<'copying' | 'copied' | 'failed' | null>(null);

  async function copy() {
    setState('copying');
    try {
      // Safari only lets a click write to the clipboard straight away, so it
      // is handed the report as a promise rather than after the reads.
      if (typeof ClipboardItem !== 'undefined') {
        const blob = buildReport().then((text) => new Blob([text], { type: 'text/plain' }));
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      } else {
        await navigator.clipboard.writeText(await buildReport());
      }
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  async function buildReport(): Promise<string> {
    const clubId = club.id;
    const [links, scoreboard, displays, apiKey, publicScores, webhookStatus] = await Promise.all([
      getDocs(collection(db, 'clubs', clubId, 'displayLinks')),
      getDoc(doc(db, 'appConfig', 'scoreboard')),
      getDoc(doc(db, 'appConfig', 'displays')),
      getDoc(doc(db, 'clubs', clubId, 'private', 'apiKey')),
      getDoc(doc(db, 'clubs', clubId, 'private', 'publicScores')),
      getDoc(doc(db, 'clubs', clubId, 'private', 'webhookStatus')),
    ]);
    const hook = webhookStatus.data();
    return deviceReport({
      club,
      sheets,
      displays: links.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DisplayLink, 'id'>) })),
      now: new Date(),
      deployed: {
        scoreboard: (scoreboard.get('buildId') as string | undefined) ?? null,
        displays: (displays.get('buildId') as string | undefined) ?? null,
      },
      apiEnabled: apiKey.exists() ? apiKey.get('enabled') !== false : null,
      publicPage: publicScores.get('enabled') === true,
      webhook: hook?.at ? {
        at: hook.at.toDate(), ok: hook.ok === true, status: hook.status as number | undefined, error: hook.error as string | undefined,
      } : null,
    });
  }

  return (
    <span className={styles.copy}>
      {state === 'copied' && <span className={styles.muted}>Copied</span>}
      {state === 'failed' && <span className={common.error}>Could not copy the report.</span>}
      <button
        className={common.ghostButton}
        onClick={copy}
        disabled={state === 'copying'}
        title="A summary of every scoreboard, screen and service, for an issue or a message"
      >
        Copy report
      </button>
    </span>
  );
}

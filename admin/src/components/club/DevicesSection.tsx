import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { shortBuild } from '../../lib/deviceHealth';
import { formatAgo } from '../../lib/format';
import { deviceReport, type DeviceReportInput } from '../../lib/systemHealth';
import type { Club, DisplayLink, Sheet } from '../../types';
import { DisplayDeviceStatus } from './DisplayDeviceStatus';
import { SheetDeviceStatus } from './SheetDeviceStatus';
import common from '../../styles/common.module.css';
import styles from './DevicesSection.module.css';

interface Props {
  club: Club;
  sheets: Sheet[];
}

/** Every scoreboard and screen in the club with what it last reported, and
 *  how the club's API, public page and webhook are doing: everything needed
 *  to work out why something is not right, in one place. Read only. */
export function DevicesSection({ club, sheets }: Props) {
  const clubId = club.id;
  const [now, setNow] = useState(() => new Date());
  const [displays, setDisplays] = useState<DisplayLink[]>([]);
  const [scoreboardBuild, setScoreboardBuild] = useState<string | null>(null);
  const [displaysBuild, setDisplaysBuild] = useState<string | null>(null);
  const [apiEnabled, setApiEnabled] = useState<boolean | null>(null);
  const [publicPage, setPublicPage] = useState<boolean | null>(null);
  const [webhook, setWebhook] = useState<DeviceReportInput['webhook']>(null);
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => onSnapshot(collection(db, 'clubs', clubId, 'displayLinks'), (snap) => {
    setDisplays(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DisplayLink, 'id'>) })));
  }), [clubId]);

  useEffect(() => onSnapshot(doc(db, 'appConfig', 'scoreboard'), (snap) => {
    setScoreboardBuild((snap.get('buildId') as string | undefined) ?? null);
  }), []);

  useEffect(() => onSnapshot(doc(db, 'appConfig', 'displays'), (snap) => {
    setDisplaysBuild((snap.get('buildId') as string | undefined) ?? null);
  }), []);

  useEffect(() => onSnapshot(doc(db, 'clubs', clubId, 'private', 'apiKey'), (snap) => {
    setApiEnabled(snap.exists() ? snap.get('enabled') !== false : null);
  }), [clubId]);

  useEffect(() => onSnapshot(doc(db, 'clubs', clubId, 'private', 'publicScores'), (snap) => {
    setPublicPage(snap.get('enabled') === true);
  }), [clubId]);

  useEffect(() => onSnapshot(doc(db, 'clubs', clubId, 'private', 'webhookStatus'), (snap) => {
    const data = snap.data();
    setWebhook(data?.at ? {
      at: data.at.toDate(), ok: data.ok === true, status: data.status as number | undefined, error: data.error as string | undefined,
    } : null);
  }), [clubId]);

  const sortedSheets = [...sheets].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const sortedDisplays = [...displays].sort((a, b) => a.label.localeCompare(b.label));
  const sheetName = (id: string) => sheets.find((s) => s.id === id)?.name;

  async function copyReport() {
    const text = deviceReport({
      club, sheets, displays, now: new Date(),
      deployed: { scoreboard: scoreboardBuild, displays: displaysBuild },
      apiEnabled, publicPage, webhook,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  }

  const onOff = (value: boolean | null) =>
    value === null ? <span className={common.idleChip}>Not set</span>
      : value ? <span className={common.onlineChip}>On</span>
        : <span className={common.idleChip}>Off</span>;

  return (
    <div className={styles.devices}>
      <div className={styles.toolbar}>
        <span className={styles.muted}>
          Deployed: scoreboard {scoreboardBuild ? shortBuild(scoreboardBuild) : '…'}, displays {displaysBuild ? shortBuild(displaysBuild) : '…'}
        </span>
        <span className={styles.copy}>
          {copied === 'copied' && <span className={styles.muted}>Copied</span>}
          {copied === 'failed' && <span className={common.error}>Could not copy. Your browser blocked it.</span>}
          <button className={common.ghostButton} onClick={copyReport}>Copy report</button>
        </span>
      </div>

      <section className={common.section}>
        <h2 className={common.sectionTitle}>Scoreboards</h2>
        <div className={common.list}>
          {sortedSheets.map((sheet) => (
            <div key={sheet.id} className={styles.row}>
              <span className={styles.name}>{sheet.name}</span>
              <div className={styles.status}>
                {sheet.scoreboardUid ? (
                  <SheetDeviceStatus sheet={sheet} deployedBuildId={scoreboardBuild} now={now} />
                ) : (
                  <div className={common.rowMeta}><span className={common.unpairedChip}>No scoreboard</span></div>
                )}
              </div>
            </div>
          ))}
          {sheets.length === 0 && <p className={common.empty}>No sheets yet.</p>}
        </div>
      </section>

      <section className={common.section}>
        <h2 className={common.sectionTitle}>Screens</h2>
        <p className={common.blurb}>Each display link, and the screen last open on it. Screens are often switched off between events, so one not open is no problem.</p>
        <div className={common.list}>
          {sortedDisplays.map((link) => (
            <div key={link.id} className={styles.row}>
              <span className={styles.name}>{link.label}</span>
              <div className={styles.status}>
                <DisplayDeviceStatus device={link.device} deployedBuildId={displaysBuild} sheetName={sheetName} now={now} />
              </div>
            </div>
          ))}
          {displays.length === 0 && <p className={common.empty}>No display links yet.</p>}
        </div>
      </section>

      <section className={common.section}>
        <h2 className={common.sectionTitle}>Services</h2>
        <dl className={styles.services}>
          <dt>REST API</dt>
          <dd>{onOff(apiEnabled)}</dd>
          <dt>Public scores page</dt>
          <dd>{onOff(publicPage)}</dd>
          <dt>Webhook</dt>
          <dd>
            {webhook ? (
              <>
                <span className={webhook.ok ? common.onlineChip : common.errorChip}>
                  Last post {webhook.ok ? 'worked' : 'failed'}{webhook.status ? ` (${webhook.status})` : ''}
                </span>
                <span className={styles.muted}> {formatAgo(webhook.at, now)}{webhook.error ? `: ${webhook.error}` : ''}</span>
              </>
            ) : (
              <span className={common.idleChip}>No posts yet</span>
            )}
          </dd>
        </dl>
      </section>
    </div>
  );
}

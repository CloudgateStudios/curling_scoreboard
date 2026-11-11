import { useEffect, useState } from 'react';
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { activeLiveGame } from '../../lib/liveGame';
import { bonspielPath, leaguePath, type ClubSection } from '../../lib/clubPaths';
import {
  dateOf, drawsComingUp, drawsOnNow, localMinutes, setupSteps, timeOf,
  type ClubDraw, type SetupStepId,
} from '../../lib/clubNow';
import type { Bonspiel, Club, League, Sheet } from '../../types';
import { HealthSummary } from './SheetsSection';
import common from '../../styles/common.module.css';
import styles from './ClubOverview.module.css';

interface Props {
  club: Club;
  sheets: Sheet[];
  leagues: League[];
  bonspiels: Bonspiel[];
  /** Opens a path in the club, asking first if anything is unsaved. */
  onOpen: (path: string) => void;
  /** Opens one of the club's pages, which keeps unsaved edits. */
  onSection: (section: ClubSection) => void;
}

// Where each setup step is done.
const STEP_SECTIONS: Record<SetupStepId, ClubSection> = {
  sheets: 'sheets',
  scoreboards: 'sheets',
  timeZone: 'settings/club',
  pin: 'settings/scoreboards',
  schedule: 'leagues',
  publicPage: 'settings/public-page',
  webhook: 'settings/integrations',
};

/** The club at a glance: whether its scoreboards are well, what is on the
 *  ice now and next, the latest results, and what is left to set up. */
export function ClubOverview({ club, sheets, leagues, bonspiels, onOpen, onSection }: Props) {
  const clubId = club.id;
  const [now, setNow] = useState(() => new Date());
  const [deployedBuildId, setDeployedBuildId] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState<string | null | undefined>(undefined);
  const [pinSet, setPinSet] = useState<boolean | undefined>(undefined);
  const [publicPage, setPublicPage] = useState<boolean | undefined>(undefined);
  const [webhook, setWebhook] = useState<boolean | undefined>(undefined);

  // Keeps what is on now, and the live games' ages, moving.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => onSnapshot(doc(db, 'appConfig', 'scoreboard'), (snap) => {
    setDeployedBuildId((snap.get('buildId') as string | undefined) ?? null);
  }), []);

  useEffect(() => onSnapshot(doc(db, 'clubs', clubId, 'config', 'club'), (snap) => {
    const zone = snap.get('timeZone');
    setTimeZone(typeof zone === 'string' && zone !== '' ? zone : null);
  }), [clubId]);

  useEffect(() => onSnapshot(doc(db, 'clubs', clubId, 'private', 'scoreboardPin'), (snap) => {
    setPinSet(typeof snap.get('pin') === 'string');
  }), [clubId]);

  useEffect(() => onSnapshot(doc(db, 'clubs', clubId, 'private', 'publicScores'), (snap) => {
    setPublicPage(snap.get('enabled') === true);
  }), [clubId]);

  useEffect(() => onSnapshot(doc(db, 'clubs', clubId, 'private', 'webhook'), (snap) => {
    setWebhook(typeof snap.get('url') === 'string');
  }), [clubId]);

  // Until the zone is known, the browser's clock stands in.
  const at = localMinutes(timeZone, now);
  const onNow = drawsOnNow(leagues, bonspiels, at);
  const comingUp = drawsComingUp(leagues, bonspiels, at);
  const steps = setupSteps({
    sheets, timeZone, pinSet, publicPage, webhook,
    leagueCount: leagues.length, bonspielCount: bonspiels.length,
  });
  const stepsKnown = timeZone !== undefined && pinSet !== undefined && publicPage !== undefined && webhook !== undefined;
  const required = steps.filter((s) => !s.optional);
  const left = steps.filter((s) => !s.done);

  const openDraw = (draw: ClubDraw) =>
    onOpen(draw.kind === 'league' ? leaguePath(clubId, draw.id) : bonspielPath(clubId, draw.id));

  return (
    <div className={styles.overview}>
      {sheets.length > 0 && <HealthSummary sheets={sheets} deployedBuildId={deployedBuildId} now={now} />}

      <div className={styles.grid}>
        <section className={`${common.section} ${styles.onIce}`}>
          <div className={common.sectionHeader}>
            <h2 className={common.sectionTitle}>On the ice now</h2>
            <button className={common.linkButton} onClick={() => onSection('sheets')}>Sheets →</button>
          </div>
          {onNow.length > 0 ? (
            <p className={styles.drawLine}>
              {onNow.map((draw, i) => (
                <span key={`${draw.kind}-${draw.id}-${draw.start}`}>
                  {i > 0 && ' · '}
                  <button className={common.linkButton} onClick={() => openDraw(draw)}>
                    {draw.name}{draw.label ? `, ${draw.label}` : ''}
                  </button>
                  <span className={styles.muted}> from {timeOf(draw.start)}</span>
                </span>
              ))}
            </p>
          ) : (
            <p className={styles.muted}>No league or bonspiel draw is on now.</p>
          )}
          {sheets.length === 0 ? (
            <p className={common.empty}>No sheets yet.</p>
          ) : (
            <div className={styles.sheets}>
              {[...sheets].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((sheet) => (
                <SheetNow key={sheet.id} sheet={sheet} now={now} />
              ))}
            </div>
          )}
        </section>

        <div className={styles.column}>
          <section className={common.section}>
            <h2 className={common.sectionTitle}>Coming up</h2>
            {comingUp.length === 0 ? (
              <p className={common.empty}>Nothing in the next week.</p>
            ) : (
              <ul className={styles.list}>
                {comingUp.map((draw) => (
                  <li key={`${draw.kind}-${draw.id}-${draw.start}`}>
                    <span className={styles.when}>{dayLabel(draw.start, at)} {timeOf(draw.start)}</span>
                    <button className={common.linkButton} onClick={() => openDraw(draw)}>
                      {draw.name}{draw.label ? `, ${draw.label}` : ''}
                    </button>
                    {draw.kind === 'bonspiel' && <span className={common.pairedChip}>Bonspiel</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <LatestResults clubId={clubId} sheets={sheets} onAll={() => onSection('games')} />
        </div>

        <div className={styles.column}>
          {stepsKnown && (
            <section className={common.section}>
              <div className={common.sectionHeader}>
                <h2 className={common.sectionTitle}>
                  {left.length === 0 ? 'All set up' : 'Finish setting up'}
                </h2>
                <span className={styles.muted}>
                  {required.filter((s) => s.done).length} of {required.length}
                </span>
              </div>
              {left.length === 0 ? (
                <p className={styles.muted}>Every step is done. Each one can be changed under its page.</p>
              ) : (
                <ul className={styles.steps}>
                  {steps.map((step) => (
                    <li key={step.id} className={step.done ? styles.stepDone : undefined}>
                      <span className={step.done ? styles.tickDone : styles.tick} aria-hidden="true">{step.done ? '✓' : ''}</span>
                      <span className={styles.stepLabel}>
                        {step.label}
                        {step.optional && !step.done && <span className={styles.muted}> (optional)</span>}
                      </span>
                      {!step.done && (
                        <button className={common.linkButton} onClick={() => onSection(STEP_SECTIONS[step.id])}>
                          Set up
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Today", "Tomorrow", or the weekday, for a time in the next week. */
function dayLabel(start: number, at: number): string {
  const day = dateOf(start);
  if (day === dateOf(at)) return 'Today';
  if (day === dateOf(at + 24 * 60)) return 'Tomorrow';
  return new Date(start * 60000).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}

/** One sheet's live score, or why it has none. */
function SheetNow({ sheet, now }: { sheet: Sheet; now: Date }) {
  const live = activeLiveGame(sheet.liveGame, now.getTime());
  return (
    <div className={styles.sheet}>
      <div className={styles.sheetTop}>
        <span className={styles.sheetName}>{sheet.name}</span>
        {live ? (
          <span className={common.liveChip}>End {live.currentEnd}</span>
        ) : sheet.scoreboardUid ? (
          <span className={common.idleChip}>No game</span>
        ) : (
          <span className={common.unpairedChip}>No scoreboard</span>
        )}
      </div>
      {live && (
        <div className={styles.score}>
          <span className={styles.team}>{live.team1.name}</span>
          <span className={styles.points}>{live.team1.score}</span>
          <span className={styles.team}>{live.team2.name}</span>
          <span className={styles.points}>{live.team2.score}</span>
        </div>
      )}
    </div>
  );
}

interface Result {
  key: string;
  sheetName: string;
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  finishedAt: Date;
}

const RESULTS_SHOWN = 5;

/** The club's last few finished games, from every sheet. */
function LatestResults({ clubId, sheets, onAll }: { clubId: string; sheets: Sheet[]; onAll: () => void }) {
  // Sheets update on every live score. Key the fetch on sheet ids and names
  // only, so a score change doesn't refetch every sheet's games.
  const sheetKey = JSON.stringify(sheets.map(({ id, name }) => ({ id, name })));
  const [results, setResults] = useState<{ key: string; games: Result[] } | null>(null);

  useEffect(() => {
    const sheetMeta = JSON.parse(sheetKey) as { id: string; name: string }[];
    if (sheetMeta.length === 0) return;
    const request = new AbortController();
    Promise.all(sheetMeta.map((sheet) =>
      getDocs(query(
        collection(db, 'clubs', clubId, 'sheets', sheet.id, 'games'),
        orderBy('finishedAt', 'desc'),
        limit(RESULTS_SHOWN),
      )).then((snap) => snap.docs.map((d): Result => {
        const data = d.data();
        return {
          key: `${sheet.id}/${d.id}`,
          sheetName: sheet.name,
          team1: data.team1?.name ?? '',
          team2: data.team2?.name ?? '',
          score1: data.team1?.totalScore ?? 0,
          score2: data.team2?.totalScore ?? 0,
          finishedAt: data.finishedAt?.toDate?.() ?? new Date(0),
        };
      })),
    )).then((all) => {
      if (request.signal.aborted) return;
      const games = all.flat().sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime()).slice(0, RESULTS_SHOWN);
      setResults({ key: sheetKey, games });
    }).catch(() => {
      if (!request.signal.aborted) setResults({ key: sheetKey, games: [] });
    });
    return () => request.abort();
  }, [clubId, sheetKey]);

  const loading = sheets.length > 0 && results?.key !== sheetKey;
  const games = sheets.length > 0 && !loading ? results!.games : [];

  return (
    <section className={common.section}>
      <div className={common.sectionHeader}>
        <h2 className={common.sectionTitle}>Latest results</h2>
        <button className={common.linkButton} onClick={onAll}>All games →</button>
      </div>
      {loading && <p className={common.empty}>Loading…</p>}
      {!loading && games.length === 0 && <p className={common.empty}>No finished games yet.</p>}
      {games.length > 0 && (
        <ul className={styles.list}>
          {games.map((g) => (
            <li key={g.key}>
              <span className={styles.when}>
                {g.finishedAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              <span className={styles.result}>
                <span className={g.score1 > g.score2 ? styles.winner : undefined}>{g.team1} {g.score1}</span>
                {' – '}
                <span className={g.score2 > g.score1 ? styles.winner : undefined}>{g.score2} {g.team2}</span>
              </span>
              <span className={styles.muted}>{g.sheetName}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

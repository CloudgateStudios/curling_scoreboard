import { useState } from 'react';
import { formatDrawStart, newBonspielId, sortedDraws } from '../../lib/bonspiels';
import {
  MAX_POOLS, MAX_TEMPLATE_EVENTS, MAX_TEMPLATE_TEAMS, type LoserRule, type ScheduleOptions, knockoutPlan, poolsPlan,
  shuffled,
} from '../../lib/bonspielTemplates';
import type { Bonspiel, Sheet } from '../../types';
import common from '../../styles/common.module.css';
import styles from './BonspielDialog.module.css';

interface Props {
  bonspiel: Bonspiel;
  sheets: Sheet[];
  /** The plan the template makes, to replace the bonspiel's events, draws and games. */
  onApply: (plan: Pick<Bonspiel, 'events' | 'draws' | 'games' | 'startDate' | 'endDate'>) => void;
  onClose: () => void;
}

const TIME = /^\d{2}:\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

type Format = 'knockout' | 'pools';

/** Fills a bonspiel in as a knockout, or as pools and playoffs: its events,
 *  every game with where its teams come from, and the draws they are played
 *  in. */
export function TemplateDialog({ bonspiel, sheets, onApply, onClose }: Props) {
  const first = sortedDraws(bonspiel.draws)[0];
  const [teams, setTeams] = useState(String(bonspiel.teams.length >= 2 ? Math.min(bonspiel.teams.length, MAX_TEMPLATE_TEAMS) : 16));
  const [format, setFormat] = useState<Format>('knockout');
  const [events, setEvents] = useState(4);
  const [pools, setPools] = useState(4);
  const [qualifiers, setQualifiers] = useState(1);
  const [losers, setLosers] = useState<LoserRule>('bySize');
  const [sheetIds, setSheetIds] = useState(() => sheets.map((s) => s.id));
  const [firstDrawStart, setFirstDrawStart] = useState(first?.start ?? `${bonspiel.startDate}T09:00`);
  const [dayStart, setDayStart] = useState('09:00');
  const [lastDrawStart, setLastDrawStart] = useState('19:00');
  const [minutes, setMinutes] = useState('150');
  const [drawOff, setDrawOff] = useState(false);
  const [shuffle, setShuffle] = useState(false);

  const teamCount = Number(teams);
  const interval = Number(minutes);
  const problem =
    !Number.isInteger(teamCount) || teamCount < 2 || teamCount > MAX_TEMPLATE_TEAMS
      ? `Choose 2 to ${MAX_TEMPLATE_TEAMS} teams.`
      : format === 'pools' && teamCount < pools * 2 ? `${pools} pools need at least ${pools * 2} teams.`
      : sheetIds.length === 0 ? 'Choose at least one sheet.'
        : !DATE_TIME.test(firstDrawStart) ? 'Give the first draw a start time.'
          : !TIME.test(dayStart) || !TIME.test(lastDrawStart) ? 'Give each day its first and last draw times.'
            : lastDrawStart < dayStart ? 'The last draw of the day starts before the first.'
              : !Number.isInteger(interval) || interval < 30 || interval > 600
                ? 'Draws have to be 30 to 600 minutes apart.' : null;

  const schedule: ScheduleOptions = {
    // In the order of the board, whatever order they were ticked in.
    sheetIds: sheets.map((s) => s.id).filter((id) => sheetIds.includes(id)),
    firstDrawStart,
    dayStart,
    lastDrawStart,
    minutesBetweenDraws: interval,
    drawOff,
  };
  const make = (order: Bonspiel['teams'], newId: () => string) => (format === 'pools'
    ? poolsPlan(order, { ...schedule, teams: teamCount, pools, qualifiers }, newId)
    : knockoutPlan(order, { ...schedule, teams: teamCount, events, losers }, newId));
  // Quick enough to work out afresh as each option changes, even for 64 teams.
  let previewId = 0;
  const preview = problem ? null : make(bonspiel.teams, () => `preview${previewId++}`);

  function handleApply() {
    if (problem) return;
    const order = shuffle ? shuffled(bonspiel.teams) : bonspiel.teams;
    const plan = make(order, newBonspielId);
    const draws = sortedDraws(plan.draws);
    onApply({
      ...plan,
      startDate: draws[0].start.slice(0, 10),
      endDate: draws[draws.length - 1].start.slice(0, 10),
    });
  }

  const previewDraws = preview ? sortedDraws(preview.draws) : [];

  return (
    <div className={common.modal} onClick={onClose}>
      <div className={`${common.modalCard} ${common.wideModalCard}`} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label="Template">
        <h2 className={common.modalTitle}>Fill in from a template</h2>
        <p className={common.blurb}>
          Fills in the events, the games and the draws they are played in. Everything it makes can be
          changed on the draw board afterwards.
        </p>

        <div className={common.form}>
          <div className={styles.results}>
            <label className={common.checkboxLabel}>
              <input type="radio" name="format" checked={format === 'knockout'} onChange={() => setFormat('knockout')} />
              Knockout, in one to four events
            </label>
            <label className={common.checkboxLabel}>
              <input type="radio" name="format" checked={format === 'pools'} onChange={() => setFormat('pools')} />
              Pools played as round robins, then playoffs
            </label>
          </div>
          <div className={styles.row}>
            <label className={common.label}>
              Teams
              <input type="number" min={2} max={MAX_TEMPLATE_TEAMS} className={common.input} value={teams}
                onChange={(e) => setTeams(e.target.value)} />
            </label>
            {format === 'pools' ? (
              <>
                <label className={common.label}>
                  Pools
                  <select className={common.input} value={pools} onChange={(e) => setPools(Number(e.target.value))}>
                    {Array.from({ length: MAX_POOLS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className={common.label}>
                  To the playoffs
                  <select className={common.input} value={qualifiers} onChange={(e) => setQualifiers(Number(e.target.value))}>
                    <option value={0}>None: the standings decide</option>
                    <option value={1}>Each pool's winner</option>
                    <option value={2}>The top two of each pool</option>
                    <option value={3}>The top three of each pool</option>
                  </select>
                </label>
              </>
            ) : (
            <label className={common.label}>
              Events
              <select className={common.input} value={events} onChange={(e) => setEvents(Number(e.target.value))}>
                {Array.from({ length: MAX_TEMPLATE_EVENTS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{['A', 'A and B', 'A, B and C', 'A, B, C and D'][n - 1]}</option>
                ))}
              </select>
            </label>
            )}
          </div>

          {format === 'knockout' && events > 1 && (
            <fieldset className={styles.side}>
              <legend className={styles.sideLegend}>Where losers go</legend>
              <div className={styles.results}>
                <label className={common.checkboxLabel}>
                  <input type="radio" name="losers" checked={losers === 'bySize'} onChange={() => setLosers('bySize')} />
                  Four event: A's first losers fill B to half the teams, the next fill C to a quarter, and B's first losers fill D to a quarter. Every final can be played in the last draw.
                </label>
                <label className={common.checkboxLabel}>
                  <input type="radio" name="losers" checked={losers === 'byRound'} onChange={() => setLosers('byRound')} />
                  By A round: first round losers to B, second round losers to C, and so on. Losing in B, C or D ends a team's bonspiel.
                </label>
                <label className={common.checkboxLabel}>
                  <input type="radio" name="losers" checked={losers === 'dropOne'} onChange={() => setLosers('dropOne')} />
                  Down one event: a loss in A drops a team to B, a loss in B to C. Losing in the last event ends it.
                </label>
              </div>
            </fieldset>
          )}

          <fieldset className={styles.side}>
            <legend className={styles.sideLegend}>Sheets</legend>
            <div className={styles.sideFields}>
              {sheets.map((sheet) => (
                <label key={sheet.id} className={common.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={sheetIds.includes(sheet.id)}
                    onChange={(e) => setSheetIds((ids) =>
                      e.target.checked ? [...ids, sheet.id] : ids.filter((id) => id !== sheet.id))}
                  />
                  {sheet.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.side}>
            <legend className={styles.sideLegend}>Draws</legend>
            <div className={common.form}>
              <div className={styles.row}>
                <label className={common.label}>
                  First draw
                  <input type="datetime-local" className={common.input} value={firstDrawStart}
                    onChange={(e) => setFirstDrawStart(e.target.value)} />
                </label>
                <label className={common.label}>
                  Minutes between draws
                  <input type="number" min={30} max={600} step={5} className={common.input} value={minutes}
                    onChange={(e) => setMinutes(e.target.value)} />
                </label>
              </div>
              <div className={styles.row}>
                <label className={common.label}>
                  Later days start at
                  <input type="time" className={common.input} value={dayStart} onChange={(e) => setDayStart(e.target.value)} />
                </label>
                <label className={common.label}>
                  Last draw starts by
                  <input type="time" className={common.input} value={lastDrawStart}
                    onChange={(e) => setLastDrawStart(e.target.value)} />
                </label>
              </div>
              <label className={common.checkboxLabel}>
                <input type="checkbox" checked={drawOff} onChange={(e) => setDrawOff(e.target.checked)} />
                Give teams a draw off between games where it can, even if that takes a draw or two more
              </label>
            </div>
          </fieldset>

          <label className={common.checkboxLabel}>
            <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
            {format === 'pools'
              ? 'Draw the pools from a hat. Otherwise teams are dealt into the pools in the order listed: the first to Pool A, the second to Pool B, and round again.'
              : 'Draw the first round from a hat. Otherwise teams play in the order listed, first against second, and any byes go to the teams listed first.'}
          </label>

          {problem && <p className={common.error}>{problem}</p>}
          {preview && (
            <div className={common.success}>
              {preview.games.length} games in {preview.events.map((e) => e.name.replace(' Event', '')).join(', ')}{' '}
              over {previewDraws.length} draws, {formatDrawStart(previewDraws[0].start)} to{' '}
              {formatDrawStart(previewDraws[previewDraws.length - 1].start)}.
            </div>
          )}
          {!problem && bonspiel.teams.length < teamCount && (
            <p className={common.warning}>
              {bonspiel.teams.length === 0 ? 'No teams are' : `Only ${bonspiel.teams.length} team${bonspiel.teams.length === 1 ? ' is' : 's are'}`}{' '}
              listed yet, so the rest of the first round is left to be decided.
            </p>
          )}
          {!problem && bonspiel.teams.length > teamCount && (
            <p className={common.warning}>Only the first {teamCount} teams listed are placed.</p>
          )}
          {bonspiel.games.length > 0 && (
            <p className={common.warning}>
              Replaces the {bonspiel.games.length} game{bonspiel.games.length !== 1 ? 's' : ''},{' '}
              {bonspiel.draws.length} draw{bonspiel.draws.length !== 1 ? 's' : ''} and events already planned,
              with any results given for them.
            </p>
          )}

          <div className={styles.actions}>
            <span className={styles.spacer} />
            <button type="button" className={common.ghostButton} onClick={onClose}>Cancel</button>
            <button type="button" className={common.primaryButton} onClick={handleApply} disabled={!!problem}>
              Fill In Bonspiel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

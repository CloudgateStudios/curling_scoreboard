import {
  DAY_NAMES, WEEK_DAYS, drawConflicts, formatConflict, scheduledDraws,
} from '../../lib/leagues';
import type { ScheduledDraw } from '../../lib/leagues';
import type { League } from '../../types';
import styles from '../../pages/ClubDetail.module.css';

interface Props {
  leagues: League[];
  onOpenLeague: (leagueId: string) => void;
}

const HOUR_HEIGHT_REM = 2.75;

interface Block {
  scheduled: ScheduledDraw;
  /** Which side by side column the block takes, of `lanes` in its group. */
  lane: number;
  lanes: number;
}

/** Lays out one day's draws, already in start order, so that draws at the
 *  same time sit side by side instead of on top of each other. */
function layOut(draws: ScheduledDraw[]): Block[] {
  const blocks: Block[] = [];
  let group: Block[] = [];
  let laneEnds: number[] = [];
  let groupEnd = 0;
  const closeGroup = () => {
    for (const block of group) block.lanes = laneEnds.length;
    blocks.push(...group);
    group = [];
    laneEnds = [];
  };
  for (const scheduled of draws) {
    if (group.length > 0 && scheduled.start >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= scheduled.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = scheduled.end;
    groupEnd = Math.max(groupEnd, scheduled.end);
    group.push({ scheduled, lane, lanes: 1 });
  }
  closeGroup();
  return blocks;
}

/** The week's draws on a calendar, Sunday first, with overlaps called out. */
export function LeagueWeek({ leagues, onOpenLeague }: Props) {
  const draws = scheduledDraws(leagues);
  if (draws.length === 0) return null;

  const conflicts = drawConflicts(leagues);
  const conflicted = new Set(conflicts.flatMap((c) => [c.a.draw, c.b.draw]));

  const firstHour = Math.floor(Math.min(...draws.map((d) => d.start)) / 60);
  const lastHour = Math.ceil(Math.max(...draws.map((d) => d.end)) / 60);
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const rem = (minutes: number) => `${(minutes / 60) * HOUR_HEIGHT_REM}rem`;

  return (
    <div className={styles.week}>
      {conflicts.length > 0 ? (
        <div className={styles.error}>
          <strong>
            {conflicts.length} overlap{conflicts.length !== 1 ? 's' : ''} in the schedule
          </strong>
          <ul className={styles.weekConflicts}>
            {conflicts.map((conflict, i) => (
              <li key={i}>{formatConflict(conflict)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={styles.success}>No draws overlap.</p>
      )}

      <div className={styles.weekScroll}>
        <div className={styles.weekGrid}>
          <div />
          {WEEK_DAYS.map((day) => (
            <div key={day} className={styles.weekDayName}>
              {DAY_NAMES[day - 1].slice(0, 3)}
            </div>
          ))}

          <div className={styles.weekHours} style={{ height: rem(hours.length * 60) }}>
            {hours.map((hour) => (
              <span key={hour} style={{ top: rem((hour - firstHour) * 60) }}>
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {WEEK_DAYS.map((day) => (
            <div
              key={day}
              className={styles.weekDay}
              style={{
                height: rem(hours.length * 60),
                backgroundSize: `100% ${HOUR_HEIGHT_REM}rem`,
              }}
            >
              {layOut(draws.filter((d) => d.draw.day === day)).map(
                ({ scheduled, lane, lanes }, i) => {
                  const { league, draw, start, end } = scheduled;
                  const className = [
                    styles.weekDraw,
                    conflicted.has(draw) ? styles.weekDrawConflict : '',
                    league.active ? '' : styles.weekDrawInactive,
                  ].join(' ');
                  return (
                    <button
                      key={i}
                      type="button"
                      className={className}
                      style={{
                        top: rem(start - firstHour * 60),
                        height: rem(end - start),
                        left: `${(lane / lanes) * 100}%`,
                        width: `${100 / lanes}%`,
                      }}
                      title={`${league.name}${league.active ? '' : ' (inactive)'} · ${draw.start}–${draw.end}`}
                      onClick={() => onOpenLeague(league.id)}
                    >
                      <span className={styles.weekDrawName}>{league.name}</span>
                      <span className={styles.weekDrawTime}>
                        {draw.start}–{draw.end}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { compareNatural, describeSide, earlierGames, sortedDraws, teamsPlacedInDraw } from '../../lib/bonspiels';
import type { Bonspiel, BonspielGame, BonspielSide, BonspielStateGame, Sheet, TeamSlot } from '../../types';
import common from '../../styles/common.module.css';
import styles from './BonspielDialog.module.css';

interface Props {
  bonspiel: Bonspiel;
  game: BonspielGame;
  sheets: Sheet[];
  /** How the functions last worked the game out, if it has been saved. */
  state: BonspielStateGame | undefined;
  isNew: boolean;
  onSave: (game: BonspielGame) => void;
  onRemove: (game: BonspielGame) => void;
  onClose: () => void;
}

type SideKind = 'tbd' | 'team' | 'winner' | 'loser';

const kindOf = (side: BonspielSide): SideKind =>
  side === null ? 'tbd' : 'teamId' in side ? 'team' : side.result;

/** One game of a bonspiel: where it is played, who is in it and, once it has
 *  been, how it went. Changes go back to the page, which saves them. */
export function GameDialog({ bonspiel, game: initial, sheets, state, isNew, onSave, onRemove, onClose }: Props) {
  const [game, setGame] = useState(initial);
  const change = (patch: Partial<BonspielGame>) => setGame((g) => ({ ...g, ...patch }));

  const draws = sortedDraws(bonspiel.draws);
  const sources = earlierGames(bonspiel, game);
  const placedElsewhere = teamsPlacedInDraw(bonspiel, game.drawId, game.id);
  const teams = [...bonspiel.teams].sort((a, b) => compareNatural(a.name, b.name));
  const recorded = state?.sheetGameId ? state : undefined;
  const recordedSheet = recorded && sheets.find((s) => s.id === recorded.sheetId)?.name;
  const plan = { teams: bonspiel.teams, games: bonspiel.games };

  function sidePicker(slot: TeamSlot, label: string) {
    const side = game[slot];
    const kind = kindOf(side);
    const setSide = (next: BonspielSide) => change({ [slot]: next });

    function setKind(next: SideKind) {
      if (next === 'tbd') return setSide(null);
      if (next === 'team') return setSide(teams[0] ? { teamId: teams[0].id } : null);
      // Keeps the game when only winner and loser are swapped.
      const from = side && 'from' in side ? side.from : sources[0]?.id;
      setSide(from ? { from, result: next } : null);
    }

    return (
      <fieldset className={styles.side}>
        <legend className={styles.sideLegend}>{label}</legend>
        <div className={styles.sideFields}>
          <select className={common.input} aria-label={`${label}: where from`} value={kind}
            onChange={(e) => setKind(e.target.value as SideKind)}>
            <option value="tbd">To be decided</option>
            <option value="team" disabled={teams.length === 0}>A team</option>
            <option value="winner" disabled={sources.length === 0}>Winner of a game</option>
            <option value="loser" disabled={sources.length === 0}>Loser of a game</option>
          </select>
          {side && 'teamId' in side && (
            <select className={common.input} aria-label={`${label}: team`} value={side.teamId}
              onChange={(e) => setSide({ teamId: e.target.value })}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || 'Unnamed team'}{placedElsewhere.has(t.id) ? ' (in another game this draw)' : ''}
                </option>
              ))}
            </select>
          )}
          {side && 'from' in side && (
            <select className={common.input} aria-label={`${label}: game`} value={side.from}
              onChange={(e) => setSide({ from: e.target.value, result: side.result })}>
              {sources.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label || 'Game'}: {describeSide(g.team1, plan)} vs {describeSide(g.team2, plan)}
                </option>
              ))}
            </select>
          )}
        </div>
      </fieldset>
    );
  }

  const result = game.result;
  const setScore = (slot: 'team1Score' | 'team2Score', value: string) => {
    if (!result) return;
    const { [slot]: _old, ...rest } = result;
    const score = Number(value);
    change({ result: value === '' || !Number.isInteger(score) || score < 0 ? rest : { ...rest, [slot]: score } });
  };
  const sideName = (slot: TeamSlot) => state?.[slot]?.name ?? describeSide(game[slot], plan);

  return (
    <div className={common.modal} onClick={onClose}>
      <div className={`${common.modalCard} ${common.wideModalCard}`} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label={`Game ${game.label}`}>
        <h2 className={common.modalTitle}>{isNew ? 'New game' : `Game ${initial.label}`}</h2>

        <div className={common.form}>
          <div className={styles.row}>
            <label className={common.label}>
              Name
              <input className={common.input} value={game.label} maxLength={20}
                onChange={(e) => change({ label: e.target.value })} />
            </label>
            <label className={common.label}>
              Event
              <select className={common.input} value={game.eventId} onChange={(e) => change({ eventId: e.target.value })}>
                {bonspiel.events.map((e) => <option key={e.id} value={e.id}>{e.name || 'Unnamed event'}</option>)}
              </select>
            </label>
          </div>
          <div className={styles.row}>
            <label className={common.label}>
              Draw
              <select className={common.input} value={game.drawId} onChange={(e) => change({ drawId: e.target.value })}>
                {draws.map((d) => <option key={d.id} value={d.id}>{d.label || 'Unnamed draw'}</option>)}
              </select>
            </label>
            <label className={common.label}>
              Sheet
              <select className={common.input} value={game.sheetId} onChange={(e) => change({ sheetId: e.target.value })}>
                {!sheets.some((s) => s.id === game.sheetId) && <option value={game.sheetId}>Removed sheet</option>}
                {sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>

          {sidePicker('team1', 'First rock color')}
          {sidePicker('team2', 'Second rock color')}

          <fieldset className={styles.side}>
            <legend className={styles.sideLegend}>Result</legend>
            {recorded && (
              <p className={common.blurb}>
                Played on {recordedSheet ?? 'a removed sheet'}: {recorded.team1?.name} {recorded.team1Score ?? ''}
                {' – '}{recorded.team2Score ?? ''} {recorded.team2?.name}
                {recorded.tied ? '. It was tied, so pick who goes on.' : '.'}
                {result && !recorded.tied && ' The result below is used in its place.'}
              </p>
            )}
            <div className={styles.results}>
              <label className={common.checkboxLabel}>
                <input type="radio" name="winner" checked={!result} onChange={() => change({ result: undefined })} />
                {recorded ? 'As played' : 'Not played yet'}
              </label>
              {(['team1', 'team2'] as const).map((slot) => (
                <label key={slot} className={common.checkboxLabel}>
                  <input type="radio" name="winner" checked={result?.winner === slot}
                    onChange={() => change({ result: { ...result, winner: slot } })} />
                  {sideName(slot)} won
                </label>
              ))}
            </div>
            {result && (
              <div className={styles.row}>
                <label className={common.label}>
                  {sideName('team1')}
                  <input type="number" min={0} max={99} className={common.input} placeholder="Score (optional)"
                    value={result.team1Score ?? ''} onChange={(e) => setScore('team1Score', e.target.value)} />
                </label>
                <label className={common.label}>
                  {sideName('team2')}
                  <input type="number" min={0} max={99} className={common.input} placeholder="Score (optional)"
                    value={result.team2Score ?? ''} onChange={(e) => setScore('team2Score', e.target.value)} />
                </label>
              </div>
            )}
          </fieldset>

          <div className={styles.actions}>
            {!isNew && (
              <button type="button" className={common.ghostButton}
                onClick={() => confirm(`Remove ${initial.label || 'this game'}? Games that come from it are left to be decided.`) && onRemove(initial)}>
                Remove Game
              </button>
            )}
            <span className={styles.spacer} />
            <button type="button" className={common.ghostButton} onClick={onClose}>Cancel</button>
            <button type="button" className={common.primaryButton} onClick={() => onSave(game)}>
              {isNew ? 'Add Game' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

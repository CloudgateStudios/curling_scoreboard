import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { errorMessage } from '../lib/format';
import { confirmLeave, useUnsavedChanges } from '../lib/unsavedChanges';
import {
  MAX_ENDS, addDays, bonspielData, bonspielFrom, bonspielProblems, compareNatural,
  duplicateBonspiel, formatDates, gamesPlacing, newBonspielId, nextDrawStart, parseTeamNames,
  sortedDraws, suggestedGameLabel, withoutGames, withoutTeam,
} from '../lib/bonspiels';
import type {
  AuthUser, Bonspiel, BonspielDraw, BonspielEvent, BonspielGame, BonspielState, BonspielTeam, Sheet,
} from '../types';
import { BracketView } from '../components/bonspiel/BracketView';
import { DrawBoard } from '../components/bonspiel/DrawBoard';
import { GameDialog } from '../components/bonspiel/GameDialog';
import { TemplateDialog } from '../components/bonspiel/TemplateDialog';
import common from '../styles/common.module.css';
import styles from './BonspielDetail.module.css';

interface Props {
  user: AuthUser;
}

const ENDS = Array.from({ length: MAX_ENDS }, (_, i) => i + 1);

/** One bonspiel: its details, events and teams, and the draw board its games
 *  are planned on. */
export function BonspielDetail({ user }: Props) {
  // Starts afresh for each bonspiel, such as one just duplicated from this
  // one, rather than carrying the last one's edits over.
  const { clubId, bonspielId } = useParams<{ clubId?: string; bonspielId: string }>();
  return <BonspielPage key={`${clubId}/${bonspielId}`} user={user} />;
}

function BonspielPage({ user }: Props) {
  // Super admin route: /clubs/:clubId/bonspiels/:bonspielId
  // Club and bonspiel admin route: /bonspiels/:bonspielId, in the club from their sign in
  const { clubId: routeClubId, bonspielId } = useParams<{ clubId?: string; bonspielId: string }>();
  const clubId = routeClubId ?? user.clubId;
  const navigate = useNavigate();

  const [bonspiel, setBonspiel] = useState<Bonspiel | null>(null);
  const [state, setState] = useState<BonspielState | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [missing, setMissing] = useState(false);
  const [dirty, setDirty] = useState(false);
  // The same flag for the snapshot listener, which must see the current
  // value without being set up again on every edit.
  const dirtyRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // The game open in the dialog: one already planned, or a new one for an
  // empty cell of the board.
  const [editing, setEditing] = useState<BonspielGame | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [templating, setTemplating] = useState(false);
  // The draw board or the brackets, kept in the URL so a reload stays put.
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'brackets' ? 'brackets' : 'draws';
  useUnsavedChanges(dirty);

  function markDirty(value: boolean) {
    dirtyRef.current = value;
    setDirty(value);
  }

  const bonspielPath = (id: string) => (routeClubId ? `/clubs/${routeClubId}/bonspiels/${id}` : `/bonspiels/${id}`);
  // Back to the club's Bonspiels tab, which is where the bonspiel was opened from.
  const backTo = `${routeClubId ? `/clubs/${routeClubId}` : '/'}?tab=bonspiels`;

  useEffect(() => {
    if (!clubId || !bonspielId) return;
    const ref = doc(db, 'clubs', clubId, 'bonspiels', bonspielId);
    const unsubscribePlan = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return setMissing(true);
      // Unsaved edits are kept if the plan changes underneath, such as from
      // another coordinator; saving then overwrites it.
      setBonspiel((current) => (current && dirtyRef.current ? current : bonspielFrom(snap.id, snap.data())));
    });
    const unsubscribeState = onSnapshot(doc(ref, 'state', 'current'), (snap) => {
      setState(snap.exists() ? (snap.data() as BonspielState) : null);
    });
    return () => {
      unsubscribePlan();
      unsubscribeState();
    };
  }, [clubId, bonspielId]);

  useEffect(() => {
    if (!clubId) return;
    return onSnapshot(collection(db, 'clubs', clubId, 'sheets'), (snap) => {
      setSheets(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Sheet, 'id'>) }))
          .sort((a, b) => compareNatural(a.name, b.name)),
      );
    });
  }, [clubId]);

  const sheetIds = useMemo(() => new Set(sheets.map((s) => s.id)), [sheets]);
  const problems = useMemo(
    () => (bonspiel && sheets.length > 0 ? bonspielProblems(bonspiel, sheetIds) : []),
    [bonspiel, sheets.length, sheetIds],
  );

  function edit(change: Partial<Bonspiel> | ((current: Bonspiel) => Bonspiel)) {
    setBonspiel((current) => {
      if (!current) return current;
      return typeof change === 'function' ? change(current) : { ...current, ...change };
    });
    markDirty(true);
  }

  function editEvent(id: string, change: Partial<BonspielEvent>) {
    edit((b) => ({ ...b, events: b.events.map((e) => (e.id === id ? { ...e, ...change } : e)) }));
  }

  function editTeam(id: string, change: Partial<BonspielTeam>) {
    edit((b) => ({ ...b, teams: b.teams.map((t) => (t.id === id ? { ...t, ...change } : t)) }));
  }

  function editDraw(id: string, change: Partial<BonspielDraw>) {
    edit((b) => ({ ...b, draws: b.draws.map((d) => (d.id === id ? { ...d, ...change } : d)) }));
  }

  function handleDates(startDate: string, endDate: string) {
    // A start moved past the end takes the end with it, which saves fixing
    // both for a bonspiel just added. Draws stay put: any now outside the
    // dates are listed as problems.
    edit({ startDate, endDate: endDate && startDate > endDate ? startDate : endDate });
  }

  function addEvent() {
    const letter = String.fromCharCode('A'.charCodeAt(0) + bonspiel!.events.length);
    edit((b) => ({ ...b, events: [...b.events, { id: newBonspielId(), name: `${letter} Event` }] }));
  }

  function addTeams() {
    const known = new Set(bonspiel!.teams.map((t) => t.name.trim().toLowerCase()));
    const names = parseTeamNames(pasted).filter((n) => !known.has(n.toLowerCase()));
    edit((b) => ({ ...b, teams: [...b.teams, ...names.map((name) => ({ id: newBonspielId(), name }))] }));
    setPasted('');
    setPasting(false);
  }

  function removeTeam(team: BonspielTeam) {
    const placed = gamesPlacing(bonspiel!, team.id);
    if (placed > 0 && !confirm(`${team.name || 'This team'} is placed in ${placed} game${placed !== 1 ? 's' : ''}. Remove it, leaving ${placed !== 1 ? 'those' : 'that'} to be decided?`)) return;
    edit((b) => withoutTeam(b, team.id));
  }

  function addDraw() {
    edit((b) => ({
      ...b,
      draws: [...b.draws, { id: newBonspielId(), label: `Draw ${b.draws.length + 1}`, start: nextDrawStart(b) }],
    }));
  }

  function removeDraw(draw: BonspielDraw) {
    const games = bonspiel!.games.filter((g) => g.drawId === draw.id);
    if (games.length > 0 && !confirm(`Remove ${draw.label || 'this draw'} and its ${games.length} game${games.length !== 1 ? 's' : ''}?`)) return;
    edit((b) => ({ ...withoutGames(b, new Set(games.map((g) => g.id))), draws: b.draws.filter((d) => d.id !== draw.id) }));
  }

  function newGame(drawId: string, sheetId: string) {
    const b = bonspiel!;
    const eventId = b.events[0]?.id ?? '';
    setEditing({
      id: newBonspielId(),
      label: suggestedGameLabel(b, eventId),
      drawId,
      sheetId,
      eventId,
      team1: null,
      team2: null,
    });
  }

  function saveGame(game: BonspielGame) {
    edit((b) => ({
      ...b,
      games: b.games.some((g) => g.id === game.id)
        ? b.games.map((g) => (g.id === game.id ? game : g))
        : [...b.games, game],
    }));
    setEditing(null);
  }

  function removeGame(game: BonspielGame) {
    edit((b) => withoutGames(b, new Set([game.id])));
    setEditing(null);
  }

  async function handleSave() {
    if (!bonspiel || !clubId || problems.length > 0) return;
    setSaving(true);
    setError('');
    try {
      await setDoc(doc(db, 'clubs', clubId, 'bonspiels', bonspiel.id), bonspielData(bonspiel));
      markDirty(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the bonspiel.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!bonspiel || !clubId) return;
    if (!confirm(`Delete ${bonspiel.name} and all of its draws and results? Games already played stay in each sheet's history.`)) return;
    try {
      await deleteDoc(doc(db, 'clubs', clubId, 'bonspiels', bonspiel.id));
      markDirty(false);
      navigate(backTo);
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the bonspiel.'));
    }
  }

  if (missing) {
    return (
      <div>
        <button className={common.backButton} onClick={() => navigate(backTo)}>← Back</button>
        <p className={common.empty}>This bonspiel no longer exists.</p>
      </div>
    );
  }
  if (!bonspiel) return <p style={{ color: '#666', padding: '2rem 0' }}>Loading…</p>;

  const draws = sortedDraws(bonspiel.draws);

  return (
    <div>
      <div className={common.breadcrumb}>
        <button className={common.backButton} onClick={() => confirmLeave() && navigate(backTo)}>← Back</button>
      </div>

      {/* Stays in view while scrolling down the board, so saving is never far away. */}
      <div className={styles.stickyHeader}>
        <div className={common.header}>
          <div>
            <h1 className={common.title}>{bonspiel.name || 'Bonspiel'}</h1>
            <p className={styles.subtitle}>
              {formatDates(bonspiel.startDate, bonspiel.endDate)} · {bonspiel.teams.length} team
              {bonspiel.teams.length !== 1 ? 's' : ''} · {bonspiel.games.length} game{bonspiel.games.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className={common.rowActions}>
            <button className={common.ghostButton} onClick={() => setDuplicating(true)} disabled={dirty}
              title={dirty ? 'Save your changes first' : undefined}>
              Duplicate
            </button>
            <button className={common.ghostButton} onClick={handleDelete}>Delete</button>
            <button
              className={common.primaryButton}
              onClick={handleSave}
              disabled={saving || !dirty || problems.length > 0}
            >
              {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
            </button>
          </div>
        </div>
        {error && <p className={common.error}>{error}</p>}
        {problems.length > 0 && (
          <div className={common.warning}>
            <strong>Fix {problems.length === 1 ? 'this' : 'these'} to save:</strong>
            <ul className={styles.problems}>
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className={styles.columns}>
        <div className={styles.column}>
          <div className={common.section}>
            <h2 className={common.sectionTitle}>Details</h2>
            <div className={common.form}>
              <label className={common.label}>
                Name
                <input
                  className={common.input}
                  value={bonspiel.name}
                  maxLength={80}
                  onChange={(e) => edit({ name: e.target.value })}
                />
              </label>
              <label className={common.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={bonspiel.active}
                  onChange={(e) => edit({ active: e.target.checked })}
                />
                Active: offered on scoreboards during its dates
              </label>
              <div className={styles.fieldRow}>
                <label className={common.label}>
                  Starts
                  <input
                    type="date"
                    className={common.input}
                    value={bonspiel.startDate}
                    onChange={(e) => handleDates(e.target.value, bonspiel.endDate)}
                  />
                </label>
                <label className={common.label}>
                  Ends
                  <input
                    type="date"
                    className={common.input}
                    value={bonspiel.endDate}
                    onChange={(e) => handleDates(bonspiel.startDate, e.target.value)}
                  />
                </label>
                <label className={common.label}>
                  Ends per game
                  <select
                    className={common.input}
                    value={bonspiel.numberOfEnds}
                    onChange={(e) => edit({ numberOfEnds: Number(e.target.value) })}
                  >
                    {ENDS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className={common.section}>
            <div className={common.sectionHeader}>
              <h2 className={common.sectionTitle}>Events ({bonspiel.events.length})</h2>
              <button className={common.ghostButton} onClick={addEvent}>+ Add Event</button>
            </div>
            <p className={common.blurb}>
              Each event ends in its own final. Games are placed in an event on the draw board.
            </p>
            {bonspiel.events.map((event) => {
              const inUse = bonspiel.games.filter((g) => g.eventId === event.id).length;
              const winner = state?.events[event.id]?.winner;
              return (
                <div key={event.id} className={styles.fieldRow}>
                  <input
                    className={common.input}
                    aria-label="Event name"
                    placeholder="Event name"
                    value={event.name}
                    maxLength={40}
                    onChange={(e) => editEvent(event.id, { name: e.target.value })}
                  />
                  <select
                    className={`${common.input} ${styles.endsInput}`}
                    aria-label="Ends per game"
                    value={event.numberOfEnds ?? ''}
                    onChange={(e) => editEvent(event.id, { numberOfEnds: e.target.value ? Number(e.target.value) : undefined })}
                  >
                    <option value="">{bonspiel.numberOfEnds} ends</option>
                    {ENDS.map((n) => <option key={n} value={n}>{n} ends</option>)}
                  </select>
                  <button
                    className={common.ghostButton}
                    disabled={inUse > 0}
                    title={inUse > 0 ? `Move or remove its ${inUse} game${inUse !== 1 ? 's' : ''} first` : undefined}
                    onClick={() => edit((b) => ({ ...b, events: b.events.filter((e) => e.id !== event.id) }))}
                  >
                    Remove
                  </button>
                  {winner && <span className={styles.winner}>Won by {winner.name}</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div className={common.section}>
          <div className={common.sectionHeader}>
            <h2 className={common.sectionTitle}>Teams ({bonspiel.teams.length})</h2>
            <div className={common.rowActions}>
              <button className={common.ghostButton} onClick={() => setPasting((p) => !p)}>Paste Teams</button>
              <button
                className={common.ghostButton}
                onClick={() => edit((b) => ({ ...b, teams: [...b.teams, { id: newBonspielId(), name: '' }] }))}
              >
                + Add Team
              </button>
            </div>
          </div>
          {pasting && (
            <div className={styles.paste}>
              <textarea
                className={`${common.input} ${styles.pasteInput}`}
                placeholder={'One team to a line, e.g.\nSmith\nJones'}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={6}
                autoFocus
              />
              <div className={common.rowActions}>
                <button className={common.primaryButton} onClick={addTeams} disabled={!pasted.trim()}>
                  Add {parseTeamNames(pasted).length || ''} Team{parseTeamNames(pasted).length === 1 ? '' : 's'}
                </button>
                <button className={common.ghostButton} onClick={() => setPasting(false)}>Cancel</button>
              </div>
            </div>
          )}
          {bonspiel.teams.map((team) => (
            <div key={team.id} className={styles.fieldRow}>
              <input
                className={common.input}
                aria-label="Team name"
                placeholder="Team name"
                value={team.name}
                maxLength={60}
                onChange={(e) => editTeam(team.id, { name: e.target.value })}
              />
              <button className={common.ghostButton} onClick={() => removeTeam(team)}>Remove</button>
            </div>
          ))}
          {bonspiel.teams.length === 0 && (
            <p className={common.empty}>No teams yet. Add them one at a time, or paste a list.</p>
          )}
        </div>
      </div>

      <div className={common.section}>
        <div className={`${common.sectionHeader} ${styles.boardHeader}`}>
          <div className={styles.viewTabs} role="tablist" aria-label="View">
            {(['draws', 'brackets'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className={view === v ? styles.viewTabSelected : styles.viewTab}
                onClick={() => setSearchParams(v === 'draws' ? {} : { view: v }, { replace: true })}
              >
                {v === 'draws' ? `Draws (${draws.length})` : 'Brackets'}
              </button>
            ))}
          </div>
          <div className={common.rowActions}>
            <button className={common.ghostButton} onClick={() => setTemplating(true)} disabled={sheets.length === 0}>
              Use a Template
            </button>
            {view === 'draws' && <button className={common.ghostButton} onClick={addDraw}>+ Add Draw</button>}
          </div>
        </div>
        {view === 'draws' ? (
          <>
            <p className={common.blurb}>
              A row for each draw and a column for each sheet. Tap a game to choose its teams, or an empty
              cell to add one. A team can come from the winner or loser of a game in an earlier draw, and
              fills in once that game has a result.
            </p>
            <DrawBoard
              bonspiel={bonspiel}
              draws={draws}
              sheets={sheets}
              state={state}
              onEditDraw={editDraw}
              onRemoveDraw={removeDraw}
              onOpenGame={(game) => setEditing(game)}
              onAddGame={newGame}
            />
          </>
        ) : (
          <BracketView
            bonspiel={bonspiel}
            sheets={sheets}
            state={state}
            onOpenGame={(game) => setEditing(game)}
            onTiebreak={(eventId, tiebreak) => editEvent(eventId, { tiebreak })}
          />
        )}
      </div>

      {editing && (
        <GameDialog
          bonspiel={bonspiel}
          game={editing}
          sheets={sheets}
          state={state?.games[editing.id]}
          isNew={!bonspiel.games.some((g) => g.id === editing.id)}
          onSave={saveGame}
          onRemove={removeGame}
          onClose={() => setEditing(null)}
        />
      )}

      {templating && (
        <TemplateDialog
          bonspiel={bonspiel}
          sheets={sheets}
          onApply={(plan) => {
            edit(plan);
            setTemplating(false);
          }}
          onClose={() => setTemplating(false)}
        />
      )}

      {duplicating && clubId && (
        <DuplicateDialog
          bonspiel={bonspiel}
          onDuplicate={async (name, startDate) => {
            const ref = await addDoc(
              collection(db, 'clubs', clubId, 'bonspiels'),
              bonspielData(duplicateBonspiel(bonspiel, name, startDate)),
            );
            setDuplicating(false);
            navigate(bonspielPath(ref.id));
          }}
          onClose={() => setDuplicating(false)}
        />
      )}
    </div>
  );
}

/** Asks for the name and first day of a copy of a bonspiel. */
function DuplicateDialog({ bonspiel, onDuplicate, onClose }: {
  bonspiel: Bonspiel;
  onDuplicate: (name: string, startDate: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(`${bonspiel.name} (copy)`);
  const [startDate, setStartDate] = useState(addDays(bonspiel.startDate, 364));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onDuplicate(name, startDate);
    } catch (err) {
      setError(errorMessage(err, 'Could not copy the bonspiel.'));
      setSaving(false);
    }
  }

  return (
    <div className={common.modal} onClick={onClose}>
      <form className={common.modalCard} onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2 className={common.modalTitle}>Duplicate {bonspiel.name}</h2>
        <p className={common.blurb}>
          The copy has the same events, draws and games, moved to its new dates. It starts with no
          teams and no results.
        </p>
        <div className={common.form}>
          <label className={common.label}>
            Name
            <input className={common.input} value={name} maxLength={80} required autoFocus
              onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={common.label}>
            Starts
            <input type="date" className={common.input} value={startDate} required
              onChange={(e) => setStartDate(e.target.value)} />
          </label>
          {error && <p className={common.error}>{error}</p>}
          <div className={common.modalActions}>
            <button type="button" className={common.ghostButton} onClick={onClose}>Cancel</button>
            <button type="submit" className={common.primaryButton} disabled={saving || !name.trim() || !startDate}>
              {saving ? 'Copying…' : 'Duplicate'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

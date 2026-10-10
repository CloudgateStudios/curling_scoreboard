import { useEffect, useRef, useState } from 'react';
import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { errorMessage } from '../lib/format';
import { confirmLeave, useUnsavedChanges } from '../lib/unsavedChanges';
import { DAY_NAMES, leagueData, leagueFrom, leagueProblem, newTeamId } from '../lib/leagues';
import type { AuthUser, League, LeagueDraw, LeagueTeam } from '../types';
import common from '../styles/common.module.css';
import styles from './LeagueDetail.module.css';

interface Props {
  user: AuthUser;
}

/** One league: its name, when it plays and the teams in it. */
export function LeagueDetail({ user }: Props) {
  // Super admin route: /clubs/:clubId/leagues/:leagueId
  // Club admin route:  /leagues/:leagueId, in the club from their sign in
  const { clubId: routeClubId, leagueId } = useParams<{ clubId?: string; leagueId: string }>();
  const clubId = routeClubId ?? user.clubId;
  const navigate = useNavigate();

  const [league, setLeague] = useState<League | null>(null);
  const [missing, setMissing] = useState(false);
  const [dirty, setDirty] = useState(false);
  // The same flag for the snapshot listener, which must see the current
  // value without being set up again on every edit.
  const dirtyRef = useRef(false);

  function markDirty(value: boolean) {
    dirtyRef.current = value;
    setDirty(value);
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useUnsavedChanges(dirty);

  // Back to the club's Leagues tab, which is where the league was opened from.
  const backTo = `${routeClubId ? `/clubs/${routeClubId}` : '/'}?tab=leagues`;

  useEffect(() => {
    if (!clubId || !leagueId) return;
    return onSnapshot(doc(db, 'clubs', clubId, 'leagues', leagueId), (snap) => {
      if (!snap.exists()) return setMissing(true);
      // Unsaved edits are kept if the league changes underneath, such as
      // from a CSV import in another tab; saving then overwrites it.
      setLeague((current) => (current && dirtyRef.current ? current : leagueFrom(snap.id, snap.data())));
    });
  }, [clubId, leagueId]);

  function edit(change: Partial<League>) {
    setLeague((current) => (current ? { ...current, ...change } : current));
    markDirty(true);
  }

  function editDraw(index: number, change: Partial<LeagueDraw>) {
    edit({ draws: league!.draws.map((d, i) => (i === index ? { ...d, ...change } : d)) });
  }

  function editTeam(id: string, change: Partial<LeagueTeam>) {
    edit({ teams: league!.teams.map((t) => (t.id === id ? { ...t, ...change } : t)) });
  }

  async function handleSave() {
    if (!league || !clubId) return;
    const problem = leagueProblem(league);
    if (problem) return setError(problem);
    setSaving(true);
    setError('');
    try {
      await setDoc(doc(db, 'clubs', clubId, 'leagues', league.id), leagueData(league));
      markDirty(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the league.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!league || !clubId) return;
    if (!confirm(`Delete ${league.name} and its ${league.teams.length} teams? Games already played are kept.`)) return;
    try {
      await deleteDoc(doc(db, 'clubs', clubId, 'leagues', league.id));
      navigate(backTo);
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the league.'));
    }
  }

  if (missing) {
    return (
      <div>
        <button className={common.backButton} onClick={() => navigate(backTo)}>← Back</button>
        <p className={common.empty}>This league no longer exists.</p>
      </div>
    );
  }
  if (!league) return <p style={{ color: '#666', padding: '2rem 0' }}>Loading…</p>;

  return (
    <div>
      <div className={common.breadcrumb}>
        <button className={common.backButton} onClick={() => confirmLeave() && navigate(backTo)}>← Back</button>
      </div>

      <div className={common.header}>
        <div>
          <h1 className={common.title}>{league.name || 'League'}</h1>
          <p className={common.subtitle}>
            {league.teams.length} team{league.teams.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className={common.rowActions}>
          <button className={common.ghostButton} onClick={handleDelete}>Delete League</button>
          <button className={common.primaryButton} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
          </button>
        </div>
      </div>

      {error && <p className={common.error}>{error}</p>}

      {/* Details and schedule beside the teams, so wide windows don't stretch every field. */}
      <div className={styles.columns}>
        <div className={styles.column}>
          <div className={common.section}>
            <h2 className={common.sectionTitle}>Details</h2>
            <div className={common.form}>
              <label className={common.label}>
                Name
                <input
                  className={common.input}
                  value={league.name}
                  maxLength={80}
                  onChange={(e) => edit({ name: e.target.value })}
                />
              </label>
              <label className={common.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={league.active}
                  onChange={(e) => edit({ active: e.target.checked })}
                />
                Active: offered on scoreboards when starting a league game
              </label>
              <div className={styles.leagueFieldRow}>
                <label className={common.label}>
                  Season starts
                  <input
                    type="date"
                    className={common.input}
                    value={league.seasonStart ?? ''}
                    onChange={(e) => edit({ seasonStart: e.target.value || undefined })}
                  />
                </label>
                <label className={common.label}>
                  Season ends
                  <input
                    type="date"
                    className={common.input}
                    value={league.seasonEnd ?? ''}
                    onChange={(e) => edit({ seasonEnd: e.target.value || undefined })}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className={common.section}>
            <div className={common.sectionHeader}>
              <h2 className={common.sectionTitle}>Schedule</h2>
              <button
                className={common.ghostButton}
                onClick={() => edit({ draws: [...league.draws, { day: 1, start: '18:30', end: '20:30' }] })}
              >
                + Add Draw
              </button>
            </div>
            <p className={common.blurb}>
              When this league plays each week. A scoreboard suggests the league when a game is started
              during one of its draws, using the scoreboard's own clock.
            </p>
            {league.draws.map((draw, index) => (
              // Draws have no identity of their own, and the list only changes
              // through this form, so the position is a stable enough key.
              <div key={index} className={styles.leagueFieldRow}>
                <select
                  className={common.input}
                  aria-label="Day"
                  value={draw.day}
                  onChange={(e) => editDraw(index, { day: Number(e.target.value) })}
                >
                  {DAY_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>{name}</option>
                  ))}
                </select>
                <input
                  type="time"
                  className={common.input}
                  aria-label="Start"
                  value={draw.start}
                  onChange={(e) => editDraw(index, { start: e.target.value })}
                />
                <input
                  type="time"
                  className={common.input}
                  aria-label="End"
                  value={draw.end}
                  onChange={(e) => editDraw(index, { end: e.target.value })}
                />
                <button
                  className={common.ghostButton}
                  onClick={() => edit({ draws: league.draws.filter((_, i) => i !== index) })}
                >
                  Remove
                </button>
              </div>
            ))}
            {league.draws.length === 0 && (
              <p className={common.empty}>
                No schedule. The league can still be picked by hand on a scoreboard.
              </p>
            )}
          </div>
        </div>

        <div className={common.section}>
          <div className={common.sectionHeader}>
            <h2 className={common.sectionTitle}>Teams ({league.teams.length})</h2>
            <button
              className={common.ghostButton}
              onClick={() => edit({ teams: [...league.teams, { id: newTeamId(), name: '' }] })}
            >
              + Add Team
            </button>
          </div>
          {league.teams.map((team) => (
            <div key={team.id} className={styles.leagueFieldRow}>
              <input
                className={common.input}
                aria-label="Team name"
                placeholder="Team name"
                value={team.name}
                maxLength={60}
                onChange={(e) => editTeam(team.id, { name: e.target.value })}
              />
              <input
                className={`${common.input} ${styles.externalIdInput}`}
                aria-label="External ID"
                placeholder="External ID (optional)"
                value={team.externalId ?? ''}
                maxLength={60}
                onChange={(e) => editTeam(team.id, { externalId: e.target.value.trim() || undefined })}
              />
              <button
                className={common.ghostButton}
                onClick={() => edit({ teams: league.teams.filter((t) => t.id !== team.id) })}
              >
                Remove
              </button>
            </div>
          ))}
          {league.teams.length === 0 && (
            <p className={common.empty}>No teams yet. Add them here, or import them from the club page.</p>
          )}
        </div>
      </div>
    </div>
  );
}

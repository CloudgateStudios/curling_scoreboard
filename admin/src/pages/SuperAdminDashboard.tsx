import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SystemShell } from '../components/SystemShell';
import { PageHeader } from '../components/PageHeader';
import { useSystemData } from '../hooks/useSystemData';
import { clubPath } from '../lib/clubPaths';
import { formatAgo } from '../lib/format';
import { matchClubs, problems, systemHealth, type ClubHealth, type ProblemKind } from '../lib/systemHealth';
import common from '../styles/common.module.css';
import styles from './SuperAdminDashboard.module.css';

const PROBLEM_LABELS: Record<ProblemKind, { label: string; chip: string }> = {
  syncError: { label: 'Sync error', chip: common.errorChip },
  offline: { label: 'Offline', chip: common.warningChip },
  updatePending: { label: 'Update pending', chip: common.warningChip },
  clock: { label: 'Clock out', chip: common.warningChip },
};

/** Problems first, then by name. */
const attention = (h: ClubHealth | undefined) => (h ? h.syncErrors * 100 + h.offline * 10 + h.updatePending : 0);

/** Every club at a glance: how their scoreboards are, what needs a look,
 *  and each club, for super admins. */
export function SuperAdminDashboard() {
  const navigate = useNavigate();
  const system = useSystemData();
  const clubs = system?.clubs ?? [];
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState('');

  // Keeps "seen 5m ago" and the online counts moving.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const sheets = system?.sheets ?? [];
  const displays = system?.displays ?? [];
  const deployed = system?.deployed ?? { scoreboard: null, displays: null };
  const { byClub, total } = systemHealth(sheets, displays, deployed, now.getTime());
  const found = problems(sheets, displays, deployed, now.getTime());
  const clubName = (id: string) => clubs.find((c) => c.id === id)?.name ?? id;
  const shownClubs = matchClubs(clubs, search)
    .sort((a, b) => (search.trim() ? 0 : attention(byClub.get(b.id)) - attention(byClub.get(a.id))));

  return (
    <SystemShell>
      <PageHeader
        title="Overview"
        subtitle="Every club, updated live"
        actions={<button className={common.primaryButton} onClick={() => navigate('/new-club')}>+ New Club</button>}
      />

      <div className={styles.kpis}>
        <Kpi value={clubs.length} label={clubs.length === 1 ? 'club' : 'clubs'} />
        <Kpi value={total.online} label="scoreboards online" tone={total.online > 0 ? 'good' : undefined} />
        <Kpi value={total.offline} label="paired but offline" tone={total.offline > 0 ? 'warn' : undefined} />
        <Kpi value={total.syncErrors} label="sync errors today" tone={total.syncErrors > 0 ? 'bad' : undefined} />
        <Kpi value={total.live} label={total.live === 1 ? 'game on now' : 'games on now'} />
      </div>

      <section className={common.section}>
        <div className={common.sectionHeader}>
          <h2 className={common.sectionTitle}>Needs a look</h2>
          {found.length > 0 && <span className={styles.muted}>{found.length}</span>}
        </div>
        {found.length === 0 ? (
          <p className={styles.allGood}>Every paired scoreboard is online and up to date, and no open screen is behind.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Club</th><th>Where</th><th>What</th><th>Seen</th></tr>
              </thead>
              <tbody>
                {found.map((p) => (
                  <tr key={`${p.clubId}-${p.device}-${p.where}-${p.kind}`}>
                    <td><button className={common.linkButton} onClick={() => navigate(clubPath(p.clubId, 'devices'))}>{clubName(p.clubId)}</button></td>
                    <td>{p.where}{p.device === 'screen' && <span className={styles.muted}> · screen</span>}</td>
                    <td>
                      <span className={PROBLEM_LABELS[p.kind].chip}>{PROBLEM_LABELS[p.kind].label}</span>
                      {p.detail && <span className={styles.detail}>{p.detail}</span>}
                    </td>
                    <td className={styles.muted}>{p.since ? formatAgo(p.since, now) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={common.section}>
        <div className={common.sectionHeader}>
          <h2 className={common.sectionTitle}>Clubs</h2>
          <span className={styles.muted}>Problems first</span>
        </div>
        {clubs.length > 0 && (
          <input
            type="search"
            className={`${styles.input} ${styles.search}`}
            placeholder="Search clubs by name or ID"
            aria-label="Search clubs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        {system?.clubs === null && <p className={common.empty}>Loading…</p>}
        {system?.clubs && clubs.length === 0 && <p className={common.empty}>No clubs yet. Create one to get started.</p>}
        {clubs.length > 0 && shownClubs.length === 0 && <p className={common.empty}>No clubs match “{search.trim()}”.</p>}
        {shownClubs.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Club</th><th>Sheets</th><th>Scoreboards</th><th>On now</th><th>Screens open</th></tr>
              </thead>
              <tbody>
                {shownClubs.map((club) => {
                  const h = byClub.get(club.id);
                  return (
                    <tr key={club.id}>
                      <td>
                        <button className={common.linkButton} onClick={() => navigate(clubPath(club.id))}>{club.name}</button>
                        <span className={styles.clubIdInline}>{club.id}</span>
                      </td>
                      <td>{h?.sheets ?? 0}</td>
                      <td><HealthChips health={h} /></td>
                      <td>{h?.live ? `${h.live} game${h.live === 1 ? '' : 's'}` : <span className={styles.muted}>—</span>}</td>
                      <td>{h?.screensOpen ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </SystemShell>
  );
}

function Kpi({ value, label, tone }: { value: number; label: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className={styles.kpi}>
      <span className={tone ? styles[`kpi_${tone}`] : styles.kpiValue}>{value}</span>
      <span className={styles.kpiLabel}>{label}</span>
    </div>
  );
}

/** The worst of a club's scoreboard health, as chips. */
function HealthChips({ health }: { health: ClubHealth | undefined }) {
  if (!health || health.sheets === 0) return <span className={styles.muted}>No sheets</span>;
  const chips: React.ReactNode[] = [];
  if (health.syncErrors) chips.push(<span key="e" className={common.errorChip}>{health.syncErrors} sync error{health.syncErrors === 1 ? '' : 's'}</span>);
  if (health.offline) chips.push(<span key="o" className={common.warningChip}>{health.offline} offline</span>);
  if (health.updatePending) chips.push(<span key="u" className={common.warningChip}>{health.updatePending} update{health.updatePending === 1 ? '' : 's'} pending</span>);
  if (health.unpaired) chips.push(<span key="n" className={common.unpairedChip}>{health.unpaired} without a scoreboard</span>);
  if (chips.length === 0) chips.push(<span key="g" className={common.onlineChip}>All {health.online} online</span>);
  return <span className={styles.chips}>{chips}</span>;
}

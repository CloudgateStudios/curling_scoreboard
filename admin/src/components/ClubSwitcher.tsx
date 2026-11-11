import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSystemData } from '../hooks/useSystemData';
import { clubPath, type ClubSection } from '../lib/clubPaths';
import { matchClubs, systemHealth, type ClubHealth } from '../lib/systemHealth';
import { confirmLeave } from '../lib/unsavedChanges';
import common from '../styles/common.module.css';
import styles from './ClubSwitcher.module.css';

// The pages offered inside the club that matches best.
const CLUB_PAGES: { section: ClubSection; label: string }[] = [
  { section: 'users', label: 'Users' },
  { section: 'sheets', label: 'Sheets' },
  { section: 'bonspiels', label: 'Bonspiels' },
  { section: 'settings/club', label: 'Settings' },
];

const CLUBS_SHOWN = 6;

interface Item {
  key: string;
  path: string;
  label: string;
  sub?: string;
  health?: ClubHealth;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** For super admins: jump to any club, or a page in one, from the top bar
 *  or with ⌘K (Ctrl K). */
export function ClubSwitcher() {
  const system = useSystemData();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  // When it was opened, which is when the health shown in it is worked out.
  const [openedAt, setOpenedAt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setOpenedAt(Date.now());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const clubs = system?.clubs;
  const sheets = system?.sheets;
  const displays = system?.displays;
  const deployed = system?.deployed;
  const items = useMemo<Item[]>(() => {
    if (!clubs || !sheets || !displays || !deployed) return [];
    const { byClub } = systemHealth(sheets, displays, deployed, openedAt);
    const found = matchClubs(clubs, term).slice(0, CLUBS_SHOWN);
    const list: Item[] = found.map((club) => ({
      key: club.id, path: clubPath(club.id), label: club.name, sub: club.id, health: byClub.get(club.id),
    }));
    const best = term.trim() ? found[0] : undefined;
    if (best) {
      list.push(...CLUB_PAGES.map(({ section, label }) => ({
        key: `${best.id}/${section}`, path: clubPath(best.id, section), label: `${best.name} › ${label}`,
      })));
    }
    return list;
  }, [clubs, sheets, displays, deployed, term, openedAt]);

  if (!system) return null;

  function close() {
    setOpen(false);
    setTerm('');
    setActive(0);
  }

  function go(item: Item | undefined) {
    if (!item || !confirmLeave()) return;
    close();
    navigate(item.path);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setOpen(true);
          setOpenedAt(Date.now());
        }}
        aria-haspopup="dialog"
      >
        <span className={styles.triggerText}>Jump to a club…</span>
        <kbd className={styles.kbd}>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>

      {open && (
        <div className={styles.overlay} onMouseDown={close}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-label="Jump to a club"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              className={styles.input}
              placeholder="Club name or ID"
              aria-label="Club name or ID"
              aria-controls="club-switcher-results"
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
            <ul id="club-switcher-results" className={styles.results} role="listbox">
              {items.map((item, i) => (
                <li
                  key={item.key}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? styles.itemActive : styles.item}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                >
                  <span className={styles.itemText}>
                    {item.label}
                    {item.sub && <span className={styles.itemSub}>{item.sub}</span>}
                  </span>
                  {item.health && <HealthChip health={item.health} />}
                </li>
              ))}
              {clubs && items.length === 0 && <li className={styles.none}>No club matches.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function HealthChip({ health }: { health: ClubHealth }) {
  if (health.syncErrors) return <span className={common.errorChip}>{health.syncErrors} sync error{health.syncErrors === 1 ? '' : 's'}</span>;
  if (health.offline) return <span className={common.warningChip}>{health.offline} offline</span>;
  if (health.online) return <span className={common.onlineChip}>OK</span>;
  return null;
}

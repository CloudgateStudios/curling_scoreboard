import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { clubPath, type ClubSection } from '../../lib/clubPaths';
import { confirmLeave } from '../../lib/unsavedChanges';
import type { Club } from '../../types';
import type { SectionInfo } from './sections';
import styles from './ClubSidebar.module.css';

interface Props {
  club: Club;
  sections: SectionInfo[];
  /** The section open, or the one the open league, bonspiel or sheet belongs to. */
  current: ClubSection | undefined;
  counts: Partial<Record<ClubSection, number>>;
  /** Super admins get a way back to every club. */
  showAllClubs: boolean;
  /** On a league, bonspiel or a sheet's games, whose edits are lost by leaving.
   *  Moving between sections keeps them, since every section stays mounted. */
  onDetailPage: boolean;
  /** Phones only: the sidebar is a menu that slides in. */
  open: boolean;
  onClose: () => void;
}

const GROUP_LABELS = { club: null, settings: 'Settings', superAdmin: 'Super admin' } as const;

/** The club's pages, down the side on a laptop and as a menu on a phone. */
export function ClubSidebar({ club, sections, current, counts, showAllClubs, onDetailPage, open, onClose }: Props) {
  // Escape closes the menu on a phone.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function leaving(e: React.MouseEvent, keepsEdits: boolean) {
    if (!keepsEdits && !confirmLeave()) e.preventDefault();
  }

  const groups = (['club', 'settings', 'superAdmin'] as const)
    .map((group) => ({ group, items: sections.filter((s) => s.group === group) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      {open && <button type="button" className={styles.backdrop} aria-label="Close menu" onClick={onClose} />}
      <nav className={open ? styles.sidebarOpen : styles.sidebar} aria-label={club.name}>
        {showAllClubs && (
          <Link className={styles.allClubs} to="/" onClick={(e) => leaving(e, false)}>← All clubs</Link>
        )}
        <div className={styles.club}>
          <span className={styles.clubName}>{club.name}</span>
          <span className={styles.clubId}>{club.id}</span>
        </div>
        {groups.map(({ group, items }) => (
          <div key={group} className={styles.group}>
            {GROUP_LABELS[group] && (
              <span className={group === 'superAdmin' ? styles.groupLabelSuper : styles.groupLabel}>
                {GROUP_LABELS[group]}
              </span>
            )}
            {items.map((s) => {
              const selected = current === s.id;
              const count = counts[s.id];
              return (
                <Link
                  key={s.id}
                  to={clubPath(club.id, s.id)}
                  aria-current={selected && !onDetailPage ? 'page' : undefined}
                  className={selected ? styles.linkSelected : group === 'superAdmin' ? styles.linkSuper : styles.link}
                  onClick={(e) => leaving(e, !onDetailPage)}
                >
                  {s.label}
                  {count !== undefined && <span className={styles.count}>{count}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}

import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import type { AuthUser } from '../types';
import styles from './Layout.module.css';

interface Props {
  user: AuthUser;
  children: React.ReactNode;
}

export function Layout({ user, children }: Props) {
  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <span className={styles.brand}>Curling Scoreboard</span>
        <div className={styles.navRight}>
          <span className={styles.userInfo}>
            {user.email}
            <span className={styles.badge}>
              {user.role === 'superadmin' ? 'Super Admin' : 'Club Admin'}
            </span>
          </span>
          <button className={styles.signOut} onClick={() => signOut(auth)}>
            Sign Out
          </button>
        </div>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

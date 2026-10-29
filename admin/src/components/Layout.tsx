import { signOut } from "firebase/auth";
import { Link, useLocation } from "react-router-dom";
import { auth } from "../lib/firebase";
import { confirmLeave } from "../lib/unsavedChanges";
import type { AuthUser } from "../types";
import styles from "./Layout.module.css";

const ROLE_BADGES = {
  superadmin: "Super Admin",
  clubadmin: "Club Admin",
  bonspieladmin: "Bonspiel Admin",
};

interface Props {
  /** Nobody is signed in on a help page opened from a link. */
  user: AuthUser | null;
  children: React.ReactNode;
}

export function Layout({ user, children }: Props) {
  const onHelp = useLocation().pathname.startsWith("/help");

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <span className={styles.brand}>
          Curling Scoreboard<span className={styles.brandSuffix}> Admin</span>
        </span>
        <div className={styles.navRight}>
          {/* Help opens in a new tab, so a half-made change is not lost. */}
          {onHelp ? (
            <Link className={styles.navLink} to="/">{user ? "Portal" : "Sign In"}</Link>
          ) : (
            <a className={styles.navLink} href="/help" target="_blank" rel="noopener">Help</a>
          )}
          {user && (
            <>
              <span className={styles.userInfo}>
                <span className={styles.email} title={user.email ?? undefined}>{user.email}</span>
                <span className={styles.badge}>
                  {ROLE_BADGES[user.role ?? "clubadmin"]}
                </span>
              </span>
              <button className={styles.signOut} onClick={() => confirmLeave() && signOut(auth)}>
                Sign Out
              </button>
            </>
          )}
        </div>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

import { signOut } from "firebase/auth";
import { Link, useLocation } from "react-router-dom";
import { SWITCH_LABELS, useSystemData } from "../hooks/useSystemData";
import { ClubSwitcher } from "./ClubSwitcher";
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
          <span className={styles.brandName}>
            Curling Scoreboard<span className={styles.brandSuffix}> Admin</span>
          </span>
          {/* On phones the role moves here, under the name, to free the right side. */}
          {user && <span className={styles.brandRole}>{ROLE_BADGES[user.role ?? "clubadmin"]}</span>}
        </span>
        {user?.role === "superadmin" && !onHelp && <ClubSwitcher />}
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
      {!onHelp && <SwitchesOffBanner />}
      <main className={styles.main}>{children}</main>
    </div>
  );
}

/** For super admins, on every page while a service switch is off for every
 *  club, so one left off is not forgotten. */
function SwitchesOffBanner() {
  const off = useSystemData()?.switchesOff ?? [];
  if (off.length === 0) return null;
  const names = off.map((name, i) => (i === 0 ? SWITCH_LABELS[name] : SWITCH_LABELS[name].toLowerCase()));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return (
    <div className={styles.switchBanner} role="status">
      <span>{list} {off.length > 1 ? "are" : "is"} off for every club.</span>
      <Link to="/service" className={styles.switchBannerLink}>Service controls →</Link>
    </div>
  );
}

import { createContext, useContext, useEffect, useState } from 'react';
import { collection, collectionGroup, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ClubDisplay, ClubSheet, DeployedBuilds } from '../lib/systemHealth';
import type { Club, DisplayLink, Sheet } from '../types';

/** The service switches in adminConfig/switches, which the functions read;
 *  see functions/src/switches.ts. Each is on unless set to false. */
export const SWITCH_NAMES = ['api', 'scoresPage', 'displaySessions', 'pairing'] as const;

/** What each switch turns off, for the banner while one is off. */
export const SWITCH_LABELS: Record<(typeof SWITCH_NAMES)[number], string> = {
  api: 'The REST API',
  scoresPage: 'The public scores pages',
  displaySessions: 'Display sign-ins',
  pairing: 'Scoreboard pairing',
};

export interface SystemData {
  clubs: Club[] | null;
  sheets: ClubSheet[];
  displays: ClubDisplay[];
  deployed: DeployedBuilds;
  /** The switches turned off, empty until they are read. */
  switchesOff: (typeof SWITCH_NAMES)[number][];
}

const SystemDataContext = createContext<SystemData | null>(null);

/** Every club, sheet and display link, for super admins only. One listener
 *  each, shared by the overview, the club switcher and the switch banner.
 *  The rules let super admins read every club's sheets and links. */
export function SystemDataProvider({ children }: { children: React.ReactNode }) {
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [sheets, setSheets] = useState<ClubSheet[]>([]);
  const [displays, setDisplays] = useState<ClubDisplay[]>([]);
  const [deployed, setDeployed] = useState<DeployedBuilds>({ scoreboard: null, displays: null });
  const [switchesOff, setSwitchesOff] = useState<SystemData['switchesOff']>([]);

  useEffect(() => onSnapshot(collection(db, 'clubs'), (snap) => {
    setClubs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Club, 'id'>) })));
  }), []);

  // A sheet's club is the document two levels up its path.
  useEffect(() => onSnapshot(collectionGroup(db, 'sheets'), (snap) => {
    setSheets(snap.docs.map((d) => ({
      id: d.id, clubId: d.ref.parent.parent!.id, ...(d.data() as Omit<Sheet, 'id'>),
    })));
  }), []);

  useEffect(() => onSnapshot(collectionGroup(db, 'displayLinks'), (snap) => {
    setDisplays(snap.docs.map((d) => ({
      id: d.id, clubId: d.ref.parent.parent!.id, ...(d.data() as Omit<DisplayLink, 'id'>),
    })));
  }), []);

  useEffect(() => onSnapshot(doc(db, 'appConfig', 'scoreboard'), (snap) => {
    const scoreboard = (snap.get('buildId') as string | undefined) ?? null;
    setDeployed((d) => ({ ...d, scoreboard }));
  }), []);

  useEffect(() => onSnapshot(doc(db, 'appConfig', 'displays'), (snap) => {
    const displays = (snap.get('buildId') as string | undefined) ?? null;
    setDeployed((d) => ({ ...d, displays }));
  }), []);

  useEffect(() => onSnapshot(doc(db, 'adminConfig', 'switches'), (snap) => {
    const data = snap.data() ?? {};
    setSwitchesOff(SWITCH_NAMES.filter((name) => data[name] === false));
  }), []);

  return (
    <SystemDataContext.Provider value={{ clubs, sheets, displays, deployed, switchesOff }}>
      {children}
    </SystemDataContext.Provider>
  );
}

/** The system data, or null outside a super admin's portal. */
export function useSystemData(): SystemData | null {
  return useContext(SystemDataContext);
}

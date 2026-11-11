import { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DEFAULT_CLOCK, clockOf, type Clock } from '../lib/clock';

const ClubClockContext = createContext<Clock>(DEFAULT_CLOCK);

/** Reads the club's 12 or 24 hour clock once for every page in the club.
 *  Until it is read, or if it cannot be, times use the default. */
export function ClubClockProvider({ clubId, children }: { clubId: string; children: React.ReactNode }) {
  const [clock, setClock] = useState<Clock>(DEFAULT_CLOCK);

  useEffect(() => onSnapshot(
    doc(db, 'clubs', clubId, 'config', 'club'),
    (snap) => setClock(clockOf(snap.get('clock'))),
    () => setClock(DEFAULT_CLOCK),
  ), [clubId]);

  return <ClubClockContext.Provider value={clock}>{children}</ClubClockContext.Provider>;
}

/** The club's clock, for showing a time the club's way. */
export function useClubClock(): Clock {
  return useContext(ClubClockContext);
}

#!/usr/bin/env node
/**
 * Seed script for the dev Firestore environment.
 *
 * Prerequisites:
 *   1. Install dependencies: `npm install` (inside scripts/)
 *   2. Authenticate: `gcloud auth application-default login`
 *      OR set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   3. Run: `node seed-dev.js`
 *
 * What it creates:
 *   - 2 clubs (Windy City Curling, Milwaukee Curling Club)
 *   - 3 sheets under Windy City, 5 sheets under Milwaukee
 *   - 3 completed game records per sheet
 *   - 2 leagues with teams under each club
 *
 * The script is idempotent for clubs, sheets and leagues (uses set with merge).
 * Running it again appends additional game documents to each sheet.
 */

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'curling-scoreboard-dev';

initializeApp({ projectId: PROJECT_ID });

const db = getFirestore();

// ---------------------------------------------------------------------------
// Club + sheet definitions
// ---------------------------------------------------------------------------

const CLUBS = [
  {
    id: 'windy-city-curling',
    name: 'Windy City Curling',
    apiKey: 'dev-wcc-key-a1b2c3d4e5f6',
    sheets: [
      { id: 'sheet-1', name: 'Sheet 1' },
      { id: 'sheet-2', name: 'Sheet 2' },
      { id: 'sheet-3', name: 'Sheet 3' },
    ],
  },
  {
    id: 'milwaukee-curling',
    name: 'Milwaukee Curling Club',
    apiKey: 'dev-mcc-key-g7h8i9j0k1l2',
    sheets: [
      { id: 'sheet-1', name: 'Sheet 1' },
      { id: 'sheet-2', name: 'Sheet 2' },
      { id: 'sheet-3', name: 'Sheet 3' },
      { id: 'sheet-4', name: 'Sheet 4' },
      { id: 'sheet-5', name: 'Sheet 5' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Leagues, the same for every club. Team IDs are fixed so re-running the
// script leaves them alone.
// ---------------------------------------------------------------------------

const LEAGUES = [
  {
    id: 'monday-night',
    name: 'Monday Night',
    active: true,
    draws: [
      { day: 1, start: '18:30', end: '20:30' },
      { day: 1, start: '20:45', end: '22:45' },
    ],
    teams: ['Team Smith', 'Team Jones', 'Sweeping Beauties', 'Rock Stars', 'House Party', 'The Hog Liners']
      .map((name, i) => ({ id: `monday-${i + 1}`, name, externalId: String(1000 + i) })),
  },
  {
    id: 'thursday-doubles',
    name: 'Thursday Doubles',
    active: true,
    draws: [{ day: 4, start: '19:00', end: '21:00' }],
    teams: ['Stone Cold', 'Double Trouble', 'Two for the Show', 'Pebble Pushers']
      .map((name, i) => ({ id: `thursday-${i + 1}`, name })),
  },
];

// ---------------------------------------------------------------------------
// Game templates
// Each entry: { team (1 or 2), score }
// team 1 = "Red", team 2 = "Yellow"
// score 0 with team 1 = blank end (Red retains hammer in normal game)
// ---------------------------------------------------------------------------

const GAME_TEMPLATES = [
  // Game A — Red wins 8-5, Red has hammer first end
  {
    team1HasHammerFirstEnd: true,
    durationMinutes: 118,
    ends: [
      { team: 1, score: 2 }, // end 1
      { team: 2, score: 1 }, // end 2
      { team: 1, score: 2 }, // end 3
      { team: 2, score: 1 }, // end 4
      { team: 1, score: 3 }, // end 5
      { team: 2, score: 1 }, // end 6
      { team: 1, score: 1 }, // end 7
      { team: 2, score: 2 }, // end 8
    ],
  },
  // Game B — Yellow wins 8-6, Yellow has hammer first end
  {
    team1HasHammerFirstEnd: false,
    durationMinutes: 124,
    ends: [
      { team: 2, score: 2 }, // end 1
      { team: 1, score: 1 }, // end 2
      { team: 2, score: 3 }, // end 3
      { team: 1, score: 0 }, // end 4 — blank
      { team: 2, score: 2 }, // end 5
      { team: 1, score: 3 }, // end 6
      { team: 2, score: 1 }, // end 7
      { team: 1, score: 2 }, // end 8
    ],
  },
  // Game C — Red wins 6-4, Yellow has hammer first end
  {
    team1HasHammerFirstEnd: false,
    durationMinutes: 109,
    ends: [
      { team: 2, score: 2 }, // end 1
      { team: 1, score: 3 }, // end 2
      { team: 2, score: 1 }, // end 3
      { team: 1, score: 1 }, // end 4
      { team: 1, score: 0 }, // end 5 — blank
      { team: 2, score: 1 }, // end 6
      { team: 1, score: 2 }, // end 7
      { team: 1, score: 0 }, // end 8 — blank, still Red wins 6-4
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildGameDoc(template, startedAt) {
  const team1Name = 'Red';
  const team2Name = 'Yellow';
  const secondsPerEnd = (template.durationMinutes * 60) / 8;

  const ends = template.ends.map((entry, i) => ({
    endNumber: i + 1,
    scoringTeam: entry.score === 0 ? null : (entry.team === 1 ? team1Name : team2Name),
    score: entry.score,
    gameTimeInSeconds: Math.round(secondsPerEnd * (i + 1)),
  }));

  const team1Score = ends
    .filter((e) => e.scoringTeam === team1Name)
    .reduce((sum, e) => sum + e.score, 0);
  const team2Score = ends
    .filter((e) => e.scoringTeam === team2Name)
    .reduce((sum, e) => sum + e.score, 0);

  const finishedAt = new Date(startedAt.getTime() + template.durationMinutes * 60 * 1000);

  return {
    startedAt: Timestamp.fromDate(startedAt),
    finishedAt: Timestamp.fromDate(finishedAt),
    numberOfEnds: 8,
    team1: {
      name: team1Name,
      totalScore: team1Score,
      hadLastStoneFirstEnd: template.team1HasHammerFirstEnd,
    },
    team2: {
      name: team2Name,
      totalScore: team2Score,
      hadLastStoneFirstEnd: !template.team1HasHammerFirstEnd,
    },
    ends,
  };
}

// Spread the 3 games across the past 3 weeks, one per week, starting ~7pm.
function gameStartDates(baseOffsetDays) {
  const dates = [];
  for (let week = 0; week < 3; week++) {
    const d = new Date();
    d.setDate(d.getDate() - (21 - week * 7) - baseOffsetDays);
    d.setHours(19, 0, 0, 0);
    dates.push(d);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  console.log(`Seeding project: ${PROJECT_ID}\n`);

  for (const club of CLUBS) {
    const clubRef = db.collection('clubs').doc(club.id);
    await clubRef.set({ name: club.name }, { merge: true });
    await clubRef.collection('private').doc('apiKey').set({ key: club.apiKey });
    console.log(`Club: ${club.name} (API key: ${club.apiKey})`);

    for (const { id, ...league } of LEAGUES) {
      await clubRef.collection('leagues').doc(id).set(league, { merge: true });
      console.log(`  League: ${league.name} (${league.teams.length} teams)`);
    }

    for (let si = 0; si < club.sheets.length; si++) {
      const sheet = club.sheets[si];
      const sheetRef = clubRef.collection('sheets').doc(sheet.id);
      await sheetRef.set({ name: sheet.name }, { merge: true });
      console.log(`  Sheet: ${sheet.name}`);

      // Stagger start dates slightly per sheet so games don't all overlap.
      const starts = gameStartDates(si);

      for (let gi = 0; gi < GAME_TEMPLATES.length; gi++) {
        const doc = buildGameDoc(GAME_TEMPLATES[gi], starts[gi]);
        await sheetRef.collection('games').add(doc);
        const winner = doc.team1.totalScore > doc.team2.totalScore ? doc.team1.name : doc.team2.name;
        console.log(
          `    Game ${gi + 1}: ${doc.team1.name} ${doc.team1.totalScore} – ${doc.team2.totalScore} ${doc.team2.name} (${winner} wins)`,
        );
      }
    }

    console.log('');
  }

  console.log('Done.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

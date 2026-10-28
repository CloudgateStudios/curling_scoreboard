#!/usr/bin/env node
// Seeds the emulators with a club the smoke test can use, catches its
// webhook posts locally, and runs smoke-test.mjs against them with every
// check on. CI runs it on every pull request that touches the functions, so
// the script is known to work before it is pointed at a real project.
//
// Run it under the emulators, from the repo root after building functions/:
//
//   emulator-tests/node_modules/.bin/firebase emulators:exec \
//     --only firestore,auth,functions --project demo-smoke \
//     "node scripts/smoke-test-emulators.mjs"
//
// or `npm run test:smoke` in emulator-tests/, which does both.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT = 'demo-smoke';
const posts = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => { posts.push(JSON.parse(body)); res.writeHead(204); res.end(); });
}).listen(8099);

const db = getFirestore(initializeApp({ projectId: PROJECT }));
const club = db.collection('clubs').doc('smoke-club');
await club.set({ name: 'Smoke Club' });
await club.collection('sheets').doc('sheet-1').set({ name: 'Sheet 1', pairingCode: 'ABC123' });
await club.collection('private').doc('scoreboardPin').set({ pin: '4321' });
await club.collection('private').doc('apiKey').set({ key: '0123456789abcdef0123456789abcdef' });
await club.collection('private').doc('publicScores').set({ enabled: true });
await club.collection('private').doc('webhook').set({ url: 'http://127.0.0.1:8099/hook', games: 'all' });

// Not spawnSync: that would block this process, so the server above could
// not answer the webhook while the smoke test runs.
const child = spawn(process.execPath, [new URL('./smoke-test.mjs', import.meta.url).pathname], {
  stdio: 'inherit',
  env: {
    ...process.env, EMULATOR: PROJECT, PAIRING_CODE: 'abc123', ADMIN_PIN: '4321',
    CLUB_API_KEY: '0123456789abcdef0123456789abcdef', PUBLIC_SCORES: '1', ADMIN: '1',
  },
});
const status = await new Promise((resolve) => child.on('exit', resolve));
console.log(`\nWebhook posts received: ${posts.length}${posts[0] ? ` — "${posts[0].text}"` : ''}`);
server.close();
process.exit(status ?? 1);

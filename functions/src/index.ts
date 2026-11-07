import { MAX_INSTANCES } from './limits';
import { initializeApp } from 'firebase-admin/app';
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { clubsRouter } from './routes/clubs';
import { apiSwitch } from './middleware/apiSwitch';
export {
  provisionClub, setSuperAdminClaim, addClubAdmin, updateClubAdmin, removeClubAdmin, deleteSheet,
} from './admin';
export { pairSheet, unpairSheet } from './pairing';
export { sendCompletedGameWebhook, sendTestWebhook } from './webhook';
export { syncDisplayResults, syncDisplaySheet } from './display/triggers';
export { syncBonspielPlan, syncBonspielResult } from './bonspiels/triggers';
export {
  createDisplayLink, resetDisplayLink, revokeDisplayLink, startDisplaySession,
} from './display/links';
export { display } from './display/pages';

initializeApp();

const app = express();
// No answer may be kept by Hosting's CDN or anyone else. Without this the CDN
// keeps some answers, 404s at least, for ten minutes by its own default, and
// its copy is keyed by the URL alone, not the X-API-Key header, so it would
// hand one caller's answer to the next, key or no key. Each instance keeps
// answers in memory instead, after the key check (see keptAnswers).
app.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  res.vary('X-API-Key');
  next();
});

// Club websites and display pages call the API straight from the browser, so
// any origin may read it. That is safe because the API is read-only, every
// request is authenticated by the club's X-API-Key header rather than by
// cookies, and credentials are never allowed. Browsers may cache the preflight
// response for a day.
app.use(
  cors({
    origin: '*',
    methods: ['GET'],
    allowedHeaders: ['X-API-Key'],
    credentials: false,
    maxAge: 24 * 60 * 60,
  }),
);
app.use('/api/v1', apiSwitch, clubsRouter);
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// cors: false keeps firebase-functions from adding its own CORS handling in
// front of the app (the Functions emulator otherwise reflects every origin and
// answers preflight requests itself), so the policy above applies everywhere.
export const api = onRequest({ cors: false, maxInstances: MAX_INSTANCES.api }, app);

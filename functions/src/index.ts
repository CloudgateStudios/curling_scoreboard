import { initializeApp } from 'firebase-admin/app';
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { clubsRouter } from './routes/clubs';
export {
  provisionClub, setSuperAdminClaim, addClubAdmin, removeClubAdmin, deleteSheet,
} from './admin';
export { pairSheet, unpairSheet } from './pairing';
export { sendCompletedGameWebhook, sendTestWebhook } from './webhook';

initializeApp();

const app = express();
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
app.use('/api/v1', clubsRouter);

// cors: false keeps firebase-functions from adding its own CORS handling in
// front of the app (the Functions emulator otherwise reflects every origin and
// answers preflight requests itself), so the policy above applies everywhere.
export const api = onRequest({ cors: false }, app);

import { initializeApp } from 'firebase-admin/app';
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { clubsRouter } from './routes/clubs';
export { provisionClub, setSuperAdminClaim, addClubAdmin } from './admin';

initializeApp();

const app = express();
app.use(cors({ origin: true }));
app.use('/api/v1', clubsRouter);

export const api = onRequest(app);

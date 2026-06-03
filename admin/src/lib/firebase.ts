import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// Dev config — prod values injected via environment variables in CI
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyBvXa4W2zUJCFgH0Lz2fL_dev_placeholder',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'curling-scoreboard-dev.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'curling-scoreboard-dev',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'curling-scoreboard-dev.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '233388384349',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:233388384349:web:089c4df4fd9230c9076db4',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');

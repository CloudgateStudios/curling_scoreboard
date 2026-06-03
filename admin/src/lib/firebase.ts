import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const devConfig = {
  apiKey: 'AIzaSyDev_placeholder_replace_with_real_key',
  authDomain: 'curling-scoreboard-dev.firebaseapp.com',
  projectId: 'curling-scoreboard-dev',
  storageBucket: 'curling-scoreboard-dev.appspot.com',
  messagingSenderId: '233388384349',
  appId: '1:233388384349:web:089c4df4fd9230c9076db4',
};

const prodConfig = {
  apiKey: 'AIzaSyProd_placeholder_replace_with_real_key',
  authDomain: 'curling-scoreboard-prod.firebaseapp.com',
  projectId: 'curling-scoreboard-prod',
  storageBucket: 'curling-scoreboard-prod.appspot.com',
  messagingSenderId: '513864345938',
  appId: '1:513864345938:web:38ea0259c2b9099002b28b',
};

const isProd = import.meta.env.VITE_ENV === 'prod';
const app = initializeApp(isProd ? prodConfig : devConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');

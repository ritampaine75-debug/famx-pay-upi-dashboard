import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getDatabase, type Database } from 'firebase/database';

export const firebaseConfig = {
  apiKey: 'AIzaSyCChxWV-gw1TiertXkUrfUgcC19y-CPNw',
  authDomain: 'hiiii-72d78.firebaseapp.com',
  databaseURL: 'https://hiiii-72d78-default-rtdb.firebaseio.com',
  projectId: 'hiiii-72d78',
  storageBucket: 'hiiii-72d78.firebasestorage.app',
  messagingSenderId: '560685164053',
  appId: '1:560685164053:web:7f672f7503160ec868901c',
};

let appInstance: FirebaseApp;
let authInstance: Auth;
let dbInstance: Firestore;
let rtdbInstance: Database;
let initError: string | null = null;

try {
  appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  authInstance = getAuth(appInstance);
  dbInstance = getFirestore(appInstance);
  rtdbInstance = getDatabase(appInstance);
} catch (err) {
  initError = err instanceof Error ? err.message : 'Failed to initialize Firebase client SDK.';
  console.error('Firebase initialization error:', err);
  // Provide safe fallback references so imports do not crash before Diagnostics UI renders
  appInstance = getApps()[0]!;
  authInstance = getAuth(appInstance);
  dbInstance = getFirestore(appInstance);
  rtdbInstance = getDatabase(appInstance);
}

export const app = appInstance;
export const auth = authInstance;
export const firestoreDb = dbInstance;
export const realtimeDb = rtdbInstance;
export const firebaseInitError = initError;

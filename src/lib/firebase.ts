import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import config from '../../firebase-applet-config.json';

const firebaseConfig = {
  projectId: config.projectId,
  appId: config.appId,
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, config.firestoreDatabaseId || '(default)');
export const auth = getAuth(app);

// Automatically sign in anonymously if not already authenticated
signInAnonymously(auth).catch((error) => {
  console.warn("Auto anonymous sign-in note:", error?.message || error);
});

export async function signIn() {
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (e) {
    console.error("Sign-in error:", e);
    throw e;
  }
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase connected successfully");
  } catch (error) {
    console.warn("Firebase connection notice (falling back or offline mode):", error);
  }
}


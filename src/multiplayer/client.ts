import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  signInAnonymously,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { roomApi } from './store';
import { firebaseConfig } from './config';

let promise: ReturnType<typeof initialize> | null = null;
async function initialize() {
  const app = initializeApp(firebaseConfig);
  if (import.meta.env.VITE_FIREBASE_APP_CHECK_KEY) {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(import.meta.env.VITE_FIREBASE_APP_CHECK_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const auth = getAuth(app),
    db = getFirestore(app);
  if (import.meta.env.VITE_FIREBASE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  await setPersistence(auth, browserLocalPersistence);
  await auth.authStateReady();
  const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
  return {
    db,
    uid: user.uid,
    api: (data: Parameters<typeof roomApi>[2]) => roomApi(db, user.uid, data),
  };
}
export const getClient = () =>
  (promise ??= initialize().catch((error) => {
    promise = null;
    throw error;
  }));

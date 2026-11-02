const env = import.meta.env;
import project from './firebase-public.json';
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || project.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || project.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || project.projectId,
  appId: env.VITE_FIREBASE_APP_ID || project.appId,
};
export const multiplayerConfigured = Object.values(firebaseConfig).every(Boolean);

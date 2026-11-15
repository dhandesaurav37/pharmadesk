/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onIdTokenChanged,
  connectAuthEmulator,
  User,
} from 'firebase/auth';
import {
  initializeAppCheck,
  AppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  getToken as getFirebaseAppCheckToken,
} from 'firebase/app-check';

export interface FirebaseClientStatus {
  configured: boolean;
  projectId: string | null;
  authDomain: string | null;
  appCheckConfigured: boolean;
  emulatorConnected: boolean;
}

const firebaseConfig = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
};

const recaptchaSiteKey = String(import.meta.env.VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY || '').trim();
const appCheckProviderType = String(import.meta.env.VITE_FIREBASE_APPCHECK_PROVIDER || 'v3').trim().toLowerCase();
const authEmulatorUrl = String(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL || '').trim();

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let appCheckInstance: AppCheck | null = null;
let emulatorConnected = false;

export function isFirebaseClientConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );
}

export function getFirebaseClientStatus(): FirebaseClientStatus {
  return {
    configured: isFirebaseClientConfigured(),
    projectId: firebaseConfig.projectId || null,
    authDomain: firebaseConfig.authDomain || null,
    appCheckConfigured: Boolean(recaptchaSiteKey),
    emulatorConnected,
  };
}

function ensureFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseClientConfigured()) {
    return null;
  }
  if (appInstance) {
    return appInstance;
  }
  appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

  if (recaptchaSiteKey && typeof window !== 'undefined' && !appCheckInstance) {
    try {
      const provider =
        appCheckProviderType === 'enterprise'
          ? new ReCaptchaEnterpriseProvider(recaptchaSiteKey)
          : new ReCaptchaV3Provider(recaptchaSiteKey);

      appCheckInstance = initializeAppCheck(appInstance, {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      // App Check initialization errors should not crash unauthenticated app boot
      appCheckInstance = null;
    }
  }

  return appInstance;
}

export function getFirebaseClientAuth(): Auth | null {
  const app = ensureFirebaseApp();
  if (!app) return null;

  if (!authInstance) {
    authInstance = getAuth(app);
    void setPersistence(authInstance, browserLocalPersistence).catch(() => undefined);

    if (import.meta.env.DEV && authEmulatorUrl && !emulatorConnected) {
      try {
        connectAuthEmulator(authInstance, authEmulatorUrl, { disableWarnings: true });
        emulatorConnected = true;
      } catch {
        // Already connected
      }
    }
  }

  return authInstance;
}

export async function signInWithEmail(email: string, password: string): Promise<{
  user: User;
  idToken: string;
  appCheckToken: string | null;
}> {
  const auth = getFirebaseClientAuth();
  if (!auth) {
    throw new Error('Firebase Authentication is not configured in environment variables.');
  }
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const idToken = await cred.user.getIdToken();
  const appCheckToken = await getActiveAppCheckToken();
  return { user: cred.user, idToken, appCheckToken };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const auth = getFirebaseClientAuth();
  if (!auth) {
    throw new Error('Firebase Authentication is not configured in environment variables.');
  }
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutClient(): Promise<void> {
  const auth = getFirebaseClientAuth();
  if (!auth) return;
  await signOut(auth);
}

export async function getActiveAppCheckToken(): Promise<string | null> {
  if (!appCheckInstance) {
    ensureFirebaseApp();
  }
  if (!appCheckInstance) return null;
  try {
    const result = await getFirebaseAppCheckToken(appCheckInstance, false);
    return result.token || null;
  } catch {
    return null;
  }
}

export function subscribeToIdTokenChanges(
  callback: (payload: {
    user: User | null;
    idToken: string | null;
    appCheckToken: string | null;
  }) => void
): () => void {
  const auth = getFirebaseClientAuth();
  if (!auth) {
    return () => undefined;
  }

  return onIdTokenChanged(auth, async (user) => {
    if (!user) {
      callback({ user: null, idToken: null, appCheckToken: null });
      return;
    }
    try {
      const [idToken, appCheckToken] = await Promise.all([
        user.getIdToken(),
        getActiveAppCheckToken(),
      ]);
      callback({ user, idToken, appCheckToken });
    } catch {
      callback({ user, idToken: null, appCheckToken: null });
    }
  });
}

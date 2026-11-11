import * as admin from 'firebase-admin';
import { getApps, initializeApp, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';
import { getAppCheck, AppCheck } from 'firebase-admin/app-check';
import { env } from '../config/env';
import { logger } from './logger';

let adminAppInstance: App | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let storageInstance: Storage | null = null;
let appCheckInstance: AppCheck | null = null;

/**
 * Initializes and returns the Firebase Admin App singleton instance.
 */
export function getFirebaseAdminApp(): App {
  if (adminAppInstance) {
    return adminAppInstance;
  }

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    adminAppInstance = existingApps[0];
    return adminAppInstance;
  }

  try {
    let credential;

    if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
      credential = cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
      logger.info({ projectId: env.FIREBASE_PROJECT_ID }, 'Initialized Firebase Admin SDK via service account credentials.');
    } else {
      // In Google Cloud Run or local development with ADC
      try {
        credential = applicationDefault();
      } catch (_err) {
        // Fallback for offline or test environments without GCP ADC
        credential = undefined;
      }
      logger.info({ projectId: env.FIREBASE_PROJECT_ID }, 'Initialized Firebase Admin SDK via application default credentials.');
    }

    adminAppInstance = initializeApp({
      credential,
      projectId: env.FIREBASE_PROJECT_ID,
      storageBucket: env.FIREBASE_STORAGE_BUCKET,
    });

    return adminAppInstance;
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Failed standard Firebase Admin initialization; using project default config.');
    adminAppInstance = initializeApp({
      projectId: env.FIREBASE_PROJECT_ID,
      storageBucket: env.FIREBASE_STORAGE_BUCKET,
    });
    return adminAppInstance;
  }
}

/**
 * Returns Firestore singleton database instance with standard production settings.
 */
export function getFirestoreDb(): Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  const app = getFirebaseAdminApp();
  firestoreInstance = getFirestore(app);
  try {
    firestoreInstance.settings({
      ignoreUndefinedProperties: true,
    });
  } catch (_e) {
    // Settings already applied
  }
  return firestoreInstance;
}

/**
 * Returns Firebase Authentication admin service.
 */
export function getFirebaseAuth(): Auth {
  if (authInstance) {
    return authInstance;
  }
  const app = getFirebaseAdminApp();
  authInstance = getAuth(app);
  return authInstance;
}

/**
 * Returns Firebase Storage admin service.
 */
export function getFirebaseStorage(): Storage {
  if (storageInstance) {
    return storageInstance;
  }
  const app = getFirebaseAdminApp();
  storageInstance = getStorage(app);
  return storageInstance;
}

/**
 * Returns Firebase App Check admin service.
 */
export function getFirebaseAppCheck(): AppCheck {
  if (appCheckInstance) {
    return appCheckInstance;
  }
  const app = getFirebaseAdminApp();
  appCheckInstance = getAppCheck(app);
  return appCheckInstance;
}

// Convenient export shortcuts
export const adminApp = getFirebaseAdminApp;
export const firestore = getFirestoreDb;
export const adminAuth = getFirebaseAuth;
export const storage = getFirebaseStorage;
export const appCheck = getFirebaseAppCheck;

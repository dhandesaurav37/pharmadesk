import { getApps, initializeApp, deleteApp, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';
import { getAppCheck, AppCheck } from 'firebase-admin/app-check';
import { env, EnvConfig } from '../config/env';
import { logger } from './logger';

let adminAppInstance: App | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let storageInstance: Storage | null = null;
let appCheckInstance: AppCheck | null = null;

function hasEmulatorHost(config: EnvConfig): boolean {
  return Boolean(
    config.FIRESTORE_EMULATOR_HOST ||
      config.FIREBASE_AUTH_EMULATOR_HOST ||
      config.FIREBASE_STORAGE_EMULATOR_HOST ||
      process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      process.env.FIREBASE_STORAGE_EMULATOR_HOST
  );
}

function isAutomatedTestEnv(config: EnvConfig): boolean {
  return config.NODE_ENV === 'test' || process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
}

/**
 * Validates Firebase project ID, storage bucket, and service account pairing
 * without logging or exposing sensitive private keys.
 */
export function validateFirebaseConfiguration(config: EnvConfig = env): {
  projectId: string;
  storageBucket: string;
  hasServiceAccount: boolean;
} {
  const projectId = (config.FIREBASE_PROJECT_ID || '').trim();
  const storageBucket = (config.FIREBASE_STORAGE_BUCKET || '').trim();

  if (!projectId || /\s/.test(projectId)) {
    throw new Error('Firebase Admin initialization failed: valid FIREBASE_PROJECT_ID is required.');
  }

  if (!storageBucket || /\s/.test(storageBucket)) {
    throw new Error('Firebase Admin initialization failed: valid FIREBASE_STORAGE_BUCKET is required.');
  }

  const clientEmail = (config.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKeyRaw = config.FIREBASE_PRIVATE_KEY || '';
  const hasEmail = clientEmail.length > 0;
  const hasKey = privateKeyRaw.trim().length > 0;

  if (hasEmail !== hasKey) {
    throw new Error(
      'Firebase Admin initialization failed: FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must both be provided together.'
    );
  }

  if (hasEmail && !clientEmail.includes('@')) {
    throw new Error('Firebase Admin initialization failed: FIREBASE_CLIENT_EMAIL is malformed.');
  }

  if (hasKey) {
    const normalizedKey = privateKeyRaw.replace(/\\n/g, '\n');
    if (!normalizedKey.includes('BEGIN') || !normalizedKey.includes('PRIVATE KEY')) {
      throw new Error(
        'Firebase Admin initialization failed: FIREBASE_PRIVATE_KEY must be a valid PEM private key.'
      );
    }
  }

  return {
    projectId,
    storageBucket,
    hasServiceAccount: hasEmail && hasKey,
  };
}

/**
 * Initializes and returns the Firebase Admin App singleton instance.
 * Guarantees fail-closed credential handling in production while supporting
 * Firebase Emulator Suite and deterministic unit tests.
 */
export function getFirebaseAdminApp(customConfig?: EnvConfig): App {
  if (adminAppInstance && !customConfig) {
    return adminAppInstance;
  }

  const config = customConfig ?? env;

  if (!customConfig) {
    const existingApps = getApps();
    if (existingApps.length > 0 && existingApps[0]) {
      adminAppInstance = existingApps[0];
      return adminAppInstance;
    }
  }

  const { projectId, storageBucket, hasServiceAccount } = validateFirebaseConfiguration(config);
  const emulatorActive = hasEmulatorHost(config);
  const testEnv = isAutomatedTestEnv(config);

  let credential;

  if (hasServiceAccount) {
    credential = cert({
      projectId,
      clientEmail: config.FIREBASE_CLIENT_EMAIL!.trim(),
      privateKey: config.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    });
    logger.info(
      { projectId, storageBucket, authMode: 'service_account' },
      'Initialized Firebase Admin SDK using service account credentials.'
    );
  } else if (emulatorActive || testEnv) {
    // Preserve emulator & unit test initialization without requiring live GCP ADC
    try {
      credential = process.env.GOOGLE_APPLICATION_CREDENTIALS ? applicationDefault() : undefined;
    } catch {
      credential = undefined;
    }
    logger.info(
      {
        projectId,
        storageBucket,
        authMode: emulatorActive ? 'emulator' : 'test_offline',
      },
      'Initialized Firebase Admin SDK for emulator/test execution.'
    );
  } else {
    // Production or non-emulator runtime: require explicit ADC or service account
    const hasAdcHint = Boolean(
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.K_SERVICE || // Google Cloud Run managed environment
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCE_METADATA_HOST
    );

    if (config.NODE_ENV === 'production' && !hasAdcHint) {
      logger.error(
        { projectId, storageBucket },
        'Firebase Admin SDK missing credentials in production runtime'
      );
      throw new Error(
        `Firebase Admin SDK initialization failed for project '${projectId}': configure Cloud Run Workload Identity (ADC), GOOGLE_APPLICATION_CREDENTIALS, or FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.`
      );
    }

    try {
      credential = applicationDefault();
      logger.info(
        { projectId, storageBucket, authMode: 'application_default' },
        'Initialized Firebase Admin SDK via Application Default Credentials.'
      );
    } catch (err: any) {
      logger.error(
        { projectId, err: err?.message },
        'Firebase Admin SDK credential resolution failed'
      );
      throw new Error(
        `Firebase Admin SDK initialization failed for project '${projectId}': configure Cloud Run Workload Identity (ADC), GOOGLE_APPLICATION_CREDENTIALS, or FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.`
      );
    }
  }

  const app = initializeApp(
    {
      ...(credential ? { credential } : {}),
      projectId,
      storageBucket,
    },
    customConfig ? `app_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` : undefined
  );

  if (!customConfig) {
    adminAppInstance = app;
  }

  return app;
}

/**
 * Verifies live credential & metadata binding consistency across Firebase services.
 */
export function getConfiguredFirebaseProjectInfo(): {
  projectId: string;
  storageBucket: string;
} {
  const app = getFirebaseAdminApp();
  return {
    projectId: (app.options.projectId || env.FIREBASE_PROJECT_ID).trim(),
    storageBucket: (app.options.storageBucket || env.FIREBASE_STORAGE_BUCKET).trim(),
  };
}

/**
 * Returns Firestore singleton database instance bound to the same Firebase App.
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
  } catch {
    // Settings already applied
  }
  return firestoreInstance;
}

/**
 * Returns Firebase Authentication admin service bound to the same Firebase App.
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
 * Returns Firebase Storage admin service bound to the same Firebase App.
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
 * Returns Firebase App Check admin service bound to the same Firebase App.
 */
export function getFirebaseAppCheck(): AppCheck {
  if (appCheckInstance) {
    return appCheckInstance;
  }
  const app = getFirebaseAdminApp();
  appCheckInstance = getAppCheck(app);
  return appCheckInstance;
}

/**
 * Resets cached singletons in automated tests only.
 */
export async function resetFirebaseAdminForTests(): Promise<void> {
  if (!isAutomatedTestEnv(env)) {
    throw new Error('resetFirebaseAdminForTests is only permitted in test environments.');
  }
  const apps = getApps();
  await Promise.all(apps.map((a) => deleteApp(a).catch(() => undefined)));
  adminAppInstance = null;
  firestoreInstance = null;
  authInstance = null;
  storageInstance = null;
  appCheckInstance = null;
}

export const adminApp = getFirebaseAdminApp;
export const firestore = getFirestoreDb;
export const adminAuth = getFirebaseAuth;
export const storage = getFirebaseStorage;
export const appCheck = getFirebaseAppCheck;

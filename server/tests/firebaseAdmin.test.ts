import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getFirebaseAdminApp,
  getFirestoreDb,
  getFirebaseAuth,
  getFirebaseStorage,
  getConfiguredFirebaseProjectInfo,
  validateFirebaseConfiguration,
  resetFirebaseAdminForTests,
} from '../src/lib/firebaseAdmin';
import { env, EnvConfig } from '../src/config/env';
import { logger } from '../src/lib/logger';

describe('Firebase Admin SDK Initialization & Credential Safety', () => {
  afterEach(async () => {
    await resetFirebaseAdminForTests();
    vi.restoreAllMocks();
  });

  it('initializes singleton app with consistent projectId and storageBucket in test mode', () => {
    const app1 = getFirebaseAdminApp();
    const app2 = getFirebaseAdminApp();
    expect(app1).toBe(app2);

    const info = getConfiguredFirebaseProjectInfo();
    expect(info.projectId).toBe(env.FIREBASE_PROJECT_ID);
    expect(info.storageBucket).toBe(env.FIREBASE_STORAGE_BUCKET);

    // All Admin services bind to the exact same singleton app instance
    expect(getFirestoreDb()).toBe(getFirestoreDb());
    expect(getFirebaseAuth().app).toBe(app1);
    expect(getFirebaseStorage().app).toBe(app1);
  });

  it('rejects partial service account credentials (clientEmail without privateKey or vice versa)', () => {
    const partialEmailConfig: EnvConfig = {
      ...env,
      FIREBASE_CLIENT_EMAIL: 'svc@pharmadesk-prod.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: undefined,
    };
    expect(() => validateFirebaseConfiguration(partialEmailConfig)).toThrow(
      /FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must both be provided/
    );

    const partialKeyConfig: EnvConfig = {
      ...env,
      FIREBASE_CLIENT_EMAIL: undefined,
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----',
    };
    expect(() => validateFirebaseConfiguration(partialKeyConfig)).toThrow(
      /FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must both be provided/
    );
  });

  it('rejects malformed PEM private key and blank project/storage configuration', () => {
    const badPemConfig: EnvConfig = {
      ...env,
      FIREBASE_CLIENT_EMAIL: 'svc@pharmadesk-prod.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: 'not-a-valid-pem-secret',
    };
    expect(() => validateFirebaseConfiguration(badPemConfig)).toThrow(
      /must be a valid PEM private key/
    );

    const missingProjectConfig: EnvConfig = {
      ...env,
      FIREBASE_PROJECT_ID: '   ',
    };
    expect(() => validateFirebaseConfiguration(missingProjectConfig)).toThrow(
      /valid FIREBASE_PROJECT_ID is required/
    );
  });

  it('fails loudly in production when no service account or ADC/Cloud Run environment exists (no silent fallback)', () => {
    const origVitest = process.env.VITEST;
    const origNodeEnv = process.env.NODE_ENV;
    const origGac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const origKService = process.env.K_SERVICE;
    const origGcp = process.env.GOOGLE_CLOUD_PROJECT;
    const origGce = process.env.GCE_METADATA_HOST;

    try {
      delete process.env.VITEST;
      process.env.NODE_ENV = 'production';
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      delete process.env.K_SERVICE;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GCE_METADATA_HOST;

      const prodMissingCreds: EnvConfig = {
        ...env,
        NODE_ENV: 'production',
        FIREBASE_CLIENT_EMAIL: undefined,
        FIREBASE_PRIVATE_KEY: undefined,
        FIRESTORE_EMULATOR_HOST: undefined,
        FIREBASE_AUTH_EMULATOR_HOST: undefined,
        FIREBASE_STORAGE_EMULATOR_HOST: undefined,
      };

      expect(() => getFirebaseAdminApp(prodMissingCreds)).toThrow(
        /Firebase Admin SDK initialization failed/
      );
    } finally {
      if (origVitest !== undefined) process.env.VITEST = origVitest;
      if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
      if (origGac !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = origGac;
      if (origKService !== undefined) process.env.K_SERVICE = origKService;
      if (origGcp !== undefined) process.env.GOOGLE_CLOUD_PROJECT = origGcp;
      if (origGce !== undefined) process.env.GCE_METADATA_HOST = origGce;
    }
  });

  it('never logs FIREBASE_PRIVATE_KEY contents during initialization or failure', () => {
    const infoSpy = vi.spyOn(logger, 'info');
    const errorSpy = vi.spyOn(logger, 'error');
    const warnSpy = vi.spyOn(logger, 'warn');

    const secretMarker = 'SUPER_SECRET_PRIVATE_KEY_MATERIAL_DO_NOT_LOG';
    const configWithBadEmail: EnvConfig = {
      ...env,
      FIREBASE_CLIENT_EMAIL: 'invalid-email-without-at',
      FIREBASE_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${secretMarker}\n-----END PRIVATE KEY-----`,
    };

    expect(() => validateFirebaseConfiguration(configWithBadEmail)).toThrow();
    getFirebaseAdminApp();

    const allLogged = [
      ...infoSpy.mock.calls,
      ...errorSpy.mock.calls,
      ...warnSpy.mock.calls,
    ]
      .map((args) => JSON.stringify(args))
      .join('\n');

    expect(allLogged).not.toContain(secretMarker);
  });
});

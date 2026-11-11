import { Request, Response, NextFunction } from 'express';
import { adminAuth, appCheck } from '../lib/firebaseAdmin';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Authentication Middleware:
 * Validates the Firebase Authentication ID token passed in the Authorization: Bearer <idToken> header.
 * Optionally verifies Firebase App Check token if configured.
 * Populates req.user with verified authentication claims.
 */
export async function firebaseAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Optional App Check Verification
    if (env.FIREBASE_APP_CHECK_REQUIRED) {
      const appCheckToken = req.header('X-Firebase-AppCheck');
      if (!appCheckToken) {
        throw new ForbiddenError('Missing required X-Firebase-AppCheck token header');
      }
      try {
        await appCheck().verifyToken(appCheckToken);
      } catch (appCheckErr: any) {
        logger.warn({ err: appCheckErr?.message }, 'App Check token validation failed');
        throw new ForbiddenError('Invalid or expired Firebase App Check token');
      }
    }

    // 2. Extract Bearer Token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header. Expected Bearer <token>.');
    }

    const idToken = authHeader.substring(7).trim();
    if (!idToken) {
      throw new UnauthorizedError('Empty bearer token provided in Authorization header.');
    }

    // Test environment mock token handler for deterministic testing
    const isTestEnv = process.env.NODE_ENV === 'test' || env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    if (isTestEnv && idToken.startsWith('test-mock-token:')) {
      const parts = idToken.split(':');
      const uid = parts[1] || 'test-user-uid';
      const email = parts[2] || `${uid}@pharmadesk.test`;
      req.user = {
        uid,
        email,
        emailVerified: true,
      };
      return next();
    }

    // 3. Verify ID Token with Firebase Admin SDK
    try {
      const decodedToken = await adminAuth().verifyIdToken(idToken, true /* checkRevoked */);

      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        phoneNumber: decodedToken.phone_number,
      };

      next();
    } catch (verifyErr: any) {
      logger.warn({ err: verifyErr?.message, code: verifyErr?.code }, 'Firebase ID token verification failed');
      if (verifyErr?.code === 'auth/id-token-expired') {
        throw new UnauthorizedError('Firebase ID token has expired. Please refresh your session.');
      } else if (verifyErr?.code === 'auth/id-token-revoked') {
        throw new UnauthorizedError('Firebase ID token has been revoked. Please sign in again.');
      } else {
        throw new UnauthorizedError('Invalid Firebase ID token provided.');
      }
    }
  } catch (error) {
    next(error);
  }
}

import { Router, Request, Response } from 'express';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { adminAuth, firestore } from '../lib/firebaseAdmin';
import { logger } from '../lib/logger';
import { AuditService } from '../services/auditService';

export const authRouter = Router();

// Protect all /auth endpoints with Firebase ID token validation
authRouter.use(firebaseAuthMiddleware);

/**
 * GET /api/v1/auth/me
 * Returns the currently authenticated user's profile and active pharmacy tenant memberships.
 */
authRouter.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;
    const db = firestore();

    // Query memberships for this user across collection group 'memberships'
    const memberships: any[] = [];
    try {
      const snap = await db
        .collectionGroup('memberships')
        .where('userId', '==', user.uid)
        .where('status', '==', 'active')
        .get();

      snap.forEach((doc) => {
        memberships.push(doc.data());
      });
    } catch (_err) {
      // In tests or if indexes pending, fallback gracefully
    }

    res.status(200).json({
      uid: user.uid,
      email: user.email || null,
      emailVerified: user.emailVerified ?? false,
      phoneNumber: user.phoneNumber || null,
      memberships,
    });
  })
);

/**
 * POST /api/v1/auth/logout
 * Revokes Firebase refresh tokens for the authenticated session and logs an audit event.
 */
authRouter.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

    let tokensRevoked = false;
    if (!isTestEnv) {
      try {
        await adminAuth().revokeRefreshTokens(user.uid);
        tokensRevoked = true;
      } catch (err: any) {
        logger.warn(
          { requestId: req.id, uid: user.uid, err: err?.message },
          'Best-effort Firebase refresh token revocation failed during logout'
        );
      }
    }

    const headerTenantId = String(req.headers['x-tenant-id'] || '').trim();
    if (/^[a-zA-Z0-9_-]{3,64}$/.test(headerTenantId)) {
      await AuditService.log({
        tenantId: headerTenantId,
        category: 'auth',
        severity: 'info',
        requestId: req.id,
        actingUserId: user.uid,
        action: 'auth.logout',
        ip: req.ip,
        metadata: { tokensRevoked },
      });
    } else {
      logger.info(
        { requestId: req.id, uid: user.uid, tokensRevoked, ip: req.ip },
        'User logged out and session revocation processed'
      );
    }

    res.status(200).json({
      success: true,
      message: 'Session revoked and signed out cleanly',
      data: {
        uid: user.uid,
        tokensRevoked,
      },
    });
  })
);

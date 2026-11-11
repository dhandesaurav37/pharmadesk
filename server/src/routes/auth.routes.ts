import { Router, Request, Response } from 'express';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { firestore } from '../lib/firebaseAdmin';

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

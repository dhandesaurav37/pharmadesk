import { Request, Response, NextFunction } from 'express';
import { firestore } from '../lib/firebaseAdmin';
import { ForbiddenError, BadRequestError, UnauthorizedError } from '../lib/errors';
import { UserRole, TenantContext } from '../types/express';
import { logger } from '../lib/logger';
import { env } from '../config/env';
import { resolveEffectivePermissions, PermissionOverrides } from '../lib/permissions';

export interface MembershipRecord {
  tenantId: string;
  userId: string;
  role: UserRole;
  status: 'active' | 'invited' | 'deactivated' | 'suspended';
  assignedBranchIds: string[];
  permissions?: string[];
  permissionOverrides?: PermissionOverrides;
  name?: string;
  email?: string;
  phone?: string;
  invitedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  statusUpdatedBy?: string;
}

// In-memory cache for fast test execution when testing with mock state
const testMembershipStore = new Map<string, MembershipRecord>();

export function setTestMembership(tenantId: string, userId: string, membership: MembershipRecord | null) {
  const key = `${tenantId}:${userId}`;
  if (membership === null) {
    testMembershipStore.delete(key);
  } else {
    testMembershipStore.set(key, membership);
  }
}

export function clearTestMemberships() {
  testMembershipStore.clear();
}

export function getTestMemberships(tenantId: string): MembershipRecord[] {
  const result: MembershipRecord[] = [];
  for (const [key, val] of testMembershipStore.entries()) {
    if (key.startsWith(`${tenantId}:`)) {
      result.push(val);
    }
  }
  return result;
}

/**
 * Tenant Authorization Middleware:
 * Enforces strict multi-tenant isolation by verifying the caller's active membership
 * in the target pharmacy tenant directly against Cloud Firestore.
 * Blocks deactivated accounts instantly.
 * Validates branch-level assignment.
 */
export async function tenantAuthorizationMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || !req.user.uid) {
      throw new UnauthorizedError('Authentication required before tenant authorization');
    }

    const userId = req.user.uid;

    // 1. Resolve Tenant ID from Header or Route Params
    const tenantId = (
      (req.headers['x-tenant-id'] as string) ||
      req.params.tenantId ||
      ''
    ).trim();

    if (!tenantId) {
      throw new BadRequestError('Tenant ID must be specified via X-Tenant-ID header or URL parameter');
    }

    // Basic tenant ID format sanity check
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(tenantId)) {
      throw new BadRequestError('Invalid tenant ID format. Must be 3-64 alphanumeric characters, hyphens or underscores.');
    }

    // 2. Resolve Requested Branch ID if provided
    const branchId = (
      (req.headers['x-branch-id'] as string) ||
      req.params.branchId ||
      ''
    ).trim() || undefined;

    // 3. Query Cloud Firestore live membership document: tenants/{tenantId}/memberships/{userId}
    let membership: MembershipRecord | null = null;

    // In unit testing, check test store first if running under vitest
    const isTestEnv = process.env.NODE_ENV === 'test' || env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    if (isTestEnv) {
      const mockKey = `${tenantId}:${userId}`;
      if (testMembershipStore.has(mockKey)) {
        membership = testMembershipStore.get(mockKey)!;
      }
    }

    if (!membership && !isTestEnv) {
      try {
        const db = firestore();
        const membershipRef = db
          .collection('tenants')
          .doc(tenantId)
          .collection('memberships')
          .doc(userId);

        const docSnap = await membershipRef.get();

        if (docSnap.exists) {
          membership = docSnap.data() as MembershipRecord;
        }
      } catch (dbErr: any) {
        logger.error({ err: dbErr?.message, tenantId, userId }, 'Failed to read tenant membership from Firestore');
        throw new ForbiddenError('Unable to verify tenant membership. Please try again.');
      }
    }

    // 4. Verify Membership Existence
    if (!membership) {
      logger.warn({ tenantId, userId }, 'Tenant authorization failed: Membership record not found');
      throw new ForbiddenError(`User is not a registered member of pharmacy tenant '${tenantId}'`);
    }

    // 5. Enforce Status (Immediate Deactivation Enforcement)
    if (membership.status !== 'active') {
      logger.warn(
        { tenantId, userId, status: membership.status },
        'Tenant authorization rejected: Membership is not active'
      );
      throw new ForbiddenError(
        `Access denied. Your membership in pharmacy '${tenantId}' is currently ${membership.status}. Contact your pharmacy administrator.`
      );
    }

    // 6. Branch Assignment Validation
    const assignedBranches = membership.assignedBranchIds || [];
    const isOwner = membership.role === 'owner';

    if (branchId) {
      const hasBranchAccess = isOwner || assignedBranches.includes(branchId) || assignedBranches.includes('*');
      if (!hasBranchAccess) {
        logger.warn(
          { tenantId, branchId, userId, role: membership.role },
          'Tenant authorization rejected: User not assigned to branch'
        );
        throw new ForbiddenError(`You do not have permission to access branch '${branchId}' in this pharmacy.`);
      }
    }

    // Default permissions based on standard role + user-level overrides
    const effectivePermissions =
      membership.permissions && membership.permissions.length > 0
        ? membership.permissions
        : resolveEffectivePermissions(membership.role, membership.permissionOverrides);

    // 7. Attach Verified Tenant Context to Request
    const tenantContext: TenantContext = {
      tenantId,
      branchId: branchId || (assignedBranches[0] ?? 'main'),
      userId,
      role: membership.role,
      permissions: effectivePermissions,
      assignedBranchIds: assignedBranches,
    };

    req.tenantContext = tenantContext;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Returns default granular permissions based on employee role.
 */
export function getDefaultRolePermissions(role: UserRole): string[] {
  return resolveEffectivePermissions(role);
}

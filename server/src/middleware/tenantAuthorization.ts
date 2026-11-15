import { Request, Response, NextFunction } from 'express';
import { firestore } from '../lib/firebaseAdmin';
import { ForbiddenError, BadRequestError, UnauthorizedError } from '../lib/errors';
import { BranchLifecycleStatus, UserRole, TenantContext } from '../types/express';
import { logger } from '../lib/logger';
import { env } from '../config/env';
import {
  resolveEffectivePermissions,
  sanitizeGrantedPermissions,
  PermissionOverrides,
} from '../lib/permissions';

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

// In-memory caches for fast test execution when testing with mock state
const testMembershipStore = new Map<string, MembershipRecord>();
const testTenantStatusStore = new Map<string, 'active' | 'suspended' | 'cancelled'>();
const testBranchStatusStore = new Map<string, BranchLifecycleStatus>();

export function normalizeBranchLifecycleStatus(raw?: string | null): BranchLifecycleStatus {
  const upper = (raw || 'ACTIVE').trim().toUpperCase();
  if (upper === 'INACTIVE' || upper === 'SUSPENDED' || upper === 'CLOSED') {
    return upper;
  }
  return 'ACTIVE';
}

export function setTestBranchStatus(
  tenantId: string,
  branchId: string,
  status: BranchLifecycleStatus | null
) {
  const key = `${tenantId}:${branchId}`;
  if (status === null) {
    testBranchStatusStore.delete(key);
  } else {
    testBranchStatusStore.set(key, status);
  }
}

export function getTestBranchStatus(tenantId: string, branchId: string): BranchLifecycleStatus | undefined {
  return testBranchStatusStore.get(`${tenantId}:${branchId}`);
}

export function hasRegisteredTestBranches(tenantId: string): boolean {
  for (const key of testBranchStatusStore.keys()) {
    if (key.startsWith(`${tenantId}:`)) {
      return true;
    }
  }
  return false;
}

export function clearTestBranchStatuses() {
  testBranchStatusStore.clear();
}

export function setTestMembership(tenantId: string, userId: string, membership: MembershipRecord | null) {
  const key = `${tenantId}:${userId}`;
  if (membership === null) {
    testMembershipStore.delete(key);
  } else {
    testMembershipStore.set(key, membership);
  }
}

export function setTestTenantStatus(tenantId: string, status: 'active' | 'suspended' | 'cancelled' | null) {
  if (status === null) {
    testTenantStatusStore.delete(tenantId);
  } else {
    testTenantStatusStore.set(tenantId, status);
  }
}

export function clearTestMemberships() {
  testMembershipStore.clear();
  testTenantStatusStore.clear();
  testBranchStatusStore.clear();
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
 * and active pharmacy standing in Cloud Firestore.
 * Blocks deactivated/suspended accounts instantly, rejects empty branch assignments for non-owners,
 * resolves the target branch lifecycle status, and sanitizes non-owner permissions.
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
    const rawBranchId = (
      (req.headers['x-branch-id'] as string) ||
      req.params.branchId ||
      ''
    ).trim();

    if (rawBranchId && !/^[a-zA-Z0-9_-]{2,64}$/.test(rawBranchId)) {
      throw new BadRequestError('Invalid branch ID format.');
    }
    const branchId = rawBranchId || undefined;

    // 3. Query membership & tenant status
    let membership: MembershipRecord | null = null;
    let tenantStatus: string | undefined;

    const isTestEnv = process.env.NODE_ENV === 'test' || env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    if (isTestEnv) {
      const mockKey = `${tenantId}:${userId}`;
      if (testMembershipStore.has(mockKey)) {
        membership = testMembershipStore.get(mockKey)!;
      }
      tenantStatus = testTenantStatusStore.get(tenantId);
    }

    if (!membership && !isTestEnv) {
      try {
        const db = firestore();
        const tenantRef = db.collection('tenants').doc(tenantId);
        const membershipRef = tenantRef.collection('memberships').doc(userId);

        const [tenantSnap, docSnap] = await Promise.all([
          tenantRef.get(),
          membershipRef.get(),
        ]);

        if (tenantSnap.exists) {
          tenantStatus = (tenantSnap.data() as { status?: string } | undefined)?.status;
        }
        if (docSnap.exists) {
          membership = docSnap.data() as MembershipRecord;
        }
      } catch (dbErr: any) {
        logger.error({ err: dbErr?.message, tenantId, userId }, 'Failed to read tenant membership from Firestore');
        throw new ForbiddenError('Unable to verify tenant membership. Please try again.');
      }
    }

    // 4. Verify Tenant Standing if status present
    if (tenantStatus && tenantStatus !== 'active') {
      logger.warn({ tenantId, userId, tenantStatus }, 'Tenant authorization rejected: Pharmacy tenant is not active');
      throw new ForbiddenError(
        `Access denied. Pharmacy tenant '${tenantId}' is currently ${tenantStatus}.`
      );
    }

    // 5. Verify Membership Existence
    if (!membership) {
      logger.warn({ tenantId, userId }, 'Tenant authorization failed: Membership record not found');
      throw new ForbiddenError(`User is not a registered member of pharmacy tenant '${tenantId}'`);
    }

    // 6. Enforce Status (Immediate Deactivation / Suspension Enforcement)
    if (membership.status !== 'active') {
      logger.warn(
        { tenantId, userId, status: membership.status },
        'Tenant authorization rejected: Membership is not active'
      );
      throw new ForbiddenError(
        `Access denied. Your membership in pharmacy '${tenantId}' is currently ${membership.status}. Contact your pharmacy administrator.`
      );
    }

    // 7. Strict Branch Assignment Validation (No silent 'main' fallback for unassigned staff)
    const assignedBranches = (membership.assignedBranchIds || [])
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
    const isOwner = membership.role === 'owner';

    if (!isOwner) {
      const explicitBranches = assignedBranches.filter((b) => b !== '*');
      if (explicitBranches.length === 0) {
        logger.warn(
          { tenantId, userId, role: membership.role },
          'Tenant authorization rejected: Non-owner member has no assigned branches'
        );
        throw new ForbiddenError(
          `Access denied. Your account has no assigned branches in pharmacy '${tenantId}'.`
        );
      }

      if (branchId && !explicitBranches.includes(branchId)) {
        logger.warn(
          { tenantId, branchId, userId, role: membership.role },
          'Tenant authorization rejected: User not assigned to branch'
        );
        throw new ForbiddenError(`You do not have permission to access branch '${branchId}' in this pharmacy.`);
      }
    }

    const resolvedBranchId = branchId || (
      isOwner
        ? (assignedBranches.find((b) => b !== '*') || 'main')
        : assignedBranches.find((b) => b !== '*')!
    );

    // 7b. Resolve Branch Lifecycle Status & Validate Branch Existence when registry is populated
    let branchStatus: BranchLifecycleStatus = 'ACTIVE';
    if (isTestEnv) {
      const recordedStatus = getTestBranchStatus(tenantId, resolvedBranchId);
      if (recordedStatus) {
        branchStatus = recordedStatus;
      } else if (branchId && branchId !== 'main' && hasRegisteredTestBranches(tenantId)) {
        throw new ForbiddenError(
          `Branch '${branchId}' does not exist in pharmacy '${tenantId}'.`
        );
      }
    } else {
      try {
        const db = firestore();
        const branchSnap = await db
          .collection('tenants')
          .doc(tenantId)
          .collection('branches')
          .doc(resolvedBranchId)
          .get();

        if (branchSnap.exists) {
          const data = branchSnap.data() as { status?: string } | undefined;
          branchStatus = normalizeBranchLifecycleStatus(data?.status);
        } else if (branchId && branchId !== 'main') {
          throw new ForbiddenError(
            `Branch '${branchId}' does not exist in pharmacy '${tenantId}'.`
          );
        }
      } catch (branchErr: any) {
        if (branchErr instanceof ForbiddenError) {
          throw branchErr;
        }
        logger.error(
          { err: branchErr?.message, tenantId, branchId: resolvedBranchId },
          'Failed to resolve branch status from Firestore'
        );
      }
    }

    // 8. Resolve & Sanitize Effective Permissions (No wildcard privilege escalation for non-owners)
    const effectivePermissions =
      membership.permissions && membership.permissions.length > 0
        ? sanitizeGrantedPermissions(membership.role, membership.permissions)
        : resolveEffectivePermissions(membership.role, membership.permissionOverrides);

    // 9. Attach Verified Tenant Context to Request
    const tenantContext: TenantContext = {
      tenantId,
      branchId: resolvedBranchId,
      branchStatus,
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
 * Operational guard middleware: rejects mutating operational transactions
 * (POS billing, stock inward/adjustment, expenses, procurement) when the
 * active branch is INACTIVE, SUSPENDED, or CLOSED. Historical read queries
 * remain accessible for auditing and reporting.
 */
export function requireActiveBranchMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const ctx = req.tenantContext;
  if (!ctx) {
    return next(new UnauthorizedError('Tenant context required before branch status verification'));
  }
  if (ctx.branchStatus && ctx.branchStatus !== 'ACTIVE') {
    return next(
      new ForbiddenError(
        `Branch '${ctx.branchId}' is currently ${ctx.branchStatus}. Historical records remain readable, but new operational transactions are blocked.`
      )
    );
  }
  next();
}

/**
 * Returns default granular permissions based on employee role.
 */
export function getDefaultRolePermissions(role: UserRole): string[] {
  return resolveEffectivePermissions(role);
}

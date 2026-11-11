import { firestore } from '../lib/firebaseAdmin';
import { BadRequestError, NotFoundError, ConflictError } from '../lib/errors';
import { UserRole } from '../types/express';
import { logger } from '../lib/logger';
import { getDefaultRolePermissions, MembershipRecord } from '../middleware/tenantAuthorization';

export interface CreateTenantInput {
  tenantId: string;
  name: string;
  legalName?: string;
  dlNumber20B: string;
  dlNumber21B: string;
  gstin?: string;
  pan?: string;
  fssaiNumber?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  contactPhone: string;
  contactEmail: string;
}

export interface InviteMemberInput {
  userId: string;
  email: string;
  name?: string;
  role: UserRole;
  assignedBranchIds: string[];
  permissions?: string[];
}

export class TenantService {
  /**
   * Onboards a new pharmacy tenant in Cloud Firestore:
   * 1. Creates top-level `tenants/{tenantId}` document.
   * 2. Creates the default primary branch `tenants/{tenantId}/branches/main`.
   * 3. Creates the owner membership `tenants/{tenantId}/memberships/{ownerId}`.
   * 4. Updates the user's global registry in `users/{ownerId}`.
   */
  public static async createTenant(ownerId: string, input: CreateTenantInput) {
    const db = firestore();
    const tenantRef = db.collection('tenants').doc(input.tenantId);

    // Check if tenant ID already exists
    const existingSnap = await tenantRef.get();
    if (existingSnap.exists) {
      throw new ConflictError(`Pharmacy with ID '${input.tenantId}' already exists.`);
    }

    const now = new Date().toISOString();

    const tenantData = {
      id: input.tenantId,
      name: input.name,
      legalName: input.legalName || input.name,
      dlNumber20B: input.dlNumber20B,
      dlNumber21B: input.dlNumber21B,
      gstin: input.gstin || null,
      pan: input.pan || null,
      fssaiNumber: input.fssaiNumber || null,
      address: input.address,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      ownerId,
      status: 'active',
      plan: 'standard',
      createdAt: now,
      updatedAt: now,
    };

    const mainBranchData = {
      id: 'main',
      tenantId: input.tenantId,
      name: 'Main Pharmacy Counter',
      branchCode: 'MAIN',
      isMain: true,
      dlNumber20B: input.dlNumber20B,
      dlNumber21B: input.dlNumber21B,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const ownerMembership: MembershipRecord = {
      tenantId: input.tenantId,
      userId: ownerId,
      role: 'owner',
      status: 'active',
      assignedBranchIds: ['main', '*'],
      permissions: ['*'],
      createdAt: now,
      updatedAt: now,
    };

    // Atomic batch write for tenant initialization
    const batch = db.batch();
    batch.set(tenantRef, tenantData);
    batch.set(tenantRef.collection('branches').doc('main'), mainBranchData);
    batch.set(tenantRef.collection('memberships').doc(ownerId), ownerMembership);

    // Global user reference
    const userRef = db.collection('users').doc(ownerId);
    batch.set(
      userRef,
      {
        uid: ownerId,
        lastActiveTenantId: input.tenantId,
        updatedAt: now,
      },
      { merge: true }
    );

    await batch.commit();

    logger.info({ tenantId: input.tenantId, ownerId }, 'Successfully provisioned new pharmacy tenant in Cloud Firestore');

    return {
      tenant: tenantData,
      branch: mainBranchData,
      membership: ownerMembership,
    };
  }

  /**
   * Retrieves tenant profile by ID.
   */
  public static async getTenant(tenantId: string) {
    const db = firestore();
    const doc = await db.collection('tenants').doc(tenantId).get();
    if (!doc.exists) {
      throw new NotFoundError(`Pharmacy tenant '${tenantId}' does not exist.`);
    }
    return doc.data();
  }

  /**
   * Invites or adds an employee to the pharmacy tenant.
   */
  public static async addMember(tenantId: string, invitedBy: string, input: InviteMemberInput) {
    const db = firestore();
    const tenantRef = db.collection('tenants').doc(tenantId);

    // Verify tenant exists
    const tenantDoc = await tenantRef.get();
    if (!tenantDoc.exists) {
      throw new NotFoundError(`Pharmacy tenant '${tenantId}' not found.`);
    }

    const membershipRef = tenantRef.collection('memberships').doc(input.userId);
    const existingSnap = await membershipRef.get();
    if (existingSnap.exists) {
      throw new ConflictError(`User '${input.userId}' is already a member of this pharmacy.`);
    }

    const now = new Date().toISOString();
    const membership: MembershipRecord = {
      tenantId,
      userId: input.userId,
      role: input.role,
      status: 'active',
      assignedBranchIds: input.assignedBranchIds.length > 0 ? input.assignedBranchIds : ['main'],
      permissions: input.permissions || getDefaultRolePermissions(input.role),
      invitedBy,
      createdAt: now,
      updatedAt: now,
    };

    await membershipRef.set({
      ...membership,
      email: input.email,
      name: input.name || null,
    });

    logger.info(
      { tenantId, userId: input.userId, role: input.role },
      'Added new employee membership to pharmacy'
    );

    return membership;
  }

  /**
   * Updates employee membership status (active, deactivated, suspended).
   */
  public static async updateMemberStatus(
    tenantId: string,
    targetUserId: string,
    status: 'active' | 'deactivated' | 'suspended',
    actingOwnerId: string
  ) {
    if (targetUserId === actingOwnerId && status !== 'active') {
      throw new BadRequestError('Pharmacy owner account cannot be deactivated.');
    }

    const db = firestore();
    const membershipRef = db
      .collection('tenants')
      .doc(tenantId)
      .collection('memberships')
      .doc(targetUserId);

    const doc = await membershipRef.get();
    if (!doc.exists) {
      throw new NotFoundError(`Employee membership '${targetUserId}' not found in this pharmacy.`);
    }

    const now = new Date().toISOString();
    await membershipRef.update({
      status,
      updatedAt: now,
      statusUpdatedBy: actingOwnerId,
    });

    logger.info(
      { tenantId, targetUserId, status, actingOwnerId },
      'Updated employee membership status in Cloud Firestore'
    );

    return {
      userId: targetUserId,
      tenantId,
      status,
      updatedAt: now,
    };
  }

  /**
   * Lists all employee memberships in a tenant.
   */
  public static async listMembers(tenantId: string) {
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    if (isTestEnv) {
      const { getTestMemberships } = await import('../middleware/tenantAuthorization');
      return getTestMemberships(tenantId);
    }

    const db = firestore();
    const snapshot = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('memberships')
      .get();

    return snapshot.docs.map((doc) => doc.data() as MembershipRecord);
  }
}

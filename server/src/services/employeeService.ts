import crypto from 'node:crypto';
import { firestore } from '../lib/firebaseAdmin';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../lib/errors';
import { UserRole } from '../types/express';
import { logger } from '../lib/logger';
import {
  MembershipRecord,
  setTestMembership,
  getTestMemberships,
} from '../middleware/tenantAuthorization';
import {
  resolveEffectivePermissions,
  validatePermissionOverrides,
  PermissionOverrides,
} from '../lib/permissions';
import { AuditService } from './auditService';

export interface CreateInvitationInput {
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  assignedBranchIds: string[];
  permissionOverrides?: PermissionOverrides;
}

export interface InvitationRecord {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  phone?: string | null;
  role: UserRole;
  assignedBranchIds: string[];
  permissionOverrides?: PermissionOverrides;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled' | 'revoked';
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  acceptedByUserId?: string;
  acceptedAt?: string;
}

// In-memory store for unit test execution
const testInvitations = new Map<string, InvitationRecord>();

export function setTestInvitation(invitation: InvitationRecord) {
  testInvitations.set(`${invitation.tenantId}:${invitation.token}`, invitation);
  testInvitations.set(`${invitation.tenantId}:${invitation.id}`, invitation);
}

export function clearTestInvitations() {
  testInvitations.clear();
}

export class EmployeeService {
  /**
   * Generates a cryptographically secure invitation token.
   */
  private static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Creates and stores a new employee invitation with a 72-hour TTL.
   */
  public static async createInvitation(
    tenantId: string,
    actingUserId: string,
    input: CreateInvitationInput
  ): Promise<InvitationRecord> {
    const email = input.email.trim().toLowerCase();
    const token = this.generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();

    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

    // Verify tenant exists
    if (!isTestEnv) {
      const db = firestore();
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (!tenantDoc.exists) {
        throw new NotFoundError(`Pharmacy tenant '${tenantId}' does not exist.`);
      }
    }

    const cleanBranches = (input.assignedBranchIds || [])
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    if (input.role !== 'owner' && (cleanBranches.length === 0 || cleanBranches.includes('*'))) {
      throw new BadRequestError(
        'Non-owner employees must be assigned to explicit branch IDs; empty or wildcard "*" branch access is not allowed.'
      );
    }

    let validatedOverrides: PermissionOverrides;
    try {
      validatedOverrides = validatePermissionOverrides(input.role, input.permissionOverrides);
    } catch (err: any) {
      throw new BadRequestError(err.message);
    }

    const invitationId = `inv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const invitation: InvitationRecord = {
      id: invitationId,
      tenantId,
      email,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      role: input.role,
      assignedBranchIds: input.role === 'owner' && cleanBranches.length === 0 ? ['*'] : cleanBranches,
      permissionOverrides: validatedOverrides,
      token,
      status: 'pending',
      expiresAt,
      createdAt: now.toISOString(),
      createdBy: actingUserId,
    };

    if (isTestEnv) {
      setTestInvitation(invitation);
    } else {
      const db = firestore();
      await db
        .collection('tenants')
        .doc(tenantId)
        .collection('invitations')
        .doc(invitationId)
        .set(invitation);
    }

    await AuditService.log({
      tenantId,
      actingUserId,
      action: 'employee.invited',
      metadata: {
        email,
        name: input.name,
        role: input.role,
        assignedBranchIds: invitation.assignedBranchIds,
      },
    });

    logger.info(
      { tenantId, invitationId, email, role: input.role },
      'Generated secure employee invitation'
    );

    return invitation;
  }

  /**
   * Lists all invitations for a tenant and marks expired ones.
   */
  public static async listInvitations(tenantId: string): Promise<InvitationRecord[]> {
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    const now = Date.now();

    if (isTestEnv) {
      const list: InvitationRecord[] = [];
      for (const [key, invite] of testInvitations.entries()) {
        if (key.startsWith(`${tenantId}:`) && invite.id === key.split(':')[1]) {
          if (invite.status === 'pending' && now > new Date(invite.expiresAt).getTime()) {
            invite.status = 'expired';
          }
          list.push(invite);
        }
      }
      return list;
    }

    const db = firestore();
    const snapshot = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('invitations')
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as InvitationRecord;
      if (data.status === 'pending' && now > new Date(data.expiresAt).getTime()) {
        data.status = 'expired';
      }
      return data;
    });
  }

  /**
   * Resends an invitation with a refreshed token and renewed 72-hour expiration window.
   */
  public static async resendInvitation(
    tenantId: string,
    invitationId: string,
    actingUserId: string
  ): Promise<InvitationRecord> {
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    let invitation: InvitationRecord | null = null;

    if (isTestEnv) {
      invitation = testInvitations.get(`${tenantId}:${invitationId}`) || null;
    } else {
      const db = firestore();
      const doc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('invitations')
        .doc(invitationId)
        .get();
      if (doc.exists) {
        invitation = doc.data() as InvitationRecord;
      }
    }

    if (!invitation) {
      throw new NotFoundError(`Invitation '${invitationId}' not found.`);
    }

    if (invitation.status === 'cancelled') {
      throw new BadRequestError('Cannot resend a cancelled invitation. Please create a new invitation.');
    }

    if (invitation.status === 'accepted') {
      throw new BadRequestError('Invitation has already been accepted.');
    }

    const newToken = this.generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();

    invitation.token = newToken;
    invitation.expiresAt = expiresAt;
    invitation.status = 'pending';

    if (isTestEnv) {
      setTestInvitation(invitation);
    } else {
      const db = firestore();
      await db
        .collection('tenants')
        .doc(tenantId)
        .collection('invitations')
        .doc(invitationId)
        .update({
          token: newToken,
          expiresAt,
          status: 'pending',
          updatedAt: now.toISOString(),
        });
    }

    await AuditService.log({
      tenantId,
      actingUserId,
      action: 'employee.invitation_resent',
      metadata: { invitationId, email: invitation.email },
    });

    return invitation;
  }

  /**
   * Cancels a pending invitation.
   */
  public static async cancelInvitation(
    tenantId: string,
    invitationId: string,
    actingUserId: string
  ): Promise<InvitationRecord> {
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    let invitation: InvitationRecord | null = null;

    if (isTestEnv) {
      invitation = testInvitations.get(`${tenantId}:${invitationId}`) || null;
    } else {
      const db = firestore();
      const doc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('invitations')
        .doc(invitationId)
        .get();
      if (doc.exists) {
        invitation = doc.data() as InvitationRecord;
      }
    }

    if (!invitation) {
      throw new NotFoundError(`Invitation '${invitationId}' not found.`);
    }

    if (invitation.status === 'accepted') {
      throw new BadRequestError('Cannot cancel an already accepted invitation.');
    }

    invitation.status = 'cancelled';

    if (isTestEnv) {
      setTestInvitation(invitation);
    } else {
      const db = firestore();
      await db
        .collection('tenants')
        .doc(tenantId)
        .collection('invitations')
        .doc(invitationId)
        .update({
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelledBy: actingUserId,
        });
    }

    await AuditService.log({
      tenantId,
      actingUserId,
      action: 'employee.invitation_cancelled',
      metadata: { invitationId, email: invitation.email },
    });

    return invitation;
  }

  /**
   * Accepts an invitation by the authenticated user.
   * Validates token, status, expiration, and email match.
   * Atomically creates active membership with assigned role and branches.
   */
  public static async acceptInvitation(options: {
    tenantId: string;
    token: string;
    userId: string;
    userEmail?: string;
  }) {
    const { tenantId, token, userId, userEmail } = options;
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

    let invitation: InvitationRecord | null = null;

    const now = Date.now();
    const nowIso = new Date().toISOString();
    let newMembership: MembershipRecord;

    if (isTestEnv) {
      invitation = testInvitations.get(`${tenantId}:${token}`) || null;

      if (!invitation) {
        throw new NotFoundError('Invalid invitation token or pharmacy tenant.');
      }
      if (invitation.status === 'cancelled') {
        throw new BadRequestError('This invitation has been cancelled by the pharmacy owner.');
      }
      if (invitation.status === 'accepted') {
        throw new ConflictError('This invitation has already been accepted.');
      }
      if (invitation.status === 'expired' || now > new Date(invitation.expiresAt).getTime()) {
        invitation.status = 'expired';
        throw new BadRequestError('This invitation has expired. Please ask your pharmacy administrator to resend it.');
      }
      if (invitation.email && userEmail && invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
        throw new ForbiddenError(
          `This invitation was issued to '${invitation.email}', but you are signed in as '${userEmail}'.`
        );
      }

      const existingMember = getTestMemberships(tenantId).find((m) => m.userId === userId);
      if (existingMember && existingMember.status === 'active') {
        throw new ConflictError('You already have an active membership in this pharmacy.');
      }

      const cleanBranches = (invitation.assignedBranchIds || []).map((b) => b.trim()).filter(Boolean);
      if (invitation.role !== 'owner' && (cleanBranches.length === 0 || cleanBranches.includes('*'))) {
        throw new BadRequestError('Invitation is missing valid branch assignments for non-owner role.');
      }

      const effectivePermissions = resolveEffectivePermissions(
        invitation.role,
        invitation.permissionOverrides
      );

      newMembership = {
        tenantId,
        userId,
        role: invitation.role,
        status: 'active',
        assignedBranchIds: cleanBranches,
        permissionOverrides: invitation.permissionOverrides,
        permissions: effectivePermissions,
        name: invitation.name,
        email: invitation.email,
        phone: invitation.phone || undefined,
        invitedBy: invitation.createdBy,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      invitation.status = 'accepted';
      invitation.acceptedByUserId = userId;
      invitation.acceptedAt = nowIso;

      setTestMembership(tenantId, userId, newMembership);
      setTestInvitation(invitation);
    } else {
      const db = firestore();
      const tenantRef = db.collection('tenants').doc(tenantId);
      const inviteQuery = tenantRef.collection('invitations').where('token', '==', token).limit(1);
      const memberRef = tenantRef.collection('memberships').doc(userId);
      const userRef = db.collection('users').doc(userId);

      newMembership = await db.runTransaction(async (tx) => {
        const [inviteSnap, memberSnap] = await Promise.all([
          tx.get(inviteQuery),
          tx.get(memberRef),
        ]);

        if (inviteSnap.empty || !inviteSnap.docs[0]) {
          throw new NotFoundError('Invalid invitation token or pharmacy tenant.');
        }

        const invDoc = inviteSnap.docs[0];
        const invData = invDoc.data() as InvitationRecord;

        if (invData.status === 'cancelled') {
          throw new BadRequestError('This invitation has been cancelled by the pharmacy owner.');
        }
        if (invData.status === 'accepted') {
          throw new ConflictError('This invitation has already been accepted.');
        }
        if (invData.status === 'expired' || now > new Date(invData.expiresAt).getTime()) {
          throw new BadRequestError('This invitation has expired. Please ask your pharmacy administrator to resend it.');
        }
        if (invData.email && userEmail && invData.email.toLowerCase() !== userEmail.toLowerCase()) {
          throw new ForbiddenError(
            `This invitation was issued to '${invData.email}', but you are signed in as '${userEmail}'.`
          );
        }

        if (memberSnap.exists) {
          const existingMember = memberSnap.data() as MembershipRecord;
          if (existingMember.status === 'active') {
            throw new ConflictError('You already have an active membership in this pharmacy.');
          }
        }

        const cleanBranches = (invData.assignedBranchIds || []).map((b) => b.trim()).filter(Boolean);
        if (invData.role !== 'owner' && (cleanBranches.length === 0 || cleanBranches.includes('*'))) {
          throw new BadRequestError('Invitation is missing valid branch assignments for non-owner role.');
        }

        const effectivePermissions = resolveEffectivePermissions(
          invData.role,
          invData.permissionOverrides
        );

        const membershipPayload: MembershipRecord = {
          tenantId,
          userId,
          role: invData.role,
          status: 'active',
          assignedBranchIds: cleanBranches,
          permissionOverrides: invData.permissionOverrides,
          permissions: effectivePermissions,
          name: invData.name,
          email: invData.email,
          phone: invData.phone || undefined,
          invitedBy: invData.createdBy,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        tx.set(memberRef, membershipPayload);
        tx.update(invDoc.ref, {
          status: 'accepted',
          acceptedByUserId: userId,
          acceptedAt: nowIso,
        });
        tx.set(
          userRef,
          {
            uid: userId,
            lastActiveTenantId: tenantId,
            updatedAt: nowIso,
          },
          { merge: true }
        );

        return membershipPayload;
      });
    }

    await AuditService.log({
      tenantId,
      actingUserId: userId,
      targetUserId: userId,
      action: 'employee.invitation_accepted',
      metadata: {
        role: newMembership.role,
        assignedBranchIds: newMembership.assignedBranchIds,
      },
    });

    logger.info(
      { tenantId, userId, role: newMembership.role },
      'Employee invitation successfully accepted and membership activated'
    );

    return newMembership;
  }

  /**
   * Updates an employee's role. Recomputes effective permissions with existing overrides.
   */
  public static async updateRole(
    tenantId: string,
    targetUserId: string,
    newRole: UserRole,
    actingUserId: string
  ) {
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    let member: MembershipRecord | null = null;

    if (isTestEnv) {
      member = getTestMemberships(tenantId).find((m) => m.userId === targetUserId) || null;
    } else {
      const db = firestore();
      const doc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('memberships')
        .doc(targetUserId)
        .get();
      if (doc.exists) {
        member = doc.data() as MembershipRecord;
      }
    }

    if (!member) {
      throw new NotFoundError(`Employee '${targetUserId}' not found in this pharmacy.`);
    }

    if (member.role === 'owner' && targetUserId === actingUserId && newRole !== 'owner') {
      throw new BadRequestError('Primary pharmacy owner cannot demote their own role.');
    }

    const previousRole = member.role;
    member.role = newRole;
    member.permissions = resolveEffectivePermissions(newRole, member.permissionOverrides);
    member.updatedAt = new Date().toISOString();

    if (isTestEnv) {
      setTestMembership(tenantId, targetUserId, member);
    } else {
      const db = firestore();
      await db
        .collection('tenants')
        .doc(tenantId)
        .collection('memberships')
        .doc(targetUserId)
        .update({
          role: newRole,
          permissions: member.permissions,
          updatedAt: member.updatedAt,
        });
    }

    await AuditService.log({
      tenantId,
      actingUserId,
      targetUserId,
      action: 'employee.role_changed',
      metadata: { previousRole, newRole },
    });

    return member;
  }

  /**
   * Updates branch assignments for an employee.
   */
  public static async updateBranches(
    tenantId: string,
    targetUserId: string,
    assignedBranchIds: string[],
    actingUserId: string
  ) {
    if (!assignedBranchIds || assignedBranchIds.length === 0) {
      throw new BadRequestError('Employee must be assigned to at least one branch.');
    }

    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    let member: MembershipRecord | null = null;

    if (isTestEnv) {
      member = getTestMemberships(tenantId).find((m) => m.userId === targetUserId) || null;
    } else {
      const db = firestore();
      const doc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('memberships')
        .doc(targetUserId)
        .get();
      if (doc.exists) {
        member = doc.data() as MembershipRecord;
      }
    }

    if (!member) {
      throw new NotFoundError(`Employee '${targetUserId}' not found in this pharmacy.`);
    }

    const cleanBranches = (assignedBranchIds || []).map((b) => b.trim()).filter(Boolean);
    if (member.role !== 'owner' && (cleanBranches.length === 0 || cleanBranches.includes('*'))) {
      throw new BadRequestError('Non-owner employees must have explicit non-wildcard branch assignments.');
    }

    const previousBranches = member.assignedBranchIds || [];
    member.assignedBranchIds = cleanBranches;
    member.updatedAt = new Date().toISOString();

    if (isTestEnv) {
      setTestMembership(tenantId, targetUserId, member);
    } else {
      const db = firestore();
      await db
        .collection('tenants')
        .doc(tenantId)
        .collection('memberships')
        .doc(targetUserId)
        .update({
          assignedBranchIds: cleanBranches,
          updatedAt: member.updatedAt,
        });
    }

    await AuditService.log({
      tenantId,
      actingUserId,
      targetUserId,
      action: 'employee.branches_changed',
      metadata: { previousBranches, newBranches: cleanBranches },
    });

    return member;
  }

  /**
   * Updates custom permission overrides (granted and revoked) for an employee.
   */
  public static async updatePermissions(
    tenantId: string,
    targetUserId: string,
    permissionOverrides: PermissionOverrides,
    actingUserId: string
  ) {
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    let member: MembershipRecord | null = null;

    if (isTestEnv) {
      member = getTestMemberships(tenantId).find((m) => m.userId === targetUserId) || null;
    } else {
      const db = firestore();
      const doc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('memberships')
        .doc(targetUserId)
        .get();
      if (doc.exists) {
        member = doc.data() as MembershipRecord;
      }
    }

    if (!member) {
      throw new NotFoundError(`Employee '${targetUserId}' not found in this pharmacy.`);
    }

    // Owner permissions cannot be revoked or overridden
    if (member.role === 'owner') {
      throw new BadRequestError('Cannot override permissions for pharmacy owner.');
    }

    let sanitizedOverrides: PermissionOverrides;
    try {
      sanitizedOverrides = validatePermissionOverrides(member.role, permissionOverrides);
    } catch (err: any) {
      throw new BadRequestError(err.message);
    }

    member.permissionOverrides = sanitizedOverrides;
    member.permissions = resolveEffectivePermissions(member.role, sanitizedOverrides);
    member.updatedAt = new Date().toISOString();

    if (isTestEnv) {
      setTestMembership(tenantId, targetUserId, member);
    } else {
      const db = firestore();
      await db
        .collection('tenants')
        .doc(tenantId)
        .collection('memberships')
        .doc(targetUserId)
        .update({
          permissionOverrides,
          permissions: member.permissions,
          updatedAt: member.updatedAt,
        });
    }

    await AuditService.log({
      tenantId,
      actingUserId,
      targetUserId,
      action: 'employee.permissions_changed',
      metadata: { permissionOverrides },
    });

    return member;
  }

  /**
   * Updates employee status: 'active', 'suspended', or 'deactivated'.
   * Deactivation triggers immediate revocation on subsequent API calls.
   */
  public static async updateStatus(
    tenantId: string,
    targetUserId: string,
    status: 'active' | 'suspended' | 'deactivated',
    actingUserId: string
  ) {
    if (targetUserId === actingUserId && status !== 'active') {
      throw new BadRequestError('Pharmacy owner cannot deactivate or suspend their own account.');
    }

    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    let member: MembershipRecord | null = null;

    if (isTestEnv) {
      member = getTestMemberships(tenantId).find((m) => m.userId === targetUserId) || null;
    } else {
      const db = firestore();
      const doc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('memberships')
        .doc(targetUserId)
        .get();
      if (doc.exists) {
        member = doc.data() as MembershipRecord;
      }
    }

    if (!member) {
      throw new NotFoundError(`Employee '${targetUserId}' not found in this pharmacy.`);
    }

    member.status = status;
    member.updatedAt = new Date().toISOString();
    member.statusUpdatedBy = actingUserId;

    if (isTestEnv) {
      setTestMembership(tenantId, targetUserId, member);
    } else {
      const db = firestore();
      await db
        .collection('tenants')
        .doc(tenantId)
        .collection('memberships')
        .doc(targetUserId)
        .update({
          status,
          updatedAt: member.updatedAt,
          statusUpdatedBy: actingUserId,
        });
    }

    const actionMap = {
      active: 'employee.reactivated',
      suspended: 'employee.suspended',
      deactivated: 'employee.deactivated',
    };

    await AuditService.log({
      tenantId,
      actingUserId,
      targetUserId,
      action: actionMap[status],
      metadata: { status },
    });

    logger.info(
      { tenantId, targetUserId, status, actingUserId },
      `Employee status transitioned to ${status}`
    );

    return member;
  }
}

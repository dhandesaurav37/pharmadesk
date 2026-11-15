import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { Express } from 'express';
import {
  setTestMembership,
  clearTestMemberships,
  getTestMemberships,
} from '../src/middleware/tenantAuthorization';
import {
  clearTestInvitations,
  setTestInvitation,
  InvitationRecord,
} from '../src/services/employeeService';
import {
  getTestAuditLogs,
  clearTestAuditLogs,
} from '../src/services/auditService';

describe('Phase 4: Staff RBAC, Employee Management & Branch Permissions', () => {
  let app: Express;
  const tenantId = 'test-pharma-pune';

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    clearTestMemberships();
    clearTestInvitations();
    clearTestAuditLogs();

    // Seed pharmacy owner
    setTestMembership(tenantId, 'owner-uid', {
      tenantId,
      userId: 'owner-uid',
      name: 'Dr. Suresh Sharma',
      email: 'owner@pharmadesk.test',
      role: 'owner',
      status: 'active',
      assignedBranchIds: ['main', '*'],
      permissions: ['*'],
    });

    // Seed pharmacist
    setTestMembership(tenantId, 'pharmacist-uid', {
      tenantId,
      userId: 'pharmacist-uid',
      name: 'Priya Verma',
      email: 'priya@pharmadesk.test',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: ['main'],
    });

    // Seed cashier
    setTestMembership(tenantId, 'cashier-uid', {
      tenantId,
      userId: 'cashier-uid',
      name: 'Amit Patel',
      email: 'amit@pharmadesk.test',
      role: 'cashier',
      status: 'active',
      assignedBranchIds: ['counter-1'],
    });

    // Seed helper
    setTestMembership(tenantId, 'helper-uid', {
      tenantId,
      userId: 'helper-uid',
      name: 'Raju Yadav',
      email: 'raju@pharmadesk.test',
      role: 'helper',
      status: 'active',
      assignedBranchIds: ['counter-1'],
    });
  });

  const token = (uid: string, email?: string) =>
    `Bearer test-mock-token:${uid}:${email || `${uid}@pharmadesk.test`}`;

  describe('1. Employee Invitation Lifecycle', () => {
    it('allows owner to create an employee invitation with role and branch assignments', async () => {
      const response = await request(app)
        .post(`/api/v1/tenants/${tenantId}/invitations`)
        .set('Authorization', token('owner-uid', 'owner@pharmadesk.test'))
        .send({
          email: 'newpharmacist@pharmadesk.test',
          name: 'Kavita Roy',
          role: 'pharmacist',
          assignedBranchIds: ['main'],
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.email).toBe('newpharmacist@pharmadesk.test');
      expect(response.body.data.role).toBe('pharmacist');
      expect(response.body.data.status).toBe('pending');
      expect(response.body).toHaveProperty('inviteLink');

      // Verify audit log
      const logs = getTestAuditLogs(tenantId);
      expect(logs.some((l) => l.action === 'employee.invited')).toBe(true);
    });

    it('rejects invitation creation from unauthorized employee (cashier or helper)', async () => {
      const response = await request(app)
        .post(`/api/v1/tenants/${tenantId}/invitations`)
        .set('Authorization', token('cashier-uid', 'amit@pharmadesk.test'))
        .send({
          email: 'friend@pharmadesk.test',
          name: 'Friend',
          role: 'cashier',
          assignedBranchIds: ['counter-1'],
        });

      expect(response.status).toBe(403);
      expect(response.body.title).toBe('Forbidden');
      expect(response.body.detail).toContain('Missing required permission(s)');
    });

    it('allows invited employee to accept their invitation with matching credentials', async () => {
      // Create pending invitation
      const inviteToken = 'test-invite-token-secure-12345678';
      const invitation: InvitationRecord = {
        id: 'inv_101',
        tenantId,
        email: 'vikram@pharmadesk.test',
        name: 'Vikram Mehta',
        role: 'pharmacist',
        assignedBranchIds: ['main', 'counter-2'],
        token: inviteToken,
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: 'owner-uid',
      };
      setTestInvitation(invitation);

      // Vikram accepts invitation
      const response = await request(app)
        .post('/api/v1/invitations/accept')
        .set('Authorization', token('vikram-uid', 'vikram@pharmadesk.test'))
        .send({
          tenantId,
          token: inviteToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        tenantId,
        userId: 'vikram-uid',
        role: 'pharmacist',
        status: 'active',
      });
      expect(response.body.data.assignedBranchIds).toEqual(['main', 'counter-2']);

      // Verify membership was activated in tenant
      const members = getTestMemberships(tenantId);
      const newMember = members.find((m) => m.userId === 'vikram-uid');
      expect(newMember).toBeDefined();
      expect(newMember?.status).toBe('active');

      // Verify audit log
      const logs = getTestAuditLogs(tenantId);
      expect(logs.some((l) => l.action === 'employee.invitation_accepted')).toBe(true);
    });

    it('rejects acceptance if user email does not match invitation recipient', async () => {
      const inviteToken = 'test-token-email-mismatch-12345678';
      setTestInvitation({
        id: 'inv_102',
        tenantId,
        email: 'expected-recipient@pharmadesk.test',
        name: 'Expected User',
        role: 'cashier',
        assignedBranchIds: ['main'],
        token: inviteToken,
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: 'owner-uid',
      });

      const response = await request(app)
        .post('/api/v1/invitations/accept')
        .set('Authorization', token('hacker-uid', 'wrong-email@pharmadesk.test'))
        .send({
          tenantId,
          token: inviteToken,
        });

      expect(response.status).toBe(403);
      expect(response.body.detail).toContain('This invitation was issued to');
    });

    it('rejects acceptance of expired or cancelled invitation', async () => {
      const inviteToken = 'test-token-cancelled-12345678';
      setTestInvitation({
        id: 'inv_103',
        tenantId,
        email: 'cancelled@pharmadesk.test',
        name: 'Cancelled User',
        role: 'cashier',
        assignedBranchIds: ['main'],
        token: inviteToken,
        status: 'cancelled',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: 'owner-uid',
      });

      const response = await request(app)
        .post('/api/v1/invitations/accept')
        .set('Authorization', token('user-cancelled', 'cancelled@pharmadesk.test'))
        .send({
          tenantId,
          token: inviteToken,
        });

      expect(response.status).toBe(400);
      expect(response.body.detail).toContain('cancelled');
    });
  });

  describe('2. Role-Based Permissions & Privilege Boundaries', () => {
    it('prevents cashier from accessing owner-only role modification', async () => {
      const response = await request(app)
        .patch(`/api/v1/tenants/${tenantId}/employees/helper-uid/role`)
        .set('Authorization', token('cashier-uid'))
        .send({ role: 'pharmacist' });

      expect(response.status).toBe(403);
      expect(response.body.detail).toContain('requires one of the following roles: [owner]');
    });

    it('prevents pharmacist from promoting anyone to owner or changing owner settings', async () => {
      const response = await request(app)
        .patch(`/api/v1/tenants/${tenantId}/employees/cashier-uid/role`)
        .set('Authorization', token('pharmacist-uid'))
        .send({ role: 'owner' });

      expect(response.status).toBe(403);
    });

    it('allows owner to update employee role, recalculating effective permissions', async () => {
      const response = await request(app)
        .patch(`/api/v1/tenants/${tenantId}/employees/cashier-uid/role`)
        .set('Authorization', token('owner-uid'))
        .send({ role: 'pharmacist' });

      expect(response.status).toBe(200);
      expect(response.body.data.role).toBe('pharmacist');
      expect(response.body.data.permissions).toContain('inventory.write');
    });
  });

  describe('3. Permission Overrides (Grant & Revoke)', () => {
    it('allows owner to configure custom permission overrides for an employee', async () => {
      // Give cashier an explicit grant for inventory.adjust, but revoke billing.cancel
      const response = await request(app)
        .patch(`/api/v1/tenants/${tenantId}/employees/cashier-uid/permissions`)
        .set('Authorization', token('owner-uid'))
        .send({
          permissionOverrides: {
            granted: ['inventory.adjust'],
            revoked: ['billing.create'],
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.permissions).toContain('inventory.adjust');
      expect(response.body.data.permissions).not.toContain('billing.create');

      // Verify audit log
      const logs = getTestAuditLogs(tenantId);
      expect(logs.some((l) => l.action === 'employee.permissions_changed')).toBe(true);
    });

    it('rejects granting wildcard permissions ("*" or "billing.*") to non-owners via overrides or invitations', async () => {
      const overrideRes = await request(app)
        .patch(`/api/v1/tenants/${tenantId}/employees/cashier-uid/permissions`)
        .set('Authorization', token('owner-uid'))
        .send({
          permissionOverrides: {
            granted: ['billing.*', '*'],
          },
        });

      expect(overrideRes.status).toBe(400);
      expect(overrideRes.body.detail).toContain('Wildcard permission');

      const inviteRes = await request(app)
        .post(`/api/v1/tenants/${tenantId}/invitations`)
        .set('Authorization', token('owner-uid'))
        .send({
          email: 'wildcard-attempt@pharmadesk.test',
          name: 'Wildcard Attempt',
          role: 'cashier',
          assignedBranchIds: ['*'],
        });

      expect(inviteRes.status).toBe(400);
      expect(inviteRes.body.detail).toContain('wildcard "*" branch access is not allowed');
    });
  });

  describe('4. Branch-Level Isolation & Enforcement', () => {
    it('blocks cashier from performing operations at unauthorized branch', async () => {
      // cashier-uid is only assigned to 'counter-1'
      const response = await request(app)
        .get(`/api/v1/tenants/${tenantId}/employees`)
        .set('Authorization', token('cashier-uid'))
        .set('X-Branch-ID', 'counter-2');

      expect(response.status).toBe(403);
      expect(response.body.detail).toContain('not have permission to access branch');
    });

    it('allows owner to update branch assignments for an employee', async () => {
      const response = await request(app)
        .patch(`/api/v1/tenants/${tenantId}/employees/helper-uid/branches`)
        .set('Authorization', token('owner-uid'))
        .send({
          assignedBranchIds: ['main', 'counter-1', 'counter-2'],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.assignedBranchIds).toEqual(['main', 'counter-1', 'counter-2']);
    });
  });

  describe('5. Immediate Access Revocation (Deactivation & Suspension)', () => {
    it('immediately blocks deactivated employee from accessing protected tenant APIs', async () => {
      // 1. Owner deactivates cashier
      const deactRes = await request(app)
        .patch(`/api/v1/tenants/${tenantId}/employees/cashier-uid/status`)
        .set('Authorization', token('owner-uid'))
        .send({ status: 'deactivated' });

      expect(deactRes.status).toBe(200);
      expect(deactRes.body.data.status).toBe('deactivated');

      // 2. Cashier immediately tries to make an API call with their existing token
      const subsequentRes = await request(app)
        .get(`/api/v1/tenants/${tenantId}/employees`)
        .set('Authorization', token('cashier-uid'));

      // MUST be rejected immediately with 403 Forbidden!
      expect(subsequentRes.status).toBe(403);
      expect(subsequentRes.body.detail).toContain('is currently deactivated');

      // 3. Verify audit log captured deactivation
      const logs = getTestAuditLogs(tenantId);
      expect(logs.some((l) => l.action === 'employee.deactivated')).toBe(true);
    });

    it('prevents owner from deactivating their own account', async () => {
      const response = await request(app)
        .patch(`/api/v1/tenants/${tenantId}/employees/owner-uid/status`)
        .set('Authorization', token('owner-uid'))
        .send({ status: 'deactivated' });

      expect(response.status).toBe(400);
      expect(response.body.detail).toContain('cannot deactivate or suspend their own account');
    });
  });
});

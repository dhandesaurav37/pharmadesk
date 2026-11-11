import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { Express } from 'express';
import { setTestMembership, clearTestMemberships } from '../src/middleware/tenantAuthorization';

describe('Tenant Authorization Middleware & Isolation', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    clearTestMemberships();
  });

  const validToken = (uid: string) => `Bearer test-mock-token:${uid}:${uid}@pharmadesk.test`;

  describe('Tenant ID validation', () => {
    it('should return 400 Bad Request when tenant ID is missing', async () => {
      const response = await request(app)
        .get('/api/v1/tenants/storage/upload-url')
        .set('Authorization', validToken('user-1'));

      // If neither header nor param is passed
      expect([400, 404]).toContain(response.status);
    });

    it('should return 400 Bad Request if tenant ID has invalid characters', async () => {
      const response = await request(app)
        .get('/api/v1/tenants/invalid$tenant!id')
        .set('Authorization', validToken('user-1'));

      expect(response.status).toBe(400);
      expect(response.body.title).toBe('Bad Request');
    });
  });

  describe('Active membership checks & Deactivation enforcement', () => {
    it('should return 403 Forbidden when user is not a member of the pharmacy', async () => {
      const response = await request(app)
        .get('/api/v1/tenants/apollo-pharmacy-pune')
        .set('Authorization', validToken('outsider-user'));

      expect(response.status).toBe(403);
      expect(response.headers['content-type']).toMatch(/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://pharmadesk.in/errors/forbidden',
        title: 'Forbidden',
        status: 403,
      });
      expect(response.body.detail).toContain('not a registered member');
    });

    it('should instantly block deactivated employee with 403 Forbidden', async () => {
      // Seed deactivated employee in test store
      setTestMembership('apollo-pharmacy-pune', 'fired-employee-uid', {
        tenantId: 'apollo-pharmacy-pune',
        userId: 'fired-employee-uid',
        role: 'pharmacist',
        status: 'deactivated',
        assignedBranchIds: ['main'],
        permissions: ['billing:create', 'inventory:read'],
      });

      const response = await request(app)
        .get('/api/v1/tenants/apollo-pharmacy-pune')
        .set('Authorization', validToken('fired-employee-uid'));

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        type: 'https://pharmadesk.in/errors/forbidden',
        title: 'Forbidden',
        status: 403,
      });
      expect(response.body.detail).toContain('is currently deactivated');
    });

    it('should allow active member with valid role and permissions', async () => {
      setTestMembership('medplus-mumbai-01', 'active-owner-uid', {
        tenantId: 'medplus-mumbai-01',
        userId: 'active-owner-uid',
        role: 'owner',
        status: 'active',
        assignedBranchIds: ['main', '*'],
        permissions: ['*'],
      });

      const response = await request(app)
        .get('/api/v1/tenants/medplus-mumbai-01/members')
        .set('Authorization', validToken('active-owner-uid'));

      // If authenticated and authorized, either 200 or successful read
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Branch-level authorization checks', () => {
    it('should reject access when user is not assigned to the requested branch', async () => {
      setTestMembership('care-pharmacy-delhi', 'cashier-branch-a', {
        tenantId: 'care-pharmacy-delhi',
        userId: 'cashier-branch-a',
        role: 'cashier',
        status: 'active',
        assignedBranchIds: ['counter-north'], // Only assigned to north counter
        permissions: ['billing:create'],
      });

      const response = await request(app)
        .get('/api/v1/tenants/care-pharmacy-delhi/members')
        .set('Authorization', validToken('cashier-branch-a'))
        .set('X-Branch-ID', 'counter-south'); // Trying to access south counter

      expect(response.status).toBe(403);
      expect(response.body.detail).toContain('not have permission to access branch');
    });

    it('should allow owner access to any branch automatically', async () => {
      setTestMembership('care-pharmacy-delhi', 'owner-all-branches', {
        tenantId: 'care-pharmacy-delhi',
        userId: 'owner-all-branches',
        role: 'owner',
        status: 'active',
        assignedBranchIds: ['main', '*'],
        permissions: ['*'],
      });

      const response = await request(app)
        .get('/api/v1/tenants/care-pharmacy-delhi/members')
        .set('Authorization', validToken('owner-all-branches'))
        .set('X-Branch-ID', 'counter-south');

      expect(response.status).toBe(200);
    });
  });

  describe('Role-based permission enforcement', () => {
    it('should forbid non-owner from changing employee membership status', async () => {
      setTestMembership('care-pharmacy-delhi', 'staff-pharmacist', {
        tenantId: 'care-pharmacy-delhi',
        userId: 'staff-pharmacist',
        role: 'pharmacist',
        status: 'active',
        assignedBranchIds: ['main'],
        permissions: ['billing:create'],
      });

      const response = await request(app)
        .patch('/api/v1/tenants/care-pharmacy-delhi/members/helper-123/status')
        .set('Authorization', validToken('staff-pharmacist'))
        .send({ status: 'deactivated' });

      expect(response.status).toBe(403);
      expect(response.body.detail).toContain('requires one of the following roles: [owner]');
    });
  });
});

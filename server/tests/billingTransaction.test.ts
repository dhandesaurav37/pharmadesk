import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { Express } from 'express';
import { setTestMembership, clearTestMemberships } from '../src/middleware/tenantAuthorization';

describe('Billing Transaction & Inventory Integrity', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    clearTestMemberships();
    setTestMembership('test-pharmacy', 'billing-user-1', {
      tenantId: 'test-pharmacy',
      userId: 'billing-user-1',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: ['main'],
      permissions: ['billing:create', 'inventory:read'],
    });
  });

  const validToken = 'Bearer test-mock-token:billing-user-1:biller@pharmadesk.test';

  describe('Validation & Idempotency Constraints', () => {
    it('should reject invoice creation without idempotency key with 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/v1/tenants/test-pharmacy/invoices')
        .set('Authorization', validToken)
        .send({
          customer: { name: 'Ramesh Patel' },
          items: [
            {
              batchId: 'batch-001',
              medicineId: 'med-paracetamol',
              medicineName: 'Dolo 650mg',
              quantity: 2,
              unitPrice: 30,
              mrp: 35,
              gstRate: 12,
            },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.detail).toContain('Idempotency key must be provided');
    });

    it('should reject invoice creation with empty items list with 422 Validation Error', async () => {
      const response = await request(app)
        .post('/api/v1/tenants/test-pharmacy/invoices')
        .set('Authorization', validToken)
        .set('X-Idempotency-Key', 'idemp-key-unique-12345')
        .send({
          customer: { name: 'Ramesh Patel' },
          items: [],
        });

      expect(response.status).toBe(422);
      expect(response.body.title).toBe('Validation Error');
    });

    it('should reject invoice creation if quantity is zero or negative', async () => {
      const response = await request(app)
        .post('/api/v1/tenants/test-pharmacy/invoices')
        .set('Authorization', validToken)
        .set('X-Idempotency-Key', 'idemp-key-unique-67890')
        .send({
          customer: { name: 'Suresh Kumar' },
          items: [
            {
              batchId: 'batch-001',
              medicineId: 'med-01',
              medicineName: 'Azithromycin 500mg',
              quantity: -5,
              unitPrice: 100,
              mrp: 120,
              gstRate: 12,
            },
          ],
        });

      expect(response.status).toBe(422);
      expect(response.body.invalidParams?.some((p: any) => p.name.includes('quantity'))).toBe(true);
    });
  });
});

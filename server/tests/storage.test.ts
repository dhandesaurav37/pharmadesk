import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { Express } from 'express';
import { setTestMembership, clearTestMemberships } from '../src/middleware/tenantAuthorization';

describe('Storage Service & Signed URL Endpoints', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    clearTestMemberships();
    setTestMembership('apollo-pune', 'doc-uploader-1', {
      tenantId: 'apollo-pune',
      userId: 'doc-uploader-1',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: ['main'],
      permissions: ['inventory:write'],
    });
  });

  const validToken = 'Bearer test-mock-token:doc-uploader-1:uploader@pharmadesk.test';

  describe('POST /api/v1/tenants/:tenantId/storage/upload-url', () => {
    it('should generate signed upload URL with tenant-isolated storage path', async () => {
      const response = await request(app)
        .post('/api/v1/tenants/apollo-pune/storage/upload-url')
        .set('Authorization', validToken)
        .send({
          category: 'prescriptions',
          fileName: 'rx_patient_001.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('uploadUrl');
      expect(response.body.data).toHaveProperty('storagePath');
      expect(response.body.data.storagePath).toMatch(/^tenants\/apollo-pune\/branches\/main\/prescriptions\//);
      expect(response.body.data.contentType).toBe('application/pdf');
    });

    it('should reject unpermitted file content types (e.g., executables or scripts)', async () => {
      const response = await request(app)
        .post('/api/v1/tenants/apollo-pune/storage/upload-url')
        .set('Authorization', validToken)
        .send({
          category: 'prescriptions',
          fileName: 'malicious_script.exe',
          contentType: 'application/x-msdownload',
        });

      expect(response.status).toBe(400);
      expect(response.body.detail).toContain('Unsupported media type');
    });
  });

  describe('GET /api/v1/tenants/:tenantId/storage/download-url', () => {
    it('should generate signed download URL for tenant document', async () => {
      const response = await request(app)
        .get('/api/v1/tenants/apollo-pune/storage/download-url')
        .set('Authorization', validToken)
        .query({
          category: 'supplier_bills',
          fileId: 'bill_nov2026_1001.pdf',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('downloadUrl');
      expect(response.body.data.storagePath).toContain('tenants/apollo-pune/branches/main/supplier_bills/bill_nov2026_1001.pdf');
    });
  });
});

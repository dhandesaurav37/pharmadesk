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
      permissions: ['inventory.write', 'billing.create', 'billing.view', 'goods_receipts.view', 'medicines.create'],
    });
    setTestMembership('apollo-pune', 'helper-1', {
      tenantId: 'apollo-pune',
      userId: 'helper-1',
      role: 'helper',
      status: 'active',
      assignedBranchIds: ['main'],
      permissions: ['medicines.view', 'inventory.view'],
    });
  });

  const validToken = 'Bearer test-mock-token:doc-uploader-1:uploader@pharmadesk.test';
  const helperToken = 'Bearer test-mock-token:helper-1:helper@pharmadesk.test';

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

    it('should reject unpermitted file content types including executables and SVG scripts', async () => {
      const exeRes = await request(app)
        .post('/api/v1/tenants/apollo-pune/storage/upload-url')
        .set('Authorization', validToken)
        .send({
          category: 'prescriptions',
          fileName: 'malicious_script.exe',
          contentType: 'application/x-msdownload',
        });

      expect(exeRes.status).toBe(400);
      expect(exeRes.body.detail).toContain('Unsupported media type');

      const svgRes = await request(app)
        .post('/api/v1/tenants/apollo-pune/storage/upload-url')
        .set('Authorization', validToken)
        .send({
          category: 'product_images',
          fileName: 'xss_payload.svg',
          contentType: 'image/svg+xml',
        });

      expect(svgRes.status).toBe(400);
      expect(svgRes.body.detail).toContain('Unsupported media type');
    });

    it('should deny unauthorized role from uploading prescriptions or invoice PDFs', async () => {
      const response = await request(app)
        .post('/api/v1/tenants/apollo-pune/storage/upload-url')
        .set('Authorization', helperToken)
        .send({
          category: 'prescriptions',
          fileName: 'rx_patient_002.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(403);
      expect(response.body.detail).toContain('Missing required permission');
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

    it('should generate signed upload URLs for invoice_pdfs and product_images', async () => {
      const invoiceRes = await request(app)
        .post('/api/v1/tenants/apollo-pune/storage/upload-url')
        .set('Authorization', validToken)
        .send({
          category: 'invoice_pdfs',
          fileName: 'INV-MAIN-2026-000101.pdf',
          contentType: 'application/pdf',
        });

      expect(invoiceRes.status).toBe(200);
      expect(invoiceRes.body.data.storagePath).toMatch(/^tenants\/apollo-pune\/branches\/main\/invoice_pdfs\//);

      const imageRes = await request(app)
        .post('/api/v1/tenants/apollo-pune/storage/upload-url')
        .set('Authorization', validToken)
        .send({
          category: 'product_images',
          fileName: 'dolo_650_pack.png',
          contentType: 'image/png',
        });

      expect(imageRes.status).toBe(200);
      expect(imageRes.body.data.storagePath).toMatch(/^tenants\/apollo-pune\/branches\/main\/product_images\//);
    });
  });
});

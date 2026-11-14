import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { env, validateEnv } from '../src/config/env';
import { buildCorsOptions } from '../src/config/cors';
import { escapeCsvCell } from '../src/lib/csv';
import {
  clearTestMemberships,
  clearTestBranchStatuses,
  setTestMembership,
} from '../src/middleware/tenantAuthorization';
import { clearTestInvitations } from '../src/services/employeeService';
import { AuditService, clearTestAuditLogs } from '../src/services/auditService';
import { clearTestSecurityData } from '../src/services/securityGovernanceService';
import { clearTestInventory, setTestBatch } from '../src/services/inventoryService';
import { clearTestMedicines, setTestMedicine } from '../src/services/medicineService';
import { clearTestBilling, BillingTransactionService } from '../src/services/billingTransactionService';
import { clearTestCustomers } from '../src/services/customerService';
import { clearTestSuppliers, SupplierService } from '../src/services/supplierService';
import { clearTestProcurementData, ProcurementService } from '../src/services/procurementService';
import { AccountingService, clearTestAccountingData } from '../src/services/accountingService';
import { clearTestBranchData, BranchService } from '../src/services/branchService';
import { clearTestStockTransfers, StockTransferService } from '../src/services/stockTransferService';

describe('Phase 11: Security Hardening, Data Protection & Disaster Recovery', () => {
  let app: Express;
  const tenantId = 'pharma-sec-pune';

  const ownerToken = 'Bearer test-mock-token:sec-owner:owner@sec.test';
  const auditorToken = 'Bearer test-mock-token:sec-auditor:auditor@sec.test';
  const cashierToken = 'Bearer test-mock-token:sec-cashier:cashier@sec.test';
  const helperToken = 'Bearer test-mock-token:sec-helper:helper@sec.test';
  const hrSubAdminToken = 'Bearer test-mock-token:sec-hr:hr@sec.test';
  const branch2StaffToken = 'Bearer test-mock-token:sec-br2:br2@sec.test';
  const branch3StaffToken = 'Bearer test-mock-token:sec-br3:br3@sec.test';

  const headersFor = (token: string, branchId = 'main', extra?: Record<string, string>) => ({
    Authorization: token,
    'X-Tenant-ID': tenantId,
    'X-Branch-ID': branchId,
    ...(extra || {}),
  });

  const futureMonth = () => {
    const d = new Date(Date.now() + 365 * 86400_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    clearTestMemberships();
    clearTestBranchStatuses();
    clearTestBranchData();
    clearTestStockTransfers();
    clearTestInvitations();
    clearTestAuditLogs();
    clearTestSecurityData();
    clearTestInventory();
    clearTestMedicines();
    clearTestBilling();
    clearTestCustomers();
    clearTestSuppliers();
    clearTestProcurementData();
    clearTestAccountingData();

    setTestMembership(tenantId, 'sec-owner', {
      tenantId,
      userId: 'sec-owner',
      name: 'Owner Admin',
      email: 'owner@sec.test',
      role: 'owner',
      status: 'active',
      assignedBranchIds: ['main', 'branch-2', 'branch-3', '*'],
      permissions: ['*'],
    });

    setTestMembership(tenantId, 'sec-auditor', {
      tenantId,
      userId: 'sec-auditor',
      name: 'Compliance Auditor',
      email: 'auditor@sec.test',
      role: 'auditor',
      status: 'active',
      assignedBranchIds: ['main'],
    });

    setTestMembership(tenantId, 'sec-cashier', {
      tenantId,
      userId: 'sec-cashier',
      name: 'Counter Cashier',
      email: 'cashier@sec.test',
      role: 'cashier',
      status: 'active',
      assignedBranchIds: ['main'],
    });

    setTestMembership(tenantId, 'sec-helper', {
      tenantId,
      userId: 'sec-helper',
      name: 'Store Helper',
      email: 'helper@sec.test',
      role: 'helper',
      status: 'active',
      assignedBranchIds: ['main'],
    });

    setTestMembership(tenantId, 'sec-hr', {
      tenantId,
      userId: 'sec-hr',
      name: 'Delegated Branch Pharmacist',
      email: 'hr@sec.test',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: ['main'],
      permissionOverrides: { granted: ['employees.invite', 'employees.view'] },
    });

    setTestMembership(tenantId, 'sec-br2', {
      tenantId,
      userId: 'sec-br2',
      name: 'Branch 2 Pharmacist',
      email: 'br2@sec.test',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: ['branch-2'],
      permissionOverrides: {
        granted: [
          'purchase_orders.approve',
          'goods_receipts.correct',
          'accounting.journals.reverse',
          'billing.cancel',
          'stock_transfers.submit',
        ],
      },
    });

    setTestMembership(tenantId, 'sec-br3', {
      tenantId,
      userId: 'sec-br3',
      name: 'Branch 3 Pharmacist',
      email: 'br3@sec.test',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: ['branch-3'],
      permissionOverrides: { granted: ['stock_transfers.submit'] },
    });

    await BranchService.ensureMainBranchSeeded(tenantId);
  });

  describe('HTTP Hardening, CORS, Env Validation, CSV Injection & App Check', () => {
    it('sets Helmet security headers and no-store cache directives on API routes while keeping health cacheable', async () => {
      const secRes = await request(app)
        .get('/api/v1/security/posture')
        .set(headersFor(ownerToken));

      expect(secRes.status).toBe(200);
      expect(secRes.headers['x-frame-options']).toBe('DENY');
      expect(secRes.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(secRes.headers['cache-control']).toContain('no-store');
      expect(secRes.headers['pragma']).toBe('no-cache');

      const healthRes = await request(app).get('/api/v1/health/live');
      expect(healthRes.status).toBe(200);
      expect(healthRes.headers['cache-control']).toBeUndefined();
    });

    it('rejects wildcard CORS origins in production and exposes required idempotency/rate-limit headers', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          CORS_ALLOWED_ORIGINS: 'https://pharmadesk.web.app,*',
        })
      ).toThrow(/Wildcard "\*" origin is strictly prohibited in production/);

      const corsOpts = buildCorsOptions(['https://pharmadesk.web.app', '*'], 'production');
      expect(corsOpts.allowedHeaders).toContain('X-Idempotency-Key');
      expect(corsOpts.exposedHeaders).toContain('X-Cache');
      expect(corsOpts.exposedHeaders).toContain('RateLimit-Limit');
    });

    it('fails closed with 403 when FIREBASE_APP_CHECK_REQUIRED=true and X-Firebase-AppCheck header is missing', async () => {
      const prev = env.FIREBASE_APP_CHECK_REQUIRED;
      (env as any).FIREBASE_APP_CHECK_REQUIRED = true;
      try {
        const res = await request(app)
          .get('/api/v1/security/posture')
          .set(headersFor(ownerToken));
        expect(res.status).toBe(403);
        expect(res.body.detail).toContain('X-Firebase-AppCheck');
      } finally {
        (env as any).FIREBASE_APP_CHECK_REQUIRED = prev;
      }
    });

    it('neutralizes CSV spreadsheet formula injection payloads while preserving negative numbers', () => {
      expect(escapeCsvCell('=CMD("calc")')).toBe(`"'=CMD(""calc"")"`);
      expect(escapeCsvCell('+1+1')).toBe("'+1+1");
      expect(escapeCsvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
      expect(escapeCsvCell('\t2+2')).toBe("'\t2+2");
      expect(escapeCsvCell('  =HYPERLINK("http://evil")')).toBe(`"'  =HYPERLINK(""http://evil"")"`);
      expect(escapeCsvCell(-125.5)).toBe('-125.5');
      expect(escapeCsvCell('-980.00')).toBe('-980.00');
      expect(escapeCsvCell('Cipla, Ltd.')).toBe('"Cipla, Ltd."');
    });
  });

  describe('Cross-Branch Authorization & Privilege Boundary Fixes', () => {
    it('blocks cross-branch access to inventory batches, invoices, POs, GRNs, journals, and stock transfers', async () => {
      const med = setTestMedicine(tenantId, {
        id: 'med-sec-1',
        name: 'Paracetamol 650',
        genericName: 'Acetaminophen',
        brand: 'Calpol',
        category: 'Analgesic',
        dosageForm: 'Tablet',
        strength: '650mg',
        packSize: '15 Tabs',
        uom: 'Strip',
        hsnCode: '30049099',
        gstRate: 12,
        prescriptionRequired: false,
        minStockThreshold: 10,
        status: 'active',
        createdBy: 'sec-owner',
      });

      const batch = setTestBatch(tenantId, {
        id: 'batch-main-sec',
        branchId: 'main',
        medicineId: med.id,
        medicineName: med.name,
        genericName: med.genericName,
        batchNumber: 'B-SEC-01',
        expiryDate: futureMonth(),
        purchasePrice: 20,
        mrp: 35,
        sellingPrice: 32,
        quantityReceived: 50,
        currentStock: 50,
        freeQuantity: 0,
      });

      // 1. Inventory :batchId cross-branch check
      const invCross = await request(app)
        .get(`/api/v1/inventory/${batch.id}`)
        .set(headersFor(branch2StaffToken, 'branch-2'));
      expect(invCross.status).toBe(403);

      // 2. Billing cancel & payment cross-branch checks
      const invoiceRes = await BillingTransactionService.createSalesInvoice({
        tenantId,
        branchId: 'main',
        userId: 'sec-owner',
        callerRole: 'owner',
        callerPermissions: ['*'],
        idempotencyKey: 'sec-inv-key-0001',
        customer: { name: 'Walk-in Patient' },
        items: [{ medicineId: med.id, batchId: batch.id, quantity: 2 }],
        payments: [{ mode: 'cash', amount: 64 }],
      });

      const cancelCross = await request(app)
        .post(`/api/v1/invoices/${invoiceRes.invoice.id}/cancel`)
        .set(headersFor(branch2StaffToken, 'branch-2'))
        .send({ reason: 'Unauthorized branch cancellation' });
      expect(cancelCross.status).toBe(403);

      const payCross = await request(app)
        .post(`/api/v1/invoices/${invoiceRes.invoice.id}/payments`)
        .set(headersFor(branch2StaffToken, 'branch-2', { 'X-Idempotency-Key': 'sec-pay-cross-01' }))
        .send({ mode: 'cash', amount: 10 });
      expect(payCross.status).toBe(403);

      // 3. Procurement PO approve & GRN reverse cross-branch checks
      const supplier = await SupplierService.createSupplier(
        tenantId,
        {
          tradeName: 'MedSupply India',
          legalName: 'MedSupply India Pvt Ltd',
          primaryPhone: '+919820011223',
          supplierType: 'DISTRIBUTOR',
        },
        'sec-owner'
      );

      const po = await ProcurementService.createPurchaseOrder(
        tenantId,
        'main',
        {
          supplierId: supplier.supplierId,
          items: [{ medicineId: med.id, orderedQuantity: 10, unitCost: 20, gstRate: 12 }],
          submitImmediately: true,
        },
        'sec-owner'
      );

      const poCrossApprove = await request(app)
        .post(`/api/v1/purchase-orders/${po.purchaseOrderId}/approve`)
        .set(headersFor(branch2StaffToken, 'branch-2'));
      expect(poCrossApprove.status).toBe(403);

      await ProcurementService.approvePurchaseOrder(tenantId, po.purchaseOrderId, 'sec-owner');
      const grnRes = await ProcurementService.createAndPostGrn(
        tenantId,
        'main',
        {
          poId: po.purchaseOrderId,
          supplierId: supplier.supplierId,
          supplierInvoiceNumber: 'SUP-INV-900',
          items: [
            {
              poItemId: po.items[0].poItemId,
              medicineId: med.id,
              batchNumber: 'GRN-SEC-01',
              expiryDate: futureMonth(),
              acceptedQuantity: 5,
              rejectedQuantity: 0,
              purchasePrice: 20,
              mrp: 35,
            },
          ],
        },
        'sec-grn-key-0001',
        'sec-owner',
        { role: 'owner', permissions: ['*'], assignedBranchIds: ['*'] }
      );

      const grnCrossReverse = await request(app)
        .post(`/api/v1/goods-receipts/${grnRes.grn.grnId}/reverse`)
        .set(headersFor(branch2StaffToken, 'branch-2'))
        .send({ reason: 'Unauthorized branch reversal' });
      expect(grnCrossReverse.status).toBe(403);

      // 4. Accounting journal reversal cross-branch check
      const journals = await AccountingService.listJournalEntries(tenantId, { branchId: 'main' });
      expect(journals.length).toBeGreaterThan(0);
      const journalCrossReverse = await request(app)
        .post(`/api/v1/accounting/journal-entries/${journals[0].id}/reverse`)
        .set(headersFor(branch2StaffToken, 'branch-2'))
        .send({ reason: 'Unauthorized journal reversal' });
      expect(journalCrossReverse.status).toBe(403);

      // 5. Stock transfer non-participant 3rd branch block
      const transfer = await StockTransferService.createTransfer(
        tenantId,
        {
          sourceBranchId: 'main',
          destinationBranchId: 'branch-2',
          items: [{ sourceBatchId: batch.id, requestedQuantity: 2 }],
        },
        'sec-owner',
        'owner',
        ['*']
      );

      const transferThirdBranch = await request(app)
        .post(`/api/v1/stock-transfers/${transfer.id}/submit`)
        .set(headersFor(branch3StaffToken, 'branch-3'));
      expect(transferThirdBranch.status).toBe(403);
    });

    it('masks raw invitation tokens on list, prevents non-owner branch/override escalation, and protects GET members', async () => {
      // Create invitation as owner -> returned once with raw token
      const createRes = await request(app)
        .post(`/api/v1/tenants/${tenantId}/invitations`)
        .set(headersFor(ownerToken))
        .send({
          name: 'New Cashier',
          email: 'newcashier@sec.test',
          role: 'cashier',
          assignedBranchIds: ['main'],
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.data.token).toHaveLength(64);

      // Listing invitations must mask raw token
      const listRes = await request(app)
        .get(`/api/v1/tenants/${tenantId}/invitations`)
        .set(headersFor(ownerToken));
      expect(listRes.status).toBe(200);
      expect(listRes.body.data[0].token).toMatch(/^\*\*\*.{6}$/);

      // Non-owner inviter cannot assign unassigned branch or permissionOverrides
      const crossInvite = await request(app)
        .post(`/api/v1/tenants/${tenantId}/invitations`)
        .set(headersFor(hrSubAdminToken))
        .send({
          name: 'Escalated Staff',
          email: 'esc1@sec.test',
          role: 'cashier',
          assignedBranchIds: ['branch-2'],
        });
      expect(crossInvite.status).toBe(403);

      const overrideInvite = await request(app)
        .post(`/api/v1/tenants/${tenantId}/invitations`)
        .set(headersFor(hrSubAdminToken))
        .send({
          name: 'Escalated Staff 2',
          email: 'esc2@sec.test',
          role: 'cashier',
          assignedBranchIds: ['main'],
          permissionOverrides: { granted: ['billing.cancel'] },
        });
      expect(overrideInvite.status).toBe(403);

      // Helper without employees.view cannot read member directory
      const helperMembersRes = await request(app)
        .get(`/api/v1/tenants/${tenantId}/members`)
        .set(headersFor(helperToken));
      expect(helperMembersRes.status).toBe(403);
    });
  });

  describe('Phase 11 Governance Endpoints, Audit Masking, DPDP Export & DR Drills', () => {
    it('masks PHI and tokens in audit_logs metadata and supports filtered querying', async () => {
      await AuditService.log({
        tenantId,
        branchId: 'main',
        category: 'privacy',
        actingUserId: 'sec-owner',
        action: 'PATIENT_PROFILE_ACCESSED',
        metadata: {
          phone: '+919876543210',
          allergies: 'Penicillin',
          token: 'super-secret-jwt-token',
        },
      });

      const logsRes = await request(app)
        .get('/api/v1/security/audit-logs?action=PATIENT_PROFILE')
        .set(headersFor(auditorToken));

      expect(logsRes.status).toBe(200);
      expect(logsRes.body.data.logs.length).toBe(1);
      const entry = logsRes.body.data.logs[0];
      expect(entry.metadata.phone).toBe('***3210');
      expect(entry.metadata.allergies).toBe('[REDACTED]');
      expect(entry.metadata.token).toBe('[REDACTED]');
    });

    it('enforces RBAC between owner, auditor (read-only), and cashier (denied)', async () => {
      // Cashier denied
      const cashierRes = await request(app)
        .get('/api/v1/security/posture')
        .set(headersFor(cashierToken));
      expect(cashierRes.status).toBe(403);

      // Auditor allowed read-only posture and retention policy
      const auditorPosture = await request(app)
        .get('/api/v1/security/posture')
        .set(headersFor(auditorToken));
      expect(auditorPosture.status).toBe(200);
      expect(auditorPosture.body.data.controls.pinoPhiRedactionEnabled).toBe(true);

      // Auditor blocked from mutating retention policy, exporting DPDP bundle, or running DR drills
      const auditorUpdateRetention = await request(app)
        .put('/api/v1/security/retention-policy')
        .set(headersFor(auditorToken))
        .send({
          taxInvoiceYears: 8,
          prescriptionYears: 5,
          auditLogDays: 730,
          supplierRecordYears: 8,
          dpdpExportTtlMinutes: 15,
        });
      expect(auditorUpdateRetention.status).toBe(403);

      const auditorExport = await request(app)
        .post('/api/v1/security/dpdp-export')
        .set(headersFor(auditorToken))
        .send({ reason: 'Compliance test' });
      expect(auditorExport.status).toBe(403);

      const auditorDrill = await request(app)
        .post('/api/v1/security/dr-drills')
        .set(headersFor(auditorToken))
        .send({ drillType: 'INTEGRITY_CHECK' });
      expect(auditorDrill.status).toBe(403);
    });

    it('allows owner to update statutory retention policy, export audited DPDP bundle, and execute DR drills', async () => {
      // Invalid statutory tax invoice retention (< 6 years) rejected
      const invalidRetention = await request(app)
        .put('/api/v1/security/retention-policy')
        .set(headersFor(ownerToken))
        .send({
          taxInvoiceYears: 2,
          prescriptionYears: 3,
          auditLogDays: 365,
          supplierRecordYears: 6,
          dpdpExportTtlMinutes: 15,
        });
      expect(invalidRetention.status).toBe(422);

      const validRetention = await request(app)
        .put('/api/v1/security/retention-policy')
        .set(headersFor(ownerToken))
        .send({
          taxInvoiceYears: 8,
          prescriptionYears: 5,
          auditLogDays: 730,
          supplierRecordYears: 8,
          dpdpExportTtlMinutes: 20,
          legalHoldEnabled: true,
        });
      expect(validRetention.status).toBe(200);
      expect(validRetention.body.data.policy.taxInvoiceYears).toBe(8);
      expect(validRetention.body.data.policy.legalHoldEnabled).toBe(true);

      // Seed customer with clinical PHI and confirm DPDP export redacts PHI by default
      await request(app)
        .post('/api/v1/customers')
        .set(headersFor(ownerToken))
        .send({
          name: 'Ramesh Kulkarni',
          phone: '9822012345',
          allergies: 'Sulfa Drugs',
          chronicConditions: 'Type-2 Diabetes',
        });

      const dpdpRes = await request(app)
        .post('/api/v1/security/dpdp-export')
        .set(headersFor(ownerToken))
        .send({ reason: 'Quarterly DPDP Act data portability verification', includeClinicalPhi: false });

      expect(dpdpRes.status).toBe(201);
      expect(dpdpRes.body.data.manifest.checksumSha256).toHaveLength(64);
      expect(dpdpRes.body.data.bundle.data.customers.length).toBe(1);
      expect(dpdpRes.body.data.bundle.data.customers[0].allergies).toBeUndefined();
      expect(dpdpRes.body.data.bundle.data.customers[0].clinicalPhiRedacted).toBe(true);

      const drRes = await request(app)
        .post('/api/v1/security/dr-drills')
        .set(headersFor(ownerToken))
        .send({ drillType: 'INTEGRITY_CHECK', notes: 'Automated monthly DR verification' });

      expect(drRes.status).toBe(201);
      expect(drRes.body.data.drill.status).toBe('PASSED');
      expect(drRes.body.data.drill.integritySummary.unbalancedJournals).toBe(0);
    });
  });
});

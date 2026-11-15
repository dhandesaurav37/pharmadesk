import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import {
  setTestMembership,
  clearTestMemberships,
} from '../src/middleware/tenantAuthorization';
import {
  clearTestMedicines,
  setTestMedicine,
} from '../src/services/medicineService';
import {
  clearTestInventory,
  getAllTestBatchesForTenant,
  InventoryService,
  setTestBatch,
} from '../src/services/inventoryService';
import {
  clearTestBilling,
} from '../src/services/billingTransactionService';
import {
  clearTestAuditLogs,
} from '../src/services/auditService';
import {
  clearTestSuppliers,
  getTestSupplierDirect,
} from '../src/services/supplierService';
import {
  clearTestProcurementData,
  getTestPurchaseOperationsForTenant,
  setTestTenantProfile,
} from '../src/services/procurementService';

describe('Phase 8: Supplier Management, Purchase Orders, Goods Receipts & Accounts Payable', () => {
  let app: Express;
  const tenantId = 'pharma-procurement-mumbai';
  const otherTenantId = 'pharma-other-nagpur';
  const branchMain = 'branch-main';
  const branchWest = 'branch-west';

  const ownerToken = 'Bearer test-mock-token:owner-1:owner@pharma.test';
  const pharmacistToken = 'Bearer test-mock-token:pharm-1:sunita@pharma.test';
  const cashierToken = 'Bearer test-mock-token:cashier-1:rohan@pharma.test';
  const helperToken = 'Bearer test-mock-token:helper-1:mahesh@pharma.test';
  const auditorToken = 'Bearer test-mock-token:auditor-1:arvind@pharma.test';
  const branchWestStaffToken = 'Bearer test-mock-token:west-pharm:west@pharma.test';
  const otherOwnerToken = 'Bearer test-mock-token:other-owner:other@nagpur.test';

  const headersFor = (token: string, tId = tenantId, bId = branchMain) => ({
    Authorization: token,
    'X-Tenant-ID': tId,
    'X-Branch-ID': bId,
  });

  const futureDate = (daysAhead: number): string => {
    const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  };

  const pastDate = (daysAgo: number): string => {
    const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  };

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    clearTestMemberships();
    clearTestMedicines();
    clearTestInventory();
    clearTestBilling();
    clearTestAuditLogs();
    clearTestSuppliers();
    clearTestProcurementData();

    setTestTenantProfile(tenantId, {
      name: 'Arogya Care Chemist',
      gstin: '27AAECA1234F1Z5',
      state: 'Maharashtra',
      stateCode: '27',
    });

    setTestTenantProfile(otherTenantId, {
      name: 'Vidarbha Medicos',
      gstin: '27AAACV9999B1Z2',
      state: 'Maharashtra',
      stateCode: '27',
    });

    // Tenant 1 roles
    setTestMembership(tenantId, 'owner-1', {
      tenantId,
      userId: 'owner-1',
      name: 'Suresh Deshmukh',
      email: 'owner@pharma.test',
      role: 'owner',
      status: 'active',
      assignedBranchIds: [branchMain, branchWest, '*'],
      permissions: ['*'],
    });

    setTestMembership(tenantId, 'pharm-1', {
      tenantId,
      userId: 'pharm-1',
      name: 'Sunita Joshi',
      email: 'sunita@pharma.test',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: [branchMain],
    });

    setTestMembership(tenantId, 'cashier-1', {
      tenantId,
      userId: 'cashier-1',
      name: 'Rohan Kulkarni',
      email: 'rohan@pharma.test',
      role: 'cashier',
      status: 'active',
      assignedBranchIds: [branchMain],
    });

    setTestMembership(tenantId, 'helper-1', {
      tenantId,
      userId: 'helper-1',
      name: 'Mahesh Kale',
      email: 'mahesh@pharma.test',
      role: 'helper',
      status: 'active',
      assignedBranchIds: [branchMain],
    });

    setTestMembership(tenantId, 'auditor-1', {
      tenantId,
      userId: 'auditor-1',
      name: 'CA Arvind Iyer',
      email: 'arvind@pharma.test',
      role: 'auditor',
      status: 'active',
      assignedBranchIds: [branchMain, branchWest],
    });

    setTestMembership(tenantId, 'west-pharm', {
      tenantId,
      userId: 'west-pharm',
      name: 'Kiran Naik',
      email: 'west@pharma.test',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: [branchWest],
    });

    // Tenant 2 owner
    setTestMembership(otherTenantId, 'other-owner', {
      tenantId: otherTenantId,
      userId: 'other-owner',
      name: 'Vikram Tiwari',
      email: 'other@nagpur.test',
      role: 'owner',
      status: 'active',
      assignedBranchIds: [branchMain, '*'],
      permissions: ['*'],
    });

    // Seed Phase 5 medicines in tenantId
    setTestMedicine(tenantId, {
      id: 'med-dolo',
      tenantId,
      name: 'Dolo 650',
      genericName: 'Paracetamol',
      brand: 'Micro Labs',
      category: 'Tablet',
      dosageForm: 'tablet',
      strength: '650 mg',
      packSize: '15 Tablets',
      uom: 'strip',
      hsnCode: '30049099',
      gstRate: 12,
      barcode: '890123456001',
      prescriptionRequired: false,
      minStockThreshold: 20,
      status: 'active',
      createdBy: 'owner-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setTestMedicine(tenantId, {
      id: 'med-insulin',
      tenantId,
      name: 'Lantus SoloStar',
      genericName: 'Insulin Glargine',
      brand: 'Sanofi',
      category: 'Injection',
      dosageForm: 'injection',
      strength: '100 IU/ml',
      packSize: '1 Pen',
      uom: 'pen',
      hsnCode: '30043110',
      gstRate: 5,
      barcode: '890123456002',
      prescriptionRequired: true,
      minStockThreshold: 5,
      status: 'active',
      createdBy: 'owner-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setTestMedicine(tenantId, {
      id: 'med-ors',
      tenantId,
      name: 'Electral Zero GST',
      genericName: 'ORS Powder',
      brand: 'FDC',
      category: 'Powder',
      dosageForm: 'powder',
      strength: '21.8 g',
      packSize: '1 Sachet',
      uom: 'sachet',
      hsnCode: '30049000',
      gstRate: 0,
      barcode: '890123456003',
      prescriptionRequired: false,
      minStockThreshold: 30,
      status: 'active',
      createdBy: 'owner-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  // Helper to create an intra-state supplier (Maharashtra 27)
  async function createIntraStateSupplier(overrides: Record<string, any> = {}) {
    const res = await request(app)
      .post('/api/v1/suppliers')
      .set(headersFor(ownerToken))
      .send({
        legalName: 'Apollo Pharma Distributors Pvt Ltd',
        tradeName: 'Apollo Distributors',
        contactPerson: 'Rajesh Mehta',
        primaryPhone: '9820123456',
        email: 'orders@apollodist.in',
        gstin: '27AAECA4019C1Z4',
        pan: 'AAECA4019C',
        billingAddress: 'Plot 14, Andheri MIDC, Mumbai',
        state: 'Maharashtra',
        stateCode: '27',
        pincode: '400093',
        drugLicenceNumber: 'MH-MZ4-201944',
        supplierType: 'DISTRIBUTOR',
        paymentTerms: 'Net 30',
        creditPeriodDays: 30,
        creditLimit: 500000,
        bankDetails: {
          accountHolderName: 'Apollo Pharma Distributors Pvt Ltd',
          accountNumber: '004205008812',
          ifscCode: 'ICIC0000042',
          bankName: 'ICICI Bank',
          upiId: 'apollo@icici',
        },
        ...overrides,
      });
    return res;
  }

  // Helper to create an inter-state supplier (Karnataka 29)
  async function createInterStateSupplier() {
    return request(app)
      .post('/api/v1/suppliers')
      .set(headersFor(ownerToken))
      .send({
        legalName: 'Bengaluru MedSupply LLP',
        tradeName: 'BLR MedSupply',
        contactPerson: 'Anitha Rao',
        primaryPhone: '9845098450',
        gstin: '29AAACB7712K1Z1',
        state: 'Karnataka',
        stateCode: '29',
        supplierType: 'C_AND_F',
        paymentTerms: 'Net 15',
        creditPeriodDays: 15,
        creditLimit: 300000,
      });
  }

  describe('1. Supplier Directory, Validation, Duplicate Detection, RBAC & Cross-Tenant Isolation', () => {
    it('validates GSTIN, PAN, and Indian phone numbers and creates supplier cleanly', async () => {
      const badGstin = await createIntraStateSupplier({ gstin: 'INVALID-GST' });
      expect(badGstin.status).toBe(400);

      const badPan = await createIntraStateSupplier({ pan: '12345BAD' });
      expect(badPan.status).toBe(400);

      const shortPhone = await createIntraStateSupplier({ primaryPhone: '123' });
      expect(shortPhone.status).toBe(422);

      const badPhone = await createIntraStateSupplier({ primaryPhone: '0000000000' });
      expect(badPhone.status).toBe(400);

      const valid = await createIntraStateSupplier();
      expect(valid.status).toBe(201);
      const sup = valid.body.data.supplier;
      expect(sup.gstin).toBe('27AAECA4019C1Z4');
      expect(sup.gstinFormatValid).toBe(true);
      expect(sup.gstinVerificationNote).toContain('syntax validated locally');
      expect(sup.normalizedPhone).toBe('+919820123456');
      expect(sup.bankDetails?.ifscCode).toBe('ICIC0000042');
    });

    it('detects duplicate GSTIN or normalized phone (409) unless confirmDuplicate is true', async () => {
      const first = await createIntraStateSupplier();
      expect(first.status).toBe(201);

      const dup = await createIntraStateSupplier({
        legalName: 'Apollo Duplicate Branch',
        tradeName: 'Apollo Duplicate',
      });
      expect(dup.status).toBe(409);

      const confirmed = await createIntraStateSupplier({
        legalName: 'Apollo Duplicate Confirmed',
        tradeName: 'Apollo Confirmed',
        confirmDuplicate: true,
      });
      expect(confirmed.status).toBe(201);
      expect(confirmed.body.data.supplier.duplicateConfirmed).toBe(true);
    });

    it('enforces RBAC field-level redaction (bank details & financials) and cross-tenant isolation', async () => {
      const created = await createIntraStateSupplier();
      const supId = created.body.data.supplier.id;

      // Pharmacist can view supplier directory, but bank details & supplier financials are redacted by default
      const pharmView = await request(app)
        .get(`/api/v1/suppliers/${supId}`)
        .set(headersFor(pharmacistToken));
      expect(pharmView.status).toBe(200);
      expect(pharmView.body.data.supplier.bankDetails).toBeNull();
      expect(pharmView.body.data.supplier.bankDetailsRedacted).toBe(true);
      expect(pharmView.body.data.supplier.financialsRedacted).toBe(true);
      expect(pharmView.body.data.supplier.creditLimit).toBeNull();

      // Auditor has suppliers.view_financials (sees creditLimit & payables), NOT bank details
      const audView = await request(app)
        .get(`/api/v1/suppliers/${supId}`)
        .set(headersFor(auditorToken));
      expect(audView.status).toBe(200);
      expect(audView.body.data.supplier.creditLimit).toBe(500000);
      expect(audView.body.data.supplier.bankDetails).toBeNull();
      expect(audView.body.data.supplier.bankDetailsRedacted).toBe(true);

      // Auditor cannot mutate suppliers
      const audMutate = await request(app)
        .post('/api/v1/suppliers')
        .set(headersFor(auditorToken))
        .send({ legalName: 'Aud Blocked', contactPerson: 'X', primaryPhone: '9820111222', state: 'Maharashtra' });
      expect(audMutate.status).toBe(403);

      // Cashier & Helper denied access to suppliers & procurement
      const cashierRes = await request(app)
        .get('/api/v1/suppliers')
        .set(headersFor(cashierToken));
      expect(cashierRes.status).toBe(403);

      const helperPoRes = await request(app)
        .get('/api/v1/purchase-orders')
        .set(headersFor(helperToken));
      expect(helperPoRes.status).toBe(403);

      // Cross-tenant isolation
      const crossTenant = await request(app)
        .get(`/api/v1/suppliers/${supId}`)
        .set(headersFor(otherOwnerToken, otherTenantId));
      expect(crossTenant.status).toBe(404);
    });

    it('blocks PO creation against blocked supplier, requires owner to reactivate, and blocks archive when balance > 0', async () => {
      const res = await createIntraStateSupplier({ openingBalance: 1500 });
      const supId = res.body.data.supplier.id;

      // Cannot archive supplier with outstanding balance > 0
      const archiveBlocked = await request(app)
        .post(`/api/v1/suppliers/${supId}/archive`)
        .set(headersFor(ownerToken))
        .send({ reason: 'Closing account' });
      expect(archiveBlocked.status).toBe(400);

      // Block supplier
      const blocked = await request(app)
        .patch(`/api/v1/suppliers/${supId}/status`)
        .set(headersFor(ownerToken))
        .send({ status: 'BLOCKED', reason: 'Disputed quality batches' });
      expect(blocked.status).toBe(200);
      expect(blocked.body.data.supplier.status).toBe('BLOCKED');

      // PO creation rejected for blocked supplier
      const blockedPo = await request(app)
        .post('/api/v1/purchase-orders')
        .set(headersFor(pharmacistToken))
        .send({
          supplierId: supId,
          items: [{ medicineId: 'med-dolo', orderedQuantity: 10, unitCost: 22 }],
        });
      expect(blockedPo.status).toBe(400);

      // Non-owner cannot reactivate blocked supplier
      const pharmReactivate = await request(app)
        .patch(`/api/v1/suppliers/${supId}/status`)
        .set(headersFor(pharmacistToken))
        .send({ status: 'ACTIVE' });
      expect(pharmReactivate.status).toBe(403);

      // Owner can reactivate
      const ownerReactivate = await request(app)
        .patch(`/api/v1/suppliers/${supId}/status`)
        .set(headersFor(ownerToken))
        .send({ status: 'ACTIVE' });
      expect(ownerReactivate.status).toBe(200);
      expect(ownerReactivate.body.data.supplier.status).toBe('ACTIVE');

      // Zero-balance supplier archives cleanly
      const zeroSup = await createIntraStateSupplier({
        legalName: 'Zero Bal Vendor',
        tradeName: 'Zero Bal',
        primaryPhone: '9820777888',
        gstin: '27AAECZ1234K1Z9',
      });
      const zeroId = zeroSup.body.data.supplier.id;
      const archived = await request(app)
        .post(`/api/v1/suppliers/${zeroId}/archive`)
        .set(headersFor(ownerToken))
        .send({ reason: 'No longer trading' });
      expect(archived.status).toBe(200);
      expect(archived.body.data.supplier.isArchived).toBe(true);
    });
  });

  describe('2. Purchase Orders Lifecycle, Integer GST Calculations & Concurrent Approval Lock', () => {
    it('computes intra-state (CGST+SGST), inter-state (IGST), mixed GST rates, zero-rated GST, and leaves payable at 0', async () => {
      const intraSup = (await createIntraStateSupplier()).body.data.supplier;
      const interSup = (await createInterStateSupplier()).body.data.supplier;

      // Intra-state PO with mixed GST slabs (12% + 5% + 0%) + discount + otherCharges
      const intraPoRes = await request(app)
        .post('/api/v1/purchase-orders')
        .set(headersFor(pharmacistToken))
        .send({
          supplierId: intraSup.id,
          otherCharges: 10,
          items: [
            { medicineId: 'med-dolo', orderedQuantity: 10, unitCost: 20, gstRate: 12 }, // taxable 200 -> 12 CGST + 12 SGST
            { medicineId: 'med-insulin', orderedQuantity: 2, unitCost: 500, discountPercent: 10, gstRate: 5 }, // taxable 900 -> 22.50 CGST + 22.50 SGST
            { medicineId: 'med-ors', orderedQuantity: 5, unitCost: 15, gstRate: 0 }, // taxable 75 -> 0 tax
          ],
        });
      expect(intraPoRes.status).toBe(201);
      const po = intraPoRes.body.data.purchaseOrder;
      expect(po.status).toBe('DRAFT');
      expect(po.isInterState).toBe(false);
      expect(po.taxableAmount).toBe(1175);
      expect(po.cgst).toBe(34.5);
      expect(po.sgst).toBe(34.5);
      expect(po.igst).toBe(0);
      expect(po.totalTax).toBe(69);
      expect(po.grandTotal).toBe(1254); // 1175 + 69 + 10

      // PO is non-accounting: supplier payable must stay 0!
      expect(getTestSupplierDirect(tenantId, intraSup.id)?.currentOutstandingBalance).toBe(0);

      // Inter-state PO applies IGST only
      const interPoRes = await request(app)
        .post('/api/v1/purchase-orders')
        .set(headersFor(pharmacistToken))
        .send({
          supplierId: interSup.id,
          items: [{ medicineId: 'med-dolo', orderedQuantity: 10, unitCost: 100, gstRate: 12 }],
        });
      expect(interPoRes.status).toBe(201);
      const interPo = interPoRes.body.data.purchaseOrder;
      expect(interPo.isInterState).toBe(true);
      expect(interPo.cgst).toBe(0);
      expect(interPo.sgst).toBe(0);
      expect(interPo.igst).toBe(120);
      expect(interPo.grandTotal).toBe(1120);
    });

    it('prevents concurrent duplicate approval and rejects cancellation after partial stock receipt', async () => {
      const sup = (await createIntraStateSupplier()).body.data.supplier;
      const createRes = await request(app)
        .post('/api/v1/purchase-orders')
        .set(headersFor(pharmacistToken))
        .send({
          supplierId: sup.id,
          submitImmediately: true,
          items: [{ medicineId: 'med-dolo', orderedQuantity: 20, unitCost: 22, gstRate: 12 }],
        });
      expect(createRes.status).toBe(201);
      const poId = createRes.body.data.purchaseOrder.id;

      // Pharmacist lacks purchase_orders.approve by default
      const pharmApprove = await request(app)
        .post(`/api/v1/purchase-orders/${poId}/approve`)
        .set(headersFor(pharmacistToken));
      expect(pharmApprove.status).toBe(403);

      // Two concurrent approvals by owner -> strictly one succeeds (200) and second fails (409)
      const [a1, a2] = await Promise.all([
        request(app).post(`/api/v1/purchase-orders/${poId}/approve`).set(headersFor(ownerToken)),
        request(app).post(`/api/v1/purchase-orders/${poId}/approve`).set(headersFor(ownerToken)),
      ]);
      const statuses = [a1.status, a2.status].sort((x, y) => x - y);
      expect(statuses).toEqual([200, 409]);

      // Verify print payload
      const printRes = await request(app)
        .get(`/api/v1/purchase-orders/${poId}/print`)
        .set(headersFor(pharmacistToken));
      expect(printRes.status).toBe(200);
      expect(printRes.body.data.documentTitle).toBe('PURCHASE ORDER');
      expect(printRes.body.data.purchaseOrder.id).toBe(poId);
    });
  });

  describe('3. Goods Receipt Notes (GRN), Batch Inventory, Concurrency, Idempotency & Reversal', () => {
    it('rejects GRN against unapproved PO, expired batch, invalid mfg>expiry dates, and mismatched qty', async () => {
      const sup = (await createIntraStateSupplier()).body.data.supplier;
      const draftPo = (
        await request(app)
          .post('/api/v1/purchase-orders')
          .set(headersFor(pharmacistToken))
          .send({
            supplierId: sup.id,
            items: [{ medicineId: 'med-dolo', orderedQuantity: 20, unitCost: 20, gstRate: 12 }],
          })
      ).body.data.purchaseOrder;

      // Unapproved DRAFT PO -> 400
      const draftGrn = await request(app)
        .post('/api/v1/goods-receipts')
        .set({ ...headersFor(pharmacistToken), 'Idempotency-Key': 'grn-draft-po-0001' })
        .send({
          poId: draftPo.id,
          items: [
            {
              poItemId: draftPo.items[0].id,
              medicineId: 'med-dolo',
              batchNumber: 'B001',
              expiryDate: futureDate(365),
              acceptedQuantity: 10,
              rejectedQuantity: 0,
              purchasePrice: 20,
              mrp: 35,
            },
          ],
        });
      expect(draftGrn.status).toBe(400);

      await request(app).post(`/api/v1/purchase-orders/${draftPo.id}/approve`).set(headersFor(ownerToken));

      // Expired batch -> 400
      const expiredRes = await request(app)
        .post('/api/v1/goods-receipts')
        .set({ ...headersFor(pharmacistToken), 'Idempotency-Key': 'grn-expired-0001' })
        .send({
          poId: draftPo.id,
          items: [
            {
              poItemId: draftPo.items[0].id,
              medicineId: 'med-dolo',
              batchNumber: 'B-EXP',
              expiryDate: pastDate(10),
              acceptedQuantity: 10,
              rejectedQuantity: 0,
              purchasePrice: 20,
              mrp: 35,
            },
          ],
        });
      expect(expiredRes.status).toBe(400);

      // mfgDate > expiryDate -> 400
      const badDateOrder = await request(app)
        .post('/api/v1/goods-receipts')
        .set({ ...headersFor(pharmacistToken), 'Idempotency-Key': 'grn-bad-date-0001' })
        .send({
          poId: draftPo.id,
          items: [
            {
              poItemId: draftPo.items[0].id,
              medicineId: 'med-dolo',
              batchNumber: 'B-MISMATCH',
              manufacturingDate: futureDate(200),
              expiryDate: futureDate(100),
              acceptedQuantity: 10,
              rejectedQuantity: 0,
              purchasePrice: 20,
              mrp: 35,
            },
          ],
        });
      expect(badDateOrder.status).toBe(400);

      // accepted + rejected !== received -> 400
      const qtyMismatch = await request(app)
        .post('/api/v1/goods-receipts')
        .set({ ...headersFor(pharmacistToken), 'Idempotency-Key': 'grn-qty-mismatch-0001' })
        .send({
          poId: draftPo.id,
          items: [
            {
              poItemId: draftPo.items[0].id,
              medicineId: 'med-dolo',
              batchNumber: 'B-QTY',
              expiryDate: futureDate(200),
              receivedQuantity: 10,
              acceptedQuantity: 8,
              rejectedQuantity: 1,
              purchasePrice: 20,
              mrp: 35,
            },
          ],
        });
      expect(qtyMismatch.status).toBe(400);
    });

    it('supports partial delivery, multi-batch split, rejected exclusion, free units, short-expiry warnings, and short-close PO', async () => {
      const sup = (await createIntraStateSupplier()).body.data.supplier;
      const po = (
        await request(app)
          .post('/api/v1/purchase-orders')
          .set(headersFor(pharmacistToken))
          .send({
            supplierId: sup.id,
            submitImmediately: true,
            items: [{ medicineId: 'med-dolo', orderedQuantity: 30, unitCost: 20, gstRate: 12 }],
          })
      ).body.data.purchaseOrder;
      await request(app).post(`/api/v1/purchase-orders/${po.id}/approve`).set(headersFor(ownerToken));

      // Post partial GRN with 2 split batches for the same PO item:
      // Batch A: 10 accepted + 2 rejected + 1 free = 11 stock in inventory_batches
      // Batch B: 8 accepted + 0 rejected (short expiry within 60 days!) = 8 stock + warning
      const grn1Res = await request(app)
        .post('/api/v1/goods-receipts')
        .set({ ...headersFor(pharmacistToken), 'Idempotency-Key': 'grn-partial-split-001' })
        .send({
          poId: po.id,
          supplierInvoiceNumber: 'SUP-INV-701',
          shortExpiryWarningDays: 90,
          autoCreateSupplierInvoice: true,
          items: [
            {
              poItemId: po.items[0].id,
              medicineId: 'med-dolo',
              batchNumber: 'DOLO-BATCH-A',
              expiryDate: futureDate(400),
              receivedQuantity: 12,
              acceptedQuantity: 10,
              rejectedQuantity: 2,
              freeQuantity: 1,
              rejectionReason: 'Torn outer strip seal',
              purchasePrice: 20,
              mrp: 35,
              rackLocation: 'R-A1',
            },
            {
              poItemId: po.items[0].id,
              medicineId: 'med-dolo',
              batchNumber: 'DOLO-BATCH-B',
              expiryDate: futureDate(45),
              receivedQuantity: 8,
              acceptedQuantity: 8,
              rejectedQuantity: 0,
              purchasePrice: 20,
              mrp: 35,
              rackLocation: 'R-A2',
            },
          ],
        });
      expect(grn1Res.status).toBe(201);
      const grn1 = grn1Res.body.data.grn;
      expect(grn1.status).toBe('POSTED');
      expect(grn1.warnings.length).toBe(1);
      expect(grn1.warnings[0].batchNumber).toBe('DOLO-BATCH-B');
      expect(grn1Res.body.data.purchaseOrder.status).toBe('PARTIALLY_RECEIVED');
      expect(grn1Res.body.data.purchaseOrder.totalReceivedQty).toBe(18);
      expect(grn1Res.body.data.purchaseOrder.totalPendingQty).toBe(12);

      // Rejected units (2) must NOT be in inventory_batches; accepted + free = 11 + 8 = 19 units!
      const batches = getAllTestBatchesForTenant(tenantId);
      expect(batches.length).toBe(2);
      const batchA = batches.find((b) => b.batchNumber === 'DOLO-BATCH-A');
      const batchB = batches.find((b) => b.batchNumber === 'DOLO-BATCH-B');
      expect(batchA?.currentStock).toBe(11);
      expect(batchA?.purchaseReferenceId).toBe(grn1.id);
      expect(batchB?.currentStock).toBe(8);

      const movements = await InventoryService.listMovements(tenantId, { branchId: branchMain });
      expect(movements.filter((m) => m.movementType === 'PURCHASE_RECEIPT').length).toBe(2);
      expect(movements.reduce((s, m) => s + m.quantityChange, 0)).toBe(19);

      // Cancel blocked after receipt
      const cancelBlocked = await request(app)
        .post(`/api/v1/purchase-orders/${po.id}/cancel`)
        .set(headersFor(ownerToken))
        .send({ reason: 'Changed mind after partial stock' });
      expect(cancelBlocked.status).toBe(400);

      // Pharmacist cannot post over-receipt without goods_receipts.correct
      const overReceiptForbidden = await request(app)
        .post('/api/v1/goods-receipts')
        .set({ ...headersFor(pharmacistToken), 'Idempotency-Key': 'grn-over-receipt-002' })
        .send({
          poId: po.id,
          allowOverReceipt: true,
          overReceiptReason: 'Vendor sent extra free box',
          items: [
            {
              poItemId: po.items[0].id,
              medicineId: 'med-dolo',
              batchNumber: 'DOLO-BATCH-C',
              expiryDate: futureDate(300),
              acceptedQuantity: 20, // pending is 12!
              purchasePrice: 20,
              mrp: 35,
            },
          ],
        });
      expect(overReceiptForbidden.status).toBe(403);

      // Short-close partial PO cleanly
      const closeRes = await request(app)
        .post(`/api/v1/purchase-orders/${po.id}/close`)
        .set(headersFor(ownerToken))
        .send({ reason: 'Distributor confirmed remaining 12 strips out of stock' });
      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.purchaseOrder.status).toBe('CLOSED');

      // Check purchaseOperations recorded
      const ops = getTestPurchaseOperationsForTenant(tenantId);
      expect(ops.some((o) => o.operationType === 'POST_GRN' && o.status === 'COMMITTED')).toBe(true);
    });

    it('enforces GRN idempotent replay/conflict and prevents concurrent over-receipt race', async () => {
      const sup = (await createIntraStateSupplier()).body.data.supplier;
      const po = (
        await request(app)
          .post('/api/v1/purchase-orders')
          .set(headersFor(pharmacistToken))
          .send({
            supplierId: sup.id,
            submitImmediately: true,
            items: [{ medicineId: 'med-dolo', orderedQuantity: 10, unitCost: 20, gstRate: 12 }],
          })
      ).body.data.purchaseOrder;
      await request(app).post(`/api/v1/purchase-orders/${po.id}/approve`).set(headersFor(ownerToken));

      const payload = {
        poId: po.id,
        supplierInvoiceNumber: 'INV-IDEM-1',
        autoCreateSupplierInvoice: true,
        items: [
          {
            poItemId: po.items[0].id,
            medicineId: 'med-dolo',
            batchNumber: 'B-IDEM-1',
            expiryDate: futureDate(300),
            acceptedQuantity: 8,
            purchasePrice: 20,
            mrp: 35,
          },
        ],
      };

      // Idempotent replay with same key & payload returns 200 without duplicating batches/payables
      const r1 = await request(app)
        .post('/api/v1/goods-receipts')
        .set({ ...headersFor(pharmacistToken), 'Idempotency-Key': 'grn-idem-fixed-key-1' })
        .send(payload);
      expect(r1.status).toBe(201);

      const r2 = await request(app)
        .post('/api/v1/goods-receipts')
        .set({ ...headersFor(pharmacistToken), 'Idempotency-Key': 'grn-idem-fixed-key-1' })
        .send(payload);
      expect(r2.status).toBe(200);
      expect(r2.body.data.idempotentReplay).toBe(true);
      expect(getAllTestBatchesForTenant(tenantId).length).toBe(1);

      // Reusing same key with different payload throws 409
      const conflictRes = await request(app)
        .post('/api/v1/goods-receipts')
        .set({ ...headersFor(pharmacistToken), 'Idempotency-Key': 'grn-idem-fixed-key-1' })
        .send({ ...payload, supplierInvoiceNumber: 'DIFFERENT-INV' });
      expect(conflictRes.status).toBe(409);

      // Remaining pending quantity on PO is 2. Fire 2 concurrent GRNs requesting 2 units each -> only 1 succeeds!
      const concPayload = (batch: string) => ({
        poId: po.id,
        supplierInvoiceNumber: `INV-${batch}`,
        items: [
          {
            poItemId: po.items[0].id,
            medicineId: 'med-dolo',
            batchNumber: batch,
            expiryDate: futureDate(300),
            acceptedQuantity: 2,
            purchasePrice: 20,
            mrp: 35,
          },
        ],
      });

      const [c1, c2] = await Promise.all([
        request(app)
          .post('/api/v1/goods-receipts')
          .set({ ...headersFor(pharmacistToken), 'Idempotency-Key': 'grn-conc-race-001' })
          .send(concPayload('B-RACE-1')),
        request(app)
          .post('/api/v1/goods-receipts')
          .set({ ...headersFor(pharmacistToken), 'Idempotency-Key': 'grn-conc-race-002' })
          .send(concPayload('B-RACE-2')),
      ]);

      const raceCodes = [c1.status, c2.status].sort((a, b) => a - b);
      expect(raceCodes).toEqual([201, 400]);
    });

    it('reverses an unconsumed GRN cleanly and blocks reversal after partial stock sale', async () => {
      const sup = (await createIntraStateSupplier()).body.data.supplier;
      const po = (
        await request(app)
          .post('/api/v1/purchase-orders')
          .set(headersFor(pharmacistToken))
          .send({
            supplierId: sup.id,
            submitImmediately: true,
            items: [{ medicineId: 'med-dolo', orderedQuantity: 10, unitCost: 20, gstRate: 12 }],
          })
      ).body.data.purchaseOrder;
      await request(app).post(`/api/v1/purchase-orders/${po.id}/approve`).set(headersFor(ownerToken));

      const grnRes = await request(app)
        .post('/api/v1/goods-receipts')
        .set({ ...headersFor(ownerToken), 'Idempotency-Key': 'grn-to-reverse-001' })
        .send({
          poId: po.id,
          supplierInvoiceNumber: 'REV-BILL-1',
          autoCreateSupplierInvoice: true,
          items: [
            {
              poItemId: po.items[0].id,
              medicineId: 'med-dolo',
              batchNumber: 'B-REV-1',
              expiryDate: futureDate(300),
              acceptedQuantity: 10,
              purchasePrice: 20,
              mrp: 35,
            },
          ],
        });
      expect(grnRes.status).toBe(201);
      const grnId = grnRes.body.data.grn.id;
      const batchId = grnRes.body.data.batches[0].id;

      // Before reversal, supplier balance is 224 (200 + 12% GST)
      expect(getTestSupplierDirect(tenantId, sup.id)?.currentOutstandingBalance).toBe(224);

      // Reverse GRN cleanly
      const revRes = await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/reverse`)
        .set(headersFor(ownerToken))
        .send({ reason: 'Wrong batch entry posted by mistake' });
      expect(revRes.status).toBe(200);
      expect(revRes.body.data.grn.status).toBe('REVERSED');
      expect(getTestSupplierDirect(tenantId, sup.id)?.currentOutstandingBalance).toBe(0);

      // Batch stock zeroed & PO rolled back to APPROVED
      const poAfter = await request(app)
        .get(`/api/v1/purchase-orders/${po.id}`)
        .set(headersFor(ownerToken));
      expect(poAfter.body.data.purchaseOrder.status).toBe('APPROVED');
      expect(poAfter.body.data.purchaseOrder.totalPendingQty).toBe(10);

      // Create second GRN and simulate partial consumption -> reversal must fail cleanly!
      const grn2Res = await request(app)
        .post('/api/v1/goods-receipts')
        .set({ ...headersFor(ownerToken), 'Idempotency-Key': 'grn-to-sell-then-rev-002' })
        .send({
          poId: po.id,
          supplierInvoiceNumber: 'REV-BILL-2',
          items: [
            {
              poItemId: po.items[0].id,
              medicineId: 'med-dolo',
              batchNumber: 'B-SOLD-1',
              expiryDate: futureDate(300),
              acceptedQuantity: 10,
              purchasePrice: 20,
              mrp: 35,
            },
          ],
        });
      const grn2Batch = grn2Res.body.data.batches[0];
      setTestBatch(tenantId, { ...grn2Batch, currentStock: 7 }); // simulate 3 sold

      const blockedRev = await request(app)
        .post(`/api/v1/goods-receipts/${grn2Res.body.data.grn.id}/reverse`)
        .set(headersFor(ownerToken))
        .send({ reason: 'Trying to reverse consumed batch' });
      expect(blockedRev.status).toBe(409);
      expect(batchId).toBeTruthy();
    });
  });

  describe('4. Single-Liability Invoicing, FIFO Payments, Supplier Returns, Statements & Reports', () => {
    it('enforces single-liability (no double payable), executes FIFO + advance payments, processes supplier return, and exports CSV/PDF', async () => {
      const sup = (await createIntraStateSupplier()).body.data.supplier;

      // Direct GRN #1 (autoCreateSupplierInvoice: false -> payable stays 0 until invoice recognized)
      const grn1 = (
        await request(app)
          .post('/api/v1/goods-receipts')
          .set({ ...headersFor(ownerToken), 'Idempotency-Key': 'grn-direct-001' })
          .send({
            supplierId: sup.id,
            autoCreateSupplierInvoice: false,
            items: [
              {
                medicineId: 'med-dolo',
                batchNumber: 'BATCH-L1',
                expiryDate: futureDate(400),
                acceptedQuantity: 10,
                purchasePrice: 100,
                mrp: 150,
                gstRate: 12,
              },
            ],
          })
      ).body.data.grn;
      expect(getTestSupplierDirect(tenantId, sup.id)?.currentOutstandingBalance).toBe(0);

      // Recognize Supplier Invoice for GRN #1 -> Total 1120
      const inv1Res = await request(app)
        .post('/api/v1/supplier-invoices')
        .set(headersFor(ownerToken))
        .send({
          supplierId: sup.id,
          grnId: grn1.id,
          supplierInvoiceNumber: 'DIST-2026-001',
          invoiceDate: pastDate(40),
          dueDate: pastDate(10), // overdue!
        });
      expect(inv1Res.status).toBe(201);
      const inv1 = inv1Res.body.data.invoice;
      expect(inv1.totalAmount).toBe(1120);
      expect(inv1.paymentStatus).toBe('OVERDUE');
      expect(getTestSupplierDirect(tenantId, sup.id)?.currentOutstandingBalance).toBe(1120);

      // Attempting second invoice for same GRN #1 must fail with 409 (single-liability protection!)
      const dupGrnInv = await request(app)
        .post('/api/v1/supplier-invoices')
        .set(headersFor(ownerToken))
        .send({
          supplierId: sup.id,
          grnId: grn1.id,
          supplierInvoiceNumber: 'DIST-2026-001-DUP',
        });
      expect(dupGrnInv.status).toBe(409);

      // Direct GRN #2 with autoCreateSupplierInvoice: true -> Total 560 -> Payable becomes 1120 + 560 = 1680
      const grn2Res = await request(app)
        .post('/api/v1/goods-receipts')
        .set({ ...headersFor(ownerToken), 'Idempotency-Key': 'grn-direct-002' })
        .send({
          supplierId: sup.id,
          supplierInvoiceNumber: 'DIST-2026-002',
          autoCreateSupplierInvoice: true,
          items: [
            {
              medicineId: 'med-dolo',
              batchNumber: 'BATCH-L2',
              expiryDate: futureDate(50), // near-expiry warning
              acceptedQuantity: 5,
              purchasePrice: 100,
              mrp: 150,
              gstRate: 12,
            },
          ],
        });
      expect(grn2Res.status).toBe(201);
      const grn2BatchId = grn2Res.body.data.batches[0].id;
      expect(getTestSupplierDirect(tenantId, sup.id)?.currentOutstandingBalance).toBe(1680);

      // Supplier Return on GRN #2 for 2 damaged strips (2 * 100 + 12% GST = 224 credit note)
      const retRes = await request(app)
        .post('/api/v1/supplier-returns')
        .set({ ...headersFor(ownerToken), 'Idempotency-Key': 'sup-ret-001' })
        .send({
          grnId: grn2Res.body.data.grn.id,
          reason: 'Transit breakage observed on inspection',
          items: [{ batchId: grn2BatchId, quantity: 2 }],
        });
      expect(retRes.status).toBe(201);
      expect(retRes.body.data.supplierReturn.totalAmount).toBe(224);
      expect(retRes.body.data.supplierReturn.payableReduced).toBe(224);
      // Balance reduced 1680 -> 1456
      expect(getTestSupplierDirect(tenantId, sup.id)?.currentOutstandingBalance).toBe(1456);

      // Pay Rs 1,200 via NEFT (FIFO settles Inv1=1120 completely and allocates 80 to Inv2)
      const payRes = await request(app)
        .post('/api/v1/supplier-payments')
        .set({ ...headersFor(ownerToken), 'Idempotency-Key': 'sup-pay-001' })
        .send({
          supplierId: sup.id,
          paymentMode: 'NEFT_RTGS',
          amount: 1200,
          referenceNumber: 'UTR99887766',
        });
      expect(payRes.status).toBe(201);
      expect(payRes.body.data.supplier.currentOutstandingBalance).toBe(256); // 1456 - 1200

      // Overpayment without allowAdvance rejected cleanly (400)
      const overPayReject = await request(app)
        .post('/api/v1/supplier-payments')
        .set({ ...headersFor(ownerToken), 'Idempotency-Key': 'sup-pay-over-reject' })
        .send({
          supplierId: sup.id,
          paymentMode: 'UPI',
          amount: 500,
        });
      expect(overPayReject.status).toBe(400);

      // Overpayment with allowAdvance: true clears 256 and records 244 advanceBalance
      const advPay = await request(app)
        .post('/api/v1/supplier-payments')
        .set({ ...headersFor(ownerToken), 'Idempotency-Key': 'sup-pay-adv-002' })
        .send({
          supplierId: sup.id,
          paymentMode: 'UPI',
          amount: 500,
          allowAdvance: true,
        });
      expect(advPay.status).toBe(201);
      expect(advPay.body.data.supplier.currentOutstandingBalance).toBe(0);
      expect(advPay.body.data.supplier.advanceBalance).toBe(244);

      // Statement JSON + CSV + PDF exports
      const stmtJson = await request(app)
        .get(`/api/v1/suppliers/${sup.id}/statement`)
        .set(headersFor(auditorToken));
      expect(stmtJson.status).toBe(200);
      expect(stmtJson.body.data.closingBalance).toBe(0);
      expect(stmtJson.body.data.entries.length).toBeGreaterThanOrEqual(5);

      const csvRes = await request(app)
        .get(`/api/v1/suppliers/${sup.id}/statement/export?format=csv`)
        .set(headersFor(auditorToken));
      expect(csvRes.status).toBe(200);
      expect(csvRes.headers['content-type']).toContain('text/csv');
      expect(csvRes.text).toContain('DIST-2026-001');

      const pdfRes = await request(app)
        .get(`/api/v1/suppliers/${sup.id}/statement/export?format=pdf`)
        .set(headersFor(auditorToken))
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers['content-type']).toContain('application/pdf');
      expect((pdfRes.body as Buffer).subarray(0, 8).toString('utf8')).toContain('%PDF-1.4');

      // Procurement Reports
      const repRes = await request(app)
        .get('/api/v1/procurement/reports')
        .set(headersFor(auditorToken));
      expect(repRes.status).toBe(200);
      expect(repRes.body.data.summary.grnCountInRange).toBe(2);
      expect(repRes.body.data.nearExpiryReceived.length).toBeGreaterThanOrEqual(1);
      expect(repRes.body.data.supplierReturns.length).toBe(1);
    });
  });
});

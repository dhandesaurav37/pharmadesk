import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { Express } from 'express';
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
  setTestBatch,
  InventoryService,
} from '../src/services/inventoryService';
import {
  clearTestBilling,
  getTestInvoice,
  roundPaise,
} from '../src/services/billingTransactionService';

describe('Phase 6: POS Billing & Idempotent Transaction Engine', () => {
  let app: Express;
  const tenantId = 'pharma-metro-mumbai';
  const branchId = 'main-counter';
  const otherBranchId = 'night-counter';

  const ownerToken = 'Bearer test-mock-token:owner-1:owner@metropharma.test';
  const pharmacistToken = 'Bearer test-mock-token:pharm-1:sunita@metropharma.test';
  const cashierToken = 'Bearer test-mock-token:cashier-1:rohan@metropharma.test';
  const helperToken = 'Bearer test-mock-token:helper-1:mahesh@metropharma.test';
  const deactivatedToken = 'Bearer test-mock-token:deactivated-1:former@metropharma.test';

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    clearTestMemberships();
    clearTestMedicines();
    clearTestInventory();
    clearTestBilling();

    setTestMembership(tenantId, 'owner-1', {
      tenantId,
      userId: 'owner-1',
      name: 'Rajesh Mehta',
      email: 'owner@metropharma.test',
      role: 'owner',
      status: 'active',
      assignedBranchIds: [branchId, otherBranchId, '*'],
      permissions: ['*'],
    });

    setTestMembership(tenantId, 'pharm-1', {
      tenantId,
      userId: 'pharm-1',
      name: 'Sunita Patil',
      email: 'sunita@metropharma.test',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: [branchId],
    });

    setTestMembership(tenantId, 'cashier-1', {
      tenantId,
      userId: 'cashier-1',
      name: 'Rohan Deshmukh',
      email: 'rohan@metropharma.test',
      role: 'cashier',
      status: 'active',
      assignedBranchIds: [branchId],
    });

    setTestMembership(tenantId, 'helper-1', {
      tenantId,
      userId: 'helper-1',
      name: 'Mahesh Kadam',
      email: 'mahesh@metropharma.test',
      role: 'helper',
      status: 'active',
      assignedBranchIds: [branchId],
    });

    setTestMembership(tenantId, 'deactivated-1', {
      tenantId,
      userId: 'deactivated-1',
      name: 'Former Clerk',
      email: 'former@metropharma.test',
      role: 'cashier',
      status: 'deactivated',
      assignedBranchIds: [branchId],
    });

    // Seed Medicine Master: Dolo 650 (12% GST, non-prescription)
    setTestMedicine(tenantId, {
      id: 'med-dolo-650',
      tenantId,
      name: 'Dolo 650 Tablet',
      genericName: 'Paracetamol 650mg',
      brand: 'Micro Labs',
      category: 'Tablet',
      dosageForm: 'tablet',
      strength: '650mg',
      packSize: '15 Tablets',
      uom: 'strip',
      hsnCode: '300490',
      gstRate: 12,
      barcode: '890123456001',
      prescriptionRequired: false,
      minStockThreshold: 20,
      status: 'active',
      createdBy: 'owner-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // Seed Schedule H1 Medicine: Augmentin 625 Duo (12% GST, prescription required)
    setTestMedicine(tenantId, {
      id: 'med-augmentin-625',
      tenantId,
      name: 'Augmentin 625 Duo',
      genericName: 'Amoxicillin 500mg + Clavulanic Acid 125mg',
      brand: 'GSK',
      category: 'Tablet',
      dosageForm: 'tablet',
      strength: '625mg',
      packSize: '10 Tablets',
      uom: 'strip',
      hsnCode: '300410',
      gstRate: 12,
      barcode: '890123456002',
      prescriptionRequired: true,
      minStockThreshold: 10,
      status: 'active',
      createdBy: 'owner-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // Seed Batches for FEFO testing:
    // 1) Expired batch (should always be excluded)
    setTestBatch(tenantId, {
      id: 'batch-dolo-expired',
      tenantId,
      branchId,
      medicineId: 'med-dolo-650',
      medicineName: 'Dolo 650 Tablet',
      genericName: 'Paracetamol 650mg',
      batchNumber: 'DL-EXP-01',
      expiryDate: '2024-01-31',
      purchasePrice: 20,
      mrp: 30,
      sellingPrice: 30,
      quantityReceived: 50,
      currentStock: 50,
      freeQuantity: 0,
      status: 'expired',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

    // 2) Earlier active batch (2027-06) - qty 4
    setTestBatch(tenantId, {
      id: 'batch-dolo-early',
      tenantId,
      branchId,
      medicineId: 'med-dolo-650',
      medicineName: 'Dolo 650 Tablet',
      genericName: 'Paracetamol 650mg',
      batchNumber: 'DL-EARLY',
      expiryDate: '2027-06-30',
      purchasePrice: 22,
      mrp: 33.6,
      sellingPrice: 30,
      quantityReceived: 4,
      currentStock: 4,
      freeQuantity: 0,
      status: 'low_stock',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // 3) Later active batch (2028-12) - qty 10
    setTestBatch(tenantId, {
      id: 'batch-dolo-late',
      tenantId,
      branchId,
      medicineId: 'med-dolo-650',
      medicineName: 'Dolo 650 Tablet',
      genericName: 'Paracetamol 650mg',
      batchNumber: 'DL-LATE',
      expiryDate: '2028-12-31',
      purchasePrice: 22,
      mrp: 33.6,
      sellingPrice: 30,
      quantityReceived: 10,
      currentStock: 10,
      freeQuantity: 0,
      status: 'normal',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

    // 4) Augmentin batch
    setTestBatch(tenantId, {
      id: 'batch-aug-01',
      tenantId,
      branchId,
      medicineId: 'med-augmentin-625',
      medicineName: 'Augmentin 625 Duo',
      genericName: 'Amoxicillin 500mg + Clavulanic Acid 125mg',
      batchNumber: 'AUG-2027',
      expiryDate: '2027-09-30',
      purchasePrice: 150,
      mrp: 224,
      sellingPrice: 224,
      quantityReceived: 20,
      currentStock: 20,
      freeQuantity: 0,
      status: 'normal',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  describe('1. FEFO Batch Allocation & Negative Stock Prevention', () => {
    it('excludes expired batches and allocates earliest-expiry batch first across split quantities', async () => {
      // Request 6 strips when batch-dolo-early has 4 and batch-dolo-late has 10 (expired batch has 50 and must be ignored)
      const res = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'fefo-split-order-001')
        .send({
          customer: { name: 'Ramesh Kulkarni', phone: '9876543210' },
          items: [{ medicineId: 'med-dolo-650', quantity: 6 }],
          paymentMode: 'cash',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.invoiceNumber).toMatch(/^INV-MAIN-\d{4}-\d{6}$/);

      // Check stored invoice items used batch-dolo-early (4) then batch-dolo-late (2)
      const invoice = getTestInvoice(tenantId, data.invoiceId)!;
      expect(invoice.items).toHaveLength(2);
      expect(invoice.items[0]!.batchId).toBe('batch-dolo-early');
      expect(invoice.items[0]!.quantity).toBe(4);
      expect(invoice.items[1]!.batchId).toBe('batch-dolo-late');
      expect(invoice.items[1]!.quantity).toBe(2);

      // Verify remaining batch balances and expired batch untouched
      const earlyBatch = await InventoryService.getBatch(tenantId, 'batch-dolo-early');
      const lateBatch = await InventoryService.getBatch(tenantId, 'batch-dolo-late');
      const expiredBatch = await InventoryService.getBatch(tenantId, 'batch-dolo-expired');

      expect(earlyBatch.currentStock).toBe(0);
      expect(lateBatch.currentStock).toBe(8);
      expect(expiredBatch.currentStock).toBe(50);
    });

    it('strictly rejects explicitly selecting an expired batch', async () => {
      const res = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'expired-batch-attempt-001')
        .send({
          customer: { name: 'Suresh Nair' },
          items: [
            {
              medicineId: 'med-dolo-650',
              batchId: 'batch-dolo-expired',
              quantity: 1,
            },
          ],
          paymentMode: 'cash',
        });

      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('expired');
    });

    it('rejects checkout with 409 Conflict when requested quantity exceeds non-expired stock', async () => {
      // Total sellable non-expired stock for med-dolo-650 is 4 + 10 = 14
      const res = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'overstock-attempt-001')
        .send({
          customer: { name: 'Anita Joshi' },
          items: [{ medicineId: 'med-dolo-650', quantity: 20 }],
          paymentMode: 'cash',
        });

      expect(res.status).toBe(422);
      expect(res.body.detail).toContain('Insufficient non-expired stock');
    });
  });

  describe('2. Decimal-Safe GST Arithmetic & Discounts', () => {
    it('computes intra-state CGST + SGST (50/50 split) after line discount with paise rounding', async () => {
      // Augmentin: sellingPrice = 224, qty = 2 -> gross 448, 10% discount = 44.80, payable = 403.20
      // Taxable at 12% inclusive = 403.20 / 1.12 = 360.00, Tax = 43.20 -> CGST 21.60 + SGST 21.60
      const res = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', pharmacistToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'gst-intrastate-001')
        .send({
          customer: {
            name: 'Vikram Rao',
            doctorName: 'Dr. A. Deshpande',
            doctorRegNumber: 'MMC-2019-44812',
          },
          items: [
            {
              medicineId: 'med-augmentin-625',
              batchId: 'batch-aug-01',
              quantity: 2,
              discountPercent: 10,
            },
          ],
          isInterState: false,
          paymentMode: 'upi',
        });

      expect(res.status).toBe(201);
      const data = res.body.data;
      expect(data.taxableAmount).toBe(360);
      expect(data.cgst).toBe(21.6);
      expect(data.sgst).toBe(21.6);
      expect(data.igst).toBe(0);
      expect(data.grandTotal).toBe(403); // 403.20 rounded to nearest rupee (-0.20 roundOff)
      expect(data.roundOff).toBe(roundPaise(-0.2));
    });

    it('computes inter-state 100% IGST when isInterState is true', async () => {
      const res = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', pharmacistToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'gst-interstate-001')
        .send({
          customer: { name: 'Interstate Clinic' },
          items: [
            {
              medicineId: 'med-augmentin-625',
              batchId: 'batch-aug-01',
              quantity: 1,
            },
          ],
          isInterState: true,
          paymentMode: 'bank_transfer',
        });

      expect(res.status).toBe(201);
      const data = res.body.data;
      // 224 / 1.12 = 200 taxable, 24 IGST
      expect(data.taxableAmount).toBe(200);
      expect(data.cgst).toBe(0);
      expect(data.sgst).toBe(0);
      expect(data.igst).toBe(24);
      expect(data.grandTotal).toBe(224);
    });
  });

  describe('3. Idempotent Transaction Engine', () => {
    it('replays cached invoice with X-Cache: HIT on identical retry without deducting stock twice', async () => {
      const payload = {
        customer: { name: 'Meera Shah', phone: '9988776655' },
        items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 3 }],
        paymentMode: 'cash',
      };

      const first = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'idemp-replay-test-001')
        .send(payload);

      expect(first.status).toBe(201);
      expect(first.body.data.fromCache).toBeUndefined();

      const retry = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'idemp-replay-test-001')
        .send(payload);

      expect(retry.status).toBe(200);
      expect(retry.headers['x-cache']).toBe('HIT');
      expect(retry.body.data.fromCache).toBe(true);
      expect(retry.body.data.invoiceId).toBe(first.body.data.invoiceId);
      expect(retry.body.data.invoiceNumber).toBe(first.body.data.invoiceNumber);

      // Stock deducted only once (10 - 3 = 7)
      const batch = await InventoryService.getBatch(tenantId, 'batch-dolo-late');
      expect(batch.currentStock).toBe(7);
    });

    it('rejects reusing same idempotency key with altered payload (422 Idempotency Conflict)', async () => {
      const key = 'idemp-conflict-test-001';

      const first = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', key)
        .send({
          customer: { name: 'Karan Verma' },
          items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 1 }],
          paymentMode: 'cash',
        });

      expect(first.status).toBe(201);

      const altered = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', key)
        .send({
          customer: { name: 'Karan Verma' },
          items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 5 }],
          paymentMode: 'cash',
        });

      expect(altered.status).toBe(409);
      expect(altered.body.detail).toContain('different request payload');
    });
  });

  describe('4. Split Payments & Subsequent Balance Settlement', () => {
    it('supports partial split payment at checkout followed by balance collection', async () => {
      // 2 x Augmentin = 448 grandTotal
      const checkout = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'split-pay-order-001')
        .send({
          customer: { name: 'Deepak Malhotra' },
          items: [{ medicineId: 'med-augmentin-625', batchId: 'batch-aug-01', quantity: 2 }],
          payments: [
            { mode: 'cash', amount: 200 },
            { mode: 'upi', amount: 100, referenceNumber: 'UPI-991122' },
          ],
        });

      expect(checkout.status).toBe(201);
      const { invoiceId, grandTotal, amountPaid, balanceDue, paymentStatus } = checkout.body.data;
      expect(grandTotal).toBe(448);
      expect(amountPaid).toBe(300);
      expect(balanceDue).toBe(148);
      expect(paymentStatus).toBe('partial');

      // Record remaining 148 via card with idempotency key
      const settle = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/payments`)
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'settle-pay-order-001')
        .send({ mode: 'card', amount: 148, referenceNumber: 'CARD-4455' });

      expect(settle.status).toBe(200);
      expect(settle.body.data.amountPaid).toBe(448);
      expect(settle.body.data.balanceDue).toBe(0);
      expect(settle.body.data.paymentStatus).toBe('paid');
      expect(settle.body.data.payments).toHaveLength(3);
    });
  });

  describe('5. Sales Returns & Invoice Cancellation', () => {
    it('processes partial sales return, restocks units, and rejects excessive return quantities', async () => {
      const checkout = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', pharmacistToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'return-test-order-001')
        .send({
          customer: { name: 'Priya Iyer' },
          items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 4 }],
          paymentMode: 'cash',
        });

      expect(checkout.status).toBe(201);
      const invoiceId = checkout.body.data.invoiceId;

      // Batch stock is now 10 - 4 = 6
      let batch = await InventoryService.getBatch(tenantId, 'batch-dolo-late');
      expect(batch.currentStock).toBe(6);

      // Attempt returning 5 units when only 4 were sold
      const excessReturn = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/returns`)
        .set('Authorization', pharmacistToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'excess-ret-key-001')
        .send({
          items: [{ batchId: 'batch-dolo-late', quantity: 5, restock: true }],
          reason: 'Over-return validation test',
        });

      expect(excessReturn.status).toBe(400);
      expect(excessReturn.body.detail).toContain('Cannot return 5');

      // Valid partial return of 2 units
      const validReturn = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/returns`)
        .set('Authorization', pharmacistToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'valid-ret-key-001')
        .send({
          items: [{ batchId: 'batch-dolo-late', quantity: 2, restock: true }],
          reason: 'Patient doctor changed dosage',
        });

      expect(validReturn.status).toBe(200);
      expect(validReturn.body.data.updatedInvoice.status).toBe('partially_returned');
      expect(validReturn.body.data.returnRecord.totalRefundAmount).toBe(60); // 2 * 30

      // Stock restored from 6 -> 8
      batch = await InventoryService.getBatch(tenantId, 'batch-dolo-late');
      expect(batch.currentStock).toBe(8);
    });

    it('allows Owner to cancel an issued invoice, restores stock, and prevents double cancellation', async () => {
      const checkout = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', ownerToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'cancel-test-order-001')
        .send({
          customer: { name: 'Nikhil Kapoor' },
          items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 5 }],
          paymentMode: 'cash',
        });

      expect(checkout.status).toBe(201);
      const invoiceId = checkout.body.data.invoiceId;

      let batch = await InventoryService.getBatch(tenantId, 'batch-dolo-late');
      expect(batch.currentStock).toBe(5);

      const cancelRes = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/cancel`)
        .set('Authorization', ownerToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .send({ reason: 'Wrong customer profile selected at counter' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');
      expect(cancelRes.body.data.refundStatus).toBe('refund_pending');
      expect(cancelRes.body.data.refundAmount).toBe(150);

      batch = await InventoryService.getBatch(tenantId, 'batch-dolo-late');
      expect(batch.currentStock).toBe(10);

      // Re-cancelling must fail
      const secondCancel = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/cancel`)
        .set('Authorization', ownerToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .send({ reason: 'Duplicate cancel attempt' });

      expect(secondCancel.status).toBe(400);
    });
  });

  describe('6. Authorization, Role Restrictions & Printable Snapshot', () => {
    it('blocks Helper from creating POS invoices and blocks Cashier from cancelling invoices', async () => {
      const helperRes = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', helperToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'helper-blocked-001')
        .send({
          customer: { name: 'Walk-in' },
          items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 1 }],
          paymentMode: 'cash',
        });

      expect(helperRes.status).toBe(403);

      // Create valid invoice as cashier
      const checkout = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'cashier-cancel-test-001')
        .send({
          customer: { name: 'Walk-in' },
          items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 1 }],
          paymentMode: 'cash',
        });

      expect(checkout.status).toBe(201);

      // Cashier must be forbidden from cancelling
      const cashierCancel = await request(app)
        .post(`/api/v1/invoices/${checkout.body.data.invoiceId}/cancel`)
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .send({ reason: 'Cashier unauthorized void' });

      expect(cashierCancel.status).toBe(403);
    });

    it('immediately blocks deactivated employee from POS endpoints', async () => {
      const res = await request(app)
        .get('/api/v1/pos/medicines')
        .set('Authorization', deactivatedToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId);

      expect(res.status).toBe(403);
      expect(res.body.detail).toContain('deactivated');
    });

    it('returns full printable snapshot with GST summary and statutory labels', async () => {
      const checkout = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', pharmacistToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'print-snapshot-test-001')
        .send({
          customer: { name: 'Gaurav Bansal', doctorName: 'Dr. Mehta', doctorRegNumber: 'MMC-7721' },
          items: [{ medicineId: 'med-augmentin-625', batchId: 'batch-aug-01', quantity: 1 }],
          paymentMode: 'upi',
        });

      const printRes = await request(app)
        .get(`/api/v1/invoices/${checkout.body.data.invoiceId}/print`)
        .set('Authorization', pharmacistToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId);

      expect(printRes.status).toBe(200);
      expect(printRes.body.data).toHaveProperty('invoice');
      expect(printRes.body.data).toHaveProperty('taxSummary');
      expect(printRes.body.data).toHaveProperty('printTimestamp');
      expect(printRes.body.data.taxSummary['12']).toMatchObject({
        taxable: 200,
        cgst: 12,
        sgst: 12,
        igst: 0,
      });
    });
  });

  describe('7. Phase 6 Corrective Integrity: Concurrency, Scope, Quarantine & Reversals', () => {
    it('prevents oversell and preserves gap-free sequential numbers on concurrent checkouts', async () => {
      // batch-dolo-late has 10 units; fire two concurrent checkouts each requesting 6 units
      const [r1, r2] = await Promise.all([
        request(app)
          .post('/api/v1/pos/checkout')
          .set('Authorization', ownerToken)
          .set('X-Tenant-ID', tenantId)
          .set('X-Branch-ID', branchId)
          .set('X-Idempotency-Key', 'concurrent-race-order-001')
          .send({
            customer: { name: 'Customer One' },
            items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 6 }],
            paymentMode: 'cash',
          }),
        request(app)
          .post('/api/v1/pos/checkout')
          .set('Authorization', ownerToken)
          .set('X-Tenant-ID', tenantId)
          .set('X-Branch-ID', branchId)
          .set('X-Idempotency-Key', 'concurrent-race-order-002')
          .send({
            customer: { name: 'Customer Two' },
            items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 6 }],
            paymentMode: 'cash',
          }),
      ]);

      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 422]);

      const batch = await InventoryService.getBatch(tenantId, 'batch-dolo-late');
      expect(batch.currentStock).toBe(4);

      // Next valid checkout gets sequence number +1 after the single winner (no burnt sequence numbers)
      const r3 = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', ownerToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'concurrent-race-order-003')
        .send({
          customer: { name: 'Customer Three' },
          items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 4 }],
          paymentMode: 'cash',
        });

      expect(r3.status).toBe(201);
      const winner = r1.status === 201 ? r1 : r2;
      const winSeq = Number(winner.body.data.invoiceNumber.split('-').pop());
      const nextSeq = Number(r3.body.data.invoiceNumber.split('-').pop());
      expect(nextSeq).toBe(winSeq + 1);
      expect((await InventoryService.getBatch(tenantId, 'batch-dolo-late')).currentStock).toBe(0);
    });

    it('isolates idempotency keys per branch and rejects altered payment/notes payloads', async () => {
      setTestBatch(tenantId, {
        id: 'batch-other-branch',
        tenantId,
        branchId: otherBranchId,
        medicineId: 'med-dolo-650',
        medicineName: 'Dolo 650 Tablet',
        batchNumber: 'DL-NIGHT-01',
        expiryDate: '2028-12-31',
        purchasePrice: 22,
        mrp: 30,
        sellingPrice: 30,
        quantityReceived: 10,
        currentStock: 10,
        freeQuantity: 0,
        status: 'normal',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      const sharedKey = 'shared-branch-idemp-key-001';
      const mainRes = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', ownerToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', sharedKey)
        .send({
          customer: { name: 'Walk-in' },
          items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 1 }],
          paymentMode: 'cash',
          notes: 'Day shift',
        });
      expect(mainRes.status).toBe(201);

      // Same idempotency key in a different branch creates its own branch-scoped invoice
      const nightRes = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', ownerToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', otherBranchId)
        .set('X-Idempotency-Key', sharedKey)
        .send({
          customer: { name: 'Walk-in' },
          items: [{ medicineId: 'med-dolo-650', batchId: 'batch-other-branch', quantity: 1 }],
          paymentMode: 'cash',
          notes: 'Night shift',
        });
      expect(nightRes.status).toBe(201);
      expect(nightRes.body.data.invoiceId).not.toBe(mainRes.body.data.invoiceId);

      // Reusing key on main branch with altered paymentMode triggers 409 Conflict
      const conflictRes = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', ownerToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', sharedKey)
        .send({
          customer: { name: 'Walk-in' },
          items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 1 }],
          paymentMode: 'upi',
          notes: 'Day shift',
        });
      expect(conflictRes.status).toBe(409);
    });

    it('rejects payment overpayment, deduplicates retried payments, and rejects cross-branch payments', async () => {
      // 2 x Augmentin = 448; pay 200 upfront, balanceDue = 248
      const checkout = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'pay-integrity-order-001')
        .send({
          customer: { name: 'Arunabh Sen' },
          items: [{ medicineId: 'med-augmentin-625', batchId: 'batch-aug-01', quantity: 2 }],
          payments: [{ mode: 'cash', amount: 200 }],
        });
      const invoiceId = checkout.body.data.invoiceId;

      // Missing idempotency key rejected
      const noKeyPay = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/payments`)
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .send({ mode: 'upi', amount: 100 });
      expect(noKeyPay.status).toBe(400);

      // Overpayment rejected instead of silently clamped
      const overPay = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/payments`)
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'pay-over-limit-001')
        .send({ mode: 'upi', amount: 300 });
      expect(overPay.status).toBe(400);
      expect(overPay.body.detail).toContain('exceeds remaining balance due');

      // Valid payment + idempotent replay
      const payKey = 'pay-exact-replay-001';
      const pay1 = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/payments`)
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', payKey)
        .send({ mode: 'upi', amount: 248 });
      expect(pay1.status).toBe(200);
      expect(pay1.body.data.balanceDue).toBe(0);
      expect(pay1.body.data.payments).toHaveLength(2);

      const payReplay = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/payments`)
        .set('Authorization', cashierToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', payKey)
        .send({ mode: 'upi', amount: 248 });
      expect(payReplay.status).toBe(200);
      expect(payReplay.headers['x-cache']).toBe('HIT');
      expect(payReplay.body.data.payments).toHaveLength(2);

      // Cross-branch payment rejected even for owner
      const wrongBranchPay = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/payments`)
        .set('Authorization', ownerToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', otherBranchId)
        .set('X-Idempotency-Key', 'pay-wrong-branch-001')
        .send({ mode: 'cash', amount: 10 });
      expect(wrongBranchPay.status).toBe(400);
      expect(wrongBranchPay.body.detail).toContain('belongs to branch');
    });

    it('deduplicates repeated sales returns and quarantines expired or damaged returned goods', async () => {
      const checkout = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', pharmacistToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'return-quarantine-order-001')
        .send({
          customer: { name: 'Kavita Rao' },
          items: [
            { medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 4 },
            { medicineId: 'med-augmentin-625', batchId: 'batch-aug-01', quantity: 2 },
          ],
          paymentMode: 'cash',
        });
      const invoiceId = checkout.body.data.invoiceId;

      // Batch stocks right after sale: dolo-late = 6, aug-01 = 18
      expect((await InventoryService.getBatch(tenantId, 'batch-dolo-late')).currentStock).toBe(6);
      expect((await InventoryService.getBatch(tenantId, 'batch-aug-01')).currentStock).toBe(18);

      // Simulate batch-dolo-late expiring before return
      const lateBatch = await InventoryService.getBatch(tenantId, 'batch-dolo-late');
      setTestBatch(tenantId, { ...lateBatch, expiryDate: '2024-01-01', status: 'expired' });

      const retKey = 'quarantine-ret-key-001';
      const returnRes = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/returns`)
        .set('Authorization', pharmacistToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', retKey)
        .send({
          items: [
            { batchId: 'batch-dolo-late', quantity: 2, restock: true }, // expired -> MUST NOT restock
            { batchId: 'batch-aug-01', quantity: 1, restock: true, damaged: true }, // damaged -> MUST NOT restock
          ],
          reason: 'Expired and damaged strip return',
        });

      expect(returnRes.status).toBe(200);
      expect(returnRes.body.data.returnRecord.items[0].restocked).toBe(false);
      expect(returnRes.body.data.returnRecord.items[0].nonRestockReason).toBe('expired');
      expect(returnRes.body.data.returnRecord.items[1].restocked).toBe(false);
      expect(returnRes.body.data.returnRecord.items[1].nonRestockReason).toBe('damaged');

      // Stock MUST remain untouched (not restocked into sellable inventory)
      expect((await InventoryService.getBatch(tenantId, 'batch-dolo-late')).currentStock).toBe(6);
      expect((await InventoryService.getBatch(tenantId, 'batch-aug-01')).currentStock).toBe(18);

      // Duplicate return with same key replays cache and does NOT double-refund
      const replayRes = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/returns`)
        .set('Authorization', pharmacistToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', retKey)
        .send({
          items: [
            { batchId: 'batch-dolo-late', quantity: 2, restock: true },
            { batchId: 'batch-aug-01', quantity: 1, restock: true, damaged: true },
          ],
          reason: 'Expired and damaged strip return',
        });
      expect(replayRes.status).toBe(200);
      expect(replayRes.headers['x-cache']).toBe('HIT');
      expect(replayRes.body.data.updatedInvoice.returns).toHaveLength(1);
    });

    it('restores only unreturned units with INVOICE_CANCEL_REVERSAL movement when cancelling after partial return', async () => {
      const checkout = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', ownerToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'partial-ret-cancel-order-001')
        .send({
          customer: { name: 'Manoj Kulkarni' },
          items: [{ medicineId: 'med-dolo-650', batchId: 'batch-dolo-late', quantity: 5 }],
          paymentMode: 'cash',
        });
      const invoiceId = checkout.body.data.invoiceId;
      expect((await InventoryService.getBatch(tenantId, 'batch-dolo-late')).currentStock).toBe(5);

      // Return 2 units (stock 5 -> 7)
      await request(app)
        .post(`/api/v1/invoices/${invoiceId}/returns`)
        .set('Authorization', ownerToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'partial-ret-cancel-ret-001')
        .send({
          items: [{ batchId: 'batch-dolo-late', quantity: 2, restock: true }],
          reason: 'Returned 2 strips',
        });
      expect((await InventoryService.getBatch(tenantId, 'batch-dolo-late')).currentStock).toBe(7);

      // Cancel remainder of invoice -> restores only net 3 units (7 -> 10)
      const cancelRes = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/cancel`)
        .set('Authorization', ownerToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'cancel-replay-key-001')
        .send({ reason: 'Remainder cancelled by customer' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');
      expect(cancelRes.body.data.refundStatus).toBe('refund_pending');
      expect(cancelRes.body.data.refundAmount).toBe(90); // 150 paid - 60 refunded
      expect((await InventoryService.getBatch(tenantId, 'batch-dolo-late')).currentStock).toBe(10);

      // Verify dedicated INVOICE_CANCEL_REVERSAL movement logged
      const movements = await InventoryService.listMovements(tenantId, {
        branchId,
        batchId: 'batch-dolo-late',
        movementType: 'INVOICE_CANCEL_REVERSAL',
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.quantityChange).toBe(3);
      expect(movements[0]!.referenceType).toBe('invoice_cancellation');
      expect(movements[0]!.referenceId).toBe(invoiceId);

      // Idempotent cancel replay does not reverse stock twice
      const cancelReplay = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/cancel`)
        .set('Authorization', ownerToken)
        .set('X-Tenant-ID', tenantId)
        .set('X-Branch-ID', branchId)
        .set('X-Idempotency-Key', 'cancel-replay-key-001')
        .send({ reason: 'Remainder cancelled by customer' });
      expect(cancelReplay.status).toBe(200);
      expect((await InventoryService.getBatch(tenantId, 'batch-dolo-late')).currentStock).toBe(10);
    });
  });
});

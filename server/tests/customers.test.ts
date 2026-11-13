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
  setTestBatch,
} from '../src/services/inventoryService';
import {
  clearTestBilling,
  getAllTestInvoicesForTenant,
  setTestInvoice,
} from '../src/services/billingTransactionService';
import {
  clearTestCustomers,
  getTestCustomerDirect,
  getTestLedgerEntriesDirect,
} from '../src/services/customerService';

describe('Phase 7: Customer Directory, Khata Credit Ledger & POS Integration', () => {
  let app: Express;
  const tenantId = 'pharma-khata-mumbai';
  const otherTenantId = 'pharma-other-pune';
  const branchId = 'main-counter';

  const ownerToken = 'Bearer test-mock-token:owner-1:owner@pharma.test';
  const pharmacistToken = 'Bearer test-mock-token:pharm-1:sunita@pharma.test';
  const cashierToken = 'Bearer test-mock-token:cashier-1:rohan@pharma.test';
  const helperToken = 'Bearer test-mock-token:helper-1:mahesh@pharma.test';
  const auditorToken = 'Bearer test-mock-token:auditor-1:arvind@pharma.test';
  const otherOwnerToken = 'Bearer test-mock-token:other-owner:other@pharma.test';

  const headersFor = (token: string, tId = tenantId) => ({
    Authorization: token,
    'X-Tenant-ID': tId,
    'X-Branch-ID': branchId,
  });

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    clearTestMemberships();
    clearTestMedicines();
    clearTestInventory();
    clearTestBilling();
    clearTestCustomers();

    setTestMembership(tenantId, 'owner-1', {
      tenantId,
      userId: 'owner-1',
      name: 'Suresh Patel',
      email: 'owner@pharma.test',
      role: 'owner',
      status: 'active',
      assignedBranchIds: [branchId, '*'],
      permissions: ['*'],
    });

    setTestMembership(tenantId, 'pharm-1', {
      tenantId,
      userId: 'pharm-1',
      name: 'Sunita Patil',
      email: 'sunita@pharma.test',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: [branchId],
    });

    setTestMembership(tenantId, 'cashier-1', {
      tenantId,
      userId: 'cashier-1',
      name: 'Rohan Deshmukh',
      email: 'rohan@pharma.test',
      role: 'cashier',
      status: 'active',
      assignedBranchIds: [branchId],
    });

    setTestMembership(tenantId, 'helper-1', {
      tenantId,
      userId: 'helper-1',
      name: 'Mahesh Kadam',
      email: 'mahesh@pharma.test',
      role: 'helper',
      status: 'active',
      assignedBranchIds: [branchId],
    });

    setTestMembership(tenantId, 'auditor-1', {
      tenantId,
      userId: 'auditor-1',
      name: 'CA Arvind Kulkarni',
      email: 'arvind@pharma.test',
      role: 'auditor',
      status: 'active',
      assignedBranchIds: [branchId],
    });

    setTestMembership(otherTenantId, 'other-owner', {
      tenantId: otherTenantId,
      userId: 'other-owner',
      name: 'Other Owner',
      email: 'other@pharma.test',
      role: 'owner',
      status: 'active',
      assignedBranchIds: [branchId, '*'],
      permissions: ['*'],
    });

    // Seed Medicine & Inventory Batch for POS billing integration tests
    setTestMedicine(tenantId, {
      id: 'med-telma-40',
      tenantId,
      name: 'Telma 40 Tablet',
      genericName: 'Telmisartan 40mg',
      brand: 'Glenmark',
      category: 'Tablet',
      dosageForm: 'tablet',
      strength: '40mg',
      packSize: '15 Tablets',
      uom: 'strip',
      hsnCode: '300490',
      gstRate: 12,
      barcode: '890123457001',
      prescriptionRequired: false,
      minStockThreshold: 10,
      status: 'active',
      createdBy: 'owner-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    setTestBatch(tenantId, {
      id: 'batch-telma-01',
      tenantId,
      branchId,
      medicineId: 'med-telma-40',
      medicineName: 'Telma 40 Tablet',
      genericName: 'Telmisartan 40mg',
      batchNumber: 'TL-2026-01',
      expiryDate: '2028-06-30',
      purchasePrice: 120,
      mrp: 200,
      sellingPrice: 200,
      quantityReceived: 100,
      currentStock: 100,
      freeQuantity: 0,
      status: 'normal',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  async function createCustomerViaApi(
    overrides: Record<string, unknown> = {},
    token = ownerToken
  ) {
    const res = await request(app)
      .post('/api/v1/customers')
      .set(headersFor(token))
      .send({
        name: 'Rameshwar Gupta',
        phone: '+91 98200 12345',
        customerType: 'CHRONIC',
        preferredDoctorName: 'Dr. Rajesh Mehta',
        allergies: 'Penicillin',
        chronicConditions: 'Type 2 Diabetes',
        dateOfBirth: '1965-04-12',
        creditEnabled: true,
        creditLimit: 5000,
        creditTermsDays: 15,
        ...overrides,
      });
    return res;
  }

  // =========================================================================
  // 1. CUSTOMER CRUD, PHONE NORMALIZATION, DUPLICATES, ARCHIVAL & ISOLATION
  // =========================================================================
  describe('1. Customer Directory CRUD, Phone Normalization & Archival', () => {
    it('normalizes Indian mobile numbers and enforces duplicate phone guard unless confirmSharedPhone=true', async () => {
      const created = await createCustomerViaApi({ phone: '9820012345' });
      expect(created.status).toBe(201);
      expect(created.body.data.name).toBe('Rameshwar Gupta');

      // Duplicate formatted as +91 and 0-prefixed -> 409 Conflict
      const dup1 = await createCustomerViaApi({
        name: 'Duplicate One',
        phone: '+91 98200 12345',
      });
      expect(dup1.status).toBe(409);

      const dup2 = await createCustomerViaApi({
        name: 'Duplicate Two',
        phone: '09820012345',
      });
      expect(dup2.status).toBe(409);

      // Explicit shared family/clinic phone confirmation succeeds
      const familyRes = await createCustomerViaApi({
        name: 'Sunita Gupta (Spouse)',
        phone: '+91 98200 12345',
        confirmSharedPhone: true,
      });
      expect(familyRes.status).toBe(201);
      expect(familyRes.body.data.sharedPhoneConfirmed).toBe(true);
    });

    it('rejects direct balance/creditLimit tampering via PATCH /:customerId', async () => {
      const created = await createCustomerViaApi();
      const customerId = created.body.data.id;

      for (const field of ['currentOutstandingBalance', 'advanceBalance', 'creditLimit', 'totalPurchases']) {
        const res = await request(app)
          .patch(`/api/v1/customers/${customerId}`)
          .set(headersFor(ownerToken))
          .send({ [field]: 99999 });
        expect(res.status).toBe(400);
      }

      // Valid metadata update succeeds
      const patchOk = await request(app)
        .patch(`/api/v1/customers/${customerId}`)
        .set(headersFor(ownerToken))
        .send({ city: 'Mumbai', customerType: 'VIP' });
      expect(patchOk.status).toBe(200);
      expect(patchOk.body.data.city).toBe('Mumbai');
      expect(patchOk.body.data.customerType).toBe('VIP');
    });

    it('blocks archival when outstanding or advance balance is non-zero, and archives cleanly when settled', async () => {
      const created = await createCustomerViaApi({ openingBalance: 350 });
      const customerId = created.body.data.id;

      const blockedArchive = await request(app)
        .post(`/api/v1/customers/${customerId}/archive`)
        .set(headersFor(ownerToken))
        .send({ reason: 'Test archive with due' });
      expect(blockedArchive.status).toBe(400);

      // Settle the ₹350 due
      const payRes = await request(app)
        .post(`/api/v1/customers/${customerId}/payments`)
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'pay_settle_before_archive_1')
        .send({ amount: 350, paymentMode: 'cash' });
      expect(payRes.status).toBe(201);

      // Archive succeeds at zero balance & preserves historical ledger
      const okArchive = await request(app)
        .post(`/api/v1/customers/${customerId}/archive`)
        .set(headersFor(ownerToken))
        .send({ reason: 'Moved city' });
      expect(okArchive.status).toBe(200);
      expect(okArchive.body.data.isArchived).toBe(true);

      const ledgerAfter = await request(app)
        .get(`/api/v1/customers/${customerId}/ledger`)
        .set(headersFor(ownerToken));
      expect(ledgerAfter.status).toBe(200);
      expect(ledgerAfter.body.data.length).toBe(2);
    });

    it('enforces strict multi-tenant isolation across tenants', async () => {
      const created = await createCustomerViaApi();
      const customerId = created.body.data.id;

      const crossRead = await request(app)
        .get(`/api/v1/customers/${customerId}`)
        .set(headersFor(otherOwnerToken, otherTenantId));
      expect([403, 404]).toContain(crossRead.status);
    });
  });

  // =========================================================================
  // 2. RBAC & DATA MASKING
  // =========================================================================
  describe('2. RBAC Permissions & Auditor Phone Masking', () => {
    it('masks phone numbers for auditor while allowing read/export/reports and blocking mutations', async () => {
      const created = await createCustomerViaApi({ phone: '+91 98200 12345', openingBalance: 100 });
      const customerId = created.body.data.id;

      // Auditor can list & read with masked phones
      const listRes = await request(app)
        .get('/api/v1/customers')
        .set(headersFor(auditorToken));
      expect(listRes.status).toBe(200);
      expect(listRes.body.data[0].phoneMasked).toBe(true);
      expect(listRes.body.data[0].phone).toContain('******2345');
      expect(listRes.body.data[0].phone).not.toContain('98200');

      const ledgerRes = await request(app)
        .get(`/api/v1/customers/${customerId}/ledger`)
        .set(headersFor(auditorToken));
      expect(ledgerRes.status).toBe(200);

      const reportsRes = await request(app)
        .get('/api/v1/customers/reports/credit-summary')
        .set(headersFor(auditorToken));
      expect(reportsRes.status).toBe(200);

      // Auditor cannot mutate customers, collect payments, adjust limits, or share WhatsApp
      const createDeny = await createCustomerViaApi({ phone: '9820099999' }, auditorToken);
      expect(createDeny.status).toBe(403);

      const collectDeny = await request(app)
        .post(`/api/v1/customers/${customerId}/payments`)
        .set(headersFor(auditorToken))
        .set('X-Idempotency-Key', 'auditor_collect_deny_1')
        .send({ amount: 50, paymentMode: 'cash' });
      expect(collectDeny.status).toBe(403);

      const waDeny = await request(app)
        .post(`/api/v1/customers/${customerId}/statement/whatsapp`)
        .set(headersFor(auditorToken))
        .send({});
      expect(waDeny.status).toBe(403);
    });

    it('blocks helper from all customer directory and Khata routes and restricts cashier/pharmacist high-risk permissions', async () => {
      const created = await createCustomerViaApi({ openingBalance: 500 });
      const customerId = created.body.data.id;

      // Helper denied
      const helperList = await request(app)
        .get('/api/v1/customers')
        .set(headersFor(helperToken));
      expect(helperList.status).toBe(403);

      // Cashier can view & collect, cannot manage credit limit or adjust balance or archive
      const cashierCollect = await request(app)
        .post(`/api/v1/customers/${customerId}/payments`)
        .set(headersFor(cashierToken))
        .set('X-Idempotency-Key', 'cashier_pay_ok_1')
        .send({ amount: 100, paymentMode: 'upi' });
      expect(cashierCollect.status).toBe(201);

      const cashierLimitDeny = await request(app)
        .patch(`/api/v1/customers/${customerId}/credit-limit`)
        .set(headersFor(cashierToken))
        .send({ creditLimit: 20000 });
      expect(cashierLimitDeny.status).toBe(403);

      const pharmacistAdjDeny = await request(app)
        .post(`/api/v1/customers/${customerId}/adjustments`)
        .set(headersFor(pharmacistToken))
        .set('X-Idempotency-Key', 'pharm_adj_deny_1')
        .send({ adjustmentType: 'CREDIT_ADJUSTMENT', amount: 50, reason: 'Try adjust' });
      expect(pharmacistAdjDeny.status).toBe(403);
    });
  });

  // =========================================================================
  // 3. INTEGER PAISE LEDGER PRECISION & RECONCILIATION
  // =========================================================================
  describe('3. Integer Paise Precision & Ledger Reconciliation', () => {
    it('maintains exact paise reconciliation across opening balance, payments, credit notes, adjustments & refunds', async () => {
      // Classic JS floating-point trap: 100.10 + 200.20 = 300.30000000000004
      const created = await createCustomerViaApi({ openingBalance: 100.1 });
      const customerId = created.body.data.id;

      // Debit adjustment 200.20 -> expected balance = 300.30
      const debitRes = await request(app)
        .post(`/api/v1/customers/${customerId}/adjustments`)
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'paise_debit_1')
        .send({
          adjustmentType: 'DEBIT_ADJUSTMENT',
          amount: 200.2,
          reason: 'Legacy bill carry-forward',
        });
      expect(debitRes.status).toBe(201);
      expect(debitRes.body.data.customer.currentOutstandingBalance).toBe(300.3);

      // Credit Note 50.15 -> expected 250.15
      const cnRes = await request(app)
        .post(`/api/v1/customers/${customerId}/credit-notes`)
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'paise_cn_1')
        .send({ amount: 50.15, reason: 'Goodwill discount rebate' });
      expect(cnRes.status).toBe(201);
      expect(cnRes.body.data.customer.currentOutstandingBalance).toBe(250.15);

      // Payment 300.15 with allowAdvance=true -> due 0, advance 50.00
      const payRes = await request(app)
        .post(`/api/v1/customers/${customerId}/payments`)
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'paise_pay_1')
        .send({ amount: 300.15, paymentMode: 'bank_transfer', allowAdvance: true });
      expect(payRes.status).toBe(201);
      expect(payRes.body.data.customer.currentOutstandingBalance).toBe(0);
      expect(payRes.body.data.customer.advanceBalance).toBe(50);

      // Refund 20.00 from advance -> advance 30.00
      const refundRes = await request(app)
        .post(`/api/v1/customers/${customerId}/adjustments`)
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'paise_refund_1')
        .send({
          adjustmentType: 'REFUND',
          amount: 20,
          reason: 'Advance refund via cash',
        });
      expect(refundRes.status).toBe(201);
      expect(refundRes.body.data.customer.advanceBalance).toBe(30);

      // Double-entry reconciliation verifies exact match with zero discrepancy
      const recRes = await request(app)
        .get(`/api/v1/customers/${customerId}/ledger/reconcile`)
        .set(headersFor(ownerToken));
      expect(recRes.status).toBe(200);
      expect(recRes.body.data.isBalanced).toBe(true);
      expect(recRes.body.data.discrepancy).toBe(0);
      expect(recRes.body.data.expectedAdvanceBalance).toBe(30);
    });
  });

  // =========================================================================
  // 4. CREDIT LIMIT ENFORCEMENT, OVERRIDE & CONCURRENCY SAFETY
  // =========================================================================
  describe('4. Credit Limit Enforcement, Override & Concurrency', () => {
    it('enforces credit limits, blocks disabled/blocked accounts, validates overrides & prevents concurrent limit breach', async () => {
      // Customer with ₹500 credit limit and ₹100 initial due (₹400 available)
      const created = await createCustomerViaApi({
        creditLimit: 500,
        openingBalance: 100,
      });
      const customerId = created.body.data.id;

      // 1) Sale of ₹200 succeeds (projected due = ₹300 <= ₹500)
      const okSale = await request(app)
        .post('/api/v1/pos/checkout')
        .set(headersFor(cashierToken))
        .set('X-Idempotency-Key', 'khata_sale_within_limit')
        .send({
          customerId,
          customer: { name: 'Rameshwar Gupta' },
          items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
          paymentMode: 'khata_credit',
          creditTermsDays: 15,
        });
      expect(okSale.status).toBe(201);
      expect(okSale.body.data.amountPaid).toBe(0);
      expect(okSale.body.data.khataCreditAmount).toBe(200);
      expect(getTestCustomerDirect(tenantId, customerId)!.currentOutstandingBalance).toBe(300);

      // 2) Concurrent Khata sales of ₹200 each: remaining credit is ₹200, so at most 1 may succeed!
      const [c1, c2] = await Promise.all([
        request(app)
          .post('/api/v1/pos/checkout')
          .set(headersFor(cashierToken))
          .set('X-Idempotency-Key', 'khata_conc_1')
          .send({
            customerId,
            customer: { name: 'Rameshwar Gupta' },
            items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
            paymentMode: 'khata_credit',
          }),
        request(app)
          .post('/api/v1/pos/checkout')
          .set(headersFor(cashierToken))
          .set('X-Idempotency-Key', 'khata_conc_2')
          .send({
            customerId,
            customer: { name: 'Rameshwar Gupta' },
            items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
            paymentMode: 'khata_credit',
          }),
      ]);

      const statuses = [c1.status, c2.status].sort();
      expect(statuses).toEqual([201, 400]);
      expect(getTestCustomerDirect(tenantId, customerId)!.currentOutstandingBalance).toBe(500);

      // 3) Cashier cannot override limit even if passing overrideCreditLimit=true
      const cashierOverrideDeny = await request(app)
        .post('/api/v1/pos/checkout')
        .set(headersFor(cashierToken))
        .set('X-Idempotency-Key', 'khata_override_cashier_deny')
        .send({
          customerId,
          customer: { name: 'Rameshwar Gupta' },
          items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
          paymentMode: 'khata_credit',
          overrideCreditLimit: true,
          creditOverrideReason: 'Cashier trying override',
        });
      expect(cashierOverrideDeny.status).toBe(403);

      // 4) Owner override without reason is rejected
      const missingReason = await request(app)
        .post('/api/v1/pos/checkout')
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'khata_override_no_reason')
        .send({
          customerId,
          customer: { name: 'Rameshwar Gupta' },
          items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
          paymentMode: 'khata_credit',
          overrideCreditLimit: true,
        });
      expect(missingReason.status).toBe(400);

      // 5) Owner override WITH reason succeeds
      const ownerOverrideOk = await request(app)
        .post('/api/v1/pos/checkout')
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'khata_override_owner_ok')
        .send({
          customerId,
          customer: { name: 'Rameshwar Gupta' },
          items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
          paymentMode: 'khata_credit',
          overrideCreditLimit: true,
          creditOverrideReason: 'Emergency cardiac medication refill approved by owner',
        });
      expect(ownerOverrideOk.status).toBe(201);
      expect(getTestCustomerDirect(tenantId, customerId)!.currentOutstandingBalance).toBe(700);

      // 6) BLOCKED customer cannot buy on Khata
      const blockRes = await request(app)
        .patch(`/api/v1/customers/${customerId}/status`)
        .set(headersFor(ownerToken))
        .send({ status: 'BLOCKED', reason: 'Overdue freeze' });
      expect(blockRes.status).toBe(200);

      const blockedSale = await request(app)
        .post('/api/v1/pos/checkout')
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'khata_blocked_customer')
        .send({
          customerId,
          customer: { name: 'Rameshwar Gupta' },
          items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
          paymentMode: 'khata_credit',
          overrideCreditLimit: true,
          creditOverrideReason: 'Try on blocked',
        });
      expect(blockedSale.status).toBe(400);
    });
  });

  // =========================================================================
  // 5. KHATA PAYMENT ALLOCATION, IDEMPOTENCY, CONCURRENCY & ADVANCE CREDIT
  // =========================================================================
  describe('5. Khata Payment Allocation, Idempotency, Concurrency & Advance Credit', () => {
    it('allocates FIFO oldest-first, supports specific invoice, prevents double deduction via idempotency & race locks, and auto-applies advance', async () => {
      const created = await createCustomerViaApi({ creditLimit: 5000 });
      const customerId = created.body.data.id;

      // Issue 2 Khata invoices of ₹200 each
      const inv1Res = await request(app)
        .post('/api/v1/pos/checkout')
        .set(headersFor(cashierToken))
        .set('X-Idempotency-Key', 'fifo_inv_1')
        .send({
          customerId,
          customer: { name: 'Rameshwar Gupta' },
          items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
          paymentMode: 'khata_credit',
        });
      const inv1Id = inv1Res.body.data.invoiceId;

      const inv2Res = await request(app)
        .post('/api/v1/pos/checkout')
        .set(headersFor(cashierToken))
        .set('X-Idempotency-Key', 'fifo_inv_2')
        .send({
          customerId,
          customer: { name: 'Rameshwar Gupta' },
          items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
          paymentMode: 'khata_credit',
        });
      const inv2Id = inv2Res.body.data.invoiceId;

      // Partial FIFO payment of ₹250 -> ₹200 settles inv1, ₹50 reduces inv2 to ₹150
      const payFifo = await request(app)
        .post(`/api/v1/customers/${customerId}/payments`)
        .set(headersFor(cashierToken))
        .set('X-Idempotency-Key', 'pay_fifo_250')
        .send({ amount: 250, paymentMode: 'upi', referenceNumber: 'UPI-FIFO-1' });
      expect(payFifo.status).toBe(201);
      expect(payFifo.body.data.payment.allocations.length).toBe(2);
      expect(payFifo.body.data.customer.currentOutstandingBalance).toBe(150);

      // Idempotency replay returns cached receipt without double deducting
      const payReplay = await request(app)
        .post(`/api/v1/customers/${customerId}/payments`)
        .set(headersFor(cashierToken))
        .set('X-Idempotency-Key', 'pay_fifo_250')
        .send({ amount: 250, paymentMode: 'upi', referenceNumber: 'UPI-FIFO-1' });
      expect(payReplay.status).toBe(200);
      expect(payReplay.headers['x-cache']).toBe('HIT');
      expect(getTestCustomerDirect(tenantId, customerId)!.currentOutstandingBalance).toBe(150);

      // Idempotency key reused with DIFFERENT payload -> 409 Conflict
      const payConflict = await request(app)
        .post(`/api/v1/customers/${customerId}/payments`)
        .set(headersFor(cashierToken))
        .set('X-Idempotency-Key', 'pay_fifo_250')
        .send({ amount: 100, paymentMode: 'cash' });
      expect(payConflict.status).toBe(409);

      // Overpayment without allowAdvance=true -> 400
      const overpayReject = await request(app)
        .post(`/api/v1/customers/${customerId}/payments`)
        .set(headersFor(cashierToken))
        .set('X-Idempotency-Key', 'pay_over_reject')
        .send({ amount: 300, paymentMode: 'cash' });
      expect(overpayReject.status).toBe(400);

      // Concurrent settlement of remaining ₹150 on specific inv2: only one succeeds!
      const [p1, p2] = await Promise.all([
        request(app)
          .post(`/api/v1/customers/${customerId}/payments`)
          .set(headersFor(cashierToken))
          .set('X-Idempotency-Key', 'pay_conc_1')
          .send({ amount: 150, paymentMode: 'cash', invoiceId: inv2Id }),
        request(app)
          .post(`/api/v1/customers/${customerId}/payments`)
          .set(headersFor(cashierToken))
          .set('X-Idempotency-Key', 'pay_conc_2')
          .send({ amount: 150, paymentMode: 'cash', invoiceId: inv2Id }),
      ]);
      expect([p1.status, p2.status].sort()).toEqual([201, 400]);
      expect(getTestCustomerDirect(tenantId, customerId)!.currentOutstandingBalance).toBe(0);

      // Collect ₹300 advance credit
      const advRes = await request(app)
        .post(`/api/v1/customers/${customerId}/payments`)
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'pay_adv_300')
        .send({ amount: 300, paymentMode: 'upi', allowAdvance: true });
      expect(advRes.status).toBe(201);
      expect(advRes.body.data.customer.advanceBalance).toBe(300);

      // Next Khata purchase of ₹200 auto-consumes ₹200 from advance, leaving ₹100 advance & ₹0 due!
      const nextKhata = await request(app)
        .post('/api/v1/pos/checkout')
        .set(headersFor(cashierToken))
        .set('X-Idempotency-Key', 'khata_auto_advance')
        .send({
          customerId,
          customer: { name: 'Rameshwar Gupta' },
          items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
          paymentMode: 'khata_credit',
        });
      expect(nextKhata.status).toBe(201);
      expect(nextKhata.body.data.balanceDue).toBe(0);
      expect(getTestCustomerDirect(tenantId, customerId)!.advanceBalance).toBe(100);
      expect(getTestCustomerDirect(tenantId, customerId)!.currentOutstandingBalance).toBe(0);
      expect(inv1Id).not.toBe(inv2Id);
    });
  });

  // =========================================================================
  // 6. POS INTEGRATION: CASH, KHATA, SPLIT, RETURNS & CANCELLATION REVERSALS
  // =========================================================================
  describe('6. POS Integration, Returns & Invoice Cancellation Credit Notes', () => {
    it('rejects Khata without customerId, handles cash/split sales, and atomically reverses Khata on partial return & full cancellation', async () => {
      // Unlinked Khata checkout must fail with 400
      const unlinkedKhata = await request(app)
        .post('/api/v1/pos/checkout')
        .set(headersFor(cashierToken))
        .set('X-Idempotency-Key', 'unlinked_khata_fail')
        .send({
          customer: { name: 'Walk-in' },
          items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
          paymentMode: 'khata_credit',
        });
      expect(unlinkedKhata.status).toBe(400);

      const created = await createCustomerViaApi({ creditLimit: 5000 });
      const customerId = created.body.data.id;

      // Cash sale linked to customerId updates visits & totalPurchases with zero Khata debit
      const cashSale = await request(app)
        .post('/api/v1/pos/checkout')
        .set(headersFor(cashierToken))
        .set('X-Idempotency-Key', 'linked_cash_sale')
        .send({
          customerId,
          customer: { name: 'Rameshwar Gupta' },
          items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
          paymentMode: 'cash',
        });
      expect(cashSale.status).toBe(201);
      expect(getTestCustomerDirect(tenantId, customerId)!.totalVisits).toBe(1);
      expect(getTestCustomerDirect(tenantId, customerId)!.totalPurchases).toBe(200);
      expect(getTestCustomerDirect(tenantId, customerId)!.currentOutstandingBalance).toBe(0);

      // Split sale: 2 units (₹400) -> ₹150 Cash + ₹250 Khata Credit
      const splitSale = await request(app)
        .post('/api/v1/pos/checkout')
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'linked_split_sale')
        .send({
          customerId,
          customer: { name: 'Rameshwar Gupta' },
          items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 2 }],
          payments: [
            { mode: 'cash', amount: 150 },
            { mode: 'khata_credit', amount: 250 },
          ],
          creditTermsDays: 7,
        });
      expect(splitSale.status).toBe(201);
      const splitInvId = splitSale.body.data.invoiceId;
      expect(splitSale.body.data.amountPaid).toBe(150);
      expect(splitSale.body.data.khataCreditAmount).toBe(250);
      expect(splitSale.body.data.balanceDue).toBe(250);
      expect(getTestCustomerDirect(tenantId, customerId)!.currentOutstandingBalance).toBe(250);

      // Partial Sales Return of 1 unit (₹200) -> atomic CREDIT_NOTE reduces due to ₹50
      const returnRes = await request(app)
        .post(`/api/v1/invoices/${splitInvId}/returns`)
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'split_return_1')
        .send({
          items: [{ batchId: 'batch-telma-01', quantity: 1, restock: true }],
          reason: 'Strip excess',
        });
      expect(returnRes.status).toBe(200);
      expect(getTestCustomerDirect(tenantId, customerId)!.currentOutstandingBalance).toBe(50);

      // Full Khata sale of ₹200 then invoice cancellation -> atomic CREDIT_NOTE brings balance back to ₹50 without duplicate credits
      const khataToCancel = await request(app)
        .post('/api/v1/pos/checkout')
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'khata_for_cancel')
        .send({
          customerId,
          customer: { name: 'Rameshwar Gupta' },
          items: [{ medicineId: 'med-telma-40', batchId: 'batch-telma-01', quantity: 1 }],
          paymentMode: 'khata_credit',
        });
      expect(khataToCancel.status).toBe(201);
      const cancelInvId = khataToCancel.body.data.invoiceId;
      expect(getTestCustomerDirect(tenantId, customerId)!.currentOutstandingBalance).toBe(250);

      const cancelRes = await request(app)
        .post(`/api/v1/invoices/${cancelInvId}/cancel`)
        .set(headersFor(ownerToken))
        .set('X-Idempotency-Key', 'cancel_khata_inv_1')
        .send({ reason: 'Entered wrong patient' });
      expect(cancelRes.status).toBe(200);
      expect(getTestCustomerDirect(tenantId, customerId)!.currentOutstandingBalance).toBe(50);

      const ledgerEntries = getTestLedgerEntriesDirect(tenantId, customerId);
      const creditNotes = ledgerEntries.filter((e) => e.entryType === 'CREDIT_NOTE');
      expect(creditNotes.length).toBe(2);
    });
  });

  // =========================================================================
  // 7. STATEMENTS, EXPORTS, SANITIZED WHATSAPP & AGING REPORTS
  // =========================================================================
  describe('7. Statements, CSV/PDF Exports, WhatsApp Share & Aging Reports', () => {
    it('computes accurate period statements, exports valid CSV & PDF, sanitizes WhatsApp messages & computes overdue aging buckets', async () => {
      const created = await createCustomerViaApi({
        openingBalance: 100,
        allergies: 'Penicillin Severe',
        chronicConditions: 'Diabetes',
        dateOfBirth: '1965-04-12',
      });
      const customerId = created.body.data.id;

      // Backdate an overdue invoice directly in test store to verify aging buckets
      const pastDue = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const createdPast = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
      setTestInvoice(tenantId, {
        id: 'inv-overdue-test',
        invoiceNumber: 'INV-OVERDUE-20D',
        tenantId,
        branchId,
        userId: 'owner-1',
        userName: 'Suresh Patel',
        customerId,
        customer: { name: 'Rameshwar Gupta', phone: '+91 98200 12345' },
        items: [],
        subtotal: 400,
        totalDiscount: 0,
        taxableAmount: 357.14,
        cgst: 21.43,
        sgst: 21.43,
        igst: 0,
        roundOff: 0,
        grandTotal: 400,
        amountPaid: 0,
        khataCreditAmount: 400,
        balanceDue: 400,
        creditTermsDays: 15,
        dueDate: pastDue,
        paymentStatus: 'unpaid',
        payments: [],
        status: 'completed',
        isInterState: false,
        createdAt: createdPast,
        updatedAt: createdPast,
      });

      // Statement check
      const stmtRes = await request(app)
        .get(`/api/v1/customers/${customerId}/statement`)
        .set(headersFor(ownerToken));
      expect(stmtRes.status).toBe(200);
      expect(stmtRes.body.data.closingBalance).toBe(100);

      // CSV export
      const csvRes = await request(app)
        .post(`/api/v1/customers/${customerId}/statement/export`)
        .set(headersFor(ownerToken))
        .send({ format: 'csv' });
      expect(csvRes.status).toBe(200);
      expect(csvRes.body.data.mimeType).toContain('text/csv');
      const csvDecoded = Buffer.from(csvRes.body.data.contentBase64, 'base64').toString('utf-8');
      expect(csvDecoded).toContain('Rameshwar Gupta');

      // PDF export
      const pdfRes = await request(app)
        .post(`/api/v1/customers/${customerId}/statement/export`)
        .set(headersFor(ownerToken))
        .send({ format: 'pdf' });
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.body.data.mimeType).toBe('application/pdf');
      const pdfDecoded = Buffer.from(pdfRes.body.data.contentBase64, 'base64').toString('utf-8');
      expect(pdfDecoded.startsWith('%PDF-1.4')).toBe(true);

      // WhatsApp sanitized summary (must exclude medical/clinical fields)
      const waRes = await request(app)
        .post(`/api/v1/customers/${customerId}/statement/whatsapp`)
        .set(headersFor(ownerToken))
        .send({ storeName: 'Apex Medicos' });
      expect(waRes.status).toBe(200);
      expect(waRes.body.data.deliveryStatus).toBe('USER_ACTION_REQUIRED');
      expect(waRes.body.data.whatsappUrl).toContain('https://wa.me/');
      expect(waRes.body.data.messageText).not.toContain('Penicillin');
      expect(waRes.body.data.messageText).not.toContain('Diabetes');
      expect(waRes.body.data.messageText).not.toContain('1965-04-12');

      // Overdue & Outstanding aging reports
      const overdueRes = await request(app)
        .get('/api/v1/customers/reports/overdue')
        .set(headersFor(auditorToken));
      expect(overdueRes.status).toBe(200);
      expect(overdueRes.body.data.overdueInvoices.length).toBe(1);
      expect(overdueRes.body.data.overdueInvoices[0].agingBucket).toBe('16_30_days');
      expect(overdueRes.body.data.overdueInvoices[0].customerPhone).toContain('******2345');

      const outRes = await request(app)
        .get('/api/v1/customers/reports/outstanding')
        .set(headersFor(ownerToken));
      expect(outRes.status).toBe(200);
      expect(outRes.body.data.totals.totalOutstanding).toBe(100);
      expect(getAllTestInvoicesForTenant(tenantId).length).toBe(1);
    });
  });
});

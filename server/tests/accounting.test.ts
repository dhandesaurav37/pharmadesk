import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { setTestMembership, clearTestMemberships } from '../src/middleware/tenantAuthorization';
import { clearTestMedicines, setTestMedicine } from '../src/services/medicineService';
import { clearTestInventory, setTestBatch } from '../src/services/inventoryService';
import { clearTestBilling, BillingTransactionService } from '../src/services/billingTransactionService';
import { clearTestCustomers, CustomerService } from '../src/services/customerService';
import { clearTestAuditLogs } from '../src/services/auditService';
import { clearTestSuppliers } from '../src/services/supplierService';
import { clearTestProcurementData, setTestTenantProfile } from '../src/services/procurementService';
import {
  AccountingService,
  clearTestAccountingData,
} from '../src/services/accountingService';

describe('Phase 9: Double-Entry Accounting Engine, Expenses, Banking & Financial Reporting', () => {
  let app: Express;
  const tenantId = 'pharma-accounting-mumbai';
  const otherTenantId = 'pharma-accounting-pune';
  const branchMain = 'branch-main';
  const branchWest = 'branch-west';

  const ownerToken = 'Bearer test-mock-token:owner-1:owner@pharma.test';
  const pharmacistToken = 'Bearer test-mock-token:pharm-1:sunita@pharma.test';
  const cashierToken = 'Bearer test-mock-token:cashier-1:rohan@pharma.test';
  const auditorToken = 'Bearer test-mock-token:auditor-1:arvind@pharma.test';
  const deactivatedToken = 'Bearer test-mock-token:deact-1:former@pharma.test';
  const otherOwnerToken = 'Bearer test-mock-token:other-owner:owner@pune.test';

  const headersFor = (token: string, tId = tenantId, bId = branchMain) => ({
    Authorization: token,
    'X-Tenant-ID': tId,
    'X-Branch-ID': bId,
  });

  const futureDate = (daysAhead: number) =>
    new Date(Date.now() + daysAhead * 86400_000).toISOString().slice(0, 10);

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    clearTestMemberships();
    clearTestMedicines();
    clearTestInventory();
    clearTestBilling();
    clearTestCustomers();
    clearTestAuditLogs();
    clearTestSuppliers();
    clearTestProcurementData();
    clearTestAccountingData();

    setTestTenantProfile(tenantId, {
      name: 'Arogya Pharma & Surgical',
      gstin: '27AAECA1234F1Z5',
      state: 'Maharashtra',
      stateCode: '27',
    });

    setTestMembership(tenantId, 'owner-1', {
      tenantId,
      userId: 'owner-1',
      role: 'owner',
      status: 'active',
      assignedBranchIds: [branchMain, branchWest, '*'],
      permissions: ['*'],
    });
    setTestMembership(tenantId, 'pharm-1', {
      tenantId,
      userId: 'pharm-1',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: [branchMain],
      permissions: [
        'medicines.view',
        'inventory.view',
        'billing.view',
        'billing.create',
        'accounting.expenses.view',
        'accounting.expenses.create',
      ],
    });
    setTestMembership(tenantId, 'cashier-1', {
      tenantId,
      userId: 'cashier-1',
      role: 'cashier',
      status: 'active',
      assignedBranchIds: [branchMain],
      permissions: ['billing.view', 'billing.create', 'customers.khata_collect'],
    });
    setTestMembership(tenantId, 'auditor-1', {
      tenantId,
      userId: 'auditor-1',
      role: 'auditor',
      status: 'active',
      assignedBranchIds: [branchMain],
      permissions: [
        'accounting.view',
        'accounting.accounts.view',
        'accounting.journals.view',
        'accounting.reports.view',
        'accounting.reports.export',
        'accounting.expenses.view',
        'accounting.cash_bank.view',
        'accounting.periods.view',
        'accounting.audit.view',
      ],
    });
    setTestMembership(tenantId, 'deact-1', {
      tenantId,
      userId: 'deact-1',
      role: 'pharmacist',
      status: 'deactivated',
      assignedBranchIds: [branchMain],
      permissions: ['accounting.view'],
    });
    setTestMembership(otherTenantId, 'other-owner', {
      tenantId: otherTenantId,
      userId: 'other-owner',
      role: 'owner',
      status: 'active',
      assignedBranchIds: ['main', '*'],
      permissions: ['*'],
    });

    // Seed sample medicine + batch in main branch & west branch
    setTestMedicine(tenantId, {
      id: 'med-amox',
      tenantId,
      name: 'Amoxycillin 500mg Strip',
      genericName: 'Amoxycillin',
      brand: 'Cipla',
      category: 'Antibiotics',
      dosageForm: 'Capsule',
      strength: '500mg',
      packSize: '10 Caps',
      uom: 'Strip',
      hsnCode: '300410',
      gstRate: 12,
      minStockThreshold: 10,
      prescriptionRequired: true,
      status: 'active',
      createdBy: 'owner-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setTestBatch(tenantId, {
      id: 'batch-amox-main',
      tenantId,
      branchId: branchMain,
      medicineId: 'med-amox',
      medicineName: 'Amoxycillin 500mg Strip',
      genericName: 'Amoxycillin',
      batchNumber: 'AMX-101',
      expiryDate: futureDate(365),
      purchasePrice: 60, // PTR = ₹60
      mrp: 112,
      sellingPrice: 112, // Inclusive of 12% GST -> Taxable ₹100, CGST ₹6, SGST ₹6
      quantityReceived: 100,
      currentStock: 100,
      freeQuantity: 0,
      status: 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setTestBatch(tenantId, {
      id: 'batch-amox-west',
      tenantId,
      branchId: branchWest,
      medicineId: 'med-amox',
      medicineName: 'Amoxycillin 500mg Strip',
      genericName: 'Amoxycillin',
      batchNumber: 'AMX-202',
      expiryDate: futureDate(365),
      purchasePrice: 55,
      mrp: 112,
      sellingPrice: 112,
      quantityReceived: 50,
      currentStock: 50,
      freeQuantity: 0,
      status: 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  // ==================== 1. CHART OF ACCOUNTS & DOUBLE-ENTRY INVARIANTS ====================

  it('seeds default Chart of Accounts, allows custom accounts, and protects system & referenced accounts from deletion', async () => {
    const res = await request(app)
      .get('/api/v1/accounting/accounts')
      .set(headersFor(ownerToken));
    expect(res.status).toBe(200);
    const accounts = res.body.data.accounts;
    expect(accounts.length).toBeGreaterThanOrEqual(30);
    const cashAcc = accounts.find((a: any) => a.code === '1100');
    expect(cashAcc.isSystemAccount).toBe(true);

    // Block deletion of system account
    const delSys = await request(app)
      .delete(`/api/v1/accounting/accounts/${cashAcc.id}`)
      .set(headersFor(ownerToken));
    expect(delSys.status).toBe(409);

    // Create custom expense account and delete while unreferenced
    const createCustom = await request(app)
      .post('/api/v1/accounting/accounts')
      .set(headersFor(ownerToken))
      .send({
        code: '5399',
        name: 'Cold Chain Maintenance',
        category: 'EXPENSES',
        description: 'Refrigerator servicing',
      });
    expect(createCustom.status).toBe(201);
    const customId = createCustom.body.data.account.id;

    // Delete unused custom account succeeds
    const delUnused = await request(app)
      .delete(`/api/v1/accounting/accounts/${customId}`)
      .set(headersFor(ownerToken));
    expect(delUnused.status).toBe(200);

    // Create referenced custom account via expense -> deletion blocked
    const createCustom2 = await request(app)
      .post('/api/v1/accounting/accounts')
      .set(headersFor(ownerToken))
      .send({
        code: '5401',
        name: 'Bio-Medical Waste Disposal',
        category: 'EXPENSES',
      });
    const usedId = createCustom2.body.data.account.id;

    await request(app)
      .post('/api/v1/expenses')
      .set(headersFor(ownerToken))
      .send({
        categoryAccountId: usedId,
        vendorName: 'GreenMed Waste Co',
        taxableAmount: 1500,
        paymentMode: 'BANK_TRANSFER',
      })
      .expect(201);

    const delUsed = await request(app)
      .delete(`/api/v1/accounting/accounts/${usedId}`)
      .set(headersFor(ownerToken));
    expect(delUsed.status).toBe(409);
  });

  it('enforces integer paise precision, rejects unbalanced/zero/empty entries, and prevents idempotency conflict replays', async () => {
    await expect(
      AccountingService.postJournalEntry({
        tenantId,
        branchId: branchMain,
        entryType: 'MANUAL_ADJUSTMENT',
        transactionDate: '2026-06-15',
        referenceType: 'test',
        referenceId: 'unbal-1',
        narration: 'Unbalanced test',
        idempotencyKey: 'unbal-key-1',
        lines: [
          { systemCode: 'CASH_IN_HAND', debitPaise: 10050 },
          { systemCode: 'OTHER_INCOME', creditPaise: 10000 },
        ],
        createdBy: 'owner-1',
      })
    ).rejects.toThrow(/Unbalanced journal entry/);

    await expect(
      AccountingService.postJournalEntry({
        tenantId,
        branchId: branchMain,
        entryType: 'MANUAL_ADJUSTMENT',
        transactionDate: '2026-06-15',
        referenceType: 'test',
        referenceId: 'zero-1',
        narration: 'Zero test',
        idempotencyKey: 'zero-key-1',
        lines: [
          { systemCode: 'CASH_IN_HAND', debitPaise: 0 },
          { systemCode: 'OTHER_INCOME', creditPaise: 0 },
        ],
        createdBy: 'owner-1',
      })
    ).rejects.toThrow();

    // Exact paise arithmetic: ₹100.10 + ₹200.20 = ₹300.30
    const first = await AccountingService.postJournalEntry({
      tenantId,
      branchId: branchMain,
      entryType: 'MANUAL_ADJUSTMENT',
      transactionDate: '2026-06-15',
      referenceType: 'test',
      referenceId: 'paise-1',
      narration: 'Paise accuracy check',
      idempotencyKey: 'paise-exact-1',
      lines: [
        { systemCode: 'CASH_IN_HAND', debitPaise: 10010 },
        { systemCode: 'MAIN_BANK', debitPaise: 20020 },
        { systemCode: 'OWNERS_CAPITAL', creditPaise: 30030 },
      ],
      createdBy: 'owner-1',
    });
    expect(first.replayed).toBe(false);
    expect(first.entry.debitTotalPaise).toBe(30030);
    expect(first.entry.debitTotal).toBe(300.3);

    // Same reference & key -> replayed idempotently
    const replay = await AccountingService.postJournalEntry({
      tenantId,
      branchId: branchMain,
      entryType: 'MANUAL_ADJUSTMENT',
      transactionDate: '2026-06-15',
      referenceType: 'test',
      referenceId: 'paise-1',
      narration: 'Paise accuracy check',
      idempotencyKey: 'paise-exact-1',
      lines: [
        { systemCode: 'CASH_IN_HAND', debitPaise: 10010 },
        { systemCode: 'MAIN_BANK', debitPaise: 20020 },
        { systemCode: 'OWNERS_CAPITAL', creditPaise: 30030 },
      ],
      createdBy: 'owner-1',
    });
    expect(replay.replayed).toBe(true);
    expect(replay.entry.id).toBe(first.entry.id);

    // Different referenceId with same key -> conflict
    await expect(
      AccountingService.postJournalEntry({
        tenantId,
        branchId: branchMain,
        entryType: 'MANUAL_ADJUSTMENT',
        transactionDate: '2026-06-15',
        referenceType: 'test',
        referenceId: 'different-ref',
        narration: 'Conflict test',
        idempotencyKey: 'paise-exact-1',
        lines: [
          { systemCode: 'CASH_IN_HAND', debitPaise: 10000 },
          { systemCode: 'OWNERS_CAPITAL', creditPaise: 10000 },
        ],
        createdBy: 'owner-1',
      })
    ).rejects.toThrow(/Duplicate accounting idempotency key/);
  });

  // ==================== 2. FINANCIAL PERIOD LOCKING & REOPEN + JOURNAL REVERSALS ====================

  it('enforces Indian Financial Year period closing locks and audited reopen, plus immutable journal reversals', async () => {
    const periodsRes = await request(app)
      .get('/api/v1/accounting/periods')
      .set(headersFor(ownerToken));
    expect(periodsRes.status).toBe(200);
    const periods = periodsRes.body.data.periods;
    expect(periods.length).toBe(12);
    expect(periods[0].financialYear).toMatch(/^FY \d{4}-\d{2}$/);

    // Target current month period
    const targetPeriod = periods.find(
      (p: any) =>
        new Date().toISOString().slice(0, 10) >= p.startDate &&
        new Date().toISOString().slice(0, 10) <= p.endDate
    ) || periods[0];

    // Post an expense in targetPeriod
    const expRes = await request(app)
      .post('/api/v1/expenses')
      .set(headersFor(ownerToken))
      .send({
        expenseDate: targetPeriod.startDate,
        categoryAccountId: 'coa_5210',
        vendorName: 'Shop Landlord',
        taxableAmount: 10000,
        paymentMode: 'BANK_TRANSFER',
      });
    expect(expRes.status).toBe(201);
    const journalId = expRes.body.data.expense.recognitionJournalId;

    // Close the period
    const closeRes = await request(app)
      .post(`/api/v1/accounting/periods/${targetPeriod.id}/close`)
      .set(headersFor(ownerToken))
      .send({ notes: 'Month-end close completed' });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.period.status).toBe('CLOSED');

    // Attempt posting inside closed period -> 409 Conflict
    const blockedExp = await request(app)
      .post('/api/v1/expenses')
      .set(headersFor(ownerToken))
      .send({
        expenseDate: targetPeriod.startDate,
        categoryAccountId: 'coa_5230',
        vendorName: 'MSEB Power',
        taxableAmount: 2500,
        paymentMode: 'CASH',
      });
    expect(blockedExp.status).toBe(409);

    // Attempt reversal inside closed period -> 409 Conflict
    const blockedRev = await request(app)
      .post(`/api/v1/accounting/journal-entries/${journalId}/reverse`)
      .set(headersFor(ownerToken))
      .send({ reason: 'Wrong date entry', reversalDate: targetPeriod.startDate });
    expect(blockedRev.status).toBe(409);

    // Reopen period with audit reason -> succeeds
    const reopenRes = await request(app)
      .post(`/api/v1/accounting/periods/${targetPeriod.id}/reopen`)
      .set(headersFor(ownerToken))
      .send({ reason: 'Correction required for rent voucher' });
    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.data.period.status).toBe('OPEN');

    // Reverse journal entry now succeeds and zeroes out Rent Expense & Bank net effect
    const revRes = await request(app)
      .post(`/api/v1/accounting/journal-entries/${journalId}/reverse`)
      .set(headersFor(ownerToken))
      .send({ reason: 'Duplicate rent posted', reversalDate: targetPeriod.startDate });
    expect(revRes.status).toBe(201);
    expect(revRes.body.data.original.status).toBe('REVERSED');
    expect(revRes.body.data.reversal.entryType).toBe('REVERSAL');

    // Double reversal blocked
    const doubleRev = await request(app)
      .post(`/api/v1/accounting/journal-entries/${journalId}/reverse`)
      .set(headersFor(ownerToken))
      .send({ reason: 'Try again' });
    expect(doubleRev.status).toBe(409);

    // Check Trial Balance shows 0 net balances while GL still retains original & reversal entries
    const tbRes = await request(app)
      .get('/api/v1/accounting/reports/trial-balance')
      .set(headersFor(ownerToken));
    expect(tbRes.status).toBe(200);
    expect(tbRes.body.data.totals.closingDebit).toBe(0);
    expect(tbRes.body.data.totals.closingCredit).toBe(0);
    expect(tbRes.body.data.totals.isBalanced).toBe(true);
  });

  // ==================== 3. POS SALES + RETURNS + CANCELLATION + CUSTOMER KHATA ====================

  it('posts balanced double-entry journals for POS sales (Cash/UPI/Khata), COGS at batch PTR, returns, cancellations & Khata collections', async () => {
    // 1. Create Khata customer with ₹500 opening balance
    const cust = await CustomerService.createCustomer(
      tenantId,
      branchMain,
      {
        name: 'Dr. Ramesh Clinic',
        phone: '9820112233',
        customerType: 'CLINIC',
        creditEnabled: true,
        creditLimit: 20000,
        openingBalance: 500,
      },
      'owner-1',
      'Owner'
    );

    // 2. POS Checkout: 2 strips Amox @ ₹112 = ₹224 total (Taxable ₹200, CGST ₹12, SGST ₹12; PTR = ₹60*2 = ₹120 COGS)
    // Split payment: ₹100 UPI + ₹124 Khata credit
    const inv = await BillingTransactionService.createSalesInvoice({
      tenantId,
      branchId: branchMain,
      userId: 'owner-1',
      userName: 'Owner',
      customerId: cust.id,
      customer: { name: 'Dr. Ramesh Clinic' },
      items: [{ medicineId: 'med-amox', batchId: 'batch-amox-main', quantity: 2 }],
      payments: [
        { mode: 'upi', amount: 100 },
        { mode: 'khata_credit', amount: 124 },
      ],
      idempotencyKey: 'pos-acct-test-01',
    });
    expect(inv.grandTotal).toBe(224);
    expect(inv.balanceDue).toBe(124);

    // 3. Collect ₹300 via Cash on Khata -> ₹124 clears invoice, ₹176 settles opening ₹500 -> remaining ₹324
    // Actually opening ₹500 + ₹124 invoice = ₹624 due. Collect ₹700 via BANK -> clears ₹624 + adds ₹76 Customer Advance!
    await CustomerService.collectKhataPayment({
      tenantId,
      branchId: branchMain,
      customerId: cust.id,
      amount: 700,
      paymentMode: 'bank_transfer',
      allowAdvance: true,
      userId: 'owner-1',
      userName: 'Owner',
      idempotencyKey: 'khata-pay-acct-01',
    });

    // 4. Create Cash invoice (1 strip Amox = ₹112, COGS ₹60) then Return it (damaged -> NOT restocked)
    const inv2 = await BillingTransactionService.createSalesInvoice({
      tenantId,
      branchId: branchMain,
      userId: 'owner-1',
      userName: 'Owner',
      customer: { name: 'Walk-in Patient' },
      items: [{ medicineId: 'med-amox', batchId: 'batch-amox-main', quantity: 1 }],
      payments: [{ mode: 'cash', amount: 112 }],
      idempotencyKey: 'pos-acct-test-02',
    });

    await BillingTransactionService.processSalesReturn(
      tenantId,
      branchMain,
      inv2.invoiceId,
      {
        items: [{ batchId: 'batch-amox-main', quantity: 1, damaged: true, restock: false }],
        reason: 'Torn foil strip',
      },
      'owner-1',
      'ret-acct-test-02'
    );

    // 5. Create another UPI invoice (1 strip = ₹112) and Cancel it -> restores stock + reverses COGS & revenue
    const inv3 = await BillingTransactionService.createSalesInvoice({
      tenantId,
      branchId: branchMain,
      userId: 'owner-1',
      userName: 'Owner',
      customer: { name: 'Walk-in Cancel' },
      items: [{ medicineId: 'med-amox', batchId: 'batch-amox-main', quantity: 1 }],
      payments: [{ mode: 'upi', amount: 112 }],
      idempotencyKey: 'pos-acct-test-03',
    });

    await BillingTransactionService.cancelSalesInvoice(
      tenantId,
      branchMain,
      inv3.invoiceId,
      'Customer declined prescription',
      'owner-1',
      'cancel-acct-03'
    );

    // Verify Trial Balance is balanced and exact net figures match
    const tbRes = await request(app)
      .get('/api/v1/accounting/reports/trial-balance')
      .set(headersFor(ownerToken));
    expect(tbRes.status).toBe(200);
    expect(tbRes.body.data.totals.isBalanced).toBe(true);

    // Net sales after inv2 return (₹100) and inv3 cancel (₹100): Net Taxable Sales = ₹200
    const pnlRes = await request(app)
      .get('/api/v1/accounting/reports/profit-loss')
      .set(headersFor(ownerToken));
    expect(pnlRes.status).toBe(200);
    expect(pnlRes.body.data.summary.netSales).toBe(200);
    // inv1 COGS (120) + inv2 damaged non-restocked COGS (60) + inv3 cancelled/restored COGS (0) = 180
    expect(pnlRes.body.data.summary.totalCogs).toBe(180);
    expect(pnlRes.body.data.summary.grossProfit).toBe(20);

    // Verify Customer Khata AR GL (1300) is 0 (because ₹624 was fully settled + ₹76 Customer Advances on 2150!)
    const bsRes = await request(app)
      .get('/api/v1/accounting/reports/balance-sheet')
      .set(headersFor(ownerToken));
    expect(bsRes.status).toBe(200);
    expect(bsRes.body.data.totals.isBalanced).toBe(true);
    const advItem = bsRes.body.data.liabilities.items.find((i: any) => i.code === '2150');
    expect(advItem.balance).toBe(76);
  });

  // ==================== 4. PROCUREMENT (ZERO PO LIABILITY, NO GRN+INVOICE DOUBLE COUNTING, ITC) ====================

  it('keeps POs non-accounting, avoids GRN+SupplierInvoice double payable liability, and posts supplier payments & returns accurately', async () => {
    // 1. Create Supplier with zero opening balance
    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set(headersFor(ownerToken))
      .send({
        legalName: 'MedLife Distributors Pvt Ltd',
        tradeName: 'MedLife Distributors',
        contactPerson: 'Suresh',
        primaryPhone: '9820001122',
        gstin: '27AAECM4019C1Z4',
        state: 'Maharashtra',
        stateCode: '27',
        drugLicenceNumber: 'MH-20B-9999',
        supplierType: 'DISTRIBUTOR',
        creditPeriodDays: 30,
      });
    expect(supRes.status).toBe(201);
    const supplierId = supRes.body.data.supplier.id;

    // 2. Create & Approve Purchase Order -> MUST create ZERO accounting journal entries
    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set(headersFor(ownerToken))
      .send({
        supplierId,
        items: [{ medicineId: 'med-amox', orderedQuantity: 20, unitCost: 60, gstRate: 12 }],
        submitImmediately: true,
      });
    expect(poRes.status).toBe(201);
    const poId = poRes.body.data.purchaseOrder.id;

    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/approve`)
      .set(headersFor(ownerToken))
      .expect(200);

    const journalsAfterPo = await request(app)
      .get('/api/v1/accounting/journal-entries')
      .set(headersFor(ownerToken));
    expect(journalsAfterPo.body.data.count).toBe(0);

    // 3. Post GRN WITHOUT autoCreateSupplierInvoice -> Credits 2110 GRN Unbilled Clearing (NOT 2100 AP yet)
    const grnRes = await request(app)
      .post('/api/v1/goods-receipts')
      .set(headersFor(ownerToken))
      .set('X-Idempotency-Key', 'grn-acc-01')
      .send({
        poId,
        supplierId,
        autoCreateSupplierInvoice: false,
        items: [
          {
            medicineId: 'med-amox',
            batchNumber: 'AMX-PO-01',
            expiryDate: futureDate(365),
            receivedQuantity: 20,
            acceptedQuantity: 20,
            purchasePrice: 60, // 20 * 60 = 1200 taxable, CGST 72, SGST 72, Total = 1344
            mrp: 112,
            gstRate: 12,
          },
        ],
      });
    expect(grnRes.status).toBe(201);
    const grnId = grnRes.body.data.grn.id;

    let tbAfterGrn = await request(app)
      .get('/api/v1/accounting/reports/trial-balance')
      .set(headersFor(ownerToken));
    expect(tbAfterGrn.body.data.totals.isBalanced).toBe(true);
    let invRow = tbAfterGrn.body.data.rows.find((r: any) => r.code === '1400');
    expect(invRow.netBalance).toBe(1200);

    // 4. Create Supplier Invoice linked to GRN -> clears 2110 -> 2100 AP (Total AP = 1344, NEVER 2688!)
    const sinvRes = await request(app)
      .post('/api/v1/supplier-invoices')
      .set(headersFor(ownerToken))
      .send({
        supplierId,
        grnId,
        supplierInvoiceNumber: 'MLD/26-27/001',
      });
    expect(sinvRes.status).toBe(201);

    const bsAfterSinv = await request(app)
      .get('/api/v1/accounting/reports/balance-sheet')
      .set(headersFor(ownerToken));
    const apItem = bsAfterSinv.body.data.liabilities.items.find((i: any) => i.code === '2100');
    const unbilledItem = bsAfterSinv.body.data.liabilities.items.find((i: any) => i.code === '2110');
    expect(apItem.balance).toBe(1344);
    expect(unbilledItem).toBeUndefined(); // 2110 cleared cleanly to 0!

    // 5. Record Supplier Payment of ₹1500 via BANK (₹1344 settles AP + ₹156 Supplier Advance)
    const payRes = await request(app)
      .post('/api/v1/supplier-payments')
      .set(headersFor(ownerToken))
      .set('X-Idempotency-Key', 'spay-acc-01')
      .send({
        supplierId,
        paymentMode: 'BANK_TRANSFER',
        amount: 1500,
        allowAdvance: true,
        referenceNumber: 'UTR998877',
      });
    expect(payRes.status).toBe(201);

    const bsAfterPay = await request(app)
      .get('/api/v1/accounting/reports/balance-sheet')
      .set(headersFor(ownerToken));
    expect(bsAfterPay.body.data.totals.isBalanced).toBe(true);
    expect(bsAfterPay.body.data.liabilities.items.find((i: any) => i.code === '2100')).toBeUndefined();
    expect(bsAfterPay.body.data.assets.items.find((i: any) => i.code === '1350').balance).toBe(156);

    // 6. Check Input GST ITC in GST Summary (CGST 72, SGST 72 = 144)
    const gstRes = await request(app)
      .get('/api/v1/accounting/reports/gst-summary')
      .set(headersFor(ownerToken));
    expect(gstRes.status).toBe(200);
    expect(gstRes.body.data.inputTaxCredit.cgst).toBe(72);
    expect(gstRes.body.data.inputTaxCredit.sgst).toBe(72);
    expect(gstRes.body.data.inputTaxCredit.totalEligibleItc).toBe(144);
    expect(gstRes.body.data.netPosition).toBe('ITC_CARRY_FORWARD');
  });

  // ==================== 5. OPERATING EXPENSES (UNPAID != CASH!), INTERNAL TRANSFERS & BANK RECONCILIATION ====================

  it('tracks unpaid approved expenses to 2300 Outstanding Expenses (not Cash), handles internal transfers without inflating Revenue/Expense, and reconciles bank statements', async () => {
    // 1. Owner creates unpaid expense (Salary ₹25,000) -> Credits 2300, Cash stays 0
    const unpaidExp = await request(app)
      .post('/api/v1/expenses')
      .set(headersFor(ownerToken))
      .send({
        categoryAccountId: 'coa_5220',
        vendorName: 'Staff Payroll - May',
        taxableAmount: 25000,
        paymentMode: 'UNPAID',
      });
    expect(unpaidExp.status).toBe(201);
    expect(unpaidExp.body.data.expense.status).toBe('APPROVED_UNPAID');

    let cashBook = await request(app)
      .get('/api/v1/accounting/reports/cash-book')
      .set(headersFor(ownerToken));
    expect(cashBook.body.data.closingBalance).toBe(0);

    let bs = await request(app)
      .get('/api/v1/accounting/reports/balance-sheet')
      .set(headersFor(ownerToken));
    expect(bs.body.data.liabilities.items.find((i: any) => i.code === '2300').balance).toBe(25000);

    // Pay the unpaid expense via Bank Transfer -> clears 2300, reduces Bank by ₹25,000
    const payExp = await request(app)
      .post(`/api/v1/expenses/${unpaidExp.body.data.expense.id}/pay`)
      .set(headersFor(ownerToken))
      .send({ paymentMode: 'BANK_TRANSFER', referenceNumber: 'NEFT-5544' });
    expect(payExp.status).toBe(200);
    expect(payExp.body.data.expense.status).toBe('PAID');

    // 2. Seed Opening Cash ₹10,000 & transfer ₹4,000 Cash -> Main Bank
    await request(app)
      .post('/api/v1/accounting/opening-balances')
      .set(headersFor(ownerToken))
      .send({
        asOfDate: new Date().toISOString().slice(0, 10),
        entries: [{ accountId: 'coa_1100', debit: 10000 }],
        notes: 'Opening counter cash',
      })
      .expect(201);

    const trfRes = await request(app)
      .post('/api/v1/accounting/transfers')
      .set(headersFor(ownerToken))
      .send({
        fromAccountId: 'coa_1100',
        toAccountId: 'coa_1200',
        amount: 4000,
        referenceNumber: 'CASH-DEP-01',
      });
    expect(trfRes.status).toBe(201);

    // Verify transfer does NOT affect P&L income/expense
    const pnl = await request(app)
      .get('/api/v1/accounting/reports/profit-loss')
      .set(headersFor(ownerToken));
    expect(pnl.body.data.summary.totalIncome).toBe(0);
    expect(pnl.body.data.summary.totalOperatingExpenses).toBe(25000);

    cashBook = await request(app)
      .get('/api/v1/accounting/reports/cash-book')
      .set(headersFor(ownerToken));
    expect(cashBook.body.data.closingBalance).toBe(6000);

    // 3. Bank Charge ₹118 + Import Bank Statement & Match
    const chgRes = await request(app)
      .post('/api/v1/accounting/bank-charges')
      .set(headersFor(ownerToken))
      .send({ amount: 118, description: 'Monthly SMS & NEFT Fee' });
    expect(chgRes.status).toBe(201);

    const bankJournalId = chgRes.body.data.journal.id;
    const stmtRes = await request(app)
      .post('/api/v1/accounting/bank-reconciliations')
      .set(headersFor(ownerToken))
      .send({
        bankAccountId: 'bank_main',
        statementDate: new Date().toISOString().slice(0, 10),
        statementBalance: -21118,
        lines: [
          {
            date: new Date().toISOString().slice(0, 10),
            description: 'NEFT SMS CHARGES',
            debit: 118,
            credit: 0,
          },
        ],
      });
    expect(stmtRes.status).toBe(201);
    const reconId = stmtRes.body.data.reconciliation.id;
    const stmtLineId = stmtRes.body.data.reconciliation.lines[0].id;

    const matchRes = await request(app)
      .post(`/api/v1/accounting/bank-reconciliations/${reconId}/match`)
      .set(headersFor(ownerToken))
      .send({ lineId: stmtLineId, journalEntryId: bankJournalId });
    expect(matchRes.status).toBe(200);
    expect(matchRes.body.data.reconciliation.status).toBe('MATCHED');
    expect(matchRes.body.data.reconciliation.matchedCount).toBe(1);
  });

  // ==================== 6. BRANCH P&L, CSV/PDF EXPORT & RECONCILIATION EXCEPTION DETECTOR ====================

  it('isolates branch P&L metrics, exports valid CSV and PDF reports, and detects & backfills historical discrepancies', async () => {
    // Sale in branchMain (₹100 net sale, ₹60 COGS) & Sale in branchWest (₹100 net sale, ₹55 COGS)
    await BillingTransactionService.createSalesInvoice({
      tenantId,
      branchId: branchMain,
      userId: 'owner-1',
      userName: 'Owner',
      customer: { name: 'Main Patient' },
      items: [{ medicineId: 'med-amox', batchId: 'batch-amox-main', quantity: 1 }],
      payments: [{ mode: 'cash', amount: 112 }],
      idempotencyKey: 'br-main-01',
    });

    await BillingTransactionService.createSalesInvoice({
      tenantId,
      branchId: branchWest,
      userId: 'owner-1',
      userName: 'Owner',
      customer: { name: 'West Patient' },
      items: [{ medicineId: 'med-amox', batchId: 'batch-amox-west', quantity: 1 }],
      payments: [{ mode: 'upi', amount: 112 }],
      idempotencyKey: 'br-west-01',
    });

    const branchPnl = await request(app)
      .get('/api/v1/accounting/reports/branch-pnl')
      .set(headersFor(ownerToken));
    expect(branchPnl.status).toBe(200);
    const mainRow = branchPnl.body.data.branches.find((b: any) => b.branchId === branchMain);
    const westRow = branchPnl.body.data.branches.find((b: any) => b.branchId === branchWest);
    expect(mainRow.grossProfit).toBe(40);
    expect(westRow.grossProfit).toBe(45);

    // Export CSV & PDF
    const csvRes = await request(app)
      .get('/api/v1/accounting/reports/export?reportType=trial-balance&format=csv')
      .set(headersFor(ownerToken));
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('Closing Dr');

    const pdfRes = await request(app)
      .get('/api/v1/accounting/reports/export?reportType=profit-loss&format=pdf')
      .set(headersFor(ownerToken));
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(pdfRes.body).toString('utf8').startsWith('%PDF-1.4')).toBe(true);

    // Reconciliation detector reports Inventory GL vs Batch PTR drift cleanly
    const reconRes = await request(app)
      .get('/api/v1/accounting/reconciliation/exceptions')
      .set(headersFor(ownerToken));
    expect(reconRes.status).toBe(200);
    expect(reconRes.body.data.summary.inventoryBatchPtrValuation).toBeGreaterThan(0);

    // Historical backfill endpoint runs idempotently
    const backfillRes = await request(app)
      .post('/api/v1/accounting/reconciliation/backfill')
      .set(headersFor(ownerToken));
    expect(backfillRes.status).toBe(200);
    expect(backfillRes.body.data.postedCount).toBe(0); // Already posted live!
    expect(backfillRes.body.data.skippedCount).toBeGreaterThanOrEqual(2);
  });

  // ==================== 7. SECURITY, RBAC, TENANT ISOLATION & NO PUBLIC JOURNAL POSTING ====================

  it('enforces RBAC, rejects deactivated users, blocks cross-tenant access, and provides zero public journal-posting endpoints', async () => {
    // 1. No public arbitrary journal post endpoint!
    const noPostJournal = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set(headersFor(ownerToken))
      .send({ lines: [] });
    expect(noPostJournal.status).toBe(404);

    // 2. Cashier forbidden from Trial Balance / CoA
    const cashierTb = await request(app)
      .get('/api/v1/accounting/reports/trial-balance')
      .set(headersFor(cashierToken));
    expect(cashierTb.status).toBe(403);

    // 3. Pharmacist can submit expense (becomes SUBMITTED pending approval), cannot approve or view Trial Balance
    const pharmExp = await request(app)
      .post('/api/v1/expenses')
      .set(headersFor(pharmacistToken))
      .send({
        categoryAccountId: 'coa_5260',
        vendorName: 'Packaging Mart',
        taxableAmount: 850,
      });
    expect(pharmExp.status).toBe(201);
    expect(pharmExp.body.data.expense.approvalStatus).toBe('PENDING');
    expect(pharmExp.body.data.expense.status).toBe('SUBMITTED');
    expect(pharmExp.body.data.expense.recognitionJournalId).toBeNull();

    const pharmApprove = await request(app)
      .post(`/api/v1/expenses/${pharmExp.body.data.expense.id}/approve`)
      .set(headersFor(pharmacistToken));
    expect(pharmApprove.status).toBe(403);

    const pharmTb = await request(app)
      .get('/api/v1/accounting/reports/trial-balance')
      .set(headersFor(pharmacistToken));
    expect(pharmTb.status).toBe(403);

    // 4. Auditor has read access to accounting reports/journals/COA/reconciliation, blocked from all mutations
    const audTb = await request(app)
      .get('/api/v1/accounting/reports/trial-balance')
      .set(headersFor(auditorToken));
    expect(audTb.status).toBe(200);

    const audRecon = await request(app)
      .get('/api/v1/accounting/reconciliation/exceptions')
      .set(headersFor(auditorToken));
    expect(audRecon.status).toBe(200);

    const audCreateCoa = await request(app)
      .post('/api/v1/accounting/accounts')
      .set(headersFor(auditorToken))
      .send({ code: '5999', name: 'Hack', category: 'EXPENSES' });
    expect(audCreateCoa.status).toBe(403);

    const audPayExp = await request(app)
      .post(`/api/v1/expenses/${pharmExp.body.data.expense.id}/pay`)
      .set(headersFor(auditorToken))
      .send({ paymentMode: 'CASH' });
    expect(audPayExp.status).toBe(403);

    // 5. Deactivated user blocked
    const deactRes = await request(app)
      .get('/api/v1/accounting/overview')
      .set(headersFor(deactivatedToken));
    expect(deactRes.status).toBe(403);

    // 6. Cross-tenant isolation: owner of another tenant cannot read this tenant's accounting data
    const crossTenant = await request(app)
      .get('/api/v1/expenses')
      .set(headersFor(otherOwnerToken, tenantId));
    expect(crossTenant.status).toBe(403);

    // Other tenant's own expense store has 0 records
    const ownExpenses = await request(app)
      .get('/api/v1/expenses')
      .set(headersFor(otherOwnerToken, otherTenantId, 'main'));
    expect(ownExpenses.status).toBe(200);
    expect(ownExpenses.body.data.count).toBe(0);
  });
});

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import {
  clearTestBranchStatuses,
  clearTestMemberships,
  setTestMembership,
} from '../src/middleware/tenantAuthorization';
import { clearTestMedicines, setTestMedicine } from '../src/services/medicineService';
import {
  clearTestInventory,
  InventoryBatchRecord,
  InventoryService,
  setTestBatch,
  StockMovementRecord,
} from '../src/services/inventoryService';
import { clearTestBilling } from '../src/services/billingTransactionService';
import { clearTestCustomers } from '../src/services/customerService';
import { clearTestAuditLogs } from '../src/services/auditService';
import { clearTestSuppliers } from '../src/services/supplierService';
import { clearTestProcurementData, setTestTenantProfile } from '../src/services/procurementService';
import {
  AccountingService,
  clearTestAccountingData,
} from '../src/services/accountingService';
import { FinancialReportService } from '../src/services/financialReportService';
import {
  BranchService,
  clearTestBranchData,
} from '../src/services/branchService';
import {
  clearTestStockTransfers,
  StockTransferService,
} from '../src/services/stockTransferService';

describe('Phase 10: Multi-Branch Management, Inter-Branch Stock Transfers & Consolidated Reporting', () => {
  let app: Express;
  const tenantId = 'pharma-multibranch-mumbai';
  const otherTenantId = 'pharma-multibranch-pune';

  const ownerToken = 'Bearer test-mock-token:owner-1:owner@pharma.test';
  const mainStaffToken = 'Bearer test-mock-token:staff-main:main@pharma.test';
  const branch2StaffToken = 'Bearer test-mock-token:staff-br2:br2@pharma.test';
  const dualStaffToken = 'Bearer test-mock-token:staff-dual:dual@pharma.test';
  const auditorToken = 'Bearer test-mock-token:auditor-1:auditor@pharma.test';
  const otherOwnerToken = 'Bearer test-mock-token:other-owner:owner@pune.test';

  const headersFor = (token: string, tId = tenantId, bId = 'main', extra?: Record<string, string>) => ({
    Authorization: token,
    'X-Tenant-ID': tId,
    'X-Branch-ID': bId,
    ...(extra || {}),
  });

  const futureDate = (daysAhead: number) =>
    new Date(Date.now() + daysAhead * 86400_000).toISOString().slice(0, 10);

  const pastDate = (daysAgo: number) =>
    new Date(Date.now() - daysAgo * 86400_000).toISOString().slice(0, 10);

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    clearTestMemberships();
    clearTestBranchStatuses();
    clearTestBranchData();
    clearTestStockTransfers();
    clearTestMedicines();
    clearTestInventory();
    clearTestBilling();
    clearTestCustomers();
    clearTestAuditLogs();
    clearTestSuppliers();
    clearTestProcurementData();
    clearTestAccountingData();

    setTestTenantProfile(tenantId, {
      name: 'MedCare Multi-Branch Pharmacy',
      gstin: '27AAECA1234F1Z5',
      state: 'Maharashtra',
      stateCode: '27',
    });

    setTestMembership(tenantId, 'owner-1', {
      tenantId,
      userId: 'owner-1',
      name: 'Dr. Vikram Mehta',
      email: 'owner@pharma.test',
      role: 'owner',
      status: 'active',
      assignedBranchIds: ['main', 'br_opd_02', '*'],
      permissions: ['*'],
    });

    setTestMembership(tenantId, 'staff-main', {
      tenantId,
      userId: 'staff-main',
      name: 'Sunita Deshmukh',
      email: 'main@pharma.test',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: ['main'],
      permissions: [
        'medicines.view',
        'inventory.view',
        'inventory.adjust',
        'billing.view',
        'billing.create',
        'branches.view',
        'stock_transfers.view',
        'stock_transfers.create',
        'stock_transfers.submit',
        'stock_transfers.dispatch',
        'stock_transfers.receive',
        'stock_transfers.cancel',
        'reports.branch.view',
      ],
    });

    setTestMembership(tenantId, 'staff-br2', {
      tenantId,
      userId: 'staff-br2',
      name: 'Rohan Kulkarni',
      email: 'br2@pharma.test',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: ['br_opd_02'],
      permissions: [
        'medicines.view',
        'inventory.view',
        'billing.view',
        'billing.create',
        'branches.view',
        'stock_transfers.view',
        'stock_transfers.create',
        'stock_transfers.submit',
        'stock_transfers.dispatch',
        'stock_transfers.receive',
        'reports.branch.view',
      ],
    });

    setTestMembership(tenantId, 'staff-dual', {
      tenantId,
      userId: 'staff-dual',
      name: 'Ananya Joshi',
      email: 'dual@pharma.test',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: ['main', 'br_opd_02'],
      permissions: [
        'medicines.view',
        'inventory.view',
        'inventory.adjust',
        'billing.view',
        'billing.create',
        'branches.view',
        'branches.update',
        'stock_transfers.view',
        'stock_transfers.create',
        'stock_transfers.submit',
        'stock_transfers.approve',
        'stock_transfers.reject',
        'stock_transfers.dispatch',
        'stock_transfers.receive',
        'stock_transfers.reconcile',
        'stock_transfers.cancel',
        'reports.branch.view',
        'reports.consolidated.view',
      ],
    });

    setTestMembership(tenantId, 'auditor-1', {
      tenantId,
      userId: 'auditor-1',
      name: 'Arvind Iyer',
      email: 'auditor@pharma.test',
      role: 'auditor',
      status: 'active',
      assignedBranchIds: ['main', 'br_opd_02'],
      permissions: [
        'branches.view',
        'branches.view_financials',
        'stock_transfers.view',
        'accounting.view',
        'accounting.accounts.view',
        'accounting.journals.view',
        'accounting.reports.view',
        'reports.branch.view',
        'reports.consolidated.view',
        'reports.consolidated.export',
      ],
    });

    setTestMembership(otherTenantId, 'other-owner', {
      tenantId: otherTenantId,
      userId: 'other-owner',
      role: 'owner',
      status: 'active',
      assignedBranchIds: ['main', '*'],
      permissions: ['*'],
    });

    // Seed 'main' and create 'br_opd_02'
    await BranchService.listBranches(tenantId);
    await BranchService.createBranch(
      tenantId,
      {
        id: 'br_opd_02',
        branchCode: 'OPD2',
        name: 'Dadar OPD Counter',
        branchType: 'HOSPITAL_COUNTER',
        address: 'Shop 4, Dadar TT Hospital Wing',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400014',
        phone: '+91 9820011223',
        email: 'opd2@medcare.in',
        dlNumber20B: 'MH-MZ2-20B-8891',
        dlNumber21B: 'MH-MZ2-21B-8892',
        transferPolicy: {
          requireApproval: true,
          allowSelfApproval: false,
          approvalThresholdAmount: 25000,
          approvalThresholdQty: 500,
          defaultPriceBasis: 'PTR',
        },
      },
      'owner-1'
    );

    // Seed medicines & inventory
    setTestMedicine(tenantId, {
      id: 'med-para',
      tenantId,
      name: 'Dolo 650mg Tablet',
      genericName: 'Paracetamol',
      brand: 'Micro Labs',
      category: 'Analgesics',
      dosageForm: 'Tablet',
      strength: '650mg',
      packSize: '15 Tabs',
      uom: 'Strip',
      hsnCode: '300490',
      gstRate: 12,
      minStockThreshold: 20,
      prescriptionRequired: false,
      status: 'active',
      createdBy: 'owner-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setTestMedicine(tenantId, {
      id: 'med-amox',
      tenantId,
      name: 'Augmentin 625 Duo',
      genericName: 'Amoxycillin + Clavulanic Acid',
      brand: 'GSK',
      category: 'Antibiotics',
      dosageForm: 'Tablet',
      strength: '625mg',
      packSize: '10 Tabs',
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
      id: 'batch-para-main',
      tenantId,
      branchId: 'main',
      medicineId: 'med-para',
      medicineName: 'Dolo 650mg Tablet',
      genericName: 'Paracetamol',
      batchNumber: 'DOLO-26A',
      expiryDate: futureDate(300),
      purchasePrice: 20, // PTR ₹20
      mrp: 35,
      sellingPrice: 32,
      quantityReceived: 100,
      currentStock: 100,
      freeQuantity: 0,
      rackLocation: 'R-A1',
      barcode: '890123450001',
      status: 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setTestBatch(tenantId, {
      id: 'batch-amox-expired',
      tenantId,
      branchId: 'main',
      medicineId: 'med-amox',
      medicineName: 'Augmentin 625 Duo',
      genericName: 'Amoxycillin + Clavulanic Acid',
      batchNumber: 'AUG-EXP',
      expiryDate: pastDate(15),
      purchasePrice: 120,
      mrp: 200,
      sellingPrice: 185,
      quantityReceived: 25,
      currentStock: 25,
      freeQuantity: 0,
      rackLocation: 'R-Q1',
      status: 'expired',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setTestBatch(tenantId, {
      id: 'batch-amox-br2',
      tenantId,
      branchId: 'br_opd_02',
      medicineId: 'med-amox',
      medicineName: 'Augmentin 625 Duo',
      genericName: 'Amoxycillin + Clavulanic Acid',
      batchNumber: 'AUG-BR2',
      expiryDate: futureDate(240),
      purchasePrice: 140,
      mrp: 220,
      sellingPrice: 200,
      quantityReceived: 30,
      currentStock: 30,
      freeQuantity: 0,
      rackLocation: 'OPD-B2',
      status: 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Branch CRUD, Transfer Policies, Lifecycle & Operational Blocking
  // ───────────────────────────────────────────────────────────────────────────

  it('creates branches, rejects duplicate branchCode (409), updates policies, and promotes primary branch', async () => {
    const createRes = await request(app)
      .post('/api/v1/branches')
      .set(headersFor(ownerToken))
      .send({
        branchCode: 'WH01',
        name: 'Andheri Central Warehouse',
        branchType: 'WAREHOUSE',
        address: 'Plot 14, MIDC Andheri East',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400093',
        phone: '+91 9820099887',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.branchCode).toBe('WH01');
    expect(createRes.body.data.status).toBe('ACTIVE');
    const newBranchId = createRes.body.data.id;

    // Duplicate branchCode rejected
    const dupRes = await request(app)
      .post('/api/v1/branches')
      .set(headersFor(ownerToken))
      .send({
        branchCode: 'wh01',
        name: 'Duplicate Code Branch',
        address: 'Some street',
      });
    expect(dupRes.status).toBe(409);

    // Update transfer policy settings
    const settingsRes = await request(app)
      .patch(`/api/v1/branches/${newBranchId}/settings`)
      .set(headersFor(ownerToken))
      .send({
        requireApproval: false,
        allowSelfApproval: true,
        approvalThresholdAmount: 50000,
        operatingHours: '08:00 AM - 08:00 PM',
      });
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.data.transferPolicy.requireApproval).toBe(false);
    expect(settingsRes.body.data.operatingHours).toBe('08:00 AM - 08:00 PM');

    // Promote primary
    const primaryRes = await request(app)
      .post(`/api/v1/branches/${newBranchId}/set-primary`)
      .set(headersFor(ownerToken));
    expect(primaryRes.status).toBe(200);
    expect(primaryRes.body.data.isPrimary).toBe(true);
  });

  it('enforces branch lifecycle suspension/inactivation blocking mutating POS/inventory operations while allowing historical reads', async () => {
    // Suspend br_opd_02
    const suspendRes = await request(app)
      .post('/api/v1/branches/br_opd_02/suspend')
      .set(headersFor(ownerToken))
      .send({ reason: 'Quarterly drug inspector license audit' });
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.data.status).toBe('SUSPENDED');

    // Historical GET reads still succeed on suspended branch
    const invReadRes = await request(app)
      .get('/api/v1/inventory')
      .set(headersFor(ownerToken, tenantId, 'br_opd_02'));
    expect(invReadRes.status).toBe(200);

    // Mutating POS checkout MUST be blocked on SUSPENDED branch
    const posRes = await request(app)
      .post('/api/v1/pos/checkout')
      .set(headersFor(ownerToken, tenantId, 'br_opd_02', { 'Idempotency-Key': 'pos-susp-check-01' }))
      .send({
        customer: { name: 'Walk-in Patient', doctorName: 'Dr. Joshi' },
        items: [{ medicineId: 'med-amox', quantity: 1 }],
        payments: [{ mode: 'cash', amount: 200 }],
      });
    expect(posRes.status).toBe(403);
    expect(String(posRes.body.detail || posRes.body.message)).toMatch(/SUSPENDED/i);

    // Mutating inventory adjustment MUST also be blocked on SUSPENDED branch
    const adjRes = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set(headersFor(ownerToken, tenantId, 'br_opd_02'))
      .send({
        batchId: 'batch-amox-br2',
        quantityChange: -1,
        reason: 'Damaged strip',
      });
    expect(adjRes.status).toBe(403);

    // Reactivate branch and verify POS checkout now succeeds
    const reactivateRes = await request(app)
      .post('/api/v1/branches/br_opd_02/activate')
      .set(headersFor(ownerToken))
      .send({ reason: 'Audit cleared' });
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.status).toBe('ACTIVE');

    const posOkRes = await request(app)
      .post('/api/v1/pos/checkout')
      .set(headersFor(ownerToken, tenantId, 'br_opd_02', { 'Idempotency-Key': 'pos-act-check-01' }))
      .send({
        customer: { name: 'Walk-in Patient', doctorName: 'Dr. Joshi' },
        items: [{ medicineId: 'med-amox', quantity: 1 }],
        payments: [{ mode: 'cash', amount: 200 }],
      });
    expect(posOkRes.status).toBe(201);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Controlled Branch Closure
  // ───────────────────────────────────────────────────────────────────────────

  it('blocks controlled branch closure when stock or pending transfers exist, and allows permanent closure once cleared', async () => {
    // 1. Closure check fails while br_opd_02 still holds stock
    const blockedCheck = await request(app)
      .get('/api/v1/branches/br_opd_02/closure-check')
      .set(headersFor(ownerToken));
    expect(blockedCheck.status).toBe(200);
    expect(blockedCheck.body.data.canClose).toBe(false);
    expect(blockedCheck.body.data.checks.remainingStockUnits).toBe(30);
    expect(blockedCheck.body.data.blockers.length).toBeGreaterThan(0);

    const blockedClose = await request(app)
      .post('/api/v1/branches/br_opd_02/close')
      .set(headersFor(ownerToken))
      .send({ closureNotes: 'Attempt premature closure' });
    expect(blockedClose.status).toBe(409);

    // 2. Transfer all remaining stock from br_opd_02 -> main and receive it
    const trfCreate = await request(app)
      .post('/api/v1/stock-transfers')
      .set(headersFor(ownerToken))
      .send({
        sourceBranchId: 'br_opd_02',
        destinationBranchId: 'main',
        submitImmediately: true,
        items: [{ sourceBatchId: 'batch-amox-br2', requestedQuantity: 30 }],
      });
    expect(trfCreate.status).toBe(201);
    const transferId = trfCreate.body.data.id;

    await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/approve`)
      .set(headersFor(dualStaffToken));

    await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/dispatch`)
      .set(headersFor(branch2StaffToken, tenantId, 'br_opd_02'))
      .send({});

    // Check is STILL blocked while transfer is IN_TRANSIT / not CLOSED
    const inTransitCheck = await request(app)
      .get('/api/v1/branches/br_opd_02/closure-check')
      .set(headersFor(ownerToken));
    expect(inTransitCheck.body.data.canClose).toBe(false);
    expect(inTransitCheck.body.data.checks.pendingTransfersCount).toBeGreaterThan(0);

    const trfItemId = trfCreate.body.data.items[0].id;
    await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/receive`)
      .set(headersFor(mainStaffToken, tenantId, 'main'))
      .send({
        items: [{ itemId: trfItemId, acceptedQuantity: 30 }],
      });

    // 3. Now br_opd_02 has 0 stock and 0 pending transfers -> closure succeeds!
    const clearCheck = await request(app)
      .get('/api/v1/branches/br_opd_02/closure-check')
      .set(headersFor(ownerToken));
    expect(clearCheck.status).toBe(200);
    expect(clearCheck.body.data.canClose).toBe(true);

    const closeRes = await request(app)
      .post('/api/v1/branches/br_opd_02/close')
      .set(headersFor(ownerToken))
      .send({ closureNotes: 'Lease ended; stock consolidated into Main Counter.' });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.status).toBe('CLOSED');

    // Closed branch cannot be reopened or used for operations
    const reopenRes = await request(app)
      .post('/api/v1/branches/br_opd_02/activate')
      .set(headersFor(ownerToken));
    expect(reopenRes.status).toBe(400);

    const opOnClosed = await request(app)
      .post('/api/v1/pos/checkout')
      .set(headersFor(ownerToken, tenantId, 'br_opd_02', { 'Idempotency-Key': 'pos-closed-check-01' }))
      .send({
        customer: { name: 'Walk-in Patient' },
        items: [{ medicineId: 'med-amox', quantity: 1 }],
        payments: [{ mode: 'cash', amount: 200 }],
      });
    expect(opOnClosed.status).toBe(403);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Cross-Tenant Isolation & Staff Branch RBAC Enforcement
  // ───────────────────────────────────────────────────────────────────────────

  it('enforces cross-tenant isolation, staff branch access, and cannot remove last branch from employee', async () => {
    // Tenant B cannot read Tenant A branches or transfers
    const crossListRes = await request(app)
      .get('/api/v1/branches/br_opd_02')
      .set(headersFor(otherOwnerToken, otherTenantId, 'main'));
    expect(crossListRes.status).toBe(404);

    // staff-main cannot access br_opd_02 operations
    const unauthBranchRes = await request(app)
      .get('/api/v1/branches/br_opd_02')
      .set(headersFor(mainStaffToken, tenantId, 'main'));
    expect(unauthBranchRes.status).toBe(403);

    // Cannot remove the only assigned branch from staff-main
    const removeLastRes = await request(app)
      .delete('/api/v1/branches/main/employees/staff-main')
      .set(headersFor(ownerToken));
    expect(removeLastRes.status).toBe(400);

    // Assign staff-main to br_opd_02, then verify they can read br_opd_02
    const assignRes = await request(app)
      .post('/api/v1/branches/br_opd_02/employees')
      .set(headersFor(ownerToken))
      .send({ userId: 'staff-main' });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.assignedBranchIds).toContain('br_opd_02');

    const nowAllowed = await request(app)
      .get('/api/v1/branches/br_opd_02')
      .set(headersFor(mainStaffToken, tenantId, 'br_opd_02'));
    expect(nowAllowed.status).toBe(200);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Stock Transfer Security: Expired Batch, Self-Approval, Destination-Only Receive
  // ───────────────────────────────────────────────────────────────────────────

  it('blocks expired batches, insufficient stock, self-approval when disallowed, and unauthorized branch dispatch/receipt', async () => {
    // Reject expired batch
    const expiredRes = await request(app)
      .post('/api/v1/stock-transfers')
      .set(headersFor(mainStaffToken, tenantId, 'main'))
      .send({
        sourceBranchId: 'main',
        destinationBranchId: 'br_opd_02',
        items: [{ sourceBatchId: 'batch-amox-expired', requestedQuantity: 5 }],
      });
    expect(expiredRes.status).toBe(400);
    expect(String(expiredRes.body.detail || expiredRes.body.message)).toMatch(/expired/i);

    // Reject insufficient stock
    const overStockRes = await request(app)
      .post('/api/v1/stock-transfers')
      .set(headersFor(mainStaffToken, tenantId, 'main'))
      .send({
        sourceBranchId: 'main',
        destinationBranchId: 'br_opd_02',
        items: [{ sourceBatchId: 'batch-para-main', requestedQuantity: 500 }],
      });
    expect(overStockRes.status).toBe(400);

    // Enforce strict approval on main (0 threshold -> all transfers require manual approval)
    await request(app)
      .patch('/api/v1/branches/main/settings')
      .set(headersFor(ownerToken))
      .send({
        requireApproval: true,
        allowSelfApproval: false,
        approvalThresholdAmount: 0,
        approvalThresholdQty: 0,
      });

    // Dual-branch staff creates & submits transfer, then tries to self-approve -> blocked!
    const trfRes = await request(app)
      .post('/api/v1/stock-transfers')
      .set(headersFor(dualStaffToken, tenantId, 'main'))
      .send({
        sourceBranchId: 'main',
        destinationBranchId: 'br_opd_02',
        submitImmediately: true,
        items: [{ sourceBatchId: 'batch-para-main', requestedQuantity: 20 }],
      });
    expect(trfRes.status).toBe(201);
    expect(trfRes.body.data.status).toBe('PENDING_APPROVAL');
    const trfId = trfRes.body.data.id;
    const itemId = trfRes.body.data.items[0].id;

    const selfApproveRes = await request(app)
      .post(`/api/v1/stock-transfers/${trfId}/approve`)
      .set(headersFor(dualStaffToken, tenantId, 'main'));
    expect(selfApproveRes.status).toBe(403);
    expect(String(selfApproveRes.body.detail || selfApproveRes.body.message)).toMatch(/Self-approval/i);

    // Owner (different user) approves it
    const approveRes = await request(app)
      .post(`/api/v1/stock-transfers/${trfId}/approve`)
      .set(headersFor(ownerToken));
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    // Destination-only staff (br_opd_02) CANNOT dispatch source (main) stock
    const wrongDispatcherRes = await request(app)
      .post(`/api/v1/stock-transfers/${trfId}/dispatch`)
      .set(headersFor(branch2StaffToken, tenantId, 'br_opd_02'))
      .send({});
    expect(wrongDispatcherRes.status).toBe(403);

    // Source staff dispatches
    const dispatchRes = await request(app)
      .post(`/api/v1/stock-transfers/${trfId}/dispatch`)
      .set(headersFor(mainStaffToken, tenantId, 'main'))
      .send({});
    expect(dispatchRes.status).toBe(200);

    // Source-only staff (main) CANNOT receive destination (br_opd_02) stock
    const wrongReceiverRes = await request(app)
      .post(`/api/v1/stock-transfers/${trfId}/receive`)
      .set(headersFor(mainStaffToken, tenantId, 'main'))
      .send({ items: [{ itemId, acceptedQuantity: 20 }] });
    expect(wrongReceiverRes.status).toBe(403);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Partial Dispatch, Partial Receipt, Discrepancy Reconciliation & GL Posting
  // ───────────────────────────────────────────────────────────────────────────

  it('handles partial dispatch, partial receipt, damaged/missing shrinkage GL posting, and destination batch metadata preservation', async () => {
    // Create & approve transfer for 40 strips of Dolo 650 (PTR ₹20 = ₹800)
    const createRes = await request(app)
      .post('/api/v1/stock-transfers')
      .set(headersFor(mainStaffToken, tenantId, 'main'))
      .send({
        sourceBranchId: 'main',
        destinationBranchId: 'br_opd_02',
        submitImmediately: true,
        notes: 'Weekly OPD stock replenishment',
        items: [{ sourceBatchId: 'batch-para-main', requestedQuantity: 40 }],
      });
    expect(createRes.status).toBe(201);
    const transferId = createRes.body.data.id;
    const itemId = createRes.body.data.items[0].id;

    await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/approve`)
      .set(headersFor(ownerToken));

    // Dispatch 30 of 40 strips (₹600 PTR)
    const dispatchRes = await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/dispatch`)
      .set(headersFor(mainStaffToken, tenantId, 'main', { 'X-Idempotency-Key': 'disp-k1' }))
      .send({
        items: [{ itemId, dispatchQuantity: 30 }],
        vehicleNumber: 'MH-01-XY-9088',
      });
    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.data.status).toBe('IN_TRANSIT');
    expect(dispatchRes.body.data.totalDispatchedQuantity).toBe(30);
    expect(dispatchRes.body.data.dispatchJournalEntryIds.length).toBe(1);

    // Source batch reduced from 100 -> 70
    const mainBatchAfterDispatch = await InventoryService.getBatch(tenantId, 'batch-para-main');
    expect(mainBatchAfterDispatch.currentStock).toBe(70);

    // Verify GL Dispatch entry: Dr 1450 Stock in Transit ₹600, Cr 1400 Inventory ₹600; ZERO Revenue/COGS/GST
    const dispatchJournal = await AccountingService.getJournalEntryById(
      tenantId,
      dispatchRes.body.data.dispatchJournalEntryIds[0]
    );
    expect(dispatchJournal.lines.some((l) => l.accountCode === '1450' && l.debit === 600)).toBe(true);
    expect(dispatchJournal.lines.some((l) => l.accountCode === '1400' && l.credit === 600)).toBe(true);
    expect(dispatchJournal.lines.some((l) => ['4100', '5100', '2210', '2220', '2230'].includes(l.accountCode))).toBe(false);

    // Receiving more than pending dispatched quantity MUST be rejected
    const overReceiveRes = await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/receive`)
      .set(headersFor(branch2StaffToken, tenantId, 'br_opd_02'))
      .send({
        items: [{ itemId, acceptedQuantity: 35 }],
      });
    expect(overReceiveRes.status).toBe(400);

    // Discrepancy without reason MUST be rejected
    const missingReasonRes = await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/receive`)
      .set(headersFor(branch2StaffToken, tenantId, 'br_opd_02'))
      .send({
        items: [{ itemId, acceptedQuantity: 25, damagedQuantity: 2, missingQuantity: 3 }],
      });
    expect(missingReasonRes.status).toBe(400);
    expect(String(missingReasonRes.body.detail || missingReasonRes.body.message)).toMatch(/reason/i);

    // Partial receive #1: accept 18 good strips (remaining 12 still in transit)
    const rec1Res = await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/receive`)
      .set(headersFor(branch2StaffToken, tenantId, 'br_opd_02', { 'X-Idempotency-Key': 'rec-k1' }))
      .send({
        items: [{ itemId, acceptedQuantity: 18, rackLocation: 'OPD-R1' }],
      });
    expect(rec1Res.status).toBe(200);
    expect(rec1Res.body.data.status).toBe('PARTIALLY_RECEIVED');
    expect(rec1Res.body.data.totalReceivedQuantity).toBe(18);

    // Partial receive #2: accept 10 good + 1 damaged + 1 missing (total 12 -> matches 30 dispatched)
    const rec2Res = await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/receive`)
      .set(headersFor(branch2StaffToken, tenantId, 'br_opd_02', { 'X-Idempotency-Key': 'rec-k2' }))
      .send({
        items: [
          {
            itemId,
            acceptedQuantity: 10,
            damagedQuantity: 1,
            missingQuantity: 1,
            discrepancyReason: '2 strips crushed in outer carton during transit',
          },
        ],
      });
    expect(rec2Res.status).toBe(200);
    expect(rec2Res.body.data.status).toBe('RECEIVED');
    expect(rec2Res.body.data.totalReceivedQuantity).toBe(28);
    expect(rec2Res.body.data.totalDamagedQuantity).toBe(1);
    expect(rec2Res.body.data.totalMissingQuantity).toBe(1);
    expect(rec2Res.body.data.shrinkagePtrValuation).toBe(40); // 2 * ₹20 = ₹40

    // Destination batch created in br_opd_02 with 28 units & exact batch/PTR/MRP metadata
    const br2InventoryRes = await InventoryService.listBatches(tenantId, { branchId: 'br_opd_02', limit: 100 });
    const destDolo = br2InventoryRes.batches.find(
      (b: InventoryBatchRecord) => b.medicineId === 'med-para' && b.batchNumber === 'DOLO-26A'
    );
    expect(destDolo).toBeDefined();
    expect(destDolo!.currentStock).toBe(28);
    expect(destDolo!.purchasePrice).toBe(20);
    expect(destDolo!.mrp).toBe(35);

    // Second receipt GL entry: Dr 1400 Inventory ₹200 (10*20), Dr 5280 Shrinkage ₹40 (2*20), Cr 1450 Stock in Transit ₹240
    const rec2JournalId = rec2Res.body.data.receiveJournalEntryIds[1];
    const rec2Journal = await AccountingService.getJournalEntryById(tenantId, rec2JournalId);
    expect(rec2Journal.lines.some((l) => l.accountCode === '1400' && l.debit === 200)).toBe(true);
    expect(rec2Journal.lines.some((l) => l.accountCode === '5280' && l.debit === 40)).toBe(true);
    expect(rec2Journal.lines.some((l) => l.accountCode === '1450' && l.credit === 240)).toBe(true);

    // Net 1450 Stock in Transit balance after all 30 units received/written-off MUST be ₹0
    const tb = await FinancialReportService.getTrialBalance(tenantId);
    const transitAcct = tb.rows.find((r) => r.code === '1450');
    expect(transitAcct?.netBalance).toBe(0);

    // Verify STOCK_TRANSFER_OUT & STOCK_TRANSFER_IN stock movements were recorded
    const mainMovements = await InventoryService.listMovements(tenantId, { branchId: 'main', limit: 50 });
    expect(
      mainMovements.some(
        (m: StockMovementRecord) => m.movementType === 'STOCK_TRANSFER_OUT' && m.quantityChange === -30
      )
    ).toBe(true);
    const br2Movements = await InventoryService.listMovements(tenantId, { branchId: 'br_opd_02', limit: 50 });
    expect(
      br2Movements
        .filter((m: StockMovementRecord) => m.movementType === 'STOCK_TRANSFER_IN')
        .reduce((s: number, m: StockMovementRecord) => s + m.quantityChange, 0)
    ).toBe(28);

    // Reconcile & Close transfer
    const reconcileRes = await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/reconcile`)
      .set(headersFor(dualStaffToken))
      .send({
        resolutionNotes: 'Transit shrinkage approved and closed after courier report.',
      });
    expect(reconcileRes.status).toBe(200);
    expect(reconcileRes.body.data.status).toBe('CLOSED');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Idempotency & Concurrent Bidirectional Transfer Locking
  // ───────────────────────────────────────────────────────────────────────────

  it('prevents duplicate deductions on idempotent dispatch/receive retries and executes concurrent bidirectional transfers without negative stock', async () => {
    const t1Res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(headersFor(ownerToken))
      .send({
        sourceBranchId: 'main',
        destinationBranchId: 'br_opd_02',
        submitImmediately: true,
        items: [{ sourceBatchId: 'batch-para-main', requestedQuantity: 15 }],
      });
    const t1Id = t1Res.body.data.id;
    const t1ItemId = t1Res.body.data.items[0].id;
    await request(app).post(`/api/v1/stock-transfers/${t1Id}/approve`).set(headersFor(dualStaffToken));

    // Same idempotency key retried in parallel
    const [d1, d2] = await Promise.all([
      request(app)
        .post(`/api/v1/stock-transfers/${t1Id}/dispatch`)
        .set(headersFor(ownerToken, tenantId, 'main', { 'X-Idempotency-Key': 'idem-disp-1' }))
        .send({}),
      request(app)
        .post(`/api/v1/stock-transfers/${t1Id}/dispatch`)
        .set(headersFor(ownerToken, tenantId, 'main', { 'X-Idempotency-Key': 'idem-disp-1' }))
        .send({}),
    ]);
    expect(d1.status).toBe(200);
    expect(d2.status).toBe(200);

    const batchAfter = await InventoryService.getBatch(tenantId, 'batch-para-main');
    expect(batchAfter.currentStock).toBe(85); // Deducted once, not twice

    // Concurrent reverse transfer br_opd_02 -> main while receiving t1
    const t2Res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(headersFor(ownerToken))
      .send({
        sourceBranchId: 'br_opd_02',
        destinationBranchId: 'main',
        submitImmediately: true,
        items: [{ sourceBatchId: 'batch-amox-br2', requestedQuantity: 10 }],
      });
    const t2Id = t2Res.body.data.id;
    await request(app).post(`/api/v1/stock-transfers/${t2Id}/approve`).set(headersFor(dualStaffToken));

    const [recT1, dispT2] = await Promise.all([
      request(app)
        .post(`/api/v1/stock-transfers/${t1Id}/receive`)
        .set(headersFor(ownerToken, tenantId, 'br_opd_02', { 'X-Idempotency-Key': 'idem-rec-1' }))
        .send({ items: [{ itemId: t1ItemId, acceptedQuantity: 15 }] }),
      request(app)
        .post(`/api/v1/stock-transfers/${t2Id}/dispatch`)
        .set(headersFor(ownerToken, tenantId, 'br_opd_02', { 'X-Idempotency-Key': 'idem-disp-2' }))
        .send({}),
    ]);
    expect(recT1.status).toBe(200);
    expect(dispT2.status).toBe(200);

    const amoxBr2 = await InventoryService.getBatch(tenantId, 'batch-amox-br2');
    expect(amoxBr2.currentStock).toBe(20);
    expect(amoxBr2.currentStock).toBeGreaterThanOrEqual(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Consolidated vs Branch Reporting & Exports
  // ───────────────────────────────────────────────────────────────────────────

  it('computes accurate branch comparison and consolidated overview with inter-branch transfer elimination, plus CSV & PDF exports', async () => {
    // Sale in main: 5 Dolo @ ₹32 = ₹160
    const saleMain = await request(app)
      .post('/api/v1/pos/checkout')
      .set(headersFor(ownerToken, tenantId, 'main', { 'Idempotency-Key': 'pos-sale-main-01' }))
      .send({
        customer: { name: 'Walk-in Patient' },
        items: [{ medicineId: 'med-para', quantity: 5 }],
        payments: [{ mode: 'cash', amount: 160 }],
      });
    expect(saleMain.status).toBe(201);

    // Sale in br_opd_02: 2 Augmentin @ ₹200 = ₹400
    const saleBr2 = await request(app)
      .post('/api/v1/pos/checkout')
      .set(headersFor(ownerToken, tenantId, 'br_opd_02', { 'Idempotency-Key': 'pos-sale-br2-01' }))
      .send({
        customer: { name: 'OPD Patient', doctorName: 'Dr. Kulkarni' },
        items: [{ medicineId: 'med-amox', quantity: 2 }],
        payments: [{ mode: 'upi', amount: 400 }],
      });
    expect(saleBr2.status).toBe(201);

    // Inter-branch transfer of 20 Dolo (PTR ₹400) dispatched from main -> in transit to br_opd_02
    const trf = await StockTransferService.createTransfer(
      tenantId,
      {
        sourceBranchId: 'main',
        destinationBranchId: 'br_opd_02',
        submitImmediately: true,
        items: [{ sourceBatchId: 'batch-para-main', requestedQuantity: 20 }],
      },
      'owner-1',
      'owner',
      ['*']
    );
    if (trf.status !== 'APPROVED') {
      await StockTransferService.approveTransfer(tenantId, trf.id, 'staff-dual', 'pharmacist');
    }
    await StockTransferService.dispatchTransfer(tenantId, trf.id, {}, 'owner-1', 'owner', ['*']);

    // Fetch Branch Comparison report
    const compRes = await request(app)
      .get('/api/v1/reports/consolidated/branch-comparison')
      .set(headersFor(auditorToken));
    expect(compRes.status).toBe(200);
    expect(compRes.body.data.branches.length).toBe(2);

    const mainRow = compRes.body.data.branches.find((b: { branchId: string }) => b.branchId === 'main');
    const br2Row = compRes.body.data.branches.find((b: { branchId: string }) => b.branchId === 'br_opd_02');
    expect(mainRow.posGrossSales).toBe(160);
    expect(br2Row.posGrossSales).toBe(400);
    expect(mainRow.outboundTransferCount).toBe(1);
    expect(br2Row.inboundTransferCount).toBe(1);

    // Fetch Consolidated Overview
    const overviewRes = await request(app)
      .get('/api/v1/reports/consolidated/overview')
      .set(headersFor(auditorToken));
    expect(overviewRes.status).toBe(200);
    const ov = overviewRes.body.data;
    expect(ov.branchTotals.posGrossSales).toBe(560);
    expect(ov.interBranchEliminations.totalInterBranchTransferVolumePtr).toBe(400);
    expect(ov.interBranchEliminations.stockInTransitGlValue).toBe(400);
    expect(ov.interBranchEliminations.interBranchRevenueRecognized).toBe(0);
    expect(ov.consolidatedFinancials.isTrialBalanceBalanced).toBe(true);
    expect(ov.consolidatedFinancials.isBalanceSheetBalanced).toBe(true);

    // Branch-scoped report endpoint
    const branchSalesRes = await request(app)
      .get('/api/v1/branches/br_opd_02/reports/sales')
      .set(headersFor(branch2StaffToken, tenantId, 'br_opd_02'));
    expect(branchSalesRes.status).toBe(200);
    expect(branchSalesRes.body.data.summary.grossSales).toBe(400);

    // CSV & PDF exports
    const csvRes = await request(app)
      .get('/api/v1/reports/consolidated/export?type=branch-comparison&format=csv')
      .set(headersFor(auditorToken));
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('OPD2');

    const pdfRes = await request(app)
      .get('/api/v1/reports/consolidated/export?type=consolidated-summary&format=pdf')
      .set(headersFor(auditorToken));
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(pdfRes.body).toString('utf8')).toContain('%PDF-1.4');
  });
});

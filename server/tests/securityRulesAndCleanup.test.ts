import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('Phase 6 Security Policy Verification & PostgreSQL Cleanup Guard', () => {
  it('verifies package.json and bun.lock contain zero PostgreSQL or SQL ORM dependencies', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };

    const prohibited = ['pg', '@types/pg', 'postgres', 'prisma', '@prisma/client', 'drizzle-orm', 'typeorm', 'knex'];
    for (const dep of prohibited) {
      expect(allDeps[dep]).toBeUndefined();
    }

    const bunLockPath = path.join(repoRoot, 'bun.lock');
    if (fs.existsSync(bunLockPath)) {
      const lockRaw = fs.readFileSync(bunLockPath, 'utf-8');
      expect(lockRaw).not.toMatch(/"pg"|"postgres"|"@types\/pg"|"drizzle-orm"|"prisma"/);
    }
  });

  it('verifies firestore.rules enforces default deny and blocks all direct client writes to financial, stock, counter, and audit collections', () => {
    const rules = fs.readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf-8');

    // Default deny present
    expect(rules).toContain('match /{document=**}');
    expect(rules).toContain('allow read, write: if false;');

    // Tenant active status check + explicit non-empty branch access
    expect(rules).toContain('function isTenantActive(tenantId)');
    expect(rules).toContain('assignedBranchIds.size() > 0');
    expect(rules).not.toContain("'*' in getMembership(tenantId).data.assignedBranchIds");
    expect(rules).not.toContain('permissionOverrides.granted');

    // Critical collections must strictly deny client writes (Admin SDK only)
    const writeProtectedBlocks = [
      'match /memberships/{userId}',
      'match /invitations/{invitationId}',
      'match /inventory_batches/{batchId}',
      'match /stock_movements/{movementId}',
      'match /sales_invoices/{invoiceId}',
      'match /payments/{paymentId}',
      'match /returns/{returnId}',
      'match /customers/{customerId}',
      'match /suppliers/{supplierId}',
      'match /audit_logs/{logId}',
    ];

    for (const block of writeProtectedBlocks) {
      const idx = rules.indexOf(block);
      expect(idx).toBeGreaterThan(-1);
      const snippet = rules.slice(idx, idx + 220);
      expect(snippet).toContain('allow write: if false;');
    }

    // Internal system collections must deny both client reads and writes
    for (const internalBlock of ['match /idempotency_keys/{keyId}', 'match /counters/{counterId}']) {
      const idx = rules.indexOf(internalBlock);
      expect(idx).toBeGreaterThan(-1);
      const snippet = rules.slice(idx, idx + 150);
      expect(snippet).toContain('allow read, write: if false;');
    }
  });

  it('verifies storage.rules enforces active tenant, explicit branch access, 15MB limit, and safe content types', () => {
    const rules = fs.readFileSync(path.join(repoRoot, 'storage.rules'), 'utf-8');

    expect(rules).toContain('function isTenantActive(tenantId)');
    expect(rules).toContain('assignedBranchIds.size() > 0');
    expect(rules).not.toContain("'*' in getMembership(tenantId).data.assignedBranchIds");
    expect(rules).toContain('request.resource.size < 15 * 1024 * 1024');
    expect(rules).toContain("request.resource.contentType == 'application/pdf'");
  });

  it('verifies composite Firestore indexes exist for FEFO branch checkout and invoice status queries', () => {
    const indexesRaw = fs.readFileSync(path.join(repoRoot, 'firestore.indexes.json'), 'utf-8');
    const indexes = JSON.parse(indexesRaw).indexes as Array<{
      collectionGroup: string;
      fields: Array<{ fieldPath: string; order: string }>;
    }>;

    const hasFefoIndex = indexes.some(
      (idx) =>
        idx.collectionGroup === 'inventory_batches' &&
        idx.fields.map((f) => f.fieldPath).join(',') === 'branchId,medicineId,expiryDate'
    );
    expect(hasFefoIndex).toBe(true);

    const hasInvoiceBranchStatusIndex = indexes.some(
      (idx) =>
        idx.collectionGroup === 'sales_invoices' &&
        idx.fields.map((f) => f.fieldPath).join(',') === 'branchId,status,createdAt'
    );
    expect(hasInvoiceBranchStatusIndex).toBe(true);

    // Phase 7 Customer & Khata indexes
    const hasCustomerInvoicesIndex = indexes.some(
      (idx) =>
        idx.collectionGroup === 'sales_invoices' &&
        idx.fields.map((f) => f.fieldPath).join(',') === 'customerId,createdAt'
    );
    expect(hasCustomerInvoicesIndex).toBe(true);

    const hasOverdueIndex = indexes.some(
      (idx) =>
        idx.collectionGroup === 'sales_invoices' &&
        idx.fields.map((f) => f.fieldPath).join(',') === 'branchId,paymentStatus,dueDate'
    );
    expect(hasOverdueIndex).toBe(true);

    const hasNormalizedPhoneIndex = indexes.some(
      (idx) =>
        idx.collectionGroup === 'customers' &&
        idx.fields.map((f) => f.fieldPath).join(',') === 'normalizedPhone,isArchived'
    );
    expect(hasNormalizedPhoneIndex).toBe(true);
  });

  it('verifies Phase 7 customers ledger and payments subcollections in firestore.rules require customers.khata_view and block all client writes', () => {
    const rules = fs.readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf-8');
    const ledgerIdx = rules.indexOf('match /ledger/{entryId}');
    expect(ledgerIdx).toBeGreaterThan(-1);
    const ledgerSnippet = rules.slice(ledgerIdx, ledgerIdx + 220);
    expect(ledgerSnippet).toContain("hasPermission(tenantId, 'customers.khata_view')");
    expect(ledgerSnippet).toContain('allow write: if false;');
  });

  it('verifies Phase 8 procurement collections block client writes and protect internal purchaseOperations', () => {
    const rules = fs.readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf-8');

    const phase8WriteProtected = [
      'match /purchaseOrders/{purchaseOrderId}',
      'match /goodsReceipts/{grnId}',
      'match /supplierInvoices/{invoiceId}',
      'match /supplierPayments/{paymentId}',
      'match /supplierReturns/{returnId}',
    ];

    for (const block of phase8WriteProtected) {
      const idx = rules.indexOf(block);
      expect(idx).toBeGreaterThan(-1);
      const snippet = rules.slice(idx, idx + 280);
      expect(snippet).toContain('allow write: if false;');
    }

    const opIdx = rules.indexOf('match /purchaseOperations/{operationId}');
    expect(opIdx).toBeGreaterThan(-1);
    const opSnippet = rules.slice(opIdx, opIdx + 150);
    expect(opSnippet).toContain('allow read, write: if false;');
  });

  it('verifies composite Firestore indexes exist for Phase 8 suppliers, POs, GRNs, invoices, payments, and returns', () => {
    const indexesRaw = fs.readFileSync(path.join(repoRoot, 'firestore.indexes.json'), 'utf-8');
    const indexes = JSON.parse(indexesRaw).indexes as Array<{
      collectionGroup: string;
      fields: Array<{ fieldPath: string; order: string }>;
    }>;

    const requiredCompositeIndexes = [
      { group: 'suppliers', fields: 'status,tradeName' },
      { group: 'suppliers', fields: 'isArchived,currentOutstandingBalance' },
      { group: 'purchaseOrders', fields: 'branchId,status,orderDate' },
      { group: 'purchaseOrders', fields: 'supplierId,orderDate' },
      { group: 'goodsReceipts', fields: 'branchId,receivedAt' },
      { group: 'goodsReceipts', fields: 'supplierId,receivedAt' },
      { group: 'supplierInvoices', fields: 'paymentStatus,dueDate' },
      { group: 'supplierInvoices', fields: 'supplierId,invoiceDate' },
      { group: 'supplierPayments', fields: 'supplierId,paymentDate' },
      { group: 'supplierReturns', fields: 'supplierId,createdAt' },
      { group: 'supplierReturns', fields: 'branchId,createdAt' },
    ];

    for (const req of requiredCompositeIndexes) {
      const found = indexes.some(
        (idx) =>
          idx.collectionGroup === req.group &&
          idx.fields.map((f) => f.fieldPath).join(',') === req.fields
      );
      expect(found).toBe(true);
    }
  });

  it('verifies Phase 9 accounting collections block all direct client writes and lock internal accountingOperations', () => {
    const rules = fs.readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf-8');

    const phase9WriteProtected = [
      'match /chartOfAccounts/{accountId}',
      'match /journalEntries/{entryId}',
      'match /financialPeriods/{periodId}',
      'match /bankAccounts/{bankAccountId}',
      'match /cashAccounts/{cashAccountId}',
      'match /expenses/{expenseId}',
      'match /bankReconciliations/{reconciliationId}',
      'match /openingBalanceBatches/{batchId}',
    ];

    for (const block of phase9WriteProtected) {
      const idx = rules.indexOf(block);
      expect(idx).toBeGreaterThan(-1);
      const snippet = rules.slice(idx, idx + 320);
      expect(snippet).toContain('allow write: if false;');
    }

    const opIdx = rules.indexOf('match /accountingOperations/{operationId}');
    expect(opIdx).toBeGreaterThan(-1);
    const opSnippet = rules.slice(opIdx, opIdx + 150);
    expect(opSnippet).toContain('allow read, write: if false;');
  });

  it('verifies composite Firestore indexes exist for Phase 9 journal entries, lines, expenses, and periods', () => {
    const indexesRaw = fs.readFileSync(path.join(repoRoot, 'firestore.indexes.json'), 'utf-8');
    const indexes = JSON.parse(indexesRaw).indexes as Array<{
      collectionGroup: string;
      fields: Array<{ fieldPath: string; order: string }>;
    }>;

    const requiredPhase9Indexes = [
      { group: 'chartOfAccounts', fields: 'category,code' },
      { group: 'journalEntries', fields: 'transactionDate,createdAt' },
      { group: 'journalEntries', fields: 'branchId,transactionDate' },
      { group: 'journalEntries', fields: 'referenceType,referenceId' },
      { group: 'journalEntries', fields: 'periodId,transactionDate' },
      { group: 'lines', fields: 'accountId,transactionDate' },
      { group: 'expenses', fields: 'branchId,expenseDate' },
      { group: 'expenses', fields: 'status,expenseDate' },
      { group: 'financialPeriods', fields: 'status,startDate' },
      { group: 'bankReconciliations', fields: 'bankAccountId,statementDate' },
    ];

    for (const req of requiredPhase9Indexes) {
      const found = indexes.some(
        (idx) =>
          idx.collectionGroup === req.group &&
          idx.fields.map((f) => f.fieldPath).join(',') === req.fields
      );
      expect(found).toBe(true);
    }
  });
});


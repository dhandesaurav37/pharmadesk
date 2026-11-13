import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { asyncHandler } from '../lib/asyncHandler';
import { ForbiddenError } from '../lib/errors';
import { AccountingService, AccountCategory } from '../services/accountingService';
import { FinancialReportService } from '../services/financialReportService';

export const accountingRouter = Router({ mergeParams: true });

const tenantAuth = [firebaseAuthMiddleware, tenantAuthorizationMiddleware];

function assertBranchAccess(req: Request, targetBranchId: string): void {
  const { role, assignedBranchIds } = req.tenantContext!;
  if (
    role !== 'owner' &&
    !assignedBranchIds.includes('*') &&
    !assignedBranchIds.includes(targetBranchId)
  ) {
    throw new ForbiddenError(`Access denied for branch '${targetBranchId}'.`);
  }
}

function resolveBranchScope(req: Request): string {
  const { role, branchId, assignedBranchIds } = req.tenantContext!;
  const requested = (req.query.branchId as string | undefined)?.trim();
  if (!requested || requested.toUpperCase() === 'ALL') {
    if (role === 'owner' || assignedBranchIds.includes('*')) return 'ALL';
    return branchId || assignedBranchIds[0] || 'main';
  }
  assertBranchAccess(req, requested);
  return requested;
}

function extractIdempotencyKey(req: Request): string | undefined {
  const raw =
    (req.headers['x-idempotency-key'] as string) ||
    (req.headers['idempotency-key'] as string) ||
    (req.body?.idempotencyKey as string | undefined);
  return raw ? String(raw).trim() : undefined;
}

const createAccountSchema = z.object({
  code: z.string().trim().min(3).max(20),
  name: z.string().trim().min(2).max(120),
  category: z.enum(['ASSETS', 'LIABILITIES', 'EQUITY', 'INCOME', 'EXPENSES']),
  subType: z.string().trim().max(40).optional(),
  normalBalance: z.enum(['DEBIT', 'CREDIT']).optional(),
  parentAccountId: z.string().trim().nullable().optional(),
  description: z.string().trim().max(300).optional(),
});

const updateAccountSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
  parentAccountId: z.string().trim().nullable().optional(),
});

const reverseJournalSchema = z.object({
  reason: z.string().trim().min(4).max(400),
  reversalDate: z.string().trim().optional(),
});

const openingBalanceSchema = z.object({
  branchId: z.string().trim().optional(),
  asOfDate: z.string().trim().min(8),
  entries: z
    .array(
      z.object({
        accountId: z.string().trim().min(1),
        debit: z.number().finite().min(0).optional(),
        credit: z.number().finite().min(0).optional(),
        description: z.string().trim().max(200).optional(),
      })
    )
    .min(1)
    .max(100),
  notes: z.string().trim().max(400).optional(),
});

const createBankAccountSchema = z.object({
  branchId: z.string().trim().optional(),
  accountName: z.string().trim().min(2).max(100),
  bankName: z.string().trim().min(2).max(100),
  branchName: z.string().trim().max(100).optional(),
  ifscCode: z.string().trim().max(20).optional(),
  accountNumberLast4: z.string().trim().min(4).max(20),
  openingBalance: z.number().finite().min(0).optional(),
  openingBalanceDate: z.string().trim().optional(),
});

const internalTransferSchema = z.object({
  branchId: z.string().trim().optional(),
  fromAccountId: z.string().trim().min(1),
  toAccountId: z.string().trim().min(1),
  amount: z.number().finite().positive(),
  transferDate: z.string().trim().optional(),
  referenceNumber: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().optional(),
});

const bankChargeSchema = z.object({
  branchId: z.string().trim().optional(),
  bankLedgerAccountId: z.string().trim().optional(),
  amount: z.number().finite().positive(),
  chargeDate: z.string().trim().optional(),
  description: z.string().trim().min(2).max(200),
  referenceNumber: z.string().trim().max(80).optional(),
  idempotencyKey: z.string().trim().optional(),
});

const bankStatementImportSchema = z.object({
  bankAccountId: z.string().trim().min(1),
  statementDate: z.string().trim().min(8),
  statementBalance: z.number().finite(),
  lines: z
    .array(
      z.object({
        date: z.string().trim().min(8),
        description: z.string().trim().min(1).max(300),
        reference: z.string().trim().max(100).optional(),
        debit: z.number().finite().min(0).optional(),
        credit: z.number().finite().min(0).optional(),
      })
    )
    .max(500),
});

const matchStatementLineSchema = z.object({
  lineId: z.string().trim().min(1),
  journalEntryId: z.string().trim().min(1),
});

const closePeriodSchema = z.object({
  notes: z.string().trim().max(400).optional(),
});

const reopenPeriodSchema = z.object({
  reason: z.string().trim().min(5).max(400),
});

// ==================== OVERVIEW ====================

accountingRouter.get(
  '/overview',
  ...tenantAuth,
  requirePermission('accounting.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchScope(req);
    const data = await FinancialReportService.getOverviewMetrics(req.tenantContext!.tenantId, {
      branchId,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

// ==================== CHART OF ACCOUNTS ====================

accountingRouter.get(
  '/accounts',
  ...tenantAuth,
  requirePermission('accounting.accounts.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const accounts = await AccountingService.listAccounts(req.tenantContext!.tenantId, {
      category: req.query.category as AccountCategory | undefined,
      includeInactive: req.query.includeInactive === 'true',
    });
    res.status(200).json({ success: true, data: { accounts, count: accounts.length } });
  })
);

accountingRouter.post(
  '/accounts',
  ...tenantAuth,
  requirePermission('accounting.accounts.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = createAccountSchema.parse(req.body);
    const account = await AccountingService.createAccount(
      req.tenantContext!.tenantId,
      body,
      req.tenantContext!.userId
    );
    res.status(201).json({ success: true, data: { account } });
  })
);

accountingRouter.patch(
  '/accounts/:accountId',
  ...tenantAuth,
  requirePermission('accounting.accounts.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = updateAccountSchema.parse(req.body);
    const account = await AccountingService.updateAccount(
      req.tenantContext!.tenantId,
      String(req.params.accountId),
      body,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: { account } });
  })
);

accountingRouter.delete(
  '/accounts/:accountId',
  ...tenantAuth,
  requirePermission('accounting.accounts.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    await AccountingService.deleteAccount(
      req.tenantContext!.tenantId,
      String(req.params.accountId),
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, message: 'Account deleted' });
  })
);

accountingRouter.get(
  '/accounts/:accountId/ledger',
  ...tenantAuth,
  requirePermission('accounting.accounts.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchScope(req);
    const data = await FinancialReportService.getAccountLedger(
      req.tenantContext!.tenantId,
      String(req.params.accountId),
      {
        branchId,
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
      }
    );
    res.status(200).json({ success: true, data });
  })
);

// ==================== JOURNAL ENTRIES (NO ARBITRARY PUBLIC CREATE!) ====================

accountingRouter.get(
  '/journal-entries',
  ...tenantAuth,
  requirePermission('accounting.journals.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchScope(req);
    const entries = await AccountingService.listJournalEntries(req.tenantContext!.tenantId, {
      branchId,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      accountId: req.query.accountId as string | undefined,
      entryType: req.query.entryType as any,
      status: req.query.status as any,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : 200,
    });
    res.status(200).json({ success: true, data: { entries, count: entries.length } });
  })
);

accountingRouter.get(
  '/journal-entries/:entryId',
  ...tenantAuth,
  requirePermission('accounting.journals.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const entry = await AccountingService.getJournalEntryById(
      req.tenantContext!.tenantId,
      String(req.params.entryId)
    );
    if (entry.branchId !== 'ALL') {
      assertBranchAccess(req, entry.branchId);
    }
    res.status(200).json({ success: true, data: { entry } });
  })
);

accountingRouter.post(
  '/journal-entries/:entryId/reverse',
  ...tenantAuth,
  requirePermission('accounting.journals.reverse'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = reverseJournalSchema.parse(req.body);
    const result = await AccountingService.reverseJournalEntry(
      req.tenantContext!.tenantId,
      String(req.params.entryId),
      body.reason,
      req.tenantContext!.userId,
      body.reversalDate
    );
    res.status(201).json({ success: true, data: result });
  })
);

// ==================== OPENING BALANCES ====================

accountingRouter.post(
  '/opening-balances',
  ...tenantAuth,
  requirePermission('accounting.opening_balances.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = openingBalanceSchema.parse(req.body);
    const targetBranch = body.branchId || req.tenantContext!.branchId || 'main';
    assertBranchAccess(req, targetBranch);
    const result = await AccountingService.postOpeningBalances(
      req.tenantContext!.tenantId,
      { ...body, branchId: targetBranch },
      req.tenantContext!.userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// ==================== CASH & BANK ACCOUNTS + TRANSFERS + BANK RECONCILIATION ====================

accountingRouter.get(
  '/cash-bank',
  ...tenantAuth,
  requirePermission('accounting.cash_bank.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const accounts = await AccountingService.listCashAndBankAccounts(req.tenantContext!.tenantId);
    const reconciliations = await AccountingService.listBankReconciliations(req.tenantContext!.tenantId);
    res.status(200).json({ success: true, data: { ...accounts, reconciliations } });
  })
);

accountingRouter.post(
  '/bank-accounts',
  ...tenantAuth,
  requirePermission('accounting.cash_bank.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = createBankAccountSchema.parse(req.body);
    const targetBranch = body.branchId || req.tenantContext!.branchId || 'main';
    assertBranchAccess(req, targetBranch);
    const bankAccount = await AccountingService.createBankAccount(
      req.tenantContext!.tenantId,
      { ...body, branchId: targetBranch },
      req.tenantContext!.userId
    );
    res.status(201).json({ success: true, data: { bankAccount } });
  })
);

accountingRouter.post(
  '/transfers',
  ...tenantAuth,
  requirePermission('accounting.cash_bank.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = internalTransferSchema.parse(req.body);
    const targetBranch = body.branchId || req.tenantContext!.branchId || 'main';
    assertBranchAccess(req, targetBranch);
    const result = await AccountingService.recordInternalTransfer(
      req.tenantContext!.tenantId,
      {
        ...body,
        branchId: targetBranch,
        transferDate: body.transferDate || new Date().toISOString().slice(0, 10),
        idempotencyKey: extractIdempotencyKey(req) || body.idempotencyKey,
      },
      req.tenantContext!.userId
    );
    res.status(result.replayed ? 200 : 201).json({ success: true, data: result });
  })
);

accountingRouter.post(
  '/bank-charges',
  ...tenantAuth,
  requirePermission('accounting.cash_bank.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = bankChargeSchema.parse(req.body);
    const targetBranch = body.branchId || req.tenantContext!.branchId || 'main';
    assertBranchAccess(req, targetBranch);
    const result = await AccountingService.recordBankCharge(
      req.tenantContext!.tenantId,
      {
        ...body,
        branchId: targetBranch,
        chargeDate: body.chargeDate || new Date().toISOString().slice(0, 10),
        idempotencyKey: extractIdempotencyKey(req) || body.idempotencyKey,
      },
      req.tenantContext!.userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

accountingRouter.post(
  '/bank-reconciliations',
  ...tenantAuth,
  requirePermission('accounting.bank_reconciliation.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = bankStatementImportSchema.parse(req.body);
    const reconciliation = await AccountingService.importBankStatement(
      req.tenantContext!.tenantId,
      body,
      req.tenantContext!.userId
    );
    res.status(201).json({ success: true, data: { reconciliation } });
  })
);

accountingRouter.post(
  '/bank-reconciliations/:reconciliationId/match',
  ...tenantAuth,
  requirePermission('accounting.bank_reconciliation.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = matchStatementLineSchema.parse(req.body);
    const reconciliation = await AccountingService.matchBankStatementLine(
      req.tenantContext!.tenantId,
      String(req.params.reconciliationId),
      body.lineId,
      body.journalEntryId,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: { reconciliation } });
  })
);

// ==================== FINANCIAL PERIODS ====================

accountingRouter.get(
  '/periods',
  ...tenantAuth,
  requirePermission('accounting.periods.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const periods = await AccountingService.listFinancialPeriods(req.tenantContext!.tenantId);
    res.status(200).json({ success: true, data: { periods } });
  })
);

accountingRouter.post(
  '/periods/:periodId/close',
  ...tenantAuth,
  requirePermission('accounting.periods.close'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = closePeriodSchema.parse(req.body || {});
    const period = await AccountingService.closeFinancialPeriod(
      req.tenantContext!.tenantId,
      String(req.params.periodId),
      req.tenantContext!.userId,
      body.notes
    );
    res.status(200).json({ success: true, data: { period } });
  })
);

accountingRouter.post(
  '/periods/:periodId/reopen',
  ...tenantAuth,
  requirePermission('accounting.periods.reopen'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = reopenPeriodSchema.parse(req.body);
    const period = await AccountingService.reopenFinancialPeriod(
      req.tenantContext!.tenantId,
      String(req.params.periodId),
      body.reason,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: { period } });
  })
);

// ==================== FINANCIAL STATEMENTS & BOOKS ====================

accountingRouter.get(
  '/reports/trial-balance',
  ...tenantAuth,
  requirePermission('accounting.reports.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await FinancialReportService.getTrialBalance(req.tenantContext!.tenantId, {
      branchId: resolveBranchScope(req),
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

accountingRouter.get(
  '/reports/profit-loss',
  ...tenantAuth,
  requirePermission('accounting.reports.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await FinancialReportService.getProfitAndLoss(req.tenantContext!.tenantId, {
      branchId: resolveBranchScope(req),
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

accountingRouter.get(
  '/reports/branch-pnl',
  ...tenantAuth,
  requirePermission('accounting.reports.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { role, assignedBranchIds } = req.tenantContext!;
    if (role !== 'owner' && !assignedBranchIds.includes('*')) {
      const requested = resolveBranchScope(req);
      const data = await FinancialReportService.getBranchWiseProfitAndLoss(req.tenantContext!.tenantId, {
        branchId: requested,
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
      });
      res.status(200).json({
        success: true,
        data: {
          ...data,
          branches: data.branches.filter((b) => assignedBranchIds.includes(b.branchId)),
        },
      });
      return;
    }
    const data = await FinancialReportService.getBranchWiseProfitAndLoss(req.tenantContext!.tenantId, {
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

accountingRouter.get(
  '/reports/balance-sheet',
  ...tenantAuth,
  requirePermission('accounting.reports.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await FinancialReportService.getBalanceSheet(req.tenantContext!.tenantId, {
      branchId: resolveBranchScope(req),
      asOfDate: req.query.asOfDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

accountingRouter.get(
  '/reports/cash-flow',
  ...tenantAuth,
  requirePermission('accounting.reports.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await FinancialReportService.getCashFlowStatement(req.tenantContext!.tenantId, {
      branchId: resolveBranchScope(req),
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

accountingRouter.get(
  '/reports/general-ledger',
  ...tenantAuth,
  requirePermission('accounting.reports.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await FinancialReportService.getGeneralLedgerOrDayBook(req.tenantContext!.tenantId, {
      branchId: resolveBranchScope(req),
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      accountId: req.query.accountId as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

accountingRouter.get(
  '/reports/day-book',
  ...tenantAuth,
  requirePermission('accounting.reports.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await FinancialReportService.getGeneralLedgerOrDayBook(req.tenantContext!.tenantId, {
      branchId: resolveBranchScope(req),
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

accountingRouter.get(
  '/reports/cash-book',
  ...tenantAuth,
  requirePermission('accounting.reports.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await FinancialReportService.getCashOrBankBook(
      req.tenantContext!.tenantId,
      'CASH',
      {
        branchId: resolveBranchScope(req),
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
      }
    );
    res.status(200).json({ success: true, data });
  })
);

accountingRouter.get(
  '/reports/bank-book',
  ...tenantAuth,
  requirePermission('accounting.reports.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await FinancialReportService.getCashOrBankBook(
      req.tenantContext!.tenantId,
      'BANK',
      {
        branchId: resolveBranchScope(req),
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
      }
    );
    res.status(200).json({ success: true, data });
  })
);

accountingRouter.get(
  '/reports/gst-summary',
  ...tenantAuth,
  requirePermission('accounting.reports.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await FinancialReportService.getGstSummary(req.tenantContext!.tenantId, {
      branchId: resolveBranchScope(req),
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

accountingRouter.get(
  '/reports/expenses',
  ...tenantAuth,
  requirePermission('accounting.reports.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await FinancialReportService.getExpenseSummary(req.tenantContext!.tenantId, {
      branchId: resolveBranchScope(req),
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

accountingRouter.get(
  '/reports/export',
  ...tenantAuth,
  requirePermission('accounting.reports.export'),
  asyncHandler(async (req: Request, res: Response) => {
    const reportType = (req.query.reportType as any) || 'trial-balance';
    const format = req.query.format === 'pdf' ? 'pdf' : 'csv';
    const exported = await FinancialReportService.exportReport(
      req.tenantContext!.tenantId,
      reportType,
      format,
      {
        branchId: resolveBranchScope(req),
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
        asOfDate: req.query.asOfDate as string | undefined,
      }
    );
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    res.status(200).send(exported.body);
  })
);

// ==================== RECONCILIATION & DISCREPANCY DETECTOR + BACKFILL ====================

accountingRouter.get(
  '/reconciliation/exceptions',
  ...tenantAuth,
  requirePermission('accounting.audit.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await FinancialReportService.runReconciliationCheck(req.tenantContext!.tenantId);
    res.status(200).json({ success: true, data });
  })
);

accountingRouter.post(
  '/reconciliation/backfill',
  ...tenantAuth,
  requirePermission('accounting.reconciliation.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await AccountingService.backfillHistoricalTransactions(
      req.tenantContext!.tenantId,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: result });
  })
);

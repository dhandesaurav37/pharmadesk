import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { asyncHandler } from '../lib/asyncHandler';
import { ForbiddenError } from '../lib/errors';
import { AccountingService, ExpenseRecord } from '../services/accountingService';

export const expenseRouter = Router({ mergeParams: true });

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

const createExpenseSchema = z.object({
  branchId: z.string().trim().optional(),
  expenseDate: z.string().trim().optional(),
  categoryAccountId: z.string().trim().min(1),
  vendorName: z.string().trim().min(2).max(160),
  vendorGstin: z.string().trim().max(20).optional(),
  invoiceNumber: z.string().trim().max(60).optional(),
  taxableAmount: z.number().finite().positive(),
  cgst: z.number().finite().min(0).optional(),
  sgst: z.number().finite().min(0).optional(),
  igst: z.number().finite().min(0).optional(),
  itcEligible: z.boolean().optional(),
  paymentMode: z.enum(['UNPAID', 'CASH', 'BANK_TRANSFER', 'UPI', 'CARD']).optional(),
  paymentAccountId: z.string().trim().optional(),
  paymentReference: z.string().trim().max(80).optional(),
  receiptAttachmentPath: z.string().trim().max(400).optional(),
  notes: z.string().trim().max(500).optional(),
  autoApprove: z.boolean().optional(),
});

const payExpenseSchema = z.object({
  paymentMode: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD']),
  paymentAccountId: z.string().trim().optional(),
  paymentDate: z.string().trim().optional(),
  referenceNumber: z.string().trim().max(80).optional(),
});

const reverseExpenseSchema = z.object({
  reason: z.string().trim().min(4).max(300),
});

expenseRouter.get(
  '/',
  ...tenantAuth,
  requirePermission('accounting.expenses.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchScope(req);
    const expenses = await AccountingService.listExpenses(req.tenantContext!.tenantId, {
      branchId,
      status: req.query.status as ExpenseRecord['status'] | undefined,
      categoryAccountId: req.query.categoryAccountId as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data: { expenses, count: expenses.length } });
  })
);

expenseRouter.post(
  '/',
  ...tenantAuth,
  requirePermission('accounting.expenses.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = createExpenseSchema.parse(req.body);
    const targetBranch = body.branchId || req.tenantContext!.branchId || 'main';
    assertBranchAccess(req, targetBranch);

    const role = req.tenantContext!.role;
    const canApprove =
      role === 'owner' || req.tenantContext!.permissions.includes('accounting.expenses.approve');
    const autoApprove = body.autoApprove === false ? false : canApprove;

    // Non-approvers submit pending expenses unless autoApprove explicitly skipped
    const paymentMode = autoApprove ? body.paymentMode || 'UNPAID' : 'UNPAID';

    const expense = await AccountingService.createExpense(
      req.tenantContext!.tenantId,
      {
        ...body,
        branchId: targetBranch,
        expenseDate: body.expenseDate || new Date().toISOString().slice(0, 10),
        paymentMode,
        autoApprove,
      },
      req.tenantContext!.userId
    );
    res.status(201).json({ success: true, data: { expense } });
  })
);

expenseRouter.post(
  '/:expenseId/approve',
  ...tenantAuth,
  requirePermission('accounting.expenses.approve'),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await AccountingService.getExpenseById(
      req.tenantContext!.tenantId,
      String(req.params.expenseId)
    );
    assertBranchAccess(req, existing.branchId);
    const expense = await AccountingService.approveExpense(
      req.tenantContext!.tenantId,
      existing.id,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: { expense } });
  })
);

expenseRouter.post(
  '/:expenseId/pay',
  ...tenantAuth,
  requirePermission('accounting.expenses.pay'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = payExpenseSchema.parse(req.body);
    const existing = await AccountingService.getExpenseById(
      req.tenantContext!.tenantId,
      String(req.params.expenseId)
    );
    assertBranchAccess(req, existing.branchId);
    const expense = await AccountingService.payExpense(
      req.tenantContext!.tenantId,
      existing.id,
      body,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: { expense } });
  })
);

expenseRouter.post(
  '/:expenseId/reverse',
  ...tenantAuth,
  requirePermission('accounting.expenses.approve'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = reverseExpenseSchema.parse(req.body);
    const existing = await AccountingService.getExpenseById(
      req.tenantContext!.tenantId,
      String(req.params.expenseId)
    );
    assertBranchAccess(req, existing.branchId);
    const expense = await AccountingService.reverseExpense(
      req.tenantContext!.tenantId,
      existing.id,
      body.reason,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: { expense } });
  })
);

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { asyncHandler } from '../lib/asyncHandler';
import { BranchService } from '../services/branchService';
import { FinancialReportService } from '../services/financialReportService';
import { ForbiddenError } from '../lib/errors';

export const branchRouter = Router({ mergeParams: true });

const tenantAuth = [firebaseAuthMiddleware, tenantAuthorizationMiddleware];

function assertBranchReadAccess(req: Request, branchId: string): void {
  const { role, assignedBranchIds } = req.tenantContext!;
  if (role === 'owner' || assignedBranchIds.includes('*')) return;
  if (!assignedBranchIds.includes(branchId)) {
    throw new ForbiddenError(`Access denied for branch '${branchId}'.`);
  }
}

const createBranchSchema = z.object({
  id: z.string().trim().min(2).max(64).optional(),
  branchCode: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(160),
  branchType: z.enum(['MAIN', 'RETAIL', 'WAREHOUSE', 'CLINIC', 'HOSPITAL_COUNTER']).optional(),
  address: z.string().trim().min(2).max(300),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(12).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().or(z.literal('')).optional(),
  gstin: z.string().trim().max(20).nullable().optional(),
  dlNumber20B: z.string().trim().max(60).nullable().optional(),
  dlNumber21B: z.string().trim().max(60).nullable().optional(),
  managerUserId: z.string().trim().nullable().optional(),
  managerName: z.string().trim().nullable().optional(),
  operatingHours: z.string().trim().max(120).nullable().optional(),
  timezone: z.string().trim().max(60).optional(),
  isPrimary: z.boolean().optional(),
  transferPolicy: z
    .object({
      requireApproval: z.boolean().optional(),
      allowSelfApproval: z.boolean().optional(),
      approvalThresholdAmount: z.number().min(0).optional(),
      approvalThresholdQty: z.number().int().min(0).optional(),
      defaultPriceBasis: z.enum(['PTR', 'SELLING']).optional(),
    })
    .optional(),
});

const updateBranchSchema = createBranchSchema.partial();

const branchSettingsSchema = z.object({
  operatingHours: z.string().trim().max(120).optional(),
  timezone: z.string().trim().max(60).optional(),
  requireApproval: z.boolean().optional(),
  allowSelfApproval: z.boolean().optional(),
  approvalThresholdAmount: z.number().min(0).optional(),
  approvalThresholdQty: z.number().int().min(0).optional(),
  defaultPriceBasis: z.enum(['PTR', 'SELLING']).optional(),
});

const assignEmployeeSchema = z.object({
  userId: z.string().trim().min(1, 'User ID is required'),
});

const closeBranchSchema = z.object({
  closureNotes: z.string().trim().max(500).optional(),
});

// Workspace switcher bootstrap endpoint: lists only branches user is authorized to access
branchRouter.get(
  '/authorized',
  ...tenantAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, role, assignedBranchIds } = req.tenantContext!;
    const branches = await BranchService.listAuthorizedBranches(tenantId, role, assignedBranchIds);
    res.status(200).json({
      success: true,
      data: branches,
    });
  })
);

// List all branches (owner/consolidation viewers see all; branch staff see authorized)
branchRouter.get(
  '/',
  ...tenantAuth,
  requirePermission('branches.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, role, assignedBranchIds } = req.tenantContext!;
    const status = req.query.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'CLOSED' | undefined;
    const includeClosed = req.query.includeClosed !== 'false';

    let branches = await BranchService.listBranches(tenantId, { status, includeClosed });
    if (role !== 'owner' && !assignedBranchIds.includes('*')) {
      const allowed = new Set(assignedBranchIds);
      branches = branches.filter((b) => allowed.has(b.id));
    }

    res.status(200).json({
      success: true,
      data: branches,
    });
  })
);

// Create a new branch
branchRouter.post(
  '/',
  ...tenantAuth,
  requirePermission('branches.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const input = createBranchSchema.parse(req.body);
    const branch = await BranchService.createBranch(tenantId, input, userId);

    res.status(201).json({
      success: true,
      message: `Branch '${branch.name}' (${branch.branchCode}) created successfully`,
      data: branch,
    });
  })
);

// Branch Audit Logs
branchRouter.get(
  '/audit-logs',
  ...tenantAuth,
  requirePermission('branches.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, role, assignedBranchIds } = req.tenantContext!;
    const qBranchId = (req.query.branchId as string | undefined)?.trim();
    if (qBranchId) {
      assertBranchReadAccess(req, qBranchId);
    }
    let logs = await BranchService.listBranchAuditLogs(tenantId, qBranchId, Number(req.query.limit || 100));
    if (role !== 'owner' && !assignedBranchIds.includes('*')) {
      const allowed = new Set(assignedBranchIds);
      logs = logs.filter((l) => allowed.has(l.branchId));
    }
    res.status(200).json({ success: true, data: logs });
  })
);

// Get single branch profile
branchRouter.get(
  '/:branchId',
  ...tenantAuth,
  requirePermission('branches.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    assertBranchReadAccess(req, branchId);
    const branch = await BranchService.getBranchById(tenantId, branchId);
    res.status(200).json({ success: true, data: branch });
  })
);

// Update branch profile
branchRouter.patch(
  '/:branchId',
  ...tenantAuth,
  requirePermission('branches.update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    assertBranchReadAccess(req, branchId);
    const input = updateBranchSchema.parse(req.body);
    const branch = await BranchService.updateBranch(tenantId, branchId, input, userId);
    res.status(200).json({ success: true, data: branch });
  })
);

// Update branch settings / transfer policy
branchRouter.patch(
  '/:branchId/settings',
  ...tenantAuth,
  requirePermission('branches.manage_settings'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    assertBranchReadAccess(req, branchId);
    const input = branchSettingsSchema.parse(req.body);
    const branch = await BranchService.updateBranchSettings(tenantId, branchId, input, userId);
    res.status(200).json({ success: true, data: branch });
  })
);

// Promote branch to primary
branchRouter.post(
  '/:branchId/set-primary',
  ...tenantAuth,
  requirePermission('branches.update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    const branch = await BranchService.setPrimaryBranch(tenantId, branchId, userId);
    res.status(200).json({ success: true, data: branch });
  })
);

// Lifecycle transitions
branchRouter.post(
  '/:branchId/activate',
  ...tenantAuth,
  requirePermission('branches.activate'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    const branch = await BranchService.changeBranchStatus(tenantId, branchId, 'ACTIVE', userId, req.body?.reason);
    res.status(200).json({ success: true, data: branch });
  })
);

branchRouter.post(
  '/:branchId/deactivate',
  ...tenantAuth,
  requirePermission('branches.deactivate'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    const branch = await BranchService.changeBranchStatus(tenantId, branchId, 'INACTIVE', userId, req.body?.reason);
    res.status(200).json({ success: true, data: branch });
  })
);

branchRouter.post(
  '/:branchId/suspend',
  ...tenantAuth,
  requirePermission('branches.suspend'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    const branch = await BranchService.changeBranchStatus(tenantId, branchId, 'SUSPENDED', userId, req.body?.reason);
    res.status(200).json({ success: true, data: branch });
  })
);

// Controlled Branch Closure Readiness Check & Close
branchRouter.get(
  '/:branchId/closure-check',
  ...tenantAuth,
  requirePermission('branches.close'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    const readiness = await BranchService.checkBranchClosureReadiness(tenantId, branchId);
    res.status(200).json({ success: true, data: readiness });
  })
);

branchRouter.post(
  '/:branchId/close',
  ...tenantAuth,
  requirePermission('branches.close'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    const { closureNotes } = closeBranchSchema.parse(req.body || {});
    const result = await BranchService.closeBranch(tenantId, branchId, userId, closureNotes);
    res.status(200).json({
      success: true,
      message: `Branch '${result.branch.name}' permanently closed after verification`,
      data: result.branch,
      readiness: result.readiness,
    });
  })
);

// Branch Staff Assignments
branchRouter.get(
  '/:branchId/employees',
  ...tenantAuth,
  requirePermission('employees.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    assertBranchReadAccess(req, branchId);
    const staff = await BranchService.listBranchEmployees(tenantId, branchId);
    res.status(200).json({ success: true, data: staff });
  })
);

branchRouter.post(
  '/:branchId/employees',
  ...tenantAuth,
  requirePermission('branches.manage_employees'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    const { userId: targetUserId } = assignEmployeeSchema.parse(req.body);
    const member = await BranchService.assignEmployeeToBranch(tenantId, branchId, targetUserId, userId);
    res.status(200).json({ success: true, data: member });
  })
);

branchRouter.delete(
  '/:branchId/employees/:targetUserId',
  ...tenantAuth,
  requirePermission('branches.manage_employees'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    const targetUserId = String(req.params.targetUserId || '');
    const member = await BranchService.removeEmployeeFromBranch(tenantId, branchId, targetUserId, userId);
    res.status(200).json({ success: true, data: member });
  })
);

// Branch-Specific Reports
branchRouter.get(
  '/:branchId/reports/sales',
  ...tenantAuth,
  requirePermission('reports.branch.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    assertBranchReadAccess(req, branchId);
    const data = await FinancialReportService.getBranchSalesReport(tenantId, branchId, {
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

branchRouter.get(
  '/:branchId/reports/inventory',
  ...tenantAuth,
  requirePermission('reports.branch.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    assertBranchReadAccess(req, branchId);
    const data = await FinancialReportService.getBranchInventoryReport(tenantId, branchId);
    res.status(200).json({ success: true, data });
  })
);

branchRouter.get(
  '/:branchId/reports/financials',
  ...tenantAuth,
  requirePermission('branches.view_financials'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const branchId = String(req.params.branchId || '');
    assertBranchReadAccess(req, branchId);
    const data = await FinancialReportService.getBranchFinancialSummary(tenantId, branchId, {
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

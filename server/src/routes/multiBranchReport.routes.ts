import { Router, Request, Response } from 'express';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { asyncHandler } from '../lib/asyncHandler';
import { FinancialReportService } from '../services/financialReportService';

export const multiBranchReportRouter = Router({ mergeParams: true });

const tenantAuth = [firebaseAuthMiddleware, tenantAuthorizationMiddleware];

multiBranchReportRouter.get(
  '/consolidated/overview',
  ...tenantAuth,
  requirePermission('reports.consolidated.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const data = await FinancialReportService.getConsolidatedOverviewReport(tenantId, {
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

multiBranchReportRouter.get(
  '/consolidated/branch-comparison',
  ...tenantAuth,
  requirePermission('reports.consolidated.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const data = await FinancialReportService.getBranchComparisonReport(tenantId, {
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.status(200).json({ success: true, data });
  })
);

multiBranchReportRouter.get(
  '/consolidated/export',
  ...tenantAuth,
  requirePermission('reports.consolidated.export'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const reportType =
      (req.query.type as 'branch-comparison' | 'consolidated-summary') || 'consolidated-summary';
    const format = (req.query.format as 'csv' | 'pdf') || 'csv';
    const exported = await FinancialReportService.exportReport(tenantId, reportType, format, {
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    res.status(200).send(exported.body);
  })
);

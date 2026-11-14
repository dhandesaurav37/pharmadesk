import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { asyncHandler } from '../lib/asyncHandler';
import { AuditService } from '../services/auditService';
import { SecurityGovernanceService } from '../services/securityGovernanceService';

export const securityRouter = Router({ mergeParams: true });

const tenantAuth = [firebaseAuthMiddleware, tenantAuthorizationMiddleware];

const retentionPolicySchema = z.object({
  taxInvoiceYears: z.number().int().min(6).max(10),
  prescriptionYears: z.number().int().min(3).max(10),
  auditLogDays: z.number().int().min(365).max(3650),
  supplierRecordYears: z.number().int().min(6).max(10),
  dpdpExportTtlMinutes: z.number().int().min(5).max(60),
  legalHoldEnabled: z.boolean().optional().default(false),
  notes: z.string().trim().max(500).optional(),
});

const dpdpExportSchema = z.object({
  reason: z.string().trim().min(5, 'Export audit reason must be at least 5 characters').max(400),
  includeClinicalPhi: z.boolean().optional().default(false),
});

const drDrillSchema = z.object({
  drillType: z
    .enum(['INTEGRITY_CHECK', 'BACKUP_READINESS_AUDIT', 'RESTORE_SIMULATION'])
    .default('INTEGRITY_CHECK'),
  notes: z.string().trim().max(500).optional(),
});

securityRouter.get(
  '/posture',
  ...tenantAuth,
  requirePermission('security.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const posture = await SecurityGovernanceService.getSecurityPosture(
      req.tenantContext!.tenantId
    );
    res.status(200).json({ success: true, data: posture });
  })
);

securityRouter.get(
  '/audit-logs',
  ...tenantAuth,
  requirePermission('audit.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, role, assignedBranchIds } = req.tenantContext!;
    const requestedBranch = (req.query.branchId as string | undefined)?.trim();

    let scopedBranch: string | undefined = requestedBranch;
    if (role !== 'owner' && !assignedBranchIds.includes('*')) {
      scopedBranch =
        requestedBranch && assignedBranchIds.includes(requestedBranch)
          ? requestedBranch
          : assignedBranchIds[0];
    }

    const logs = await AuditService.queryLogs(tenantId, {
      action: req.query.action as string | undefined,
      branchId: scopedBranch,
      actingUserId: req.query.actingUserId as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });

    res.status(200).json({
      success: true,
      data: {
        logs,
        count: logs.length,
      },
    });
  })
);

securityRouter.get(
  '/retention-policy',
  ...tenantAuth,
  requirePermission('security.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const policy = await SecurityGovernanceService.getRetentionPolicy(
      req.tenantContext!.tenantId
    );
    res.status(200).json({ success: true, data: { policy } });
  })
);

securityRouter.put(
  '/retention-policy',
  ...tenantAuth,
  requirePermission('retention.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = retentionPolicySchema.parse(req.body);
    const policy = await SecurityGovernanceService.updateRetentionPolicy(
      req.tenantContext!.tenantId,
      parsed,
      req.tenantContext!.userId
    );
    res.status(200).json({
      success: true,
      message: 'Statutory data retention policy updated',
      data: { policy },
    });
  })
);

securityRouter.get(
  '/dpdp-exports',
  ...tenantAuth,
  requirePermission('security.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const exportsList = await SecurityGovernanceService.listDpdpExports(
      req.tenantContext!.tenantId
    );
    res.status(200).json({ success: true, data: { exports: exportsList } });
  })
);

securityRouter.post(
  '/dpdp-export',
  ...tenantAuth,
  requirePermission('security.dpdp_export'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = dpdpExportSchema.parse(req.body);
    const ctx = req.tenantContext!;
    const result = await SecurityGovernanceService.generateDpdpExport(
      ctx.tenantId,
      parsed,
      ctx.userId,
      {
        role: ctx.role,
        permissions: ctx.permissions,
        assignedBranchIds: ctx.assignedBranchIds,
      }
    );
    res.status(201).json({
      success: true,
      message: `DPDP tenant data portability export ${result.manifest.id} generated`,
      data: result,
    });
  })
);

securityRouter.get(
  '/dr-status',
  ...tenantAuth,
  requirePermission('security.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const status = await SecurityGovernanceService.getDrStatus(
      req.tenantContext!.tenantId
    );
    res.status(200).json({ success: true, data: status });
  })
);

securityRouter.post(
  '/dr-drills',
  ...tenantAuth,
  requirePermission('security.dr_manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = drDrillSchema.parse(req.body || {});
    const drill = await SecurityGovernanceService.recordDrDrill(
      req.tenantContext!.tenantId,
      parsed,
      req.tenantContext!.userId
    );
    res.status(201).json({
      success: true,
      message: `Disaster recovery verification drill ${drill.id} recorded (${drill.status})`,
      data: { drill },
    });
  })
);

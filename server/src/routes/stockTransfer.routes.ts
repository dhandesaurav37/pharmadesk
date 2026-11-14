import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { asyncHandler } from '../lib/asyncHandler';
import { StockTransferService, StockTransferStatus } from '../services/stockTransferService';
import { ForbiddenError } from '../lib/errors';

export const stockTransferRouter = Router({ mergeParams: true });

const tenantAuth = [firebaseAuthMiddleware, tenantAuthorizationMiddleware];

function extractIdempotencyKey(req: Request): string | undefined {
  const raw =
    (req.headers['x-idempotency-key'] as string) ||
    (req.headers['idempotency-key'] as string) ||
    (req.body?.idempotencyKey as string | undefined);
  return raw ? String(raw).trim() : undefined;
}

async function assertTransferBranchParticipant(
  req: Request,
  tenantId: string,
  transferId: string
): Promise<void> {
  const { role, assignedBranchIds } = req.tenantContext!;
  if (role === 'owner' || assignedBranchIds.includes('*')) {
    return;
  }
  const transfer = await StockTransferService.getTransferById(tenantId, transferId);
  if (
    !assignedBranchIds.includes(transfer.sourceBranchId) &&
    !assignedBranchIds.includes(transfer.destinationBranchId)
  ) {
    throw new ForbiddenError('You do not have branch access to modify this inter-branch stock transfer.');
  }
}

const createTransferSchema = z.object({
  sourceBranchId: z.string().trim().min(1),
  destinationBranchId: z.string().trim().min(1),
  notes: z.string().trim().max(500).optional(),
  submitImmediately: z.boolean().optional(),
  items: z
    .array(
      z.object({
        medicineId: z.string().trim().optional(),
        sourceBatchId: z.string().trim().min(1),
        requestedQuantity: z.number().int().positive(),
      })
    )
    .min(1, 'At least one transfer item is required'),
});

const dispatchSchema = z.object({
  idempotencyKey: z.string().trim().optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().trim().min(1),
        dispatchQuantity: z.number().int().min(0),
      })
    )
    .optional(),
  vehicleNumber: z.string().trim().max(40).optional(),
  challanRemarks: z.string().trim().max(300).optional(),
});

const receiveSchema = z.object({
  idempotencyKey: z.string().trim().optional(),
  remarks: z.string().trim().max(300).optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().trim().min(1),
        acceptedQuantity: z.number().int().min(0),
        damagedQuantity: z.number().int().min(0).optional().default(0),
        missingQuantity: z.number().int().min(0).optional().default(0),
        discrepancyReason: z.string().trim().max(300).optional(),
        rackLocation: z.string().trim().max(60).optional(),
      })
    )
    .min(1, 'At least one received line tally is required'),
});

const reconcileSchema = z.object({
  resolutionNotes: z.string().trim().min(3, 'Resolution notes required'),
  writeOffDamagedAsShrinkage: z.boolean().optional().default(true),
  items: z
    .array(
      z.object({
        itemId: z.string().trim().min(1),
        damagedQuantity: z.number().int().min(0).optional(),
        missingQuantity: z.number().int().min(0).optional(),
        discrepancyReason: z.string().trim().max(300).optional(),
      })
    )
    .optional(),
});

const reasonSchema = z.object({
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(400),
});

stockTransferRouter.get(
  '/',
  ...tenantAuth,
  requirePermission('stock_transfers.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, role, assignedBranchIds } = req.tenantContext!;
    const qBranchId = (req.query.branchId as string | undefined)?.trim();
    const direction = (req.query.direction as 'outbound' | 'inbound' | 'all' | undefined) || 'all';
    const status = req.query.status as StockTransferStatus | undefined;

    if (qBranchId && qBranchId !== 'ALL' && role !== 'owner' && !assignedBranchIds.includes(qBranchId)) {
      throw new ForbiddenError(`Access denied for branch '${qBranchId}'.`);
    }

    const transfers = await StockTransferService.listTransfers(tenantId, {
      branchId: qBranchId,
      direction,
      status,
      role,
      assignedBranchIds,
      limit: Number(req.query.limit || 200),
    });

    res.status(200).json({ success: true, data: transfers });
  })
);

stockTransferRouter.post(
  '/',
  ...tenantAuth,
  requirePermission('stock_transfers.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId, role, assignedBranchIds } = req.tenantContext!;
    const input = createTransferSchema.parse(req.body);
    const transfer = await StockTransferService.createTransfer(
      tenantId,
      input,
      userId,
      role,
      assignedBranchIds
    );
    res.status(201).json({
      success: true,
      message: `Stock transfer ${transfer.transferNumber} created`,
      data: transfer,
    });
  })
);

stockTransferRouter.get(
  '/:transferId',
  ...tenantAuth,
  requirePermission('stock_transfers.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, role, assignedBranchIds } = req.tenantContext!;
    const transferId = String(req.params.transferId || '');
    const transfer = await StockTransferService.getTransferById(tenantId, transferId);
    if (
      role !== 'owner' &&
      !assignedBranchIds.includes(transfer.sourceBranchId) &&
      !assignedBranchIds.includes(transfer.destinationBranchId)
    ) {
      throw new ForbiddenError('You do not have access to this inter-branch stock transfer.');
    }
    res.status(200).json({ success: true, data: transfer });
  })
);

stockTransferRouter.post(
  '/:transferId/submit',
  ...tenantAuth,
  requirePermission('stock_transfers.submit'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const transferId = String(req.params.transferId || '');
    await assertTransferBranchParticipant(req, tenantId, transferId);
    const transfer = await StockTransferService.submitTransfer(tenantId, transferId, userId);
    res.status(200).json({ success: true, data: transfer });
  })
);

stockTransferRouter.post(
  '/:transferId/approve',
  ...tenantAuth,
  requirePermission('stock_transfers.approve'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId, role } = req.tenantContext!;
    const transferId = String(req.params.transferId || '');
    await assertTransferBranchParticipant(req, tenantId, transferId);
    const transfer = await StockTransferService.approveTransfer(tenantId, transferId, userId, role);
    res.status(200).json({ success: true, data: transfer });
  })
);

stockTransferRouter.post(
  '/:transferId/reject',
  ...tenantAuth,
  requirePermission('stock_transfers.reject'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const transferId = String(req.params.transferId || '');
    await assertTransferBranchParticipant(req, tenantId, transferId);
    const { reason } = reasonSchema.parse(req.body);
    const transfer = await StockTransferService.rejectTransfer(tenantId, transferId, reason, userId);
    res.status(200).json({ success: true, data: transfer });
  })
);

stockTransferRouter.post(
  '/:transferId/cancel',
  ...tenantAuth,
  requirePermission('stock_transfers.cancel'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const transferId = String(req.params.transferId || '');
    await assertTransferBranchParticipant(req, tenantId, transferId);
    const { reason } = reasonSchema.parse(req.body);
    const transfer = await StockTransferService.cancelTransfer(tenantId, transferId, reason, userId);
    res.status(200).json({ success: true, data: transfer });
  })
);

stockTransferRouter.post(
  '/:transferId/dispatch',
  ...tenantAuth,
  requirePermission('stock_transfers.dispatch'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId, role, assignedBranchIds } = req.tenantContext!;
    const transferId = String(req.params.transferId || '');
    const parsed = dispatchSchema.parse(req.body || {});
    const idempotencyKey = parsed.idempotencyKey || extractIdempotencyKey(req);
    const transfer = await StockTransferService.dispatchTransfer(
      tenantId,
      transferId,
      { ...parsed, idempotencyKey },
      userId,
      role,
      assignedBranchIds
    );
    res.status(200).json({
      success: true,
      message: `Transfer ${transfer.transferNumber} dispatched to ${transfer.destinationBranchName}`,
      data: transfer,
    });
  })
);

stockTransferRouter.post(
  '/:transferId/receive',
  ...tenantAuth,
  requirePermission('stock_transfers.receive'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId, role, assignedBranchIds } = req.tenantContext!;
    const transferId = String(req.params.transferId || '');
    const parsed = receiveSchema.parse(req.body);
    const idempotencyKey = parsed.idempotencyKey || extractIdempotencyKey(req);
    const transfer = await StockTransferService.receiveTransfer(
      tenantId,
      transferId,
      { ...parsed, idempotencyKey },
      userId,
      role,
      assignedBranchIds
    );
    res.status(200).json({
      success: true,
      message: `Transfer ${transfer.transferNumber} receipt recorded (${transfer.status})`,
      data: transfer,
    });
  })
);

stockTransferRouter.post(
  '/:transferId/reconcile',
  ...tenantAuth,
  requirePermission('stock_transfers.reconcile'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const transferId = String(req.params.transferId || '');
    await assertTransferBranchParticipant(req, tenantId, transferId);
    const parsed = reconcileSchema.parse(req.body);
    const transfer = await StockTransferService.reconcileAndCloseTransfer(
      tenantId,
      transferId,
      parsed,
      userId
    );
    res.status(200).json({
      success: true,
      message: `Transfer ${transfer.transferNumber} reconciled and closed`,
      data: transfer,
    });
  })
);

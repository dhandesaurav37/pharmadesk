import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware, requireActiveBranchMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { InventoryService } from '../services/inventoryService';
import { asyncHandler } from '../lib/asyncHandler';
import { ForbiddenError } from '../lib/errors';

export const inventoryRouter = Router({ mergeParams: true });

// Require authentication and tenant context
const tenantAuth = [firebaseAuthMiddleware, tenantAuthorizationMiddleware];

const openingStockSchema = z.object({
  medicineId: z.string().min(1, 'Medicine reference is required'),
  batchNumber: z.string().min(1, 'Batch number is required'),
  manufacturingDate: z.string().nullable().optional(),
  expiryDate: z.string().min(4, 'Expiry date is required (YYYY-MM)'),
  purchasePrice: z.number().min(0, 'Purchase price PTR cannot be negative'),
  mrp: z.number().min(0, 'MRP cannot be negative'),
  sellingPrice: z.number().min(0).optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  freeQuantity: z.number().int().min(0).default(0),
  supplierId: z.string().nullable().optional(),
  supplierName: z.string().nullable().optional(),
  rackLocation: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  branchId: z.string().optional(),
});

const stockAdjustmentSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
  movementType: z
    .enum(['MANUAL_ADJUSTMENT', 'DAMAGE', 'EXPIRY', 'SALE_RETURN', 'PURCHASE_RETURN'])
    .default('MANUAL_ADJUSTMENT'),
  quantityChange: z.number().optional(),
  newCount: z.number().min(0).optional(),
  reason: z.string().min(3, 'Adjustment reason is required for audit trail'),
  referenceId: z.string().optional(),
});

/**
 * GET /api/v1/inventory or /api/v1/tenants/:tenantId/inventory
 */
inventoryRouter.get(
  '/',
  tenantAuth,
  requirePermission('inventory.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantContext!.tenantId;
    const branchId = req.tenantContext!.branchId;
    const { medicineId, status, search, page, limit } = req.query;

    const result = await InventoryService.listBatches(tenantId, {
      branchId,
      medicineId: medicineId as string,
      status: status as string,
      search: search as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
    });

    res.status(200).json({
      success: true,
      data: result.batches,
      pagination: {
        page: result.page,
        limit: result.limit,
        totalCount: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/v1/inventory/movements
 */
inventoryRouter.get(
  '/movements',
  tenantAuth,
  requirePermission('inventory.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantContext!.tenantId;
    const branchId = req.tenantContext!.branchId;
    const { medicineId, batchId, movementType, limit } = req.query;

    const movements = await InventoryService.listMovements(tenantId, {
      branchId,
      medicineId: medicineId as string,
      batchId: batchId as string,
      movementType: movementType as any,
      limit: limit ? Number(limit) : 50,
    });

    res.status(200).json({
      success: true,
      data: movements,
      meta: {
        count: movements.length,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/v1/inventory/low-stock
 */
inventoryRouter.get(
  '/low-stock',
  tenantAuth,
  requirePermission('inventory.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantContext!.tenantId;
    const branchId = req.tenantContext!.branchId;

    const report = await InventoryService.getLowStockReport(tenantId, branchId);

    res.status(200).json({
      success: true,
      data: report,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/v1/inventory/expiry
 */
inventoryRouter.get(
  '/expiry',
  tenantAuth,
  requirePermission('inventory.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantContext!.tenantId;
    const branchId = req.tenantContext!.branchId;
    const { warningDays } = req.query;

    const report = await InventoryService.getExpiryReport(tenantId, {
      branchId,
      warningDays: warningDays ? Number(warningDays) : 90,
    });

    res.status(200).json({
      success: true,
      data: report,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/v1/inventory/valuation
 */
inventoryRouter.get(
  '/valuation',
  tenantAuth,
  requirePermission('inventory.ptr_margin'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantContext!.tenantId;
    const branchId = req.tenantContext!.branchId;

    const valuation = await InventoryService.getValuation(tenantId, branchId);

    res.status(200).json({
      success: true,
      data: valuation,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/v1/inventory/opening-stock
 */
inventoryRouter.post(
  '/opening-stock',
  tenantAuth,
  requireActiveBranchMiddleware,
  requirePermission('inventory.write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId: authorizedBranchId, userId, role, assignedBranchIds } = req.tenantContext!;
    const validated = openingStockSchema.parse(req.body);
    const targetBranchId = validated.branchId?.trim() || authorizedBranchId;

    if (
      validated.branchId &&
      role !== 'owner' &&
      !assignedBranchIds.includes(targetBranchId)
    ) {
      throw new ForbiddenError(`You do not have permission to write opening stock to branch '${targetBranchId}'.`);
    }

    const result = await InventoryService.createOpeningStock(tenantId, targetBranchId, validated, userId);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Stock batch recorded and opening stock movement logged',
    });
  })
);

/**
 * POST /api/v1/inventory/adjustments
 */
inventoryRouter.post(
  '/adjustments',
  tenantAuth,
  requireActiveBranchMiddleware,
  requirePermission('inventory.adjust'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantContext!.tenantId;
    const branchId = req.tenantContext!.branchId;
    const userId = req.tenantContext!.userId;
    const validated = stockAdjustmentSchema.parse(req.body);

    const result = await InventoryService.adjustStock(
      tenantId,
      branchId,
      validated.batchId,
      {
        movementType: validated.movementType,
        quantityChange: validated.quantityChange,
        newCount: validated.newCount,
        reason: validated.reason,
        referenceId: validated.referenceId,
      },
      userId
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Stock adjustment executed and immutable movement ledger appended',
    });
  })
);

/**
 * GET /api/v1/inventory/:batchId
 */
inventoryRouter.get(
  '/:batchId',
  tenantAuth,
  requirePermission('inventory.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, role, assignedBranchIds } = req.tenantContext!;
    const { batchId } = req.params;

    const batch = await InventoryService.getBatch(tenantId, batchId);

    if (
      role !== 'owner' &&
      !assignedBranchIds.includes('*') &&
      !assignedBranchIds.includes(batch.branchId)
    ) {
      throw new ForbiddenError(`Access denied for batch in branch '${batch.branchId}'.`);
    }

    res.status(200).json({
      success: true,
      data: batch,
    });
  })
);

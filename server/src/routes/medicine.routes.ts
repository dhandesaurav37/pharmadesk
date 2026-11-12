import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { MedicineService } from '../services/medicineService';
import { asyncHandler } from '../lib/asyncHandler';

export const medicineRouter = Router({ mergeParams: true });

// Require authentication and tenant context
const tenantAuth = [firebaseAuthMiddleware, tenantAuthorizationMiddleware];

const createMedicineSchema = z.object({
  name: z.string().min(2, 'Medicine name must be at least 2 characters'),
  genericName: z.string().min(2, 'Generic composition is required'),
  brand: z.string().min(2, 'Manufacturer or brand name is required'),
  category: z.string().default('Tablet'),
  dosageForm: z.string().default('tablet'),
  strength: z.string().min(1, 'Strength is required (e.g. 500 mg)'),
  packSize: z.string().default('10 Tablets'),
  uom: z.string().default('strip'),
  hsnCode: z.string().default('300490'),
  gstRate: z.number().min(0).max(28).default(12),
  barcode: z.string().nullable().optional(),
  prescriptionRequired: z.boolean().default(true),
  minStockThreshold: z.number().int().min(0).default(10),
  description: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const updateMedicineSchema = z.object({
  name: z.string().min(2).optional(),
  genericName: z.string().min(2).optional(),
  brand: z.string().min(2).optional(),
  category: z.string().optional(),
  dosageForm: z.string().optional(),
  strength: z.string().optional(),
  packSize: z.string().optional(),
  uom: z.string().optional(),
  hsnCode: z.string().optional(),
  gstRate: z.number().min(0).max(28).optional(),
  barcode: z.string().nullable().optional(),
  prescriptionRequired: z.boolean().optional(),
  minStockThreshold: z.number().int().min(0).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});

/**
 * GET /api/v1/medicines or /api/v1/tenants/:tenantId/medicines
 */
medicineRouter.get(
  '/',
  tenantAuth,
  requirePermission('medicines.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantContext!.tenantId;
    const { search, category, status, page, limit } = req.query;

    const result = await MedicineService.listMedicines(tenantId, {
      search: search as string,
      category: category as string,
      status: status as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
    });

    res.status(200).json({
      success: true,
      data: result.medicines,
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
 * POST /api/v1/medicines or /api/v1/tenants/:tenantId/medicines
 */
medicineRouter.post(
  '/',
  tenantAuth,
  requirePermission('medicines.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantContext!.tenantId;
    const userId = req.tenantContext!.userId;
    const validated = createMedicineSchema.parse(req.body);

    const medicine = await MedicineService.createMedicine(tenantId, validated, userId);

    res.status(201).json({
      success: true,
      data: medicine,
      message: 'Medicine added to catalogue successfully',
    });
  })
);

/**
 * GET /api/v1/medicines/:medicineId
 */
medicineRouter.get(
  '/:medicineId',
  tenantAuth,
  requirePermission('medicines.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantContext!.tenantId;
    const { medicineId } = req.params;

    const medicine = await MedicineService.getMedicine(tenantId, medicineId);

    res.status(200).json({
      success: true,
      data: medicine,
    });
  })
);

/**
 * PATCH /api/v1/medicines/:medicineId
 */
medicineRouter.patch(
  '/:medicineId',
  tenantAuth,
  requirePermission('medicines.edit'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantContext!.tenantId;
    const userId = req.tenantContext!.userId;
    const { medicineId } = req.params;
    const validated = updateMedicineSchema.parse(req.body);

    const updated = await MedicineService.updateMedicine(tenantId, medicineId, validated, userId);

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Medicine updated successfully',
    });
  })
);

/**
 * PATCH /api/v1/medicines/:medicineId/archive
 */
medicineRouter.patch(
  '/:medicineId/archive',
  tenantAuth,
  requirePermission('medicines.delete'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantContext!.tenantId;
    const userId = req.tenantContext!.userId;
    const { medicineId } = req.params;
    const archive = req.body.archive !== false; // default true

    const updated = await MedicineService.archiveMedicine(tenantId, medicineId, userId, archive);

    res.status(200).json({
      success: true,
      data: updated,
      message: archive ? 'Medicine archived successfully' : 'Medicine restored successfully',
    });
  })
);

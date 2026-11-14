import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware, requireActiveBranchMiddleware } from '../middleware/tenantAuthorization';
import { checkHasPermission } from '../lib/permissions';
import { StorageService, StorageCategory } from '../services/storageService';
import { asyncHandler } from '../lib/asyncHandler';
import { ForbiddenError } from '../lib/errors';

export const storageRouter = Router();

storageRouter.use(firebaseAuthMiddleware);

const STORAGE_CATEGORIES = [
  'invoice_pdfs',
  'prescriptions',
  'supplier_bills',
  'product_images',
  'documents',
] as const;

const UPLOAD_CATEGORY_PERMISSIONS: Record<StorageCategory, string[]> = {
  prescriptions: ['billing.create', 'billing.schedule_h1', 'inventory.write'],
  invoice_pdfs: ['billing.create'],
  supplier_bills: ['goods_receipts.create', 'goods_receipts.post', 'supplier_invoices.create', 'suppliers.update'],
  product_images: ['medicines.create', 'medicines.edit', 'inventory.write'],
  documents: ['settings.manage', 'branches.manage', 'branches.update', 'security.dpdp_export'],
};

const DOWNLOAD_CATEGORY_PERMISSIONS: Record<StorageCategory, string[]> = {
  prescriptions: ['billing.view', 'billing.create', 'billing.schedule_h1'],
  invoice_pdfs: ['billing.view', 'audit.view', 'reports.financial'],
  supplier_bills: ['goods_receipts.view', 'supplier_invoices.view', 'suppliers.view', 'audit.view'],
  product_images: ['medicines.view', 'inventory.view'],
  documents: ['settings.manage', 'branches.view', 'audit.view', 'security.view'],
};

function assertStorageCategoryPermission(req: Request, category: StorageCategory, mode: 'upload' | 'download'): void {
  const { role, permissions } = req.tenantContext!;
  const requiredAny = mode === 'upload'
    ? UPLOAD_CATEGORY_PERMISSIONS[category]
    : DOWNLOAD_CATEGORY_PERMISSIONS[category];

  const allowed = requiredAny.some((perm) => checkHasPermission(role, permissions, perm));
  if (!allowed) {
    throw new ForbiddenError(
      `Missing required permission to ${mode} files in storage category '${category}'. Required one of: [${requiredAny.join(', ')}]`
    );
  }
}

const uploadUrlSchema = z.object({
  category: z.enum(STORAGE_CATEGORIES),
  fileName: z.string().min(1, 'File name is required').max(180),
  contentType: z.string().min(1, 'Content-Type is required').max(100),
});

/**
 * POST /api/v1/tenants/:tenantId/storage/upload-url
 * Generates signed v4 upload URL for invoice PDFs, prescriptions, supplier bills, product images, and pharmacy documents.
 */
storageRouter.post(
  '/:tenantId/storage/upload-url',
  tenantAuthorizationMiddleware,
  requireActiveBranchMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId } = req.tenantContext!;
    const { category, fileName, contentType } = uploadUrlSchema.parse(req.body);
    assertStorageCategoryPermission(req, category, 'upload');

    const result = await StorageService.getSignedUploadUrl({
      tenantId,
      branchId,
      category,
      fileName,
      contentType,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

const downloadUrlSchema = z.object({
  category: z.enum(STORAGE_CATEGORIES),
  fileId: z.string().min(1, 'File ID is required').max(200),
});

/**
 * GET /api/v1/tenants/:tenantId/storage/download-url
 * Generates signed v4 download URL for secure retrieval.
 */
storageRouter.get(
  '/:tenantId/storage/download-url',
  tenantAuthorizationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId } = req.tenantContext!;
    const { category, fileId } = downloadUrlSchema.parse(req.query);
    assertStorageCategoryPermission(req, category, 'download');

    const result = await StorageService.getSignedDownloadUrl({
      tenantId,
      branchId,
      category,
      fileId,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

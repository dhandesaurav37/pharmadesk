import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { StorageService } from '../services/storageService';
import { asyncHandler } from '../lib/asyncHandler';

export const storageRouter = Router();

storageRouter.use(firebaseAuthMiddleware);

const STORAGE_CATEGORIES = [
  'invoice_pdfs',
  'prescriptions',
  'supplier_bills',
  'product_images',
  'documents',
] as const;

const uploadUrlSchema = z.object({
  category: z.enum(STORAGE_CATEGORIES),
  fileName: z.string().min(1, 'File name is required'),
  contentType: z.string().min(1, 'Content-Type is required'),
});

/**
 * POST /api/v1/tenants/:tenantId/storage/upload-url
 * Generates signed v4 upload URL for invoice PDFs, prescriptions, supplier bills, product images, and pharmacy documents.
 */
storageRouter.post(
  '/:tenantId/storage/upload-url',
  tenantAuthorizationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId } = req.tenantContext!;
    const { category, fileName, contentType } = uploadUrlSchema.parse(req.body);

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
  fileId: z.string().min(1, 'File ID is required'),
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

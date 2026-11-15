import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { asyncHandler } from '../lib/asyncHandler';
import { SupplierService, SupplierViewerAccess } from '../services/supplierService';
import { ProcurementService } from '../services/procurementService';

export const supplierRouter = Router({ mergeParams: true });

const tenantAuth = [firebaseAuthMiddleware, tenantAuthorizationMiddleware];

function getViewer(req: Request): SupplierViewerAccess {
  const ctx = req.tenantContext!;
  return {
    role: ctx.role,
    permissions: ctx.permissions,
    assignedBranchIds: ctx.assignedBranchIds,
  };
}

const supplierTypeEnum = z.enum([
  'DISTRIBUTOR',
  'MANUFACTURER',
  'C_AND_F',
  'WHOLESALER',
  'SURGICAL_VENDOR',
  'GENERIC_STOCKIST',
]);

const bankDetailsSchema = z
  .object({
    accountHolderName: z.string().trim().max(120).nullable().optional(),
    accountNumber: z.string().trim().max(40).nullable().optional(),
    ifscCode: z.string().trim().max(20).nullable().optional(),
    bankName: z.string().trim().max(120).nullable().optional(),
    branchName: z.string().trim().max(120).nullable().optional(),
    upiId: z.string().trim().max(80).nullable().optional(),
  })
  .nullable()
  .optional();

const createSupplierSchema = z.object({
  supplierCode: z.string().trim().max(32).optional(),
  legalName: z.string().trim().min(2, 'Legal name must be at least 2 characters').max(160),
  tradeName: z.string().trim().max(160).optional(),
  contactPerson: z.string().trim().min(2, 'Contact person name is required').max(120),
  primaryPhone: z.string().trim().min(8, 'Primary phone number is required').max(20),
  alternatePhone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email('Invalid email address').nullable().optional().or(z.literal('')),
  gstin: z.string().trim().max(20).nullable().optional(),
  pan: z.string().trim().max(12).nullable().optional(),
  billingAddress: z.string().trim().max(300).nullable().optional(),
  shippingAddress: z.string().trim().max(300).nullable().optional(),
  state: z.string().trim().min(2, 'State is required').max(80),
  stateCode: z.string().trim().max(4).optional(),
  pincode: z.string().trim().max(10).nullable().optional(),
  drugLicenceNumber: z.string().trim().max(60).nullable().optional(),
  supplierType: supplierTypeEnum.optional(),
  paymentTerms: z.string().trim().max(60).optional(),
  creditPeriodDays: z.number().int().min(0).max(365).optional(),
  creditLimit: z.number().finite().min(0).optional(),
  openingBalance: z.number().finite().min(0).optional(),
  bankDetails: bankDetailsSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
  confirmDuplicate: z.boolean().optional(),
});

const updateSupplierSchema = createSupplierSchema.omit({ openingBalance: true, supplierCode: true }).partial();

const statusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']),
  reason: z.string().trim().max(400).optional(),
});

const archiveSchema = z.object({
  reason: z.string().trim().max(400).optional(),
});

const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.enum(['supplier_bills', 'documents']),
  storagePath: z.string().trim().min(5).max(500),
  fileId: z.string().trim().min(1).max(120),
  contentType: z.string().trim().max(100).optional(),
});

supplierRouter.get(
  '/',
  ...tenantAuth,
  requirePermission('suppliers.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await SupplierService.listSuppliers(
      req.tenantContext!.tenantId,
      {
        search: req.query.search as string | undefined,
        status: req.query.status as any,
        supplierType: req.query.supplierType as any,
        includeArchived: req.query.includeArchived === 'true',
        hasOutstanding: req.query.hasOutstanding === 'true',
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 25,
      },
      getViewer(req)
    );
    res.status(200).json({ success: true, data: result });
  })
);

supplierRouter.post(
  '/',
  ...tenantAuth,
  requirePermission('suppliers.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createSupplierSchema.parse(req.body);
    const created = await SupplierService.createSupplier(
      req.tenantContext!.tenantId,
      parsed,
      req.tenantContext!.userId,
      getViewer(req)
    );
    res.status(201).json({ success: true, data: { supplier: created } });
  })
);

supplierRouter.get(
  '/:supplierId',
  ...tenantAuth,
  requirePermission('suppliers.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const supplier = await SupplierService.getSupplier(
      req.tenantContext!.tenantId,
      req.params.supplierId!,
      getViewer(req)
    );
    res.status(200).json({ success: true, data: { supplier } });
  })
);

supplierRouter.patch(
  '/:supplierId',
  ...tenantAuth,
  requirePermission('suppliers.update'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateSupplierSchema.parse(req.body);
    const updated = await SupplierService.updateSupplier(
      req.tenantContext!.tenantId,
      req.params.supplierId!,
      parsed,
      req.tenantContext!.userId,
      getViewer(req)
    );
    res.status(200).json({ success: true, data: { supplier: updated } });
  })
);

supplierRouter.put(
  '/:supplierId',
  ...tenantAuth,
  requirePermission('suppliers.update'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateSupplierSchema.parse(req.body);
    const updated = await SupplierService.updateSupplier(
      req.tenantContext!.tenantId,
      req.params.supplierId!,
      parsed,
      req.tenantContext!.userId,
      getViewer(req)
    );
    res.status(200).json({ success: true, data: { supplier: updated } });
  })
);

supplierRouter.patch(
  '/:supplierId/status',
  ...tenantAuth,
  requirePermission('suppliers.update'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = statusSchema.parse(req.body);
    const updated = await SupplierService.updateSupplierStatus(
      req.tenantContext!.tenantId,
      req.params.supplierId!,
      parsed.status,
      parsed.reason,
      req.tenantContext!.userId,
      getViewer(req)
    );
    res.status(200).json({ success: true, data: { supplier: updated } });
  })
);

supplierRouter.post(
  '/:supplierId/archive',
  ...tenantAuth,
  requirePermission('suppliers.archive'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = archiveSchema.parse(req.body || {});
    const archived = await SupplierService.archiveSupplier(
      req.tenantContext!.tenantId,
      req.params.supplierId!,
      parsed.reason,
      req.tenantContext!.userId,
      getViewer(req)
    );
    res.status(200).json({ success: true, data: { supplier: archived } });
  })
);

supplierRouter.post(
  '/:supplierId/attachments',
  ...tenantAuth,
  requirePermission('suppliers.update'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = attachmentSchema.parse(req.body);
    const updated = await SupplierService.attachDocument(
      req.tenantContext!.tenantId,
      req.tenantContext!.branchId || 'main',
      req.params.supplierId!,
      parsed,
      req.tenantContext!.userId,
      getViewer(req)
    );
    res.status(201).json({ success: true, data: { supplier: updated } });
  })
);

supplierRouter.get(
  '/:supplierId/statement',
  ...tenantAuth,
  requirePermission('suppliers.view', 'suppliers.view_financials'),
  asyncHandler(async (req: Request, res: Response) => {
    const statement = await ProcurementService.getSupplierStatement(
      req.tenantContext!.tenantId,
      req.params.supplierId!,
      {
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
      }
    );
    res.status(200).json({ success: true, data: statement });
  })
);

supplierRouter.get(
  '/:supplierId/statement/export',
  ...tenantAuth,
  requirePermission('suppliers.view', 'suppliers.view_financials', 'suppliers.export'),
  asyncHandler(async (req: Request, res: Response) => {
    const format = req.query.format === 'pdf' ? 'pdf' : 'csv';
    const tenantId = req.tenantContext!.tenantId;
    const branchId = req.tenantContext!.branchId || 'main';
    const supplier = await SupplierService.getRawSupplier(tenantId, req.params.supplierId!);
    const statement = await ProcurementService.getSupplierStatement(tenantId, supplier.id, {
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    });

    const exported = SupplierService.buildExportBuffer(
      format,
      'PHARMADESK SUPPLIER PAYABLES STATEMENT',
      supplier,
      statement.entries,
      statement.openingBalance,
      statement.closingBalance
    );

    if (req.query.archive === 'true') {
      const archived = await SupplierService.archiveExportedFile(
        tenantId,
        branchId,
        exported.fileName,
        exported.mimeType,
        exported.buffer
      );
      res.status(200).json({
        success: true,
        data: {
          fileName: exported.fileName,
          mimeType: exported.mimeType,
          storagePath: archived.storagePath,
          downloadUrl: archived.downloadUrl,
        },
      });
      return;
    }

    res.setHeader('Content-Type', exported.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.fileName}"`);
    res.status(200).send(exported.buffer);
  })
);

supplierRouter.get(
  '/:supplierId/purchases',
  ...tenantAuth,
  requirePermission('suppliers.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const history = await ProcurementService.getSupplierPurchaseHistory(
      req.tenantContext!.tenantId,
      req.params.supplierId!
    );
    res.status(200).json({ success: true, data: history });
  })
);

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware, requireActiveBranchMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { asyncHandler } from '../lib/asyncHandler';
import { BadRequestError, ForbiddenError } from '../lib/errors';
import { SupplierViewerAccess } from '../services/supplierService';
import { ProcurementService } from '../services/procurementService';

export const procurementRouter = Router({ mergeParams: true });

const tenantAuth = [firebaseAuthMiddleware, tenantAuthorizationMiddleware];

function getViewer(req: Request): SupplierViewerAccess {
  const ctx = req.tenantContext!;
  return {
    role: ctx.role,
    permissions: ctx.permissions,
    assignedBranchIds: ctx.assignedBranchIds,
  };
}

function assertBranchReadAccess(req: Request, recordBranchId: string): void {
  const { role, assignedBranchIds } = req.tenantContext!;
  if (role !== 'owner' && !assignedBranchIds.includes('*') && !assignedBranchIds.includes(recordBranchId)) {
    throw new ForbiddenError(`Access denied for branch '${recordBranchId}'.`);
  }
}

function resolveBranchScope(req: Request): string | undefined {
  const { role, branchId, assignedBranchIds } = req.tenantContext!;
  const requested = (req.query.branchId as string | undefined)?.trim();
  if (requested === 'all') {
    if (role === 'owner' || assignedBranchIds.includes('*')) return undefined;
    return branchId || assignedBranchIds[0];
  }
  if (requested) {
    assertBranchReadAccess(req, requested);
    return requested;
  }
  return branchId;
}

function extractIdempotencyKey(req: Request): string | undefined {
  const raw =
    (req.headers['x-idempotency-key'] as string) ||
    (req.headers['idempotency-key'] as string) ||
    (req.body?.idempotencyKey as string | undefined);
  return raw ? String(raw).trim() : undefined;
}

// ==========================================
// Validation Schemas
// ==========================================

const poItemSchema = z.object({
  medicineId: z.string().trim().min(1),
  orderedQuantity: z.number().int().positive(),
  freeQuantity: z.number().int().min(0).optional(),
  unitCost: z.number().finite().min(0),
  mrp: z.number().finite().min(0).nullable().optional(),
  discountPercent: z.number().finite().min(0).max(100).optional(),
  discountAmount: z.number().finite().min(0).optional(),
  gstRate: z.number().finite().min(0).max(28).optional(),
  hsnCode: z.string().trim().max(20).optional(),
});

const createPoSchema = z.object({
  supplierId: z.string().trim().min(1),
  orderDate: z.string().trim().optional(),
  expectedDeliveryDate: z.string().trim().nullable().optional(),
  placeOfSupplyStateCode: z.string().trim().max(4).optional(),
  isInterState: z.boolean().optional(),
  invoiceDiscount: z.number().finite().min(0).optional(),
  otherCharges: z.number().finite().min(0).optional(),
  paymentTerms: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  items: z.array(poItemSchema).min(1).max(100),
  submitImmediately: z.boolean().optional(),
});

const updatePoSchema = createPoSchema.partial();

const reasonSchema = z.object({
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500),
});

const grnItemSchema = z.object({
  poItemId: z.string().trim().optional(),
  medicineId: z.string().trim().min(1),
  batchNumber: z.string().trim().min(1).max(60),
  manufacturingDate: z.string().trim().nullable().optional(),
  expiryDate: z.string().trim().min(4).max(20),
  receivedQuantity: z.number().int().positive().optional(),
  acceptedQuantity: z.number().int().min(0),
  rejectedQuantity: z.number().int().min(0).optional(),
  freeQuantity: z.number().int().min(0).optional(),
  rejectionReason: z.string().trim().max(300).nullable().optional(),
  purchasePrice: z.number().finite().min(0),
  mrp: z.number().finite().min(0),
  sellingPrice: z.number().finite().min(0).optional(),
  discountPercent: z.number().finite().min(0).max(100).optional(),
  discountAmount: z.number().finite().min(0).optional(),
  gstRate: z.number().finite().min(0).max(28).optional(),
  rackLocation: z.string().trim().max(40).nullable().optional(),
  barcode: z.string().trim().max(60).nullable().optional(),
});

const createGrnSchema = z.object({
  poId: z.string().trim().nullable().optional(),
  supplierId: z.string().trim().optional(),
  supplierInvoiceNumber: z.string().trim().max(60).nullable().optional(),
  supplierInvoiceDate: z.string().trim().nullable().optional(),
  receiptDate: z.string().trim().optional(),
  placeOfSupplyStateCode: z.string().trim().max(4).optional(),
  isInterState: z.boolean().optional(),
  invoiceDiscount: z.number().finite().min(0).optional(),
  otherCharges: z.number().finite().min(0).optional(),
  shortExpiryWarningDays: z.number().int().min(1).max(730).optional(),
  allowOverReceipt: z.boolean().optional(),
  overReceiptReason: z.string().trim().max(300).nullable().optional(),
  autoCreateSupplierInvoice: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  items: z.array(grnItemSchema).min(1).max(200),
});

const createInvoiceSchema = z.object({
  supplierId: z.string().trim().min(1),
  grnId: z.string().trim().nullable().optional(),
  poId: z.string().trim().nullable().optional(),
  supplierInvoiceNumber: z.string().trim().min(1).max(60),
  invoiceDate: z.string().trim().optional(),
  dueDate: z.string().trim().optional(),
  placeOfSupplyStateCode: z.string().trim().max(4).optional(),
  isInterState: z.boolean().optional(),
  subtotal: z.number().finite().min(0).optional(),
  totalDiscount: z.number().finite().min(0).optional(),
  otherCharges: z.number().finite().min(0).optional(),
  cgst: z.number().finite().min(0).optional(),
  sgst: z.number().finite().min(0).optional(),
  igst: z.number().finite().min(0).optional(),
  roundOff: z.number().finite().optional(),
  totalAmount: z.number().finite().positive().optional(),
  attachmentPath: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const paymentSchema = z.object({
  supplierId: z.string().trim().min(1),
  paymentDate: z.string().trim().optional(),
  paymentMode: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'NEFT_RTGS', 'CHEQUE', 'ADVANCE_ADJUSTMENT']),
  amount: z.number().finite().positive(),
  referenceNumber: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().trim().min(1),
        amount: z.number().finite().positive(),
      })
    )
    .optional(),
  allowAdvance: z.boolean().optional(),
});

const returnSchema = z.object({
  grnId: z.string().trim().min(1),
  creditNoteNumber: z.string().trim().max(60).optional(),
  returnDate: z.string().trim().optional(),
  reason: z.string().trim().min(3).max(500),
  items: z
    .array(
      z.object({
        batchId: z.string().trim().min(1),
        quantity: z.number().int().positive(),
        reason: z.string().trim().max(300).optional(),
      })
    )
    .min(1),
});

// ==========================================
// Purchase Orders
// ==========================================

procurementRouter.get(
  '/purchase-orders',
  ...tenantAuth,
  requirePermission('purchase_orders.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await ProcurementService.listPurchaseOrders(
      req.tenantContext!.tenantId,
      resolveBranchScope(req),
      {
        status: req.query.status as any,
        supplierId: req.query.supplierId as string | undefined,
        search: req.query.search as string | undefined,
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 25,
      }
    );
    res.status(200).json({ success: true, data: result });
  })
);

procurementRouter.post(
  '/purchase-orders',
  ...tenantAuth,
  requireActiveBranchMiddleware,
  requirePermission('purchase_orders.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createPoSchema.parse(req.body);
    const po = await ProcurementService.createPurchaseOrder(
      req.tenantContext!.tenantId,
      req.tenantContext!.branchId || 'main',
      parsed,
      req.tenantContext!.userId
    );
    res.status(201).json({ success: true, data: { purchaseOrder: po } });
  })
);

procurementRouter.get(
  '/purchase-orders/:poId',
  ...tenantAuth,
  requirePermission('purchase_orders.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const po = await ProcurementService.getPurchaseOrder(req.tenantContext!.tenantId, req.params.poId!);
    assertBranchReadAccess(req, po.branchId);
    res.status(200).json({ success: true, data: { purchaseOrder: po } });
  })
);

procurementRouter.get(
  '/purchase-orders/:poId/print',
  ...tenantAuth,
  requirePermission('purchase_orders.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const payload = await ProcurementService.getPurchaseOrderPrint(
      req.tenantContext!.tenantId,
      req.params.poId!
    );
    assertBranchReadAccess(req, payload.purchaseOrder.branchId);
    res.status(200).json({ success: true, data: payload });
  })
);

procurementRouter.patch(
  '/purchase-orders/:poId',
  ...tenantAuth,
  requirePermission('purchase_orders.update'),
  asyncHandler(async (req: Request, res: Response) => {
    const existingPo = await ProcurementService.getPurchaseOrder(req.tenantContext!.tenantId, req.params.poId!);
    assertBranchReadAccess(req, existingPo.branchId);
    const parsed = updatePoSchema.parse(req.body);
    const po = await ProcurementService.updatePurchaseOrder(
      req.tenantContext!.tenantId,
      req.params.poId!,
      parsed,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: { purchaseOrder: po } });
  })
);

procurementRouter.post(
  '/purchase-orders/:poId/submit',
  ...tenantAuth,
  requirePermission('purchase_orders.submit'),
  asyncHandler(async (req: Request, res: Response) => {
    const existingPo = await ProcurementService.getPurchaseOrder(req.tenantContext!.tenantId, req.params.poId!);
    assertBranchReadAccess(req, existingPo.branchId);
    const po = await ProcurementService.submitPurchaseOrder(
      req.tenantContext!.tenantId,
      req.params.poId!,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: { purchaseOrder: po } });
  })
);

procurementRouter.post(
  '/purchase-orders/:poId/approve',
  ...tenantAuth,
  requirePermission('purchase_orders.approve'),
  asyncHandler(async (req: Request, res: Response) => {
    const existingPo = await ProcurementService.getPurchaseOrder(req.tenantContext!.tenantId, req.params.poId!);
    assertBranchReadAccess(req, existingPo.branchId);
    const po = await ProcurementService.approvePurchaseOrder(
      req.tenantContext!.tenantId,
      req.params.poId!,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: { purchaseOrder: po } });
  })
);

procurementRouter.post(
  '/purchase-orders/:poId/cancel',
  ...tenantAuth,
  requirePermission('purchase_orders.cancel'),
  asyncHandler(async (req: Request, res: Response) => {
    const existingPo = await ProcurementService.getPurchaseOrder(req.tenantContext!.tenantId, req.params.poId!);
    assertBranchReadAccess(req, existingPo.branchId);
    const parsed = reasonSchema.parse(req.body);
    const po = await ProcurementService.cancelPurchaseOrder(
      req.tenantContext!.tenantId,
      req.params.poId!,
      parsed.reason,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: { purchaseOrder: po } });
  })
);

procurementRouter.post(
  '/purchase-orders/:poId/close',
  ...tenantAuth,
  requirePermission('purchase_orders.close'),
  asyncHandler(async (req: Request, res: Response) => {
    const existingPo = await ProcurementService.getPurchaseOrder(req.tenantContext!.tenantId, req.params.poId!);
    assertBranchReadAccess(req, existingPo.branchId);
    const po = await ProcurementService.closePurchaseOrder(
      req.tenantContext!.tenantId,
      req.params.poId!,
      req.body?.reason,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: { purchaseOrder: po } });
  })
);

// ==========================================
// Goods Receipt Notes (GRN)
// ==========================================

procurementRouter.get(
  '/goods-receipts',
  ...tenantAuth,
  requirePermission('goods_receipts.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await ProcurementService.listGrns(
      req.tenantContext!.tenantId,
      resolveBranchScope(req),
      {
        poId: req.query.poId as string | undefined,
        supplierId: req.query.supplierId as string | undefined,
        status: req.query.status as any,
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 25,
      }
    );
    res.status(200).json({ success: true, data: result });
  })
);

procurementRouter.post(
  '/goods-receipts',
  ...tenantAuth,
  requireActiveBranchMiddleware,
  requirePermission('goods_receipts.create', 'goods_receipts.post'),
  asyncHandler(async (req: Request, res: Response) => {
    const key = extractIdempotencyKey(req);
    if (!key || key.length < 8) {
      throw new BadRequestError('Idempotency-Key header (minimum 8 characters) is required when posting a GRN.');
    }
    const parsed = createGrnSchema.parse(req.body);
    const result = await ProcurementService.createAndPostGrn(
      req.tenantContext!.tenantId,
      req.tenantContext!.branchId || 'main',
      parsed,
      key,
      req.tenantContext!.userId,
      getViewer(req)
    );
    res.status(result.idempotentReplay ? 200 : 201).json({ success: true, data: result });
  })
);

procurementRouter.get(
  '/goods-receipts/:grnId',
  ...tenantAuth,
  requirePermission('goods_receipts.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const grn = await ProcurementService.getGrn(req.tenantContext!.tenantId, req.params.grnId!);
    assertBranchReadAccess(req, grn.branchId);
    res.status(200).json({ success: true, data: { grn } });
  })
);

procurementRouter.get(
  '/goods-receipts/:grnId/print',
  ...tenantAuth,
  requirePermission('goods_receipts.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const payload = await ProcurementService.getGrnPrint(req.tenantContext!.tenantId, req.params.grnId!);
    assertBranchReadAccess(req, payload.grn.branchId);
    res.status(200).json({ success: true, data: payload });
  })
);

procurementRouter.post(
  '/goods-receipts/:grnId/reverse',
  ...tenantAuth,
  requirePermission('goods_receipts.correct'),
  asyncHandler(async (req: Request, res: Response) => {
    const existingGrn = await ProcurementService.getGrn(req.tenantContext!.tenantId, req.params.grnId!);
    assertBranchReadAccess(req, existingGrn.branchId);
    const parsed = reasonSchema.parse(req.body);
    const result = await ProcurementService.reverseGrn(
      req.tenantContext!.tenantId,
      req.params.grnId!,
      parsed.reason,
      req.tenantContext!.userId
    );
    res.status(200).json({ success: true, data: result });
  })
);

// ==========================================
// Supplier Invoices, Payments, Returns & Reports
// ==========================================

procurementRouter.get(
  '/supplier-invoices',
  ...tenantAuth,
  requirePermission('supplier_invoices.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await ProcurementService.listSupplierInvoices(
      req.tenantContext!.tenantId,
      resolveBranchScope(req),
      {
        supplierId: req.query.supplierId as string | undefined,
        status: req.query.status as any,
        grnId: req.query.grnId as string | undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 25,
      }
    );
    res.status(200).json({ success: true, data: result });
  })
);

procurementRouter.post(
  '/supplier-invoices',
  ...tenantAuth,
  requirePermission('supplier_invoices.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createInvoiceSchema.parse(req.body);
    const invoice = await ProcurementService.createSupplierInvoice(
      req.tenantContext!.tenantId,
      req.tenantContext!.branchId || 'main',
      parsed,
      req.tenantContext!.userId
    );
    res.status(201).json({ success: true, data: { invoice } });
  })
);

procurementRouter.get(
  '/supplier-payments',
  ...tenantAuth,
  requirePermission('supplier_payments.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const payments = await ProcurementService.listSupplierPayments(
      req.tenantContext!.tenantId,
      resolveBranchScope(req),
      req.query.supplierId as string | undefined
    );
    res.status(200).json({ success: true, data: { payments } });
  })
);

procurementRouter.post(
  '/supplier-payments',
  ...tenantAuth,
  requirePermission('supplier_payments.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = paymentSchema.parse(req.body);
    const key = extractIdempotencyKey(req);
    const result = await ProcurementService.recordSupplierPayment(
      req.tenantContext!.tenantId,
      req.tenantContext!.branchId || 'main',
      { ...parsed, idempotencyKey: key },
      req.tenantContext!.userId
    );
    res.status(result.idempotentReplay ? 200 : 201).json({ success: true, data: result });
  })
);

procurementRouter.get(
  '/supplier-returns',
  ...tenantAuth,
  requirePermission('goods_receipts.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const returns = await ProcurementService.listSupplierReturns(
      req.tenantContext!.tenantId,
      resolveBranchScope(req),
      req.query.supplierId as string | undefined
    );
    res.status(200).json({ success: true, data: { returns } });
  })
);

procurementRouter.post(
  '/supplier-returns',
  ...tenantAuth,
  requirePermission('supplier_returns.create', 'supplier_returns.approve'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = returnSchema.parse(req.body);
    const key = extractIdempotencyKey(req);
    const created = await ProcurementService.createSupplierReturn(
      req.tenantContext!.tenantId,
      req.tenantContext!.branchId || 'main',
      { ...parsed, idempotencyKey: key },
      req.tenantContext!.userId
    );
    res.status(201).json({ success: true, data: { supplierReturn: created } });
  })
);

procurementRouter.get(
  '/procurement/reports',
  ...tenantAuth,
  requirePermission('supplier_reports.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const report = await ProcurementService.getProcurementReports(
      req.tenantContext!.tenantId,
      resolveBranchScope(req),
      {
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
      }
    );
    res.status(200).json({ success: true, data: report });
  })
);

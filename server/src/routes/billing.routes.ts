import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware, requireActiveBranchMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { BillingTransactionService } from '../services/billingTransactionService';
import { asyncHandler } from '../lib/asyncHandler';
import { BadRequestError, ForbiddenError } from '../lib/errors';

export const billingRouter = Router();

const tenantAuth = [firebaseAuthMiddleware, tenantAuthorizationMiddleware];

function extractIdempotencyKey(req: Request): string | undefined {
  const raw =
    (req.headers['x-idempotency-key'] as string) ||
    (req.headers['idempotency-key'] as string) ||
    (req.body?.idempotencyKey as string | undefined);
  return raw ? String(raw).trim() : undefined;
}

function assertInvoiceBranchReadAccess(req: Request, invoiceBranchId: string) {
  const { role, assignedBranchIds } = req.tenantContext!;
  if (
    role !== 'owner' &&
    !assignedBranchIds.includes('*') &&
    !assignedBranchIds.includes(invoiceBranchId)
  ) {
    throw new ForbiddenError(`You do not have permission to access invoice data for branch '${invoiceBranchId}'.`);
  }
}

// ==========================================
// Zod Request Validation Schemas
// ==========================================
const cartItemSchema = z.object({
  medicineId: z.string().min(1, 'Medicine ID is required'),
  batchId: z.string().optional(),
  medicineName: z.string().optional(),
  quantity: z.number().int().positive('Quantity must be an integer greater than zero'),
  unitPrice: z.number().positive('Unit price must be positive').optional(),
  mrp: z.number().positive('MRP must be positive').optional(),
  gstRate: z.number().min(0).max(28, 'GST rate must be between 0% and 28%').optional(),
  hsnCode: z.string().optional(),
  discountPercent: z.number().min(0).max(100, 'Discount cannot exceed 100%').optional().default(0),
});

const paymentEntrySchema = z.object({
  mode: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'khata_credit']),
  amount: z.number().positive('Payment amount must be greater than zero'),
  referenceNumber: z.string().optional(),
});

const checkoutSchema = z.object({
  idempotencyKey: z.string().min(8, 'Idempotency key must be at least 8 characters').optional(),
  customerId: z.string().min(1).optional(),
  customer: z.object({
    name: z.string().min(1, 'Customer name is required'),
    phone: z.string().optional(),
    doctorName: z.string().optional(),
    doctorRegNumber: z.string().optional(),
    address: z.string().optional(),
    gstin: z.string().optional(),
  }),
  items: z.array(cartItemSchema).min(1, 'Invoice must contain at least one medicine item').max(50, 'Maximum 50 line items allowed per invoice'),
  payments: z.array(paymentEntrySchema).optional(),
  paymentMode: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'khata_credit']).optional(),
  creditTermsDays: z.union([z.literal(0), z.literal(7), z.literal(15), z.literal(30)]).optional(),
  overrideCreditLimit: z.boolean().optional().default(false),
  creditOverrideReason: z.string().optional(),
  isInterState: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

const paymentRecordSchema = z.object({
  idempotencyKey: z.string().min(8, 'Idempotency key must be at least 8 characters').optional(),
  mode: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'khata_credit']),
  amount: z.number().positive('Payment amount must be greater than zero'),
  referenceNumber: z.string().optional(),
});

const returnItemSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
  quantity: z.number().int().positive('Return quantity must be greater than zero'),
  reason: z.string().optional(),
  restock: z.boolean().optional().default(true),
  damaged: z.boolean().optional().default(false),
});

const salesReturnSchema = z.object({
  idempotencyKey: z.string().min(8, 'Idempotency key must be at least 8 characters').optional(),
  items: z.array(returnItemSchema).min(1, 'Return must contain at least one item'),
  reason: z.string().min(3, 'Return reason must be at least 3 characters'),
});

const cancelInvoiceSchema = z.object({
  idempotencyKey: z.string().min(8).optional(),
  reason: z.string().min(3, 'Cancellation reason must be at least 3 characters'),
});

// ==========================================
// POS Endpoints
// ==========================================

billingRouter.get(
  '/pos/medicines',
  ...tenantAuth,
  requirePermission('billing.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId } = req.tenantContext!;
    const { query } = req.query;

    const medicines = await BillingTransactionService.getPOSMedicines(
      tenantId,
      branchId,
      query as string | undefined
    );

    res.status(200).json({
      success: true,
      data: medicines,
    });
  })
);

billingRouter.get(
  '/pos/medicines/:medicineId/batches',
  ...tenantAuth,
  requirePermission('billing.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId } = req.tenantContext!;
    const { medicineId } = req.params;

    const allocations = await BillingTransactionService.allocateBatchesFEFO(
      tenantId,
      branchId,
      medicineId!,
      1
    ).catch(() => []);

    res.status(200).json({
      success: true,
      data: allocations.map((a) => a.batch),
    });
  })
);

const handleCheckout = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, branchId, userId, role, permissions } = req.tenantContext!;

  const idempotencyKey = extractIdempotencyKey(req);
  if (!idempotencyKey) {
    throw new BadRequestError('Idempotency key must be provided via X-Idempotency-Key header or request body');
  }

  const validated = checkoutSchema.parse(req.body);

  const result = await BillingTransactionService.createSalesInvoice({
    tenantId,
    branchId,
    userId,
    callerRole: role,
    callerPermissions: permissions,
    idempotencyKey,
    customerId: validated.customerId,
    customer: validated.customer,
    items: validated.items,
    payments: validated.payments,
    paymentMode: validated.paymentMode,
    creditTermsDays: validated.creditTermsDays,
    overrideCreditLimit: validated.overrideCreditLimit,
    creditOverrideReason: validated.creditOverrideReason,
    isInterState: validated.isInterState,
    notes: validated.notes,
  });

  if (result.fromCache) {
    res.setHeader('X-Cache', 'HIT');
  }

  res.status(result.fromCache ? 200 : 201).json({
    success: true,
    message: result.fromCache
      ? 'Invoice retrieved from idempotent cache'
      : 'Sales invoice generated successfully',
    data: result,
  });
});

billingRouter.post('/pos/checkout', ...tenantAuth, requireActiveBranchMiddleware, requirePermission('billing.create'), handleCheckout);
billingRouter.post('/invoices', ...tenantAuth, requireActiveBranchMiddleware, requirePermission('billing.create'), handleCheckout);
billingRouter.post('/:tenantId/invoices', ...tenantAuth, requireActiveBranchMiddleware, requirePermission('billing.create'), handleCheckout);

// ==========================================
// Invoices Endpoints
// ==========================================

const handleInvoiceList = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, branchId } = req.tenantContext!;
  const { search, status, paymentStatus, dateFrom, dateTo, page, limit } = req.query;

  const result = await BillingTransactionService.listInvoices(tenantId, {
    branchId: branchId && branchId !== 'all' ? branchId : undefined,
    search: search as string,
    status: status as string,
    paymentStatus: paymentStatus as string,
    dateFrom: dateFrom as string,
    dateTo: dateTo as string,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 25,
  });

  res.status(200).json({
    success: true,
    data: result.invoices,
    pagination: {
      page: result.page,
      limit: result.limit,
      totalCount: result.total,
      totalPages: result.totalPages,
      hasNext: result.page < result.totalPages,
    },
  });
});

billingRouter.get('/invoices', ...tenantAuth, requirePermission('billing.view'), handleInvoiceList);
billingRouter.get('/:tenantId/invoices', ...tenantAuth, requirePermission('billing.view'), handleInvoiceList);

billingRouter.get(
  '/invoices/:invoiceId',
  ...tenantAuth,
  requirePermission('billing.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { invoiceId } = req.params;

    const invoice = await BillingTransactionService.getInvoice(tenantId, invoiceId!);
    assertInvoiceBranchReadAccess(req, invoice.branchId);

    res.status(200).json({
      success: true,
      data: invoice,
    });
  })
);

billingRouter.get(
  '/invoices/:invoiceId/print',
  ...tenantAuth,
  requirePermission('billing.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { invoiceId } = req.params;

    const printData = await BillingTransactionService.getInvoicePrintData(tenantId, invoiceId!);
    assertInvoiceBranchReadAccess(req, printData.invoice.branchId);

    res.status(200).json({
      success: true,
      data: printData,
    });
  })
);

billingRouter.post(
  '/invoices/:invoiceId/cancel',
  ...tenantAuth,
  requirePermission('billing.cancel'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;
    const { invoiceId } = req.params;
    const idempotencyKey = extractIdempotencyKey(req);
    const validated = cancelInvoiceSchema.parse(req.body);

    const existingInvoice = await BillingTransactionService.getInvoice(tenantId, invoiceId!);
    assertInvoiceBranchReadAccess(req, existingInvoice.branchId);

    const cancelled = await BillingTransactionService.cancelSalesInvoice(
      tenantId,
      branchId,
      invoiceId!,
      validated.reason,
      userId,
      idempotencyKey
    );

    res.status(200).json({
      success: true,
      message: `Invoice ${cancelled.invoiceNumber} has been successfully cancelled`,
      data: cancelled,
    });
  })
);

// ==========================================
// Payments Endpoints
// ==========================================

billingRouter.post(
  '/invoices/:invoiceId/payments',
  ...tenantAuth,
  requirePermission('billing.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;
    const { invoiceId } = req.params;
    const idempotencyKey = extractIdempotencyKey(req);
    if (!idempotencyKey) {
      throw new BadRequestError('Idempotency key must be provided via X-Idempotency-Key header or request body');
    }

    const validated = paymentRecordSchema.parse(req.body);

    const existingInvoice = await BillingTransactionService.getInvoice(tenantId, invoiceId!);
    assertInvoiceBranchReadAccess(req, existingInvoice.branchId);

    const outcome = await BillingTransactionService.recordPayment(
      tenantId,
      branchId,
      invoiceId!,
      {
        mode: validated.mode,
        amount: validated.amount,
        referenceNumber: validated.referenceNumber,
      },
      userId,
      idempotencyKey
    );

    if (outcome.fromCache) {
      res.setHeader('X-Cache', 'HIT');
    }

    res.status(200).json({
      success: true,
      message: outcome.fromCache
        ? 'Payment retrieved from idempotent cache'
        : 'Payment recorded successfully',
      data: outcome.invoice,
    });
  })
);

billingRouter.get(
  '/invoices/:invoiceId/payments',
  ...tenantAuth,
  requirePermission('billing.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { invoiceId } = req.params;

    const invoice = await BillingTransactionService.getInvoice(tenantId, invoiceId!);
    assertInvoiceBranchReadAccess(req, invoice.branchId);

    res.status(200).json({
      success: true,
      data: invoice.payments || [],
    });
  })
);

// ==========================================
// Sales Returns Endpoints
// ==========================================

billingRouter.post(
  '/invoices/:invoiceId/returns',
  ...tenantAuth,
  requirePermission('billing.return'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;
    const { invoiceId } = req.params;
    const idempotencyKey = extractIdempotencyKey(req);
    if (!idempotencyKey) {
      throw new BadRequestError('Idempotency key must be provided via X-Idempotency-Key header or request body');
    }

    const validated = salesReturnSchema.parse(req.body);

    const existingInvoice = await BillingTransactionService.getInvoice(tenantId, invoiceId!);
    assertInvoiceBranchReadAccess(req, existingInvoice.branchId);

    const result = await BillingTransactionService.processSalesReturn(
      tenantId,
      branchId,
      invoiceId!,
      validated,
      userId,
      idempotencyKey
    );

    if (result.fromCache) {
      res.setHeader('X-Cache', 'HIT');
    }

    res.status(200).json({
      success: true,
      message: result.fromCache
        ? 'Sales return retrieved from idempotent cache'
        : 'Sales return processed successfully',
      data: result,
    });
  })
);

billingRouter.get(
  '/invoices/:invoiceId/returns',
  ...tenantAuth,
  requirePermission('billing.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { invoiceId } = req.params;

    const invoice = await BillingTransactionService.getInvoice(tenantId, invoiceId!);
    assertInvoiceBranchReadAccess(req, invoice.branchId);

    res.status(200).json({
      success: true,
      data: invoice.returns || [],
    });
  })
);

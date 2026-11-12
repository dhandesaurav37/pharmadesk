import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { BillingTransactionService } from '../services/billingTransactionService';
import { asyncHandler } from '../lib/asyncHandler';
import { BadRequestError } from '../lib/errors';

export const billingRouter = Router();

// Mandatory authentication and tenant context
billingRouter.use(firebaseAuthMiddleware);
billingRouter.use(tenantAuthorizationMiddleware);

// ==========================================
// Zod Request Validation Schemas
// ==========================================
const cartItemSchema = z.object({
  medicineId: z.string().min(1, 'Medicine ID is required'),
  batchId: z.string().optional(), // If omitted, FEFO allocates automatically across earliest batches
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
  customer: z.object({
    name: z.string().min(1, 'Customer name is required'),
    phone: z.string().optional(),
    doctorName: z.string().optional(),
    doctorRegNumber: z.string().optional(),
    address: z.string().optional(),
    gstin: z.string().optional(),
  }),
  items: z.array(cartItemSchema).min(1, 'Invoice must contain at least one medicine item'),
  payments: z.array(paymentEntrySchema).optional(),
  paymentMode: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'khata_credit']).optional(),
  isInterState: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

const paymentRecordSchema = z.object({
  mode: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'khata_credit']),
  amount: z.number().positive('Payment amount must be greater than zero'),
  referenceNumber: z.string().optional(),
});

const returnItemSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
  quantity: z.number().int().positive('Return quantity must be greater than zero'),
  reason: z.string().optional(),
  restock: z.boolean().optional().default(true),
});

const salesReturnSchema = z.object({
  items: z.array(returnItemSchema).min(1, 'Return must contain at least one item'),
  reason: z.string().min(3, 'Return reason must be at least 3 characters'),
});

const cancelInvoiceSchema = z.object({
  reason: z.string().min(3, 'Cancellation reason must be at least 3 characters'),
});

// ==========================================
// POS Endpoints
// ==========================================

/**
 * GET /api/v1/pos/medicines
 * Search medicines for the POS terminal with available batches, stock, and pricing.
 */
billingRouter.get(
  '/pos/medicines',
  requirePermission('billing.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId } = req.tenantContext!;
    const { query } = req.query;

    const medicines = await BillingTransactionService.getPOSMedicines(
      tenantId,
      branchId || 'main',
      query as string | undefined
    );

    res.status(200).json({
      success: true,
      data: medicines,
    });
  })
);

/**
 * GET /api/v1/pos/medicines/:medicineId/batches
 * Get eligible, non-expired batches for a medicine sorted by FEFO (earliest expiry first).
 */
billingRouter.get(
  '/pos/medicines/:medicineId/batches',
  requirePermission('billing.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId } = req.tenantContext!;
    const { medicineId } = req.params;

    const allocations = await BillingTransactionService.allocateBatchesFEFO(
      tenantId,
      branchId || 'main',
      medicineId!,
      1
    ).catch(() => []);

    res.status(200).json({
      success: true,
      data: allocations.map((a) => a.batch),
    });
  })
);

/**
 * POST /api/v1/pos/checkout
 * Primary POS checkout endpoint: creates invoice, decrements batch stock, logs movements and payments.
 */
billingRouter.post(
  '/pos/checkout',
  requirePermission('billing.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;

    const idempotencyKey =
      (req.headers['x-idempotency-key'] as string) ||
      (req.headers['idempotency-key'] as string) ||
      req.body.idempotencyKey;

    if (!idempotencyKey) {
      throw new BadRequestError('Idempotency key must be provided via X-Idempotency-Key header or request body');
    }

    const validated = checkoutSchema.parse(req.body);

    const result = await BillingTransactionService.createSalesInvoice({
      tenantId,
      branchId: branchId || 'main',
      userId,
      idempotencyKey,
      customer: validated.customer,
      items: validated.items,
      payments: validated.payments,
      paymentMode: validated.paymentMode,
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
  })
);

// ==========================================
// Invoices Endpoints
// ==========================================

/**
 * POST /api/v1/invoices and /:tenantId/invoices
 * Direct alias for POS checkout to support existing Phase 3 client routes.
 */
const handleInvoiceCreation = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, branchId, userId } = req.tenantContext!;

  const idempotencyKey =
    (req.headers['x-idempotency-key'] as string) ||
    (req.headers['idempotency-key'] as string) ||
    req.body.idempotencyKey;

  if (!idempotencyKey) {
    throw new BadRequestError('Idempotency key must be provided via X-Idempotency-Key header or request body');
  }

  const validated = checkoutSchema.parse(req.body);

  const result = await BillingTransactionService.createSalesInvoice({
    tenantId,
    branchId: branchId || 'main',
    userId,
    idempotencyKey,
    customer: validated.customer,
    items: validated.items,
    payments: validated.payments,
    paymentMode: validated.paymentMode,
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

billingRouter.post('/invoices', requirePermission('billing.create'), handleInvoiceCreation);
billingRouter.post('/:tenantId/invoices', requirePermission('billing.create'), handleInvoiceCreation);

/**
 * GET /api/v1/invoices and /:tenantId/invoices
 * Lists sales invoices with search, filters, and pagination.
 */
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

billingRouter.get('/invoices', requirePermission('billing.view'), handleInvoiceList);
billingRouter.get('/:tenantId/invoices', requirePermission('billing.view'), handleInvoiceList);

/**
 * GET /api/v1/invoices/:invoiceId
 * Get specific sales invoice details.
 */
billingRouter.get(
  '/invoices/:invoiceId',
  requirePermission('billing.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { invoiceId } = req.params;

    const invoice = await BillingTransactionService.getInvoice(tenantId, invoiceId!);

    res.status(200).json({
      success: true,
      data: invoice,
    });
  })
);

/**
 * GET /api/v1/invoices/:invoiceId/print
 * Get printable invoice snapshot with GST summary and store metadata.
 */
billingRouter.get(
  '/invoices/:invoiceId/print',
  requirePermission('billing.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { invoiceId } = req.params;

    const printData = await BillingTransactionService.getInvoicePrintData(tenantId, invoiceId!);

    res.status(200).json({
      success: true,
      data: printData,
    });
  })
);

/**
 * POST /api/v1/invoices/:invoiceId/cancel
 * Cancel an issued invoice with stock recovery and audit log.
 */
billingRouter.post(
  '/invoices/:invoiceId/cancel',
  requirePermission('billing.cancel'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;
    const { invoiceId } = req.params;
    const validated = cancelInvoiceSchema.parse(req.body);

    const cancelled = await BillingTransactionService.cancelSalesInvoice(
      tenantId,
      branchId || 'main',
      invoiceId!,
      validated.reason,
      userId
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

/**
 * POST /api/v1/invoices/:invoiceId/payments
 * Records a payment against an invoice (for balance settlements or split payments).
 */
billingRouter.post(
  '/invoices/:invoiceId/payments',
  requirePermission('billing.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;
    const { invoiceId } = req.params;
    const validated = paymentRecordSchema.parse(req.body);

    const updated = await BillingTransactionService.recordPayment(
      tenantId,
      branchId || 'main',
      invoiceId!,
      validated,
      userId
    );

    res.status(200).json({
      success: true,
      message: 'Payment recorded successfully',
      data: updated,
    });
  })
);

/**
 * GET /api/v1/invoices/:invoiceId/payments
 * Get payment records for an invoice.
 */
billingRouter.get(
  '/invoices/:invoiceId/payments',
  requirePermission('billing.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { invoiceId } = req.params;

    const invoice = await BillingTransactionService.getInvoice(tenantId, invoiceId!);

    res.status(200).json({
      success: true,
      data: invoice.payments || [],
    });
  })
);

// ==========================================
// Sales Returns Endpoints
// ==========================================

/**
 * POST /api/v1/invoices/:invoiceId/returns
 * Process a partial or complete sales return with stock restock and proportional refund calculation.
 */
billingRouter.post(
  '/invoices/:invoiceId/returns',
  requirePermission('billing.return'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;
    const { invoiceId } = req.params;
    const validated = salesReturnSchema.parse(req.body);

    const result = await BillingTransactionService.processSalesReturn(
      tenantId,
      branchId || 'main',
      invoiceId!,
      validated,
      userId
    );

    res.status(200).json({
      success: true,
      message: 'Sales return processed successfully',
      data: result,
    });
  })
);

/**
 * GET /api/v1/invoices/:invoiceId/returns
 * Get sales returns history for an invoice.
 */
billingRouter.get(
  '/invoices/:invoiceId/returns',
  requirePermission('billing.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { invoiceId } = req.params;

    const invoice = await BillingTransactionService.getInvoice(tenantId, invoiceId!);

    res.status(200).json({
      success: true,
      data: invoice.returns || [],
    });
  })
);

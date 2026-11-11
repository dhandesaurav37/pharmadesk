import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { BillingTransactionService } from '../services/billingTransactionService';
import { asyncHandler } from '../lib/asyncHandler';
import { BadRequestError } from '../lib/errors';

export const billingRouter = Router();

billingRouter.use(firebaseAuthMiddleware);

const invoiceItemSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
  medicineId: z.string().min(1, 'Medicine ID is required'),
  medicineName: z.string().min(1, 'Medicine name is required'),
  quantity: z.number().int().positive('Quantity must be an integer greater than zero'),
  unitPrice: z.number().positive('Unit price must be positive'),
  mrp: z.number().positive('MRP must be positive'),
  gstRate: z.number().min(0).max(28, 'GST rate must be between 0% and 28%'),
  hsnCode: z.string().optional(),
  discountPercent: z.number().min(0).max(100).optional().default(0),
});

const createInvoiceSchema = z.object({
  idempotencyKey: z.string().min(8, 'Idempotency key must be at least 8 characters').optional(),
  customer: z.object({
    name: z.string().min(1, 'Customer name is required'),
    phone: z.string().optional(),
    doctorName: z.string().optional(),
    doctorRegNumber: z.string().optional(),
  }),
  items: z.array(invoiceItemSchema).min(1, 'Invoice must contain at least one medicine item'),
  paymentMode: z.enum(['cash', 'upi', 'card', 'credit']).default('cash'),
  notes: z.string().optional(),
});

/**
 * POST /api/v1/tenants/:tenantId/invoices
 * Atomic sales invoice generation with stock decrement and idempotency.
 */
billingRouter.post(
  '/:tenantId/invoices',
  tenantAuthorizationMiddleware,
  requirePermission('billing:create'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;

    const idempotencyKey =
      (req.headers['x-idempotency-key'] as string) ||
      req.body.idempotencyKey;

    if (!idempotencyKey) {
      throw new BadRequestError('Idempotency key must be provided via X-Idempotency-Key header or request body');
    }

    const validated = createInvoiceSchema.parse(req.body);

    const result = await BillingTransactionService.createSalesInvoice({
      tenantId,
      branchId: branchId || 'main',
      userId,
      idempotencyKey,
      customer: validated.customer,
      items: validated.items,
      paymentMode: validated.paymentMode,
      notes: validated.notes,
    });

    res.status(201).json({
      success: true,
      message: 'Sales invoice generated successfully',
      data: result,
    });
  })
);

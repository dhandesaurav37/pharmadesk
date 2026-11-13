import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission } from '../middleware/requirePermission';
import { asyncHandler } from '../lib/asyncHandler';
import { BadRequestError } from '../lib/errors';
import { CustomerService, ViewerAccess } from '../services/customerService';

export const customerRouter = Router({ mergeParams: true });

const tenantAuth = [firebaseAuthMiddleware, tenantAuthorizationMiddleware];

function getViewer(req: Request): ViewerAccess {
  const ctx = req.tenantContext!;
  return {
    role: ctx.role,
    permissions: ctx.permissions,
    assignedBranchIds: ctx.assignedBranchIds,
  };
}

function extractIdempotencyKey(req: Request): string | undefined {
  const raw =
    (req.headers['x-idempotency-key'] as string) ||
    (req.headers['idempotency-key'] as string) ||
    (req.body?.idempotencyKey as string | undefined);
  return raw ? String(raw).trim() : undefined;
}

// ==========================================
// Zod Validation Schemas
// ==========================================

const customerTypeEnum = z.enum([
  'REGULAR',
  'VIP',
  'CHRONIC',
  'CORPORATE',
  'CLINIC',
  'SENIOR_CITIZEN',
]);

const genderEnum = z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']);
const creditTermsUnion = z.union([z.literal(0), z.literal(7), z.literal(15), z.literal(30)]);

const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(120),
  phone: z.string().trim().min(7, 'Customer mobile number is required').max(20),
  alternatePhone: z.string().trim().max(20).optional(),
  email: z.string().trim().email('Invalid email format').optional().or(z.literal('')),
  customerType: customerTypeEnum.optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(12).optional(),
  dateOfBirth: z.string().trim().max(30).optional(),
  gender: genderEnum.optional(),
  preferredDoctorName: z.string().trim().max(120).optional(),
  allergies: z.string().trim().max(500).optional(),
  chronicConditions: z.string().trim().max(500).optional(),
  gstin: z.string().trim().max(20).optional(),
  primaryBranchId: z.string().trim().max(64).optional(),
  creditEnabled: z.boolean().optional(),
  creditLimit: z.number().finite().min(0, 'Credit limit cannot be negative').optional(),
  creditTermsDays: creditTermsUnion.optional(),
  openingBalance: z.number().finite().min(0, 'Opening balance cannot be negative').optional(),
  notes: z.string().trim().max(1000).optional(),
  confirmSharedPhone: z.boolean().optional(),
});

const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(120).optional(),
    phone: z.string().trim().min(7).max(20).optional(),
    alternatePhone: z.string().trim().max(20).nullable().optional(),
    email: z.string().trim().email('Invalid email format').nullable().optional().or(z.literal('')),
    customerType: customerTypeEnum.optional(),
    address: z.string().trim().max(300).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    state: z.string().trim().max(100).nullable().optional(),
    pincode: z.string().trim().max(12).nullable().optional(),
    dateOfBirth: z.string().trim().max(30).nullable().optional(),
    gender: genderEnum.nullable().optional(),
    preferredDoctorName: z.string().trim().max(120).nullable().optional(),
    allergies: z.string().trim().max(500).nullable().optional(),
    chronicConditions: z.string().trim().max(500).nullable().optional(),
    gstin: z.string().trim().max(20).nullable().optional(),
    primaryBranchId: z.string().trim().max(64).optional(),
    creditEnabled: z.boolean().optional(),
    creditTermsDays: creditTermsUnion.optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    confirmSharedPhone: z.boolean().optional(),
  })
  .passthrough();

const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']),
  reason: z.string().trim().max(500).optional(),
});

const archiveSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const creditLimitSchema = z.object({
  creditLimit: z.number().finite().min(0, 'Credit limit cannot be negative'),
  creditEnabled: z.boolean().optional(),
  creditTermsDays: creditTermsUnion.optional(),
  reason: z.string().trim().max(500).optional(),
});

const collectPaymentSchema = z.object({
  idempotencyKey: z.string().min(8).optional(),
  amount: z.number().finite().positive('Payment amount must be greater than zero'),
  paymentMode: z.enum(['cash', 'upi', 'card', 'bank_transfer']),
  referenceNumber: z.string().trim().max(100).optional(),
  paymentDate: z.string().trim().max(40).optional(),
  invoiceId: z.string().trim().min(1).optional(),
  allowAdvance: z.boolean().optional().default(false),
  notes: z.string().trim().max(500).optional(),
});

const creditNoteSchema = z.object({
  idempotencyKey: z.string().min(8).optional(),
  amount: z.number().finite().positive('Credit note amount must be greater than zero'),
  reason: z.string().trim().min(3, 'Credit note reason must be at least 3 characters').max(500),
  invoiceId: z.string().trim().min(1).optional(),
  returnId: z.string().trim().min(1).optional(),
  notes: z.string().trim().max(500).optional(),
  reduceInvoiceDue: z.boolean().optional().default(true),
});

const adjustmentSchema = z.object({
  idempotencyKey: z.string().min(8).optional(),
  adjustmentType: z.enum(['DEBIT_ADJUSTMENT', 'CREDIT_ADJUSTMENT', 'OPENING_BALANCE', 'REFUND']),
  amount: z.number().finite().positive('Adjustment amount must be greater than zero'),
  reason: z.string().trim().min(3, 'Adjustment reason must be at least 3 characters').max(500),
  referenceNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

const exportStatementSchema = z.object({
  format: z.enum(['csv', 'pdf']).optional().default('pdf'),
  dateFrom: z.string().trim().max(40).optional(),
  dateTo: z.string().trim().max(40).optional(),
});

const whatsappShareSchema = z.object({
  dateFrom: z.string().trim().max(40).optional(),
  dateTo: z.string().trim().max(40).optional(),
  storeName: z.string().trim().max(120).optional(),
});

// ==========================================
// Static Credit & Khata Reports (Must precede /:customerId)
// ==========================================

customerRouter.get(
  '/reports/outstanding',
  ...tenantAuth,
  requirePermission('customers.reports_view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { branchId, customerType, search } = req.query;

    const report = await CustomerService.getOutstandingReport(
      tenantId,
      {
        branchId: branchId as string | undefined,
        customerType: customerType as string | undefined,
        search: search as string | undefined,
      },
      getViewer(req)
    );

    res.status(200).json({
      success: true,
      data: report,
    });
  })
);

customerRouter.get(
  '/reports/overdue',
  ...tenantAuth,
  requirePermission('customers.reports_view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { branchId, minDaysOverdue } = req.query;

    const report = await CustomerService.getOverdueReport(
      tenantId,
      {
        branchId: branchId as string | undefined,
        minDaysOverdue: minDaysOverdue ? Number(minDaysOverdue) : undefined,
      },
      getViewer(req)
    );

    res.status(200).json({
      success: true,
      data: report,
    });
  })
);

customerRouter.get(
  '/reports/credit-summary',
  ...tenantAuth,
  requirePermission('customers.reports_view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { branchId } = req.query;

    const summary = await CustomerService.getCreditSummaryDashboard(
      tenantId,
      branchId as string | undefined,
      getViewer(req)
    );

    res.status(200).json({
      success: true,
      data: summary,
    });
  })
);

// ==========================================
// Customer Directory CRUD & Lifecycle
// ==========================================

customerRouter.get(
  '/',
  ...tenantAuth,
  requirePermission('customers.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const {
      search,
      customerType,
      status,
      includeArchived,
      hasOutstanding,
      overLimit,
      overdue,
      branchId,
      page,
      limit,
    } = req.query;

    const result = await CustomerService.listCustomers(
      tenantId,
      {
        search: search as string | undefined,
        customerType: customerType as string | undefined,
        status: status as string | undefined,
        includeArchived: includeArchived === 'true',
        hasOutstanding: hasOutstanding === 'true',
        overLimit: overLimit === 'true',
        overdue: overdue === 'true',
        branchId: branchId as string | undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 25,
      },
      getViewer(req)
    );

    res.status(200).json({
      success: true,
      data: result.customers,
      pagination: {
        page: result.page,
        limit: result.limit,
        totalCount: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
      },
    });
  })
);

customerRouter.post(
  '/',
  ...tenantAuth,
  requirePermission('customers.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;
    const validated = createCustomerSchema.parse(req.body);

    const created = await CustomerService.createCustomer(
      tenantId,
      branchId,
      {
        ...validated,
        email: validated.email || undefined,
      },
      userId,
      req.user?.email,
      getViewer(req)
    );

    res.status(201).json({
      success: true,
      message: `Customer '${created.name}' created successfully`,
      data: created,
    });
  })
);

customerRouter.get(
  '/:customerId',
  ...tenantAuth,
  requirePermission('customers.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { customerId } = req.params;

    const customer = await CustomerService.getCustomerById(
      tenantId,
      customerId!,
      getViewer(req)
    );

    res.status(200).json({
      success: true,
      data: customer,
    });
  })
);

customerRouter.patch(
  '/:customerId',
  ...tenantAuth,
  requirePermission('customers.update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const { customerId } = req.params;
    const validated = updateCustomerSchema.parse(req.body);

    const updated = await CustomerService.updateCustomer(
      tenantId,
      customerId!,
      {
        ...validated,
        email: validated.email === '' ? null : validated.email,
      },
      userId,
      getViewer(req)
    );

    res.status(200).json({
      success: true,
      message: `Customer '${updated.name}' updated successfully`,
      data: updated,
    });
  })
);

customerRouter.patch(
  '/:customerId/status',
  ...tenantAuth,
  requirePermission('customers.update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const { customerId } = req.params;
    const validated = updateStatusSchema.parse(req.body);

    const updated = await CustomerService.updateCustomerStatus(
      tenantId,
      customerId!,
      validated.status,
      validated.reason,
      userId,
      getViewer(req)
    );

    res.status(200).json({
      success: true,
      message: `Customer status updated to ${updated.status}`,
      data: updated,
    });
  })
);

const handleArchiveCustomer = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = req.tenantContext!;
  const { customerId } = req.params;
  const validated = archiveSchema.parse(req.body || {});

  const archived = await CustomerService.archiveCustomer(
    tenantId,
    customerId!,
    validated.reason,
    userId,
    getViewer(req)
  );

  res.status(200).json({
    success: true,
    message: `Customer '${archived.name}' has been archived`,
    data: archived,
  });
});

customerRouter.post('/:customerId/archive', ...tenantAuth, requirePermission('customers.archive'), handleArchiveCustomer);
customerRouter.delete('/:customerId/archive', ...tenantAuth, requirePermission('customers.archive'), handleArchiveCustomer);

// ==========================================
// Purchase History & Khata Ledger
// ==========================================

customerRouter.get(
  '/:customerId/purchases',
  ...tenantAuth,
  requirePermission('customers.view_purchase_history'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { customerId } = req.params;
    const { dateFrom, dateTo, paymentStatus, search, branchId, page, limit } = req.query;

    const history = await CustomerService.getCustomerPurchases(
      tenantId,
      customerId!,
      {
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        paymentStatus: paymentStatus as string | undefined,
        search: search as string | undefined,
        branchId: branchId as string | undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 25,
      },
      getViewer(req)
    );

    res.status(200).json({
      success: true,
      data: history.invoices,
      summary: history.summary,
      pagination: {
        page: history.page,
        limit: history.limit,
        totalCount: history.total,
        totalPages: history.totalPages,
        hasNext: history.page < history.totalPages,
      },
    });
  })
);

customerRouter.get(
  '/:customerId/ledger',
  ...tenantAuth,
  requirePermission('customers.khata_view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { customerId } = req.params;
    const { dateFrom, dateTo, entryType, page, limit } = req.query;

    const result = await CustomerService.getCustomerLedger(tenantId, customerId!, {
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      entryType: entryType as string | undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });

    res.status(200).json({
      success: true,
      data: result.entries,
      pagination: {
        page: result.page,
        limit: result.limit,
        totalCount: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
      },
    });
  })
);

customerRouter.get(
  '/:customerId/ledger/reconcile',
  ...tenantAuth,
  requirePermission('customers.khata_view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { customerId } = req.params;

    const reconciliation = await CustomerService.reconcileCustomerBalance(tenantId, customerId!);

    res.status(200).json({
      success: true,
      data: reconciliation,
    });
  })
);

// ==========================================
// Khata Payments, Credit Limits, Credit Notes & Adjustments
// ==========================================

customerRouter.get(
  '/:customerId/payments',
  ...tenantAuth,
  requirePermission('customers.khata_view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { customerId } = req.params;

    const payments = await CustomerService.listCustomerPayments(tenantId, customerId!);

    res.status(200).json({
      success: true,
      data: payments,
    });
  })
);

customerRouter.post(
  '/:customerId/payments',
  ...tenantAuth,
  requirePermission('customers.khata_collect'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;
    const { customerId } = req.params;

    const idempotencyKey = extractIdempotencyKey(req);
    if (!idempotencyKey) {
      throw new BadRequestError('Idempotency key must be provided via X-Idempotency-Key header or request body');
    }

    const validated = collectPaymentSchema.parse(req.body);
    const result = await CustomerService.collectKhataPayment({
      tenantId,
      branchId,
      customerId: customerId!,
      amount: validated.amount,
      paymentMode: validated.paymentMode,
      referenceNumber: validated.referenceNumber,
      paymentDate: validated.paymentDate,
      invoiceId: validated.invoiceId,
      allowAdvance: validated.allowAdvance,
      notes: validated.notes,
      userId,
      userName: req.user?.email || userId,
      idempotencyKey,
    });

    if (result.fromCache) {
      res.setHeader('X-Cache', 'HIT');
    }

    res.status(result.fromCache ? 200 : 201).json({
      success: true,
      message: result.fromCache
        ? 'Khata payment retrieved from idempotent cache'
        : `Payment receipt ${result.payment.receiptNumber} recorded`,
      data: {
        payment: result.payment,
        customer: CustomerService.sanitizeCustomerForViewer(result.customer, getViewer(req)),
        ledgerEntry: result.ledgerEntry,
        fromCache: result.fromCache,
      },
    });
  })
);

customerRouter.patch(
  '/:customerId/credit-limit',
  ...tenantAuth,
  requirePermission('customers.credit_limit_manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const { customerId } = req.params;
    const validated = creditLimitSchema.parse(req.body);

    const updated = await CustomerService.updateCreditLimit(
      tenantId,
      customerId!,
      validated,
      userId,
      getViewer(req)
    );

    res.status(200).json({
      success: true,
      message: `Credit policy updated for '${updated.name}'`,
      data: updated,
    });
  })
);

customerRouter.post(
  '/:customerId/credit-notes',
  ...tenantAuth,
  requirePermission('customers.credit_note'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;
    const { customerId } = req.params;

    const idempotencyKey = extractIdempotencyKey(req);
    if (!idempotencyKey) {
      throw new BadRequestError('Idempotency key must be provided via X-Idempotency-Key header or request body');
    }

    const validated = creditNoteSchema.parse(req.body);
    const result = await CustomerService.issueCreditNote({
      tenantId,
      branchId,
      customerId: customerId!,
      amount: validated.amount,
      reason: validated.reason,
      invoiceId: validated.invoiceId,
      returnId: validated.returnId,
      notes: validated.notes,
      reduceInvoiceDue: validated.reduceInvoiceDue,
      userId,
      userName: req.user?.email || userId,
      idempotencyKey,
    });

    if (result.fromCache) {
      res.setHeader('X-Cache', 'HIT');
    }

    res.status(result.fromCache ? 200 : 201).json({
      success: true,
      message: result.fromCache
        ? 'Credit note retrieved from idempotent cache'
        : 'Credit note issued successfully',
      data: {
        ledgerEntry: result.ledgerEntry,
        customer: CustomerService.sanitizeCustomerForViewer(result.customer, getViewer(req)),
        fromCache: result.fromCache,
      },
    });
  })
);

customerRouter.post(
  '/:customerId/adjustments',
  ...tenantAuth,
  requirePermission('customers.balance_adjust'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;
    const { customerId } = req.params;

    const idempotencyKey = extractIdempotencyKey(req);
    if (!idempotencyKey) {
      throw new BadRequestError('Idempotency key must be provided via X-Idempotency-Key header or request body');
    }

    const validated = adjustmentSchema.parse(req.body);
    const result = await CustomerService.createBalanceAdjustment({
      tenantId,
      branchId,
      customerId: customerId!,
      adjustmentType: validated.adjustmentType,
      amount: validated.amount,
      reason: validated.reason,
      referenceNumber: validated.referenceNumber,
      notes: validated.notes,
      userId,
      userName: req.user?.email || userId,
      idempotencyKey,
    });

    if (result.fromCache) {
      res.setHeader('X-Cache', 'HIT');
    }

    res.status(result.fromCache ? 200 : 201).json({
      success: true,
      message: result.fromCache
        ? 'Balance adjustment retrieved from idempotent cache'
        : 'Khata balance adjustment recorded',
      data: {
        ledgerEntry: result.ledgerEntry,
        customer: CustomerService.sanitizeCustomerForViewer(result.customer, getViewer(req)),
        fromCache: result.fromCache,
      },
    });
  })
);

// ==========================================
// Statements, Exports & WhatsApp Share
// ==========================================

customerRouter.get(
  '/:customerId/statement',
  ...tenantAuth,
  requirePermission('customers.statement_view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const { customerId } = req.params;
    const { dateFrom, dateTo } = req.query;

    const statement = await CustomerService.getCustomerStatement(
      tenantId,
      customerId!,
      {
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
      },
      getViewer(req)
    );

    res.status(200).json({
      success: true,
      data: statement,
    });
  })
);

customerRouter.post(
  '/:customerId/statement/export',
  ...tenantAuth,
  requirePermission('customers.statement_export'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, branchId, userId } = req.tenantContext!;
    const { customerId } = req.params;
    const validated = exportStatementSchema.parse(req.body || {});

    const exported = await CustomerService.exportCustomerStatement(
      tenantId,
      branchId,
      customerId!,
      validated.format,
      {
        dateFrom: validated.dateFrom,
        dateTo: validated.dateTo,
      },
      userId,
      getViewer(req)
    );

    res.status(200).json({
      success: true,
      message: `Statement exported as ${validated.format.toUpperCase()}`,
      data: exported,
    });
  })
);

customerRouter.post(
  '/:customerId/statement/whatsapp',
  ...tenantAuth,
  requirePermission('customers.statement_share'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const { customerId } = req.params;
    const validated = whatsappShareSchema.parse(req.body || {});

    const prepared = await CustomerService.prepareWhatsAppStatement(
      tenantId,
      customerId!,
      {
        dateFrom: validated.dateFrom,
        dateTo: validated.dateTo,
        storeName: validated.storeName,
      },
      userId,
      getViewer(req)
    );

    res.status(200).json({
      success: true,
      data: prepared,
    });
  })
);

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { healthRouter } from './health.routes';
import { authRouter } from './auth.routes';
import { tenantRouter } from './tenant.routes';
import { billingRouter } from './billing.routes';
import { storageRouter } from './storage.routes';
import { employeeRouter } from './employee.routes';
import { medicineRouter } from './medicine.routes';
import { inventoryRouter } from './inventory.routes';
import { customerRouter } from './customer.routes';
import { supplierRouter } from './supplier.routes';
import { procurementRouter } from './procurement.routes';
import { accountingRouter } from './accounting.routes';
import { expenseRouter } from './expense.routes';
import { branchRouter } from './branch.routes';
import { stockTransferRouter } from './stockTransfer.routes';
import { multiBranchReportRouter } from './multiBranchReport.routes';
import { securityRouter } from './security.routes';
import { env } from '../config/env';
import { asyncHandler } from '../lib/asyncHandler';

export const apiRouter = Router();

/**
 * Root API metadata endpoint: GET /api/v1
 */
apiRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    name: 'PharmaDesk Backend API',
    version: '1.0.0',
    phase: 'Phase 11 - Security Hardening, Data Protection & Disaster Recovery',
    status: 'operational',
    region: 'asia-south1',
    environment: env.NODE_ENV,
    primaryDatabase: 'Cloud Firestore',
    identityProvider: 'Firebase Authentication',
    fileStorage: 'Firebase Storage',
    documentation: 'https://github.com/dhandesaurav52/pharmadesk/tree/main/docs',
  });
});

/**
 * Health check endpoints: /api/v1/health/live, /api/v1/health/ready
 */
apiRouter.use('/health', healthRouter);

/**
 * Authentication and current profile routes: /api/v1/auth
 */
apiRouter.use('/auth', authRouter);

/**
 * Tenant onboarding and management: /api/v1/tenants
 */
apiRouter.use('/tenants', tenantRouter);

/**
 * Medicine catalogue: /api/v1/medicines and /api/v1/tenants/:tenantId/medicines
 */
apiRouter.use('/tenants/:tenantId/medicines', medicineRouter);
apiRouter.use('/medicines', medicineRouter);

/**
 * Batch-level inventory & ledger: /api/v1/inventory and /api/v1/tenants/:tenantId/inventory
 */
apiRouter.use('/tenants/:tenantId/inventory', inventoryRouter);
apiRouter.use('/inventory', inventoryRouter);

/**
 * Customer directory, Khata credit ledger & reports: /api/v1/customers and /api/v1/tenants/:tenantId/customers
 */
apiRouter.use('/tenants/:tenantId/customers', customerRouter);
apiRouter.use('/customers', customerRouter);

/**
 * Supplier directory, statements & procurement:
 * /api/v1/suppliers, /api/v1/purchase-orders, /api/v1/goods-receipts, /api/v1/supplier-invoices, etc.
 */
apiRouter.use('/tenants/:tenantId/suppliers', supplierRouter);
apiRouter.use('/suppliers', supplierRouter);
apiRouter.use('/tenants/:tenantId/accounting', accountingRouter);
apiRouter.use('/accounting', accountingRouter);
apiRouter.use('/tenants/:tenantId/expenses', expenseRouter);
apiRouter.use('/expenses', expenseRouter);
apiRouter.use('/tenants/:tenantId/branches', branchRouter);
apiRouter.use('/branches', branchRouter);
apiRouter.use('/tenants/:tenantId/stock-transfers', stockTransferRouter);
apiRouter.use('/stock-transfers', stockTransferRouter);
apiRouter.use('/tenants/:tenantId/reports', multiBranchReportRouter);
apiRouter.use('/reports', multiBranchReportRouter);
apiRouter.use('/tenants/:tenantId/security', securityRouter);
apiRouter.use('/security', securityRouter);
apiRouter.use('/tenants/:tenantId', procurementRouter);
apiRouter.use('/', procurementRouter);

/**
 * POS Billing and transactional sales invoices: /api/v1/pos, /api/v1/invoices, /api/v1/tenants/:tenantId/invoices
 */
apiRouter.use('/tenants', billingRouter);
apiRouter.use('/', billingRouter);

/**
 * Firebase Storage signed URLs: /api/v1/tenants/:tenantId/storage
 */
apiRouter.use('/tenants', storageRouter);

/**
 * Employee, RBAC & Invitation routes: /api/v1/tenants/:tenantId/employees, /api/v1/invitations, /api/v1/permissions
 */
apiRouter.use('/', employeeRouter);

/**
 * Test endpoints for verifying RFC 7807 error handling in test/dev environments
 */
if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
  // Test route for simulating unexpected 500 errors
  apiRouter.get('/test/unexpected-error', () => {
    throw new Error('Simulated unexpected backend fault for error handler testing');
  });

  // Test route for simulating 422 validation errors
  const testValidationSchema = z.object({
    pharmacyName: z.string().min(3, 'Pharmacy name must be at least 3 characters'),
    pincode: z.string().regex(/^\d{6}$/, 'Pincode must be exactly 6 digits'),
  });

  apiRouter.post(
    '/test/validation',
    asyncHandler(async (req: Request, res: Response) => {
      const result = testValidationSchema.safeParse(req.body);
      if (!result.success) {
        throw result.error; // Caught by errorHandlerMiddleware as ZodError
      }
      res.status(200).json({ success: true, data: result.data });
    })
  );
}

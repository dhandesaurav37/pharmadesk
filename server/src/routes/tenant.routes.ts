import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission, requireRole } from '../middleware/requirePermission';
import { TenantService } from '../services/tenantService';
import { asyncHandler } from '../lib/asyncHandler';

export const tenantRouter = Router();

// 1. All tenant routes require authenticated user
tenantRouter.use(firebaseAuthMiddleware);

const createTenantSchema = z.object({
  tenantId: z
    .string()
    .min(3, 'Tenant ID must be at least 3 characters')
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Tenant ID must only contain lowercase alphanumeric characters and hyphens'),
  name: z.string().min(2, 'Pharmacy name must be at least 2 characters'),
  legalName: z.string().optional(),
  dlNumber20B: z.string().min(3, 'Drug License 20B is required'),
  dlNumber21B: z.string().min(3, 'Drug License 21B is required'),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format').optional().or(z.literal('')),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format').optional().or(z.literal('')),
  fssaiNumber: z.string().optional(),
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be exactly 6 digits'),
  contactPhone: z.string().min(10, 'Contact phone is required'),
  contactEmail: z.string().email('Valid contact email is required'),
});

/**
 * POST /api/v1/tenants
 * Onboards a new pharmacy with initial branch and owner account.
 */
tenantRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const validatedData = createTenantSchema.parse(req.body);
    const ownerId = req.user!.uid;

    const result = await TenantService.createTenant(ownerId, validatedData);
    res.status(201).json({
      success: true,
      message: 'Pharmacy tenant successfully provisioned',
      data: result,
    });
  })
);

/**
 * GET /api/v1/tenants/:tenantId
 * Retrieves pharmacy details. Requires tenant authorization.
 */
tenantRouter.get(
  '/:tenantId',
  tenantAuthorizationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const tenant = await TenantService.getTenant(tenantId);
    res.status(200).json({ success: true, data: tenant });
  })
);

const inviteMemberSchema = z.object({
  userId: z.string().min(1, 'Target user ID is required'),
  email: z.string().email('Valid email is required'),
  name: z.string().optional(),
  role: z.enum(['pharmacist', 'cashier', 'helper', 'auditor']),
  assignedBranchIds: z.array(z.string()).default(['main']),
  permissions: z.array(z.string()).optional(),
});

/**
 * POST /api/v1/tenants/:tenantId/members
 * Invites or registers an employee in the pharmacy.
 */
tenantRouter.post(
  '/:tenantId/members',
  tenantAuthorizationMiddleware,
  requirePermission('employees:manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenantContext!;
    const validated = inviteMemberSchema.parse(req.body);

    const membership = await TenantService.addMember(tenantId, userId, validated);
    res.status(201).json({
      success: true,
      message: 'Employee successfully added to pharmacy',
      data: membership,
    });
  })
);

const updateStatusSchema = z.object({
  status: z.enum(['active', 'deactivated', 'suspended']),
});

/**
 * PATCH /api/v1/tenants/:tenantId/members/:userId/status
 * Updates employee status (e.g. instant deactivation). Only pharmacy owner can change status.
 */
tenantRouter.patch(
  '/:tenantId/members/:userId/status',
  tenantAuthorizationMiddleware,
  requireRole('owner'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId: actingOwnerId } = req.tenantContext!;
    const targetUserId = req.params.userId!;
    const { status } = updateStatusSchema.parse(req.body);

    const updated = await TenantService.updateMemberStatus(
      tenantId,
      targetUserId,
      status,
      actingOwnerId
    );

    res.status(200).json({
      success: true,
      message: `Employee status successfully updated to ${status}`,
      data: updated,
    });
  })
);

/**
 * GET /api/v1/tenants/:tenantId/members
 * Lists all employee memberships in the pharmacy.
 */
tenantRouter.get(
  '/:tenantId/members',
  tenantAuthorizationMiddleware,
  requirePermission('employees.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const members = await TenantService.listMembers(tenantId);
    res.status(200).json({ success: true, data: members });
  })
);

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';
import { tenantAuthorizationMiddleware } from '../middleware/tenantAuthorization';
import { requirePermission, requireRole } from '../middleware/requirePermission';
import { EmployeeService } from '../services/employeeService';
import { TenantService } from '../services/tenantService';
import { ALL_PERMISSIONS } from '../lib/permissions';
import { asyncHandler } from '../lib/asyncHandler';
import { BadRequestError, NotFoundError } from '../lib/errors';

export const employeeRouter = Router();

// Public metadata of available system permissions
employeeRouter.get('/permissions', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: ALL_PERMISSIONS,
  });
});

const acceptInvitationSchema = z.object({
  tenantId: z.string().min(3, 'Tenant ID is required'),
  token: z.string().min(16, 'Valid invitation token is required'),
});

/**
 * POST /api/v1/invitations/accept
 * Directly accepts an invitation using the authenticated user's credentials.
 */
employeeRouter.post(
  '/invitations/accept',
  firebaseAuthMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, token } = acceptInvitationSchema.parse(req.body);
    const userId = req.user!.uid;
    const userEmail = req.user!.email;

    const membership = await EmployeeService.acceptInvitation({
      tenantId,
      token,
      userId,
      userEmail,
    });

    res.status(200).json({
      success: true,
      message: 'Invitation accepted successfully. Pharmacy membership activated.',
      data: membership,
    });
  })
);

// --- Tenant-Scoped Employee & Invitation Management ---
const tenantAuth = [firebaseAuthMiddleware, tenantAuthorizationMiddleware];

/**
 * GET /api/v1/tenants/:tenantId/employees
 * Lists all active and inactive employees in the pharmacy.
 */
employeeRouter.get(
  '/tenants/:tenantId/employees',
  ...tenantAuth,
  requirePermission('employees.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const members = await TenantService.listMembers(tenantId);
    res.status(200).json({ success: true, data: members });
  })
);

/**
 * GET /api/v1/tenants/:tenantId/employees/:userId
 * Retrieves specific employee details.
 */
employeeRouter.get(
  '/tenants/:tenantId/employees/:userId',
  ...tenantAuth,
  requirePermission('employees.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const targetUserId = req.params.userId!;
    const members = await TenantService.listMembers(tenantId);
    const member = members.find((m) => m.userId === targetUserId);

    if (!member) {
      throw new NotFoundError(`Employee '${targetUserId}' not found.`);
    }

    res.status(200).json({ success: true, data: member });
  })
);

const createInvitationSchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string().min(2, 'Employee name must be at least 2 characters'),
  phone: z.string().optional(),
  role: z.enum(['owner', 'pharmacist', 'cashier', 'helper', 'auditor']),
  assignedBranchIds: z.array(z.string().min(1)).min(1, 'Must assign at least one branch'),
  permissionOverrides: z
    .object({
      granted: z.array(z.string()).optional(),
      revoked: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * POST /api/v1/tenants/:tenantId/invitations
 * Creates and issues a new employee invitation.
 */
employeeRouter.post(
  '/tenants/:tenantId/invitations',
  ...tenantAuth,
  requirePermission('employees.invite'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId: actingUserId, role: actingRole } = req.tenantContext!;
    const validated = createInvitationSchema.parse(req.body);

    // Only owners can invite another owner
    if (validated.role === 'owner' && actingRole !== 'owner') {
      throw new BadRequestError('Only an owner can invite another owner.');
    }

    const invitation = await EmployeeService.createInvitation(
      tenantId,
      actingUserId,
      validated
    );

    res.status(201).json({
      success: true,
      message: 'Employee invitation created successfully',
      data: invitation,
      inviteLink: `/invite/${invitation.token}?tenantId=${tenantId}`,
    });
  })
);

/**
 * GET /api/v1/tenants/:tenantId/invitations
 * Lists all pending, accepted, and expired invitations for this tenant.
 */
employeeRouter.get(
  '/tenants/:tenantId/invitations',
  ...tenantAuth,
  requirePermission('employees.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.tenantContext!;
    const invitations = await EmployeeService.listInvitations(tenantId);
    res.status(200).json({ success: true, data: invitations });
  })
);

/**
 * POST /api/v1/tenants/:tenantId/invitations/:invitationId/resend
 * Resends an invitation with refreshed token and expiration.
 */
employeeRouter.post(
  '/tenants/:tenantId/invitations/:invitationId/resend',
  ...tenantAuth,
  requirePermission('employees.invite'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId: actingUserId } = req.tenantContext!;
    const invitationId = req.params.invitationId!;

    const updated = await EmployeeService.resendInvitation(
      tenantId,
      invitationId,
      actingUserId
    );

    res.status(200).json({
      success: true,
      message: 'Invitation resent successfully with new 72-hour window',
      data: updated,
      inviteLink: `/invite/${updated.token}?tenantId=${tenantId}`,
    });
  })
);

/**
 * DELETE /api/v1/tenants/:tenantId/invitations/:invitationId
 * Cancels a pending invitation.
 */
employeeRouter.delete(
  '/tenants/:tenantId/invitations/:invitationId',
  ...tenantAuth,
  requirePermission('employees.invite'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId: actingUserId } = req.tenantContext!;
    const invitationId = req.params.invitationId!;

    const cancelled = await EmployeeService.cancelInvitation(
      tenantId,
      invitationId,
      actingUserId
    );

    res.status(200).json({
      success: true,
      message: 'Invitation cancelled successfully',
      data: cancelled,
    });
  })
);

/**
 * POST /api/v1/tenants/:tenantId/invitations/accept
 * Tenant-scoped acceptance endpoint.
 */
employeeRouter.post(
  '/tenants/:tenantId/invitations/accept',
  firebaseAuthMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.params.tenantId!;
    const { token } = z.object({ token: z.string().min(16) }).parse(req.body);
    const userId = req.user!.uid;
    const userEmail = req.user!.email;

    const membership = await EmployeeService.acceptInvitation({
      tenantId,
      token,
      userId,
      userEmail,
    });

    res.status(200).json({
      success: true,
      message: 'Invitation accepted successfully',
      data: membership,
    });
  })
);

const updateRoleSchema = z.object({
  role: z.enum(['owner', 'pharmacist', 'cashier', 'helper', 'auditor']),
});

/**
 * PATCH /api/v1/tenants/:tenantId/employees/:userId/role
 * Updates employee role. Only owner can execute.
 */
employeeRouter.patch(
  '/tenants/:tenantId/employees/:userId/role',
  ...tenantAuth,
  requireRole('owner'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId: actingUserId } = req.tenantContext!;
    const targetUserId = req.params.userId!;
    const { role: newRole } = updateRoleSchema.parse(req.body);

    const updated = await EmployeeService.updateRole(
      tenantId,
      targetUserId,
      newRole,
      actingUserId
    );

    res.status(200).json({
      success: true,
      message: `Employee role updated to ${newRole}`,
      data: updated,
    });
  })
);

const updateBranchesSchema = z.object({
  assignedBranchIds: z.array(z.string()).min(1, 'Must assign at least one branch'),
});

/**
 * PATCH /api/v1/tenants/:tenantId/employees/:userId/branches
 * Updates branch assignments.
 */
employeeRouter.patch(
  '/tenants/:tenantId/employees/:userId/branches',
  ...tenantAuth,
  requirePermission('employees.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId: actingUserId } = req.tenantContext!;
    const targetUserId = req.params.userId!;
    const { assignedBranchIds } = updateBranchesSchema.parse(req.body);

    const updated = await EmployeeService.updateBranches(
      tenantId,
      targetUserId,
      assignedBranchIds,
      actingUserId
    );

    res.status(200).json({
      success: true,
      message: 'Branch assignments updated successfully',
      data: updated,
    });
  })
);

const updatePermissionsSchema = z.object({
  permissionOverrides: z.object({
    granted: z.array(z.string()).optional(),
    revoked: z.array(z.string()).optional(),
  }),
});

/**
 * PATCH /api/v1/tenants/:tenantId/employees/:userId/permissions
 * Configures custom permission overrides. Only owner can execute.
 */
employeeRouter.patch(
  '/tenants/:tenantId/employees/:userId/permissions',
  ...tenantAuth,
  requireRole('owner'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId: actingUserId } = req.tenantContext!;
    const targetUserId = req.params.userId!;
    const { permissionOverrides } = updatePermissionsSchema.parse(req.body);

    const updated = await EmployeeService.updatePermissions(
      tenantId,
      targetUserId,
      permissionOverrides,
      actingUserId
    );

    res.status(200).json({
      success: true,
      message: 'Permission overrides updated successfully',
      data: updated,
    });
  })
);

const updateStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'deactivated']),
});

/**
 * PATCH /api/v1/tenants/:tenantId/employees/:userId/status
 * Suspends, reactivates, or immediately deactivates an employee. Only owner can execute.
 */
employeeRouter.patch(
  '/tenants/:tenantId/employees/:userId/status',
  ...tenantAuth,
  requireRole('owner'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId: actingUserId } = req.tenantContext!;
    const targetUserId = req.params.userId!;
    const { status } = updateStatusSchema.parse(req.body);

    const updated = await EmployeeService.updateStatus(
      tenantId,
      targetUserId,
      status,
      actingUserId
    );

    res.status(200).json({
      success: true,
      message: `Employee access status updated to ${status}`,
      data: updated,
    });
  })
);

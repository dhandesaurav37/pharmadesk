import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { UserRole } from '../types/express';
import { checkHasPermission } from '../lib/permissions';

/**
 * Middleware factory to enforce specific user role(s).
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.tenantContext) {
      return next(new UnauthorizedError('Tenant context required for role verification'));
    }

    const userRole = req.tenantContext.role;
    if (userRole === 'owner' || allowedRoles.includes(userRole)) {
      return next();
    }

    return next(
      new ForbiddenError(
        `Action requires one of the following roles: [${allowedRoles.join(', ')}]. Current role: ${userRole}`
      )
    );
  };
}

/**
 * Middleware factory to enforce granular permissions.
 * Evaluates effective permissions including user-level overrides and category wildcards.
 */
export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.tenantContext) {
      return next(new UnauthorizedError('Tenant context required for permission verification'));
    }

    const { role, permissions } = req.tenantContext;

    // Owners have blanket access
    if (role === 'owner' || permissions.includes('*')) {
      return next();
    }

    const hasAll = requiredPermissions.every((perm) =>
      checkHasPermission(role, permissions, perm)
    );

    if (!hasAll) {
      return next(
        new ForbiddenError(
          `Missing required permission(s): [${requiredPermissions.join(', ')}]`
        )
      );
    }

    return next();
  };
}

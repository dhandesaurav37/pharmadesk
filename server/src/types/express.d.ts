import 'express';

export type UserRole = 'owner' | 'pharmacist' | 'cashier' | 'helper' | 'auditor';

export interface AuthContext {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  phoneNumber?: string;
}

export interface TenantContext {
  tenantId: string;
  branchId?: string;
  userId: string;
  role: UserRole;
  permissions: string[];
  assignedBranchIds: string[];
}

declare global {
  namespace Express {
    interface Request {
      id: string;
      startTime: number;
      user?: AuthContext;
      tenantContext?: TenantContext;
    }
  }
}


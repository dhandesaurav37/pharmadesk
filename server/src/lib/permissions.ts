import { UserRole } from '../types/express';

export interface PermissionDefinition {
  key: string;
  category: string;
  label: string;
  description: string;
}

export interface PermissionOverrides {
  granted?: string[];
  revoked?: string[];
}

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  // Dashboard
  { key: 'dashboard.view', category: 'Dashboard', label: 'View Dashboard', description: 'Access operational dashboard and metrics' },

  // Billing & Dispensing
  { key: 'billing.view', category: 'Billing', label: 'View Billing', description: 'Access billing counter and sales queue' },
  { key: 'billing.create', category: 'Billing', label: 'Create Invoices', description: 'Dispense medicines and issue retail tax invoices' },
  { key: 'billing.cancel', category: 'Billing', label: 'Cancel Invoices', description: 'Cancel or void issued sales invoices' },
  { key: 'billing.return', category: 'Billing', label: 'Process Returns', description: 'Process patient medicine returns and refunds' },
  { key: 'billing.discount', category: 'Billing', label: 'Custom Discount', description: 'Apply custom invoice discounts above standard limit' },
  { key: 'billing.schedule_h1', category: 'Billing', label: 'Dispense Schedule H1/X', description: 'Dispense controlled Schedule H1 and X medications' },

  // Medicines Directory
  { key: 'medicines.view', category: 'Medicines', label: 'View Medicines', description: 'View medicine formulations and formulary' },
  { key: 'medicines.create', category: 'Medicines', label: 'Add Medicines', description: 'Add new medicine products to catalogue' },
  { key: 'medicines.edit', category: 'Medicines', label: 'Edit Medicines', description: 'Edit drug formulations, HSN, and GST rates' },
  { key: 'medicines.delete', category: 'Medicines', label: 'Deactivate Medicines', description: 'Deactivate or retire medicine products' },

  // Inventory & Stock
  { key: 'inventory.view', category: 'Inventory', label: 'View Stock', description: 'View batch stock quantities and shelf locations' },
  { key: 'inventory.write', category: 'Inventory', label: 'Update Stock', description: 'Inward stock and create inventory batches' },
  { key: 'inventory.adjust', category: 'Inventory', label: 'Adjust Stock', description: 'Perform physical count adjustments and reconciliation' },
  { key: 'inventory.ptr_margin', category: 'Inventory', label: 'View PTR & Margins', description: 'View wholesale purchase rates (PTR) and margins' },
  { key: 'inventory.transfer', category: 'Inventory', label: 'Branch Transfers', description: 'Transfer stock between pharmacy branches' },
  { key: 'inventory.dispose', category: 'Inventory', label: 'Dispose Expired Stock', description: 'Record disposal or write-offs of expired batches' },

  // Customers & Khata
  { key: 'customers.view', category: 'Customers', label: 'View Customers', description: 'View patient directory and purchase history' },
  { key: 'customers.create', category: 'Customers', label: 'Create Customers', description: 'Register new customers and patients' },
  { key: 'customers.khata_view', category: 'Customers', label: 'View Khata Balance', description: 'View patient Khata credit balance and ledger' },
  { key: 'customers.khata_settle', category: 'Customers', label: 'Settle Khata', description: 'Accept cash/UPI repayments against Khata' },
  { key: 'customers.credit_limit', category: 'Customers', label: 'Modify Credit Limit', description: 'Adjust customer Khata credit limit' },

  // Suppliers & Purchases
  { key: 'suppliers.manage', category: 'Suppliers', label: 'Manage Suppliers', description: 'Add and edit distributor profiles' },
  { key: 'suppliers.payables', category: 'Suppliers', label: 'View Payables', description: 'View distributor outstanding balances' },
  { key: 'purchases.manage', category: 'Purchases', label: 'Manage Purchases', description: 'Create purchase orders and inward distributor bills' },

  // Employees & Branch Management
  { key: 'employees.view', category: 'Staff', label: 'View Employees', description: 'View employee directory and assignments' },
  { key: 'employees.manage', category: 'Staff', label: 'Manage Staff', description: 'Manage employee roles and permissions' },
  { key: 'employees.invite', category: 'Staff', label: 'Invite Staff', description: 'Invite new staff members to pharmacy' },
  { key: 'employees.deactivate', category: 'Staff', label: 'Deactivate Staff', description: 'Revoke employee access and memberships' },
  { key: 'branches.manage', category: 'Branches', label: 'Manage Branches', description: 'Configure pharmacy branches and counters' },

  // Reports & Financials
  { key: 'reports.view', category: 'Reports', label: 'View Reports', description: 'Access standard sales and operational reports' },
  { key: 'reports.financial', category: 'Reports', label: 'Financial Reports', description: 'View profit & loss, cash register, and tax reports' },
  { key: 'reports.gst', category: 'Reports', label: 'GST Reports', description: 'Export GSTR-1 and GSTR-3B tax reports' },

  // Pharmacy Settings & Audit
  { key: 'settings.manage', category: 'Settings', label: 'Manage Settings', description: 'Configure drug licenses, GSTIN, and printer' },
  { key: 'audit.view', category: 'Audit', label: 'View Audit Logs', description: 'Inspect security and transaction audit trails' },
];

/**
 * Aliases mapping Phase 5 singular/alternative nomenclature to standard registry keys
 */
export const PERMISSION_ALIASES: Record<string, string> = {
  'medicine.view': 'medicines.view',
  'medicine.create': 'medicines.create',
  'medicine.update': 'medicines.edit',
  'medicine.archive': 'medicines.delete',
  'inventory.opening_stock': 'inventory.write',
  'inventory.view_movements': 'inventory.view',
  'inventory.view_valuation': 'inventory.ptr_margin',
  'inventory.view_expiry': 'inventory.view',
  'billing.collect_payment': 'billing.create',
  'billing.view_payment_history': 'billing.view',
  'billing.print_invoice': 'billing.view',
  'billing.apply_custom_price': 'billing.discount',
};

/**
 * Normalizes permission strings between dot and colon formats:
 * e.g., 'billing:create' -> 'billing.create' and resolves known aliases
 */
export function normalizePermissionKey(key: string): string {
  const normalized = key.trim().toLowerCase().replace(/:/g, '.');
  return PERMISSION_ALIASES[normalized] || normalized;
}

/**
 * Standard role-based default permission sets.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  owner: ['*'], // Superuser within pharmacy tenant

  pharmacist: [
    'dashboard.view',
    'billing.view',
    'billing.create',
    'billing.return',
    'billing.discount',
    'billing.schedule_h1',
    'medicines.view',
    'medicines.create',
    'medicines.edit',
    'inventory.view',
    'inventory.write',
    'inventory.adjust',
    'inventory.ptr_margin',
    'inventory.transfer',
    'inventory.dispose',
    'customers.view',
    'customers.create',
    'customers.khata_view',
    'customers.khata_settle',
    'suppliers.manage',
    'purchases.manage',
    'reports.view',
  ],

  cashier: [
    'dashboard.view',
    'billing.view',
    'billing.create',
    'medicines.view',
    'inventory.view',
    'customers.view',
    'customers.create',
    'customers.khata_view',
    'customers.khata_settle',
    'reports.view',
  ],

  helper: [
    'medicines.view',
    'inventory.view',
  ],

  auditor: [
    'dashboard.view',
    'medicines.view',
    'inventory.view',
    'inventory.ptr_margin',
    'reports.view',
    'reports.financial',
    'reports.gst',
    'audit.view',
  ],
};

/**
 * Evaluates effective permissions for a user given their role and custom overrides.
 * Overrides take precedence over role defaults:
 * 1. Owner always has '*'
 * 2. Start with role default permissions
 * 3. Add explicit granted overrides
 * 4. Remove explicit revoked overrides
 */
export function resolveEffectivePermissions(
  role: UserRole,
  overrides?: PermissionOverrides
): string[] {
  if (role === 'owner') {
    return ['*'];
  }

  const roleDefaults = (DEFAULT_ROLE_PERMISSIONS[role] || []).map(normalizePermissionKey);
  const granted = (overrides?.granted || []).map(normalizePermissionKey);
  const revoked = (overrides?.revoked || []).map(normalizePermissionKey);

  // Combine defaults and granted overrides, then remove revoked
  const effectiveSet = new Set<string>([...roleDefaults, ...granted]);
  for (const rev of revoked) {
    effectiveSet.delete(rev);
  }

  return Array.from(effectiveSet);
}

/**
 * Checks whether the granted permission list satisfies the required permission.
 */
export function checkHasPermission(
  role: UserRole,
  effectivePermissions: string[],
  requiredPermission: string
): boolean {
  if (role === 'owner') {
    return true;
  }

  const normalizedRequired = normalizePermissionKey(requiredPermission);

  // Handle wildcard or blanket grant
  if (effectivePermissions.includes('*')) {
    return true;
  }

  const normalizedList = effectivePermissions.map(normalizePermissionKey);

  // Direct match or category wildcard match (e.g., 'billing.*')
  if (normalizedList.includes(normalizedRequired)) {
    return true;
  }

  const category = normalizedRequired.split('.')[0];
  if (category && normalizedList.includes(`${category}.*`)) {
    return true;
  }

  return false;
}

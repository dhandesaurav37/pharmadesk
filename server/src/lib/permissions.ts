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
  { key: 'customers.view', category: 'Customers', label: 'View Customers', description: 'View customer directory and basic account summaries' },
  { key: 'customers.create', category: 'Customers', label: 'Create Customers', description: 'Register new customers and patients' },
  { key: 'customers.update', category: 'Customers', label: 'Edit Customers', description: 'Update customer contact, GST, doctor, and clinical metadata' },
  { key: 'customers.archive', category: 'Customers', label: 'Archive Customers', description: 'Archive inactive customers with zero outstanding balance' },
  { key: 'customers.view_phone', category: 'Customers', label: 'View Full Phone Numbers', description: 'View unmasked customer mobile numbers' },
  { key: 'customers.view_purchase_history', category: 'Customers', label: 'View Purchase History', description: 'Inspect customer invoice and medication history' },
  { key: 'customers.khata_view', category: 'Customers', label: 'View Khata Ledger', description: 'View customer Khata credit balance, payments, and ledger entries' },
  { key: 'customers.khata_collect', category: 'Customers', label: 'Collect Khata Payments', description: 'Receive repayments against customer Khata balances' },
  { key: 'customers.khata_settle', category: 'Customers', label: 'Settle Khata Accounts', description: 'Settle open Khata credit invoices in full or FIFO' },
  { key: 'customers.credit_limit_manage', category: 'Customers', label: 'Manage Credit Limits', description: 'Configure or modify customer Khata credit limits and terms' },
  { key: 'customers.credit_override', category: 'Customers', label: 'Override Credit Limit', description: 'Authorize POS credit billing above customer credit limit' },
  { key: 'customers.credit_note', category: 'Customers', label: 'Issue Credit Notes', description: 'Issue sales return or rebate credit notes to customer ledger' },
  { key: 'customers.balance_adjust', category: 'Customers', label: 'Adjust Khata Balances', description: 'Post audited debit/credit/opening balance adjustments' },
  { key: 'customers.statement_view', category: 'Customers', label: 'View Statements', description: 'View period-based customer Khata account statements' },
  { key: 'customers.statement_export', category: 'Customers', label: 'Export Statements', description: 'Export customer Khata statements to PDF and CSV' },
  { key: 'customers.statement_share', category: 'Customers', label: 'Share Statements', description: 'Generate sanitized customer statement summaries for WhatsApp' },
  { key: 'customers.reports_view', category: 'Customers', label: 'View Credit Reports', description: 'Access outstanding receivables, overdue aging, and credit summary reports' },

  // Suppliers, Purchase Orders, Goods Receipts & Accounts Payable
  { key: 'suppliers.view', category: 'Suppliers', label: 'View Suppliers', description: 'View distributor directory and profiles' },
  { key: 'suppliers.create', category: 'Suppliers', label: 'Create Suppliers', description: 'Register new pharmaceutical distributors' },
  { key: 'suppliers.update', category: 'Suppliers', label: 'Edit Suppliers', description: 'Update distributor profile, terms, and status' },
  { key: 'suppliers.archive', category: 'Suppliers', label: 'Archive Suppliers', description: 'Archive inactive distributors with zero outstanding payable' },
  { key: 'suppliers.view_financials', category: 'Suppliers', label: 'View Supplier Financials', description: 'View credit limits, payables, invoices, and payment balances' },
  { key: 'suppliers.view_bank_details', category: 'Suppliers', label: 'View Supplier Bank Details', description: 'Inspect distributor bank account and IFSC settlement details' },
  { key: 'suppliers.export', category: 'Suppliers', label: 'Export Supplier Statements', description: 'Export distributor statements to CSV and PDF' },
  { key: 'suppliers.manage', category: 'Suppliers', label: 'Manage Suppliers', description: 'Legacy composite permission to add and edit distributor profiles' },
  { key: 'suppliers.payables', category: 'Suppliers', label: 'View Payables', description: 'Legacy composite permission to view distributor outstanding balances' },
  { key: 'purchases.manage', category: 'Purchases', label: 'Manage Purchases', description: 'Legacy composite permission to create purchase orders and inward bills' },
  { key: 'purchase_orders.view', category: 'Purchases', label: 'View Purchase Orders', description: 'View purchase orders and status tracking' },
  { key: 'purchase_orders.create', category: 'Purchases', label: 'Create Purchase Orders', description: 'Create draft purchase orders' },
  { key: 'purchase_orders.update', category: 'Purchases', label: 'Edit Purchase Orders', description: 'Modify draft purchase order line items and terms' },
  { key: 'purchase_orders.submit', category: 'Purchases', label: 'Submit Purchase Orders', description: 'Submit draft purchase orders for approval' },
  { key: 'purchase_orders.approve', category: 'Purchases', label: 'Approve Purchase Orders', description: 'Approve submitted purchase orders for receiving' },
  { key: 'purchase_orders.cancel', category: 'Purchases', label: 'Cancel Purchase Orders', description: 'Cancel open purchase orders with audit reason' },
  { key: 'purchase_orders.close', category: 'Purchases', label: 'Close Purchase Orders', description: 'Close fulfilled purchase orders' },
  { key: 'goods_receipts.view', category: 'Goods Receipts', label: 'View Goods Receipts', description: 'View inward Goods Receipt Notes (GRNs)' },
  { key: 'goods_receipts.create', category: 'Goods Receipts', label: 'Create Goods Receipts', description: 'Draft Goods Receipt Notes against approved POs' },
  { key: 'goods_receipts.post', category: 'Goods Receipts', label: 'Post Goods Receipts', description: 'Post GRNs into branch batch inventory & stock movements' },
  { key: 'goods_receipts.correct', category: 'Goods Receipts', label: 'Correct / Reverse GRNs', description: 'Reverse or correct posted GRNs and authorize over-receipts' },
  { key: 'goods_receipts.export', category: 'Goods Receipts', label: 'Export / Print GRNs', description: 'Print and export Goods Receipt documentation' },
  { key: 'supplier_invoices.view', category: 'Supplier Billing', label: 'View Supplier Invoices', description: 'View distributor purchase bills and payable due dates' },
  { key: 'supplier_invoices.create', category: 'Supplier Billing', label: 'Record Supplier Invoices', description: 'Recognize distributor purchase invoices as payables' },
  { key: 'supplier_payments.view', category: 'Supplier Billing', label: 'View Supplier Payments', description: 'View outgoing supplier settlement history' },
  { key: 'supplier_payments.create', category: 'Supplier Billing', label: 'Pay Suppliers', description: 'Record outgoing supplier payments and invoice allocations' },
  { key: 'supplier_returns.create', category: 'Supplier Returns', label: 'Create Supplier Returns', description: 'Draft stock returns to distributors against GRN batches' },
  { key: 'supplier_returns.approve', category: 'Supplier Returns', label: 'Approve Supplier Returns', description: 'Authorize and post stock reductions and supplier credit notes' },
  { key: 'supplier_reports.view', category: 'Reports', label: 'View Procurement Reports', description: 'View pending POs, near-expiry inward, rejections, and payables reports' },

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

  // Phase 9: Double-Entry Accounting, Expenses, Cash/Bank & Financial Periods
  { key: 'accounting.view', category: 'Accounting', label: 'View Accounting Workspace', description: 'Access double-entry accounting workspace and overview' },
  { key: 'accounting.accounts.view', category: 'Accounting', label: 'View Chart of Accounts', description: 'View general ledger accounts and hierarchies' },
  { key: 'accounting.accounts.manage', category: 'Accounting', label: 'Manage Chart of Accounts', description: 'Create or update non-system general ledger accounts' },
  { key: 'accounting.journals.view', category: 'Accounting', label: 'View Journal Entries', description: 'Inspect immutable double-entry journal vouchers and line items' },
  { key: 'accounting.journals.reverse', category: 'Accounting', label: 'Reverse Journal Entries', description: 'Create audited contra reversal journal vouchers' },
  { key: 'accounting.reports.view', category: 'Accounting', label: 'View Accounting Reports', description: 'Access Trial Balance, P&L, Balance Sheet, Cash Flow, and GST ledgers' },
  { key: 'accounting.reports.export', category: 'Accounting', label: 'Export Accounting Reports', description: 'Export financial statements and ledgers to CSV and PDF' },
  { key: 'accounting.expenses.view', category: 'Accounting', label: 'View Operating Expenses', description: 'View pharmacy rent, salary, utility, and operational expenses' },
  { key: 'accounting.expenses.create', category: 'Accounting', label: 'Record Operating Expenses', description: 'Submit pharmacy expenses for recognition or approval' },
  { key: 'accounting.expenses.approve', category: 'Accounting', label: 'Approve Operating Expenses', description: 'Approve submitted expenses for recognition and settlement' },
  { key: 'accounting.expenses.pay', category: 'Accounting', label: 'Pay Operating Expenses', description: 'Settle approved expenses from cash or bank accounts' },
  { key: 'accounting.cash_bank.view', category: 'Accounting', label: 'View Cash & Bank Accounts', description: 'View cash drawers, bank accounts, UPI/card clearing, and transfers' },
  { key: 'accounting.cash_bank.manage', category: 'Accounting', label: 'Manage Cash & Bank Accounts', description: 'Create bank/cash accounts, record internal transfers, and record bank charges' },
  { key: 'accounting.bank_reconciliation.manage', category: 'Accounting', label: 'Reconcile Bank Statements', description: 'Import CSV/JSON bank statements and match ledger transactions' },
  { key: 'accounting.opening_balances.manage', category: 'Accounting', label: 'Manage Opening Balances', description: 'Post balanced opening balances across ledger accounts' },
  { key: 'accounting.periods.view', category: 'Accounting', label: 'View Financial Periods', description: 'View Indian financial year periods and lock status' },
  { key: 'accounting.periods.close', category: 'Accounting', label: 'Close Financial Periods', description: 'Lock monthly or annual financial periods against backdated entries' },
  { key: 'accounting.periods.reopen', category: 'Accounting', label: 'Reopen Financial Periods', description: 'Reopen closed financial periods with mandatory audit reason' },
  { key: 'accounting.audit.view', category: 'Accounting', label: 'View Reconciliation Exceptions', description: 'Inspect GL vs subledger reconciliation checks and discrepancies' },
  { key: 'accounting.reconciliation.manage', category: 'Accounting', label: 'Run Reconciliation & Backfill', description: 'Trigger GL reconciliation checks and safe idempotent historical backfills' },
];

/**
 * Aliases mapping Phase 5 singular/alternative nomenclature to standard registry keys
 */
export const PERMISSION_ALIASES: Record<string, string> = {
  'medicine.view': 'medicines.view',
  'medicine.create': 'medicines.create',
  'medicine.update': 'medicines.edit',
  'medicine.archive': 'medicines.delete',
  'inventory.read': 'inventory.view',
  'inventory.opening_stock': 'inventory.write',
  'inventory.view_movements': 'inventory.view',
  'inventory.view_valuation': 'inventory.ptr_margin',
  'inventory.view_expiry': 'inventory.view',
  'billing.collect_payment': 'billing.create',
  'billing.view_payment_history': 'billing.view',
  'billing.print_invoice': 'billing.view',
  'billing.apply_custom_price': 'billing.discount',
  'customers.credit_limit': 'customers.credit_limit_manage',
};

export const VALID_PERMISSION_KEYS = new Set(ALL_PERMISSIONS.map((p) => p.key));

/**
 * Normalizes permission strings between dot and colon formats:
 * e.g., 'billing:create' -> 'billing.create' and resolves known aliases
 */
export function normalizePermissionKey(key: string): string {
  const normalized = key.trim().toLowerCase().replace(/:/g, '.');
  return PERMISSION_ALIASES[normalized] || normalized;
}

export function isWildcardPermission(key: string): boolean {
  const normalized = normalizePermissionKey(key);
  return normalized === '*' || normalized.endsWith('.*') || normalized.includes('*');
}

/**
 * Validates permission overrides submitted during invitation or staff permission updates.
 * Rejects wildcard grants ('*', 'billing.*', etc.) and unknown permission keys for non-owners.
 */
export function validatePermissionOverrides(
  role: UserRole,
  overrides?: PermissionOverrides
): PermissionOverrides {
  if (!overrides) {
    return {};
  }

  const granted = (overrides.granted || []).map(normalizePermissionKey).filter(Boolean);
  const revoked = (overrides.revoked || []).map(normalizePermissionKey).filter(Boolean);

  if (role !== 'owner') {
    for (const perm of [...granted, ...revoked]) {
      if (isWildcardPermission(perm)) {
        throw new Error(`Wildcard permission '${perm}' cannot be granted or overridden for non-owner roles`);
      }
      if (!VALID_PERMISSION_KEYS.has(perm)) {
        throw new Error(`Unknown permission key '${perm}' in permission overrides`);
      }
    }
  }

  return {
    granted: Array.from(new Set(granted)),
    revoked: Array.from(new Set(revoked)),
  };
}

/**
 * Strips any wildcard grants from stored permission lists for non-owners.
 */
export function sanitizeGrantedPermissions(role: UserRole, permissions: string[]): string[] {
  if (role === 'owner') {
    return ['*'];
  }
  const clean = new Set<string>();
  for (const raw of permissions) {
    const norm = normalizePermissionKey(raw);
    if (!norm || isWildcardPermission(norm)) {
      continue;
    }
    if (VALID_PERMISSION_KEYS.has(norm)) {
      clean.add(norm);
    }
  }
  return Array.from(clean);
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
    'customers.update',
    'customers.view_phone',
    'customers.view_purchase_history',
    'customers.khata_view',
    'customers.khata_collect',
    'customers.khata_settle',
    'customers.statement_view',
    'customers.statement_export',
    'customers.statement_share',
    'customers.reports_view',
    'suppliers.view',
    'suppliers.create',
    'suppliers.update',
    'suppliers.manage',
    'purchases.manage',
    'purchase_orders.view',
    'purchase_orders.create',
    'purchase_orders.update',
    'purchase_orders.submit',
    'goods_receipts.view',
    'goods_receipts.create',
    'goods_receipts.post',
    'goods_receipts.export',
    'supplier_returns.create',
    'supplier_reports.view',
    'reports.view',
    'accounting.expenses.view',
    'accounting.expenses.create',
  ],

  cashier: [
    'dashboard.view',
    'billing.view',
    'billing.create',
    'medicines.view',
    'inventory.view',
    'customers.view',
    'customers.create',
    'customers.view_phone',
    'customers.view_purchase_history',
    'customers.khata_view',
    'customers.khata_collect',
    'customers.khata_settle',
    'customers.statement_view',
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
    'customers.view',
    'customers.view_purchase_history',
    'customers.khata_view',
    'customers.statement_view',
    'customers.statement_export',
    'customers.reports_view',
    'suppliers.view',
    'suppliers.view_financials',
    'suppliers.export',
    'purchase_orders.view',
    'goods_receipts.view',
    'goods_receipts.export',
    'supplier_invoices.view',
    'supplier_payments.view',
    'supplier_reports.view',
    'reports.view',
    'reports.financial',
    'reports.gst',
    'audit.view',
    'accounting.view',
    'accounting.accounts.view',
    'accounting.journals.view',
    'accounting.reports.view',
    'accounting.reports.export',
    'accounting.expenses.view',
    'accounting.cash_bank.view',
    'accounting.periods.view',
    'accounting.audit.view',
  ],
};

/**
 * Evaluates effective permissions for a user given their role and custom overrides.
 * Overrides take precedence over role defaults:
 * 1. Owner always has '*'
 * 2. Start with role default permissions
 * 3. Add explicit valid non-wildcard granted overrides
 * 4. Remove explicit revoked overrides
 */
export function resolveEffectivePermissions(
  role: UserRole,
  overrides?: PermissionOverrides
): string[] {
  if (role === 'owner') {
    return ['*'];
  }

  const roleDefaults = (DEFAULT_ROLE_PERMISSIONS[role] || [])
    .map(normalizePermissionKey)
    .filter((p) => !isWildcardPermission(p) && VALID_PERMISSION_KEYS.has(p));

  const granted = (overrides?.granted || [])
    .map(normalizePermissionKey)
    .filter((p) => !isWildcardPermission(p) && VALID_PERMISSION_KEYS.has(p));

  const revoked = (overrides?.revoked || [])
    .map(normalizePermissionKey)
    .filter((p) => !isWildcardPermission(p));

  // Combine defaults and granted overrides, then remove revoked
  const effectiveSet = new Set<string>([...roleDefaults, ...granted]);
  for (const rev of revoked) {
    effectiveSet.delete(rev);
  }

  return Array.from(effectiveSet);
}

/**
 * Checks whether the granted permission list satisfies the required permission.
 * Wildcards ('*' and 'category.*') are strictly restricted to owner role.
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
  const sanitized = sanitizeGrantedPermissions(role, effectivePermissions);

  return sanitized.includes(normalizedRequired);
}

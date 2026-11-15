/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  InventoryBatch,
  MedicineMaster,
  NavigationModule,
  UserRole,
} from '../types/pharmacy.ts';

export type PrimaryDestinationId =
  | 'dashboard'
  | 'billing'
  | 'medicines'
  | 'purchases'
  | 'customers'
  | 'more';

export interface PrimaryNavDestination {
  id: PrimaryDestinationId;
  label: string;
  shortLabel: string;
  description: string;
  /** Matches underlying activeModule keys that highlight this primary group */
  matchesModules: NavigationModule[];
  /** Roles allowed to see this primary destination */
  allowedRoles: UserRole[];
}

export const PRIMARY_NAV_DESTINATIONS: PrimaryNavDestination[] = [
  {
    id: 'dashboard',
    label: 'Home',
    shortLabel: 'Home',
    description: 'Today’s sales, quick actions, and items needing attention',
    matchesModules: ['dashboard'],
    allowedRoles: ['owner', 'pharmacist', 'cashier', 'helper', 'auditor'],
  },
  {
    id: 'billing',
    label: 'Billing',
    shortLabel: 'Billing',
    description: 'Fast counter billing, barcode scan, and receipts',
    matchesModules: ['billing'],
    allowedRoles: ['owner', 'pharmacist', 'cashier'],
  },
  {
    id: 'medicines',
    label: 'Medicines & Stock',
    shortLabel: 'Stock',
    description: 'Search medicines, batches, low stock, and expiry alerts',
    matchesModules: ['medicines', 'inventory'],
    allowedRoles: ['owner', 'pharmacist', 'cashier', 'helper', 'auditor'],
  },
  {
    id: 'purchases',
    label: 'Purchases',
    shortLabel: 'Purchases',
    description: 'Receive stock, orders to suppliers, and supplier payments',
    matchesModules: ['purchases', 'suppliers'],
    allowedRoles: ['owner', 'pharmacist', 'auditor'],
  },
  {
    id: 'customers',
    label: 'Customers',
    shortLabel: 'Customers',
    description: 'Customer list, pending payments, and quick collection',
    matchesModules: ['customers'],
    allowedRoles: ['owner', 'pharmacist', 'cashier', 'auditor'],
  },
  {
    id: 'more',
    label: 'More',
    shortLabel: 'More',
    description: 'Money reports, staff, branches, transfers, and settings',
    matchesModules: [
      'more',
      'reports',
      'accounts',
      'employees',
      'branches',
      'transfers',
      'settings',
    ],
    allowedRoles: ['owner', 'pharmacist', 'cashier', 'helper', 'auditor'],
  },
];

export interface SecondaryFeatureItem {
  id: string;
  module: NavigationModule;
  subTab?: string | null;
  label: string;
  description: string;
  requiredPermission?: string;
  allowedRoles: UserRole[];
}

export const SECONDARY_MORE_ITEMS: SecondaryFeatureItem[] = [
  {
    id: 'reports',
    module: 'reports',
    label: 'Money Reports',
    description: 'Daily sales summary, GST tax filing breakdown, and store profit',
    requiredPermission: 'reports.view',
    allowedRoles: ['owner', 'pharmacist', 'auditor'],
  },
  {
    id: 'accounts',
    module: 'accounts',
    label: 'Money & Accounts',
    description: 'Cashbook, bank deposits, expenses, and ledger summaries',
    requiredPermission: 'accounting.view',
    allowedRoles: ['owner', 'auditor'],
  },
  {
    id: 'employees',
    module: 'employees',
    label: 'Staff & Roles',
    description: 'Invite team members, assign counters, and control permissions',
    allowedRoles: ['owner'],
  },
  {
    id: 'branches',
    module: 'branches',
    label: 'Branches',
    description: 'Manage store locations, licenses, and branch counter controls',
    requiredPermission: 'branches.view',
    allowedRoles: ['owner', 'pharmacist', 'auditor'],
  },
  {
    id: 'transfers',
    module: 'transfers',
    label: 'Stock Transfers',
    description: 'Move medicine batches safely between store branches',
    requiredPermission: 'stock_transfers.view',
    allowedRoles: ['owner', 'pharmacist', 'cashier', 'auditor'],
  },
  {
    id: 'settings',
    module: 'settings',
    subTab: 'store',
    label: 'Settings',
    description: 'Store profile, drug licenses, printer setup, and role access',
    allowedRoles: ['owner'],
  },
  {
    id: 'audit_history',
    module: 'settings',
    subTab: 'security',
    label: 'Audit History',
    description: 'Review who changed bills, stock, prices, and permissions',
    allowedRoles: ['owner', 'auditor'],
  },
  {
    id: 'data_export',
    module: 'settings',
    subTab: 'security',
    label: 'Data Export & Backup',
    description: 'Download store records, retention settings, and backup verification',
    allowedRoles: ['owner'],
  },
];

export function getVisiblePrimaryDestinations(role: UserRole): PrimaryNavDestination[] {
  return PRIMARY_NAV_DESTINATIONS.filter(item => item.allowedRoles.includes(role));
}

export function getVisibleSecondaryItems(
  role: UserRole,
  hasPermission?: (perm: string) => boolean
): SecondaryFeatureItem[] {
  return SECONDARY_MORE_ITEMS.filter(item => {
    if (!item.allowedRoles.includes(role)) return false;
    if (item.requiredPermission && hasPermission && role !== 'owner') {
      return hasPermission(item.requiredPermission);
    }
    return true;
  });
}

export function isBatchExpired(expiryDate: string, referenceDate: Date = new Date()): boolean {
  if (!expiryDate) return false;
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  let exp: Date;
  if (/^\d{4}-\d{2}$/.test(expiryDate)) {
    const [yearStr, monthStr] = expiryDate.split('-');
    // End of expiry month is the standard Indian pharmaceutical expiry boundary
    exp = new Date(Number(yearStr), Number(monthStr), 0, 23, 59, 59);
  } else {
    exp = new Date(expiryDate);
  }

  if (Number.isNaN(exp.getTime())) return false;
  return exp.getTime() < today.getTime();
}

export function getDaysToExpiry(expiryDate: string, referenceDate: Date = new Date()): number | null {
  if (!expiryDate) return null;
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  let exp: Date;
  if (/^\d{4}-\d{2}$/.test(expiryDate)) {
    const [yearStr, monthStr] = expiryDate.split('-');
    exp = new Date(Number(yearStr), Number(monthStr), 0);
  } else {
    exp = new Date(expiryDate);
  }

  if (Number.isNaN(exp.getTime())) return null;
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getExpirySortTimestamp(expiryDate: string): number {
  if (!expiryDate) return Number.MAX_SAFE_INTEGER;
  if (/^\d{4}-\d{2}$/.test(expiryDate)) {
    const [y, m] = expiryDate.split('-').map(Number);
    return new Date(y!, m!, 0).getTime();
  }
  const ts = new Date(expiryDate).getTime();
  return Number.isNaN(ts) ? Number.MAX_SAFE_INTEGER : ts;
}

export interface SearchableBillingEntry {
  medicineId: string;
  brandName: string;
  saltComposition: string;
  strength?: string;
  dosageForm?: string;
  packSize: string;
  barcode?: string;
  manufacturer?: string;
  schedule: MedicineMaster['schedule'];
  gstSlab: number;
  rackLocation: string;
  totalAvailableStock: number;
  /** Earliest non-expired in-stock batch picked by FEFO */
  fefoBatch: InventoryBatch;
  /** All eligible non-expired batches sorted earliest expiry first */
  eligibleBatches: InventoryBatch[];
}

/**
 * Search medicines & active stock for Billing POS with automatic FEFO sorting
 * and strict exclusion of expired or zero-stock batches.
 */
export function searchSellableMedicines(
  query: string,
  inventory: InventoryBatch[],
  medicines: MedicineMaster[],
  referenceDate: Date = new Date()
): SearchableBillingEntry[] {
  const q = query.trim().toLowerCase();
  const medById = new Map<string, MedicineMaster>();
  for (const m of medicines) {
    medById.set(m.id, m);
  }

  // Group all non-expired, positive-stock batches by medicineId
  const grouped = new Map<string, InventoryBatch[]>();
  for (const batch of inventory) {
    if (batch.currentStock <= 0) continue;
    if (isBatchExpired(batch.expiryDate, referenceDate)) continue;

    const list = grouped.get(batch.medicineId) || [];
    list.push(batch);
    grouped.set(batch.medicineId, list);
  }

  const results: SearchableBillingEntry[] = [];

  for (const [medicineId, batches] of grouped.entries()) {
    const master = medById.get(medicineId);
    if (master?.status === 'archived') continue;

    const sortedBatches = [...batches].sort(
      (a, b) => getExpirySortTimestamp(a.expiryDate) - getExpirySortTimestamp(b.expiryDate)
    );
    const fefoBatch = sortedBatches[0]!;
    const totalAvailableStock = sortedBatches.reduce((sum, b) => sum + b.currentStock, 0);

    const searchableText = [
      fefoBatch.brandName,
      master?.brandName || '',
      fefoBatch.saltComposition,
      master?.saltComposition || '',
      master?.manufacturer || '',
      master?.strength || '',
      master?.dosageForm || master?.category || '',
      master?.barcode || '',
      medicineId,
      ...sortedBatches.flatMap(b => [b.batchNumber, b.barcode || '', b.rackLocation || '']),
    ]
      .join(' ')
      .toLowerCase();

    if (q && !searchableText.includes(q)) {
      continue;
    }

    results.push({
      medicineId,
      brandName: master?.brandName || fefoBatch.brandName,
      saltComposition: master?.saltComposition || fefoBatch.saltComposition,
      strength: master?.strength,
      dosageForm: master?.dosageForm || master?.category,
      packSize: master?.packSize || fefoBatch.packSize,
      barcode: master?.barcode || fefoBatch.barcode,
      manufacturer: master?.manufacturer,
      schedule: master?.schedule || 'Schedule H',
      gstSlab: master?.gstSlab ?? 12,
      rackLocation: fefoBatch.rackLocation || master?.rackLocation || 'Main Rack',
      totalAvailableStock,
      fefoBatch,
      eligibleBatches: sortedBatches,
    });
  }

  // Rank exact/prefix matches first when query is present
  if (q) {
    results.sort((a, b) => {
      const aExact =
        a.barcode?.toLowerCase() === q ||
        a.brandName.toLowerCase().startsWith(q) ||
        a.eligibleBatches.some(x => x.barcode?.toLowerCase() === q || x.batchNumber.toLowerCase() === q);
      const bExact =
        b.barcode?.toLowerCase() === q ||
        b.brandName.toLowerCase().startsWith(q) ||
        b.eligibleBatches.some(x => x.barcode?.toLowerCase() === q || x.batchNumber.toLowerCase() === q);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.brandName.localeCompare(b.brandName);
    });
  }

  return results;
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number
): {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
} {
  const safeSize = Math.max(1, pageSize);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    page: safePage,
    pageSize: safeSize,
    totalItems,
    totalPages,
  };
}

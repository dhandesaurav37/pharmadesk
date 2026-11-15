import { describe, it, expect } from 'vitest';
import {
  getVisiblePrimaryDestinations,
  getVisibleSecondaryItems,
  searchSellableMedicines,
  isBatchExpired,
  getDaysToExpiry,
  paginateItems,
} from '../../src/lib/operatorHelpers';
import type { InventoryBatch, MedicineMaster } from '../../src/types/pharmacy';

const REF_DATE = new Date('2026-06-15T10:00:00.000Z');

const SAMPLE_MEDICINES: MedicineMaster[] = [
  {
    id: 'med-dolo',
    brandName: 'Dolo 650',
    saltComposition: 'Paracetamol 650mg',
    manufacturer: 'Micro Labs',
    category: 'Tablet',
    schedule: 'OTC',
    rackLocation: 'Rack A-1',
    packSize: '15 Tablets',
    hsnCode: '300490',
    gstSlab: 12,
    prescriptionRequired: false,
    minStockLevel: 20,
    barcode: '8901111111111',
    status: 'active',
  },
  {
    id: 'med-aug',
    brandName: 'Augmentin 625 Duo',
    saltComposition: 'Amoxycillin 500mg + Clavulanic Acid 125mg',
    manufacturer: 'GSK',
    category: 'Tablet',
    schedule: 'Schedule H',
    rackLocation: 'Rack B-3',
    packSize: '10 Tablets',
    hsnCode: '300410',
    gstSlab: 12,
    prescriptionRequired: true,
    minStockLevel: 15,
    barcode: '8902222222222',
    status: 'active',
  },
  {
    id: 'med-archived',
    brandName: 'Old Syrup Archived',
    saltComposition: 'Test Salt',
    manufacturer: 'Legacy Labs',
    category: 'Syrup',
    schedule: 'OTC',
    rackLocation: 'Rack Z-1',
    packSize: '100 ml',
    hsnCode: '300490',
    gstSlab: 12,
    prescriptionRequired: false,
    minStockLevel: 5,
    status: 'archived',
  },
];

const SAMPLE_BATCHES: InventoryBatch[] = [
  // Expired Dolo batch (2026-05 ended May 31 < June 15) -> MUST be excluded from billing search
  {
    id: 'batch-dolo-expired',
    medicineId: 'med-dolo',
    brandName: 'Dolo 650',
    saltComposition: 'Paracetamol 650mg',
    batchNumber: 'DL-EXP',
    expiryDate: '2026-05',
    packSize: '15 Tablets',
    mrp: 35,
    ptr: 24,
    currentStock: 50,
    rackLocation: 'Rack A-1',
    status: 'expired',
  },
  // Zero-stock valid batch -> MUST be excluded
  {
    id: 'batch-dolo-zero',
    medicineId: 'med-dolo',
    brandName: 'Dolo 650',
    saltComposition: 'Paracetamol 650mg',
    batchNumber: 'DL-ZERO',
    expiryDate: '2026-09',
    packSize: '15 Tablets',
    mrp: 35,
    ptr: 24,
    currentStock: 0,
    rackLocation: 'Rack A-1',
    status: 'out_of_stock',
  },
  // Later valid Dolo batch
  {
    id: 'batch-dolo-later',
    medicineId: 'med-dolo',
    brandName: 'Dolo 650',
    saltComposition: 'Paracetamol 650mg',
    batchNumber: 'DL-2027',
    expiryDate: '2027-08',
    packSize: '15 Tablets',
    mrp: 36,
    ptr: 25,
    currentStock: 40,
    rackLocation: 'Rack A-1',
    status: 'normal',
  },
  // Earlier valid Dolo batch -> MUST be auto-selected as fefoBatch
  {
    id: 'batch-dolo-fefo',
    medicineId: 'med-dolo',
    brandName: 'Dolo 650',
    saltComposition: 'Paracetamol 650mg',
    batchNumber: 'DL-FEFO',
    expiryDate: '2026-10',
    packSize: '15 Tablets',
    mrp: 35,
    ptr: 24,
    currentStock: 18,
    rackLocation: 'Rack A-1',
    status: 'normal',
  },
  // Valid Augmentin batch
  {
    id: 'batch-aug-1',
    medicineId: 'med-aug',
    brandName: 'Augmentin 625 Duo',
    saltComposition: 'Amoxycillin 500mg + Clavulanic Acid 125mg',
    batchNumber: 'AUG-88',
    expiryDate: '2027-03',
    packSize: '10 Tablets',
    mrp: 223,
    ptr: 165,
    currentStock: 12,
    rackLocation: 'Rack B-3',
    barcode: '8902222222222',
    status: 'normal',
  },
  // Batch belonging to archived medicine -> MUST be excluded
  {
    id: 'batch-archived',
    medicineId: 'med-archived',
    brandName: 'Old Syrup Archived',
    saltComposition: 'Test Salt',
    batchNumber: 'ARC-1',
    expiryDate: '2027-12',
    packSize: '100 ml',
    mrp: 110,
    ptr: 70,
    currentStock: 10,
    rackLocation: 'Rack Z-1',
    status: 'normal',
  },
];

describe('Phase 14 Operator-First Navigation, FEFO Billing Safety & Pagination', () => {
  it('exposes the 5 primary destinations + More for owners and restricts modules cleanly per role', () => {
    const ownerNav = getVisiblePrimaryDestinations('owner').map((d) => d.id);
    expect(ownerNav).toEqual([
      'dashboard',
      'billing',
      'medicines',
      'purchases',
      'customers',
      'more',
    ]);

    const cashierNav = getVisiblePrimaryDestinations('cashier').map((d) => d.id);
    expect(cashierNav).toEqual(['dashboard', 'billing', 'medicines', 'customers', 'more']);
    expect(cashierNav).not.toContain('purchases');

    const helperNav = getVisiblePrimaryDestinations('helper').map((d) => d.id);
    expect(helperNav).toEqual(['dashboard', 'medicines', 'more']);
    expect(helperNav).not.toContain('billing');

    const auditorSecondary = getVisibleSecondaryItems('auditor').map((i) => i.id);
    expect(auditorSecondary).toContain('reports');
    expect(auditorSecondary).toContain('accounts');
    expect(auditorSecondary).toContain('audit_history');
    expect(auditorSecondary).not.toContain('employees');
    expect(auditorSecondary).not.toContain('settings');

    // Permission override check on non-owner roles
    const limitedPharmacist = getVisibleSecondaryItems(
      'pharmacist',
      (perm) => perm !== 'reports.view'
    ).map((i) => i.id);
    expect(limitedPharmacist).not.toContain('reports');
    expect(limitedPharmacist).toContain('branches');
  });

  it('auto-selects earliest non-expired batch (FEFO) and strictly excludes expired, zero-stock, and archived items', () => {
    const results = searchSellableMedicines('dolo', SAMPLE_BATCHES, SAMPLE_MEDICINES, REF_DATE);
    expect(results).toHaveLength(1);
    expect(results[0]!.medicineId).toBe('med-dolo');
    expect(results[0]!.fefoBatch.id).toBe('batch-dolo-fefo');
    expect(results[0]!.eligibleBatches.map((b) => b.id)).toEqual([
      'batch-dolo-fefo',
      'batch-dolo-later',
    ]);
    expect(results[0]!.totalAvailableStock).toBe(58);

    // Expired or zero-stock batch numbers should never resolve in sellable search
    expect(
      searchSellableMedicines('DL-EXP', SAMPLE_BATCHES, SAMPLE_MEDICINES, REF_DATE)
    ).toHaveLength(0);
    expect(
      searchSellableMedicines('DL-ZERO', SAMPLE_BATCHES, SAMPLE_MEDICINES, REF_DATE)
    ).toHaveLength(0);
    expect(
      searchSellableMedicines('Old Syrup', SAMPLE_BATCHES, SAMPLE_MEDICINES, REF_DATE)
    ).toHaveLength(0);
  });

  it('matches medicines immediately by barcode, batch number, or salt composition', () => {
    const byBarcode = searchSellableMedicines(
      '8902222222222',
      SAMPLE_BATCHES,
      SAMPLE_MEDICINES,
      REF_DATE
    );
    expect(byBarcode).toHaveLength(1);
    expect(byBarcode[0]!.brandName).toBe('Augmentin 625 Duo');

    const bySalt = searchSellableMedicines('Amoxycillin', SAMPLE_BATCHES, SAMPLE_MEDICINES, REF_DATE);
    expect(bySalt).toHaveLength(1);
    expect(bySalt[0]!.fefoBatch.batchNumber).toBe('AUG-88');

    const byBatch = searchSellableMedicines('DL-2027', SAMPLE_BATCHES, SAMPLE_MEDICINES, REF_DATE);
    expect(byBatch).toHaveLength(1);
    expect(byBatch[0]!.brandName).toBe('Dolo 650');
  });

  it('evaluates YYYY-MM and YYYY-MM-DD expiry boundaries accurately', () => {
    expect(isBatchExpired('2026-05', REF_DATE)).toBe(true);
    expect(isBatchExpired('2026-06', REF_DATE)).toBe(false); // end of June 2026 >= June 15
    expect(isBatchExpired('2026-06-10', REF_DATE)).toBe(true);
    expect(isBatchExpired('2026-06-20', REF_DATE)).toBe(false);

    const days = getDaysToExpiry('2026-06-25', REF_DATE);
    expect(days).toBeGreaterThanOrEqual(9);
    expect(days).toBeLessThanOrEqual(11);
  });

  it('paginates lists safely and clamps out-of-range page numbers', () => {
    const list = Array.from({ length: 45 }, (_, i) => i + 1);
    const page1 = paginateItems(list, 1, 20);
    expect(page1.items).toHaveLength(20);
    expect(page1.totalPages).toBe(3);
    expect(page1.page).toBe(1);

    const page3 = paginateItems(list, 3, 20);
    expect(page3.items).toEqual([41, 42, 43, 44, 45]);

    const clampedHigh = paginateItems(list, 99, 20);
    expect(clampedHigh.page).toBe(3);
    expect(clampedHigh.items).toEqual([41, 42, 43, 44, 45]);

    const clampedLow = paginateItems(list, 0, 20);
    expect(clampedLow.page).toBe(1);
  });
});

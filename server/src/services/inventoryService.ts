import crypto from 'node:crypto';
import { firestore } from '../lib/firebaseAdmin';
import { NotFoundError, BadRequestError } from '../lib/errors';
import { AuditService } from './auditService';
import { MedicineService } from './medicineService';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export type StockMovementType =
  | 'OPENING_STOCK'
  | 'PURCHASE_RECEIPT'
  | 'SALE'
  | 'SALE_RETURN'
  | 'INVOICE_CANCEL_REVERSAL'
  | 'PURCHASE_RETURN'
  | 'DAMAGE'
  | 'EXPIRY'
  | 'MANUAL_ADJUSTMENT'
  | 'STOCK_TRANSFER_IN'
  | 'STOCK_TRANSFER_OUT';

export type BatchStockStatus =
  | 'normal'
  | 'low_stock'
  | 'near_expiry'
  | 'expired'
  | 'out_of_stock';

export interface InventoryBatchRecord {
  id: string;
  tenantId: string;
  branchId: string;
  medicineId: string;
  medicineName: string;
  genericName?: string;
  batchNumber: string;
  manufacturingDate?: string | null;
  expiryDate: string; // YYYY-MM or YYYY-MM-DD
  purchasePrice: number; // PTR (Price to retailer)
  mrp: number; // Maximum retail price
  sellingPrice: number; // Default POS dispensing price
  quantityReceived: number;
  currentStock: number;
  freeQuantity: number;
  supplierId?: string | null;
  supplierName?: string | null;
  purchaseReferenceId?: string | null;
  rackLocation?: string | null;
  barcode?: string | null;
  status: BatchStockStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovementRecord {
  id: string;
  tenantId: string;
  branchId: string;
  medicineId: string;
  batchId: string;
  batchNumber: string;
  medicineName: string;
  movementType: StockMovementType;
  quantityChange: number; // positive for additions, negative for subtractions
  previousQuantity: number;
  newQuantity: number;
  referenceType?: string | null; // e.g. 'opening_stock', 'adjustment', 'sales_invoice', 'goods_receipt'
  referenceId?: string | null;
  reason?: string | null;
  performedBy: string; // userId
  timestamp: string;
}

export interface CreateOpeningStockInput {
  medicineId: string;
  batchNumber: string;
  manufacturingDate?: string | null;
  expiryDate: string;
  purchasePrice: number;
  mrp: number;
  sellingPrice?: number;
  quantity: number;
  freeQuantity?: number;
  supplierId?: string | null;
  supplierName?: string | null;
  rackLocation?: string | null;
  barcode?: string | null;
}

export interface StockAdjustmentInput {
  movementType?: 'MANUAL_ADJUSTMENT' | 'DAMAGE' | 'EXPIRY' | 'SALE_RETURN' | 'PURCHASE_RETURN';
  quantityChange?: number; // e.g. -5 for damage, +10 for return
  newCount?: number; // physical counted stock (alternative to quantityChange)
  reason: string;
  referenceId?: string;
}

export interface ListBatchesOptions {
  branchId?: string;
  medicineId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ListMovementsOptions {
  branchId?: string;
  medicineId?: string;
  batchId?: string;
  movementType?: StockMovementType;
  limit?: number;
}

// In-memory stores for unit test execution
const testBatchStore = new Map<string, InventoryBatchRecord>();
const testMovementStore = new Map<string, StockMovementRecord>();
const testInventoryLocks = new Map<string, Promise<unknown>>();

export async function withTestBranchInventoryLock<T>(
  tenantId: string,
  branchId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = `${tenantId}:${branchId}`;
  const previous = testInventoryLocks.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => current, () => current);
  testInventoryLocks.set(lockKey, chained);

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (testInventoryLocks.get(lockKey) === chained) {
      testInventoryLocks.delete(lockKey);
    }
  }
}

export function setTestBatch(tenantId: string, batch: InventoryBatchRecord) {
  testBatchStore.set(`${tenantId}:${batch.id}`, batch);
}

export function getTestBatchDirect(tenantId: string, batchId: string): InventoryBatchRecord | undefined {
  return testBatchStore.get(`${tenantId}:${batchId}`);
}

export function getAllTestBatchesForTenant(tenantId: string): InventoryBatchRecord[] {
  const result: InventoryBatchRecord[] = [];
  for (const [key, val] of testBatchStore.entries()) {
    if (key.startsWith(`${tenantId}:`)) {
      result.push(val);
    }
  }
  return result;
}

export function recordTestMovementDirect(tenantId: string, movement: StockMovementRecord) {
  testMovementStore.set(`${tenantId}:${movement.id}`, movement);
}

export function clearTestInventory() {
  testBatchStore.clear();
  testMovementStore.clear();
  testInventoryLocks.clear();
}

export class InventoryService {
  private static isTest(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST)
    );
  }

  /**
   * Helper to evaluate batch stock status based on expiry and quantity.
   */
  public static computeBatchStatus(
    currentStock: number,
    expiryDate: string,
    minStockThreshold: number = 10,
    warningDays: number = 90
  ): BatchStockStatus {
    if (currentStock <= 0) {
      return 'out_of_stock';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Parse expiry date (supports "YYYY-MM" or "YYYY-MM-DD")
    let exp: Date;
    if (expiryDate.length === 7) {
      const [year, month] = expiryDate.split('-').map(Number);
      // Last day of month
      exp = new Date(year!, month!, 0);
    } else {
      exp = new Date(expiryDate);
    }

    if (exp.getTime() < today.getTime()) {
      return 'expired';
    }

    const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= warningDays) {
      return 'near_expiry';
    }

    if (currentStock <= minStockThreshold) {
      return 'low_stock';
    }

    return 'normal';
  }

  /**
   * Inwards opening stock or manual batch entry with immutable ledger recording.
   */
  public static async createOpeningStock(
    tenantId: string,
    branchId: string,
    input: CreateOpeningStockInput,
    userId: string
  ): Promise<{ batch: InventoryBatchRecord; movement: StockMovementRecord }> {
    if (!input.medicineId || !input.batchNumber || !input.expiryDate) {
      throw new BadRequestError('Medicine ID, batch number, and expiry date are required');
    }

    if (typeof input.quantity !== 'number' || input.quantity <= 0) {
      throw new BadRequestError('Opening stock quantity must be greater than zero');
    }

    if (typeof input.purchasePrice !== 'number' || input.purchasePrice < 0) {
      throw new BadRequestError('Purchase price (PTR) must be a non-negative number');
    }

    if (typeof input.mrp !== 'number' || input.mrp < 0) {
      throw new BadRequestError('MRP must be a non-negative number');
    }

    if (input.mrp < input.purchasePrice) {
      throw new BadRequestError(`MRP (₹${input.mrp}) cannot be lower than purchase price PTR (₹${input.purchasePrice})`);
    }

    // Verify medicine exists in tenant catalogue
    const med = await MedicineService.getMedicine(tenantId, input.medicineId);

    const batchNumber = input.batchNumber.trim().toUpperCase();
    const now = new Date().toISOString();
    const batchId = `batch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const sellingPrice = typeof input.sellingPrice === 'number' && input.sellingPrice > 0 ? input.sellingPrice : input.mrp;
    const freeQuantity = Math.max(0, Number(input.freeQuantity) || 0);
    const totalQty = input.quantity + freeQuantity;

    const status = this.computeBatchStatus(totalQty, input.expiryDate, med.minStockThreshold);

    const batchRecord: InventoryBatchRecord = {
      id: batchId,
      tenantId,
      branchId,
      medicineId: med.id,
      medicineName: med.name,
      genericName: med.genericName,
      batchNumber,
      manufacturingDate: input.manufacturingDate || null,
      expiryDate: input.expiryDate,
      purchasePrice: Number(input.purchasePrice.toFixed(2)),
      mrp: Number(input.mrp.toFixed(2)),
      sellingPrice: Number(sellingPrice.toFixed(2)),
      quantityReceived: totalQty,
      currentStock: totalQty,
      freeQuantity,
      supplierId: input.supplierId || null,
      supplierName: input.supplierName || null,
      rackLocation: input.rackLocation || med.packSize,
      barcode: input.barcode || med.barcode || null,
      status,
      createdAt: now,
      updatedAt: now,
    };

    const movementId = `mov_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const movementRecord: StockMovementRecord = {
      id: movementId,
      tenantId,
      branchId,
      medicineId: med.id,
      batchId,
      batchNumber,
      medicineName: med.name,
      movementType: 'OPENING_STOCK',
      quantityChange: totalQty,
      previousQuantity: 0,
      newQuantity: totalQty,
      referenceType: 'opening_stock',
      referenceId: batchId,
      reason: 'Initial opening stock inward',
      performedBy: userId,
      timestamp: now,
    };

    if (this.isTest()) {
      testBatchStore.set(`${tenantId}:${batchId}`, batchRecord);
      testMovementStore.set(`${tenantId}:${movementId}`, movementRecord);
    } else {
      const db = firestore();
      const batchRef = db.collection('tenants').doc(tenantId).collection('inventory_batches').doc(batchId);
      const movRef = db.collection('tenants').doc(tenantId).collection('stock_movements').doc(movementId);

      const writeBatch = db.batch();
      writeBatch.set(batchRef, batchRecord);
      writeBatch.set(movRef, movementRecord);
      await writeBatch.commit();
    }

    await AuditService.log({
      tenantId,
      action: 'STOCK_OPENING_RECORDED',
      actingUserId: userId,
      metadata: {
        resourceType: 'inventory_batches',
        resourceId: batchId,
        batchNumber,
        medicineName: med.name,
        quantity: totalQty,
        branchId,
      },
    });

    logger.info({ tenantId, branchId, batchId, batchNumber, totalQty }, 'Opening stock recorded successfully');
    return { batch: batchRecord, movement: movementRecord };
  }

  /**
   * Retrieves a single batch by ID with branch check.
   */
  public static async getBatch(tenantId: string, batchId: string): Promise<InventoryBatchRecord> {
    if (this.isTest()) {
      const batch = testBatchStore.get(`${tenantId}:${batchId}`);
      if (!batch) {
        throw new NotFoundError(`Inventory batch '${batchId}' not found.`);
      }
      return batch;
    }

    const db = firestore();
    const snap = await db.collection('tenants').doc(tenantId).collection('inventory_batches').doc(batchId).get();
    if (!snap.exists) {
      throw new NotFoundError(`Inventory batch '${batchId}' not found.`);
    }

    return snap.data() as InventoryBatchRecord;
  }

  /**
   * Performs an atomic stock adjustment inside a Firestore transaction (or locked in test mode).
   * Strict invariant: Negative stock is prohibited.
   */
  public static async adjustStock(
    tenantId: string,
    branchId: string,
    batchId: string,
    input: StockAdjustmentInput,
    userId: string
  ): Promise<{ batch: InventoryBatchRecord; movement: StockMovementRecord }> {
    const computeTransition = (existing: InventoryBatchRecord) => {
      if (existing.branchId !== branchId) {
        throw new BadRequestError(
          `Batch '${batchId}' belongs to branch '${existing.branchId}', not current branch '${branchId}'.`
        );
      }

      let delta = 0;
      if (typeof input.newCount === 'number') {
        if (input.newCount < 0) {
          throw new BadRequestError('Physical counted stock cannot be negative');
        }
        delta = input.newCount - existing.currentStock;
      } else if (typeof input.quantityChange === 'number') {
        delta = input.quantityChange;
      } else {
        throw new BadRequestError('Either quantityChange or newCount must be provided for stock adjustment');
      }

      if (delta === 0) {
        throw new BadRequestError('Stock adjustment quantity delta is 0; no change to record');
      }

      const previousStock = existing.currentStock;
      const newStock = previousStock + delta;

      if (newStock < 0) {
        throw new BadRequestError(
          `Stock adjustment would result in negative inventory balance (${newStock}). Current available stock is ${previousStock}.`
        );
      }

      const now = new Date().toISOString();
      const movementType: StockMovementType = input.movementType || 'MANUAL_ADJUSTMENT';
      const status = this.computeBatchStatus(newStock, existing.expiryDate);

      const updatedBatch: InventoryBatchRecord = {
        ...existing,
        currentStock: newStock,
        status,
        updatedAt: now,
      };

      const movementId = `mov_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const movementRecord: StockMovementRecord = {
        id: movementId,
        tenantId,
        branchId,
        medicineId: existing.medicineId,
        batchId,
        batchNumber: existing.batchNumber,
        medicineName: existing.medicineName,
        movementType,
        quantityChange: delta,
        previousQuantity: previousStock,
        newQuantity: newStock,
        referenceType: 'adjustment',
        referenceId: input.referenceId || null,
        reason: input.reason || 'Manual inventory stock adjustment',
        performedBy: userId,
        timestamp: now,
      };

      return { updatedBatch, movementRecord, previousStock, newStock, delta, movementType };
    };

    let resultData: ReturnType<typeof computeTransition>;

    if (this.isTest()) {
      resultData = await withTestBranchInventoryLock(tenantId, branchId, async () => {
        const existing = testBatchStore.get(`${tenantId}:${batchId}`);
        if (!existing) {
          throw new NotFoundError(`Inventory batch '${batchId}' not found.`);
        }
        const computed = computeTransition(existing);
        testBatchStore.set(`${tenantId}:${batchId}`, computed.updatedBatch);
        testMovementStore.set(`${tenantId}:${computed.movementRecord.id}`, computed.movementRecord);
        return computed;
      });
    } else {
      const db = firestore();
      const tenantRef = db.collection('tenants').doc(tenantId);
      const batchRef = tenantRef.collection('inventory_batches').doc(batchId);

      resultData = await db.runTransaction(async (tx) => {
        const snap = await tx.get(batchRef);
        if (!snap.exists) {
          throw new NotFoundError(`Inventory batch '${batchId}' not found.`);
        }
        const existing = snap.data() as InventoryBatchRecord;
        const computed = computeTransition(existing);
        const movRef = tenantRef.collection('stock_movements').doc(computed.movementRecord.id);

        tx.set(batchRef, computed.updatedBatch);
        tx.set(movRef, computed.movementRecord);
        return computed;
      });
    }

    await AuditService.log({
      tenantId,
      action: 'STOCK_ADJUSTMENT_EXECUTED',
      actingUserId: userId,
      metadata: {
        resourceType: 'inventory_batches',
        resourceId: batchId,
        batchNumber: resultData.updatedBatch.batchNumber,
        movementType: resultData.movementType,
        delta: resultData.delta,
        previousStock: resultData.previousStock,
        newStock: resultData.newStock,
        reason: input.reason,
      },
    });

    return { batch: resultData.updatedBatch, movement: resultData.movementRecord };
  }

  /**
   * Lists batches with optional branch, medicine, status, search filters and pagination.
   */
  public static async listBatches(
    tenantId: string,
    options: ListBatchesOptions = {}
  ): Promise<{ batches: InventoryBatchRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 25));

    let all: InventoryBatchRecord[] = [];

    if (this.isTest()) {
      for (const [key, val] of testBatchStore.entries()) {
        if (key.startsWith(`${tenantId}:`)) {
          all.push(val);
        }
      }
    } else {
      const db = firestore();
      const snap = await db.collection('tenants').doc(tenantId).collection('inventory_batches').get();
      all = snap.docs.map((doc) => doc.data() as InventoryBatchRecord);
    }

    // Branch filter
    if (options.branchId && options.branchId !== 'all') {
      all = all.filter((b) => b.branchId === options.branchId);
    }

    // Medicine filter
    if (options.medicineId) {
      all = all.filter((b) => b.medicineId === options.medicineId);
    }

    // Status filter
    if (options.status && options.status !== 'all') {
      all = all.filter((b) => b.status === options.status);
    }

    // Search filter (brand, batch, generic, rack)
    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      all = all.filter(
        (b) =>
          b.medicineName.toLowerCase().includes(q) ||
          b.batchNumber.toLowerCase().includes(q) ||
          (b.genericName && b.genericName.toLowerCase().includes(q)) ||
          (b.rackLocation && b.rackLocation.toLowerCase().includes(q)) ||
          (b.barcode && b.barcode.toLowerCase().includes(q))
      );
    }

    // Sort by expiry date ascending (FEFO: First Expired First Out)
    all.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    const total = all.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = all.slice(startIndex, startIndex + limit);

    return {
      batches: paginated,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Lists immutable stock movements chronologically.
   */
  public static async listMovements(
    tenantId: string,
    options: ListMovementsOptions = {}
  ): Promise<StockMovementRecord[]> {
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
    let all: StockMovementRecord[] = [];

    if (this.isTest()) {
      for (const [key, val] of testMovementStore.entries()) {
        if (key.startsWith(`${tenantId}:`)) {
          all.push(val);
        }
      }
    } else {
      const db = firestore();
      const snap = await db.collection('tenants').doc(tenantId).collection('stock_movements').get();
      all = snap.docs.map((doc) => doc.data() as StockMovementRecord);
    }

    if (options.branchId && options.branchId !== 'all') {
      all = all.filter((m) => m.branchId === options.branchId);
    }

    if (options.medicineId) {
      all = all.filter((m) => m.medicineId === options.medicineId);
    }

    if (options.batchId) {
      all = all.filter((m) => m.batchId === options.batchId);
    }

    if (options.movementType) {
      all = all.filter((m) => m.movementType === options.movementType);
    }

    // Sort descending by timestamp (newest first)
    all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return all.slice(0, limit);
  }

  /**
   * Low-Stock & Out-of-Stock analysis with suggested reorder quantities.
   */
  public static async getLowStockReport(
    tenantId: string,
    branchId?: string
  ): Promise<{
    lowStockItems: Array<{
      medicineId: string;
      medicineName: string;
      genericName: string;
      brand: string;
      category: string;
      currentStock: number;
      minStockThreshold: number;
      suggestedReorderQuantity: number;
      activeBatchesCount: number;
    }>;
    outOfStockItems: Array<{
      medicineId: string;
      medicineName: string;
      genericName: string;
      brand: string;
      minStockThreshold: number;
      suggestedReorderQuantity: number;
    }>;
    totalLowStock: number;
    totalOutOfStock: number;
  }> {
    const medicinesRes = await MedicineService.listMedicines(tenantId, { limit: 500, status: 'active' });
    const batchesRes = await this.listBatches(tenantId, { branchId, limit: 1000 });

    const stockByMed = new Map<string, { currentStock: number; count: number }>();
    for (const b of batchesRes.batches) {
      const existing = stockByMed.get(b.medicineId) || { currentStock: 0, count: 0 };
      stockByMed.set(b.medicineId, {
        currentStock: existing.currentStock + b.currentStock,
        count: existing.count + 1,
      });
    }

    const lowStockItems = [];
    const outOfStockItems = [];

    for (const med of medicinesRes.medicines) {
      const info = stockByMed.get(med.id) || { currentStock: 0, count: 0 };
      const currentStock = info.currentStock;
      const threshold = med.minStockThreshold || 10;

      if (currentStock === 0) {
        outOfStockItems.push({
          medicineId: med.id,
          medicineName: med.name,
          genericName: med.genericName,
          brand: med.brand,
          minStockThreshold: threshold,
          suggestedReorderQuantity: threshold * 2,
        });
      } else if (currentStock <= threshold) {
        lowStockItems.push({
          medicineId: med.id,
          medicineName: med.name,
          genericName: med.genericName,
          brand: med.brand,
          category: med.category,
          currentStock,
          minStockThreshold: threshold,
          suggestedReorderQuantity: Math.max(0, threshold * 2 - currentStock),
          activeBatchesCount: info.count,
        });
      }
    }

    return {
      lowStockItems,
      outOfStockItems,
      totalLowStock: lowStockItems.length,
      totalOutOfStock: outOfStockItems.length,
    };
  }

  /**
   * Expiry tracking with configurable warning periods (30, 60, 90 days) and valuation at risk.
   */
  public static async getExpiryReport(
    tenantId: string,
    options: { branchId?: string; warningDays?: number } = {}
  ): Promise<{
    warningDays: number;
    expiredBatches: InventoryBatchRecord[];
    nearExpiryBatches: InventoryBatchRecord[];
    summary: {
      totalExpiredQuantity: number;
      expiredPurchaseCost: number;
      expiredMrpValue: number;
      totalNearExpiryQuantity: number;
      nearExpiryPurchaseCost: number;
      nearExpiryMrpValue: number;
    };
  }> {
    const warningDays = Number(options.warningDays) || 90;
    const { batches } = await this.listBatches(tenantId, { branchId: options.branchId, limit: 1000 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredBatches: InventoryBatchRecord[] = [];
    const nearExpiryBatches: InventoryBatchRecord[] = [];

    let expiredQty = 0;
    let expiredCost = 0;
    let expiredMrp = 0;

    let nearExpiryQty = 0;
    let nearExpiryCost = 0;
    let nearExpiryMrp = 0;

    for (const b of batches) {
      if (b.currentStock <= 0) continue; // Skip exhausted stock

      let exp: Date;
      if (b.expiryDate.length === 7) {
        const [year, month] = b.expiryDate.split('-').map(Number);
        exp = new Date(year!, month!, 0);
      } else {
        exp = new Date(b.expiryDate);
      }

      const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        expiredBatches.push(b);
        expiredQty += b.currentStock;
        expiredCost += b.currentStock * b.purchasePrice;
        expiredMrp += b.currentStock * b.mrp;
      } else if (diffDays <= warningDays) {
        nearExpiryBatches.push(b);
        nearExpiryQty += b.currentStock;
        nearExpiryCost += b.currentStock * b.purchasePrice;
        nearExpiryMrp += b.currentStock * b.mrp;
      }
    }

    return {
      warningDays,
      expiredBatches,
      nearExpiryBatches,
      summary: {
        totalExpiredQuantity: expiredQty,
        expiredPurchaseCost: Number(expiredCost.toFixed(2)),
        expiredMrpValue: Number(expiredMrp.toFixed(2)),
        totalNearExpiryQuantity: nearExpiryQty,
        nearExpiryPurchaseCost: Number(nearExpiryCost.toFixed(2)),
        nearExpiryMrpValue: Number(nearExpiryMrp.toFixed(2)),
      },
    };
  }

  /**
   * Inventory Valuation: Total quantity, Purchase-Cost Valuation, MRP Valuation, and Margins.
   */
  public static async getValuation(
    tenantId: string,
    branchId?: string
  ): Promise<{
    totalBatches: number;
    totalStockQuantity: number;
    totalPurchaseValue: number;
    totalMrpValue: number;
    projectedGrossMargin: number;
    grossMarginPercent: number;
    branchWiseValuation: Record<string, { quantity: number; purchaseValue: number; mrpValue: number }>;
    medicineWiseValuation: Array<{
      medicineId: string;
      medicineName: string;
      totalStock: number;
      purchaseValue: number;
      mrpValue: number;
    }>;
  }> {
    const { batches } = await this.listBatches(tenantId, { branchId, limit: 1000 });

    let totalStockQuantity = 0;
    let totalPurchaseValue = 0;
    let totalMrpValue = 0;

    const branchWise: Record<string, { quantity: number; purchaseValue: number; mrpValue: number }> = {};
    const medWiseMap = new Map<string, { medicineName: string; totalStock: number; purchaseValue: number; mrpValue: number }>();

    for (const b of batches) {
      if (b.currentStock <= 0) continue;

      const qty = b.currentStock;
      const pVal = qty * b.purchasePrice;
      const mVal = qty * b.mrp;

      totalStockQuantity += qty;
      totalPurchaseValue += pVal;
      totalMrpValue += mVal;

      // Branch breakdown
      const br = branchWise[b.branchId] || { quantity: 0, purchaseValue: 0, mrpValue: 0 };
      branchWise[b.branchId] = {
        quantity: br.quantity + qty,
        purchaseValue: Number((br.purchaseValue + pVal).toFixed(2)),
        mrpValue: Number((br.mrpValue + mVal).toFixed(2)),
      };

      // Medicine breakdown
      const med = medWiseMap.get(b.medicineId) || {
        medicineName: b.medicineName,
        totalStock: 0,
        purchaseValue: 0,
        mrpValue: 0,
      };
      medWiseMap.set(b.medicineId, {
        medicineName: b.medicineName,
        totalStock: med.totalStock + qty,
        purchaseValue: Number((med.purchaseValue + pVal).toFixed(2)),
        mrpValue: Number((med.mrpValue + mVal).toFixed(2)),
      });
    }

    const projectedGrossMargin = Number((totalMrpValue - totalPurchaseValue).toFixed(2));
    const grossMarginPercent = totalMrpValue > 0 ? Number(((projectedGrossMargin / totalMrpValue) * 100).toFixed(1)) : 0;

    const medicineWiseValuation = Array.from(medWiseMap.entries()).map(([medicineId, data]) => ({
      medicineId,
      medicineName: data.medicineName,
      totalStock: data.totalStock,
      purchaseValue: data.purchaseValue,
      mrpValue: data.mrpValue,
    }));

    return {
      totalBatches: batches.length,
      totalStockQuantity,
      totalPurchaseValue: Number(totalPurchaseValue.toFixed(2)),
      totalMrpValue: Number(totalMrpValue.toFixed(2)),
      projectedGrossMargin,
      grossMarginPercent,
      branchWiseValuation: branchWise,
      medicineWiseValuation,
    };
  }
}

import crypto from 'node:crypto';
import { firestore } from '../lib/firebaseAdmin';
import {
  BadRequestError,
  NotFoundError,
  InsufficientStockError,
  IdempotencyConflictError,
} from '../lib/errors';
import { logger } from '../lib/logger';
import { env } from '../config/env';
import {
  InventoryService,
  InventoryBatchRecord,
  StockMovementRecord,
  getTestBatchDirect,
  getAllTestBatchesForTenant,
  setTestBatch,
  recordTestMovementDirect,
  withTestBranchInventoryLock,
} from './inventoryService';
import { MedicineService, MedicineRecord } from './medicineService';
import { AuditService } from './auditService';
import { AccountingService } from './accountingService';
import {
  CustomerRecord,
  CustomerLedgerEntryRecord,
  applyLedgerBalanceDelta,
  computeDueDate,
  fromPaise,
  toPaise,
  getTestCustomerDirect,
  setTestCustomer,
  appendTestLedgerEntryDirect,
  getTestLedgerEntriesDirect,
  withTestCustomerLock,
} from './customerService';

const MAX_CHECKOUT_ITEMS = 50;

export interface CartItemRequest {
  medicineId: string;
  batchId?: string;
  quantity: number;
  unitPrice?: number;
  mrp?: number;
  discountPercent?: number;
  hsnCode?: string;
  gstRate?: number;
}

export interface PaymentEntry {
  id?: string;
  mode: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'khata_credit';
  amount: number;
  referenceNumber?: string;
  timestamp?: string;
}

export interface CustomerInfo {
  name: string;
  phone?: string;
  doctorName?: string;
  doctorRegNumber?: string;
  address?: string;
  gstin?: string;
}

export interface CreateInvoiceInput {
  tenantId: string;
  branchId: string;
  userId: string;
  userName?: string;
  callerRole?: string;
  callerPermissions?: string[];
  idempotencyKey: string;
  customerId?: string;
  customer: CustomerInfo;
  items: CartItemRequest[];
  payments?: PaymentEntry[];
  paymentMode?: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'khata_credit';
  creditTermsDays?: 0 | 7 | 15 | 30;
  overrideCreditLimit?: boolean;
  creditOverrideReason?: string;
  isInterState?: boolean;
  notes?: string;
}

export interface InvoiceLineItem {
  batchId: string;
  batchNumber: string;
  medicineId: string;
  medicineName: string;
  genericName?: string;
  expiryDate: string;
  packSize?: string;
  quantity: number;
  unitPrice: number;
  mrp: number;
  ptr?: number;
  hsnCode: string;
  gstRate: number;
  discountPercent: number;
  discountAmount: number;
  lineTaxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
  previousStock: number;
  newStock: number;
  returnedQuantity?: number;
}

export interface SalesInvoiceRecord {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  branchId: string;
  userId: string;
  userName: string;
  customerId?: string;
  customer: CustomerInfo;
  items: InvoiceLineItem[];
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  grandTotal: number;
  amountPaid: number;
  khataCreditAmount?: number;
  balanceDue: number;
  creditTermsDays?: number;
  dueDate?: string;
  totalRefunded?: number;
  refundStatus?: 'not_applicable' | 'refund_pending' | 'refunded';
  refundAmount?: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  payments: PaymentEntry[];
  status: 'completed' | 'cancelled' | 'partially_returned' | 'returned';
  isInterState: boolean;
  notes?: string;
  returns?: SalesReturnRecord[];
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
}

export interface SalesReturnItemInput {
  batchId: string;
  quantity: number;
  reason?: string;
  restock?: boolean;
  damaged?: boolean;
}

export interface SalesReturnRecord {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  tenantId: string;
  branchId: string;
  returnedByUserId: string;
  items: Array<{
    batchId: string;
    medicineId: string;
    medicineName: string;
    quantity: number;
    unitPrice: number;
    refundAmount: number;
    restocked: boolean;
    nonRestockReason?: string;
  }>;
  totalRefundAmount: number;
  reason: string;
  createdAt: string;
}

export interface InvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  tenantId: string;
  branchId: string;
  customerId?: string;
  totalAmount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  grandTotal: number;
  amountPaid: number;
  khataCreditAmount?: number;
  balanceDue: number;
  dueDate?: string;
  itemCount: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  payments: PaymentEntry[];
  paymentMode: string;
  createdAt: string;
  fromCache?: boolean;
}

export interface ListInvoicesOptions {
  branchId?: string;
  status?: string;
  paymentStatus?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

interface IdempotencyEntry<T = unknown> {
  key: string;
  operation: 'checkout' | 'payment' | 'return' | 'cancel';
  tenantId: string;
  branchId: string;
  payloadHash: string;
  status: 'pending' | 'completed';
  result?: T;
  timestamp: number;
  completedAt?: string;
}

// In-memory test stores for deterministic Vitest execution
const testInvoiceStore = new Map<string, SalesInvoiceRecord>();
const testIdempotencyStore = new Map<string, IdempotencyEntry>();
const testInvoiceCounters = new Map<string, number>();

export function clearTestBilling(): void {
  testInvoiceStore.clear();
  testIdempotencyStore.clear();
  testInvoiceCounters.clear();
}

export function setTestInvoice(tenantId: string, invoice: SalesInvoiceRecord): void {
  testInvoiceStore.set(`${tenantId}:${invoice.id}`, invoice);
}

export function getTestInvoice(tenantId: string, invoiceId: string): SalesInvoiceRecord | undefined {
  return testInvoiceStore.get(`${tenantId}:${invoiceId}`);
}

export function getAllTestInvoicesForTenant(tenantId: string): SalesInvoiceRecord[] {
  const result: SalesInvoiceRecord[] = [];
  for (const [key, val] of testInvoiceStore.entries()) {
    if (key.startsWith(`${tenantId}:`)) {
      result.push(val);
    }
  }
  return result;
}

/**
 * Monetary rounding helper: avoids JavaScript floating-point errors by rounding to 2 decimal places (paise).
 */
export function roundPaise(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Checks if a batch expiry date (YYYY-MM or YYYY-MM-DD) is in the past.
 */
export function isBatchExpired(expiryDate: string): boolean {
  if (!expiryDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let exp: Date;
  if (expiryDate.length === 7) {
    const [year, month] = expiryDate.split('-').map(Number);
    exp = new Date(year!, month!, 0, 23, 59, 59);
  } else {
    exp = new Date(expiryDate);
    exp.setHours(23, 59, 59, 999);
  }

  return exp.getTime() < today.getTime();
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) {
        sorted[key] = canonicalize(v);
      }
    }
    return sorted;
  }
  return value;
}

function hashPayload(payload: unknown): string {
  const canonical = JSON.stringify(canonicalize(payload));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function deterministicId(prefix: string, ...parts: string[]): string {
  const digest = crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 24);
  return `${prefix}_${digest}`;
}

function buildBranchInvoiceCode(branchId: string): string {
  return (branchId || 'MAIN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'MAIN';
}

export class BillingTransactionService {
  private static isTest(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST)
    );
  }

  /**
   * Generates a concurrency-safe sequential invoice number scoped to tenant and branch.
   * For checkout, invoice numbering executes inside the checkout Firestore transaction itself
   * so failed transactions never burn sequence numbers.
   */
  public static async generateInvoiceNumber(tenantId: string, branchId: string): Promise<string> {
    const year = new Date().getFullYear();
    const branchCode = buildBranchInvoiceCode(branchId);
    const counterKey = `${tenantId}:${branchId}:${year}`;

    if (this.isTest()) {
      const current = (testInvoiceCounters.get(counterKey) || 100) + 1;
      testInvoiceCounters.set(counterKey, current);
      const seqStr = String(current).padStart(6, '0');
      return `INV-${branchCode}-${year}-${seqStr}`;
    }

    const db = firestore();
    const counterRef = db
      .collection('tenants')
      .doc(tenantId)
      .collection('counters')
      .doc(`invoice_${branchCode}_${year}`);

    const newSeq = await db.runTransaction(async (t) => {
      const doc = await t.get(counterRef);
      const current = doc.exists ? (doc.data()?.currentSeq || 100) : 100;
      const next = current + 1;
      t.set(counterRef, { currentSeq: next, updatedAt: new Date().toISOString() }, { merge: true });
      return next;
    });

    const seqStr = String(newSeq).padStart(6, '0');
    return `INV-${branchCode}-${year}-${seqStr}`;
  }

  /**
   * Read-only FEFO preview allocation helper (used for POS shelf selection and validation).
   */
  public static async allocateBatchesFEFO(
    tenantId: string,
    branchId: string,
    medicineId: string,
    requestedQuantity: number,
    explicitBatchId?: string
  ): Promise<Array<{ batch: InventoryBatchRecord; allocateQty: number }>> {
    if (requestedQuantity <= 0) {
      throw new BadRequestError('Requested allocation quantity must be greater than zero');
    }

    if (explicitBatchId) {
      const batch = await InventoryService.getBatch(tenantId, explicitBatchId);
      if (batch.branchId !== branchId) {
        throw new BadRequestError(
          `Batch '${batch.batchNumber}' belongs to branch '${batch.branchId}', not current branch '${branchId}'`
        );
      }
      if (isBatchExpired(batch.expiryDate)) {
        throw new BadRequestError(
          `Selected batch '${batch.batchNumber}' expired on ${batch.expiryDate} and cannot be dispensed`
        );
      }
      if (batch.currentStock < requestedQuantity) {
        throw new InsufficientStockError(
          `Insufficient stock in batch '${batch.batchNumber}'. Available: ${batch.currentStock}, Requested: ${requestedQuantity}`
        );
      }
      return [{ batch, allocateQty: requestedQuantity }];
    }

    const listRes = await InventoryService.listBatches(tenantId, {
      branchId,
      medicineId,
      limit: 100,
    });

    const eligibleBatches = listRes.batches
      .filter((b) => !isBatchExpired(b.expiryDate) && b.currentStock > 0)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    const totalEligibleStock = eligibleBatches.reduce((sum, b) => sum + b.currentStock, 0);
    if (totalEligibleStock < requestedQuantity) {
      const med = await MedicineService.getMedicine(tenantId, medicineId).catch(() => null);
      const name = med?.name || medicineId;
      throw new InsufficientStockError(
        `Insufficient non-expired stock for '${name}'. Available: ${totalEligibleStock}, Requested: ${requestedQuantity}`
      );
    }

    let remaining = requestedQuantity;
    const allocations: Array<{ batch: InventoryBatchRecord; allocateQty: number }> = [];

    for (const batch of eligibleBatches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.currentStock);
      allocations.push({ batch, allocateQty: take });
      remaining -= take;
    }

    return allocations;
  }

  /**
   * Executes an atomic, idempotent POS Billing transaction.
   * All reads (idempotency key, sequential counter, batches, medicine masters) occur BEFORE
   * any writes inside a single Firestore transaction (or serialized branch lock in test mode).
   */
  public static async createSalesInvoice(input: CreateInvoiceInput): Promise<InvoiceResult> {
    const {
      tenantId,
      branchId,
      userId,
      userName = 'Billing Staff',
      callerRole,
      callerPermissions = [],
      idempotencyKey,
      customerId,
      customer,
      items,
      payments = [],
      paymentMode,
      creditTermsDays,
      overrideCreditLimit = false,
      creditOverrideReason,
      isInterState = false,
      notes,
    } = input;

    if (!branchId || !branchId.trim()) {
      throw new BadRequestError('Valid branchId is required for POS checkout');
    }

    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestError('Idempotency key must be at least 8 characters');
    }

    if (!items || items.length === 0) {
      throw new BadRequestError('Invoice must contain at least one medicine item');
    }

    if (items.length > MAX_CHECKOUT_ITEMS) {
      throw new BadRequestError(
        `Checkout exceeds maximum of ${MAX_CHECKOUT_ITEMS} line items per atomic invoice transaction`
      );
    }

    for (const item of items) {
      if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestError('Item quantity must be a positive integer');
      }
    }

    if (payments && payments.length > 0) {
      for (const p of payments) {
        if (typeof p.amount !== 'number' || p.amount <= 0) {
          throw new BadRequestError('Each payment entry amount must be greater than zero');
        }
      }
    }

    const cleanIdempotencyKey = idempotencyKey.trim();

    // Branch- and tenant-scoped canonical payload hash
    const payloadHash = hashPayload({
      branchId,
      customerId,
      customer: {
        name: customer.name?.trim(),
        phone: customer.phone?.trim(),
        doctorName: customer.doctorName?.trim(),
        doctorRegNumber: customer.doctorRegNumber?.trim(),
        address: customer.address?.trim(),
        gstin: customer.gstin?.trim(),
      },
      items: items.map((i) => ({
        medicineId: i.medicineId,
        batchId: i.batchId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountPercent: i.discountPercent || 0,
        hsnCode: i.hsnCode,
        gstRate: i.gstRate,
      })),
      payments: payments.map((p) => ({
        mode: p.mode,
        amount: roundPaise(p.amount),
        referenceNumber: p.referenceNumber,
      })),
      paymentMode,
      creditTermsDays,
      overrideCreditLimit,
      creditOverrideReason,
      isInterState,
      notes,
    });

    const idempDocId = deterministicId('idemp_checkout', tenantId, branchId, cleanIdempotencyKey);
    const testIdempKey = `${tenantId}:${branchId}:checkout:${cleanIdempotencyKey}`;
    const invoiceId = deterministicId('inv', tenantId, branchId, cleanIdempotencyKey);

    const buildInvoiceAndWrites = async (opts: {
      loadBatch: (batchId: string) => Promise<InventoryBatchRecord | undefined>;
      loadMedicineBatchesForBranch: (medicineId: string) => Promise<InventoryBatchRecord[]>;
      loadMedicine: (medicineId: string) => Promise<MedicineRecord | null>;
      loadCustomer: (custId: string) => Promise<CustomerRecord | null>;
      nextInvoiceSeq: () => Promise<number>;
    }) => {
      // Mutable working view of batch stock across multiple cart lines in the same transaction
      const batchCache = new Map<string, InventoryBatchRecord>();
      const workingStock = new Map<string, number>();
      const medicineCache = new Map<string, MedicineRecord | null>();

      const getMedicineCached = async (medicineId: string): Promise<MedicineRecord | null> => {
        if (medicineCache.has(medicineId)) {
          return medicineCache.get(medicineId)!;
        }
        const med = await opts.loadMedicine(medicineId);
        medicineCache.set(medicineId, med);
        return med;
      };

      const getBatchWorkingStock = (b: InventoryBatchRecord): number => {
        if (!batchCache.has(b.id)) {
          batchCache.set(b.id, { ...b });
        }
        if (!workingStock.has(b.id)) {
          workingStock.set(b.id, b.currentStock);
        }
        return workingStock.get(b.id)!;
      };

      const verifiedLineItems: InvoiceLineItem[] = [];
      const batchUpdates = new Map<string, InventoryBatchRecord>();
      const movementsToWrite: StockMovementRecord[] = [];
      const timestamp = new Date().toISOString();

      // Pre-load all referenced medicine masters and batches BEFORE allocating
      const uniqueMedIds = Array.from(new Set(items.map((i) => i.medicineId)));
      await Promise.all(uniqueMedIds.map((id) => getMedicineCached(id)));

      const fefoMedIds = Array.from(new Set(items.filter((i) => !i.batchId).map((i) => i.medicineId)));
      const fefoBatchesByMed = new Map<string, InventoryBatchRecord[]>();
      for (const medId of fefoMedIds) {
        const list = await opts.loadMedicineBatchesForBranch(medId);
        list.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
        fefoBatchesByMed.set(medId, list);
        for (const b of list) {
          getBatchWorkingStock(b);
        }
      }

      const explicitBatchIds = Array.from(new Set(items.filter((i) => i.batchId).map((i) => i.batchId!)));
      for (const bId of explicitBatchIds) {
        if (!batchCache.has(bId)) {
          const b = await opts.loadBatch(bId);
          if (!b) {
            throw new NotFoundError(`Batch '${bId}' does not exist`);
          }
          getBatchWorkingStock(b);
        }
      }

      // Load linked registered customer BEFORE any mutations inside transaction
      let registeredCustomer: CustomerRecord | null = null;
      if (customerId) {
        registeredCustomer = await opts.loadCustomer(customerId);
        if (!registeredCustomer) {
          throw new NotFoundError(`Customer '${customerId}' not found`);
        }
        if (registeredCustomer.tenantId !== tenantId) {
          throw new NotFoundError(`Customer '${customerId}' does not belong to this pharmacy`);
        }
        if (registeredCustomer.isArchived) {
          throw new BadRequestError(
            `Customer '${registeredCustomer.name}' is archived and cannot be billed`
          );
        }
      }

      // Reserve invoice sequence number AFTER reading counters inside transaction
      const nextSeq = await opts.nextInvoiceSeq();
      const year = new Date().getFullYear();
      const branchCode = buildBranchInvoiceCode(branchId);
      const invoiceNumber = `INV-${branchCode}-${year}-${String(nextSeq).padStart(6, '0')}`;

      for (const reqItem of items) {
        const medMaster = await getMedicineCached(reqItem.medicineId);
        const allocations: Array<{ batch: InventoryBatchRecord; allocateQty: number }> = [];

        if (reqItem.batchId) {
          const batch = batchCache.get(reqItem.batchId);
          if (!batch) {
            throw new NotFoundError(`Batch '${reqItem.batchId}' does not exist`);
          }
          if (batch.branchId !== branchId) {
            throw new BadRequestError(
              `Batch '${batch.batchNumber}' belongs to branch '${batch.branchId}', not current branch '${branchId}'`
            );
          }
          if (batch.medicineId !== reqItem.medicineId) {
            throw new BadRequestError(
              `Batch '${batch.batchNumber}' belongs to medicine '${batch.medicineId}', not '${reqItem.medicineId}'`
            );
          }
          if (isBatchExpired(batch.expiryDate)) {
            throw new BadRequestError(
              `Selected batch '${batch.batchNumber}' expired on ${batch.expiryDate} and cannot be dispensed`
            );
          }
          const available = getBatchWorkingStock(batch);
          if (available < reqItem.quantity) {
            throw new InsufficientStockError(
              `Insufficient stock in batch '${batch.batchNumber}'. Available: ${available}, Requested: ${reqItem.quantity}`
            );
          }
          allocations.push({ batch, allocateQty: reqItem.quantity });
        } else {
          const candidates = (fefoBatchesByMed.get(reqItem.medicineId) || []).filter(
            (b) => !isBatchExpired(b.expiryDate) && getBatchWorkingStock(b) > 0
          );
          const totalAvailable = candidates.reduce((sum, b) => sum + getBatchWorkingStock(b), 0);
          if (totalAvailable < reqItem.quantity) {
            const name = medMaster?.name || reqItem.medicineId;
            throw new InsufficientStockError(
              `Insufficient non-expired stock for '${name}'. Available: ${totalAvailable}, Requested: ${reqItem.quantity}`
            );
          }
          let remaining = reqItem.quantity;
          for (const b of candidates) {
            if (remaining <= 0) break;
            const avail = getBatchWorkingStock(b);
            if (avail <= 0) continue;
            const take = Math.min(remaining, avail);
            allocations.push({ batch: b, allocateQty: take });
            remaining -= take;
          }
        }

        for (const { batch, allocateQty } of allocations) {
          const unitPrice =
            typeof reqItem.unitPrice === 'number' && reqItem.unitPrice > 0
              ? reqItem.unitPrice
              : batch.sellingPrice || batch.mrp;

          const mrp = batch.mrp;
          const discountPercent = Math.max(0, Math.min(100, Number(reqItem.discountPercent) || 0));
          const gstRate = typeof medMaster?.gstRate === 'number' ? medMaster.gstRate : (reqItem.gstRate ?? 12);
          const hsnCode = medMaster?.hsnCode || reqItem.hsnCode || '300490';

          const lineGross = roundPaise(unitPrice * allocateQty);
          const discountAmount = roundPaise(lineGross * (discountPercent / 100));
          const linePayable = roundPaise(lineGross - discountAmount);

          const lineTaxable = roundPaise(linePayable / (1 + gstRate / 100));
          const taxAmount = roundPaise(linePayable - lineTaxable);

          let lineCgst = 0;
          let lineSgst = 0;
          let lineIgst = 0;
          if (isInterState) {
            lineIgst = taxAmount;
          } else {
            lineCgst = roundPaise(taxAmount / 2);
            lineSgst = roundPaise(taxAmount - lineCgst);
          }

          const previousStock = getBatchWorkingStock(batch);
          const newStock = previousStock - allocateQty;
          if (newStock < 0) {
            throw new InsufficientStockError(
              `Non-negative stock invariant violated for batch ${batch.batchNumber}`
            );
          }
          workingStock.set(batch.id, newStock);

          const minThreshold = medMaster?.minStockThreshold ?? 10;
          const updatedBatch: InventoryBatchRecord = {
            ...batch,
            currentStock: newStock,
            status: InventoryService.computeBatchStatus(newStock, batch.expiryDate, minThreshold),
            updatedAt: timestamp,
          };
          batchCache.set(batch.id, updatedBatch);
          batchUpdates.set(batch.id, updatedBatch);

          const lineIndex = verifiedLineItems.length;
          const movementId = deterministicId('mov', invoiceId, String(lineIndex));
          movementsToWrite.push({
            id: movementId,
            tenantId,
            branchId,
            medicineId: batch.medicineId,
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            medicineName: batch.medicineName,
            movementType: 'SALE',
            quantityChange: -allocateQty,
            previousQuantity: previousStock,
            newQuantity: newStock,
            referenceType: 'sales_invoice',
            referenceId: invoiceId,
            reason: `POS Dispense: ${invoiceNumber}`,
            performedBy: userId,
            timestamp,
          });

          verifiedLineItems.push({
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            medicineId: batch.medicineId,
            medicineName: batch.medicineName,
            genericName: batch.genericName,
            expiryDate: batch.expiryDate,
            packSize: medMaster?.packSize || undefined,
            quantity: allocateQty,
            unitPrice,
            mrp,
            ptr: batch.purchasePrice,
            hsnCode,
            gstRate,
            discountPercent,
            discountAmount,
            lineTaxable,
            cgst: lineCgst,
            sgst: lineSgst,
            igst: lineIgst,
            lineTotal: linePayable,
            previousStock,
            newStock,
          });
        }
      }

      const subtotal = roundPaise(
        verifiedLineItems.reduce((sum, item) => sum + roundPaise(item.unitPrice * item.quantity), 0)
      );
      const totalDiscount = roundPaise(
        verifiedLineItems.reduce((sum, item) => sum + item.discountAmount, 0)
      );
      const taxableAmount = roundPaise(
        verifiedLineItems.reduce((sum, item) => sum + item.lineTaxable, 0)
      );
      const cgst = roundPaise(verifiedLineItems.reduce((sum, item) => sum + item.cgst, 0));
      const sgst = roundPaise(verifiedLineItems.reduce((sum, item) => sum + item.sgst, 0));
      const igst = roundPaise(verifiedLineItems.reduce((sum, item) => sum + item.igst, 0));

      const rawTotal = roundPaise(taxableAmount + cgst + sgst + igst);
      const grandTotal = Math.round(rawTotal);
      const roundOff = roundPaise(grandTotal - rawTotal);

      const normalizedPayments: PaymentEntry[] = [];
      if (payments && payments.length > 0) {
        payments.forEach((p, idx) => {
          if (p.amount > 0) {
            normalizedPayments.push({
              id: deterministicId('pay', invoiceId, String(idx)),
              mode: p.mode,
              amount: roundPaise(p.amount),
              referenceNumber: p.referenceNumber,
              timestamp,
            });
          }
        });
      } else {
        const mode = paymentMode || 'cash';
        normalizedPayments.push({
          id: deterministicId('pay', invoiceId, '0'),
          mode,
          amount: grandTotal,
          timestamp,
        });
      }

      const immediatePaid = roundPaise(
        normalizedPayments
          .filter((p) => p.mode !== 'khata_credit')
          .reduce((sum, p) => sum + p.amount, 0)
      );
      const khataCreditAmount = roundPaise(
        normalizedPayments
          .filter((p) => p.mode === 'khata_credit')
          .reduce((sum, p) => sum + p.amount, 0)
      );
      const totalAllocated = roundPaise(immediatePaid + khataCreditAmount);

      if (totalAllocated > grandTotal) {
        throw new BadRequestError(
          `Total initial payment and Khata allocation (₹${totalAllocated}) cannot exceed invoice grand total (₹${grandTotal})`
        );
      }
      if (khataCreditAmount > 0 && totalAllocated !== grandTotal && payments && payments.length > 0) {
        // Allow partial khata + cash if remaining balance is still >= 0, keep exact arithmetic
      }

      // Enforce Phase 7 Customer & Khata Credit Policies atomically inside checkout
      let updatedCustomer: CustomerRecord | null = null;
      let customerLedgerEntry: CustomerLedgerEntryRecord | null = null;
      let creditOverrideAuditMeta: Record<string, unknown> | null = null;
      let resolvedCreditTerms: number | undefined;
      let resolvedDueDate: string | undefined;

      let advanceAppliedToInvoice = 0;

      if (khataCreditAmount > 0) {
        if (!registeredCustomer) {
          throw new BadRequestError(
            'A registered customer account (customerId) is required for Khata credit billing'
          );
        }
        if (registeredCustomer.status !== 'ACTIVE') {
          throw new BadRequestError(
            `Customer '${registeredCustomer.name}' is currently ${registeredCustomer.status} and cannot purchase on Khata credit`
          );
        }
        if (!registeredCustomer.creditEnabled) {
          throw new BadRequestError(
            `Khata credit facility is disabled for customer '${registeredCustomer.name}'`
          );
        }

        const terms = (creditTermsDays !== undefined
          ? creditTermsDays
          : registeredCustomer.creditTermsDays ?? 15) as 0 | 7 | 15 | 30;
        resolvedCreditTerms = terms;
        resolvedDueDate = computeDueDate(timestamp, terms);

        const delta = applyLedgerBalanceDelta(
          registeredCustomer.currentOutstandingBalance,
          registeredCustomer.advanceBalance || 0,
          {
            direction: 'DEBIT',
            amount: khataCreditAmount,
          }
        );
        if (delta.advanceDelta < 0) {
          advanceAppliedToInvoice = roundPaise(Math.abs(delta.advanceDelta));
        }

        const projectedPaise = toPaise(delta.runningBalance);
        const limitPaise = toPaise(registeredCustomer.creditLimit || 0);

        if (projectedPaise > limitPaise) {
          if (overrideCreditLimit) {
            const canOverride =
              callerRole === 'owner' || callerPermissions.includes('customers.credit_override');
            if (!canOverride) {
              const { ForbiddenError } = await import('../lib/errors');
              throw new ForbiddenError(
                'Missing required permission(s): [customers.credit_override]'
              );
            }
            if (!creditOverrideReason || creditOverrideReason.trim().length < 3) {
              throw new BadRequestError(
                'creditOverrideReason (minimum 3 characters) is required when overriding customer credit limit'
              );
            }
            creditOverrideAuditMeta = {
              customerId: registeredCustomer.id,
              customerName: registeredCustomer.name,
              invoiceId,
              invoiceNumber,
              creditLimit: registeredCustomer.creditLimit,
              previousBalance: registeredCustomer.currentOutstandingBalance,
              khataCreditAmount,
              projectedBalance: delta.runningBalance,
              reason: creditOverrideReason.trim(),
            };
          } else {
            throw new BadRequestError(
              `Customer credit limit exceeded for '${registeredCustomer.name}'. Limit: ₹${registeredCustomer.creditLimit.toFixed(2)}, Current Balance: ₹${registeredCustomer.currentOutstandingBalance.toFixed(2)}, Requested Khata Credit: ₹${khataCreditAmount.toFixed(2)}, Projected Balance: ₹${delta.runningBalance.toFixed(2)}.`
            );
          }
        }

        const ledgerId = deterministicId('led', tenantId, registeredCustomer.id, 'inv', invoiceId);
        customerLedgerEntry = {
          id: ledgerId,
          tenantId,
          branchId,
          customerId: registeredCustomer.id,
          entryType: 'CREDIT_PURCHASE',
          direction: 'DEBIT',
          amount: khataCreditAmount,
          appliedToBalance: delta.appliedToBalance,
          advanceDelta: delta.advanceDelta,
          previousBalance: delta.previousBalance,
          runningBalance: delta.runningBalance,
          previousAdvanceBalance: delta.previousAdvanceBalance,
          runningAdvanceBalance: delta.runningAdvanceBalance,
          referenceType: 'sales_invoice',
          referenceId: invoiceId,
          invoiceId,
          invoiceNumber,
          paymentMode: 'khata_credit',
          description: `Khata Credit Sale — Invoice ${invoiceNumber}`,
          reason: creditOverrideAuditMeta
            ? `POS Khata Credit Sale (Credit Limit Override: ${creditOverrideReason?.trim()})`
            : `POS Khata Credit Sale (${terms}d terms)`,
          operationRef: `invoice:${invoiceId}`,
          performedBy: userId,
          performedByName: userName,
          timestamp,
        };

        updatedCustomer = {
          ...registeredCustomer,
          currentOutstandingBalance: delta.runningBalance,
          advanceBalance: delta.runningAdvanceBalance,
          totalPurchases: fromPaise(toPaise(registeredCustomer.totalPurchases || 0) + toPaise(grandTotal)),
          totalVisits: (registeredCustomer.totalVisits || 0) + 1,
          lastPurchaseDate: timestamp,
          updatedBy: userId,
          updatedAt: timestamp,
        };
      } else if (registeredCustomer) {
        // Cash/UPI/Card sale linked to registered customer updates lifetime purchase metrics
        updatedCustomer = {
          ...registeredCustomer,
          totalPurchases: fromPaise(toPaise(registeredCustomer.totalPurchases || 0) + toPaise(grandTotal)),
          totalVisits: (registeredCustomer.totalVisits || 0) + 1,
          lastPurchaseDate: timestamp,
          updatedBy: userId,
          updatedAt: timestamp,
        };
      }

      const amountPaid = fromPaise(toPaise(immediatePaid) + toPaise(advanceAppliedToInvoice));
      const balanceDue = roundPaise(Math.max(0, grandTotal - amountPaid));
      let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
      if (balanceDue === 0) {
        paymentStatus = 'paid';
      } else if (amountPaid > 0) {
        paymentStatus = 'partial';
      }

      const resolvedCustomerName =
        (customer.name?.trim() && customer.name.trim() !== 'Walk-in Customer')
          ? customer.name.trim()
          : (registeredCustomer?.name || 'Walk-in Customer');
      const resolvedCustomerPhone = customer.phone?.trim() || registeredCustomer?.phone;

      const invoiceRecord: SalesInvoiceRecord = {
        id: invoiceId,
        invoiceNumber,
        tenantId,
        branchId,
        userId,
        userName,
        ...(registeredCustomer ? { customerId: registeredCustomer.id } : {}),
        customer: {
          name: resolvedCustomerName,
          phone: resolvedCustomerPhone,
          doctorName: customer.doctorName?.trim() || registeredCustomer?.preferredDoctorName || undefined,
          doctorRegNumber: customer.doctorRegNumber?.trim(),
          address: customer.address?.trim() || registeredCustomer?.address || undefined,
          gstin: customer.gstin?.trim() || registeredCustomer?.gstin || undefined,
        },
        items: verifiedLineItems,
        subtotal,
        totalDiscount,
        taxableAmount,
        cgst,
        sgst,
        igst,
        roundOff,
        grandTotal,
        amountPaid,
        ...(khataCreditAmount > 0 ? { khataCreditAmount } : {}),
        balanceDue,
        ...(resolvedCreditTerms !== undefined ? { creditTermsDays: resolvedCreditTerms } : {}),
        ...(resolvedDueDate ? { dueDate: resolvedDueDate } : {}),
        totalRefunded: 0,
        paymentStatus,
        payments: normalizedPayments,
        status: 'completed',
        isInterState,
        notes,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const result: InvoiceResult = {
        invoiceId,
        invoiceNumber,
        tenantId,
        branchId,
        ...(registeredCustomer ? { customerId: registeredCustomer.id } : {}),
        totalAmount: grandTotal,
        taxableAmount,
        cgst,
        sgst,
        igst,
        roundOff,
        grandTotal,
        amountPaid,
        ...(khataCreditAmount > 0 ? { khataCreditAmount } : {}),
        balanceDue,
        ...(resolvedDueDate ? { dueDate: resolvedDueDate } : {}),
        itemCount: verifiedLineItems.length,
        paymentStatus,
        payments: normalizedPayments,
        paymentMode: normalizedPayments[0]?.mode || 'cash',
        createdAt: timestamp,
      };

      return {
        invoiceRecord,
        result,
        batchUpdates,
        movementsToWrite,
        updatedCustomer,
        customerLedgerEntry,
        creditOverrideAuditMeta,
        timestamp,
        nextSeq,
        year,
        branchCode,
      };
    };

    if (this.isTest()) {
      const runWithCustomerLock = <T>(fn: () => Promise<T>): Promise<T> =>
        customerId ? withTestCustomerLock(tenantId, customerId, fn) : fn();

      const testOutcome = await withTestBranchInventoryLock(tenantId, branchId, () =>
        runWithCustomerLock(async () => {
          const existingKey = testIdempotencyStore.get(testIdempKey);
          if (existingKey) {
            if (existingKey.status === 'completed' && existingKey.result) {
              if (existingKey.payloadHash === payloadHash) {
                logger.info(
                  { tenantId, branchId, idempotencyKey: cleanIdempotencyKey },
                  'Idempotent invoice replay (cache hit)'
                );
                return {
                  result: { ...(existingKey.result as InvoiceResult), fromCache: true },
                  creditOverrideAuditMeta: null as Record<string, unknown> | null,
                };
              }
              throw new IdempotencyConflictError(
                `Idempotency key '${cleanIdempotencyKey}' was already used with a different request payload`
              );
            }
            if (existingKey.status === 'pending' && Date.now() - existingKey.timestamp < 120000) {
              throw new IdempotencyConflictError(
                `Transaction with idempotency key '${cleanIdempotencyKey}' is already processing`
              );
            }
          }

          const year = new Date().getFullYear();
          const counterKey = `${tenantId}:${branchId}:${year}`;
          const currentCounter = testInvoiceCounters.get(counterKey) || 100;

          const built = await buildInvoiceAndWrites({
            loadBatch: async (batchId) => getTestBatchDirect(tenantId, batchId),
            loadMedicineBatchesForBranch: async (medicineId) =>
              getAllTestBatchesForTenant(tenantId).filter(
                (b) => b.branchId === branchId && b.medicineId === medicineId
              ),
            loadMedicine: async (medicineId) => MedicineService.getMedicine(tenantId, medicineId).catch(() => null),
            loadCustomer: async (custId) => getTestCustomerDirect(tenantId, custId) || null,
            nextInvoiceSeq: async () => currentCounter + 1,
          });

          // Commit all test store mutations atomically AFTER validation succeeds
          testInvoiceCounters.set(counterKey, built.nextSeq);
          for (const updatedBatch of built.batchUpdates.values()) {
            setTestBatch(tenantId, updatedBatch);
          }
          for (const mov of built.movementsToWrite) {
            recordTestMovementDirect(tenantId, mov);
          }
          if (built.updatedCustomer) {
            setTestCustomer(tenantId, built.updatedCustomer);
          }
          if (built.customerLedgerEntry && built.updatedCustomer) {
            appendTestLedgerEntryDirect(tenantId, built.updatedCustomer.id, built.customerLedgerEntry);
          }
          testInvoiceStore.set(`${tenantId}:${invoiceId}`, built.invoiceRecord);
          testIdempotencyStore.set(testIdempKey, {
            key: cleanIdempotencyKey,
            operation: 'checkout',
            tenantId,
            branchId,
            payloadHash,
            status: 'completed',
            result: built.result,
            timestamp: Date.now(),
            completedAt: built.timestamp,
          });

          return {
            result: built.result,
            invoiceRecord: built.invoiceRecord,
            creditOverrideAuditMeta: built.creditOverrideAuditMeta,
          };
        })
      );

      if (testOutcome.creditOverrideAuditMeta) {
        await AuditService.log({
          tenantId,
          action: 'CUSTOMER_CREDIT_LIMIT_OVERRIDDEN',
          actingUserId: userId,
          metadata: testOutcome.creditOverrideAuditMeta,
        });
      }

      if (!testOutcome.result.fromCache && 'invoiceRecord' in testOutcome && testOutcome.invoiceRecord) {
        try {
          await AccountingService.recordSalesInvoiceAccounting(testOutcome.invoiceRecord);
        } catch (accErr) {
          logger.error({ err: accErr, invoiceId }, 'Sales invoice accounting hook failed');
        }
      }

      return testOutcome.result;
    }

    // Production Cloud Firestore transaction (strictly reads before writes)
    const db = firestore();
    const tenantRef = db.collection('tenants').doc(tenantId);
    const idempotencyRef = tenantRef.collection('idempotency_keys').doc(idempDocId);
    const year = new Date().getFullYear();
    const branchCode = buildBranchInvoiceCode(branchId);
    const counterRef = tenantRef.collection('counters').doc(`invoice_${branchCode}_${year}`);
    const custRef = customerId ? tenantRef.collection('customers').doc(customerId) : null;

    const prodOutcome = await db.runTransaction(async (transaction) => {
      // 1. Read idempotency key, sequential counter, and customer record BEFORE any writes
      const [idempDoc, counterDoc, custDoc] = await Promise.all([
        transaction.get(idempotencyRef),
        transaction.get(counterRef),
        custRef ? transaction.get(custRef) : Promise.resolve(null),
      ]);

      if (idempDoc.exists) {
        const d = idempDoc.data() as IdempotencyEntry<InvoiceResult> | undefined;
        if (d?.status === 'completed' && d.result) {
          if (d.payloadHash === payloadHash) {
            return {
              result: { ...d.result, fromCache: true },
              creditOverrideAuditMeta: null as Record<string, unknown> | null,
            };
          }
          throw new IdempotencyConflictError(
            `Idempotency key '${cleanIdempotencyKey}' was already used with a different request payload`
          );
        }
      }

      const currentSeq = counterDoc.exists ? Number(counterDoc.data()?.currentSeq || 100) : 100;
      const preloadedCustomer = custDoc && custDoc.exists ? (custDoc.data() as CustomerRecord) : null;

      const built = await buildInvoiceAndWrites({
        loadBatch: async (batchId) => {
          const snap = await transaction.get(tenantRef.collection('inventory_batches').doc(batchId));
          return snap.exists ? (snap.data() as InventoryBatchRecord) : undefined;
        },
        loadMedicineBatchesForBranch: async (medicineId) => {
          const q = tenantRef
            .collection('inventory_batches')
            .where('branchId', '==', branchId)
            .where('medicineId', '==', medicineId)
            .orderBy('expiryDate', 'asc')
            .limit(100);
          const snap = await transaction.get(q);
          return snap.docs.map((doc) => doc.data() as InventoryBatchRecord);
        },
        loadMedicine: async (medicineId) => {
          const snap = await transaction.get(tenantRef.collection('medicines').doc(medicineId));
          return snap.exists ? (snap.data() as MedicineRecord) : null;
        },
        loadCustomer: async () => preloadedCustomer,
        nextInvoiceSeq: async () => currentSeq + 1,
      });

      // 2. Execute all writes atomically inside the transaction
      transaction.set(
        counterRef,
        { currentSeq: built.nextSeq, branchId, year, updatedAt: built.timestamp },
        { merge: true }
      );

      for (const updatedBatch of built.batchUpdates.values()) {
        const bRef = tenantRef.collection('inventory_batches').doc(updatedBatch.id);
        transaction.update(bRef, {
          currentStock: updatedBatch.currentStock,
          status: updatedBatch.status,
          updatedAt: built.timestamp,
          lastDispensedAt: built.timestamp,
        });
      }

      for (const mov of built.movementsToWrite) {
        const mRef = tenantRef.collection('stock_movements').doc(mov.id);
        transaction.set(mRef, mov);
      }

      if (built.updatedCustomer && custRef) {
        transaction.update(custRef, {
          currentOutstandingBalance: built.updatedCustomer.currentOutstandingBalance,
          advanceBalance: built.updatedCustomer.advanceBalance,
          totalPurchases: built.updatedCustomer.totalPurchases,
          totalVisits: built.updatedCustomer.totalVisits,
          lastPurchaseDate: built.updatedCustomer.lastPurchaseDate,
          updatedBy: userId,
          updatedAt: built.timestamp,
        });
      }

      if (built.customerLedgerEntry && custRef) {
        transaction.set(
          custRef.collection('ledger').doc(built.customerLedgerEntry.id),
          built.customerLedgerEntry
        );
      }

      const invRef = tenantRef.collection('sales_invoices').doc(invoiceId);
      transaction.set(invRef, built.invoiceRecord);

      for (const p of built.invoiceRecord.payments) {
        const payRef = invRef.collection('payments').doc(p.id!);
        transaction.set(payRef, { ...p, invoiceId, tenantId, branchId, recordedBy: userId });
      }

      transaction.set(idempotencyRef, {
        key: cleanIdempotencyKey,
        operation: 'checkout',
        tenantId,
        branchId,
        payloadHash,
        status: 'completed',
        result: built.result,
        timestamp: Date.now(),
        completedAt: built.timestamp,
      });

      return {
        result: built.result,
        invoiceRecord: built.invoiceRecord,
        creditOverrideAuditMeta: built.creditOverrideAuditMeta,
      };
    });

    if (prodOutcome.creditOverrideAuditMeta) {
      await AuditService.log({
        tenantId,
        action: 'CUSTOMER_CREDIT_LIMIT_OVERRIDDEN',
        actingUserId: userId,
        metadata: prodOutcome.creditOverrideAuditMeta,
      });
    }

    if (!prodOutcome.result.fromCache && 'invoiceRecord' in prodOutcome && prodOutcome.invoiceRecord) {
      try {
        await AccountingService.recordSalesInvoiceAccounting(prodOutcome.invoiceRecord);
      } catch (accErr) {
        logger.error({ err: accErr, invoiceId }, 'Sales invoice accounting hook failed');
      }
    }

    return prodOutcome.result;
  }

  /**
   * Retrieves an invoice by ID with line items, payments, and returns.
   */
  public static async getInvoice(tenantId: string, invoiceId: string): Promise<SalesInvoiceRecord> {
    if (this.isTest()) {
      const inv = testInvoiceStore.get(`${tenantId}:${invoiceId}`);
      if (!inv) {
        throw new NotFoundError(`Sales invoice '${invoiceId}' not found`);
      }
      return inv;
    }

    const db = firestore();
    const doc = await db.collection('tenants').doc(tenantId).collection('sales_invoices').doc(invoiceId).get();
    if (!doc.exists) {
      throw new NotFoundError(`Sales invoice '${invoiceId}' not found`);
    }
    return doc.data() as SalesInvoiceRecord;
  }

  /**
   * Lists sales invoices with search and filters.
   */
  public static async listInvoices(
    tenantId: string,
    options: ListInvoicesOptions = {}
  ): Promise<{ invoices: SalesInvoiceRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 25));

    let all: SalesInvoiceRecord[] = [];

    if (this.isTest()) {
      for (const [key, val] of testInvoiceStore.entries()) {
        if (key.startsWith(`${tenantId}:`)) {
          all.push(val);
        }
      }
    } else {
      const db = firestore();
      const snap = await db.collection('tenants').doc(tenantId).collection('sales_invoices').get();
      all = snap.docs.map((d) => d.data() as SalesInvoiceRecord);
    }

    if (options.branchId && options.branchId !== 'all') {
      all = all.filter((inv) => inv.branchId === options.branchId);
    }
    if (options.status && options.status !== 'all') {
      all = all.filter((inv) => inv.status === options.status);
    }
    if (options.paymentStatus && options.paymentStatus !== 'all') {
      all = all.filter((inv) => inv.paymentStatus === options.paymentStatus);
    }
    if (options.dateFrom) {
      all = all.filter((inv) => inv.createdAt >= options.dateFrom!);
    }
    if (options.dateTo) {
      all = all.filter((inv) => inv.createdAt <= options.dateTo!);
    }
    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      all = all.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.customer.name.toLowerCase().includes(q) ||
          (inv.customer.phone && inv.customer.phone.includes(q))
      );
    }

    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = all.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = all.slice((page - 1) * limit, page * limit);

    return { invoices: paginated, total, page, limit, totalPages };
  }

  /**
   * Records an additional payment towards an invoice atomically and idempotently.
   * Rejects overpayments exceeding balanceDue rather than silently clamping.
   */
  public static async recordPayment(
    tenantId: string,
    branchId: string,
    invoiceId: string,
    payment: { mode: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'khata_credit'; amount: number; referenceNumber?: string },
    userId: string,
    idempotencyKey: string
  ): Promise<{ invoice: SalesInvoiceRecord; fromCache?: boolean }> {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestError('Idempotency key must be at least 8 characters');
    }
    if (typeof payment.amount !== 'number' || payment.amount <= 0) {
      throw new BadRequestError('Payment amount must be greater than zero');
    }

    const cleanKey = idempotencyKey.trim();
    const payAmount = roundPaise(payment.amount);
    const payloadHash = hashPayload({
      branchId,
      invoiceId,
      mode: payment.mode,
      amount: payAmount,
      referenceNumber: payment.referenceNumber,
    });

    const idempDocId = deterministicId('idemp_pay', tenantId, branchId, invoiceId, cleanKey);
    const testIdempKey = `${tenantId}:${branchId}:payment:${invoiceId}:${cleanKey}`;
    const paymentId = deterministicId('pay', tenantId, branchId, invoiceId, cleanKey);

    const computePaymentUpdate = (
      invoice: SalesInvoiceRecord,
      linkedCustomer?: CustomerRecord | null
    ) => {
      if (invoice.branchId !== branchId) {
        throw new BadRequestError(
          `Invoice '${invoice.invoiceNumber}' belongs to branch '${invoice.branchId}', not branch '${branchId}'`
        );
      }
      if (invoice.status === 'cancelled') {
        throw new BadRequestError('Cannot collect payment against a cancelled invoice');
      }
      if (invoice.status === 'returned') {
        throw new BadRequestError('Cannot collect payment against a fully returned invoice');
      }
      if (invoice.balanceDue <= 0) {
        throw new BadRequestError('Invoice is already fully settled (zero balance due)');
      }
      if (payAmount > invoice.balanceDue) {
        throw new BadRequestError(
          `Payment amount (₹${payAmount}) exceeds remaining balance due (₹${invoice.balanceDue})`
        );
      }
      if (payment.mode === 'khata_credit') {
        throw new BadRequestError('Cannot settle an invoice balance using khata_credit mode');
      }

      const now = new Date().toISOString();
      const newAmountPaid = roundPaise(invoice.amountPaid + payAmount);
      const newBalanceDue = roundPaise(Math.max(0, invoice.grandTotal - newAmountPaid - (invoice.totalRefunded || 0)));
      const newPaymentStatus: 'paid' | 'partial' | 'unpaid' =
        newBalanceDue === 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid';

      const paymentEntry: PaymentEntry = {
        id: paymentId,
        mode: payment.mode,
        amount: payAmount,
        referenceNumber: payment.referenceNumber,
        timestamp: now,
      };

      const updatedInvoice: SalesInvoiceRecord = {
        ...invoice,
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        paymentStatus: newPaymentStatus,
        payments: [...invoice.payments, paymentEntry],
        updatedAt: now,
      };

      let updatedCustomer: CustomerRecord | null = null;
      let customerLedgerEntry: CustomerLedgerEntryRecord | null = null;

      if (linkedCustomer && toPaise(linkedCustomer.currentOutstandingBalance) > 0) {
        const appliedKhata = Math.min(payAmount, linkedCustomer.currentOutstandingBalance);
        if (appliedKhata > 0) {
          const delta = applyLedgerBalanceDelta(
            linkedCustomer.currentOutstandingBalance,
            linkedCustomer.advanceBalance || 0,
            { direction: 'CREDIT', amount: appliedKhata, allowAdvance: false }
          );
          const ledgerType =
            payment.mode === 'cash'
              ? 'CASH_PAYMENT'
              : payment.mode === 'upi'
                ? 'UPI_PAYMENT'
                : payment.mode === 'card'
                  ? 'CARD_PAYMENT'
                  : 'BANK_TRANSFER';

          customerLedgerEntry = {
            id: deterministicId('led', tenantId, linkedCustomer.id, 'invpay', paymentId),
            tenantId,
            branchId,
            customerId: linkedCustomer.id,
            entryType: ledgerType,
            direction: 'CREDIT',
            amount: appliedKhata,
            appliedToBalance: delta.appliedToBalance,
            advanceDelta: delta.advanceDelta,
            previousBalance: delta.previousBalance,
            runningBalance: delta.runningBalance,
            previousAdvanceBalance: delta.previousAdvanceBalance,
            runningAdvanceBalance: delta.runningAdvanceBalance,
            referenceType: 'invoice_payment',
            referenceId: paymentId,
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            paymentId,
            paymentMode: payment.mode,
            referenceNumber: payment.referenceNumber || null,
            description: `Invoice Payment (${invoice.invoiceNumber}) via ${payment.mode.toUpperCase()}`,
            reason: 'POS invoice balance settlement',
            operationRef: `invoice_payment:${paymentId}`,
            performedBy: userId,
            timestamp: now,
          };

          updatedCustomer = {
            ...linkedCustomer,
            currentOutstandingBalance: delta.runningBalance,
            advanceBalance: delta.runningAdvanceBalance,
            totalPayments: fromPaise(toPaise(linkedCustomer.totalPayments || 0) + toPaise(appliedKhata)),
            lastPaymentDate: now,
            updatedBy: userId,
            updatedAt: now,
          };
        }
      }

      return { updatedInvoice, paymentEntry, updatedCustomer, customerLedgerEntry, now, newBalanceDue };
    };

    let outcome: { invoice: SalesInvoiceRecord; fromCache?: boolean; isNew: boolean };

    if (this.isTest()) {
      outcome = await withTestBranchInventoryLock(tenantId, branchId, async () => {
        const existingKey = testIdempotencyStore.get(testIdempKey);
        if (existingKey && existingKey.status === 'completed' && existingKey.result) {
          if (existingKey.payloadHash === payloadHash) {
            return { invoice: existingKey.result as SalesInvoiceRecord, fromCache: true, isNew: false };
          }
          throw new IdempotencyConflictError(
            `Idempotency key '${cleanKey}' was already used with a different payment payload`
          );
        }

        const invoice = testInvoiceStore.get(`${tenantId}:${invoiceId}`);
        if (!invoice) {
          throw new NotFoundError(`Sales invoice '${invoiceId}' not found`);
        }

        const runCustomerSection = async () => {
          const linkedCustomer = invoice.customerId
            ? getTestCustomerDirect(tenantId, invoice.customerId) || null
            : null;
          const { updatedInvoice, updatedCustomer, customerLedgerEntry, now } = computePaymentUpdate(
            invoice,
            linkedCustomer
          );

          testInvoiceStore.set(`${tenantId}:${invoiceId}`, updatedInvoice);
          if (updatedCustomer) {
            setTestCustomer(tenantId, updatedCustomer);
          }
          if (customerLedgerEntry && updatedCustomer) {
            appendTestLedgerEntryDirect(tenantId, updatedCustomer.id, customerLedgerEntry);
          }
          testIdempotencyStore.set(testIdempKey, {
            key: cleanKey,
            operation: 'payment',
            tenantId,
            branchId,
            payloadHash,
            status: 'completed',
            result: updatedInvoice,
            timestamp: Date.now(),
            completedAt: now,
          });
          return { invoice: updatedInvoice, isNew: true };
        };

        return invoice.customerId
          ? withTestCustomerLock(tenantId, invoice.customerId, runCustomerSection)
          : runCustomerSection();
      });
    } else {
      const db = firestore();
      const tenantRef = db.collection('tenants').doc(tenantId);
      const invRef = tenantRef.collection('sales_invoices').doc(invoiceId);
      const idempRef = tenantRef.collection('idempotency_keys').doc(idempDocId);

      outcome = await db.runTransaction(async (tx) => {
        const [idempDoc, invDoc] = await Promise.all([tx.get(idempRef), tx.get(invRef)]);

        if (idempDoc.exists) {
          const d = idempDoc.data() as IdempotencyEntry<SalesInvoiceRecord> | undefined;
          if (d?.status === 'completed' && d.result) {
            if (d.payloadHash === payloadHash) {
              return { invoice: d.result, fromCache: true, isNew: false };
            }
            throw new IdempotencyConflictError(
              `Idempotency key '${cleanKey}' was already used with a different payment payload`
            );
          }
        }

        if (!invDoc.exists) {
          throw new NotFoundError(`Sales invoice '${invoiceId}' not found`);
        }

        const invoice = invDoc.data() as SalesInvoiceRecord;
        const custRef = invoice.customerId
          ? tenantRef.collection('customers').doc(invoice.customerId)
          : null;
        const custDoc = custRef ? await tx.get(custRef) : null;
        const linkedCustomer = custDoc && custDoc.exists ? (custDoc.data() as CustomerRecord) : null;

        const { updatedInvoice, paymentEntry, updatedCustomer, customerLedgerEntry, now } =
          computePaymentUpdate(invoice, linkedCustomer);

        tx.update(invRef, {
          amountPaid: updatedInvoice.amountPaid,
          balanceDue: updatedInvoice.balanceDue,
          paymentStatus: updatedInvoice.paymentStatus,
          payments: updatedInvoice.payments,
          updatedAt: now,
        });

        tx.set(invRef.collection('payments').doc(paymentId), {
          ...paymentEntry,
          invoiceId,
          tenantId,
          branchId,
          recordedBy: userId,
        });

        if (updatedCustomer && custRef && customerLedgerEntry) {
          tx.update(custRef, {
            currentOutstandingBalance: updatedCustomer.currentOutstandingBalance,
            advanceBalance: updatedCustomer.advanceBalance,
            totalPayments: updatedCustomer.totalPayments,
            lastPaymentDate: updatedCustomer.lastPaymentDate,
            updatedBy: userId,
            updatedAt: now,
          });
          tx.set(custRef.collection('ledger').doc(customerLedgerEntry.id), customerLedgerEntry);
        }

        tx.set(idempRef, {
          key: cleanKey,
          operation: 'payment',
          tenantId,
          branchId,
          payloadHash,
          status: 'completed',
          result: updatedInvoice,
          timestamp: Date.now(),
          completedAt: now,
        });

        return { invoice: updatedInvoice, isNew: true };
      });
    }

    if (outcome.isNew) {
      try {
        const lastPayment = outcome.invoice.payments[outcome.invoice.payments.length - 1];
        await AccountingService.recordSalesPaymentAccounting({
          tenantId,
          branchId,
          invoiceId,
          invoiceNumber: outcome.invoice.invoiceNumber,
          paymentId: lastPayment?.id || paymentId,
          mode: payment.mode,
          amount: payAmount,
          timestamp: lastPayment?.timestamp || new Date().toISOString(),
          userId,
        });
      } catch (accErr) {
        logger.error({ err: accErr, invoiceId, paymentId }, 'Sales payment accounting hook failed');
      }

      await AuditService.log({
        tenantId,
        action: 'INVOICE_PAYMENT_RECORDED',
        actingUserId: userId,
        metadata: {
          invoiceId,
          invoiceNumber: outcome.invoice.invoiceNumber,
          amount: payAmount,
          mode: payment.mode,
          balanceDue: outcome.invoice.balanceDue,
        },
      });
    }

    return { invoice: outcome.invoice, fromCache: outcome.fromCache };
  }

  /**
   * Processes a partial or complete sales return atomically and idempotently.
   * Never restocks expired or damaged goods back into sellable batch inventory.
   */
  public static async processSalesReturn(
    tenantId: string,
    branchId: string,
    invoiceId: string,
    input: { items: SalesReturnItemInput[]; reason: string },
    userId: string,
    idempotencyKey: string
  ): Promise<{ returnRecord: SalesReturnRecord; updatedInvoice: SalesInvoiceRecord; fromCache?: boolean }> {
    const { items: returnItems, reason } = input;

    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestError('Idempotency key must be at least 8 characters');
    }

    if (!returnItems || returnItems.length === 0) {
      throw new BadRequestError('Return request must contain at least one item');
    }

    for (const ret of returnItems) {
      if (typeof ret.quantity !== 'number' || !Number.isInteger(ret.quantity) || ret.quantity <= 0) {
        throw new BadRequestError('Return quantity must be a positive integer');
      }
    }

    const cleanKey = idempotencyKey.trim();
    const payloadHash = hashPayload({
      branchId,
      invoiceId,
      reason: reason?.trim(),
      items: returnItems.map((i) => ({
        batchId: i.batchId,
        quantity: i.quantity,
        reason: i.reason,
        restock: i.restock !== false,
        damaged: Boolean(i.damaged),
      })),
    });

    const idempDocId = deterministicId('idemp_ret', tenantId, branchId, invoiceId, cleanKey);
    const testIdempKey = `${tenantId}:${branchId}:return:${invoiceId}:${cleanKey}`;
    const returnId = deterministicId('ret', tenantId, branchId, invoiceId, cleanKey);

    const buildReturnMutations = (
      invoice: SalesInvoiceRecord,
      loadedBatches: Map<string, InventoryBatchRecord>,
      linkedCustomer?: CustomerRecord | null,
      creditNoteAlreadyPosted = false
    ) => {
      if (invoice.branchId !== branchId) {
        throw new BadRequestError(
          `Invoice '${invoice.invoiceNumber}' belongs to branch '${invoice.branchId}', not branch '${branchId}'`
        );
      }
      if (invoice.status === 'cancelled') {
        throw new BadRequestError('Cannot process returns against a cancelled invoice');
      }
      if (invoice.status === 'returned') {
        throw new BadRequestError('Invoice has already been fully returned');
      }

      const updatedLineItems = invoice.items.map((line) => ({ ...line }));
      const workingBatches = new Map<string, InventoryBatchRecord>();
      for (const [k, v] of loadedBatches.entries()) {
        workingBatches.set(k, { ...v });
      }

      const now = new Date().toISOString();
      let totalRefundAmount = 0;
      const processedItems: SalesReturnRecord['items'] = [];
      const batchUpdates = new Map<string, InventoryBatchRecord>();
      const movementsToWrite: StockMovementRecord[] = [];

      returnItems.forEach((ret, idx) => {
        const lineIndex = updatedLineItems.findIndex((l) => l.batchId === ret.batchId);
        if (lineIndex === -1) {
          throw new BadRequestError(`Batch '${ret.batchId}' was not sold on invoice ${invoice.invoiceNumber}`);
        }

        const line = updatedLineItems[lineIndex]!;
        const alreadyReturned = line.returnedQuantity || 0;
        const maxReturnable = line.quantity - alreadyReturned;

        if (ret.quantity > maxReturnable) {
          throw new BadRequestError(
            `Cannot return ${ret.quantity} units for '${line.medicineName}'. Max returnable: ${maxReturnable}`
          );
        }

        const unitRefund = roundPaise(line.lineTotal / line.quantity);
        const itemRefund =
          ret.quantity === maxReturnable && alreadyReturned === 0
            ? roundPaise(line.lineTotal)
            : roundPaise(unitRefund * ret.quantity);
        totalRefundAmount = roundPaise(totalRefundAmount + itemRefund);
        line.returnedQuantity = alreadyReturned + ret.quantity;

        const batch = workingBatches.get(line.batchId);
        const batchExpired = batch ? isBatchExpired(batch.expiryDate) : isBatchExpired(line.expiryDate);
        const isDamaged = Boolean(ret.damaged);
        const requestedRestock = ret.restock !== false;

        let restocked = false;
        let nonRestockReason: string | undefined;

        if (!requestedRestock) {
          nonRestockReason = 'non_restockable';
        } else if (batchExpired) {
          nonRestockReason = 'expired';
        } else if (isDamaged) {
          nonRestockReason = 'damaged';
        } else if (batch) {
          restocked = true;
        } else {
          nonRestockReason = 'batch_not_found';
        }

        if (batch) {
          const prevQty = batch.currentStock;
          const nextQty = restocked ? prevQty + ret.quantity : prevQty;

          if (restocked) {
            batch.currentStock = nextQty;
            batch.status = InventoryService.computeBatchStatus(nextQty, batch.expiryDate);
            batch.updatedAt = now;
            batchUpdates.set(batch.id, batch);
          }

          movementsToWrite.push({
            id: deterministicId('mov', returnId, String(idx)),
            tenantId,
            branchId,
            medicineId: line.medicineId,
            batchId: line.batchId,
            batchNumber: line.batchNumber,
            medicineName: line.medicineName,
            movementType: restocked ? 'SALE_RETURN' : batchExpired ? 'EXPIRY' : 'DAMAGE',
            quantityChange: restocked ? ret.quantity : 0,
            previousQuantity: prevQty,
            newQuantity: nextQty,
            referenceType: 'sales_return',
            referenceId: returnId,
            reason: restocked
              ? `Sales Return on ${invoice.invoiceNumber}: ${reason || 'Customer Return'}`
              : `Non-restockable Sales Return (${nonRestockReason}) on ${invoice.invoiceNumber}: ${reason || 'Quarantined'}`,
            performedBy: userId,
            timestamp: now,
          });
        }

        processedItems.push({
          batchId: line.batchId,
          medicineId: line.medicineId,
          medicineName: line.medicineName,
          quantity: ret.quantity,
          unitPrice: line.unitPrice,
          refundAmount: itemRefund,
          restocked,
          ...(nonRestockReason ? { nonRestockReason } : {}),
        });
      });

      const allItemsReturned = updatedLineItems.every((l) => (l.returnedQuantity || 0) >= l.quantity);
      const newStatus: SalesInvoiceRecord['status'] = allItemsReturned ? 'returned' : 'partially_returned';

      const returnRecord: SalesReturnRecord = {
        id: returnId,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        tenantId,
        branchId,
        returnedByUserId: userId,
        items: processedItems,
        totalRefundAmount,
        reason: reason || 'Customer Return',
        createdAt: now,
      };

      // Reconcile unpaid Khata balance & issue deterministic CREDIT_NOTE if invoice still has balanceDue
      let nextBalanceDue = invoice.balanceDue;
      let nextPaymentStatus = invoice.paymentStatus;
      let updatedCustomer: CustomerRecord | null = null;
      let customerLedgerEntry: CustomerLedgerEntryRecord | null = null;

      if (invoice.balanceDue > 0 && totalRefundAmount > 0) {
        const khataCreditReduction = roundPaise(Math.min(invoice.balanceDue, totalRefundAmount));
        nextBalanceDue = roundPaise(Math.max(0, invoice.balanceDue - khataCreditReduction));
        nextPaymentStatus =
          nextBalanceDue === 0 ? 'paid' : invoice.amountPaid > 0 ? 'partial' : 'unpaid';

        if (linkedCustomer && khataCreditReduction > 0 && !creditNoteAlreadyPosted) {
          const delta = applyLedgerBalanceDelta(
            linkedCustomer.currentOutstandingBalance,
            linkedCustomer.advanceBalance || 0,
            {
              direction: 'CREDIT',
              amount: khataCreditReduction,
              allowAdvance: true,
            }
          );

          customerLedgerEntry = {
            id: deterministicId('led', tenantId, linkedCustomer.id, 'ret', returnId),
            tenantId,
            branchId,
            customerId: linkedCustomer.id,
            entryType: 'CREDIT_NOTE',
            direction: 'CREDIT',
            amount: khataCreditReduction,
            appliedToBalance: delta.appliedToBalance,
            advanceDelta: delta.advanceDelta,
            previousBalance: delta.previousBalance,
            runningBalance: delta.runningBalance,
            previousAdvanceBalance: delta.previousAdvanceBalance,
            runningAdvanceBalance: delta.runningAdvanceBalance,
            referenceType: 'sales_return',
            referenceId: returnId,
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            returnId,
            description: `Sales Return Credit Note — ${invoice.invoiceNumber}`,
            reason: reason || 'Customer Return',
            operationRef: `return:${returnId}`,
            performedBy: userId,
            timestamp: now,
          };

          updatedCustomer = {
            ...linkedCustomer,
            currentOutstandingBalance: delta.runningBalance,
            advanceBalance: delta.runningAdvanceBalance,
            updatedBy: userId,
            updatedAt: now,
          };
        }
      }

      const existingReturns = invoice.returns || [];
      const updatedInvoice: SalesInvoiceRecord = {
        ...invoice,
        items: updatedLineItems,
        status: newStatus,
        balanceDue: nextBalanceDue,
        paymentStatus: nextPaymentStatus,
        totalRefunded: roundPaise((invoice.totalRefunded || 0) + totalRefundAmount),
        returns: [...existingReturns, returnRecord],
        updatedAt: now,
      };

      return {
        returnRecord,
        updatedInvoice,
        batchUpdates,
        movementsToWrite,
        updatedCustomer,
        customerLedgerEntry,
        now,
      };
    };

    let outcome: {
      returnRecord: SalesReturnRecord;
      updatedInvoice: SalesInvoiceRecord;
      fromCache?: boolean;
      isNew: boolean;
    };

    if (this.isTest()) {
      outcome = await withTestBranchInventoryLock(tenantId, branchId, async () => {
        const existingKey = testIdempotencyStore.get(testIdempKey);
        if (existingKey && existingKey.status === 'completed' && existingKey.result) {
          if (existingKey.payloadHash === payloadHash) {
            const cached = existingKey.result as {
              returnRecord: SalesReturnRecord;
              updatedInvoice: SalesInvoiceRecord;
            };
            return { ...cached, fromCache: true, isNew: false };
          }
          throw new IdempotencyConflictError(
            `Idempotency key '${cleanKey}' was already used with a different sales return payload`
          );
        }

        const invoice = testInvoiceStore.get(`${tenantId}:${invoiceId}`);
        if (!invoice) {
          throw new NotFoundError(`Sales invoice '${invoiceId}' not found`);
        }

        const loadedBatches = new Map<string, InventoryBatchRecord>();
        for (const item of returnItems) {
          const b = getTestBatchDirect(tenantId, item.batchId);
          if (b) loadedBatches.set(b.id, b);
        }

        const executeCustomerPart = async () => {
          const linkedCustomer = invoice.customerId
            ? getTestCustomerDirect(tenantId, invoice.customerId) || null
            : null;
          const alreadyPosted = invoice.customerId
            ? getTestLedgerEntriesDirect(tenantId, invoice.customerId).some(
                (e) => e.operationRef === `return:${returnId}`
              )
            : false;

          const built = buildReturnMutations(invoice, loadedBatches, linkedCustomer, alreadyPosted);

          for (const b of built.batchUpdates.values()) {
            setTestBatch(tenantId, b);
          }
          for (const mov of built.movementsToWrite) {
            recordTestMovementDirect(tenantId, mov);
          }
          if (built.updatedCustomer) {
            setTestCustomer(tenantId, built.updatedCustomer);
          }
          if (built.customerLedgerEntry && built.updatedCustomer) {
            appendTestLedgerEntryDirect(tenantId, built.updatedCustomer.id, built.customerLedgerEntry);
          }
          testInvoiceStore.set(`${tenantId}:${invoiceId}`, built.updatedInvoice);

          const resultPayload = {
            returnRecord: built.returnRecord,
            updatedInvoice: built.updatedInvoice,
          };

          testIdempotencyStore.set(testIdempKey, {
            key: cleanKey,
            operation: 'return',
            tenantId,
            branchId,
            payloadHash,
            status: 'completed',
            result: resultPayload,
            timestamp: Date.now(),
            completedAt: built.now,
          });

          return { ...resultPayload, isNew: true };
        };

        return invoice.customerId
          ? withTestCustomerLock(tenantId, invoice.customerId, executeCustomerPart)
          : executeCustomerPart();
      });
    } else {
      const db = firestore();
      const tenantRef = db.collection('tenants').doc(tenantId);
      const invRef = tenantRef.collection('sales_invoices').doc(invoiceId);
      const idempRef = tenantRef.collection('idempotency_keys').doc(idempDocId);

      outcome = await db.runTransaction(async (tx) => {
        const uniqueBatchIds = Array.from(new Set(returnItems.map((i) => i.batchId)));
        const batchRefs = uniqueBatchIds.map((id) => tenantRef.collection('inventory_batches').doc(id));

        const [idempDoc, invDoc, ...batchSnaps] = await Promise.all([
          tx.get(idempRef),
          tx.get(invRef),
          ...batchRefs.map((ref) => tx.get(ref)),
        ]);

        if (idempDoc.exists) {
          const d = idempDoc.data() as IdempotencyEntry<{
            returnRecord: SalesReturnRecord;
            updatedInvoice: SalesInvoiceRecord;
          }> | undefined;
          if (d?.status === 'completed' && d.result) {
            if (d.payloadHash === payloadHash) {
              return { ...d.result, fromCache: true, isNew: false };
            }
            throw new IdempotencyConflictError(
              `Idempotency key '${cleanKey}' was already used with a different sales return payload`
            );
          }
        }

        if (!invDoc.exists) {
          throw new NotFoundError(`Sales invoice '${invoiceId}' not found`);
        }

        const invoice = invDoc.data() as SalesInvoiceRecord;
        const custRef = invoice.customerId
          ? tenantRef.collection('customers').doc(invoice.customerId)
          : null;
        const deterministicLedId = invoice.customerId
          ? deterministicId('led', tenantId, invoice.customerId, 'ret', returnId)
          : '';
        const [custDoc, existingLedDoc] = await Promise.all([
          custRef ? tx.get(custRef) : Promise.resolve(null),
          custRef ? tx.get(custRef.collection('ledger').doc(deterministicLedId)) : Promise.resolve(null),
        ]);

        const linkedCustomer = custDoc && custDoc.exists ? (custDoc.data() as CustomerRecord) : null;
        const alreadyPosted = Boolean(existingLedDoc && existingLedDoc.exists);

        const loadedBatches = new Map<string, InventoryBatchRecord>();
        for (const snap of batchSnaps) {
          if (snap.exists) {
            const b = snap.data() as InventoryBatchRecord;
            loadedBatches.set(b.id, b);
          }
        }

        const built = buildReturnMutations(invoice, loadedBatches, linkedCustomer, alreadyPosted);

        for (const b of built.batchUpdates.values()) {
          tx.update(tenantRef.collection('inventory_batches').doc(b.id), {
            currentStock: b.currentStock,
            status: b.status,
            updatedAt: built.now,
          });
        }
        for (const mov of built.movementsToWrite) {
          tx.set(tenantRef.collection('stock_movements').doc(mov.id), mov);
        }

        if (built.updatedCustomer && custRef && built.customerLedgerEntry) {
          tx.update(custRef, {
            currentOutstandingBalance: built.updatedCustomer.currentOutstandingBalance,
            advanceBalance: built.updatedCustomer.advanceBalance,
            updatedBy: userId,
            updatedAt: built.now,
          });
          tx.set(custRef.collection('ledger').doc(built.customerLedgerEntry.id), built.customerLedgerEntry);
        }

        tx.update(invRef, {
          items: built.updatedInvoice.items,
          status: built.updatedInvoice.status,
          balanceDue: built.updatedInvoice.balanceDue,
          paymentStatus: built.updatedInvoice.paymentStatus,
          totalRefunded: built.updatedInvoice.totalRefunded,
          returns: built.updatedInvoice.returns,
          updatedAt: built.now,
        });
        tx.set(invRef.collection('returns').doc(built.returnRecord.id), built.returnRecord);

        const resultPayload = {
          returnRecord: built.returnRecord,
          updatedInvoice: built.updatedInvoice,
        };

        tx.set(idempRef, {
          key: cleanKey,
          operation: 'return',
          tenantId,
          branchId,
          payloadHash,
          status: 'completed',
          result: resultPayload,
          timestamp: Date.now(),
          completedAt: built.now,
        });

        return { ...resultPayload, isNew: true };
      });
    }

    if (outcome.isNew) {
      try {
        const balanceBefore =
          outcome.updatedInvoice.balanceDue +
          Math.min(
            outcome.returnRecord.totalRefundAmount,
            Math.max(0, outcome.updatedInvoice.khataCreditAmount || outcome.returnRecord.totalRefundAmount)
          );
        const invSnap = outcome.updatedInvoice;
        await AccountingService.recordSalesReturnAccounting({
          tenantId,
          branchId,
          invoice: {
            id: invSnap.id,
            invoiceNumber: invSnap.invoiceNumber,
            balanceDueBeforeReturn: invSnap.khataCreditAmount ? balanceBefore : 0,
            items: invSnap.items,
          },
          returnRecord: outcome.returnRecord,
          userId,
        });
      } catch (accErr) {
        logger.error({ err: accErr, invoiceId }, 'Sales return accounting hook failed');
      }

      await AuditService.log({
        tenantId,
        action: 'SALES_RETURN_PROCESSED',
        actingUserId: userId,
        metadata: {
          invoiceId,
          invoiceNumber: outcome.updatedInvoice.invoiceNumber,
          totalRefundAmount: outcome.returnRecord.totalRefundAmount,
          reason,
          status: outcome.updatedInvoice.status,
        },
      });
    }

    return {
      returnRecord: outcome.returnRecord,
      updatedInvoice: outcome.updatedInvoice,
      fromCache: outcome.fromCache,
    };
  }

  /**
   * Cancels an issued sales invoice atomically inside a transaction:
   * - Uses dedicated movement type `INVOICE_CANCEL_REVERSAL`
   * - Restores only unreturned, non-expired stock
   * - Sets financial `refundStatus` and `refundAmount` without deleting invoice
   * - Prevents duplicate cancellations and supports optional idempotency key replay
   */
  public static async cancelSalesInvoice(
    tenantId: string,
    branchId: string,
    invoiceId: string,
    reason: string,
    userId: string,
    idempotencyKey?: string
  ): Promise<SalesInvoiceRecord> {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestError('A valid cancellation reason (minimum 3 characters) is required');
    }

    const cleanKey = idempotencyKey?.trim();
    const payloadHash = cleanKey ? hashPayload({ branchId, invoiceId, reason: reason.trim() }) : '';
    const idempDocId = cleanKey ? deterministicId('idemp_cancel', tenantId, branchId, invoiceId, cleanKey) : '';
    const testIdempKey = cleanKey ? `${tenantId}:${branchId}:cancel:${invoiceId}:${cleanKey}` : '';

    const buildCancelMutations = (
      invoice: SalesInvoiceRecord,
      loadedBatches: Map<string, InventoryBatchRecord>,
      linkedCustomer?: CustomerRecord | null,
      cancelCreditAlreadyPosted = false
    ) => {
      if (invoice.branchId !== branchId) {
        throw new BadRequestError(
          `Invoice '${invoice.invoiceNumber}' belongs to branch '${invoice.branchId}', not branch '${branchId}'`
        );
      }
      if (invoice.status === 'cancelled') {
        throw new BadRequestError(`Invoice ${invoice.invoiceNumber} is already cancelled`);
      }
      if (invoice.status === 'returned') {
        throw new BadRequestError('Cannot cancel a fully returned invoice');
      }

      const now = new Date().toISOString();
      const workingBatches = new Map<string, InventoryBatchRecord>();
      for (const [k, v] of loadedBatches.entries()) {
        workingBatches.set(k, { ...v });
      }

      const batchUpdates = new Map<string, InventoryBatchRecord>();
      const movementsToWrite: StockMovementRecord[] = [];

      invoice.items.forEach((line, idx) => {
        const netSold = line.quantity - (line.returnedQuantity || 0);
        if (netSold <= 0) return;

        const batch = workingBatches.get(line.batchId);
        if (!batch) return;

        const expired = isBatchExpired(batch.expiryDate);
        const prevQty = batch.currentStock;
        const delta = expired ? 0 : netSold;
        const nextQty = prevQty + delta;

        if (!expired) {
          batch.currentStock = nextQty;
          batch.status = InventoryService.computeBatchStatus(nextQty, batch.expiryDate);
          batch.updatedAt = now;
          batchUpdates.set(batch.id, batch);
        }

        const movId = cleanKey
          ? deterministicId('mov', invoiceId, 'cancel', cleanKey, String(idx))
          : deterministicId('mov', invoiceId, 'cancel', now, String(idx));

        movementsToWrite.push({
          id: movId,
          tenantId,
          branchId,
          medicineId: line.medicineId,
          batchId: line.batchId,
          batchNumber: line.batchNumber,
          medicineName: line.medicineName,
          movementType: 'INVOICE_CANCEL_REVERSAL',
          quantityChange: delta,
          previousQuantity: prevQty,
          newQuantity: nextQty,
          referenceType: 'invoice_cancellation',
          referenceId: invoiceId,
          reason: expired
            ? `Invoice Cancelled (${invoice.invoiceNumber}) - expired batch quarantined: ${reason.trim()}`
            : `Invoice Cancelled (${invoice.invoiceNumber}): ${reason.trim()}`,
          performedBy: userId,
          timestamp: now,
        });
      });

      let updatedCustomer: CustomerRecord | null = null;
      let customerLedgerEntry: CustomerLedgerEntryRecord | null = null;

      if (linkedCustomer && invoice.balanceDue > 0 && !cancelCreditAlreadyPosted) {
        const reversalAmount = roundPaise(invoice.balanceDue);
        const delta = applyLedgerBalanceDelta(
          linkedCustomer.currentOutstandingBalance,
          linkedCustomer.advanceBalance || 0,
          {
            direction: 'CREDIT',
            amount: reversalAmount,
            allowAdvance: true,
          }
        );

        customerLedgerEntry = {
          id: deterministicId('led', tenantId, linkedCustomer.id, 'cancel', invoiceId),
          tenantId,
          branchId,
          customerId: linkedCustomer.id,
          entryType: 'CREDIT_NOTE',
          direction: 'CREDIT',
          amount: reversalAmount,
          appliedToBalance: delta.appliedToBalance,
          advanceDelta: delta.advanceDelta,
          previousBalance: delta.previousBalance,
          runningBalance: delta.runningBalance,
          previousAdvanceBalance: delta.previousAdvanceBalance,
          runningAdvanceBalance: delta.runningAdvanceBalance,
          referenceType: 'invoice_cancellation',
          referenceId: invoiceId,
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          description: `Cancelled Khata Invoice ${invoice.invoiceNumber} — Balance Reversed`,
          reason: reason.trim(),
          operationRef: `cancel:${invoiceId}`,
          performedBy: userId,
          timestamp: now,
        };

        updatedCustomer = {
          ...linkedCustomer,
          currentOutstandingBalance: delta.runningBalance,
          advanceBalance: delta.runningAdvanceBalance,
          updatedBy: userId,
          updatedAt: now,
        };
      }

      const refundAmount = roundPaise(Math.max(0, invoice.amountPaid - (invoice.totalRefunded || 0)));
      const refundStatus: SalesInvoiceRecord['refundStatus'] =
        refundAmount > 0 ? 'refund_pending' : 'not_applicable';

      const updatedInvoice: SalesInvoiceRecord = {
        ...invoice,
        status: 'cancelled',
        balanceDue: 0,
        refundStatus,
        refundAmount,
        cancelledAt: now,
        cancelledBy: userId,
        cancellationReason: reason.trim(),
        updatedAt: now,
      };

      return { updatedInvoice, batchUpdates, movementsToWrite, updatedCustomer, customerLedgerEntry, now };
    };

    let cancelledInvoice: SalesInvoiceRecord;
    let isNew = true;

    if (this.isTest()) {
      const outcome = await withTestBranchInventoryLock(tenantId, branchId, async () => {
        if (testIdempKey) {
          const existingKey = testIdempotencyStore.get(testIdempKey);
          if (existingKey && existingKey.status === 'completed' && existingKey.result) {
            if (existingKey.payloadHash === payloadHash) {
              return { invoice: existingKey.result as SalesInvoiceRecord, isNew: false };
            }
            throw new IdempotencyConflictError(
              `Idempotency key '${cleanKey}' was already used with a different cancellation payload`
            );
          }
        }

        const invoice = testInvoiceStore.get(`${tenantId}:${invoiceId}`);
        if (!invoice) {
          throw new NotFoundError(`Sales invoice '${invoiceId}' not found`);
        }

        const loadedBatches = new Map<string, InventoryBatchRecord>();
        for (const line of invoice.items) {
          const b = getTestBatchDirect(tenantId, line.batchId);
          if (b) loadedBatches.set(b.id, b);
        }

        const executeCustomerCancel = async () => {
          const linkedCustomer = invoice.customerId
            ? getTestCustomerDirect(tenantId, invoice.customerId) || null
            : null;
          const alreadyPosted = invoice.customerId
            ? getTestLedgerEntriesDirect(tenantId, invoice.customerId).some(
                (e) => e.operationRef === `cancel:${invoiceId}`
              )
            : false;

          const built = buildCancelMutations(invoice, loadedBatches, linkedCustomer, alreadyPosted);

          for (const b of built.batchUpdates.values()) {
            setTestBatch(tenantId, b);
          }
          for (const mov of built.movementsToWrite) {
            recordTestMovementDirect(tenantId, mov);
          }
          if (built.updatedCustomer) {
            setTestCustomer(tenantId, built.updatedCustomer);
          }
          if (built.customerLedgerEntry && built.updatedCustomer) {
            appendTestLedgerEntryDirect(tenantId, built.updatedCustomer.id, built.customerLedgerEntry);
          }
          testInvoiceStore.set(`${tenantId}:${invoiceId}`, built.updatedInvoice);

          if (testIdempKey && cleanKey) {
            testIdempotencyStore.set(testIdempKey, {
              key: cleanKey,
              operation: 'cancel',
              tenantId,
              branchId,
              payloadHash,
              status: 'completed',
              result: built.updatedInvoice,
              timestamp: Date.now(),
              completedAt: built.now,
            });
          }

          return { invoice: built.updatedInvoice, isNew: true };
        };

        return invoice.customerId
          ? withTestCustomerLock(tenantId, invoice.customerId, executeCustomerCancel)
          : executeCustomerCancel();
      });
      cancelledInvoice = outcome.invoice;
      isNew = outcome.isNew;
    } else {
      const db = firestore();
      const tenantRef = db.collection('tenants').doc(tenantId);
      const invRef = tenantRef.collection('sales_invoices').doc(invoiceId);
      const idempRef = idempDocId ? tenantRef.collection('idempotency_keys').doc(idempDocId) : null;

      const outcome = await db.runTransaction(async (tx) => {
        const [idempDoc, invDoc] = await Promise.all([
          idempRef ? tx.get(idempRef) : Promise.resolve(null),
          tx.get(invRef),
        ]);

        if (idempDoc && idempDoc.exists) {
          const d = idempDoc.data() as IdempotencyEntry<SalesInvoiceRecord> | undefined;
          if (d?.status === 'completed' && d.result) {
            if (d.payloadHash === payloadHash) {
              return { invoice: d.result, isNew: false };
            }
            throw new IdempotencyConflictError(
              `Idempotency key '${cleanKey}' was already used with a different cancellation payload`
            );
          }
        }

        if (!invDoc.exists) {
          throw new NotFoundError(`Sales invoice '${invoiceId}' not found`);
        }

        const invoice = invDoc.data() as SalesInvoiceRecord;
        const uniqueBatchIds = Array.from(
          new Set(
            invoice.items
              .filter((l) => l.quantity - (l.returnedQuantity || 0) > 0)
              .map((l) => l.batchId)
          )
        );

        const custRef = invoice.customerId
          ? tenantRef.collection('customers').doc(invoice.customerId)
          : null;
        const deterministicLedId = invoice.customerId
          ? deterministicId('led', tenantId, invoice.customerId, 'cancel', invoiceId)
          : '';

        const [custDoc, existingLedDoc, ...batchSnaps] = await Promise.all([
          custRef ? tx.get(custRef) : Promise.resolve(null),
          custRef ? tx.get(custRef.collection('ledger').doc(deterministicLedId)) : Promise.resolve(null),
          ...uniqueBatchIds.map((id) => tx.get(tenantRef.collection('inventory_batches').doc(id))),
        ]);

        const linkedCustomer = custDoc && custDoc.exists ? (custDoc.data() as CustomerRecord) : null;
        const alreadyPosted = Boolean(existingLedDoc && existingLedDoc.exists);

        const loadedBatches = new Map<string, InventoryBatchRecord>();
        for (const snap of batchSnaps) {
          if (snap.exists) {
            const b = snap.data() as InventoryBatchRecord;
            loadedBatches.set(b.id, b);
          }
        }

        const built = buildCancelMutations(invoice, loadedBatches, linkedCustomer, alreadyPosted);

        for (const b of built.batchUpdates.values()) {
          tx.update(tenantRef.collection('inventory_batches').doc(b.id), {
            currentStock: b.currentStock,
            status: b.status,
            updatedAt: built.now,
          });
        }
        for (const mov of built.movementsToWrite) {
          tx.set(tenantRef.collection('stock_movements').doc(mov.id), mov);
        }

        if (built.updatedCustomer && custRef && built.customerLedgerEntry) {
          tx.update(custRef, {
            currentOutstandingBalance: built.updatedCustomer.currentOutstandingBalance,
            advanceBalance: built.updatedCustomer.advanceBalance,
            updatedBy: userId,
            updatedAt: built.now,
          });
          tx.set(custRef.collection('ledger').doc(built.customerLedgerEntry.id), built.customerLedgerEntry);
        }

        tx.update(invRef, {
          status: 'cancelled',
          balanceDue: 0,
          refundStatus: built.updatedInvoice.refundStatus,
          refundAmount: built.updatedInvoice.refundAmount,
          cancelledAt: built.now,
          cancelledBy: userId,
          cancellationReason: built.updatedInvoice.cancellationReason,
          updatedAt: built.now,
        });

        if (idempRef && cleanKey) {
          tx.set(idempRef, {
            key: cleanKey,
            operation: 'cancel',
            tenantId,
            branchId,
            payloadHash,
            status: 'completed',
            result: built.updatedInvoice,
            timestamp: Date.now(),
            completedAt: built.now,
          });
        }

        return { invoice: built.updatedInvoice, isNew: true };
      });

      cancelledInvoice = outcome.invoice;
      isNew = outcome.isNew;
    }

    if (isNew) {
      try {
        const prevBalanceDue = Math.max(
          0,
          roundPaise(cancelledInvoice.grandTotal - cancelledInvoice.amountPaid - (cancelledInvoice.totalRefunded || 0))
        );
        await AccountingService.recordInvoiceCancellationAccounting({
          tenantId,
          branchId,
          invoiceBeforeCancel: {
            id: cancelledInvoice.id,
            invoiceNumber: cancelledInvoice.invoiceNumber,
            balanceDue: prevBalanceDue,
            amountPaid: cancelledInvoice.amountPaid,
            totalRefunded: cancelledInvoice.totalRefunded || 0,
            items: cancelledInvoice.items,
          },
          cancelledAt: cancelledInvoice.cancelledAt || cancelledInvoice.updatedAt,
          reason: reason.trim(),
          userId,
        });
      } catch (accErr) {
        logger.error({ err: accErr, invoiceId }, 'Invoice cancellation accounting hook failed');
      }

      await AuditService.log({
        tenantId,
        action: 'SALES_INVOICE_CANCELLED',
        actingUserId: userId,
        metadata: {
          invoiceId,
          invoiceNumber: cancelledInvoice.invoiceNumber,
          grandTotal: cancelledInvoice.grandTotal,
          refundStatus: cancelledInvoice.refundStatus,
          refundAmount: cancelledInvoice.refundAmount,
          reason: reason.trim(),
        },
      });
    }

    return cancelledInvoice;
  }

  /**
   * Generates formatted printable data snapshot for thermal or A4 receipts.
   */
  public static async getInvoicePrintData(tenantId: string, invoiceId: string): Promise<any> {
    const invoice = await this.getInvoice(tenantId, invoiceId);

    const taxSummary: Record<number, { taxable: number; cgst: number; sgst: number; igst: number }> = {};
    for (const item of invoice.items) {
      const rate = item.gstRate;
      if (!taxSummary[rate]) {
        taxSummary[rate] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      }
      taxSummary[rate].taxable = roundPaise(taxSummary[rate].taxable + item.lineTaxable);
      taxSummary[rate].cgst = roundPaise(taxSummary[rate].cgst + item.cgst);
      taxSummary[rate].sgst = roundPaise(taxSummary[rate].sgst + item.sgst);
      taxSummary[rate].igst = roundPaise(taxSummary[rate].igst + item.igst);
    }

    return {
      invoice,
      taxSummary,
      printTimestamp: new Date().toISOString(),
    };
  }

  /**
   * POS medicine lookup: returns catalogue medicines with real-time available batches and stock.
   */
  public static async getPOSMedicines(
    tenantId: string,
    branchId: string,
    query?: string
  ): Promise<any[]> {
    const medRes = await MedicineService.listMedicines(tenantId, {
      search: query,
      status: 'active',
      limit: 50,
    });

    const batchRes = await InventoryService.listBatches(tenantId, {
      branchId,
      limit: 200,
    });

    const batchMap = new Map<string, InventoryBatchRecord[]>();
    for (const b of batchRes.batches) {
      if (!isBatchExpired(b.expiryDate) && b.currentStock > 0) {
        const list = batchMap.get(b.medicineId) || [];
        list.push(b);
        batchMap.set(b.medicineId, list);
      }
    }

    return medRes.medicines.map((m) => {
      const activeBatches = (batchMap.get(m.id) || []).sort((a, b) =>
        a.expiryDate.localeCompare(b.expiryDate)
      );
      const totalStock = activeBatches.reduce((sum, b) => sum + b.currentStock, 0);
      const bestBatch = activeBatches[0] || null;

      return {
        id: m.id,
        name: m.name,
        genericName: m.genericName,
        brand: m.brand,
        category: m.category,
        dosageForm: m.dosageForm,
        strength: m.strength,
        packSize: m.packSize,
        hsnCode: m.hsnCode,
        gstRate: m.gstRate,
        barcode: m.barcode,
        prescriptionRequired: m.prescriptionRequired,
        totalStock,
        bestBatch: bestBatch
          ? {
              id: bestBatch.id,
              batchNumber: bestBatch.batchNumber,
              expiryDate: bestBatch.expiryDate,
              mrp: bestBatch.mrp,
              currentStock: bestBatch.currentStock,
            }
          : null,
        batches: activeBatches.map((b) => ({
          id: b.id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          mrp: b.mrp,
          currentStock: b.currentStock,
        })),
      };
    });
  }
}

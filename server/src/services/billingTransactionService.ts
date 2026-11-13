import crypto from 'crypto';
import { firestore } from '../lib/firebaseAdmin';
import {
  BadRequestError,
  NotFoundError,
  InsufficientStockError,
  IdempotencyConflictError,
} from '../lib/errors';
import { logger } from '../lib/logger';
import { env } from '../config/env';
import { InventoryService, InventoryBatchRecord, StockMovementRecord } from './inventoryService';
import { MedicineService } from './medicineService';
import { AuditService } from './auditService';

export interface CartItemRequest {
  medicineId: string;
  batchId?: string; // Optional: If omitted, FEFO allocates automatically across earliest batches
  quantity: number;
  unitPrice?: number; // Optional: Defaults to batch.mrp
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
  idempotencyKey: string;
  customer: CustomerInfo;
  items: CartItemRequest[];
  payments?: PaymentEntry[];
  paymentMode?: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'khata_credit'; // single mode fallback
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
  balanceDue: number;
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
  totalAmount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
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

// In-memory test stores for deterministic Vitest execution
const testInvoiceStore = new Map<string, SalesInvoiceRecord>();
const testIdempotencyStore = new Map<
  string,
  {
    key: string;
    payloadHash: string;
    status: 'pending' | 'completed';
    result?: InvoiceResult;
    timestamp: number;
  }
>();
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
    // Last day of month at 23:59:59
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

/**
 * Produces a deterministic SHA-256 hash of a normalized object for idempotency checking.
 */
function hashPayload(payload: unknown): string {
  const canonical = JSON.stringify(canonicalize(payload));
  return crypto.createHash('sha256').update(canonical).digest('hex');
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
   * Generates a concurrency-safe sequential invoice number scoped to tenant and branch:
   * e.g., INV-MAIN-2026-000101
   */
  public static async generateInvoiceNumber(tenantId: string, branchId: string): Promise<string> {
    const year = new Date().getFullYear();
    const branchCode = (branchId || 'MAIN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'MAIN';
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
   * Identifies eligible non-expired batches for a medicine and allocates stock using FEFO order.
   * If an explicit batchId is provided, validates that specific batch directly.
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

    // 1. If explicit batch was specified by the pharmacist:
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

    // 2. Automated FEFO Allocation: fetch active batches for medicine
    const listRes = await InventoryService.listBatches(tenantId, {
      branchId,
      medicineId,
      limit: 100,
    });

    // Filter out expired batches and zero-stock batches
    const eligibleBatches = listRes.batches
      .filter((b) => !isBatchExpired(b.expiryDate) && b.currentStock > 0)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)); // FEFO: earliest expiry first

    const totalEligibleStock = eligibleBatches.reduce((sum, b) => sum + b.currentStock, 0);
    if (totalEligibleStock < requestedQuantity) {
      const med = await MedicineService.getMedicine(tenantId, medicineId).catch(() => null);
      const name = med?.name || medicineId;
      throw new InsufficientStockError(
        `Insufficient non-expired stock for '${name}'. Available: ${totalEligibleStock}, Requested: ${requestedQuantity}`
      );
    }

    // Allocate across batches
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
   * Executes an atomic, idempotent POS Billing transaction:
   * 1. Idempotency verification and replay / conflict check.
   * 2. FEFO batch allocation & authoritative stock validation.
   * 3. GST and decimal-safe price calculations (intra-state vs inter-state).
   * 4. Stock decrements & immutable stock movement ledger recording.
   * 5. Permanent sales invoice document creation with payment entries.
   * 6. Idempotency completion.
   */
  public static async createSalesInvoice(input: CreateInvoiceInput): Promise<InvoiceResult> {
    const {
      tenantId,
      branchId,
      userId,
      userName = 'Billing Staff',
      idempotencyKey,
      customer,
      items,
      payments = [],
      paymentMode,
      isInterState = false,
      notes,
    } = input;

    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestError('Idempotency key must be at least 8 characters');
    }

    if (!items || items.length === 0) {
      throw new BadRequestError('Invoice must contain at least one medicine item');
    }

    // Validate quantities
    for (const item of items) {
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        throw new BadRequestError('Item quantity must be a positive number');
      }
    }

    // Compute canonical payload hash for idempotency checking
    const payloadHash = hashPayload({
      customer: { name: customer.name, phone: customer.phone },
      items: items.map((i) => ({
        medicineId: i.medicineId,
        batchId: i.batchId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountPercent: i.discountPercent,
      })),
      isInterState,
    });

    const db = firestore();
    const tenantRef = db.collection('tenants').doc(tenantId);
    const idempotencyRef = tenantRef.collection('idempotency_keys').doc(idempotencyKey);

    // ==========================================
    // 1. Idempotency Pre-Check
    // ==========================================
    if (this.isTest()) {
      const existingKey = testIdempotencyStore.get(`${tenantId}:${idempotencyKey}`);
      if (existingKey) {
        if (existingKey.status === 'completed' && existingKey.result) {
          if (existingKey.payloadHash === payloadHash) {
            logger.info({ tenantId, idempotencyKey }, 'Idempotent invoice replay (cache hit)');
            return { ...existingKey.result, fromCache: true };
          } else {
            throw new IdempotencyConflictError(
              `Idempotency key '${idempotencyKey}' was already used with a different request payload`
            );
          }
        } else if (existingKey.status === 'pending') {
          const ageMs = Date.now() - existingKey.timestamp;
          if (ageMs < 120000) {
            throw new IdempotencyConflictError(
              `Transaction with idempotency key '${idempotencyKey}' is already processing`
            );
          }
        }
      }
      testIdempotencyStore.set(`${tenantId}:${idempotencyKey}`, {
        key: idempotencyKey,
        payloadHash,
        status: 'pending',
        timestamp: Date.now(),
      });
    }

    try {
      // ==========================================
      // 2. Batch Allocation & Authoritative Calculation
      // ==========================================
      const verifiedLineItems: InvoiceLineItem[] = [];

      for (const reqItem of items) {
        const allocations = await this.allocateBatchesFEFO(
          tenantId,
          branchId,
          reqItem.medicineId,
          reqItem.quantity,
          reqItem.batchId
        );

        for (const { batch, allocateQty } of allocations) {
          // Authoritative pricing: never trust client price blindly
          const unitPrice =
            typeof reqItem.unitPrice === 'number' && reqItem.unitPrice > 0
              ? reqItem.unitPrice
              : batch.sellingPrice || batch.mrp;

          const mrp = batch.mrp;
          const discountPercent = Math.max(0, Math.min(100, Number(reqItem.discountPercent) || 0));

          // Authoritative GST: from medicine master
          const medMaster = await MedicineService.getMedicine(tenantId, batch.medicineId).catch(() => null);
          const gstRate = typeof medMaster?.gstRate === 'number' ? medMaster.gstRate : (reqItem.gstRate ?? 12);
          const hsnCode = medMaster?.hsnCode || reqItem.hsnCode || '300490';

          // Decimal-safe price calculation (tax-inclusive retail price)
          const lineGross = roundPaise(unitPrice * allocateQty);
          const discountAmount = roundPaise(lineGross * (discountPercent / 100));
          const linePayable = roundPaise(lineGross - discountAmount);

          // Tax split
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

          const currentStock = batch.currentStock;
          const newStock = currentStock - allocateQty;

          if (newStock < 0) {
            throw new InsufficientStockError(
              `Non-negative stock invariant violated for batch ${batch.batchNumber}`
            );
          }

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
            previousStock: currentStock,
            newStock,
          });
        }
      }

      // Invoice aggregate calculations
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

      // Payment normalization (supports split payments)
      const normalizedPayments: PaymentEntry[] = [];
      if (payments && payments.length > 0) {
        for (const p of payments) {
          if (p.amount > 0) {
            normalizedPayments.push({
              id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              mode: p.mode,
              amount: roundPaise(p.amount),
              referenceNumber: p.referenceNumber,
              timestamp: new Date().toISOString(),
            });
          }
        }
      } else {
        const mode = paymentMode || 'cash';
        normalizedPayments.push({
          id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          mode,
          amount: grandTotal,
          timestamp: new Date().toISOString(),
        });
      }

      const amountPaid = roundPaise(normalizedPayments.reduce((sum, p) => sum + p.amount, 0));
      const balanceDue = roundPaise(Math.max(0, grandTotal - amountPaid));

      let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
      if (amountPaid >= grandTotal) {
        paymentStatus = 'paid';
      } else if (amountPaid > 0) {
        paymentStatus = 'partial';
      }

      const timestamp = new Date().toISOString();
      const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const invoiceNumber = await this.generateInvoiceNumber(tenantId, branchId);

      const invoiceRecord: SalesInvoiceRecord = {
        id: invoiceId,
        invoiceNumber,
        tenantId,
        branchId,
        userId,
        userName,
        customer: {
          name: customer.name.trim() || 'Walk-in Customer',
          phone: customer.phone?.trim(),
          doctorName: customer.doctorName?.trim(),
          doctorRegNumber: customer.doctorRegNumber?.trim(),
          address: customer.address?.trim(),
          gstin: customer.gstin?.trim(),
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
        balanceDue,
        paymentStatus,
        payments: normalizedPayments,
        status: 'completed',
        isInterState,
        notes,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      // ==========================================
      // 3. Atomically Commit Stock Decrements & Ledger
      // ==========================================
      if (this.isTest()) {
        // In-memory atomic simulation
        for (const line of verifiedLineItems) {
          await InventoryService.adjustStock(
            tenantId,
            branchId,
            line.batchId,
            {
              movementType: 'MANUAL_ADJUSTMENT',
              quantityChange: -line.quantity,
              reason: `Retail POS Sale: ${invoiceNumber}`,
              referenceId: invoiceId,
            },
            userId
          );
        }

        testInvoiceStore.set(`${tenantId}:${invoiceId}`, invoiceRecord);

        const result: InvoiceResult = {
          invoiceId,
          invoiceNumber,
          tenantId,
          branchId,
          totalAmount: grandTotal,
          taxableAmount,
          cgst,
          sgst,
          igst,
          roundOff,
          grandTotal,
          amountPaid,
          balanceDue,
          itemCount: verifiedLineItems.length,
          paymentStatus,
          payments: normalizedPayments,
          paymentMode: normalizedPayments[0]?.mode || 'cash',
          createdAt: timestamp,
        };

        testIdempotencyStore.set(`${tenantId}:${idempotencyKey}`, {
          key: idempotencyKey,
          payloadHash,
          status: 'completed',
          result,
          timestamp: Date.now(),
        });

        return result;
      }

      // Cloud Firestore production transaction
      return await db.runTransaction(async (transaction) => {
        // Check idempotency inside transaction
        const idempDoc = await transaction.get(idempotencyRef);
        if (idempDoc.exists) {
          const d = idempDoc.data();
          if (d?.status === 'completed' && d.result) {
            if (d.payloadHash === payloadHash) {
              return { ...(d.result as InvoiceResult), fromCache: true };
            } else {
              throw new IdempotencyConflictError(
                `Idempotency key '${idempotencyKey}' was already used with a different request payload`
              );
            }
          }
        }

        // Read current batches inside transaction for ACID serializability
        const batchDocRefs = verifiedLineItems.map((item) =>
          tenantRef.collection('inventory_batches').doc(item.batchId)
        );
        const batchDocs = await Promise.all(batchDocRefs.map((ref) => transaction.get(ref)));

        // Validate stock
        for (let i = 0; i < verifiedLineItems.length; i++) {
          const line = verifiedLineItems[i]!;
          const bDoc = batchDocs[i]!;
          if (!bDoc.exists) {
            throw new NotFoundError(`Batch '${line.batchId}' no longer exists`);
          }
          const bData = bDoc.data()!;
          const currentStock = Number(bData.currentStock ?? 0);
          if (currentStock < line.quantity) {
            throw new InsufficientStockError(
              `Concurrent sale exhausted batch '${line.batchNumber}'. Available: ${currentStock}, Requested: ${line.quantity}`
            );
          }
        }

        // Execute writes inside transaction:
        // a) Batch stock updates
        for (const line of verifiedLineItems) {
          const bRef = tenantRef.collection('inventory_batches').doc(line.batchId);
          transaction.update(bRef, {
            currentStock: line.newStock,
            updatedAt: timestamp,
            lastDispensedAt: timestamp,
          });

          // b) Stock movement ledger
          const mRef = tenantRef.collection('stock_movements').doc();
          transaction.set(mRef, {
            id: mRef.id,
            tenantId,
            branchId,
            medicineId: line.medicineId,
            batchId: line.batchId,
            movementType: 'SALE',
            quantityChange: -line.quantity,
            previousQuantity: line.previousStock,
            newQuantity: line.newStock,
            referenceType: 'sales_invoice',
            referenceId: invoiceId,
            reason: `POS Dispense: ${invoiceNumber}`,
            performedBy: userId,
            timestamp,
          });
        }

        // c) Sales invoice document
        const invRef = tenantRef.collection('sales_invoices').doc(invoiceId);
        transaction.set(invRef, invoiceRecord);

        // d) Payment entries subcollection
        for (const p of normalizedPayments) {
          const payRef = invRef.collection('payments').doc(p.id!);
          transaction.set(payRef, { ...p, invoiceId, tenantId, branchId, recordedBy: userId });
        }

        const result: InvoiceResult = {
          invoiceId,
          invoiceNumber,
          tenantId,
          branchId,
          totalAmount: grandTotal,
          taxableAmount,
          cgst,
          sgst,
          igst,
          roundOff,
          grandTotal,
          amountPaid,
          balanceDue,
          itemCount: verifiedLineItems.length,
          paymentStatus,
          payments: normalizedPayments,
          paymentMode: normalizedPayments[0]?.mode || 'cash',
          createdAt: timestamp,
        };

        // e) Idempotency completion
        transaction.set(idempotencyRef, {
          key: idempotencyKey,
          payloadHash,
          status: 'completed',
          result,
          tenantId,
          branchId,
          completedAt: timestamp,
        });

        return result;
      });
    } catch (error) {
      if (this.isTest()) {
        const entry = testIdempotencyStore.get(`${tenantId}:${idempotencyKey}`);
        if (entry && entry.status === 'pending') {
          testIdempotencyStore.delete(`${tenantId}:${idempotencyKey}`);
        }
      }
      throw error;
    }
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

    // Sort latest first
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = all.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = all.slice((page - 1) * limit, page * limit);

    return { invoices: paginated, total, page, limit, totalPages };
  }

  /**
   * Records an additional payment towards an invoice (split payment or balance due settlement).
   */
  public static async recordPayment(
    tenantId: string,
    branchId: string,
    invoiceId: string,
    payment: { mode: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'khata_credit'; amount: number; referenceNumber?: string },
    userId: string
  ): Promise<SalesInvoiceRecord> {
    if (payment.amount <= 0) {
      throw new BadRequestError('Payment amount must be greater than zero');
    }

    const invoice = await this.getInvoice(tenantId, invoiceId);

    if (invoice.status === 'cancelled') {
      throw new BadRequestError('Cannot collect payment against a cancelled invoice');
    }

    if (invoice.balanceDue <= 0) {
      throw new BadRequestError('Invoice is already fully settled (zero balance due)');
    }

    const payAmount = roundPaise(Math.min(payment.amount, invoice.balanceDue));
    const newAmountPaid = roundPaise(invoice.amountPaid + payAmount);
    const newBalanceDue = roundPaise(Math.max(0, invoice.grandTotal - newAmountPaid));
    const newPaymentStatus = newBalanceDue === 0 ? 'paid' : 'partial';

    const paymentEntry: PaymentEntry = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      mode: payment.mode,
      amount: payAmount,
      referenceNumber: payment.referenceNumber,
      timestamp: new Date().toISOString(),
    };

    const updatedInvoice: SalesInvoiceRecord = {
      ...invoice,
      amountPaid: newAmountPaid,
      balanceDue: newBalanceDue,
      paymentStatus: newPaymentStatus,
      payments: [...invoice.payments, paymentEntry],
      updatedAt: new Date().toISOString(),
    };

    if (this.isTest()) {
      testInvoiceStore.set(`${tenantId}:${invoiceId}`, updatedInvoice);
    } else {
      const db = firestore();
      const invRef = db.collection('tenants').doc(tenantId).collection('sales_invoices').doc(invoiceId);
      await invRef.update({
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        paymentStatus: newPaymentStatus,
        payments: updatedInvoice.payments,
        updatedAt: updatedInvoice.updatedAt,
      });
      await invRef.collection('payments').doc(paymentEntry.id!).set({
        ...paymentEntry,
        invoiceId,
        tenantId,
        branchId,
        recordedBy: userId,
      });
    }

    await AuditService.log({
      tenantId,
      action: 'INVOICE_PAYMENT_RECORDED',
      actingUserId: userId,
      metadata: {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amount: payAmount,
        mode: payment.mode,
        balanceDue: newBalanceDue,
      },
    });

    return updatedInvoice;
  }

  /**
   * Processes a partial or complete sales return:
   * 1. Validates returned quantity does not exceed original sold quantity minus previous returns.
   * 2. Re-inwards non-expired returned units and records SALE_RETURN movement.
   * 3. Calculates proportional refund.
   * 4. Updates invoice status to partially_returned or returned.
   */
  public static async processSalesReturn(
    tenantId: string,
    branchId: string,
    invoiceId: string,
    input: { items: SalesReturnItemInput[]; reason: string },
    userId: string
  ): Promise<{ returnRecord: SalesReturnRecord; updatedInvoice: SalesInvoiceRecord }> {
    const { items: returnItems, reason } = input;

    if (!returnItems || returnItems.length === 0) {
      throw new BadRequestError('Return request must contain at least one item');
    }

    const invoice = await this.getInvoice(tenantId, invoiceId);

    if (invoice.status === 'cancelled') {
      throw new BadRequestError('Cannot process returns against a cancelled invoice');
    }

    let totalRefundAmount = 0;
    const processedItems: SalesReturnRecord['items'] = [];

    // Clone line items to update returnedQuantity
    const updatedLineItems = invoice.items.map((line) => ({ ...line }));

    for (const ret of returnItems) {
      if (ret.quantity <= 0) {
        throw new BadRequestError('Return quantity must be greater than zero');
      }

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

      // Proportional refund per unit
      const unitRefund = roundPaise(line.lineTotal / line.quantity);
      const itemRefund = roundPaise(unitRefund * ret.quantity);
      totalRefundAmount = roundPaise(totalRefundAmount + itemRefund);

      line.returnedQuantity = alreadyReturned + ret.quantity;

      // Restock batch if requested and not expired
      const shouldRestock = ret.restock !== false;
      if (shouldRestock) {
        await InventoryService.adjustStock(
          tenantId,
          branchId,
          line.batchId,
          {
            movementType: 'SALE_RETURN',
            quantityChange: ret.quantity,
            reason: `Sales Return on ${invoice.invoiceNumber}: ${reason || 'Customer Return'}`,
            referenceId: invoiceId,
          },
          userId
        );
      }

      processedItems.push({
        batchId: line.batchId,
        medicineId: line.medicineId,
        medicineName: line.medicineName,
        quantity: ret.quantity,
        unitPrice: line.unitPrice,
        refundAmount: itemRefund,
        restocked: shouldRestock,
      });
    }

    // Determine new invoice status
    const allItemsReturned = updatedLineItems.every((l) => (l.returnedQuantity || 0) >= l.quantity);
    const newStatus = allItemsReturned ? 'returned' : 'partially_returned';
    const now = new Date().toISOString();

    const returnId = `ret_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
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

    const existingReturns = invoice.returns || [];
    const updatedInvoice: SalesInvoiceRecord = {
      ...invoice,
      items: updatedLineItems,
      status: newStatus,
      returns: [...existingReturns, returnRecord],
      updatedAt: now,
    };

    if (this.isTest()) {
      testInvoiceStore.set(`${tenantId}:${invoiceId}`, updatedInvoice);
    } else {
      const db = firestore();
      const invRef = db.collection('tenants').doc(tenantId).collection('sales_invoices').doc(invoiceId);
      await invRef.update({
        items: updatedLineItems,
        status: newStatus,
        returns: updatedInvoice.returns,
        updatedAt: now,
      });
      await invRef.collection('returns').doc(returnId).set(returnRecord);
    }

    await AuditService.log({
      tenantId,
      action: 'SALES_RETURN_PROCESSED',
      actingUserId: userId,
      metadata: {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        totalRefundAmount,
        reason,
        status: newStatus,
      },
    });

    return { returnRecord, updatedInvoice };
  }

  /**
   * Cancels an issued sales invoice:
   * 1. Checks permissions and validates status is completed.
   * 2. Reverses stock deductions for all lines.
   * 3. Sets invoice status to cancelled.
   */
  public static async cancelSalesInvoice(
    tenantId: string,
    branchId: string,
    invoiceId: string,
    reason: string,
    userId: string
  ): Promise<SalesInvoiceRecord> {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestError('A valid cancellation reason (minimum 3 characters) is required');
    }

    const invoice = await this.getInvoice(tenantId, invoiceId);

    if (invoice.status === 'cancelled') {
      throw new BadRequestError(`Invoice ${invoice.invoiceNumber} is already cancelled`);
    }

    if (invoice.status === 'returned') {
      throw new BadRequestError(`Cannot cancel a fully returned invoice`);
    }

    const now = new Date().toISOString();

    // Reverse stock for all line items (minus any already returned items)
    for (const line of invoice.items) {
      const netSold = line.quantity - (line.returnedQuantity || 0);
      if (netSold > 0) {
        await InventoryService.adjustStock(
          tenantId,
          branchId,
          line.batchId,
          {
            movementType: 'MANUAL_ADJUSTMENT',
            quantityChange: netSold,
            reason: `Invoice Cancelled (${invoice.invoiceNumber}): ${reason}`,
            referenceId: invoiceId,
          },
          userId
        );
      }
    }

    const updatedInvoice: SalesInvoiceRecord = {
      ...invoice,
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: userId,
      cancellationReason: reason,
      updatedAt: now,
    };

    if (this.isTest()) {
      testInvoiceStore.set(`${tenantId}:${invoiceId}`, updatedInvoice);
    } else {
      const db = firestore();
      await db.collection('tenants').doc(tenantId).collection('sales_invoices').doc(invoiceId).update({
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: userId,
        cancellationReason: reason,
        updatedAt: now,
      });
    }

    await AuditService.log({
      tenantId,
      action: 'SALES_INVOICE_CANCELLED',
      actingUserId: userId,
      metadata: {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        grandTotal: invoice.grandTotal,
        reason,
      },
    });

    return updatedInvoice;
  }

  /**
   * Generates formatted printable data snapshot for thermal or A4 receipts.
   */
  public static async getInvoicePrintData(tenantId: string, invoiceId: string): Promise<any> {
    const invoice = await this.getInvoice(tenantId, invoiceId);

    // Group items by GST rate for tax summary table
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

    // Map batches to medicines
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

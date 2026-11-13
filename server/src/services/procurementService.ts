import crypto from 'node:crypto';
import { firestore } from '../lib/firebaseAdmin';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  IdempotencyConflictError,
  NotFoundError,
} from '../lib/errors';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { AuditService } from './auditService';
import { MedicineService } from './medicineService';
import { AccountingService } from './accountingService';
import {
  InventoryService,
  InventoryBatchRecord,
  StockMovementRecord,
  getAllTestBatchesForTenant,
  getTestBatchDirect,
  recordTestMovementDirect,
  setTestBatch,
  withTestBranchInventoryLock,
} from './inventoryService';
import {
  SupplierRecord,
  SupplierService,
  SupplierViewerAccess,
  fromPaise,
  getTestSupplierDirect,
  resolveStateCodeByName,
  roundPaise,
  setTestSupplier,
  toPaise,
  withTestSupplierLock,
} from './supplierService';

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PARTIALLY_RECEIVED'
  | 'FULLY_RECEIVED'
  | 'CLOSED'
  | 'CANCELLED';

export type GrnStatus = 'DRAFT' | 'POSTED' | 'REVERSED';
export type SupplierInvoicePaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'REVERSED';
export type SupplierPaymentMode =
  | 'CASH'
  | 'UPI'
  | 'CARD'
  | 'BANK_TRANSFER'
  | 'NEFT_RTGS'
  | 'CHEQUE'
  | 'ADVANCE_ADJUSTMENT';

export type PurchaseOperationType =
  | 'CREATE_PO'
  | 'APPROVE_PO'
  | 'POST_GRN'
  | 'REVERSE_GRN'
  | 'CREATE_SUPPLIER_INVOICE'
  | 'RECORD_SUPPLIER_PAYMENT'
  | 'CREATE_SUPPLIER_RETURN';

export interface PurchaseOrderLineItem {
  id: string;
  medicineId: string;
  medicineName: string;
  genericName: string;
  brand: string;
  packSize: string;
  hsnCode: string;
  orderedQuantity: number;
  freeQuantity: number;
  receivedQuantity: number;
  rejectedQuantity: number;
  pendingQuantity: number;
  unitCost: number;
  mrp?: number | null;
  discountPercent: number;
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
}

export interface PurchaseOrderRecord {
  id: string;
  poId: string;
  poNumber: string;
  tenantId: string;
  branchId: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  supplierGstin?: string | null;
  supplierStateCode: string;
  tenantStateCode: string;
  placeOfSupplyStateCode: string;
  isInterState: boolean;
  orderDate: string;
  expectedDeliveryDate?: string | null;
  status: PurchaseOrderStatus;
  items: PurchaseOrderLineItem[];
  subtotal: number;
  totalDiscount: number;
  invoiceDiscount: number;
  otherCharges: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  totalOrderedQty: number;
  totalReceivedQty: number;
  totalPendingQty: number;
  paymentTerms: string;
  notes?: string | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  closedBy?: string | null;
  closedAt?: string | null;
  closureReason?: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface GrnBatchLine {
  id: string;
  poItemId?: string | null;
  medicineId: string;
  medicineName: string;
  genericName: string;
  hsnCode: string;
  batchNumber: string;
  manufacturingDate?: string | null;
  expiryDate: string;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  freeQuantity: number;
  rejectionReason?: string | null;
  purchasePrice: number;
  mrp: number;
  sellingPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
  rackLocation?: string | null;
  barcode?: string | null;
  inventoryBatchId?: string | null;
  shortExpiryWarning?: boolean;
  daysToExpiry?: number;
}

export interface GrnWarning {
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  expiryDate: string;
  daysRemaining: number;
  message: string;
}

export interface GoodsReceiptRecord {
  id: string;
  grnId: string;
  grnNumber: string;
  tenantId: string;
  branchId: string;
  poId?: string | null;
  poNumber?: string | null;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  supplierGstin?: string | null;
  supplierInvoiceNumber?: string | null;
  supplierInvoiceDate?: string | null;
  receiptDate: string;
  placeOfSupplyStateCode: string;
  isInterState: boolean;
  status: GrnStatus;
  items: GrnBatchLine[];
  subtotal: number;
  totalDiscount: number;
  invoiceDiscount: number;
  otherCharges: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  totalReceivedQty: number;
  totalAcceptedQty: number;
  totalRejectedQty: number;
  totalFreeQty: number;
  warnings: GrnWarning[];
  shortExpiryThresholdDays: number;
  allowOverReceiptUsed: boolean;
  linkedInvoiceId?: string | null;
  notes?: string | null;
  operationId?: string | null;
  idempotencyKey?: string | null;
  postedBy?: string | null;
  postedAt?: string | null;
  reversedBy?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface SupplierInvoiceRecord {
  id: string;
  invoiceId: string;
  tenantId: string;
  branchId: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  supplierGstin?: string | null;
  grnId?: string | null;
  grnNumber?: string | null;
  poId?: string | null;
  poNumber?: string | null;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  placeOfSupplyStateCode: string;
  isInterState: boolean;
  subtotal: number;
  totalDiscount: number;
  otherCharges: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  totalAmount: number;
  amountPaid: number;
  creditNoteAmount: number;
  outstandingAmount: number;
  paymentStatus: SupplierInvoicePaymentStatus;
  recognitionBasis: 'GRN' | 'DIRECT_BILL';
  attachmentPath?: string | null;
  notes?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPaymentAllocation {
  invoiceId: string;
  supplierInvoiceNumber: string;
  allocatedAmount: number;
}

export interface SupplierPaymentRecord {
  id: string;
  paymentId: string;
  paymentNumber: string;
  tenantId: string;
  branchId: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  paymentDate: string;
  paymentMode: SupplierPaymentMode;
  amount: number;
  allocatedTotal: number;
  advanceAdded: number;
  referenceNumber?: string | null;
  notes?: string | null;
  allocations: SupplierPaymentAllocation[];
  idempotencyKey?: string | null;
  operationId?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface SupplierReturnItem {
  grnBatchLineId?: string | null;
  batchId: string;
  batchNumber: string;
  medicineId: string;
  medicineName: string;
  quantity: number;
  unitCost: number;
  gstRate: number;
  taxableAmount: number;
  taxAmount: number;
  lineTotal: number;
  reason: string;
}

export interface SupplierReturnRecord {
  id: string;
  returnId: string;
  returnNumber: string;
  tenantId: string;
  branchId: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  grnId: string;
  grnNumber: string;
  linkedInvoiceId?: string | null;
  creditNoteNumber: string;
  returnDate: string;
  status: 'POSTED' | 'PENDING_APPROVAL';
  items: SupplierReturnItem[];
  subtotal: number;
  totalTax: number;
  totalAmount: number;
  payableReduced: number;
  advanceCredited: number;
  reason: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  idempotencyKey?: string | null;
  operationId?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface PurchaseOperationRecord {
  id: string;
  tenantId: string;
  branchId: string;
  operationType: PurchaseOperationType;
  targetId: string;
  idempotencyKey?: string | null;
  status: 'STARTED' | 'COMMITTED' | 'FAILED' | 'REVERSED';
  performedBy: string;
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

export interface TenantProcurementProfile {
  name?: string;
  gstin?: string | null;
  state?: string | null;
  stateCode?: string | null;
  dlNumber20B?: string | null;
  dlNumber21B?: string | null;
  address?: string | null;
}

// ==========================================
// Inputs
// ==========================================
export interface PurchaseOrderItemInput {
  medicineId: string;
  orderedQuantity: number;
  freeQuantity?: number;
  unitCost: number;
  mrp?: number | null;
  discountPercent?: number;
  discountAmount?: number;
  gstRate?: number;
  hsnCode?: string;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  orderDate?: string;
  expectedDeliveryDate?: string | null;
  placeOfSupplyStateCode?: string;
  isInterState?: boolean;
  invoiceDiscount?: number;
  otherCharges?: number;
  paymentTerms?: string;
  notes?: string | null;
  items: PurchaseOrderItemInput[];
  submitImmediately?: boolean;
}

export interface GrnItemBatchInput {
  poItemId?: string;
  medicineId: string;
  batchNumber: string;
  manufacturingDate?: string | null;
  expiryDate: string;
  receivedQuantity?: number;
  acceptedQuantity: number;
  rejectedQuantity?: number;
  freeQuantity?: number;
  rejectionReason?: string | null;
  purchasePrice: number;
  mrp: number;
  sellingPrice?: number;
  discountPercent?: number;
  discountAmount?: number;
  gstRate?: number;
  rackLocation?: string | null;
  barcode?: string | null;
}

export interface CreateGrnInput {
  poId?: string | null;
  supplierId?: string;
  supplierInvoiceNumber?: string | null;
  supplierInvoiceDate?: string | null;
  receiptDate?: string;
  placeOfSupplyStateCode?: string;
  isInterState?: boolean;
  invoiceDiscount?: number;
  otherCharges?: number;
  shortExpiryWarningDays?: number;
  allowOverReceipt?: boolean;
  overReceiptReason?: string | null;
  autoCreateSupplierInvoice?: boolean;
  notes?: string | null;
  items: GrnItemBatchInput[];
}

export interface CreateSupplierInvoiceInput {
  supplierId: string;
  grnId?: string | null;
  poId?: string | null;
  supplierInvoiceNumber: string;
  invoiceDate?: string;
  dueDate?: string;
  placeOfSupplyStateCode?: string;
  isInterState?: boolean;
  subtotal?: number;
  totalDiscount?: number;
  otherCharges?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  roundOff?: number;
  totalAmount?: number;
  attachmentPath?: string | null;
  notes?: string | null;
}

export interface RecordSupplierPaymentInput {
  supplierId: string;
  paymentDate?: string;
  paymentMode: SupplierPaymentMode;
  amount: number;
  referenceNumber?: string | null;
  notes?: string | null;
  allocations?: Array<{ invoiceId: string; amount: number }>;
  allowAdvance?: boolean;
  idempotencyKey?: string;
}

export interface CreateSupplierReturnInput {
  grnId: string;
  creditNoteNumber?: string;
  returnDate?: string;
  reason: string;
  items: Array<{
    batchId: string;
    quantity: number;
    reason?: string;
  }>;
  idempotencyKey?: string;
}

// ==========================================
// Test Stores & Deterministic Locks
// ==========================================
const testPoStore = new Map<string, PurchaseOrderRecord>();
const testGrnStore = new Map<string, GoodsReceiptRecord>();
const testInvoiceStore = new Map<string, SupplierInvoiceRecord>();
const testPaymentStore = new Map<string, SupplierPaymentRecord>();
const testReturnStore = new Map<string, SupplierReturnRecord>();
const testOpStore = new Map<string, PurchaseOperationRecord>();
const testIdempotencyStore = new Map<string, { requestHash: string; response: any }>();
const testTenantProfileStore = new Map<string, TenantProcurementProfile>();
const testProcurementLocks = new Map<string, Promise<unknown>>();

export function setTestTenantProfile(tenantId: string, profile: TenantProcurementProfile): void {
  testTenantProfileStore.set(tenantId, profile);
}

export function clearTestProcurementData(): void {
  testPoStore.clear();
  testGrnStore.clear();
  testInvoiceStore.clear();
  testPaymentStore.clear();
  testReturnStore.clear();
  testOpStore.clear();
  testIdempotencyStore.clear();
  testTenantProfileStore.clear();
  testProcurementLocks.clear();
}

export function getTestPurchaseOrdersForTenant(tenantId: string): PurchaseOrderRecord[] {
  const out: PurchaseOrderRecord[] = [];
  for (const [k, v] of testPoStore.entries()) {
    if (k.startsWith(`${tenantId}:`)) out.push(v);
  }
  return out;
}

export function getTestGrnsForTenant(tenantId: string): GoodsReceiptRecord[] {
  const out: GoodsReceiptRecord[] = [];
  for (const [k, v] of testGrnStore.entries()) {
    if (k.startsWith(`${tenantId}:`)) out.push(v);
  }
  return out;
}

export function getTestSupplierInvoicesForTenant(tenantId: string): SupplierInvoiceRecord[] {
  const out: SupplierInvoiceRecord[] = [];
  for (const [k, v] of testInvoiceStore.entries()) {
    if (k.startsWith(`${tenantId}:`)) out.push(v);
  }
  return out;
}

export function getTestSupplierPaymentsForTenant(tenantId: string): SupplierPaymentRecord[] {
  const out: SupplierPaymentRecord[] = [];
  for (const [k, v] of testPaymentStore.entries()) {
    if (k.startsWith(`${tenantId}:`)) out.push(v);
  }
  return out;
}

export function getTestSupplierReturnsForTenant(tenantId: string): SupplierReturnRecord[] {
  const out: SupplierReturnRecord[] = [];
  for (const [k, v] of testReturnStore.entries()) {
    if (k.startsWith(`${tenantId}:`)) out.push(v);
  }
  return out;
}

export function getTestPurchaseOperationsForTenant(tenantId: string): PurchaseOperationRecord[] {
  const out: PurchaseOperationRecord[] = [];
  for (const [k, v] of testOpStore.entries()) {
    if (k.startsWith(`${tenantId}:`)) out.push(v);
  }
  return out;
}

async function withTestProcurementLock<T>(
  tenantId: string,
  lockScope: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = `${tenantId}:proc:${lockScope}`;
  const previous = testProcurementLocks.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => current, () => current);
  testProcurementLocks.set(lockKey, chained);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (testProcurementLocks.get(lockKey) === chained) {
      testProcurementLocks.delete(lockKey);
    }
  }
}

function hashRequest(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex');
}

function parseDateValue(rawDate: string): Date {
  const clean = rawDate.trim();
  if (/^\d{4}-\d{2}$/.test(clean)) {
    const [y, m] = clean.split('-').map(Number);
    // Last day of that expiry month
    return new Date(Date.UTC(y!, m!, 0, 23, 59, 59, 999));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return new Date(`${clean}T00:00:00.000Z`);
  }
  const d = new Date(clean);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestError(`Invalid date '${rawDate}'. Expected YYYY-MM or YYYY-MM-DD.`);
  }
  return d;
}

function addDaysIso(isoDate: string, days: number): string {
  const base = new Date(isoDate);
  base.setUTCDate(base.getUTCDate() + Math.max(0, Math.round(days)));
  return base.toISOString();
}

function computeInvoiceStatus(
  outstandingAmount: number,
  amountPaid: number,
  dueDate: string,
  currentStatus?: SupplierInvoicePaymentStatus
): SupplierInvoicePaymentStatus {
  if (currentStatus === 'REVERSED') return 'REVERSED';
  const outPaise = toPaise(outstandingAmount);
  if (outPaise <= 0) return 'PAID';
  const todayStr = new Date().toISOString().slice(0, 10);
  if (dueDate.slice(0, 10) < todayStr) return 'OVERDUE';
  if (toPaise(amountPaid) > 0) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

interface LineCalculationInput {
  quantity: number;
  unitCost: number;
  discountPercent?: number;
  discountAmount?: number;
  gstRate: number;
}

function computeLineAndHeaderGst(
  lines: LineCalculationInput[],
  isInterState: boolean,
  invoiceDiscountInr: number = 0,
  otherChargesInr: number = 0
) {
  const linePrelim = lines.map((line) => {
    const qty = Math.max(0, Number(line.quantity) || 0);
    const unitCostPaise = Math.max(0, toPaise(line.unitCost));
    const grossPaise = qty * unitCostPaise;
    let discPaise = 0;
    if (line.discountAmount !== undefined && line.discountAmount > 0) {
      discPaise = Math.min(grossPaise, toPaise(line.discountAmount));
    } else if (line.discountPercent !== undefined && line.discountPercent > 0) {
      discPaise = Math.min(grossPaise, Math.round((grossPaise * line.discountPercent) / 100));
    }
    const netLinePaise = grossPaise - discPaise;
    return {
      grossPaise,
      discPaise,
      netLinePaise,
      gstRate: Number(line.gstRate) || 0,
    };
  });

  const subtotalPaise = linePrelim.reduce((s, l) => s + l.grossPaise, 0);
  const lineDiscountsPaise = linePrelim.reduce((s, l) => s + l.discPaise, 0);
  const netBeforeInvoiceDiscPaise = linePrelim.reduce((s, l) => s + l.netLinePaise, 0);
  const invoiceDiscountPaise = Math.min(
    netBeforeInvoiceDiscPaise,
    Math.max(0, toPaise(invoiceDiscountInr))
  );

  // Allocate invoice-level discount proportionally in integer paise without rounding drift
  let remainingInvDisc = invoiceDiscountPaise;
  const lineResults = linePrelim.map((l, idx) => {
    let allocatedInvDisc = 0;
    if (invoiceDiscountPaise > 0 && netBeforeInvoiceDiscPaise > 0) {
      if (idx === linePrelim.length - 1) {
        allocatedInvDisc = remainingInvDisc;
      } else {
        allocatedInvDisc = Math.round(
          (invoiceDiscountPaise * l.netLinePaise) / netBeforeInvoiceDiscPaise
        );
        allocatedInvDisc = Math.min(allocatedInvDisc, remainingInvDisc);
        remainingInvDisc -= allocatedInvDisc;
      }
    }

    const taxablePaise = Math.max(0, l.netLinePaise - allocatedInvDisc);
    const totalTaxPaise = Math.round((taxablePaise * l.gstRate) / 100);
    const igstPaise = isInterState ? totalTaxPaise : 0;
    const cgstPaise = isInterState ? 0 : Math.floor(totalTaxPaise / 2);
    const sgstPaise = isInterState ? 0 : totalTaxPaise - cgstPaise;
    const totalLinePaise = taxablePaise + totalTaxPaise;

    return {
      discountAmount: fromPaise(l.discPaise + allocatedInvDisc),
      taxableAmount: fromPaise(taxablePaise),
      taxablePaise,
      cgstPaise,
      sgstPaise,
      igstPaise,
      cgst: fromPaise(cgstPaise),
      sgst: fromPaise(sgstPaise),
      igst: fromPaise(igstPaise),
      lineTotal: fromPaise(totalLinePaise),
      lineTotalPaise: totalLinePaise,
    };
  });

  const otherChargesPaise = Math.max(0, toPaise(otherChargesInr));
  const taxableSumPaise = lineResults.reduce((s, l) => s + l.taxablePaise, 0);
  const cgstSumPaise = lineResults.reduce((s, l) => s + l.cgstPaise, 0);
  const sgstSumPaise = lineResults.reduce((s, l) => s + l.sgstPaise, 0);
  const igstSumPaise = lineResults.reduce((s, l) => s + l.igstPaise, 0);
  const totalTaxPaise = cgstSumPaise + sgstSumPaise + igstSumPaise;
  const rawGrandPaise = taxableSumPaise + totalTaxPaise + otherChargesPaise;
  const roundedRupees = Math.round(rawGrandPaise / 100);
  const grandTotalPaise = roundedRupees * 100;
  const roundOffPaise = grandTotalPaise - rawGrandPaise;

  return {
    lineResults,
    subtotal: fromPaise(subtotalPaise),
    totalDiscount: fromPaise(lineDiscountsPaise + invoiceDiscountPaise),
    invoiceDiscount: fromPaise(invoiceDiscountPaise),
    otherCharges: fromPaise(otherChargesPaise),
    taxableAmount: fromPaise(taxableSumPaise),
    cgst: fromPaise(cgstSumPaise),
    sgst: fromPaise(sgstSumPaise),
    igst: fromPaise(igstSumPaise),
    totalTax: fromPaise(totalTaxPaise),
    roundOff: fromPaise(roundOffPaise),
    grandTotal: fromPaise(grandTotalPaise),
  };
}

export class ProcurementService {
  private static isTest(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST)
    );
  }

  private static async resolveTenantProfile(tenantId: string): Promise<TenantProcurementProfile & { stateCode: string }> {
    let profile: TenantProcurementProfile = {};
    if (this.isTest()) {
      profile = testTenantProfileStore.get(tenantId) || { state: 'Maharashtra', stateCode: '27' };
    } else {
      const snap = await firestore().collection('tenants').doc(tenantId).get();
      if (snap.exists) {
        profile = snap.data() as TenantProcurementProfile;
      }
    }
    const stateCode =
      profile.stateCode ||
      (profile.gstin && profile.gstin.length >= 2 ? profile.gstin.slice(0, 2) : undefined) ||
      resolveStateCodeByName(profile.state) ||
      '27';

    return { ...profile, stateCode };
  }

  private static assertSupplierActiveForNewCommitment(supplier: SupplierRecord): void {
    if (supplier.isArchived) {
      throw new BadRequestError(`Supplier '${supplier.tradeName}' is archived and cannot be used for procurement.`);
    }
    if (supplier.status === 'BLOCKED') {
      throw new BadRequestError(
        `Supplier '${supplier.tradeName}' is BLOCKED${supplier.blockReason ? ` (${supplier.blockReason})` : ''}.`
      );
    }
    if (supplier.status === 'INACTIVE') {
      throw new BadRequestError(`Supplier '${supplier.tradeName}' is INACTIVE and cannot receive new purchase orders.`);
    }
  }

  // =========================================================================
  // PURCHASE ORDERS
  // =========================================================================

  public static async listPurchaseOrders(
    tenantId: string,
    branchId: string | undefined,
    options: {
      status?: PurchaseOrderStatus;
      supplierId?: string;
      search?: string;
      fromDate?: string;
      toDate?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    let items: PurchaseOrderRecord[] = [];
    if (this.isTest()) {
      items = getTestPurchaseOrdersForTenant(tenantId).map((p) => ({ ...p }));
    } else {
      const snap = await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('purchaseOrders')
        .get();
      items = snap.docs.map((d) => d.data() as PurchaseOrderRecord);
    }

    if (branchId && branchId !== 'all') {
      items = items.filter((p) => p.branchId === branchId);
    }
    if (options.status) {
      items = items.filter((p) => p.status === options.status);
    }
    if (options.supplierId) {
      items = items.filter((p) => p.supplierId === options.supplierId);
    }
    if (options.fromDate) {
      items = items.filter((p) => p.orderDate >= options.fromDate!);
    }
    if (options.toDate) {
      items = items.filter((p) => p.orderDate <= `${options.toDate!}T23:59:59.999Z`);
    }
    if (options.search?.trim()) {
      const q = options.search.trim().toLowerCase();
      items = items.filter(
        (p) =>
          p.poNumber.toLowerCase().includes(q) ||
          p.supplierName.toLowerCase().includes(q) ||
          p.supplierCode.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));
    const total = items.length;

    return {
      purchaseOrders: items.slice((page - 1) * limit, page * limit),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  public static async getPurchaseOrder(tenantId: string, poId: string): Promise<PurchaseOrderRecord> {
    if (this.isTest()) {
      const found = testPoStore.get(`${tenantId}:${poId}`);
      if (!found) throw new NotFoundError(`Purchase order '${poId}' not found.`);
      return { ...found, items: found.items.map((i) => ({ ...i })) };
    }
    const snap = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('purchaseOrders')
      .doc(poId)
      .get();
    if (!snap.exists) {
      throw new NotFoundError(`Purchase order '${poId}' not found.`);
    }
    return snap.data() as PurchaseOrderRecord;
  }

  public static async createPurchaseOrder(
    tenantId: string,
    branchId: string,
    input: CreatePurchaseOrderInput,
    userId: string
  ): Promise<PurchaseOrderRecord> {
    if (!input.items || input.items.length === 0) {
      throw new BadRequestError('Purchase order must contain at least one medicine line item.');
    }

    const supplier = await SupplierService.getRawSupplier(tenantId, input.supplierId);
    this.assertSupplierActiveForNewCommitment(supplier);

    const tenantProfile = await this.resolveTenantProfile(tenantId);
    const supplierStateCode = supplier.stateCode || supplier.gstin?.slice(0, 2) || tenantProfile.stateCode;
    const placeOfSupplyStateCode = input.placeOfSupplyStateCode || supplierStateCode;
    const isInterState =
      input.isInterState !== undefined
        ? Boolean(input.isInterState)
        : tenantProfile.stateCode !== placeOfSupplyStateCode;

    // Resolve medicines from existing Phase 5 catalogue
    const resolvedItems = await Promise.all(
      input.items.map(async (item, idx) => {
        if (!Number.isInteger(item.orderedQuantity) || item.orderedQuantity <= 0) {
          throw new BadRequestError(`Line ${idx + 1}: orderedQuantity must be a positive integer.`);
        }
        if (item.unitCost < 0) {
          throw new BadRequestError(`Line ${idx + 1}: unitCost cannot be negative.`);
        }
        const med = await MedicineService.getMedicine(tenantId, item.medicineId);
        if (med.status === 'archived') {
          throw new BadRequestError(`Medicine '${med.name}' is archived and cannot be ordered.`);
        }
        return {
          raw: item,
          med,
        };
      })
    );

    const gstSummary = computeLineAndHeaderGst(
      resolvedItems.map((r) => ({
        quantity: r.raw.orderedQuantity,
        unitCost: r.raw.unitCost,
        discountPercent: r.raw.discountPercent,
        discountAmount: r.raw.discountAmount,
        gstRate: r.raw.gstRate ?? r.med.gstRate ?? 12,
      })),
      isInterState,
      input.invoiceDiscount || 0,
      input.otherCharges || 0
    );

    const now = new Date().toISOString();
    const poId = `po_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const existingAll = await this.listPurchaseOrders(tenantId, undefined, { page: 1, limit: 1 });
    const poNumber = `PO-${new Date().getFullYear()}-${String(existingAll.total + 1).padStart(4, '0')}`;

    const lines: PurchaseOrderLineItem[] = resolvedItems.map((r, idx) => {
      const calc = gstSummary.lineResults[idx]!;
      const freeQuantity = Math.max(0, Math.round(r.raw.freeQuantity || 0));
      return {
        id: `poi_${idx + 1}_${crypto.randomBytes(3).toString('hex')}`,
        medicineId: r.med.id,
        medicineName: r.med.name,
        genericName: r.med.genericName,
        brand: r.med.brand,
        packSize: r.med.packSize,
        hsnCode: r.raw.hsnCode?.trim() || r.med.hsnCode || '300490',
        orderedQuantity: r.raw.orderedQuantity,
        freeQuantity,
        receivedQuantity: 0,
        rejectedQuantity: 0,
        pendingQuantity: r.raw.orderedQuantity,
        unitCost: roundPaise(r.raw.unitCost),
        mrp: r.raw.mrp !== undefined && r.raw.mrp !== null ? roundPaise(r.raw.mrp) : null,
        discountPercent: Number(r.raw.discountPercent || 0),
        discountAmount: calc.discountAmount,
        taxableAmount: calc.taxableAmount,
        gstRate: r.raw.gstRate ?? r.med.gstRate ?? 12,
        cgst: calc.cgst,
        sgst: calc.sgst,
        igst: calc.igst,
        lineTotal: calc.lineTotal,
      };
    });

    const totalOrderedQty = lines.reduce((s, l) => s + l.orderedQuantity, 0);
    const status: PurchaseOrderStatus = input.submitImmediately ? 'PENDING_APPROVAL' : 'DRAFT';

    const po: PurchaseOrderRecord = {
      id: poId,
      poId,
      poNumber,
      tenantId,
      branchId,
      supplierId: supplier.id,
      supplierCode: supplier.supplierCode,
      supplierName: supplier.tradeName,
      supplierGstin: supplier.gstin || null,
      supplierStateCode,
      tenantStateCode: tenantProfile.stateCode,
      placeOfSupplyStateCode,
      isInterState,
      orderDate: input.orderDate || now,
      expectedDeliveryDate: input.expectedDeliveryDate || null,
      status,
      items: lines,
      subtotal: gstSummary.subtotal,
      totalDiscount: gstSummary.totalDiscount,
      invoiceDiscount: gstSummary.invoiceDiscount,
      otherCharges: gstSummary.otherCharges,
      taxableAmount: gstSummary.taxableAmount,
      cgst: gstSummary.cgst,
      sgst: gstSummary.sgst,
      igst: gstSummary.igst,
      totalTax: gstSummary.totalTax,
      roundOff: gstSummary.roundOff,
      grandTotal: gstSummary.grandTotal,
      totalOrderedQty,
      totalReceivedQty: 0,
      totalPendingQty: totalOrderedQty,
      paymentTerms: input.paymentTerms?.trim() || supplier.paymentTerms,
      notes: input.notes?.trim() || null,
      submittedBy: input.submitImmediately ? userId : null,
      submittedAt: input.submitImmediately ? now : null,
      approvedBy: null,
      approvedAt: null,
      cancelledBy: null,
      cancelledAt: null,
      cancellationReason: null,
      closedBy: null,
      closedAt: null,
      closureReason: null,
      createdBy: userId,
      createdAt: now,
      updatedBy: userId,
      updatedAt: now,
    };

    if (this.isTest()) {
      testPoStore.set(`${tenantId}:${poId}`, po);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('purchaseOrders')
        .doc(poId)
        .set(po);
    }

    await AuditService.log({
      tenantId,
      actingUserId: userId,
      action: 'PURCHASE_ORDER_CREATED',
      metadata: {
        entityType: 'purchaseOrder',
        entityId: poId,
        branchId,
        poNumber,
        supplierId: supplier.id,
        grandTotal: po.grandTotal,
        status: po.status,
      },
    });

    return po;
  }

  public static async updatePurchaseOrder(
    tenantId: string,
    poId: string,
    input: Partial<CreatePurchaseOrderInput>,
    userId: string
  ): Promise<PurchaseOrderRecord> {
    return withTestProcurementLock(tenantId, `po:${poId}`, async () => {
      const existing = await this.getPurchaseOrder(tenantId, poId);
      if (existing.status !== 'DRAFT' && existing.status !== 'PENDING_APPROVAL') {
        throw new BadRequestError(
          `Cannot edit Purchase Order '${existing.poNumber}' while status is '${existing.status}'.`
        );
      }

      const supplierId = input.supplierId || existing.supplierId;
      const supplier = await SupplierService.getRawSupplier(tenantId, supplierId);
      this.assertSupplierActiveForNewCommitment(supplier);

      const tenantProfile = await this.resolveTenantProfile(tenantId);
      const supplierStateCode = supplier.stateCode || supplier.gstin?.slice(0, 2) || tenantProfile.stateCode;
      const placeOfSupplyStateCode = input.placeOfSupplyStateCode || existing.placeOfSupplyStateCode || supplierStateCode;
      const isInterState =
        input.isInterState !== undefined
          ? Boolean(input.isInterState)
          : tenantProfile.stateCode !== placeOfSupplyStateCode;

      const sourceItems =
        input.items ||
        existing.items.map((i) => ({
          medicineId: i.medicineId,
          orderedQuantity: i.orderedQuantity,
          freeQuantity: i.freeQuantity,
          unitCost: i.unitCost,
          mrp: i.mrp,
          discountPercent: i.discountPercent,
          discountAmount: undefined as number | undefined,
          gstRate: i.gstRate,
          hsnCode: i.hsnCode,
        }));

      const resolvedItems = await Promise.all(
        sourceItems.map(async (item, idx) => {
          if (!Number.isInteger(item.orderedQuantity) || item.orderedQuantity <= 0) {
            throw new BadRequestError(`Line ${idx + 1}: orderedQuantity must be positive.`);
          }
          const med = await MedicineService.getMedicine(tenantId, item.medicineId);
          return { raw: item, med };
        })
      );

      const gstSummary = computeLineAndHeaderGst(
        resolvedItems.map((r) => ({
          quantity: r.raw.orderedQuantity,
          unitCost: r.raw.unitCost,
          discountPercent: r.raw.discountPercent,
          discountAmount: r.raw.discountAmount,
          gstRate: r.raw.gstRate ?? r.med.gstRate ?? 12,
        })),
        isInterState,
        input.invoiceDiscount !== undefined ? input.invoiceDiscount : existing.invoiceDiscount,
        input.otherCharges !== undefined ? input.otherCharges : existing.otherCharges
      );

      const lines: PurchaseOrderLineItem[] = resolvedItems.map((r, idx) => {
        const calc = gstSummary.lineResults[idx]!;
        return {
          id: existing.items[idx]?.id || `poi_${idx + 1}_${crypto.randomBytes(3).toString('hex')}`,
          medicineId: r.med.id,
          medicineName: r.med.name,
          genericName: r.med.genericName,
          brand: r.med.brand,
          packSize: r.med.packSize,
          hsnCode: r.raw.hsnCode?.trim() || r.med.hsnCode || '300490',
          orderedQuantity: r.raw.orderedQuantity,
          freeQuantity: Math.max(0, Math.round(r.raw.freeQuantity || 0)),
          receivedQuantity: 0,
          rejectedQuantity: 0,
          pendingQuantity: r.raw.orderedQuantity,
          unitCost: roundPaise(r.raw.unitCost),
          mrp: r.raw.mrp !== undefined && r.raw.mrp !== null ? roundPaise(r.raw.mrp) : null,
          discountPercent: Number(r.raw.discountPercent || 0),
          discountAmount: calc.discountAmount,
          taxableAmount: calc.taxableAmount,
          gstRate: r.raw.gstRate ?? r.med.gstRate ?? 12,
          cgst: calc.cgst,
          sgst: calc.sgst,
          igst: calc.igst,
          lineTotal: calc.lineTotal,
        };
      });

      const totalOrderedQty = lines.reduce((s, l) => s + l.orderedQuantity, 0);
      const now = new Date().toISOString();
      const updated: PurchaseOrderRecord = {
        ...existing,
        supplierId: supplier.id,
        supplierCode: supplier.supplierCode,
        supplierName: supplier.tradeName,
        supplierGstin: supplier.gstin || null,
        supplierStateCode,
        placeOfSupplyStateCode,
        isInterState,
        expectedDeliveryDate:
          input.expectedDeliveryDate !== undefined
            ? input.expectedDeliveryDate
            : existing.expectedDeliveryDate,
        paymentTerms: input.paymentTerms?.trim() || existing.paymentTerms,
        notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
        items: lines,
        subtotal: gstSummary.subtotal,
        totalDiscount: gstSummary.totalDiscount,
        invoiceDiscount: gstSummary.invoiceDiscount,
        otherCharges: gstSummary.otherCharges,
        taxableAmount: gstSummary.taxableAmount,
        cgst: gstSummary.cgst,
        sgst: gstSummary.sgst,
        igst: gstSummary.igst,
        totalTax: gstSummary.totalTax,
        roundOff: gstSummary.roundOff,
        grandTotal: gstSummary.grandTotal,
        totalOrderedQty,
        totalPendingQty: totalOrderedQty,
        updatedBy: userId,
        updatedAt: now,
      };

      if (this.isTest()) {
        testPoStore.set(`${tenantId}:${poId}`, updated);
      } else {
        await firestore()
          .collection('tenants')
          .doc(tenantId)
          .collection('purchaseOrders')
          .doc(poId)
          .set(updated);
      }

      return updated;
    });
  }

  public static async submitPurchaseOrder(
    tenantId: string,
    poId: string,
    userId: string
  ): Promise<PurchaseOrderRecord> {
    return withTestProcurementLock(tenantId, `po:${poId}`, async () => {
      const po = await this.getPurchaseOrder(tenantId, poId);
      if (po.status !== 'DRAFT') {
        throw new BadRequestError(`Only DRAFT purchase orders can be submitted. Current status: ${po.status}`);
      }
      const supplier = await SupplierService.getRawSupplier(tenantId, po.supplierId);
      this.assertSupplierActiveForNewCommitment(supplier);

      const now = new Date().toISOString();
      const updated: PurchaseOrderRecord = {
        ...po,
        status: 'PENDING_APPROVAL',
        submittedBy: userId,
        submittedAt: now,
        updatedBy: userId,
        updatedAt: now,
      };

      if (this.isTest()) {
        testPoStore.set(`${tenantId}:${poId}`, updated);
      } else {
        await firestore().collection('tenants').doc(tenantId).collection('purchaseOrders').doc(poId).set(updated);
      }
      return updated;
    });
  }

  public static async approvePurchaseOrder(
    tenantId: string,
    poId: string,
    userId: string
  ): Promise<PurchaseOrderRecord> {
    return withTestProcurementLock(tenantId, `po:${poId}`, async () => {
      const po = await this.getPurchaseOrder(tenantId, poId);
      if (po.status !== 'DRAFT' && po.status !== 'PENDING_APPROVAL') {
        throw new ConflictError(
          `Purchase order '${po.poNumber}' cannot be approved because its status is already '${po.status}'.`
        );
      }
      const supplier = await SupplierService.getRawSupplier(tenantId, po.supplierId);
      this.assertSupplierActiveForNewCommitment(supplier);

      const now = new Date().toISOString();
      const updated: PurchaseOrderRecord = {
        ...po,
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: now,
        updatedBy: userId,
        updatedAt: now,
      };

      if (this.isTest()) {
        testPoStore.set(`${tenantId}:${poId}`, updated);
      } else {
        const db = firestore();
        const poRef = db.collection('tenants').doc(tenantId).collection('purchaseOrders').doc(poId);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(poRef);
          if (!snap.exists) {
            throw new NotFoundError(`Purchase order '${poId}' not found.`);
          }
          const latest = snap.data() as PurchaseOrderRecord;
          if (latest.status !== 'DRAFT' && latest.status !== 'PENDING_APPROVAL') {
            throw new ConflictError(
              `Purchase order '${latest.poNumber}' cannot be approved because its status is already '${latest.status}'.`
            );
          }
          tx.set(poRef, {
            ...latest,
            status: 'APPROVED',
            approvedBy: userId,
            approvedAt: now,
            updatedBy: userId,
            updatedAt: now,
          });
        });
      }

      await AuditService.log({
        tenantId,
        actingUserId: userId,
        action: 'PURCHASE_ORDER_APPROVED',
        metadata: {
          entityType: 'purchaseOrder',
          entityId: poId,
          poNumber: po.poNumber,
          supplierId: po.supplierId,
          grandTotal: po.grandTotal,
        },
      });

      return updated;
    });
  }

  public static async cancelPurchaseOrder(
    tenantId: string,
    poId: string,
    reason: string,
    userId: string
  ): Promise<PurchaseOrderRecord> {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestError('Cancellation reason (minimum 3 characters) is required.');
    }

    return withTestProcurementLock(tenantId, `po:${poId}`, async () => {
      const po = await this.getPurchaseOrder(tenantId, poId);
      if (po.status === 'CANCELLED') {
        throw new ConflictError(`Purchase order '${po.poNumber}' is already cancelled.`);
      }
      if (po.totalReceivedQty > 0 || po.status === 'PARTIALLY_RECEIVED' || po.status === 'FULLY_RECEIVED') {
        throw new BadRequestError(
          `Cannot cancel PO '${po.poNumber}' after stock has already been received. Use Close PO instead.`
        );
      }

      const now = new Date().toISOString();
      const updated: PurchaseOrderRecord = {
        ...po,
        status: 'CANCELLED',
        cancelledBy: userId,
        cancelledAt: now,
        cancellationReason: reason.trim(),
        updatedBy: userId,
        updatedAt: now,
      };

      if (this.isTest()) {
        testPoStore.set(`${tenantId}:${poId}`, updated);
      } else {
        await firestore().collection('tenants').doc(tenantId).collection('purchaseOrders').doc(poId).set(updated);
      }

      await AuditService.log({
        tenantId,
        actingUserId: userId,
        action: 'PURCHASE_ORDER_CANCELLED',
        metadata: {
          entityType: 'purchaseOrder',
          entityId: poId,
          poNumber: po.poNumber,
          reason: reason.trim(),
        },
      });

      return updated;
    });
  }

  public static async closePurchaseOrder(
    tenantId: string,
    poId: string,
    reason: string | undefined,
    userId: string
  ): Promise<PurchaseOrderRecord> {
    return withTestProcurementLock(tenantId, `po:${poId}`, async () => {
      const po = await this.getPurchaseOrder(tenantId, poId);
      if (po.status === 'DRAFT' || po.status === 'CANCELLED') {
        throw new BadRequestError(`Cannot close Purchase Order in '${po.status}' state.`);
      }
      const now = new Date().toISOString();
      const updated: PurchaseOrderRecord = {
        ...po,
        status: 'CLOSED',
        closedBy: userId,
        closedAt: now,
        closureReason: reason?.trim() || 'Short-closed after partial delivery',
        updatedBy: userId,
        updatedAt: now,
      };

      if (this.isTest()) {
        testPoStore.set(`${tenantId}:${poId}`, updated);
      } else {
        await firestore().collection('tenants').doc(tenantId).collection('purchaseOrders').doc(poId).set(updated);
      }

      await AuditService.log({
        tenantId,
        actingUserId: userId,
        action: 'PURCHASE_ORDER_CLOSED',
        metadata: {
          entityType: 'purchaseOrder',
          entityId: poId,
          poNumber: po.poNumber,
          reason: updated.closureReason,
        },
      });
      return updated;
    });
  }

  public static async getPurchaseOrderPrint(tenantId: string, poId: string) {
    const po = await this.getPurchaseOrder(tenantId, poId);
    const [supplier, tenantProfile] = await Promise.all([
      SupplierService.getRawSupplier(tenantId, po.supplierId),
      this.resolveTenantProfile(tenantId),
    ]);
    return {
      documentTitle: 'PURCHASE ORDER',
      tenant: tenantProfile,
      supplier: {
        tradeName: supplier.tradeName,
        legalName: supplier.legalName,
        supplierCode: supplier.supplierCode,
        gstin: supplier.gstin,
        drugLicenceNumber: supplier.drugLicenceNumber,
        address: supplier.billingAddress,
        state: supplier.state,
        stateCode: supplier.stateCode,
        phone: supplier.primaryPhone,
        email: supplier.email,
      },
      purchaseOrder: po,
    };
  }

  // =========================================================================
  // GOODS RECEIPT NOTES (GRN)
  // =========================================================================

  public static async listGrns(
    tenantId: string,
    branchId: string | undefined,
    options: {
      poId?: string;
      supplierId?: string;
      status?: GrnStatus;
      fromDate?: string;
      toDate?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    let items: GoodsReceiptRecord[] = [];
    if (this.isTest()) {
      items = getTestGrnsForTenant(tenantId).map((g) => ({ ...g }));
    } else {
      const snap = await firestore().collection('tenants').doc(tenantId).collection('goodsReceipts').get();
      items = snap.docs.map((d) => d.data() as GoodsReceiptRecord);
    }

    if (branchId && branchId !== 'all') {
      items = items.filter((g) => g.branchId === branchId);
    }
    if (options.poId) items = items.filter((g) => g.poId === options.poId);
    if (options.supplierId) items = items.filter((g) => g.supplierId === options.supplierId);
    if (options.status) items = items.filter((g) => g.status === options.status);
    if (options.fromDate) items = items.filter((g) => g.receiptDate >= options.fromDate!);
    if (options.toDate) items = items.filter((g) => g.receiptDate <= `${options.toDate!}T23:59:59.999Z`);

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));
    const total = items.length;

    return {
      goodsReceipts: items.slice((page - 1) * limit, page * limit),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  public static async getGrn(tenantId: string, grnId: string): Promise<GoodsReceiptRecord> {
    if (this.isTest()) {
      const found = testGrnStore.get(`${tenantId}:${grnId}`);
      if (!found) throw new NotFoundError(`Goods receipt note '${grnId}' not found.`);
      return { ...found, items: found.items.map((i) => ({ ...i })) };
    }
    const snap = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('goodsReceipts')
      .doc(grnId)
      .get();
    if (!snap.exists) {
      throw new NotFoundError(`Goods receipt note '${grnId}' not found.`);
    }
    return snap.data() as GoodsReceiptRecord;
  }

  public static async getGrnPrint(tenantId: string, grnId: string) {
    const grn = await this.getGrn(tenantId, grnId);
    const [supplier, tenantProfile] = await Promise.all([
      SupplierService.getRawSupplier(tenantId, grn.supplierId),
      this.resolveTenantProfile(tenantId),
    ]);
    return {
      documentTitle: 'GOODS RECEIPT NOTE (GRN)',
      tenant: tenantProfile,
      supplier: {
        tradeName: supplier.tradeName,
        legalName: supplier.legalName,
        supplierCode: supplier.supplierCode,
        gstin: supplier.gstin,
        phone: supplier.primaryPhone,
        address: supplier.billingAddress,
      },
      grn,
    };
  }

  public static async createAndPostGrn(
    tenantId: string,
    branchId: string,
    input: CreateGrnInput,
    idempotencyKey: string,
    userId: string,
    viewer?: SupplierViewerAccess
  ): Promise<{
    grn: GoodsReceiptRecord;
    purchaseOrder?: PurchaseOrderRecord | null;
    batches: InventoryBatchRecord[];
    invoice?: SupplierInvoiceRecord | null;
    idempotentReplay: boolean;
  }> {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestError('Idempotency-Key header (min 8 chars) is required for GRN posting.');
    }
    const cleanKey = idempotencyKey.trim();
    const requestHash = hashRequest({ branchId, ...input });

    if (!input.items || input.items.length === 0) {
      throw new BadRequestError('GRN must include at least one received batch item.');
    }

    // Lock hierarchy: procurement(po/branch) -> branch inventory -> supplier
    const lockKey = input.poId ? `po:${input.poId}` : `branch:${branchId}`;
    return withTestProcurementLock(tenantId, lockKey, async () =>
      withTestBranchInventoryLock(tenantId, branchId, async () => {
        // 1. Check idempotency key first
        if (this.isTest()) {
          const existingIdem = testIdempotencyStore.get(`${tenantId}:grn:${cleanKey}`);
          if (existingIdem) {
            if (existingIdem.requestHash !== requestHash) {
              throw new IdempotencyConflictError(
                'Idempotency-Key was already used with a different GRN payload.'
              );
            }
            return { ...existingIdem.response, idempotentReplay: true };
          }
        } else {
          const idemSnap = await firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('idempotency_keys')
            .doc(`grn_${cleanKey}`)
            .get();
          if (idemSnap.exists) {
            const data = idemSnap.data() as { requestHash: string; response: any };
            if (data.requestHash !== requestHash) {
              throw new IdempotencyConflictError(
                'Idempotency-Key was already used with a different GRN payload.'
              );
            }
            return { ...data.response, idempotentReplay: true };
          }
        }

        // 2. Load & validate PO if poId supplied
        let po: PurchaseOrderRecord | null = null;
        if (input.poId) {
          po = await this.getPurchaseOrder(tenantId, input.poId);
          if (po.status !== 'APPROVED' && po.status !== 'PARTIALLY_RECEIVED') {
            throw new BadRequestError(
              `Cannot create GRN against Purchase Order '${po.poNumber}' in '${po.status}' status. Only APPROVED or PARTIALLY_RECEIVED POs can receive stock.`
            );
          }
          if (po.branchId !== branchId) {
            throw new BadRequestError(
              `PO '${po.poNumber}' belongs to branch '${po.branchId}', not '${branchId}'.`
            );
          }
        }

        const supplierId = po ? po.supplierId : input.supplierId;
        if (!supplierId) {
          throw new BadRequestError('Either poId or supplierId is required for a Goods Receipt Note.');
        }

        const supplier = await SupplierService.getRawSupplier(tenantId, supplierId);
        if (!po) {
          this.assertSupplierActiveForNewCommitment(supplier);
        } else if (supplier.status === 'BLOCKED') {
          throw new BadRequestError(`Supplier '${supplier.tradeName}' is currently BLOCKED.`);
        }

        const tenantProfile = await this.resolveTenantProfile(tenantId);
        const supplierStateCode = supplier.stateCode || supplier.gstin?.slice(0, 2) || tenantProfile.stateCode;
        const placeOfSupplyStateCode =
          input.placeOfSupplyStateCode || po?.placeOfSupplyStateCode || supplierStateCode;
        const isInterState =
          input.isInterState !== undefined
            ? Boolean(input.isInterState)
            : po
            ? po.isInterState
            : tenantProfile.stateCode !== placeOfSupplyStateCode;

        const shortExpiryThresholdDays = Math.max(
          1,
          Math.round(input.shortExpiryWarningDays ?? 90)
        );
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        const canOverReceipt =
          Boolean(input.allowOverReceipt) &&
          (!viewer ||
            viewer.role === 'owner' ||
            viewer.permissions.includes('*') ||
            viewer.permissions.includes('goods_receipts.correct'));

        if (input.allowOverReceipt && !canOverReceipt) {
          throw new ForbiddenError(
            'Missing required permission(s): [goods_receipts.correct] to authorize over-receipt.'
          );
        }

        // 3. Validate each batch line + aggregate accepted per poItem/medicine
        const acceptedByPoLine = new Map<string, number>();
        const rejectedByPoLine = new Map<string, number>();
        const warnings: GrnWarning[] = [];
        const resolvedLines: Array<{
          inputLine: GrnItemBatchInput;
          med: Awaited<ReturnType<typeof MedicineService.getMedicine>>;
          poLine?: PurchaseOrderLineItem;
          receivedQty: number;
          acceptedQty: number;
          rejectedQty: number;
          freeQty: number;
          shortExpiryWarning: boolean;
          daysToExpiry: number;
          sellingPrice: number;
        }> = [];

        for (let idx = 0; idx < input.items.length; idx++) {
          const item = input.items[idx]!;
          if (!item.batchNumber?.trim()) {
            throw new BadRequestError(`Item ${idx + 1}: batchNumber is required.`);
          }
          if (!item.expiryDate?.trim()) {
            throw new BadRequestError(`Item ${idx + 1}: expiryDate is required.`);
          }
          if (!Number.isInteger(item.acceptedQuantity) || item.acceptedQuantity < 0) {
            throw new BadRequestError(`Item ${idx + 1}: acceptedQuantity must be a non-negative integer.`);
          }
          const rejectedQty = item.rejectedQuantity !== undefined ? item.rejectedQuantity : 0;
          if (!Number.isInteger(rejectedQty) || rejectedQty < 0) {
            throw new BadRequestError(`Item ${idx + 1}: rejectedQuantity must be a non-negative integer.`);
          }
          const expectedReceived =
            item.receivedQuantity !== undefined
              ? item.receivedQuantity
              : item.acceptedQuantity + rejectedQty;
          if (expectedReceived <= 0) {
            throw new BadRequestError(`Item ${idx + 1}: received quantity must be greater than zero.`);
          }
          if (item.acceptedQuantity + rejectedQty !== expectedReceived) {
            throw new BadRequestError(
              `Item ${idx + 1}: acceptedQuantity (${item.acceptedQuantity}) + rejectedQuantity (${rejectedQty}) must equal receivedQuantity (${expectedReceived}).`
            );
          }
          if (rejectedQty > 0 && !item.rejectionReason?.trim()) {
            throw new BadRequestError(
              `Item ${idx + 1}: rejectionReason is required when rejectedQuantity > 0.`
            );
          }
          if (item.purchasePrice < 0 || item.mrp < 0) {
            throw new BadRequestError(`Item ${idx + 1}: purchasePrice and MRP must be non-negative.`);
          }
          if (item.mrp < item.purchasePrice) {
            throw new BadRequestError(
              `Item ${idx + 1}: MRP (₹${item.mrp}) cannot be lower than purchase price PTR (₹${item.purchasePrice}).`
            );
          }

          const expDate = parseDateValue(item.expiryDate);
          if (item.manufacturingDate?.trim()) {
            const mfgDate = parseDateValue(item.manufacturingDate);
            if (mfgDate.getTime() > Date.now()) {
              throw new BadRequestError(
                `Item ${idx + 1}: manufacturingDate '${item.manufacturingDate}' cannot be in the future.`
              );
            }
            if (mfgDate.getTime() > expDate.getTime()) {
              throw new BadRequestError(
                `Item ${idx + 1}: manufacturingDate '${item.manufacturingDate}' cannot be later than expiryDate '${item.expiryDate}'.`
              );
            }
          }

          const daysToExpiry = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (expDate.getTime() < today.getTime() && item.acceptedQuantity > 0) {
            throw new BadRequestError(
              `Expired batch '${item.batchNumber}' (expiry ${item.expiryDate}) cannot be accepted into saleable stock.`
            );
          }

          const med = await MedicineService.getMedicine(tenantId, item.medicineId);
          let poLine: PurchaseOrderLineItem | undefined;
          if (po) {
            poLine = item.poItemId
              ? po.items.find((l) => l.id === item.poItemId)
              : po.items.find((l) => l.medicineId === item.medicineId);
            if (!poLine) {
              throw new BadRequestError(
                `Medicine '${med.name}' is not present on Purchase Order '${po.poNumber}'.`
              );
            }
            acceptedByPoLine.set(
              poLine.id,
              (acceptedByPoLine.get(poLine.id) || 0) + item.acceptedQuantity
            );
            rejectedByPoLine.set(
              poLine.id,
              (rejectedByPoLine.get(poLine.id) || 0) + rejectedQty
            );
          }

          const shortExpiryWarning = item.acceptedQuantity > 0 && daysToExpiry <= shortExpiryThresholdDays;
          if (shortExpiryWarning) {
            warnings.push({
              medicineId: med.id,
              medicineName: med.name,
              batchNumber: item.batchNumber.trim(),
              expiryDate: item.expiryDate.trim(),
              daysRemaining: daysToExpiry,
              message: `Short-expiry batch '${item.batchNumber.trim()}' for ${med.name} expires in ${daysToExpiry} days (threshold ${shortExpiryThresholdDays}d).`,
            });
          }

          resolvedLines.push({
            inputLine: item,
            med,
            poLine,
            receivedQty: expectedReceived,
            acceptedQty: item.acceptedQuantity,
            rejectedQty,
            freeQty: Math.max(0, Math.round(item.freeQuantity || 0)),
            shortExpiryWarning,
            daysToExpiry,
            sellingPrice: roundPaise(item.sellingPrice ?? item.mrp),
          });
        }

        // 4. Enforce PO pending limits against cumulative accepted qty
        if (po) {
          for (const [poLineId, addAccepted] of acceptedByPoLine.entries()) {
            const line = po.items.find((l) => l.id === poLineId)!;
            const cumulative = line.receivedQuantity + addAccepted;
            if (cumulative > line.orderedQuantity && !canOverReceipt) {
              throw new BadRequestError(
                `Over-receipt blocked for '${line.medicineName}': ordered ${line.orderedQuantity}, already received ${line.receivedQuantity}, attempting +${addAccepted} (pending ${line.pendingQuantity}).`
              );
            }
          }
        }

        // 5. Calculate financial totals on ACCEPTED quantities (rejected items never billed/stocked)
        const gstSummary = computeLineAndHeaderGst(
          resolvedLines.map((r) => ({
            quantity: r.acceptedQty,
            unitCost: r.inputLine.purchasePrice,
            discountPercent: r.inputLine.discountPercent ?? r.poLine?.discountPercent ?? 0,
            discountAmount: r.inputLine.discountAmount,
            gstRate: r.inputLine.gstRate ?? r.poLine?.gstRate ?? r.med.gstRate ?? 12,
          })),
          isInterState,
          input.invoiceDiscount || 0,
          input.otherCharges || 0
        );

        const now = new Date().toISOString();
        const grnId = `grn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const existingGrns = await this.listGrns(tenantId, undefined, { page: 1, limit: 1 });
        const grnNumber = `GRN-${new Date().getFullYear()}-${String(existingGrns.total + 1).padStart(4, '0')}`;
        const operationId = `pop_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        const operationRecord: PurchaseOperationRecord = {
          id: operationId,
          tenantId,
          branchId,
          operationType: 'POST_GRN',
          targetId: grnId,
          idempotencyKey: cleanKey,
          status: 'STARTED',
          performedBy: userId,
          startedAt: now,
        };

        const createdBatches: InventoryBatchRecord[] = [];
        const createdMovements: StockMovementRecord[] = [];
        const grnItems: GrnBatchLine[] = [];

        for (let idx = 0; idx < resolvedLines.length; idx++) {
          const r = resolvedLines[idx]!;
          const calc = gstSummary.lineResults[idx]!;
          const totalAddToStock = r.acceptedQty + r.freeQty;
          let inventoryBatchId: string | null = null;

          if (totalAddToStock > 0) {
            const batchId = `bat_${Date.now()}_${idx}_${crypto.randomBytes(3).toString('hex')}`;
            inventoryBatchId = batchId;
            const batchStatus = InventoryService.computeBatchStatus(
              totalAddToStock,
              r.inputLine.expiryDate.trim(),
              r.med.minStockThreshold,
              shortExpiryThresholdDays
            );

            const batchRecord: InventoryBatchRecord = {
              id: batchId,
              tenantId,
              branchId,
              medicineId: r.med.id,
              medicineName: r.med.name,
              genericName: r.med.genericName,
              batchNumber: r.inputLine.batchNumber.trim(),
              manufacturingDate: r.inputLine.manufacturingDate?.trim() || null,
              expiryDate: r.inputLine.expiryDate.trim(),
              purchasePrice: roundPaise(r.inputLine.purchasePrice),
              mrp: roundPaise(r.inputLine.mrp),
              sellingPrice: r.sellingPrice,
              quantityReceived: totalAddToStock,
              currentStock: totalAddToStock,
              freeQuantity: r.freeQty,
              supplierId: supplier.id,
              supplierName: supplier.tradeName,
              purchaseReferenceId: grnId,
              rackLocation: r.inputLine.rackLocation?.trim() || null,
              barcode: r.inputLine.barcode?.trim() || r.med.barcode || null,
              status: batchStatus,
              createdAt: now,
              updatedAt: now,
            };
            createdBatches.push(batchRecord);

            const movementRecord: StockMovementRecord = {
              id: `mov_${Date.now()}_${idx}_${crypto.randomBytes(3).toString('hex')}`,
              tenantId,
              branchId,
              medicineId: r.med.id,
              batchId,
              batchNumber: batchRecord.batchNumber,
              medicineName: r.med.name,
              movementType: 'PURCHASE_RECEIPT',
              quantityChange: totalAddToStock,
              previousQuantity: 0,
              newQuantity: totalAddToStock,
              referenceType: 'goods_receipt',
              referenceId: grnId,
              reason: `GRN ${grnNumber} (${supplier.tradeName})${r.rejectedQty > 0 ? ` [${r.rejectedQty} rejected]` : ''}`,
              performedBy: userId,
              timestamp: now,
            };
            createdMovements.push(movementRecord);
          }

          grnItems.push({
            id: `grni_${idx + 1}_${crypto.randomBytes(3).toString('hex')}`,
            poItemId: r.poLine?.id || null,
            medicineId: r.med.id,
            medicineName: r.med.name,
            genericName: r.med.genericName,
            hsnCode: r.poLine?.hsnCode || r.med.hsnCode || '300490',
            batchNumber: r.inputLine.batchNumber.trim(),
            manufacturingDate: r.inputLine.manufacturingDate?.trim() || null,
            expiryDate: r.inputLine.expiryDate.trim(),
            receivedQuantity: r.receivedQty,
            acceptedQuantity: r.acceptedQty,
            rejectedQuantity: r.rejectedQty,
            freeQuantity: r.freeQty,
            rejectionReason: r.inputLine.rejectionReason?.trim() || null,
            purchasePrice: roundPaise(r.inputLine.purchasePrice),
            mrp: roundPaise(r.inputLine.mrp),
            sellingPrice: r.sellingPrice,
            discountPercent: Number(r.inputLine.discountPercent ?? r.poLine?.discountPercent ?? 0),
            discountAmount: calc.discountAmount,
            taxableAmount: calc.taxableAmount,
            gstRate: r.inputLine.gstRate ?? r.poLine?.gstRate ?? r.med.gstRate ?? 12,
            cgst: calc.cgst,
            sgst: calc.sgst,
            igst: calc.igst,
            lineTotal: calc.lineTotal,
            rackLocation: r.inputLine.rackLocation?.trim() || null,
            barcode: r.inputLine.barcode?.trim() || r.med.barcode || null,
            inventoryBatchId,
            shortExpiryWarning: r.shortExpiryWarning,
            daysToExpiry: r.daysToExpiry,
          });
        }

        // 6. Update Purchase Order progress
        let updatedPo: PurchaseOrderRecord | null = null;
        if (po) {
          const nextLines = po.items.map((line) => {
            const addAcc = acceptedByPoLine.get(line.id) || 0;
            const addRej = rejectedByPoLine.get(line.id) || 0;
            const nextRec = line.receivedQuantity + addAcc;
            const nextRej = line.rejectedQuantity + addRej;
            const nextPend = Math.max(0, line.orderedQuantity - nextRec);
            return {
              ...line,
              receivedQuantity: nextRec,
              rejectedQuantity: nextRej,
              pendingQuantity: nextPend,
            };
          });
          const totalReceivedQty = nextLines.reduce((s, l) => s + l.receivedQuantity, 0);
          const totalPendingQty = nextLines.reduce((s, l) => s + l.pendingQuantity, 0);
          const nextStatus: PurchaseOrderStatus =
            totalPendingQty === 0 ? 'FULLY_RECEIVED' : totalReceivedQty > 0 ? 'PARTIALLY_RECEIVED' : po.status;

          updatedPo = {
            ...po,
            items: nextLines,
            totalReceivedQty,
            totalPendingQty,
            status: nextStatus,
            updatedBy: userId,
            updatedAt: now,
          };
        }

        // 7. Build GRN record
        let linkedInvoice: SupplierInvoiceRecord | null = null;
        let invoiceId: string | null = null;
        if (input.autoCreateSupplierInvoice) {
          if (!input.supplierInvoiceNumber?.trim()) {
            throw new BadRequestError(
              'supplierInvoiceNumber is required when autoCreateSupplierInvoice is enabled.'
            );
          }
          invoiceId = `sinv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        }

        const grnRecord: GoodsReceiptRecord = {
          id: grnId,
          grnId,
          grnNumber,
          tenantId,
          branchId,
          poId: po?.id || null,
          poNumber: po?.poNumber || null,
          supplierId: supplier.id,
          supplierCode: supplier.supplierCode,
          supplierName: supplier.tradeName,
          supplierGstin: supplier.gstin || null,
          supplierInvoiceNumber: input.supplierInvoiceNumber?.trim() || null,
          supplierInvoiceDate: input.supplierInvoiceDate || null,
          receiptDate: input.receiptDate || now,
          placeOfSupplyStateCode,
          isInterState,
          status: 'POSTED',
          items: grnItems,
          subtotal: gstSummary.subtotal,
          totalDiscount: gstSummary.totalDiscount,
          invoiceDiscount: gstSummary.invoiceDiscount,
          otherCharges: gstSummary.otherCharges,
          taxableAmount: gstSummary.taxableAmount,
          cgst: gstSummary.cgst,
          sgst: gstSummary.sgst,
          igst: gstSummary.igst,
          totalTax: gstSummary.totalTax,
          roundOff: gstSummary.roundOff,
          grandTotal: gstSummary.grandTotal,
          totalReceivedQty: grnItems.reduce((s, i) => s + i.receivedQuantity, 0),
          totalAcceptedQty: grnItems.reduce((s, i) => s + i.acceptedQuantity, 0),
          totalRejectedQty: grnItems.reduce((s, i) => s + i.rejectedQuantity, 0),
          totalFreeQty: grnItems.reduce((s, i) => s + i.freeQuantity, 0),
          warnings,
          shortExpiryThresholdDays,
          allowOverReceiptUsed: Boolean(input.allowOverReceipt),
          linkedInvoiceId: invoiceId,
          notes: input.notes?.trim() || null,
          operationId,
          idempotencyKey: cleanKey,
          postedBy: userId,
          postedAt: now,
          createdBy: userId,
          createdAt: now,
          updatedBy: userId,
          updatedAt: now,
        };

        if (input.autoCreateSupplierInvoice && invoiceId) {
          const invDate = input.supplierInvoiceDate || grnRecord.receiptDate;
          const dueDate = addDaysIso(invDate, supplier.creditPeriodDays);
          linkedInvoice = {
            id: invoiceId,
            invoiceId,
            tenantId,
            branchId,
            supplierId: supplier.id,
            supplierCode: supplier.supplierCode,
            supplierName: supplier.tradeName,
            supplierGstin: supplier.gstin || null,
            grnId,
            grnNumber,
            poId: po?.id || null,
            poNumber: po?.poNumber || null,
            supplierInvoiceNumber: input.supplierInvoiceNumber!.trim(),
            invoiceDate: invDate,
            dueDate,
            placeOfSupplyStateCode,
            isInterState,
            subtotal: grnRecord.subtotal,
            totalDiscount: grnRecord.totalDiscount,
            otherCharges: grnRecord.otherCharges,
            taxableAmount: grnRecord.taxableAmount,
            cgst: grnRecord.cgst,
            sgst: grnRecord.sgst,
            igst: grnRecord.igst,
            totalTax: grnRecord.totalTax,
            roundOff: grnRecord.roundOff,
            totalAmount: grnRecord.grandTotal,
            amountPaid: 0,
            creditNoteAmount: 0,
            outstandingAmount: grnRecord.grandTotal,
            paymentStatus: computeInvoiceStatus(grnRecord.grandTotal, 0, dueDate),
            recognitionBasis: 'GRN',
            notes: `Auto-generated on GRN ${grnNumber}`,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
          };
        }

        // 8. Commit atomically (with supplier lock for stats/payable update)
        await withTestSupplierLock(tenantId, supplier.id, async () => {
          const latestSupplier = await SupplierService.getRawSupplier(tenantId, supplier.id);
          const nextSupplier: SupplierRecord = {
            ...latestSupplier,
            totalPurchases: fromPaise(toPaise(latestSupplier.totalPurchases) + toPaise(grnRecord.grandTotal)),
            lastPurchaseDate: now,
            currentOutstandingBalance: linkedInvoice
              ? fromPaise(
                  toPaise(latestSupplier.currentOutstandingBalance) + toPaise(linkedInvoice.totalAmount)
                )
              : latestSupplier.currentOutstandingBalance,
            updatedAt: now,
            updatedBy: userId,
          };

          const committedOp: PurchaseOperationRecord = {
            ...operationRecord,
            status: 'COMMITTED',
            completedAt: now,
          };

          const resultPayload = {
            grn: grnRecord,
            purchaseOrder: updatedPo,
            batches: createdBatches,
            invoice: linkedInvoice,
          };

          if (this.isTest()) {
            testOpStore.set(`${tenantId}:${operationId}`, committedOp);
            testGrnStore.set(`${tenantId}:${grnId}`, grnRecord);
            if (updatedPo) testPoStore.set(`${tenantId}:${updatedPo.id}`, updatedPo);
            for (const b of createdBatches) setTestBatch(tenantId, b);
            for (const m of createdMovements) recordTestMovementDirect(tenantId, m);
            if (linkedInvoice) testInvoiceStore.set(`${tenantId}:${linkedInvoice.id}`, linkedInvoice);
            setTestSupplier(tenantId, nextSupplier);
            testIdempotencyStore.set(`${tenantId}:grn:${cleanKey}`, {
              requestHash,
              response: resultPayload,
            });
          } else {
            const db = firestore();
            const tenantRef = db.collection('tenants').doc(tenantId);
            await db.runTransaction(async (tx) => {
              tx.set(tenantRef.collection('purchaseOperations').doc(operationId), committedOp);
              tx.set(tenantRef.collection('goodsReceipts').doc(grnId), grnRecord);
              if (updatedPo) {
                tx.set(tenantRef.collection('purchaseOrders').doc(updatedPo.id), updatedPo);
              }
              for (const b of createdBatches) {
                tx.set(tenantRef.collection('inventory_batches').doc(b.id), b);
              }
              for (const m of createdMovements) {
                tx.set(tenantRef.collection('stock_movements').doc(m.id), m);
              }
              if (linkedInvoice) {
                tx.set(tenantRef.collection('supplierInvoices').doc(linkedInvoice.id), linkedInvoice);
              }
              tx.set(tenantRef.collection('suppliers').doc(supplier.id), nextSupplier);
              tx.set(tenantRef.collection('idempotency_keys').doc(`grn_${cleanKey}`), {
                requestHash,
                response: resultPayload,
                createdAt: now,
              });
            });
          }
        });

        try {
          await AccountingService.recordGrnAccounting({
            tenantId,
            branchId,
            grn: grnRecord,
            userId,
          });
        } catch (accErr) {
          logger.error({ err: accErr, grnId }, 'GRN accounting hook failed');
        }

        await AuditService.log({
          tenantId,
          actingUserId: userId,
          action: 'GRN_POSTED',
          metadata: {
            entityType: 'goodsReceipt',
            entityId: grnId,
            branchId,
            grnNumber,
            poId: po?.id || null,
            supplierId: supplier.id,
            totalAcceptedQty: grnRecord.totalAcceptedQty,
            totalRejectedQty: grnRecord.totalRejectedQty,
            grandTotal: grnRecord.grandTotal,
            linkedInvoiceId: invoiceId,
          },
        });

        return {
          grn: grnRecord,
          purchaseOrder: updatedPo,
          batches: createdBatches,
          invoice: linkedInvoice,
          idempotentReplay: false,
        };
      })
    );
  }

  public static async reverseGrn(
    tenantId: string,
    grnId: string,
    reason: string,
    userId: string
  ): Promise<{ grn: GoodsReceiptRecord; purchaseOrder?: PurchaseOrderRecord | null }> {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestError('GRN reversal reason (minimum 3 characters) is required.');
    }

    const grn = await this.getGrn(tenantId, grnId);
    if (grn.status === 'REVERSED') {
      throw new ConflictError(`GRN '${grn.grnNumber}' has already been reversed.`);
    }

    return withTestProcurementLock(tenantId, grn.poId ? `po:${grn.poId}` : `branch:${grn.branchId}`, async () =>
      withTestBranchInventoryLock(tenantId, grn.branchId, async () =>
        withTestSupplierLock(tenantId, grn.supplierId, async () => {
          const latestGrn = await this.getGrn(tenantId, grnId);
          if (latestGrn.status === 'REVERSED') {
            throw new ConflictError(`GRN '${latestGrn.grnNumber}' has already been reversed.`);
          }

          // Check no stock consumed from GRN batches
          const updatedBatches: InventoryBatchRecord[] = [];
          const movements: StockMovementRecord[] = [];
          const now = new Date().toISOString();

          for (const line of latestGrn.items) {
            if (!line.inventoryBatchId) continue;
            let batch: InventoryBatchRecord | undefined;
            if (this.isTest()) {
              batch = getTestBatchDirect(tenantId, line.inventoryBatchId);
            } else {
              const snap = await firestore()
                .collection('tenants')
                .doc(tenantId)
                .collection('inventory_batches')
                .doc(line.inventoryBatchId)
                .get();
              batch = snap.exists ? (snap.data() as InventoryBatchRecord) : undefined;
            }
            if (!batch) continue;
            if (batch.currentStock < batch.quantityReceived) {
              throw new ConflictError(
                `Cannot reverse GRN '${latestGrn.grnNumber}': batch '${batch.batchNumber}' already had ${batch.quantityReceived - batch.currentStock} unit(s) dispensed/adjusted. Record a Supplier Return instead.`
              );
            }
            const nextBatch: InventoryBatchRecord = {
              ...batch,
              currentStock: 0,
              status: 'out_of_stock',
              updatedAt: now,
            };
            updatedBatches.push(nextBatch);
            movements.push({
              id: `mov_rev_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
              tenantId,
              branchId: latestGrn.branchId,
              medicineId: batch.medicineId,
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              medicineName: batch.medicineName,
              movementType: 'MANUAL_ADJUSTMENT',
              quantityChange: -batch.currentStock,
              previousQuantity: batch.currentStock,
              newQuantity: 0,
              referenceType: 'grn_reversal',
              referenceId: latestGrn.id,
              reason: `GRN ${latestGrn.grnNumber} reversed: ${reason.trim()}`,
              performedBy: userId,
              timestamp: now,
            });
          }

          // Check linked invoice
          let reversedInvoice: SupplierInvoiceRecord | null = null;
          if (latestGrn.linkedInvoiceId) {
            const inv = await this.getSupplierInvoice(tenantId, latestGrn.linkedInvoiceId);
            if (toPaise(inv.amountPaid) > 0) {
              throw new ConflictError(
                `Cannot reverse GRN '${latestGrn.grnNumber}' because linked invoice '${inv.supplierInvoiceNumber}' already has payments recorded.`
              );
            }
            reversedInvoice = {
              ...inv,
              outstandingAmount: 0,
              paymentStatus: 'REVERSED',
              reversedAt: now,
              reversalReason: reason.trim(),
              updatedAt: now,
            };
          }

          // Restore PO pending quantities
          let updatedPo: PurchaseOrderRecord | null = null;
          if (latestGrn.poId) {
            const po = await this.getPurchaseOrder(tenantId, latestGrn.poId);
            const reverseAcceptedByPoLine = new Map<string, number>();
            for (const line of latestGrn.items) {
              if (line.poItemId) {
                reverseAcceptedByPoLine.set(
                  line.poItemId,
                  (reverseAcceptedByPoLine.get(line.poItemId) || 0) + line.acceptedQuantity
                );
              }
            }
            const nextLines = po.items.map((pl) => {
              const dec = reverseAcceptedByPoLine.get(pl.id) || 0;
              const nextRec = Math.max(0, pl.receivedQuantity - dec);
              return {
                ...pl,
                receivedQuantity: nextRec,
                pendingQuantity: Math.max(0, pl.orderedQuantity - nextRec),
              };
            });
            const totalReceivedQty = nextLines.reduce((s, l) => s + l.receivedQuantity, 0);
            const totalPendingQty = nextLines.reduce((s, l) => s + l.pendingQuantity, 0);
            const nextPoStatus: PurchaseOrderStatus =
              po.status === 'CLOSED'
                ? 'CLOSED'
                : totalReceivedQty > 0
                ? 'PARTIALLY_RECEIVED'
                : 'APPROVED';

            updatedPo = {
              ...po,
              items: nextLines,
              totalReceivedQty,
              totalPendingQty,
              status: nextPoStatus,
              updatedBy: userId,
              updatedAt: now,
            };
          }

          const reversedGrn: GoodsReceiptRecord = {
            ...latestGrn,
            status: 'REVERSED',
            reversedBy: userId,
            reversedAt: now,
            reversalReason: reason.trim(),
            updatedBy: userId,
            updatedAt: now,
          };

          const supplier = await SupplierService.getRawSupplier(tenantId, latestGrn.supplierId);
          const nextSupplier: SupplierRecord = {
            ...supplier,
            totalPurchases: Math.max(
              0,
              fromPaise(toPaise(supplier.totalPurchases) - toPaise(latestGrn.grandTotal))
            ),
            currentOutstandingBalance: reversedInvoice
              ? Math.max(
                  0,
                  fromPaise(
                    toPaise(supplier.currentOutstandingBalance) - toPaise(reversedInvoice.totalAmount)
                  )
                )
              : supplier.currentOutstandingBalance,
            updatedAt: now,
            updatedBy: userId,
          };

          const opRecord: PurchaseOperationRecord = {
            id: `pop_rev_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            tenantId,
            branchId: latestGrn.branchId,
            operationType: 'REVERSE_GRN',
            targetId: latestGrn.id,
            status: 'REVERSED',
            performedBy: userId,
            startedAt: now,
            completedAt: now,
          };

          if (this.isTest()) {
            testGrnStore.set(`${tenantId}:${reversedGrn.id}`, reversedGrn);
            if (updatedPo) testPoStore.set(`${tenantId}:${updatedPo.id}`, updatedPo);
            for (const b of updatedBatches) setTestBatch(tenantId, b);
            for (const m of movements) recordTestMovementDirect(tenantId, m);
            if (reversedInvoice) testInvoiceStore.set(`${tenantId}:${reversedInvoice.id}`, reversedInvoice);
            setTestSupplier(tenantId, nextSupplier);
            testOpStore.set(`${tenantId}:${opRecord.id}`, opRecord);
          } else {
            const db = firestore();
            const tenantRef = db.collection('tenants').doc(tenantId);
            await db.runTransaction(async (tx) => {
              tx.set(tenantRef.collection('goodsReceipts').doc(reversedGrn.id), reversedGrn);
              if (updatedPo) tx.set(tenantRef.collection('purchaseOrders').doc(updatedPo.id), updatedPo);
              for (const b of updatedBatches) tx.set(tenantRef.collection('inventory_batches').doc(b.id), b);
              for (const m of movements) tx.set(tenantRef.collection('stock_movements').doc(m.id), m);
              if (reversedInvoice) {
                tx.set(tenantRef.collection('supplierInvoices').doc(reversedInvoice.id), reversedInvoice);
              }
              tx.set(tenantRef.collection('suppliers').doc(supplier.id), nextSupplier);
              tx.set(tenantRef.collection('purchaseOperations').doc(opRecord.id), opRecord);
            });
          }

          try {
            await AccountingService.recordGrnReversalAccounting({
              tenantId,
              grnId: reversedGrn.id,
              reason: reason.trim(),
              userId,
            });
          } catch (accErr) {
            logger.error({ err: accErr, grnId: reversedGrn.id }, 'GRN reversal accounting hook failed');
          }

          await AuditService.log({
            tenantId,
            actingUserId: userId,
            action: 'GRN_REVERSED',
            metadata: {
              entityType: 'goodsReceipt',
              entityId: reversedGrn.id,
              grnNumber: reversedGrn.grnNumber,
              reason: reason.trim(),
            },
          });

          return { grn: reversedGrn, purchaseOrder: updatedPo };
        })
      )
    );
  }

  // =========================================================================
  // SUPPLIER INVOICES, PAYMENTS & RETURNS
  // =========================================================================

  public static async listSupplierInvoices(
    tenantId: string,
    branchId: string | undefined,
    options: {
      supplierId?: string;
      status?: SupplierInvoicePaymentStatus;
      grnId?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    let items: SupplierInvoiceRecord[] = [];
    if (this.isTest()) {
      items = getTestSupplierInvoicesForTenant(tenantId).map((i) => ({ ...i }));
    } else {
      const snap = await firestore().collection('tenants').doc(tenantId).collection('supplierInvoices').get();
      items = snap.docs.map((d) => d.data() as SupplierInvoiceRecord);
    }

    // Dynamically recompute OVERDUE view without mutating persisted record unless needed
    items = items.map((inv) => ({
      ...inv,
      paymentStatus: computeInvoiceStatus(inv.outstandingAmount, inv.amountPaid, inv.dueDate, inv.paymentStatus),
    }));

    if (branchId && branchId !== 'all') items = items.filter((i) => i.branchId === branchId);
    if (options.supplierId) items = items.filter((i) => i.supplierId === options.supplierId);
    if (options.status) items = items.filter((i) => i.paymentStatus === options.status);
    if (options.grnId) items = items.filter((i) => i.grnId === options.grnId);

    items.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));

    return {
      invoices: items.slice((page - 1) * limit, page * limit),
      total: items.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(items.length / limit)),
    };
  }

  public static async getSupplierInvoice(tenantId: string, invoiceId: string): Promise<SupplierInvoiceRecord> {
    if (this.isTest()) {
      const found = testInvoiceStore.get(`${tenantId}:${invoiceId}`);
      if (!found) throw new NotFoundError(`Supplier invoice '${invoiceId}' not found.`);
      return { ...found };
    }
    const snap = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('supplierInvoices')
      .doc(invoiceId)
      .get();
    if (!snap.exists) throw new NotFoundError(`Supplier invoice '${invoiceId}' not found.`);
    return snap.data() as SupplierInvoiceRecord;
  }

  public static async createSupplierInvoice(
    tenantId: string,
    branchId: string,
    input: CreateSupplierInvoiceInput,
    userId: string
  ): Promise<SupplierInvoiceRecord> {
    if (!input.supplierInvoiceNumber?.trim()) {
      throw new BadRequestError('supplierInvoiceNumber is required.');
    }

    return withTestSupplierLock(tenantId, input.supplierId, async () => {
      const supplier = await SupplierService.getRawSupplier(tenantId, input.supplierId);
      const existingInvoices = await this.listSupplierInvoices(tenantId, undefined, {
        supplierId: supplier.id,
        page: 1,
        limit: 100,
      });

      const invNoClean = input.supplierInvoiceNumber.trim();
      if (
        existingInvoices.invoices.some(
          (i) =>
            i.paymentStatus !== 'REVERSED' &&
            i.supplierInvoiceNumber.toLowerCase() === invNoClean.toLowerCase()
        )
      ) {
        throw new ConflictError(
          `Supplier invoice number '${invNoClean}' already exists for '${supplier.tradeName}'.`
        );
      }

      let grn: GoodsReceiptRecord | null = null;
      if (input.grnId) {
        grn = await this.getGrn(tenantId, input.grnId);
        if (grn.status === 'REVERSED') {
          throw new BadRequestError(`Cannot create supplier invoice for reversed GRN '${grn.grnNumber}'.`);
        }
        if (grn.supplierId !== supplier.id) {
          throw new BadRequestError(`GRN '${grn.grnNumber}' belongs to a different supplier.`);
        }
        // Single-liability check: block duplicate invoice for the same GRN
        if (grn.linkedInvoiceId) {
          throw new ConflictError(
            `Liability already recognized for GRN '${grn.grnNumber}' under invoice '${grn.linkedInvoiceId}'.`
          );
        }
        const dupeByGrn = existingInvoices.invoices.find(
          (i) => i.grnId === grn!.id && i.paymentStatus !== 'REVERSED'
        );
        if (dupeByGrn) {
          throw new ConflictError(
            `Supplier invoice '${dupeByGrn.supplierInvoiceNumber}' already recognizes payable for GRN '${grn.grnNumber}'.`
          );
        }
      }

      const tenantProfile = await this.resolveTenantProfile(tenantId);
      const supplierStateCode = supplier.stateCode || tenantProfile.stateCode;
      const placeOfSupplyStateCode =
        input.placeOfSupplyStateCode || grn?.placeOfSupplyStateCode || supplierStateCode;
      const isInterState =
        input.isInterState !== undefined
          ? Boolean(input.isInterState)
          : grn
          ? grn.isInterState
          : tenantProfile.stateCode !== placeOfSupplyStateCode;

      const subtotal = grn ? grn.subtotal : roundPaise(Math.max(0, Number(input.subtotal ?? input.totalAmount ?? 0)));
      const totalDiscount = grn ? grn.totalDiscount : roundPaise(Math.max(0, Number(input.totalDiscount ?? 0)));
      const otherCharges = grn ? grn.otherCharges : roundPaise(Math.max(0, Number(input.otherCharges ?? 0)));
      const cgst = grn ? grn.cgst : roundPaise(Math.max(0, Number(input.cgst ?? 0)));
      const sgst = grn ? grn.sgst : roundPaise(Math.max(0, Number(input.sgst ?? 0)));
      const igst = grn ? grn.igst : roundPaise(Math.max(0, Number(input.igst ?? 0)));
      const totalTax = grn ? grn.totalTax : roundPaise(cgst + sgst + igst);
      const taxableAmount = grn ? grn.taxableAmount : roundPaise(Math.max(0, subtotal - totalDiscount));
      const roundOff = grn ? grn.roundOff : roundPaise(Number(input.roundOff ?? 0));
      const totalAmount = grn
        ? grn.grandTotal
        : input.totalAmount !== undefined
        ? roundPaise(input.totalAmount)
        : roundPaise(taxableAmount + totalTax + otherCharges + roundOff);

      if (totalAmount <= 0) {
        throw new BadRequestError('Supplier invoice totalAmount must be greater than zero.');
      }

      const now = new Date().toISOString();
      const invoiceDate = input.invoiceDate || grn?.supplierInvoiceDate || grn?.receiptDate || now;
      const dueDate = input.dueDate || addDaysIso(invoiceDate, supplier.creditPeriodDays);
      const invoiceId = `sinv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      const record: SupplierInvoiceRecord = {
        id: invoiceId,
        invoiceId,
        tenantId,
        branchId: grn?.branchId || branchId,
        supplierId: supplier.id,
        supplierCode: supplier.supplierCode,
        supplierName: supplier.tradeName,
        supplierGstin: supplier.gstin || null,
        grnId: grn?.id || null,
        grnNumber: grn?.grnNumber || null,
        poId: grn?.poId || input.poId || null,
        poNumber: grn?.poNumber || null,
        supplierInvoiceNumber: invNoClean,
        invoiceDate,
        dueDate,
        placeOfSupplyStateCode,
        isInterState,
        subtotal,
        totalDiscount,
        otherCharges,
        taxableAmount,
        cgst,
        sgst,
        igst,
        totalTax,
        roundOff,
        totalAmount,
        amountPaid: 0,
        creditNoteAmount: 0,
        outstandingAmount: totalAmount,
        paymentStatus: computeInvoiceStatus(totalAmount, 0, dueDate),
        recognitionBasis: grn ? 'GRN' : 'DIRECT_BILL',
        attachmentPath: input.attachmentPath?.trim() || null,
        notes: input.notes?.trim() || null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      const nextSupplier: SupplierRecord = {
        ...supplier,
        currentOutstandingBalance: fromPaise(
          toPaise(supplier.currentOutstandingBalance) + toPaise(totalAmount)
        ),
        updatedAt: now,
        updatedBy: userId,
      };

      const updatedGrn = grn ? { ...grn, linkedInvoiceId: invoiceId, updatedAt: now, updatedBy: userId } : null;

      if (this.isTest()) {
        testInvoiceStore.set(`${tenantId}:${invoiceId}`, record);
        setTestSupplier(tenantId, nextSupplier);
        if (updatedGrn) testGrnStore.set(`${tenantId}:${updatedGrn.id}`, updatedGrn);
      } else {
        const db = firestore();
        const tenantRef = db.collection('tenants').doc(tenantId);
        await db.runTransaction(async (tx) => {
          tx.set(tenantRef.collection('supplierInvoices').doc(invoiceId), record);
          tx.set(tenantRef.collection('suppliers').doc(supplier.id), nextSupplier);
          if (updatedGrn) tx.set(tenantRef.collection('goodsReceipts').doc(updatedGrn.id), updatedGrn);
        });
      }

      try {
        await AccountingService.recordSupplierInvoiceAccounting({
          tenantId,
          branchId: record.branchId,
          invoice: record,
          userId,
        });
      } catch (accErr) {
        logger.error({ err: accErr, invoiceId }, 'Supplier invoice accounting hook failed');
      }

      await AuditService.log({
        tenantId,
        actingUserId: userId,
        action: 'SUPPLIER_INVOICE_CREATED',
        metadata: {
          entityType: 'supplierInvoice',
          entityId: invoiceId,
          supplierId: supplier.id,
          supplierInvoiceNumber: invNoClean,
          grnId: grn?.id || null,
          totalAmount,
        },
      });

      return record;
    });
  }

  public static async listSupplierPayments(
    tenantId: string,
    branchId: string | undefined,
    supplierId?: string
  ): Promise<SupplierPaymentRecord[]> {
    let items: SupplierPaymentRecord[] = [];
    if (this.isTest()) {
      items = getTestSupplierPaymentsForTenant(tenantId).map((p) => ({ ...p }));
    } else {
      const snap = await firestore().collection('tenants').doc(tenantId).collection('supplierPayments').get();
      items = snap.docs.map((d) => d.data() as SupplierPaymentRecord);
    }
    if (branchId && branchId !== 'all') items = items.filter((p) => p.branchId === branchId);
    if (supplierId) items = items.filter((p) => p.supplierId === supplierId);
    items.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
    return items;
  }

  public static async recordSupplierPayment(
    tenantId: string,
    branchId: string,
    input: RecordSupplierPaymentInput,
    userId: string
  ): Promise<{ payment: SupplierPaymentRecord; supplier: SupplierRecord; idempotentReplay: boolean }> {
    const amountPaise = toPaise(input.amount);
    if (amountPaise <= 0) {
      throw new BadRequestError('Payment amount must be greater than zero.');
    }
    const cleanKey = input.idempotencyKey?.trim();
    const requestHash = hashRequest({ branchId, ...input });

    return withTestSupplierLock(tenantId, input.supplierId, async () => {
      if (cleanKey) {
        if (this.isTest()) {
          const prev = testIdempotencyStore.get(`${tenantId}:pay:${cleanKey}`);
          if (prev) {
            if (prev.requestHash !== requestHash) {
              throw new IdempotencyConflictError('Idempotency-Key reused with different payment payload.');
            }
            return { ...prev.response, idempotentReplay: true };
          }
        } else {
          const snap = await firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('idempotency_keys')
            .doc(`spay_${cleanKey}`)
            .get();
          if (snap.exists) {
            const data = snap.data() as { requestHash: string; response: any };
            if (data.requestHash !== requestHash) {
              throw new IdempotencyConflictError('Idempotency-Key reused with different payment payload.');
            }
            return { ...data.response, idempotentReplay: true };
          }
        }
      }

      const supplier = await SupplierService.getRawSupplier(tenantId, input.supplierId);
      const supplierInvRes = await this.listSupplierInvoices(tenantId, undefined, {
        supplierId: supplier.id,
        page: 1,
        limit: 500,
      });

      const openInvoices = supplierInvRes.invoices
        .filter((i) => i.paymentStatus !== 'REVERSED' && toPaise(i.outstandingAmount) > 0)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.invoiceDate.localeCompare(b.invoiceDate));

      const allocations: SupplierPaymentAllocation[] = [];
      const updatedInvoices = new Map<string, SupplierInvoiceRecord>();
      let remainingPaise = amountPaise;

      if (input.allocations && input.allocations.length > 0) {
        for (const reqAlloc of input.allocations) {
          const inv = openInvoices.find((i) => i.id === reqAlloc.invoiceId);
          if (!inv) {
            throw new BadRequestError(
              `Invoice '${reqAlloc.invoiceId}' is not an open unpaid invoice for supplier '${supplier.tradeName}'.`
            );
          }
          const allocPaise = toPaise(reqAlloc.amount);
          if (allocPaise <= 0) {
            throw new BadRequestError('Allocation amount must be positive.');
          }
          if (allocPaise > toPaise(inv.outstandingAmount)) {
            throw new BadRequestError(
              `Allocation (₹${reqAlloc.amount}) exceeds outstanding amount (₹${inv.outstandingAmount}) on invoice '${inv.supplierInvoiceNumber}'.`
            );
          }
          if (allocPaise > remainingPaise) {
            throw new BadRequestError('Total invoice allocations exceed payment amount.');
          }
          remainingPaise -= allocPaise;

          const nextPaid = fromPaise(toPaise(inv.amountPaid) + allocPaise);
          const nextOut = fromPaise(toPaise(inv.outstandingAmount) - allocPaise);
          updatedInvoices.set(inv.id, {
            ...inv,
            amountPaid: nextPaid,
            outstandingAmount: nextOut,
            paymentStatus: computeInvoiceStatus(nextOut, nextPaid, inv.dueDate),
            updatedAt: new Date().toISOString(),
          });
          allocations.push({
            invoiceId: inv.id,
            supplierInvoiceNumber: inv.supplierInvoiceNumber,
            allocatedAmount: fromPaise(allocPaise),
          });
        }
      } else {
        // FIFO oldest-due invoice allocation
        for (const inv of openInvoices) {
          if (remainingPaise <= 0) break;
          const outPaise = toPaise(inv.outstandingAmount);
          const takePaise = Math.min(remainingPaise, outPaise);
          remainingPaise -= takePaise;
          const nextPaid = fromPaise(toPaise(inv.amountPaid) + takePaise);
          const nextOut = fromPaise(outPaise - takePaise);
          updatedInvoices.set(inv.id, {
            ...inv,
            amountPaid: nextPaid,
            outstandingAmount: nextOut,
            paymentStatus: computeInvoiceStatus(nextOut, nextPaid, inv.dueDate),
            updatedAt: new Date().toISOString(),
          });
          allocations.push({
            invoiceId: inv.id,
            supplierInvoiceNumber: inv.supplierInvoiceNumber,
            allocatedAmount: fromPaise(takePaise),
          });
        }
      }

      // Check leftover unallocated funds (could settle opening balance or become advance)
      const allocatedPaise = amountPaise - remainingPaise;
      const supplierOutstandingPaise = toPaise(supplier.currentOutstandingBalance);
      const unallocatedToInvoicesPaise = remainingPaise;

      // Apply remaining toward non-invoiced opening balance up to outstanding balance
      const settleOpeningPaise = Math.min(
        unallocatedToInvoicesPaise,
        Math.max(0, supplierOutstandingPaise - allocatedPaise)
      );
      const advanceAddedPaise = unallocatedToInvoicesPaise - settleOpeningPaise;

      if (advanceAddedPaise > 0 && !input.allowAdvance) {
        throw new BadRequestError(
          `Payment of ₹${fromPaise(amountPaise).toFixed(2)} exceeds supplier outstanding balance (₹${supplier.currentOutstandingBalance.toFixed(2)}). Enable allowAdvance to record advance balance.`
        );
      }

      const now = new Date().toISOString();
      const paymentId = `spay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const existingPays = await this.listSupplierPayments(tenantId, undefined);
      const paymentNumber = `PAY-${new Date().getFullYear()}-${String(existingPays.length + 1).padStart(4, '0')}`;

      const paymentRecord: SupplierPaymentRecord = {
        id: paymentId,
        paymentId,
        paymentNumber,
        tenantId,
        branchId,
        supplierId: supplier.id,
        supplierCode: supplier.supplierCode,
        supplierName: supplier.tradeName,
        paymentDate: input.paymentDate || now,
        paymentMode: input.paymentMode,
        amount: fromPaise(amountPaise),
        allocatedTotal: fromPaise(allocatedPaise),
        advanceAdded: fromPaise(advanceAddedPaise),
        referenceNumber: input.referenceNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        allocations,
        idempotencyKey: cleanKey || null,
        createdBy: userId,
        createdAt: now,
      };

      const payableReductionPaise = allocatedPaise + settleOpeningPaise;
      const nextSupplier: SupplierRecord = {
        ...supplier,
        currentOutstandingBalance: Math.max(0, fromPaise(supplierOutstandingPaise - payableReductionPaise)),
        advanceBalance: fromPaise(toPaise(supplier.advanceBalance) + advanceAddedPaise),
        totalPayments: fromPaise(toPaise(supplier.totalPayments) + amountPaise),
        lastPaymentDate: now,
        updatedAt: now,
        updatedBy: userId,
      };

      const payload = { payment: paymentRecord, supplier: nextSupplier };

      if (this.isTest()) {
        testPaymentStore.set(`${tenantId}:${paymentId}`, paymentRecord);
        setTestSupplier(tenantId, nextSupplier);
        for (const inv of updatedInvoices.values()) {
          testInvoiceStore.set(`${tenantId}:${inv.id}`, inv);
        }
        if (cleanKey) {
          testIdempotencyStore.set(`${tenantId}:pay:${cleanKey}`, { requestHash, response: payload });
        }
      } else {
        const db = firestore();
        const tenantRef = db.collection('tenants').doc(tenantId);
        await db.runTransaction(async (tx) => {
          tx.set(tenantRef.collection('supplierPayments').doc(paymentId), paymentRecord);
          tx.set(tenantRef.collection('suppliers').doc(supplier.id), nextSupplier);
          for (const inv of updatedInvoices.values()) {
            tx.set(tenantRef.collection('supplierInvoices').doc(inv.id), inv);
          }
          if (cleanKey) {
            tx.set(tenantRef.collection('idempotency_keys').doc(`spay_${cleanKey}`), {
              requestHash,
              response: payload,
              createdAt: now,
            });
          }
        });
      }

      try {
        await AccountingService.recordSupplierPaymentAccounting({
          tenantId,
          branchId,
          payment: paymentRecord,
          userId,
        });
      } catch (accErr) {
        logger.error({ err: accErr, paymentId }, 'Supplier payment accounting hook failed');
      }

      await AuditService.log({
        tenantId,
        actingUserId: userId,
        action: 'SUPPLIER_PAYMENT_RECORDED',
        metadata: {
          entityType: 'supplierPayment',
          entityId: paymentId,
          supplierId: supplier.id,
          paymentNumber,
          amount: paymentRecord.amount,
          allocations,
        },
      });

      return { ...payload, idempotentReplay: false };
    });
  }

  public static async listSupplierReturns(
    tenantId: string,
    branchId: string | undefined,
    supplierId?: string
  ): Promise<SupplierReturnRecord[]> {
    let items: SupplierReturnRecord[] = [];
    if (this.isTest()) {
      items = getTestSupplierReturnsForTenant(tenantId).map((r) => ({ ...r }));
    } else {
      const snap = await firestore().collection('tenants').doc(tenantId).collection('supplierReturns').get();
      items = snap.docs.map((d) => d.data() as SupplierReturnRecord);
    }
    if (branchId && branchId !== 'all') items = items.filter((r) => r.branchId === branchId);
    if (supplierId) items = items.filter((r) => r.supplierId === supplierId);
    items.sort((a, b) => b.returnDate.localeCompare(a.returnDate));
    return items;
  }

  public static async createSupplierReturn(
    tenantId: string,
    branchId: string,
    input: CreateSupplierReturnInput,
    userId: string
  ): Promise<SupplierReturnRecord> {
    if (!input.reason || input.reason.trim().length < 3) {
      throw new BadRequestError('Supplier return reason (min 3 chars) is required.');
    }
    if (!input.items || input.items.length === 0) {
      throw new BadRequestError('At least one return batch item is required.');
    }

    const grn = await this.getGrn(tenantId, input.grnId);
    if (grn.status !== 'POSTED') {
      throw new BadRequestError(`Cannot process return against GRN '${grn.grnNumber}' in '${grn.status}' status.`);
    }

    return withTestBranchInventoryLock(tenantId, grn.branchId, async () =>
      withTestSupplierLock(tenantId, grn.supplierId, async () => {
        const supplier = await SupplierService.getRawSupplier(tenantId, grn.supplierId);
        const existingReturns = await this.listSupplierReturns(tenantId, undefined, supplier.id);
        const priorReturnedByBatch = new Map<string, number>();
        for (const ret of existingReturns.filter((r) => r.grnId === grn.id)) {
          for (const ri of ret.items) {
            priorReturnedByBatch.set(ri.batchId, (priorReturnedByBatch.get(ri.batchId) || 0) + ri.quantity);
          }
        }

        const returnItems: SupplierReturnItem[] = [];
        const updatedBatches: InventoryBatchRecord[] = [];
        const movements: StockMovementRecord[] = [];
        const now = new Date().toISOString();

        for (let idx = 0; idx < input.items.length; idx++) {
          const reqItem = input.items[idx]!;
          if (!Number.isInteger(reqItem.quantity) || reqItem.quantity <= 0) {
            throw new BadRequestError(`Return item ${idx + 1}: quantity must be a positive integer.`);
          }
          const grnLine = grn.items.find((l) => l.inventoryBatchId === reqItem.batchId);
          if (!grnLine) {
            throw new BadRequestError(
              `Batch '${reqItem.batchId}' was not created by GRN '${grn.grnNumber}'.`
            );
          }

          let batch: InventoryBatchRecord | undefined;
          if (this.isTest()) {
            batch = getTestBatchDirect(tenantId, reqItem.batchId);
          } else {
            const snap = await firestore()
              .collection('tenants')
              .doc(tenantId)
              .collection('inventory_batches')
              .doc(reqItem.batchId)
              .get();
            batch = snap.exists ? (snap.data() as InventoryBatchRecord) : undefined;
          }
          if (!batch) {
            throw new NotFoundError(`Batch '${reqItem.batchId}' not found.`);
          }

          const alreadyReturned = priorReturnedByBatch.get(reqItem.batchId) || 0;
          const maxReturnableFromGrn = grnLine.acceptedQuantity + grnLine.freeQuantity - alreadyReturned;
          if (reqItem.quantity > maxReturnableFromGrn) {
            throw new BadRequestError(
              `Return quantity (${reqItem.quantity}) exceeds remaining returnable quantity (${maxReturnableFromGrn}) from GRN '${grn.grnNumber}' for batch '${batch.batchNumber}'.`
            );
          }
          if (reqItem.quantity > batch.currentStock) {
            throw new BadRequestError(
              `Insufficient sellable stock in batch '${batch.batchNumber}' (available ${batch.currentStock}, requested return ${reqItem.quantity}).`
            );
          }

          const newStock = batch.currentStock - reqItem.quantity;
          const nextBatch: InventoryBatchRecord = {
            ...batch,
            currentStock: newStock,
            status: InventoryService.computeBatchStatus(newStock, batch.expiryDate),
            updatedAt: now,
          };
          updatedBatches.push(nextBatch);

          const taxablePaise = Math.round(reqItem.quantity * toPaise(grnLine.purchasePrice));
          const taxPaise = Math.round((taxablePaise * grnLine.gstRate) / 100);
          returnItems.push({
            grnBatchLineId: grnLine.id,
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            medicineId: batch.medicineId,
            medicineName: batch.medicineName,
            quantity: reqItem.quantity,
            unitCost: grnLine.purchasePrice,
            gstRate: grnLine.gstRate,
            taxableAmount: fromPaise(taxablePaise),
            taxAmount: fromPaise(taxPaise),
            lineTotal: fromPaise(taxablePaise + taxPaise),
            reason: reqItem.reason?.trim() || input.reason.trim(),
          });

          movements.push({
            id: `mov_ret_${Date.now()}_${idx}_${crypto.randomBytes(3).toString('hex')}`,
            tenantId,
            branchId: grn.branchId,
            medicineId: batch.medicineId,
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            medicineName: batch.medicineName,
            movementType: 'PURCHASE_RETURN',
            quantityChange: -reqItem.quantity,
            previousQuantity: batch.currentStock,
            newQuantity: newStock,
            referenceType: 'supplier_return',
            referenceId: grn.id,
            reason: `Supplier return (${supplier.tradeName}): ${reqItem.reason?.trim() || input.reason.trim()}`,
            performedBy: userId,
            timestamp: now,
          });
        }

        const subtotalPaise = returnItems.reduce((s, i) => s + toPaise(i.taxableAmount), 0);
        const totalTaxPaise = returnItems.reduce((s, i) => s + toPaise(i.taxAmount), 0);
        const totalAmountPaise = subtotalPaise + totalTaxPaise;

        // Credit linked invoice if present and outstanding > 0
        let updatedInvoice: SupplierInvoiceRecord | null = null;
        let payableReducedPaise = 0;
        let advanceCreditedPaise = 0;

        if (grn.linkedInvoiceId) {
          const inv = await this.getSupplierInvoice(tenantId, grn.linkedInvoiceId);
          if (inv.paymentStatus !== 'REVERSED') {
            const invOutPaise = toPaise(inv.outstandingAmount);
            payableReducedPaise = Math.min(totalAmountPaise, invOutPaise);
            advanceCreditedPaise = totalAmountPaise - payableReducedPaise;
            const nextOut = fromPaise(invOutPaise - payableReducedPaise);
            updatedInvoice = {
              ...inv,
              creditNoteAmount: fromPaise(toPaise(inv.creditNoteAmount) + totalAmountPaise),
              outstandingAmount: nextOut,
              paymentStatus: computeInvoiceStatus(nextOut, inv.amountPaid, inv.dueDate),
              updatedAt: now,
            };
          }
        } else {
          const supOutPaise = toPaise(supplier.currentOutstandingBalance);
          payableReducedPaise = Math.min(totalAmountPaise, supOutPaise);
          advanceCreditedPaise = totalAmountPaise - payableReducedPaise;
        }

        const nextSupplier: SupplierRecord = {
          ...supplier,
          currentOutstandingBalance: Math.max(
            0,
            fromPaise(toPaise(supplier.currentOutstandingBalance) - payableReducedPaise)
          ),
          advanceBalance: fromPaise(toPaise(supplier.advanceBalance) + advanceCreditedPaise),
          updatedAt: now,
          updatedBy: userId,
        };

        const returnId = `sret_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const allReturns = await this.listSupplierReturns(tenantId, undefined);
        const returnNumber = `PR-${new Date().getFullYear()}-${String(allReturns.length + 1).padStart(4, '0')}`;

        const record: SupplierReturnRecord = {
          id: returnId,
          returnId,
          returnNumber,
          tenantId,
          branchId: grn.branchId,
          supplierId: supplier.id,
          supplierCode: supplier.supplierCode,
          supplierName: supplier.tradeName,
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          linkedInvoiceId: grn.linkedInvoiceId || null,
          creditNoteNumber: input.creditNoteNumber?.trim() || `CN-${returnNumber}`,
          returnDate: input.returnDate || now,
          status: 'POSTED',
          items: returnItems,
          subtotal: fromPaise(subtotalPaise),
          totalTax: fromPaise(totalTaxPaise),
          totalAmount: fromPaise(totalAmountPaise),
          payableReduced: fromPaise(payableReducedPaise),
          advanceCredited: fromPaise(advanceCreditedPaise),
          reason: input.reason.trim(),
          approvedBy: userId,
          approvedAt: now,
          idempotencyKey: input.idempotencyKey || null,
          createdBy: userId,
          createdAt: now,
        };

        if (this.isTest()) {
          testReturnStore.set(`${tenantId}:${returnId}`, record);
          for (const b of updatedBatches) setTestBatch(tenantId, b);
          for (const m of movements) recordTestMovementDirect(tenantId, m);
          if (updatedInvoice) testInvoiceStore.set(`${tenantId}:${updatedInvoice.id}`, updatedInvoice);
          setTestSupplier(tenantId, nextSupplier);
        } else {
          const db = firestore();
          const tenantRef = db.collection('tenants').doc(tenantId);
          await db.runTransaction(async (tx) => {
            tx.set(tenantRef.collection('supplierReturns').doc(returnId), record);
            for (const b of updatedBatches) tx.set(tenantRef.collection('inventory_batches').doc(b.id), b);
            for (const m of movements) tx.set(tenantRef.collection('stock_movements').doc(m.id), m);
            if (updatedInvoice) tx.set(tenantRef.collection('supplierInvoices').doc(updatedInvoice.id), updatedInvoice);
            tx.set(tenantRef.collection('suppliers').doc(supplier.id), nextSupplier);
          });
        }

        try {
          await AccountingService.recordSupplierReturnAccounting({
            tenantId,
            branchId: grn.branchId,
            supplierReturn: record,
            isInterState: grn.isInterState,
            userId,
          });
        } catch (accErr) {
          logger.error({ err: accErr, returnId }, 'Supplier return accounting hook failed');
        }

        await AuditService.log({
          tenantId,
          actingUserId: userId,
          action: 'SUPPLIER_RETURN_POSTED',
          metadata: {
            entityType: 'supplierReturn',
            entityId: returnId,
            returnNumber,
            grnId: grn.id,
            supplierId: supplier.id,
            totalAmount: record.totalAmount,
          },
        });

        return record;
      })
    );
  }

  // =========================================================================
  // SUPPLIER STATEMENT & PROCUREMENT REPORTS
  // =========================================================================

  public static async getSupplierStatement(
    tenantId: string,
    supplierId: string,
    options: { fromDate?: string; toDate?: string } = {}
  ) {
    const supplier = await SupplierService.getRawSupplier(tenantId, supplierId);
    const [invRes, payments, returns] = await Promise.all([
      this.listSupplierInvoices(tenantId, undefined, { supplierId, page: 1, limit: 1000 }),
      this.listSupplierPayments(tenantId, undefined, supplierId),
      this.listSupplierReturns(tenantId, undefined, supplierId),
    ]);

    type RawStatementEntry = {
      date: string;
      type: 'OPENING_BALANCE' | 'SUPPLIER_INVOICE' | 'SUPPLIER_PAYMENT' | 'SUPPLIER_RETURN' | 'INVOICE_REVERSAL';
      reference: string;
      description: string;
      debitInr: number; // Payable added
      creditInr: number; // Paid or credited
    };

    const rawEntries: RawStatementEntry[] = [];
    if (supplier.openingBalance > 0) {
      rawEntries.push({
        date: supplier.createdAt,
        type: 'OPENING_BALANCE',
        reference: supplier.supplierCode,
        description: 'Opening payable balance',
        debitInr: supplier.openingBalance,
        creditInr: 0,
      });
    }

    for (const inv of invRes.invoices) {
      rawEntries.push({
        date: inv.invoiceDate,
        type: 'SUPPLIER_INVOICE',
        reference: inv.supplierInvoiceNumber,
        description: inv.grnNumber ? `Supplier Bill (GRN ${inv.grnNumber})` : 'Direct Supplier Bill',
        debitInr: inv.totalAmount,
        creditInr: 0,
      });
      if (inv.paymentStatus === 'REVERSED' && inv.reversedAt) {
        rawEntries.push({
          date: inv.reversedAt,
          type: 'INVOICE_REVERSAL',
          reference: inv.supplierInvoiceNumber,
          description: `Invoice reversed (${inv.reversalReason || 'GRN reversal'})`,
          debitInr: 0,
          creditInr: inv.totalAmount,
        });
      }
    }

    for (const pay of payments) {
      rawEntries.push({
        date: pay.paymentDate,
        type: 'SUPPLIER_PAYMENT',
        reference: pay.paymentNumber,
        description: `${pay.paymentMode}${pay.referenceNumber ? ` Ref: ${pay.referenceNumber}` : ''}`,
        debitInr: 0,
        creditInr: pay.amount - pay.advanceAdded,
      });
    }

    for (const ret of returns) {
      rawEntries.push({
        date: ret.returnDate,
        type: 'SUPPLIER_RETURN',
        reference: ret.creditNoteNumber,
        description: `Purchase return (${ret.grnNumber})`,
        debitInr: 0,
        creditInr: ret.payableReduced,
      });
    }

    rawEntries.sort((a, b) => a.date.localeCompare(b.date));

    let runningPaise = 0;
    const rows = rawEntries.map((r) => {
      runningPaise = runningPaise + toPaise(r.debitInr) - toPaise(r.creditInr);
      return {
        ...r,
        balanceInr: fromPaise(runningPaise),
      };
    });

    const filteredRows = rows.filter((r) => {
      if (options.fromDate && r.date < options.fromDate) return false;
      if (options.toDate && r.date > `${options.toDate}T23:59:59.999Z`) return false;
      return true;
    });

    return {
      supplierId: supplier.id,
      supplierCode: supplier.supplierCode,
      supplierName: supplier.tradeName,
      openingBalance: supplier.openingBalance,
      closingBalance: supplier.currentOutstandingBalance,
      advanceBalance: supplier.advanceBalance,
      entries: filteredRows,
    };
  }

  public static async getSupplierPurchaseHistory(tenantId: string, supplierId: string) {
    await SupplierService.getRawSupplier(tenantId, supplierId);
    const [poRes, grnRes, invRes, payments, returns] = await Promise.all([
      this.listPurchaseOrders(tenantId, undefined, { supplierId, page: 1, limit: 200 }),
      this.listGrns(tenantId, undefined, { supplierId, page: 1, limit: 200 }),
      this.listSupplierInvoices(tenantId, undefined, { supplierId, page: 1, limit: 200 }),
      this.listSupplierPayments(tenantId, undefined, supplierId),
      this.listSupplierReturns(tenantId, undefined, supplierId),
    ]);

    return {
      purchaseOrders: poRes.purchaseOrders,
      goodsReceipts: grnRes.goodsReceipts,
      invoices: invRes.invoices,
      payments,
      returns,
    };
  }

  public static async getProcurementReports(
    tenantId: string,
    branchId: string | undefined,
    options: { fromDate?: string; toDate?: string } = {}
  ) {
    const [suppliers, poRes, grnRes, invRes, returns] = await Promise.all([
      SupplierService.getAllRawSuppliers(tenantId),
      this.listPurchaseOrders(tenantId, branchId, { page: 1, limit: 500 }),
      this.listGrns(tenantId, branchId, {
        fromDate: options.fromDate,
        toDate: options.toDate,
        page: 1,
        limit: 500,
      }),
      this.listSupplierInvoices(tenantId, branchId, { page: 1, limit: 500 }),
      this.listSupplierReturns(tenantId, branchId),
    ]);

    const supplierWisePurchases = suppliers.map((s) => {
      const supGrns = grnRes.goodsReceipts.filter((g) => g.supplierId === s.id && g.status === 'POSTED');
      const grnValuePaise = supGrns.reduce((sum, g) => sum + toPaise(g.grandTotal), 0);
      return {
        supplierId: s.id,
        supplierCode: s.supplierCode,
        supplierName: s.tradeName,
        grnCount: supGrns.length,
        totalPurchasesInRange: fromPaise(grnValuePaise),
        lifetimeTotalPurchases: s.totalPurchases,
        currentOutstandingBalance: s.currentOutstandingBalance,
      };
    });

    const pendingPurchaseOrders = poRes.purchaseOrders.filter((p) =>
      ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(p.status)
    );

    const pendingPoQuantities = pendingPurchaseOrders.flatMap((po) =>
      po.items
        .filter((item) => item.pendingQuantity > 0)
        .map((item) => ({
          poId: po.id,
          poNumber: po.poNumber,
          supplierName: po.supplierName,
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          orderedQuantity: item.orderedQuantity,
          receivedQuantity: item.receivedQuantity,
          pendingQuantity: item.pendingQuantity,
          unitCost: item.unitCost,
        }))
    );

    const todayStr = new Date().toISOString().slice(0, 10);
    const outstandingBills = invRes.invoices.filter(
      (i) => i.paymentStatus !== 'REVERSED' && toPaise(i.outstandingAmount) > 0
    );
    const overdueBills = outstandingBills.filter((i) => i.dueDate.slice(0, 10) < todayStr);

    const nearExpiryReceived = grnRes.goodsReceipts
      .filter((g) => g.status === 'POSTED')
      .flatMap((g) =>
        g.warnings.map((w) => ({
          grnId: g.id,
          grnNumber: g.grnNumber,
          supplierName: g.supplierName,
          receiptDate: g.receiptDate,
          ...w,
        }))
      );

    const rejectedGoods = grnRes.goodsReceipts
      .filter((g) => g.status === 'POSTED')
      .flatMap((g) =>
        g.items
          .filter((item) => item.rejectedQuantity > 0)
          .map((item) => ({
            grnId: g.id,
            grnNumber: g.grnNumber,
            supplierName: g.supplierName,
            receiptDate: g.receiptDate,
            medicineId: item.medicineId,
            medicineName: item.medicineName,
            batchNumber: item.batchNumber,
            rejectedQuantity: item.rejectedQuantity,
            rejectionReason: item.rejectionReason,
          }))
      );

    return {
      summary: {
        activeSuppliersCount: suppliers.filter((s) => s.status === 'ACTIVE' && !s.isArchived).length,
        totalPayableBalance: fromPaise(
          suppliers.reduce((sum, s) => sum + toPaise(s.currentOutstandingBalance), 0)
        ),
        overdueBillsCount: overdueBills.length,
        overdueAmount: fromPaise(overdueBills.reduce((s, b) => s + toPaise(b.outstandingAmount), 0)),
        openPoCount: pendingPurchaseOrders.length,
        grnCountInRange: grnRes.goodsReceipts.filter((g) => g.status === 'POSTED').length,
        returnsCount: returns.length,
      },
      supplierWisePurchases,
      pendingPurchaseOrders,
      grnsByDateRange: grnRes.goodsReceipts,
      pendingPoQuantities,
      supplierOutstanding: {
        totalOutstanding: fromPaise(outstandingBills.reduce((s, b) => s + toPaise(b.outstandingAmount), 0)),
        overdueCount: overdueBills.length,
        openInvoices: outstandingBills,
      },
      nearExpiryReceived,
      rejectedGoods,
      supplierReturns: returns,
    };
  }
}

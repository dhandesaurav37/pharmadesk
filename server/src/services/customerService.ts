import crypto from 'node:crypto';
import { firestore, storage } from '../lib/firebaseAdmin';
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
import {
  BillingTransactionService,
  SalesInvoiceRecord,
  getAllTestInvoicesForTenant,
  setTestInvoice,
  roundPaise,
} from './billingTransactionService';
import { StorageService } from './storageService';
import { AccountingService } from './accountingService';

export type CustomerType =
  | 'REGULAR'
  | 'VIP'
  | 'CHRONIC'
  | 'CORPORATE'
  | 'CLINIC'
  | 'SENIOR_CITIZEN';

export type CustomerGender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export type LedgerEntryType =
  | 'CREDIT_PURCHASE'
  | 'CASH_PAYMENT'
  | 'UPI_PAYMENT'
  | 'CARD_PAYMENT'
  | 'BANK_TRANSFER'
  | 'CREDIT_NOTE'
  | 'DEBIT_ADJUSTMENT'
  | 'CREDIT_ADJUSTMENT'
  | 'OPENING_BALANCE'
  | 'REFUND';

export type LedgerDirection = 'DEBIT' | 'CREDIT';

export type KhataPaymentMode = 'cash' | 'upi' | 'card' | 'bank_transfer';

export interface CustomerRecord {
  id: string;
  tenantId: string;
  primaryBranchId: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  alternatePhone?: string | null;
  email?: string | null;
  customerType: CustomerType;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  dateOfBirth?: string | null;
  gender?: CustomerGender | null;
  preferredDoctorName?: string | null;
  allergies?: string | null;
  chronicConditions?: string | null;
  gstin?: string | null;
  creditEnabled: boolean;
  creditLimit: number;
  creditTermsDays: 0 | 7 | 15 | 30;
  currentOutstandingBalance: number;
  advanceBalance: number;
  totalPurchases: number;
  totalPayments: number;
  totalVisits: number;
  lastPurchaseDate?: string | null;
  lastPaymentDate?: string | null;
  status: CustomerStatus;
  isArchived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  sharedPhoneConfirmed?: boolean;
  notes?: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SanitizedCustomerRecord extends Omit<CustomerRecord, 'normalizedPhone' | 'currentOutstandingBalance' | 'advanceBalance' | 'creditLimit' | 'totalPayments'> {
  normalizedPhone?: string;
  phoneMasked?: boolean;
  khataRedacted?: boolean;
  currentOutstandingBalance: number | null;
  advanceBalance: number | null;
  creditLimit: number | null;
  totalPayments: number | null;
  availableCredit?: number | null;
  isOverLimit?: boolean;
}

export interface CustomerLedgerEntryRecord {
  id: string;
  tenantId: string;
  branchId: string;
  customerId: string;
  entryType: LedgerEntryType;
  direction: LedgerDirection;
  amount: number;
  appliedToBalance: number;
  advanceDelta: number;
  previousBalance: number;
  runningBalance: number;
  previousAdvanceBalance: number;
  runningAdvanceBalance: number;
  referenceType?: string | null;
  referenceId?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  paymentId?: string | null;
  returnId?: string | null;
  paymentMode?: string | null;
  referenceNumber?: string | null;
  description: string;
  reason?: string | null;
  operationRef?: string | null;
  performedBy: string;
  performedByName?: string | null;
  timestamp: string;
}

export interface PaymentAllocation {
  invoiceId: string;
  invoiceNumber: string;
  allocatedAmount: number;
  previousBalanceDue: number;
  newBalanceDue: number;
}

export interface CustomerPaymentRecord {
  id: string;
  receiptNumber: string;
  tenantId: string;
  branchId: string;
  customerId: string;
  customerName: string;
  amount: number;
  appliedToBalance: number;
  addedToAdvance: number;
  paymentMode: KhataPaymentMode;
  referenceNumber?: string | null;
  paymentDate: string;
  allocations: PaymentAllocation[];
  notes?: string | null;
  recordedBy: string;
  recordedByName?: string | null;
  ledgerEntryId: string;
  timestamp: string;
}

export interface CreateCustomerInput {
  name: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  customerType?: CustomerType;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  dateOfBirth?: string;
  gender?: CustomerGender;
  preferredDoctorName?: string;
  allergies?: string;
  chronicConditions?: string;
  gstin?: string;
  primaryBranchId?: string;
  creditEnabled?: boolean;
  creditLimit?: number;
  creditTermsDays?: 0 | 7 | 15 | 30;
  openingBalance?: number;
  notes?: string;
  confirmSharedPhone?: boolean;
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string;
  alternatePhone?: string | null;
  email?: string | null;
  customerType?: CustomerType;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  dateOfBirth?: string | null;
  gender?: CustomerGender | null;
  preferredDoctorName?: string | null;
  allergies?: string | null;
  chronicConditions?: string | null;
  gstin?: string | null;
  primaryBranchId?: string;
  creditEnabled?: boolean;
  creditTermsDays?: 0 | 7 | 15 | 30;
  notes?: string | null;
  confirmSharedPhone?: boolean;
}

export interface ListCustomersOptions {
  search?: string;
  customerType?: string;
  status?: string;
  includeArchived?: boolean;
  hasOutstanding?: boolean;
  overLimit?: boolean;
  overdue?: boolean;
  branchId?: string;
  page?: number;
  limit?: number;
}

export interface CollectKhataPaymentInput {
  tenantId: string;
  branchId: string;
  customerId: string;
  amount: number;
  paymentMode: KhataPaymentMode;
  referenceNumber?: string;
  paymentDate?: string;
  invoiceId?: string;
  allowAdvance?: boolean;
  notes?: string;
  userId: string;
  userName?: string;
  idempotencyKey: string;
}

export interface IssueCreditNoteInput {
  tenantId: string;
  branchId: string;
  customerId: string;
  amount: number;
  reason: string;
  invoiceId?: string;
  returnId?: string;
  notes?: string;
  reduceInvoiceDue?: boolean;
  userId: string;
  userName?: string;
  idempotencyKey: string;
}

export interface BalanceAdjustmentInput {
  tenantId: string;
  branchId: string;
  customerId: string;
  adjustmentType: 'DEBIT_ADJUSTMENT' | 'CREDIT_ADJUSTMENT' | 'OPENING_BALANCE' | 'REFUND';
  amount: number;
  reason: string;
  referenceNumber?: string;
  notes?: string;
  userId: string;
  userName?: string;
  idempotencyKey: string;
}

export interface ViewerAccess {
  role: string;
  permissions: string[];
  assignedBranchIds: string[];
}

export interface CustomerBalanceDeltaResult {
  previousBalance: number;
  runningBalance: number;
  previousAdvanceBalance: number;
  runningAdvanceBalance: number;
  appliedToBalance: number;
  advanceDelta: number;
}

// ==========================================
// Integer Paise Financial Precision Helpers
// ==========================================

export function toPaise(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new BadRequestError('Monetary amount must be a finite number');
  }
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

/**
 * Normalizes Indian / international phone inputs so '+91 98200 12345', '09820012345', and '9820012345'
 * produce the canonical digit form '919820012345'.
 */
export function normalizePhone(rawPhone: string): string {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) {
    throw new BadRequestError('Customer mobile number is required');
  }
  let normalized = digits;
  if (digits.length === 10) {
    normalized = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    normalized = `91${digits.slice(1)}`;
  }
  if (normalized.length < 10 || normalized.length > 15) {
    throw new BadRequestError('Customer phone number must contain between 10 and 15 digits');
  }
  return normalized;
}

export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '******';
  const last4 = digits.slice(-4);
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ******${last4}`;
  }
  return `******${last4}`;
}

export function computeDueDate(createdAtIso: string, creditTermsDays: number): string {
  const date = new Date(createdAtIso);
  date.setUTCDate(date.getUTCDate() + Math.max(0, Number(creditTermsDays) || 0));
  return date.toISOString();
}

/**
 * Applies a DEBIT or CREDIT operation to a customer's outstanding & advance balances
 * using exact integer paise math.
 * Invariant: (totalDebits - totalCredits) === (currentOutstandingBalance - advanceBalance)
 */
export function applyLedgerBalanceDelta(
  currentOutstanding: number,
  currentAdvance: number,
  params: {
    direction: LedgerDirection;
    amount: number;
    allowAdvance?: boolean;
  }
): CustomerBalanceDeltaResult {
  const prevOutPaise = Math.max(0, toPaise(currentOutstanding || 0));
  const prevAdvPaise = Math.max(0, toPaise(currentAdvance || 0));
  const amtPaise = toPaise(params.amount);

  if (amtPaise <= 0) {
    throw new BadRequestError('Ledger transaction amount must be greater than zero');
  }

  if (params.direction === 'DEBIT') {
    // Consume advance credit first before increasing receivable outstanding balance
    const advConsumedPaise = Math.min(prevAdvPaise, amtPaise);
    const addedToOutPaise = amtPaise - advConsumedPaise;
    const nextOutPaise = prevOutPaise + addedToOutPaise;
    const nextAdvPaise = prevAdvPaise - advConsumedPaise;

    return {
      previousBalance: fromPaise(prevOutPaise),
      runningBalance: fromPaise(nextOutPaise),
      previousAdvanceBalance: fromPaise(prevAdvPaise),
      runningAdvanceBalance: fromPaise(nextAdvPaise),
      appliedToBalance: fromPaise(addedToOutPaise),
      advanceDelta: fromPaise(-advConsumedPaise),
    };
  }

  // CREDIT direction
  if (amtPaise > prevOutPaise && !params.allowAdvance) {
    throw new BadRequestError(
      `Credit amount (₹${fromPaise(amtPaise).toFixed(2)}) exceeds current outstanding balance (₹${fromPaise(prevOutPaise).toFixed(2)}). Enable advance balance explicitly to accept overpayment.`
    );
  }

  const appliedPaise = Math.min(prevOutPaise, amtPaise);
  const addedAdvPaise = amtPaise - appliedPaise;
  const nextOutPaise = prevOutPaise - appliedPaise;
  const nextAdvPaise = prevAdvPaise + addedAdvPaise;

  return {
    previousBalance: fromPaise(prevOutPaise),
    runningBalance: fromPaise(nextOutPaise),
    previousAdvanceBalance: fromPaise(prevAdvPaise),
    runningAdvanceBalance: fromPaise(nextAdvPaise),
    appliedToBalance: fromPaise(appliedPaise),
    advanceDelta: fromPaise(addedAdvPaise),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = canonicalize(v);
    }
    return out;
  }
  return value;
}

function hashPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex');
}

function deterministicId(prefix: string, ...parts: string[]): string {
  const digest = crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 24);
  return `${prefix}_${digest}`;
}

function isInvoiceOverdue(inv: SalesInvoiceRecord, nowMs = Date.now()): boolean {
  if (
    inv.status === 'cancelled' ||
    inv.status === 'returned' ||
    inv.balanceDue <= 0 ||
    !inv.dueDate
  ) {
    return false;
  }
  return new Date(inv.dueDate).getTime() < nowMs;
}

function computeDaysOverdue(dueDateIso?: string, nowMs = Date.now()): number {
  if (!dueDateIso) return 0;
  const diffMs = nowMs - new Date(dueDateIso).getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function mapPaymentModeToLedgerType(mode: KhataPaymentMode): LedgerEntryType {
  switch (mode) {
    case 'cash':
      return 'CASH_PAYMENT';
    case 'upi':
      return 'UPI_PAYMENT';
    case 'card':
      return 'CARD_PAYMENT';
    case 'bank_transfer':
      return 'BANK_TRANSFER';
  }
}

// ==========================================
// Deterministic In-Memory Test Stores & Locks
// ==========================================

const testCustomerStore = new Map<string, CustomerRecord>();
const testCustomerLedgerStore = new Map<string, CustomerLedgerEntryRecord[]>();
const testCustomerPaymentStore = new Map<string, CustomerPaymentRecord[]>();
const testKhataIdempotencyStore = new Map<
  string,
  { key: string; operation: string; payloadHash: string; status: 'completed'; result: unknown }
>();
const testReceiptCounter = new Map<string, number>();
const testCustomerLocks = new Map<string, Promise<unknown>>();

export function clearTestCustomers(): void {
  testCustomerStore.clear();
  testCustomerLedgerStore.clear();
  testCustomerPaymentStore.clear();
  testKhataIdempotencyStore.clear();
  testReceiptCounter.clear();
}

export function setTestCustomer(tenantId: string, customer: CustomerRecord): void {
  testCustomerStore.set(`${tenantId}:${customer.id}`, { ...customer });
}

export function getTestCustomerDirect(tenantId: string, customerId: string): CustomerRecord | undefined {
  const rec = testCustomerStore.get(`${tenantId}:${customerId}`);
  return rec ? { ...rec } : undefined;
}

export function getAllTestCustomersForTenant(tenantId: string): CustomerRecord[] {
  const result: CustomerRecord[] = [];
  for (const [k, v] of testCustomerStore.entries()) {
    if (k.startsWith(`${tenantId}:`)) {
      result.push({ ...v });
    }
  }
  return result;
}

export function appendTestLedgerEntryDirect(
  tenantId: string,
  customerId: string,
  entry: CustomerLedgerEntryRecord
): void {
  const key = `${tenantId}:${customerId}`;
  const list = testCustomerLedgerStore.get(key) || [];
  if (!list.some((e) => e.id === entry.id || (entry.operationRef && e.operationRef === entry.operationRef))) {
    list.push({ ...entry });
    testCustomerLedgerStore.set(key, list);
  }
}

export function getTestLedgerEntriesDirect(tenantId: string, customerId: string): CustomerLedgerEntryRecord[] {
  const key = `${tenantId}:${customerId}`;
  return (testCustomerLedgerStore.get(key) || []).map((e) => ({ ...e }));
}

export function appendTestPaymentDirect(
  tenantId: string,
  customerId: string,
  payment: CustomerPaymentRecord
): void {
  const key = `${tenantId}:${customerId}`;
  const list = testCustomerPaymentStore.get(key) || [];
  if (!list.some((p) => p.id === payment.id)) {
    list.push({ ...payment });
    testCustomerPaymentStore.set(key, list);
  }
}

export function getTestPaymentsDirect(tenantId: string, customerId: string): CustomerPaymentRecord[] {
  const key = `${tenantId}:${customerId}`;
  return (testCustomerPaymentStore.get(key) || []).map((p) => ({ ...p }));
}

export async function withTestCustomerLock<T>(
  tenantId: string,
  customerId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = `${tenantId}:${customerId}`;
  const previous = testCustomerLocks.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => current, () => current);
  testCustomerLocks.set(lockKey, chained);

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (testCustomerLocks.get(lockKey) === chained) {
      testCustomerLocks.delete(lockKey);
    }
  }
}

function escapeCsvCell(val: unknown): string {
  const str = String(val ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sanitizePdfText(str: string): string {
  return String(str || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Generates a compact, standards-compliant PDF 1.4 statement buffer without native binary dependencies.
 */
function generateStatementPdfBuffer(lines: string[]): Buffer {
  const maxLinesPerPage = 44;
  const pageChunks: string[][] = [];
  for (let i = 0; i < lines.length; i += maxLinesPerPage) {
    pageChunks.push(lines.slice(i, i + maxLinesPerPage));
  }
  if (pageChunks.length === 0) {
    pageChunks.push(['PharmaDesk Customer Khata Statement']);
  }

  const objects: string[] = [];
  // 1: Catalog, 2: Pages, 3: Font
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  const pageObjectIds: number[] = [];
  const nextObjStart = 4;
  for (let p = 0; p < pageChunks.length; p++) {
    pageObjectIds.push(nextObjStart + p * 2);
  }

  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageChunks.length} >>\nendobj\n`
  );
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n');

  pageChunks.forEach((chunk, idx) => {
    const pageId = nextObjStart + idx * 2;
    const contentId = pageId + 1;
    const streamCommands: string[] = ['BT', '/F1 9 Tf', '40 760 Td', '14 TL'];
    chunk.forEach((line, lineIdx) => {
      if (lineIdx === 0) {
        streamCommands.push(`(${sanitizePdfText(line)}) Tj`);
      } else {
        streamCommands.push(`T* (${sanitizePdfText(line)}) Tj`);
      }
    });
    streamCommands.push('ET');
    const streamBody = streamCommands.join('\n');

    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(streamBody, 'utf8')} >>\nstream\n${streamBody}\nendstream\nendobj\n`
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

export class CustomerService {
  private static isTest(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST)
    );
  }

  public static hasViewerPermission(viewer: ViewerAccess | undefined, perm: string): boolean {
    if (!viewer) return true;
    if (viewer.role === 'owner') return true;
    return viewer.permissions.includes(perm);
  }

  /**
   * Masks phone numbers and financial Khata fields based on viewer RBAC permissions.
   */
  public static sanitizeCustomerForViewer(
    customer: CustomerRecord,
    viewer?: ViewerAccess
  ): SanitizedCustomerRecord {
    const canViewPhone = this.hasViewerPermission(viewer, 'customers.view_phone');
    const canViewKhata = this.hasViewerPermission(viewer, 'customers.khata_view');

    const base: SanitizedCustomerRecord = {
      ...customer,
      phone: canViewPhone ? customer.phone : (maskPhone(customer.phone) || '******'),
      alternatePhone: canViewPhone
        ? customer.alternatePhone
        : maskPhone(customer.alternatePhone),
      phoneMasked: !canViewPhone,
      khataRedacted: !canViewKhata,
      currentOutstandingBalance: canViewKhata ? customer.currentOutstandingBalance : null,
      advanceBalance: canViewKhata ? customer.advanceBalance : null,
      creditLimit: canViewKhata ? customer.creditLimit : null,
      totalPayments: canViewKhata ? customer.totalPayments : null,
      availableCredit: canViewKhata
        ? roundPaise(Math.max(0, customer.creditLimit - customer.currentOutstandingBalance + customer.advanceBalance))
        : null,
      isOverLimit: canViewKhata
        ? customer.creditLimit > 0 && customer.currentOutstandingBalance > customer.creditLimit
        : undefined,
    };

    if (!canViewPhone) {
      delete base.normalizedPhone;
    }

    return base;
  }

  private static async loadRawCustomer(tenantId: string, customerId: string): Promise<CustomerRecord> {
    if (this.isTest()) {
      const cust = testCustomerStore.get(`${tenantId}:${customerId}`);
      if (!cust) {
        throw new NotFoundError(`Customer '${customerId}' not found`);
      }
      return { ...cust };
    }

    const doc = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('customers')
      .doc(customerId)
      .get();

    if (!doc.exists) {
      throw new NotFoundError(`Customer '${customerId}' not found`);
    }
    return doc.data() as CustomerRecord;
  }

  private static async loadAllRawCustomers(tenantId: string): Promise<CustomerRecord[]> {
    if (this.isTest()) {
      return getAllTestCustomersForTenant(tenantId);
    }
    const snap = await firestore().collection('tenants').doc(tenantId).collection('customers').get();
    return snap.docs.map((d) => d.data() as CustomerRecord);
  }

  private static async loadAllInvoicesForCustomer(
    tenantId: string,
    customerId: string
  ): Promise<SalesInvoiceRecord[]> {
    if (this.isTest()) {
      return getAllTestInvoicesForTenant(tenantId).filter((inv) => inv.customerId === customerId);
    }

    const snap = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('sales_invoices')
      .where('customerId', '==', customerId)
      .get();
    return snap.docs.map((d) => d.data() as SalesInvoiceRecord);
  }

  private static async loadAllLedgerEntries(
    tenantId: string,
    customerId: string
  ): Promise<CustomerLedgerEntryRecord[]> {
    if (this.isTest()) {
      return getTestLedgerEntriesDirect(tenantId, customerId);
    }

    const snap = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('customers')
      .doc(customerId)
      .collection('ledger')
      .orderBy('timestamp', 'asc')
      .get();
    return snap.docs.map((d) => d.data() as CustomerLedgerEntryRecord);
  }

  private static async loadAllCustomerPayments(
    tenantId: string,
    customerId: string
  ): Promise<CustomerPaymentRecord[]> {
    if (this.isTest()) {
      return getTestPaymentsDirect(tenantId, customerId);
    }

    const snap = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('customers')
      .doc(customerId)
      .collection('payments')
      .orderBy('timestamp', 'desc')
      .get();
    return snap.docs.map((d) => d.data() as CustomerPaymentRecord);
  }

  // ==========================================
  // 1. Customer CRUD & Archival
  // ==========================================

  public static async createCustomer(
    tenantId: string,
    branchId: string,
    input: CreateCustomerInput,
    userId: string,
    userName?: string,
    viewer?: ViewerAccess
  ): Promise<SanitizedCustomerRecord> {
    const cleanName = String(input.name || '').trim();
    if (cleanName.length < 2) {
      throw new BadRequestError('Customer name must be at least 2 characters');
    }

    const normalized = normalizePhone(input.phone);
    const creditLimit = roundPaise(Math.max(0, Number(input.creditLimit ?? 0)));
    const openingBalance = roundPaise(Math.max(0, Number(input.openingBalance ?? 0)));
    const creditTermsDays = ([0, 7, 15, 30].includes(Number(input.creditTermsDays))
      ? Number(input.creditTermsDays)
      : 15) as 0 | 7 | 15 | 30;
    const creditEnabled = input.creditEnabled ?? true;

    const now = new Date().toISOString();
    const customerId = `cust_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    // Duplicate phone guard (allows explicit shared family/clinic confirmation)
    const existingCustomers = await this.loadAllRawCustomers(tenantId);
    const duplicate = existingCustomers.find(
      (c) => !c.isArchived && c.normalizedPhone === normalized
    );
    if (duplicate && !input.confirmSharedPhone) {
      throw new ConflictError(
        `A customer with mobile number '${input.phone}' already exists (${duplicate.name}). Pass confirmSharedPhone: true to link a shared family/clinic account.`
      );
    }

    const customerRecord: CustomerRecord = {
      id: customerId,
      tenantId,
      primaryBranchId: input.primaryBranchId || branchId,
      name: cleanName,
      phone: input.phone.trim(),
      normalizedPhone: normalized,
      alternatePhone: input.alternatePhone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      customerType: input.customerType || 'REGULAR',
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      pincode: input.pincode?.trim() || null,
      dateOfBirth: input.dateOfBirth?.trim() || null,
      gender: input.gender || null,
      preferredDoctorName: input.preferredDoctorName?.trim() || null,
      allergies: input.allergies?.trim() || null,
      chronicConditions: input.chronicConditions?.trim() || null,
      gstin: input.gstin?.trim().toUpperCase() || null,
      creditEnabled,
      creditLimit,
      creditTermsDays,
      currentOutstandingBalance: openingBalance,
      advanceBalance: 0,
      totalPurchases: 0,
      totalPayments: 0,
      totalVisits: 0,
      lastPurchaseDate: null,
      lastPaymentDate: null,
      status: 'ACTIVE',
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      sharedPhoneConfirmed: Boolean(duplicate && input.confirmSharedPhone),
      notes: input.notes?.trim() || null,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    let openingEntry: CustomerLedgerEntryRecord | null = null;
    if (openingBalance > 0) {
      openingEntry = {
        id: deterministicId('led', customerId, 'opening'),
        tenantId,
        branchId: customerRecord.primaryBranchId,
        customerId,
        entryType: 'OPENING_BALANCE',
        direction: 'DEBIT',
        amount: openingBalance,
        appliedToBalance: openingBalance,
        advanceDelta: 0,
        previousBalance: 0,
        runningBalance: openingBalance,
        previousAdvanceBalance: 0,
        runningAdvanceBalance: 0,
        referenceType: 'opening_balance',
        referenceId: customerId,
        description: 'Opening Khata balance carried forward',
        reason: 'Customer onboarding opening balance',
        operationRef: `opening:${customerId}`,
        performedBy: userId,
        performedByName: userName || userId,
        timestamp: now,
      };
    }

    if (this.isTest()) {
      setTestCustomer(tenantId, customerRecord);
      if (openingEntry) {
        appendTestLedgerEntryDirect(tenantId, customerId, openingEntry);
      }
    } else {
      const db = firestore();
      const custRef = db.collection('tenants').doc(tenantId).collection('customers').doc(customerId);
      await db.runTransaction(async (tx) => {
        tx.set(custRef, customerRecord);
        if (openingEntry) {
          tx.set(custRef.collection('ledger').doc(openingEntry.id), openingEntry);
        }
      });
    }

    if (openingBalance > 0) {
      try {
        await AccountingService.recordCustomerOpeningBalanceAccounting({
          tenantId,
          branchId: customerRecord.primaryBranchId,
          customerId,
          customerName: customerRecord.name,
          openingBalance,
          createdAt: now,
          userId,
        });
      } catch (accErr) {
        logger.error({ err: accErr, customerId }, 'Customer opening balance accounting hook failed');
      }
    }

    await AuditService.log({
      tenantId,
      action: 'CUSTOMER_CREATED',
      actingUserId: userId,
      metadata: {
        customerId,
        customerName: cleanName,
        customerType: customerRecord.customerType,
        creditLimit,
        openingBalance,
        sharedPhoneConfirmed: customerRecord.sharedPhoneConfirmed,
      },
    });

    return this.sanitizeCustomerForViewer(customerRecord, viewer);
  }

  public static async updateCustomer(
    tenantId: string,
    customerId: string,
    input: UpdateCustomerInput,
    userId: string,
    viewer?: ViewerAccess
  ): Promise<SanitizedCustomerRecord> {
    // Reject any attempt to directly tamper with financial balance fields
    const rawInput = input as Record<string, unknown>;
    const forbiddenFields = [
      'currentOutstandingBalance',
      'advanceBalance',
      'totalPurchases',
      'totalPayments',
      'khataBalance',
      'creditLimit',
    ];
    for (const field of forbiddenFields) {
      if (rawInput[field] !== undefined) {
        throw new BadRequestError(
          `Field '${field}' cannot be modified via profile update. Use dedicated credit-limit or audited Khata ledger endpoints.`
        );
      }
    }

    const existing = await this.loadRawCustomer(tenantId, customerId);
    if (existing.isArchived) {
      throw new BadRequestError('Cannot update an archived customer account');
    }

    let updatedPhone = existing.phone;
    let updatedNormalizedPhone = existing.normalizedPhone;
    let sharedPhoneConfirmed = existing.sharedPhoneConfirmed;

    if (input.phone !== undefined) {
      const normalized = normalizePhone(input.phone);
      if (normalized !== existing.normalizedPhone) {
        const all = await this.loadAllRawCustomers(tenantId);
        const dup = all.find(
          (c) => c.id !== customerId && !c.isArchived && c.normalizedPhone === normalized
        );
        if (dup && !input.confirmSharedPhone) {
          throw new ConflictError(
            `Phone number '${input.phone}' already belongs to customer '${dup.name}'. Pass confirmSharedPhone: true if shared.`
          );
        }
        sharedPhoneConfirmed = Boolean(dup && input.confirmSharedPhone);
      }
      updatedPhone = input.phone.trim();
      updatedNormalizedPhone = normalized;
    }

    const now = new Date().toISOString();
    const updated: CustomerRecord = {
      ...existing,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      phone: updatedPhone,
      normalizedPhone: updatedNormalizedPhone,
      alternatePhone: input.alternatePhone !== undefined ? input.alternatePhone : existing.alternatePhone,
      email: input.email !== undefined ? input.email?.toLowerCase() ?? null : existing.email,
      customerType: input.customerType ?? existing.customerType,
      address: input.address !== undefined ? input.address : existing.address,
      city: input.city !== undefined ? input.city : existing.city,
      state: input.state !== undefined ? input.state : existing.state,
      pincode: input.pincode !== undefined ? input.pincode : existing.pincode,
      dateOfBirth: input.dateOfBirth !== undefined ? input.dateOfBirth : existing.dateOfBirth,
      gender: input.gender !== undefined ? input.gender : existing.gender,
      preferredDoctorName:
        input.preferredDoctorName !== undefined ? input.preferredDoctorName : existing.preferredDoctorName,
      allergies: input.allergies !== undefined ? input.allergies : existing.allergies,
      chronicConditions:
        input.chronicConditions !== undefined ? input.chronicConditions : existing.chronicConditions,
      gstin: input.gstin !== undefined ? (input.gstin ? input.gstin.toUpperCase() : null) : existing.gstin,
      primaryBranchId: input.primaryBranchId ?? existing.primaryBranchId,
      creditEnabled: input.creditEnabled ?? existing.creditEnabled,
      creditTermsDays: input.creditTermsDays ?? existing.creditTermsDays,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      sharedPhoneConfirmed,
      updatedBy: userId,
      updatedAt: now,
    };

    if (this.isTest()) {
      setTestCustomer(tenantId, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('customers')
        .doc(customerId)
        .set(updated, { merge: true });
    }

    await AuditService.log({
      tenantId,
      action: 'CUSTOMER_UPDATED',
      actingUserId: userId,
      metadata: {
        customerId,
        updatedFields: Object.keys(input),
      },
    });

    return this.sanitizeCustomerForViewer(updated, viewer);
  }

  public static async updateCustomerStatus(
    tenantId: string,
    customerId: string,
    status: CustomerStatus,
    reason: string | undefined,
    userId: string,
    viewer?: ViewerAccess
  ): Promise<SanitizedCustomerRecord> {
    const existing = await this.loadRawCustomer(tenantId, customerId);
    if (existing.isArchived) {
      throw new BadRequestError('Cannot change status of an archived customer');
    }

    const now = new Date().toISOString();
    const updated: CustomerRecord = {
      ...existing,
      status,
      updatedBy: userId,
      updatedAt: now,
    };

    if (this.isTest()) {
      setTestCustomer(tenantId, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('customers')
        .doc(customerId)
        .update({ status, updatedBy: userId, updatedAt: now });
    }

    await AuditService.log({
      tenantId,
      action: 'CUSTOMER_STATUS_UPDATED',
      actingUserId: userId,
      metadata: {
        customerId,
        previousStatus: existing.status,
        newStatus: status,
        reason: reason || 'Account standing updated',
      },
    });

    return this.sanitizeCustomerForViewer(updated, viewer);
  }

  public static async archiveCustomer(
    tenantId: string,
    customerId: string,
    reason: string | undefined,
    userId: string,
    viewer?: ViewerAccess
  ): Promise<SanitizedCustomerRecord> {
    const existing = await this.loadRawCustomer(tenantId, customerId);
    if (existing.isArchived) {
      return this.sanitizeCustomerForViewer(existing, viewer);
    }
    if (toPaise(existing.currentOutstandingBalance) > 0) {
      throw new BadRequestError(
        `Cannot archive customer '${existing.name}' with outstanding Khata balance of ₹${existing.currentOutstandingBalance.toFixed(2)}. Settle or adjust balance to ₹0.00 first.`
      );
    }
    if (toPaise(existing.advanceBalance) > 0) {
      throw new BadRequestError(
        `Cannot archive customer '${existing.name}' with unused advance balance of ₹${existing.advanceBalance.toFixed(2)}. Refund or apply advance first.`
      );
    }

    const now = new Date().toISOString();
    const updated: CustomerRecord = {
      ...existing,
      status: 'INACTIVE',
      isArchived: true,
      archivedAt: now,
      archivedBy: userId,
      updatedBy: userId,
      updatedAt: now,
    };

    if (this.isTest()) {
      setTestCustomer(tenantId, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('customers')
        .doc(customerId)
        .update({
          status: 'INACTIVE',
          isArchived: true,
          archivedAt: now,
          archivedBy: userId,
          updatedBy: userId,
          updatedAt: now,
        });
    }

    await AuditService.log({
      tenantId,
      action: 'CUSTOMER_ARCHIVED',
      actingUserId: userId,
      metadata: {
        customerId,
        customerName: existing.name,
        reason: reason || 'Archived per store request',
      },
    });

    return this.sanitizeCustomerForViewer(updated, viewer);
  }

  public static async getCustomerById(
    tenantId: string,
    customerId: string,
    viewer?: ViewerAccess
  ): Promise<SanitizedCustomerRecord> {
    const raw = await this.loadRawCustomer(tenantId, customerId);
    return this.sanitizeCustomerForViewer(raw, viewer);
  }

  public static async listCustomers(
    tenantId: string,
    options: ListCustomersOptions = {},
    viewer?: ViewerAccess
  ): Promise<{
    customers: SanitizedCustomerRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 25));

    let list = await this.loadAllRawCustomers(tenantId);
    if (!options.includeArchived) {
      list = list.filter((c) => !c.isArchived);
    }
    if (options.branchId && options.branchId !== 'all') {
      list = list.filter((c) => !c.primaryBranchId || c.primaryBranchId === options.branchId);
    }
    if (options.customerType && options.customerType !== 'all') {
      list = list.filter((c) => c.customerType === options.customerType);
    }
    if (options.status && options.status !== 'all') {
      list = list.filter((c) => c.status === options.status);
    }
    if (options.hasOutstanding) {
      list = list.filter((c) => c.currentOutstandingBalance > 0);
    }
    if (options.overLimit) {
      list = list.filter((c) => c.creditLimit > 0 && c.currentOutstandingBalance > c.creditLimit);
    }
    if (options.overdue) {
      const invoices = this.isTest()
        ? getAllTestInvoicesForTenant(tenantId)
        : (await firestore().collection('tenants').doc(tenantId).collection('sales_invoices').get()).docs.map(
            (d) => d.data() as SalesInvoiceRecord
          );
      const nowMs = Date.now();
      const overdueCustomerIds = new Set(
        invoices.filter((inv) => inv.customerId && isInvoiceOverdue(inv, nowMs)).map((inv) => inv.customerId!)
      );
      list = list.filter((c) => overdueCustomerIds.has(c.id));
    }
    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      const canViewPhone = this.hasViewerPermission(viewer, 'customers.view_phone');
      const digitsOnly = q.replace(/\D/g, '');
      list = list.filter((c) => {
        if (c.name.toLowerCase().includes(q)) return true;
        if (c.preferredDoctorName?.toLowerCase().includes(q)) return true;
        if (c.city?.toLowerCase().includes(q)) return true;
        if (canViewPhone) {
          if (c.phone.toLowerCase().includes(q)) return true;
          if (digitsOnly && c.normalizedPhone.includes(digitsOnly)) return true;
        } else {
          // If phone is masked, only allow matching the last 4 digits
          if (digitsOnly.length >= 3 && digitsOnly.length <= 4 && c.normalizedPhone.endsWith(digitsOnly)) {
            return true;
          }
        }
        return false;
      });
    }

    list.sort((a, b) => a.name.localeCompare(b.name));

    const total = list.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = list
      .slice((page - 1) * limit, page * limit)
      .map((c) => this.sanitizeCustomerForViewer(c, viewer));

    return { customers: paginated, total, page, limit, totalPages };
  }

  // ==========================================
  // 2. Credit Limit Management & Validation
  // ==========================================

  public static async updateCreditLimit(
    tenantId: string,
    customerId: string,
    input: { creditLimit: number; creditEnabled?: boolean; creditTermsDays?: 0 | 7 | 15 | 30; reason?: string },
    userId: string,
    viewer?: ViewerAccess
  ): Promise<SanitizedCustomerRecord> {
    if (typeof input.creditLimit !== 'number' || input.creditLimit < 0) {
      throw new BadRequestError('Credit limit must be a non-negative number');
    }

    const existing = await this.loadRawCustomer(tenantId, customerId);
    if (existing.isArchived) {
      throw new BadRequestError('Cannot modify credit limit on an archived customer');
    }

    const newLimit = roundPaise(input.creditLimit);
    const newEnabled = input.creditEnabled ?? existing.creditEnabled;
    const newTerms = (input.creditTermsDays !== undefined ? input.creditTermsDays : existing.creditTermsDays) as
      | 0
      | 7
      | 15
      | 30;
    const now = new Date().toISOString();

    const updated: CustomerRecord = {
      ...existing,
      creditLimit: newLimit,
      creditEnabled: newEnabled,
      creditTermsDays: newTerms,
      updatedBy: userId,
      updatedAt: now,
    };

    if (this.isTest()) {
      setTestCustomer(tenantId, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('customers')
        .doc(customerId)
        .update({
          creditLimit: newLimit,
          creditEnabled: newEnabled,
          creditTermsDays: newTerms,
          updatedBy: userId,
          updatedAt: now,
        });
    }

    await AuditService.log({
      tenantId,
      action: 'CUSTOMER_CREDIT_LIMIT_UPDATED',
      actingUserId: userId,
      metadata: {
        customerId,
        customerName: existing.name,
        previousCreditLimit: existing.creditLimit,
        newCreditLimit: newLimit,
        creditEnabled: newEnabled,
        creditTermsDays: newTerms,
        reason: input.reason || 'Credit policy updated',
      },
    });

    return this.sanitizeCustomerForViewer(updated, viewer);
  }

  // ==========================================
  // 3. Purchase History (from real sales_invoices)
  // ==========================================

  public static async getCustomerPurchases(
    tenantId: string,
    customerId: string,
    options: {
      dateFrom?: string;
      dateTo?: string;
      paymentStatus?: string;
      search?: string;
      branchId?: string;
      page?: number;
      limit?: number;
    } = {},
    viewer?: ViewerAccess
  ): Promise<{
    invoices: Array<
      SalesInvoiceRecord & {
        isOverdue: boolean;
        daysOverdue: number;
      }
    >;
    summary: {
      totalInvoices: number;
      totalPurchased: number;
      totalPaid: number;
      totalBalanceDue: number;
      overdueInvoices: number;
    };
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    await this.loadRawCustomer(tenantId, customerId);

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 25));

    let invoices = await this.loadAllInvoicesForCustomer(tenantId, customerId);

    // Branch isolation for non-owner roles
    if (viewer && viewer.role !== 'owner') {
      invoices = invoices.filter((inv) => viewer.assignedBranchIds.includes(inv.branchId));
    }

    if (options.branchId && options.branchId !== 'all') {
      invoices = invoices.filter((inv) => inv.branchId === options.branchId);
    }
    if (options.paymentStatus && options.paymentStatus !== 'all') {
      invoices = invoices.filter((inv) => inv.paymentStatus === options.paymentStatus);
    }
    if (options.dateFrom) {
      invoices = invoices.filter((inv) => inv.createdAt >= options.dateFrom!);
    }
    if (options.dateTo) {
      const endDate = options.dateTo.length === 10 ? `${options.dateTo}T23:59:59.999Z` : options.dateTo;
      invoices = invoices.filter((inv) => inv.createdAt <= endDate);
    }
    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      invoices = invoices.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.items.some((item) => item.medicineName.toLowerCase().includes(q))
      );
    }

    invoices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const nowMs = Date.now();
    const canViewPhone = this.hasViewerPermission(viewer, 'customers.view_phone');

    const enriched = invoices.map((inv) => {
      const overdue = isInvoiceOverdue(inv, nowMs);
      return {
        ...inv,
        customer: canViewPhone
          ? inv.customer
          : { ...inv.customer, phone: maskPhone(inv.customer.phone) || undefined },
        isOverdue: overdue,
        daysOverdue: overdue ? computeDaysOverdue(inv.dueDate, nowMs) : 0,
      };
    });

    const summary = enriched.reduce(
      (acc, inv) => {
        if (inv.status !== 'cancelled') {
          acc.totalInvoices += 1;
          acc.totalPurchased = roundPaise(acc.totalPurchased + inv.grandTotal);
          acc.totalPaid = roundPaise(acc.totalPaid + inv.amountPaid);
          acc.totalBalanceDue = roundPaise(acc.totalBalanceDue + inv.balanceDue);
          if (inv.isOverdue) acc.overdueInvoices += 1;
        }
        return acc;
      },
      { totalInvoices: 0, totalPurchased: 0, totalPaid: 0, totalBalanceDue: 0, overdueInvoices: 0 }
    );

    const total = enriched.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = enriched.slice((page - 1) * limit, page * limit);

    return { invoices: paginated, summary, total, page, limit, totalPages };
  }

  // ==========================================
  // 4. Ledger & Reconciliation
  // ==========================================

  public static async getCustomerLedger(
    tenantId: string,
    customerId: string,
    options: {
      dateFrom?: string;
      dateTo?: string;
      entryType?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    entries: CustomerLedgerEntryRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    await this.loadRawCustomer(tenantId, customerId);

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));

    let entries = await this.loadAllLedgerEntries(tenantId, customerId);
    if (options.entryType && options.entryType !== 'all') {
      entries = entries.filter((e) => e.entryType === options.entryType);
    }
    if (options.dateFrom) {
      entries = entries.filter((e) => e.timestamp >= options.dateFrom!);
    }
    if (options.dateTo) {
      const endDate = options.dateTo.length === 10 ? `${options.dateTo}T23:59:59.999Z` : options.dateTo;
      entries = entries.filter((e) => e.timestamp <= endDate);
    }

    // Reverse chronological for UI display (newest first)
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const total = entries.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = entries.slice((page - 1) * limit, page * limit);

    return { entries: paginated, total, page, limit, totalPages };
  }

  public static async reconcileCustomerBalance(
    tenantId: string,
    customerId: string
  ): Promise<{
    customerId: string;
    totalDebits: number;
    totalCredits: number;
    netLedgerBalance: number;
    expectedOutstandingBalance: number;
    expectedAdvanceBalance: number;
    storedOutstandingBalance: number;
    storedAdvanceBalance: number;
    discrepancy: number;
    isBalanced: boolean;
    entryCount: number;
  }> {
    const customer = await this.loadRawCustomer(tenantId, customerId);
    const entries = await this.loadAllLedgerEntries(tenantId, customerId);

    let debitsPaise = 0;
    let creditsPaise = 0;
    for (const e of entries) {
      const amtPaise = toPaise(e.amount);
      if (e.direction === 'DEBIT') {
        debitsPaise += amtPaise;
      } else {
        creditsPaise += amtPaise;
      }
    }

    const netPaise = debitsPaise - creditsPaise;
    const expectedOutPaise = Math.max(0, netPaise);
    const expectedAdvPaise = Math.max(0, -netPaise);

    const storedOutPaise = toPaise(customer.currentOutstandingBalance);
    const storedAdvPaise = toPaise(customer.advanceBalance || 0);
    const storedNetPaise = storedOutPaise - storedAdvPaise;
    const discrepancyPaise = storedNetPaise - netPaise;

    return {
      customerId,
      totalDebits: fromPaise(debitsPaise),
      totalCredits: fromPaise(creditsPaise),
      netLedgerBalance: fromPaise(netPaise),
      expectedOutstandingBalance: fromPaise(expectedOutPaise),
      expectedAdvanceBalance: fromPaise(expectedAdvPaise),
      storedOutstandingBalance: customer.currentOutstandingBalance,
      storedAdvanceBalance: customer.advanceBalance || 0,
      discrepancy: fromPaise(discrepancyPaise),
      isBalanced: discrepancyPaise === 0,
      entryCount: entries.length,
    };
  }

  // ==========================================
  // 5. Khata Payment Collection (Atomic + FIFO + Idempotent)
  // ==========================================

  public static async listCustomerPayments(
    tenantId: string,
    customerId: string
  ): Promise<CustomerPaymentRecord[]> {
    await this.loadRawCustomer(tenantId, customerId);
    return this.loadAllCustomerPayments(tenantId, customerId);
  }

  public static async collectKhataPayment(
    input: CollectKhataPaymentInput
  ): Promise<{
    payment: CustomerPaymentRecord;
    customer: CustomerRecord;
    ledgerEntry: CustomerLedgerEntryRecord;
    fromCache?: boolean;
  }> {
    const {
      tenantId,
      branchId,
      customerId,
      amount,
      paymentMode,
      referenceNumber,
      paymentDate,
      invoiceId,
      allowAdvance = false,
      notes,
      userId,
      userName = 'Billing Staff',
      idempotencyKey,
    } = input;

    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestError('Idempotency key must be at least 8 characters');
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestError('Payment amount must be greater than zero');
    }
    if (!['cash', 'upi', 'card', 'bank_transfer'].includes(paymentMode)) {
      throw new BadRequestError(
        `Invalid Khata repayment mode '${paymentMode}'. Allowed modes: cash, upi, card, bank_transfer.`
      );
    }

    const cleanKey = idempotencyKey.trim();
    const payAmount = fromPaise(toPaise(amount));
    const payloadHash = hashPayload({
      branchId,
      customerId,
      amount: payAmount,
      paymentMode,
      referenceNumber: referenceNumber?.trim(),
      invoiceId,
      allowAdvance,
      notes: notes?.trim(),
    });

    const idempDocId = deterministicId('idemp_kpay', tenantId, branchId, customerId, cleanKey);
    const testIdempKey = `${tenantId}:${branchId}:khata_payment:${customerId}:${cleanKey}`;
    const paymentId = deterministicId('kpay', tenantId, branchId, customerId, cleanKey);
    const ledgerEntryId = deterministicId('led', tenantId, customerId, 'pay', cleanKey);

    const buildPaymentMutations = (
      customer: CustomerRecord,
      candidateInvoices: SalesInvoiceRecord[],
      seqNumber: number
    ) => {
      if (customer.isArchived) {
        throw new BadRequestError('Cannot collect payment for an archived customer');
      }

      const now = new Date().toISOString();
      const effectivePayDate = paymentDate || now;

      // Determine balance change using integer paise precision
      const delta = applyLedgerBalanceDelta(
        customer.currentOutstandingBalance,
        customer.advanceBalance || 0,
        {
          direction: 'CREDIT',
          amount: payAmount,
          allowAdvance,
        }
      );

      const appliedPaise = toPaise(delta.appliedToBalance);
      const allocations: PaymentAllocation[] = [];
      const updatedInvoices: SalesInvoiceRecord[] = [];

      if (invoiceId) {
        const target = candidateInvoices.find((inv) => inv.id === invoiceId);
        if (!target) {
          throw new NotFoundError(`Invoice '${invoiceId}' not found for customer '${customer.name}'`);
        }
        if (target.status === 'cancelled' || target.status === 'returned') {
          throw new BadRequestError(`Cannot allocate payment to ${target.status} invoice '${target.invoiceNumber}'`);
        }
        const duePaise = toPaise(target.balanceDue);
        if (duePaise <= 0) {
          throw new BadRequestError(`Invoice '${target.invoiceNumber}' has zero balance due`);
        }
        if (toPaise(payAmount) > duePaise && !allowAdvance) {
          throw new BadRequestError(
            `Payment amount (₹${payAmount.toFixed(2)}) exceeds balance due (₹${target.balanceDue.toFixed(2)}) on invoice ${target.invoiceNumber}`
          );
        }
        const allocPaise = Math.min(duePaise, appliedPaise);
        if (allocPaise > 0) {
          const allocAmt = fromPaise(allocPaise);
          const newDue = fromPaise(duePaise - allocPaise);
          const newPaid = fromPaise(toPaise(target.amountPaid) + allocPaise);
          const newPayStatus: SalesInvoiceRecord['paymentStatus'] =
            newDue === 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

          allocations.push({
            invoiceId: target.id,
            invoiceNumber: target.invoiceNumber,
            allocatedAmount: allocAmt,
            previousBalanceDue: target.balanceDue,
            newBalanceDue: newDue,
          });

          updatedInvoices.push({
            ...target,
            amountPaid: newPaid,
            balanceDue: newDue,
            paymentStatus: newPayStatus,
            payments: [
              ...(target.payments || []),
              {
                id: paymentId,
                mode: paymentMode,
                amount: allocAmt,
                referenceNumber: referenceNumber?.trim(),
                timestamp: now,
              },
            ],
            updatedAt: now,
          });
        }
      } else {
        // FIFO oldest unpaid invoice first allocation
        const unpaidInvoices = candidateInvoices
          .filter(
            (inv) =>
              inv.status !== 'cancelled' &&
              inv.status !== 'returned' &&
              toPaise(inv.balanceDue) > 0
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

        let remainingAllocPaise = appliedPaise;
        for (const inv of unpaidInvoices) {
          if (remainingAllocPaise <= 0) break;
          const duePaise = toPaise(inv.balanceDue);
          const allocPaise = Math.min(duePaise, remainingAllocPaise);
          if (allocPaise <= 0) continue;

          const allocAmt = fromPaise(allocPaise);
          const newDue = fromPaise(duePaise - allocPaise);
          const newPaid = fromPaise(toPaise(inv.amountPaid) + allocPaise);
          const newPayStatus: SalesInvoiceRecord['paymentStatus'] =
            newDue === 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

          allocations.push({
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            allocatedAmount: allocAmt,
            previousBalanceDue: inv.balanceDue,
            newBalanceDue: newDue,
          });

          updatedInvoices.push({
            ...inv,
            amountPaid: newPaid,
            balanceDue: newDue,
            paymentStatus: newPayStatus,
            payments: [
              ...(inv.payments || []),
              {
                id: paymentId,
                mode: paymentMode,
                amount: allocAmt,
                referenceNumber: referenceNumber?.trim(),
                timestamp: now,
              },
            ],
            updatedAt: now,
          });

          remainingAllocPaise -= allocPaise;
        }
      }

      const year = new Date().getFullYear();
      const receiptNumber = `RCP-${year}-${String(seqNumber).padStart(6, '0')}`;

      const paymentRecord: CustomerPaymentRecord = {
        id: paymentId,
        receiptNumber,
        tenantId,
        branchId,
        customerId,
        customerName: customer.name,
        amount: payAmount,
        appliedToBalance: delta.appliedToBalance,
        addedToAdvance: delta.advanceDelta,
        paymentMode,
        referenceNumber: referenceNumber?.trim() || null,
        paymentDate: effectivePayDate,
        allocations,
        notes: notes?.trim() || null,
        recordedBy: userId,
        recordedByName: userName,
        ledgerEntryId,
        timestamp: now,
      };

      const ledgerEntry: CustomerLedgerEntryRecord = {
        id: ledgerEntryId,
        tenantId,
        branchId,
        customerId,
        entryType: mapPaymentModeToLedgerType(paymentMode),
        direction: 'CREDIT',
        amount: payAmount,
        appliedToBalance: delta.appliedToBalance,
        advanceDelta: delta.advanceDelta,
        previousBalance: delta.previousBalance,
        runningBalance: delta.runningBalance,
        previousAdvanceBalance: delta.previousAdvanceBalance,
        runningAdvanceBalance: delta.runningAdvanceBalance,
        referenceType: 'khata_payment',
        referenceId: paymentId,
        invoiceId: allocations.length === 1 ? allocations[0]!.invoiceId : null,
        invoiceNumber:
          allocations.length > 0
            ? allocations.map((a) => a.invoiceNumber).join(', ')
            : null,
        paymentId,
        paymentMode,
        referenceNumber: referenceNumber?.trim() || null,
        description:
          allocations.length > 0
            ? `Khata ${paymentMode.toUpperCase()} payment (${receiptNumber}) allocated to ${allocations.map((a) => a.invoiceNumber).join(', ')}`
            : `Khata ${paymentMode.toUpperCase()} payment (${receiptNumber})`,
        reason: notes?.trim() || 'Customer Khata settlement',
        operationRef: `khata_payment:${cleanKey}`,
        performedBy: userId,
        performedByName: userName,
        timestamp: now,
      };

      const updatedCustomer: CustomerRecord = {
        ...customer,
        currentOutstandingBalance: delta.runningBalance,
        advanceBalance: delta.runningAdvanceBalance,
        totalPayments: fromPaise(toPaise(customer.totalPayments || 0) + toPaise(payAmount)),
        lastPaymentDate: effectivePayDate,
        updatedBy: userId,
        updatedAt: now,
      };

      return { paymentRecord, ledgerEntry, updatedCustomer, updatedInvoices, seqNumber, now };
    };

    let outcome: {
      payment: CustomerPaymentRecord;
      customer: CustomerRecord;
      ledgerEntry: CustomerLedgerEntryRecord;
      fromCache?: boolean;
      isNew: boolean;
    };

    if (this.isTest()) {
      outcome = await withTestCustomerLock(tenantId, customerId, async () => {
        const existingKey = testKhataIdempotencyStore.get(testIdempKey);
        if (existingKey) {
          if (existingKey.payloadHash === payloadHash) {
            return {
              ...(existingKey.result as {
                payment: CustomerPaymentRecord;
                customer: CustomerRecord;
                ledgerEntry: CustomerLedgerEntryRecord;
              }),
              fromCache: true,
              isNew: false,
            };
          }
          throw new IdempotencyConflictError(
            `Idempotency key '${cleanKey}' was already used with a different payment payload`
          );
        }

        const customer = testCustomerStore.get(`${tenantId}:${customerId}`);
        if (!customer) {
          throw new NotFoundError(`Customer '${customerId}' not found`);
        }

        const invoices = getAllTestInvoicesForTenant(tenantId).filter(
          (inv) => inv.customerId === customerId
        );
        const counterKey = `${tenantId}:receipt`;
        const nextSeq = (testReceiptCounter.get(counterKey) || 100) + 1;

        const built = buildPaymentMutations(customer, invoices, nextSeq);

        testReceiptCounter.set(counterKey, nextSeq);
        setTestCustomer(tenantId, built.updatedCustomer);
        appendTestLedgerEntryDirect(tenantId, customerId, built.ledgerEntry);
        appendTestPaymentDirect(tenantId, customerId, built.paymentRecord);
        for (const inv of built.updatedInvoices) {
          setTestInvoice(tenantId, inv);
        }

        const payloadResult = {
          payment: built.paymentRecord,
          customer: built.updatedCustomer,
          ledgerEntry: built.ledgerEntry,
        };
        testKhataIdempotencyStore.set(testIdempKey, {
          key: cleanKey,
          operation: 'khata_payment',
          payloadHash,
          status: 'completed',
          result: payloadResult,
        });

        return { ...payloadResult, isNew: true };
      });
    } else {
      const db = firestore();
      const tenantRef = db.collection('tenants').doc(tenantId);
      const custRef = tenantRef.collection('customers').doc(customerId);
      const idempRef = tenantRef.collection('idempotency_keys').doc(idempDocId);
      const counterRef = tenantRef.collection('counters').doc('khata_receipt');

      outcome = await db.runTransaction(async (tx) => {
        const invoicesQuery = tenantRef
          .collection('sales_invoices')
          .where('customerId', '==', customerId);

        const [idempDoc, custDoc, counterDoc, invoicesSnap] = await Promise.all([
          tx.get(idempRef),
          tx.get(custRef),
          tx.get(counterRef),
          tx.get(invoicesQuery),
        ]);

        if (idempDoc.exists) {
          const d = idempDoc.data() as { payloadHash: string; status: string; result: any } | undefined;
          if (d?.status === 'completed' && d.result) {
            if (d.payloadHash === payloadHash) {
              return { ...d.result, fromCache: true, isNew: false };
            }
            throw new IdempotencyConflictError(
              `Idempotency key '${cleanKey}' was already used with a different payment payload`
            );
          }
        }

        if (!custDoc.exists) {
          throw new NotFoundError(`Customer '${customerId}' not found`);
        }

        const customer = custDoc.data() as CustomerRecord;
        const nextSeq = (counterDoc.exists ? Number(counterDoc.data()?.currentSeq || 100) : 100) + 1;
        const candidateInvoices = invoicesSnap.docs.map((d) => d.data() as SalesInvoiceRecord);

        const built = buildPaymentMutations(customer, candidateInvoices, nextSeq);

        tx.set(counterRef, { currentSeq: nextSeq, updatedAt: built.now }, { merge: true });
        tx.update(custRef, {
          currentOutstandingBalance: built.updatedCustomer.currentOutstandingBalance,
          advanceBalance: built.updatedCustomer.advanceBalance,
          totalPayments: built.updatedCustomer.totalPayments,
          lastPaymentDate: built.updatedCustomer.lastPaymentDate,
          updatedBy: userId,
          updatedAt: built.now,
        });
        tx.set(custRef.collection('payments').doc(paymentId), built.paymentRecord);
        tx.set(custRef.collection('ledger').doc(ledgerEntryId), built.ledgerEntry);

        for (const inv of built.updatedInvoices) {
          const invRef = tenantRef.collection('sales_invoices').doc(inv.id);
          tx.update(invRef, {
            amountPaid: inv.amountPaid,
            balanceDue: inv.balanceDue,
            paymentStatus: inv.paymentStatus,
            payments: inv.payments,
            updatedAt: built.now,
          });
          tx.set(invRef.collection('payments').doc(paymentId), {
            id: paymentId,
            mode: paymentMode,
            amount: built.paymentRecord.allocations.find((a) => a.invoiceId === inv.id)?.allocatedAmount || 0,
            referenceNumber: referenceNumber?.trim() || null,
            invoiceId: inv.id,
            tenantId,
            branchId,
            recordedBy: userId,
            timestamp: built.now,
          });
        }

        const payloadResult = {
          payment: built.paymentRecord,
          customer: built.updatedCustomer,
          ledgerEntry: built.ledgerEntry,
        };
        tx.set(idempRef, {
          key: cleanKey,
          operation: 'khata_payment',
          tenantId,
          branchId,
          payloadHash,
          status: 'completed',
          result: payloadResult,
          timestamp: Date.now(),
          completedAt: built.now,
        });

        return { ...payloadResult, isNew: true };
      });
    }

    if (outcome.isNew) {
      try {
        await AccountingService.recordCustomerKhataPaymentAccounting({
          tenantId,
          branchId,
          paymentId: outcome.payment.id,
          receiptNumber: outcome.payment.receiptNumber,
          customerId,
          customerName: outcome.customer.name,
          amount: outcome.payment.amount,
          appliedToBalance: outcome.payment.appliedToBalance,
          addedToAdvance: outcome.payment.addedToAdvance,
          paymentMode: outcome.payment.paymentMode,
          paymentDate: outcome.payment.paymentDate,
          userId,
        });
      } catch (accErr) {
        logger.error({ err: accErr, customerId, paymentId }, 'Khata payment accounting hook failed');
      }

      await AuditService.log({
        tenantId,
        action: 'KHATA_PAYMENT_COLLECTED',
        actingUserId: userId,
        metadata: {
          customerId,
          customerName: outcome.customer.name,
          paymentId,
          receiptNumber: outcome.payment.receiptNumber,
          amount: payAmount,
          paymentMode,
          appliedToBalance: outcome.payment.appliedToBalance,
          addedToAdvance: outcome.payment.addedToAdvance,
          allocations: outcome.payment.allocations,
          newOutstandingBalance: outcome.customer.currentOutstandingBalance,
        },
      });
    }

    return {
      payment: outcome.payment,
      customer: outcome.customer,
      ledgerEntry: outcome.ledgerEntry,
      fromCache: outcome.fromCache,
    };
  }

  // ==========================================
  // 6. Credit Notes & Audited Balance Adjustments
  // ==========================================

  public static async issueCreditNote(
    input: IssueCreditNoteInput
  ): Promise<{ ledgerEntry: CustomerLedgerEntryRecord; customer: CustomerRecord; fromCache?: boolean }> {
    const {
      tenantId,
      branchId,
      customerId,
      amount,
      reason,
      invoiceId,
      returnId,
      notes,
      reduceInvoiceDue = true,
      userId,
      userName = 'Manager',
      idempotencyKey,
    } = input;

    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestError('Idempotency key must be at least 8 characters');
    }
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestError('Credit note reason must be at least 3 characters');
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestError('Credit note amount must be greater than zero');
    }

    const cleanKey = idempotencyKey.trim();
    const creditAmount = fromPaise(toPaise(amount));
    const payloadHash = hashPayload({
      branchId,
      customerId,
      amount: creditAmount,
      reason: reason.trim(),
      invoiceId,
      returnId,
      notes: notes?.trim(),
    });

    const idempDocId = deterministicId('idemp_cn', tenantId, branchId, customerId, cleanKey);
    const testIdempKey = `${tenantId}:${branchId}:credit_note:${customerId}:${cleanKey}`;
    const ledgerEntryId = deterministicId('led', tenantId, customerId, 'cn', cleanKey);

    const buildCreditNote = (
      customer: CustomerRecord,
      existingEntries: CustomerLedgerEntryRecord[],
      linkedInvoice?: SalesInvoiceRecord
    ) => {
      if (customer.isArchived) {
        throw new BadRequestError('Cannot issue a credit note for an archived customer');
      }

      if (returnId && existingEntries.some((e) => e.returnId === returnId)) {
        throw new ConflictError(`A credit note has already been issued for sales return '${returnId}'`);
      }

      const now = new Date().toISOString();
      const delta = applyLedgerBalanceDelta(
        customer.currentOutstandingBalance,
        customer.advanceBalance || 0,
        {
          direction: 'CREDIT',
          amount: creditAmount,
          allowAdvance: true,
        }
      );

      let updatedInvoice: SalesInvoiceRecord | undefined;
      if (linkedInvoice && reduceInvoiceDue && toPaise(linkedInvoice.balanceDue) > 0) {
        const duePaise = toPaise(linkedInvoice.balanceDue);
        const creditPaise = toPaise(creditAmount);
        const reducePaise = Math.min(duePaise, creditPaise);
        const nextDue = fromPaise(duePaise - reducePaise);
        const nextPaidStatus: SalesInvoiceRecord['paymentStatus'] =
          nextDue === 0 ? 'paid' : linkedInvoice.amountPaid > 0 ? 'partial' : 'unpaid';
        updatedInvoice = {
          ...linkedInvoice,
          balanceDue: nextDue,
          paymentStatus: nextPaidStatus,
          updatedAt: now,
        };
      }

      const ledgerEntry: CustomerLedgerEntryRecord = {
        id: ledgerEntryId,
        tenantId,
        branchId,
        customerId,
        entryType: 'CREDIT_NOTE',
        direction: 'CREDIT',
        amount: creditAmount,
        appliedToBalance: delta.appliedToBalance,
        advanceDelta: delta.advanceDelta,
        previousBalance: delta.previousBalance,
        runningBalance: delta.runningBalance,
        previousAdvanceBalance: delta.previousAdvanceBalance,
        runningAdvanceBalance: delta.runningAdvanceBalance,
        referenceType: 'credit_note',
        referenceId: returnId || invoiceId || ledgerEntryId,
        invoiceId: linkedInvoice?.id || invoiceId || null,
        invoiceNumber: linkedInvoice?.invoiceNumber || null,
        returnId: returnId || null,
        description: linkedInvoice
          ? `Credit Note against ${linkedInvoice.invoiceNumber}: ${reason.trim()}`
          : `Credit Note issued: ${reason.trim()}`,
        reason: notes ? `${reason.trim()} — ${notes.trim()}` : reason.trim(),
        operationRef: returnId ? `credit_note_return:${returnId}` : `credit_note:${cleanKey}`,
        performedBy: userId,
        performedByName: userName,
        timestamp: now,
      };

      const updatedCustomer: CustomerRecord = {
        ...customer,
        currentOutstandingBalance: delta.runningBalance,
        advanceBalance: delta.runningAdvanceBalance,
        updatedBy: userId,
        updatedAt: now,
      };

      return { ledgerEntry, updatedCustomer, updatedInvoice, now };
    };

    let outcome: {
      ledgerEntry: CustomerLedgerEntryRecord;
      customer: CustomerRecord;
      fromCache?: boolean;
      isNew: boolean;
    };

    if (this.isTest()) {
      outcome = await withTestCustomerLock(tenantId, customerId, async () => {
        const existingKey = testKhataIdempotencyStore.get(testIdempKey);
        if (existingKey) {
          if (existingKey.payloadHash === payloadHash) {
            return {
              ...(existingKey.result as {
                ledgerEntry: CustomerLedgerEntryRecord;
                customer: CustomerRecord;
              }),
              fromCache: true,
              isNew: false,
            };
          }
          throw new IdempotencyConflictError(
            `Idempotency key '${cleanKey}' was already used with a different credit note payload`
          );
        }

        const customer = testCustomerStore.get(`${tenantId}:${customerId}`);
        if (!customer) throw new NotFoundError(`Customer '${customerId}' not found`);
        const entries = getTestLedgerEntriesDirect(tenantId, customerId);
        const linkedInv = invoiceId
          ? getAllTestInvoicesForTenant(tenantId).find((i) => i.id === invoiceId)
          : undefined;
        if (invoiceId && !linkedInv) {
          throw new NotFoundError(`Invoice '${invoiceId}' not found`);
        }

        const built = buildCreditNote(customer, entries, linkedInv);
        setTestCustomer(tenantId, built.updatedCustomer);
        appendTestLedgerEntryDirect(tenantId, customerId, built.ledgerEntry);
        if (built.updatedInvoice) {
          setTestInvoice(tenantId, built.updatedInvoice);
        }

        const resultPayload = {
          ledgerEntry: built.ledgerEntry,
          customer: built.updatedCustomer,
        };
        testKhataIdempotencyStore.set(testIdempKey, {
          key: cleanKey,
          operation: 'credit_note',
          payloadHash,
          status: 'completed',
          result: resultPayload,
        });

        return { ...resultPayload, isNew: true };
      });
    } else {
      const db = firestore();
      const tenantRef = db.collection('tenants').doc(tenantId);
      const custRef = tenantRef.collection('customers').doc(customerId);
      const idempRef = tenantRef.collection('idempotency_keys').doc(idempDocId);
      const invRef = invoiceId ? tenantRef.collection('sales_invoices').doc(invoiceId) : null;

      outcome = await db.runTransaction(async (tx) => {
        const [idempDoc, custDoc, entriesSnap, invDoc] = await Promise.all([
          tx.get(idempRef),
          tx.get(custRef),
          tx.get(custRef.collection('ledger')),
          invRef ? tx.get(invRef) : Promise.resolve(null),
        ]);

        if (idempDoc.exists) {
          const d = idempDoc.data() as { payloadHash: string; status: string; result: any } | undefined;
          if (d?.status === 'completed' && d.result) {
            if (d.payloadHash === payloadHash) {
              return { ...d.result, fromCache: true, isNew: false };
            }
            throw new IdempotencyConflictError(
              `Idempotency key '${cleanKey}' was already used with a different credit note payload`
            );
          }
        }

        if (!custDoc.exists) throw new NotFoundError(`Customer '${customerId}' not found`);
        if (invRef && invDoc && !invDoc.exists) {
          throw new NotFoundError(`Invoice '${invoiceId}' not found`);
        }

        const customer = custDoc.data() as CustomerRecord;
        const existingEntries = entriesSnap.docs.map((d) => d.data() as CustomerLedgerEntryRecord);
        const linkedInv = invDoc && invDoc.exists ? (invDoc.data() as SalesInvoiceRecord) : undefined;

        const built = buildCreditNote(customer, existingEntries, linkedInv);

        tx.update(custRef, {
          currentOutstandingBalance: built.updatedCustomer.currentOutstandingBalance,
          advanceBalance: built.updatedCustomer.advanceBalance,
          updatedBy: userId,
          updatedAt: built.now,
        });
        tx.set(custRef.collection('ledger').doc(ledgerEntryId), built.ledgerEntry);
        if (built.updatedInvoice && invRef) {
          tx.update(invRef, {
            balanceDue: built.updatedInvoice.balanceDue,
            paymentStatus: built.updatedInvoice.paymentStatus,
            updatedAt: built.now,
          });
        }

        const resultPayload = {
          ledgerEntry: built.ledgerEntry,
          customer: built.updatedCustomer,
        };
        tx.set(idempRef, {
          key: cleanKey,
          operation: 'credit_note',
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
        await AccountingService.recordCustomerCreditNoteAccounting({
          tenantId,
          branchId,
          ledgerEntryId: outcome.ledgerEntry.id,
          customerId,
          customerName: outcome.customer.name,
          amount: outcome.ledgerEntry.amount,
          appliedToBalance: outcome.ledgerEntry.appliedToBalance,
          advanceDelta: outcome.ledgerEntry.advanceDelta,
          returnId: outcome.ledgerEntry.returnId,
          reason: reason.trim(),
          timestamp: outcome.ledgerEntry.timestamp,
          userId,
        });
      } catch (accErr) {
        logger.error({ err: accErr, customerId }, 'Customer credit note accounting hook failed');
      }

      await AuditService.log({
        tenantId,
        action: 'KHATA_CREDIT_NOTE_ISSUED',
        actingUserId: userId,
        metadata: {
          customerId,
          customerName: outcome.customer.name,
          amount: creditAmount,
          invoiceId: invoiceId || null,
          returnId: returnId || null,
          reason: reason.trim(),
          newOutstandingBalance: outcome.customer.currentOutstandingBalance,
          newAdvanceBalance: outcome.customer.advanceBalance,
        },
      });
    }

    return {
      ledgerEntry: outcome.ledgerEntry,
      customer: outcome.customer,
      fromCache: outcome.fromCache,
    };
  }

  public static async createBalanceAdjustment(
    input: BalanceAdjustmentInput
  ): Promise<{ ledgerEntry: CustomerLedgerEntryRecord; customer: CustomerRecord; fromCache?: boolean }> {
    const {
      tenantId,
      branchId,
      customerId,
      adjustmentType,
      amount,
      reason,
      referenceNumber,
      notes,
      userId,
      userName = 'Manager',
      idempotencyKey,
    } = input;

    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestError('Idempotency key must be at least 8 characters');
    }
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestError('Adjustment reason must be at least 3 characters');
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestError('Adjustment amount must be greater than zero');
    }

    const direction: LedgerDirection =
      adjustmentType === 'CREDIT_ADJUSTMENT' ? 'CREDIT' : 'DEBIT';

    const cleanKey = idempotencyKey.trim();
    const adjAmount = fromPaise(toPaise(amount));
    const payloadHash = hashPayload({
      branchId,
      customerId,
      adjustmentType,
      amount: adjAmount,
      reason: reason.trim(),
      referenceNumber: referenceNumber?.trim(),
      notes: notes?.trim(),
    });

    const idempDocId = deterministicId('idemp_adj', tenantId, branchId, customerId, cleanKey);
    const testIdempKey = `${tenantId}:${branchId}:balance_adjustment:${customerId}:${cleanKey}`;
    const ledgerEntryId = deterministicId('led', tenantId, customerId, 'adj', cleanKey);

    const buildAdjustment = (customer: CustomerRecord) => {
      if (customer.isArchived) {
        throw new BadRequestError('Cannot adjust balance on an archived customer');
      }

      const now = new Date().toISOString();
      const delta = applyLedgerBalanceDelta(
        customer.currentOutstandingBalance,
        customer.advanceBalance || 0,
        {
          direction,
          amount: adjAmount,
          allowAdvance: adjustmentType === 'CREDIT_ADJUSTMENT',
        }
      );

      if (adjustmentType === 'REFUND' && toPaise(customer.advanceBalance || 0) < toPaise(adjAmount)) {
        // Explicit guard: REFUND ledger entry should refund advance balance or recorded overpayment
        if (toPaise(customer.advanceBalance || 0) === 0 && toPaise(customer.currentOutstandingBalance) === 0) {
          // Allow only if reversing an explicit credit balance; otherwise disallow blind debit under REFUND
          throw new BadRequestError('Customer has no advance credit available to refund');
        }
      }

      const ledgerEntry: CustomerLedgerEntryRecord = {
        id: ledgerEntryId,
        tenantId,
        branchId,
        customerId,
        entryType: adjustmentType,
        direction,
        amount: adjAmount,
        appliedToBalance: delta.appliedToBalance,
        advanceDelta: delta.advanceDelta,
        previousBalance: delta.previousBalance,
        runningBalance: delta.runningBalance,
        previousAdvanceBalance: delta.previousAdvanceBalance,
        runningAdvanceBalance: delta.runningAdvanceBalance,
        referenceType: 'balance_adjustment',
        referenceId: ledgerEntryId,
        referenceNumber: referenceNumber?.trim() || null,
        description: `${adjustmentType.replace(/_/g, ' ')}: ${reason.trim()}`,
        reason: notes ? `${reason.trim()} — ${notes.trim()}` : reason.trim(),
        operationRef: `balance_adjustment:${cleanKey}`,
        performedBy: userId,
        performedByName: userName,
        timestamp: now,
      };

      const updatedCustomer: CustomerRecord = {
        ...customer,
        currentOutstandingBalance: delta.runningBalance,
        advanceBalance: delta.runningAdvanceBalance,
        updatedBy: userId,
        updatedAt: now,
      };

      return { ledgerEntry, updatedCustomer, now };
    };

    let outcome: {
      ledgerEntry: CustomerLedgerEntryRecord;
      customer: CustomerRecord;
      fromCache?: boolean;
      isNew: boolean;
    };

    if (this.isTest()) {
      outcome = await withTestCustomerLock(tenantId, customerId, async () => {
        const existingKey = testKhataIdempotencyStore.get(testIdempKey);
        if (existingKey) {
          if (existingKey.payloadHash === payloadHash) {
            return {
              ...(existingKey.result as {
                ledgerEntry: CustomerLedgerEntryRecord;
                customer: CustomerRecord;
              }),
              fromCache: true,
              isNew: false,
            };
          }
          throw new IdempotencyConflictError(
            `Idempotency key '${cleanKey}' was already used with a different adjustment payload`
          );
        }

        const customer = testCustomerStore.get(`${tenantId}:${customerId}`);
        if (!customer) throw new NotFoundError(`Customer '${customerId}' not found`);

        const built = buildAdjustment(customer);
        setTestCustomer(tenantId, built.updatedCustomer);
        appendTestLedgerEntryDirect(tenantId, customerId, built.ledgerEntry);

        const resultPayload = { ledgerEntry: built.ledgerEntry, customer: built.updatedCustomer };
        testKhataIdempotencyStore.set(testIdempKey, {
          key: cleanKey,
          operation: 'balance_adjustment',
          payloadHash,
          status: 'completed',
          result: resultPayload,
        });

        return { ...resultPayload, isNew: true };
      });
    } else {
      const db = firestore();
      const tenantRef = db.collection('tenants').doc(tenantId);
      const custRef = tenantRef.collection('customers').doc(customerId);
      const idempRef = tenantRef.collection('idempotency_keys').doc(idempDocId);

      outcome = await db.runTransaction(async (tx) => {
        const [idempDoc, custDoc] = await Promise.all([tx.get(idempRef), tx.get(custRef)]);

        if (idempDoc.exists) {
          const d = idempDoc.data() as { payloadHash: string; status: string; result: any } | undefined;
          if (d?.status === 'completed' && d.result) {
            if (d.payloadHash === payloadHash) {
              return { ...d.result, fromCache: true, isNew: false };
            }
            throw new IdempotencyConflictError(
              `Idempotency key '${cleanKey}' was already used with a different adjustment payload`
            );
          }
        }

        if (!custDoc.exists) throw new NotFoundError(`Customer '${customerId}' not found`);
        const customer = custDoc.data() as CustomerRecord;
        const built = buildAdjustment(customer);

        tx.update(custRef, {
          currentOutstandingBalance: built.updatedCustomer.currentOutstandingBalance,
          advanceBalance: built.updatedCustomer.advanceBalance,
          updatedBy: userId,
          updatedAt: built.now,
        });
        tx.set(custRef.collection('ledger').doc(ledgerEntryId), built.ledgerEntry);

        const resultPayload = { ledgerEntry: built.ledgerEntry, customer: built.updatedCustomer };
        tx.set(idempRef, {
          key: cleanKey,
          operation: 'balance_adjustment',
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
        await AccountingService.recordCustomerBalanceAdjustmentAccounting({
          tenantId,
          branchId,
          ledgerEntryId: outcome.ledgerEntry.id,
          customerId,
          customerName: outcome.customer.name,
          adjustmentType,
          amount: adjAmount,
          appliedToBalance: outcome.ledgerEntry.appliedToBalance,
          advanceDelta: outcome.ledgerEntry.advanceDelta,
          paymentMode: outcome.ledgerEntry.paymentMode,
          reason: reason.trim(),
          timestamp: outcome.ledgerEntry.timestamp,
          userId,
        });
      } catch (accErr) {
        logger.error({ err: accErr, customerId }, 'Customer balance adjustment accounting hook failed');
      }

      await AuditService.log({
        tenantId,
        action: 'KHATA_BALANCE_ADJUSTED',
        actingUserId: userId,
        metadata: {
          customerId,
          customerName: outcome.customer.name,
          adjustmentType,
          direction,
          amount: adjAmount,
          reason: reason.trim(),
          previousBalance: outcome.ledgerEntry.previousBalance,
          newBalance: outcome.ledgerEntry.runningBalance,
          advanceBalance: outcome.customer.advanceBalance,
        },
      });
    }

    return {
      ledgerEntry: outcome.ledgerEntry,
      customer: outcome.customer,
      fromCache: outcome.fromCache,
    };
  }

  // ==========================================
  // 7. Customer Statement, PDF/CSV Export & WhatsApp Share
  // ==========================================

  public static async getCustomerStatement(
    tenantId: string,
    customerId: string,
    options: { dateFrom?: string; dateTo?: string } = {},
    viewer?: ViewerAccess
  ): Promise<{
    customer: SanitizedCustomerRecord;
    period: { dateFrom: string; dateTo: string };
    openingBalance: number;
    periodDebits: number;
    periodCredits: number;
    closingBalance: number;
    currentOutstandingBalance: number;
    advanceBalance: number;
    entries: CustomerLedgerEntryRecord[];
  }> {
    const rawCustomer = await this.loadRawCustomer(tenantId, customerId);
    const allEntries = (await this.loadAllLedgerEntries(tenantId, customerId)).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    const dateFrom = options.dateFrom || (allEntries[0]?.timestamp.slice(0, 10) || rawCustomer.createdAt.slice(0, 10));
    const dateTo = options.dateTo || new Date().toISOString().slice(0, 10);
    const startBound = dateFrom.length === 10 ? `${dateFrom}T00:00:00.000Z` : dateFrom;
    const endBound = dateTo.length === 10 ? `${dateTo}T23:59:59.999Z` : dateTo;

    let openingPaise = 0;
    let periodDebitsPaise = 0;
    let periodCreditsPaise = 0;
    const periodEntries: CustomerLedgerEntryRecord[] = [];

    for (const entry of allEntries) {
      const amtPaise = toPaise(entry.amount);
      if (entry.timestamp < startBound) {
        openingPaise += entry.direction === 'DEBIT' ? amtPaise : -amtPaise;
      } else if (entry.timestamp <= endBound) {
        if (entry.direction === 'DEBIT') {
          periodDebitsPaise += amtPaise;
        } else {
          periodCreditsPaise += amtPaise;
        }
        periodEntries.push(entry);
      }
    }

    const closingPaise = openingPaise + periodDebitsPaise - periodCreditsPaise;

    return {
      customer: this.sanitizeCustomerForViewer(rawCustomer, viewer),
      period: { dateFrom, dateTo },
      openingBalance: fromPaise(openingPaise),
      periodDebits: fromPaise(periodDebitsPaise),
      periodCredits: fromPaise(periodCreditsPaise),
      closingBalance: fromPaise(closingPaise),
      currentOutstandingBalance: rawCustomer.currentOutstandingBalance,
      advanceBalance: rawCustomer.advanceBalance || 0,
      entries: periodEntries,
    };
  }

  public static async exportCustomerStatement(
    tenantId: string,
    branchId: string,
    customerId: string,
    format: 'csv' | 'pdf',
    options: { dateFrom?: string; dateTo?: string },
    userId: string,
    viewer?: ViewerAccess
  ): Promise<{
    fileName: string;
    mimeType: string;
    storagePath: string;
    downloadUrl: string;
    contentBase64: string;
    statementSummary: {
      openingBalance: number;
      periodDebits: number;
      periodCredits: number;
      closingBalance: number;
      entryCount: number;
    };
  }> {
    const stmt = await this.getCustomerStatement(tenantId, customerId, options, viewer);
    const safeSlug = stmt.customer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || customerId;
    const fileName = `khata-statement-${safeSlug}-${stmt.period.dateFrom}-to-${stmt.period.dateTo}.${format}`;

    let buffer: Buffer;
    let mimeType: string;

    if (format === 'csv') {
      mimeType = 'text/csv; charset=utf-8';
      const rows: string[] = [
        [
          'Date',
          'Entry Type',
          'Direction',
          'Reference',
          'Description',
          'Debit (INR)',
          'Credit (INR)',
          'Running Balance (INR)',
        ]
          .map(escapeCsvCell)
          .join(','),
      ];
      for (const e of stmt.entries) {
        rows.push(
          [
            e.timestamp.slice(0, 19).replace('T', ' '),
            e.entryType,
            e.direction,
            e.invoiceNumber || e.referenceNumber || e.referenceId || '',
            e.description,
            e.direction === 'DEBIT' ? e.amount.toFixed(2) : '0.00',
            e.direction === 'CREDIT' ? e.amount.toFixed(2) : '0.00',
            e.runningBalance.toFixed(2),
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      }
      rows.push('');
      rows.push(
        [`Summary (${stmt.customer.name})`, 'Opening Balance', stmt.openingBalance.toFixed(2), 'Period Debits', stmt.periodDebits.toFixed(2), 'Period Credits', stmt.periodCredits.toFixed(2), `Closing: ${stmt.closingBalance.toFixed(2)}`]
          .map(escapeCsvCell)
          .join(',')
      );
      buffer = Buffer.from(rows.join('\n'), 'utf8');
    } else {
      mimeType = 'application/pdf';
      const lines: string[] = [
        'PHARMADESK CUSTOMER KHATA ACCOUNT STATEMENT',
        `Customer: ${stmt.customer.name} | Type: ${stmt.customer.customerType}`,
        `Phone: ${stmt.customer.phone} | Credit Limit: INR ${(stmt.customer.creditLimit ?? 0).toFixed(2)}`,
        `Period: ${stmt.period.dateFrom} to ${stmt.period.dateTo}`,
        '------------------------------------------------------------------------------',
        `Opening Balance: INR ${stmt.openingBalance.toFixed(2)}   |   Period Debits: INR ${stmt.periodDebits.toFixed(2)}`,
        `Period Credits : INR ${stmt.periodCredits.toFixed(2)}   |   Closing Balance: INR ${stmt.closingBalance.toFixed(2)}`,
        '------------------------------------------------------------------------------',
        'DATE        TYPE              DEBIT       CREDIT      BAL         REF',
      ];
      if (stmt.entries.length === 0) {
        lines.push('No ledger transactions recorded during selected period.');
      } else {
        for (const e of stmt.entries) {
          const d = e.timestamp.slice(0, 10);
          const t = e.entryType.slice(0, 16).padEnd(16, ' ');
          const deb = (e.direction === 'DEBIT' ? e.amount.toFixed(2) : '-').padStart(10, ' ');
          const cred = (e.direction === 'CREDIT' ? e.amount.toFixed(2) : '-').padStart(10, ' ');
          const bal = e.runningBalance.toFixed(2).padStart(10, ' ');
          const ref = (e.invoiceNumber || e.referenceNumber || '').slice(0, 20);
          lines.push(`${d}  ${t}  ${deb}  ${cred}  ${bal}  ${ref}`);
        }
      }
      buffer = generateStatementPdfBuffer(lines);
    }

    const storagePath = `tenants/${tenantId}/branches/${branchId}/documents/${Date.now()}_${fileName}`;
    let downloadUrl = '';

    if (!this.isTest()) {
      try {
        const bucket = storage().bucket(env.FIREBASE_STORAGE_BUCKET);
        const file = bucket.file(storagePath);
        await file.save(buffer, { contentType: mimeType, resumable: false });
        const dl = await StorageService.getSignedDownloadUrl({
          tenantId,
          branchId,
          category: 'documents',
          fileId: storagePath.split('/').pop()!,
        });
        downloadUrl = dl.downloadUrl;
      } catch (err: any) {
        logger.warn({ err: err?.message, storagePath }, 'Firebase Storage unavailable in current environment; returning inline export payload');
      }
    } else {
      downloadUrl = `https://storage.googleapis.com/${env.FIREBASE_STORAGE_BUCKET}/${storagePath}?mockDownload=1`;
    }

    await AuditService.log({
      tenantId,
      action: 'CUSTOMER_STATEMENT_EXPORTED',
      actingUserId: userId,
      metadata: {
        customerId,
        format,
        dateFrom: stmt.period.dateFrom,
        dateTo: stmt.period.dateTo,
        entryCount: stmt.entries.length,
        storagePath,
      },
    });

    return {
      fileName,
      mimeType,
      storagePath,
      downloadUrl,
      contentBase64: buffer.toString('base64'),
      statementSummary: {
        openingBalance: stmt.openingBalance,
        periodDebits: stmt.periodDebits,
        periodCredits: stmt.periodCredits,
        closingBalance: stmt.closingBalance,
        entryCount: stmt.entries.length,
      },
    };
  }

  public static async prepareWhatsAppStatement(
    tenantId: string,
    customerId: string,
    options: { dateFrom?: string; dateTo?: string; storeName?: string },
    userId: string,
    viewer?: ViewerAccess
  ): Promise<{
    customerId: string;
    customerName: string;
    messageText: string;
    whatsappUrl: string;
    deliveryStatus: 'USER_ACTION_REQUIRED';
  }> {
    const rawCustomer = await this.loadRawCustomer(tenantId, customerId);
    const stmt = await this.getCustomerStatement(tenantId, customerId, options, viewer);

    let resolvedStoreName = options.storeName?.trim() || 'PharmaDesk Pharmacy';
    if (!options.storeName && !this.isTest()) {
      try {
        const tenantSnap = await firestore().collection('tenants').doc(tenantId).get();
        if (tenantSnap.exists) {
          resolvedStoreName = String((tenantSnap.data() as { name?: string })?.name || resolvedStoreName);
        }
      } catch {
        // Fallback to default store label
      }
    }

    // Strictly sanitized financial summary (no DOB, allergies, chronicConditions, or clinical notes)
    const messageText = [
      `Hello ${rawCustomer.name},`,
      `Statement from ${resolvedStoreName} (${stmt.period.dateFrom} to ${stmt.period.dateTo}):`,
      `Opening Balance: ₹${stmt.openingBalance.toFixed(2)}`,
      `Purchases / Debits: ₹${stmt.periodDebits.toFixed(2)}`,
      `Payments / Credits: ₹${stmt.periodCredits.toFixed(2)}`,
      `Net Outstanding Balance: ₹${rawCustomer.currentOutstandingBalance.toFixed(2)}`,
      rawCustomer.advanceBalance > 0
        ? `Available Advance Balance: ₹${rawCustomer.advanceBalance.toFixed(2)}`
        : null,
      `Thank you for your patronage.`,
    ]
      .filter(Boolean)
      .join('\n');

    const whatsappUrl = `https://wa.me/${rawCustomer.normalizedPhone}?text=${encodeURIComponent(messageText)}`;

    await AuditService.log({
      tenantId,
      action: 'CUSTOMER_STATEMENT_SHARED',
      actingUserId: userId,
      metadata: {
        customerId,
        channel: 'whatsapp_web_link',
        dateFrom: stmt.period.dateFrom,
        dateTo: stmt.period.dateTo,
      },
    });

    return {
      customerId,
      customerName: rawCustomer.name,
      messageText,
      whatsappUrl,
      deliveryStatus: 'USER_ACTION_REQUIRED',
    };
  }

  // ==========================================
  // 8. Outstanding, Overdue & Credit Summary Reports
  // ==========================================

  public static async getOutstandingReport(
    tenantId: string,
    options: { branchId?: string; customerType?: string; search?: string } = {},
    viewer?: ViewerAccess
  ): Promise<{
    customers: Array<{
      customerId: string;
      name: string;
      phone: string;
      customerType: CustomerType;
      status: CustomerStatus;
      creditLimit: number;
      currentOutstandingBalance: number;
      advanceBalance: number;
      availableCredit: number;
      isOverLimit: boolean;
      unpaidInvoiceCount: number;
      overdueAmount: number;
      lastPurchaseDate?: string | null;
      lastPaymentDate?: string | null;
    }>;
    totals: {
      totalCustomersWithDue: number;
      totalOutstanding: number;
      totalAdvance: number;
      totalOverdue: number;
      overLimitCount: number;
    };
  }> {
    let customers = (await this.loadAllRawCustomers(tenantId)).filter(
      (c) => !c.isArchived && c.currentOutstandingBalance > 0
    );
    if (options.branchId && options.branchId !== 'all') {
      customers = customers.filter((c) => c.primaryBranchId === options.branchId);
    }
    if (options.customerType && options.customerType !== 'all') {
      customers = customers.filter((c) => c.customerType === options.customerType);
    }
    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      customers = customers.filter((c) => c.name.toLowerCase().includes(q));
    }

    const invoices = this.isTest()
      ? getAllTestInvoicesForTenant(tenantId)
      : (await firestore().collection('tenants').doc(tenantId).collection('sales_invoices').get()).docs.map(
          (d) => d.data() as SalesInvoiceRecord
        );

    const canViewPhone = this.hasViewerPermission(viewer, 'customers.view_phone');
    const nowMs = Date.now();

    const rows = customers
      .map((c) => {
        const custInvoices = invoices.filter(
          (inv) =>
            inv.customerId === c.id &&
            inv.status !== 'cancelled' &&
            inv.status !== 'returned' &&
            inv.balanceDue > 0
        );
        const overdueAmount = roundPaise(
          custInvoices
            .filter((inv) => isInvoiceOverdue(inv, nowMs))
            .reduce((sum, inv) => sum + inv.balanceDue, 0)
        );
        return {
          customerId: c.id,
          name: c.name,
          phone: canViewPhone ? c.phone : (maskPhone(c.phone) || '******'),
          customerType: c.customerType,
          status: c.status,
          creditLimit: c.creditLimit,
          currentOutstandingBalance: c.currentOutstandingBalance,
          advanceBalance: c.advanceBalance || 0,
          availableCredit: roundPaise(Math.max(0, c.creditLimit - c.currentOutstandingBalance + (c.advanceBalance || 0))),
          isOverLimit: c.creditLimit > 0 && c.currentOutstandingBalance > c.creditLimit,
          unpaidInvoiceCount: custInvoices.length,
          overdueAmount,
          lastPurchaseDate: c.lastPurchaseDate,
          lastPaymentDate: c.lastPaymentDate,
        };
      })
      .sort((a, b) => b.currentOutstandingBalance - a.currentOutstandingBalance);

    const totals = rows.reduce(
      (acc, r) => {
        acc.totalCustomersWithDue += 1;
        acc.totalOutstanding = roundPaise(acc.totalOutstanding + r.currentOutstandingBalance);
        acc.totalAdvance = roundPaise(acc.totalAdvance + r.advanceBalance);
        acc.totalOverdue = roundPaise(acc.totalOverdue + r.overdueAmount);
        if (r.isOverLimit) acc.overLimitCount += 1;
        return acc;
      },
      {
        totalCustomersWithDue: 0,
        totalOutstanding: 0,
        totalAdvance: 0,
        totalOverdue: 0,
        overLimitCount: 0,
      }
    );

    return { customers: rows, totals };
  }

  public static async getOverdueReport(
    tenantId: string,
    options: { branchId?: string; minDaysOverdue?: number } = {},
    viewer?: ViewerAccess
  ): Promise<{
    overdueInvoices: Array<{
      invoiceId: string;
      invoiceNumber: string;
      branchId: string;
      customerId: string;
      customerName: string;
      customerPhone: string;
      grandTotal: number;
      amountPaid: number;
      balanceDue: number;
      dueDate: string;
      daysOverdue: number;
      agingBucket: '1_15_days' | '16_30_days' | 'over_30_days';
      createdAt: string;
    }>;
    agingSummary: {
      notYetDueAmount: number;
      dueTodayAmount: number;
      bucket1To15Days: number;
      bucket16To30Days: number;
      bucketOver30Days: number;
      totalOverdueAmount: number;
    };
  }> {
    const customers = await this.loadAllRawCustomers(tenantId);
    const custMap = new Map(customers.map((c) => [c.id, c]));

    let invoices = this.isTest()
      ? getAllTestInvoicesForTenant(tenantId)
      : (await firestore().collection('tenants').doc(tenantId).collection('sales_invoices').get()).docs.map(
          (d) => d.data() as SalesInvoiceRecord
        );

    if (viewer && viewer.role !== 'owner') {
      invoices = invoices.filter((inv) => viewer.assignedBranchIds.includes(inv.branchId));
    }
    if (options.branchId && options.branchId !== 'all') {
      invoices = invoices.filter((inv) => inv.branchId === options.branchId);
    }

    const canViewPhone = this.hasViewerPermission(viewer, 'customers.view_phone');
    const nowMs = Date.now();
    const todayStr = new Date(nowMs).toISOString().slice(0, 10);

    let notYetDueAmount = 0;
    let dueTodayAmount = 0;
    let bucket1To15Days = 0;
    let bucket16To30Days = 0;
    let bucketOver30Days = 0;

    const overdueInvoices: Array<{
      invoiceId: string;
      invoiceNumber: string;
      branchId: string;
      customerId: string;
      customerName: string;
      customerPhone: string;
      grandTotal: number;
      amountPaid: number;
      balanceDue: number;
      dueDate: string;
      daysOverdue: number;
      agingBucket: '1_15_days' | '16_30_days' | 'over_30_days';
      createdAt: string;
    }> = [];

    for (const inv of invoices) {
      if (inv.status === 'cancelled' || inv.status === 'returned' || inv.balanceDue <= 0) continue;
      if (!inv.customerId) continue;

      const dueIso = inv.dueDate || inv.createdAt;
      const dueDateDay = dueIso.slice(0, 10);

      if (dueDateDay > todayStr) {
        notYetDueAmount = roundPaise(notYetDueAmount + inv.balanceDue);
        continue;
      }
      if (dueDateDay === todayStr) {
        dueTodayAmount = roundPaise(dueTodayAmount + inv.balanceDue);
        continue;
      }

      const days = Math.max(1, computeDaysOverdue(dueIso, nowMs));
      if (options.minDaysOverdue && days < options.minDaysOverdue) continue;

      const agingBucket: '1_15_days' | '16_30_days' | 'over_30_days' =
        days <= 15 ? '1_15_days' : days <= 30 ? '16_30_days' : 'over_30_days';

      if (agingBucket === '1_15_days') bucket1To15Days = roundPaise(bucket1To15Days + inv.balanceDue);
      else if (agingBucket === '16_30_days') bucket16To30Days = roundPaise(bucket16To30Days + inv.balanceDue);
      else bucketOver30Days = roundPaise(bucketOver30Days + inv.balanceDue);

      const cust = custMap.get(inv.customerId);
      const rawPhone = cust?.phone || inv.customer.phone || '';
      overdueInvoices.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        branchId: inv.branchId,
        customerId: inv.customerId,
        customerName: cust?.name || inv.customer.name,
        customerPhone: canViewPhone ? rawPhone : (maskPhone(rawPhone) || '******'),
        grandTotal: inv.grandTotal,
        amountPaid: inv.amountPaid,
        balanceDue: inv.balanceDue,
        dueDate: dueIso,
        daysOverdue: days,
        agingBucket,
        createdAt: inv.createdAt,
      });
    }

    overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);

    return {
      overdueInvoices,
      agingSummary: {
        notYetDueAmount,
        dueTodayAmount,
        bucket1To15Days,
        bucket16To30Days,
        bucketOver30Days,
        totalOverdueAmount: roundPaise(bucket1To15Days + bucket16To30Days + bucketOver30Days),
      },
    };
  }

  public static async getCreditSummaryDashboard(
    tenantId: string,
    branchId?: string,
    viewer?: ViewerAccess
  ): Promise<{
    kpis: {
      totalCustomers: number;
      activeCreditAccounts: number;
      totalKhataOutstanding: number;
      totalAdvanceBalance: number;
      overdueAccountsCount: number;
      overdueTotalAmount: number;
      overLimitAccountsCount: number;
      blockedAccountsCount: number;
    };
    recentCreditSales: Array<{
      invoiceId: string;
      invoiceNumber: string;
      customerId?: string;
      customerName: string;
      grandTotal: number;
      balanceDue: number;
      dueDate?: string;
      createdAt: string;
    }>;
    topCustomersByPurchases: SanitizedCustomerRecord[];
    highestOutstandingCustomers: SanitizedCustomerRecord[];
    recentPayments: CustomerPaymentRecord[];
  }> {
    const allCustomers = (await this.loadAllRawCustomers(tenantId)).filter((c) => !c.isArchived);
    const branchCustomers =
      branchId && branchId !== 'all'
        ? allCustomers.filter((c) => c.primaryBranchId === branchId)
        : allCustomers;

    const overdue = await this.getOverdueReport(tenantId, { branchId }, viewer);
    const overdueCustIds = new Set(overdue.overdueInvoices.map((i) => i.customerId));

    const invoices = this.isTest()
      ? getAllTestInvoicesForTenant(tenantId)
      : (await firestore().collection('tenants').doc(tenantId).collection('sales_invoices').get()).docs.map(
          (d) => d.data() as SalesInvoiceRecord
        );

    const recentCreditSales = invoices
      .filter(
        (inv) =>
          inv.status !== 'cancelled' &&
          (inv.khataCreditAmount ? inv.khataCreditAmount > 0 : inv.balanceDue > 0) &&
          (!branchId || branchId === 'all' || inv.branchId === branchId)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8)
      .map((inv) => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: inv.customer.name,
        grandTotal: inv.grandTotal,
        balanceDue: inv.balanceDue,
        dueDate: inv.dueDate,
        createdAt: inv.createdAt,
      }));

    // Collect recent payments across customers
    const allPayments: CustomerPaymentRecord[] = [];
    for (const c of branchCustomers.slice(0, 50)) {
      const pays = await this.loadAllCustomerPayments(tenantId, c.id);
      allPayments.push(...pays);
    }
    allPayments.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const totalKhataOutstanding = roundPaise(
      branchCustomers.reduce((sum, c) => sum + c.currentOutstandingBalance, 0)
    );
    const totalAdvanceBalance = roundPaise(
      branchCustomers.reduce((sum, c) => sum + (c.advanceBalance || 0), 0)
    );

    const topCustomersByPurchases = [...branchCustomers]
      .sort((a, b) => b.totalPurchases - a.totalPurchases)
      .slice(0, 5)
      .map((c) => this.sanitizeCustomerForViewer(c, viewer));

    const highestOutstandingCustomers = [...branchCustomers]
      .filter((c) => c.currentOutstandingBalance > 0)
      .sort((a, b) => b.currentOutstandingBalance - a.currentOutstandingBalance)
      .slice(0, 5)
      .map((c) => this.sanitizeCustomerForViewer(c, viewer));

    return {
      kpis: {
        totalCustomers: branchCustomers.length,
        activeCreditAccounts: branchCustomers.filter((c) => c.creditEnabled && c.status === 'ACTIVE').length,
        totalKhataOutstanding,
        totalAdvanceBalance,
        overdueAccountsCount: overdueCustIds.size,
        overdueTotalAmount: overdue.agingSummary.totalOverdueAmount,
        overLimitAccountsCount: branchCustomers.filter(
          (c) => c.creditLimit > 0 && c.currentOutstandingBalance > c.creditLimit
        ).length,
        blockedAccountsCount: branchCustomers.filter((c) => c.status === 'BLOCKED').length,
      },
      recentCreditSales,
      topCustomersByPurchases,
      highestOutstandingCustomers,
      recentPayments: allPayments.slice(0, 8),
    };
  }
}

export { deterministicId as customerDeterministicId };

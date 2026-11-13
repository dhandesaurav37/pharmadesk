import crypto from 'node:crypto';
import { firestore, storage } from '../lib/firebaseAdmin';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { AuditService } from './auditService';
import { StorageService } from './storageService';
import { AccountingService } from './accountingService';

export type SupplierStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
export type SupplierType =
  | 'DISTRIBUTOR'
  | 'MANUFACTURER'
  | 'C_AND_F'
  | 'WHOLESALER'
  | 'SURGICAL_VENDOR'
  | 'GENERIC_STOCKIST';

export interface SupplierBankDetails {
  accountHolderName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  upiId?: string | null;
}

export interface SupplierAttachment {
  id: string;
  name: string;
  category: 'supplier_bills' | 'documents';
  storagePath: string;
  branchId: string;
  fileId: string;
  contentType?: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface SupplierRecord {
  id: string;
  supplierId: string;
  tenantId: string;
  supplierCode: string;
  legalName: string;
  tradeName: string;
  contactPerson: string;
  primaryPhone: string;
  normalizedPhone: string;
  alternatePhone?: string | null;
  email?: string | null;
  gstin?: string | null;
  gstinFormatValid: boolean;
  gstinVerificationNote: string;
  pan?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  state: string;
  stateCode: string;
  pincode?: string | null;
  drugLicenceNumber?: string | null;
  supplierType: SupplierType;
  paymentTerms: string;
  creditPeriodDays: number;
  creditLimit: number;
  openingBalance: number;
  currentOutstandingBalance: number;
  advanceBalance: number;
  totalPurchases: number;
  totalPayments: number;
  lastPurchaseDate?: string | null;
  lastPaymentDate?: string | null;
  bankDetails?: SupplierBankDetails | null;
  attachments?: SupplierAttachment[];
  notes?: string | null;
  status: SupplierStatus;
  isArchived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  blockReason?: string | null;
  duplicateConfirmed?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface SanitizedSupplierRecord
  extends Omit<
    SupplierRecord,
    | 'bankDetails'
    | 'creditLimit'
    | 'openingBalance'
    | 'currentOutstandingBalance'
    | 'advanceBalance'
    | 'totalPurchases'
    | 'totalPayments'
  > {
  bankDetails: SupplierBankDetails | null;
  bankDetailsRedacted?: boolean;
  financialsRedacted?: boolean;
  creditLimit: number | null;
  openingBalance: number | null;
  currentOutstandingBalance: number | null;
  advanceBalance: number | null;
  totalPurchases: number | null;
  totalPayments: number | null;
}

export interface SupplierViewerAccess {
  role: string;
  permissions: string[];
  assignedBranchIds: string[];
}

export interface CreateSupplierInput {
  supplierCode?: string;
  legalName: string;
  tradeName?: string;
  contactPerson: string;
  primaryPhone: string;
  alternatePhone?: string | null;
  email?: string | null;
  gstin?: string | null;
  pan?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  state: string;
  stateCode?: string;
  pincode?: string | null;
  drugLicenceNumber?: string | null;
  supplierType?: SupplierType;
  paymentTerms?: string;
  creditPeriodDays?: number;
  creditLimit?: number;
  openingBalance?: number;
  bankDetails?: SupplierBankDetails | null;
  notes?: string | null;
  confirmDuplicate?: boolean;
}

export type UpdateSupplierInput = Partial<Omit<CreateSupplierInput, 'openingBalance'>>;

export function toPaise(amount: number): number {
  return Math.round((Number(amount) || 0) * 100);
}

export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

export function roundPaise(amount: number): number {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
}

const INDIAN_STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

export function resolveStateCodeByName(stateName?: string | null): string | undefined {
  if (!stateName) return undefined;
  const target = stateName.trim().toLowerCase();
  for (const [code, name] of Object.entries(INDIAN_STATE_CODES)) {
    if (name.toLowerCase() === target || name.toLowerCase().includes(target)) {
      return code;
    }
  }
  return undefined;
}

export function validateGstinFormat(gstin?: string | null): string | null {
  if (!gstin || !gstin.trim()) return null;
  const clean = gstin.trim().toUpperCase();
  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!regex.test(clean)) {
    throw new BadRequestError(
      `Invalid GSTIN format '${clean}'. Expected 15-character format e.g. 27AAECM4019C1Z4.`
    );
  }
  const stateCode = clean.slice(0, 2);
  if (!INDIAN_STATE_CODES[stateCode]) {
    throw new BadRequestError(`GSTIN '${clean}' contains invalid Indian GST state code '${stateCode}'.`);
  }
  return clean;
}

export function validatePanFormat(pan?: string | null): string | null {
  if (!pan || !pan.trim()) return null;
  const clean = pan.trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(clean)) {
    throw new BadRequestError(`Invalid PAN format '${clean}'. Expected 10-character format e.g. AAECM4019C.`);
  }
  return clean;
}

export function normalizeSupplierIndianPhone(rawPhone: string): {
  formatted: string;
  normalized: string;
} {
  const trimmed = String(rawPhone || '').trim();
  const digits = trimmed.replace(/\D/g, '');

  let local10 = '';
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    local10 = digits;
  } else if (digits.length === 11 && digits.startsWith('0') && /^[6-9]\d{9}$/.test(digits.slice(1))) {
    local10 = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith('91') && /^[6-9]\d{9}$/.test(digits.slice(2))) {
    local10 = digits.slice(2);
  } else if (digits.length >= 10 && digits.length <= 12 && /^[1-9]\d{9,11}$/.test(digits)) {
    // Allow Indian STD landlines (10-11 digits without leading 0 or with +91)
    local10 = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  } else {
    throw new BadRequestError(
      `Invalid Indian phone number '${trimmed}'. Provide a valid 10-digit Indian mobile (+91XXXXXXXXXX) or landline number.`
    );
  }

  return {
    normalized: local10.length === 10 ? `+91${local10}` : `+91${local10}`,
    formatted: local10.length === 10 ? `+91 ${local10.slice(0, 5)} ${local10.slice(5)}` : `+91 ${local10}`,
  };
}

function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildBasicPdfBuffer(lines: string[]): Buffer {
  const escapedLines = lines.slice(0, 48).map((line) =>
    line
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
  );

  let streamContent = 'BT\n/F1 10 Tf\n40 780 Td\n14 TL\n';
  for (let i = 0; i < escapedLines.length; i++) {
    if (i === 0) {
      streamContent += `(${escapedLines[i]}) Tj\n`;
    } else {
      streamContent += `T* (${escapedLines[i]}) Tj\n`;
    }
  }
  streamContent += 'ET';

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

// ==========================================
// In-Memory Test Store & Concurrency Locks
// ==========================================
const testSupplierStore = new Map<string, SupplierRecord>();
const testSupplierLocks = new Map<string, Promise<unknown>>();

export async function withTestSupplierLock<T>(
  tenantId: string,
  supplierId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = `${tenantId}:sup:${supplierId}`;
  const previous = testSupplierLocks.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => current, () => current);
  testSupplierLocks.set(lockKey, chained);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (testSupplierLocks.get(lockKey) === chained) {
      testSupplierLocks.delete(lockKey);
    }
  }
}

export function setTestSupplier(tenantId: string, supplier: SupplierRecord): void {
  testSupplierStore.set(`${tenantId}:${supplier.id}`, supplier);
}

export function getTestSupplierDirect(tenantId: string, supplierId: string): SupplierRecord | undefined {
  return testSupplierStore.get(`${tenantId}:${supplierId}`);
}

export function getAllTestSuppliersForTenant(tenantId: string): SupplierRecord[] {
  const list: SupplierRecord[] = [];
  for (const [k, v] of testSupplierStore.entries()) {
    if (k.startsWith(`${tenantId}:`)) list.push(v);
  }
  return list;
}

export function clearTestSuppliers(): void {
  testSupplierStore.clear();
  testSupplierLocks.clear();
}

export class SupplierService {
  private static isTest(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST)
    );
  }

  public static sanitizeSupplier(
    sup: SupplierRecord,
    viewer?: SupplierViewerAccess
  ): SanitizedSupplierRecord {
    const isOwner = viewer?.role === 'owner' || viewer?.permissions.includes('*');
    const canViewFinancials =
      !viewer ||
      isOwner ||
      viewer.permissions.includes('suppliers.view_financials') ||
      viewer.permissions.includes('suppliers.payables');
    const canViewBank =
      !viewer || isOwner || viewer.permissions.includes('suppliers.view_bank_details');

    return {
      ...sup,
      bankDetails: canViewBank ? (sup.bankDetails ?? null) : null,
      bankDetailsRedacted: !canViewBank && Boolean(sup.bankDetails),
      financialsRedacted: !canViewFinancials,
      creditLimit: canViewFinancials ? sup.creditLimit : null,
      openingBalance: canViewFinancials ? sup.openingBalance : null,
      currentOutstandingBalance: canViewFinancials ? sup.currentOutstandingBalance : null,
      advanceBalance: canViewFinancials ? sup.advanceBalance : null,
      totalPurchases: canViewFinancials ? sup.totalPurchases : null,
      totalPayments: canViewFinancials ? sup.totalPayments : null,
    };
  }

  public static async getAllRawSuppliers(tenantId: string): Promise<SupplierRecord[]> {
    if (this.isTest()) {
      return getAllTestSuppliersForTenant(tenantId);
    }
    const db = firestore();
    const snap = await db.collection('tenants').doc(tenantId).collection('suppliers').get();
    return snap.docs.map((d) => d.data() as SupplierRecord);
  }

  public static async getRawSupplier(tenantId: string, supplierId: string): Promise<SupplierRecord> {
    if (this.isTest()) {
      const found = testSupplierStore.get(`${tenantId}:${supplierId}`);
      if (!found) {
        throw new NotFoundError(`Supplier '${supplierId}' not found`);
      }
      return { ...found };
    }
    const db = firestore();
    const snap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('suppliers')
      .doc(supplierId)
      .get();
    if (!snap.exists) {
      throw new NotFoundError(`Supplier '${supplierId}' not found`);
    }
    return snap.data() as SupplierRecord;
  }

  public static async listSuppliers(
    tenantId: string,
    options: {
      search?: string;
      status?: SupplierStatus;
      supplierType?: SupplierType;
      includeArchived?: boolean;
      hasOutstanding?: boolean;
      page?: number;
      limit?: number;
    },
    viewer?: SupplierViewerAccess
  ) {
    let items = await this.getAllRawSuppliers(tenantId);

    if (!options.includeArchived) {
      items = items.filter((s) => !s.isArchived);
    }
    if (options.status) {
      items = items.filter((s) => s.status === options.status);
    }
    if (options.supplierType) {
      items = items.filter((s) => s.supplierType === options.supplierType);
    }
    if (options.hasOutstanding) {
      items = items.filter((s) => (s.currentOutstandingBalance || 0) > 0);
    }
    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      items = items.filter(
        (s) =>
          s.tradeName.toLowerCase().includes(q) ||
          s.legalName.toLowerCase().includes(q) ||
          s.supplierCode.toLowerCase().includes(q) ||
          s.primaryPhone.toLowerCase().includes(q) ||
          s.normalizedPhone.toLowerCase().includes(q) ||
          (s.gstin || '').toLowerCase().includes(q) ||
          s.contactPerson.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => a.tradeName.localeCompare(b.tradeName));
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    return {
      suppliers: items.slice(offset, offset + limit).map((s) => this.sanitizeSupplier(s, viewer)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  public static async getSupplier(
    tenantId: string,
    supplierId: string,
    viewer?: SupplierViewerAccess
  ): Promise<SanitizedSupplierRecord> {
    const sup = await this.getRawSupplier(tenantId, supplierId);
    return this.sanitizeSupplier(sup, viewer);
  }

  public static async createSupplier(
    tenantId: string,
    input: CreateSupplierInput,
    userId: string,
    viewer?: SupplierViewerAccess
  ): Promise<SanitizedSupplierRecord> {
    const cleanGstin = validateGstinFormat(input.gstin);
    const cleanPan = validatePanFormat(input.pan);
    const phoneParsed = normalizeSupplierIndianPhone(input.primaryPhone);
    const altPhoneParsed = input.alternatePhone?.trim()
      ? normalizeSupplierIndianPhone(input.alternatePhone).formatted
      : null;

    if (input.pincode && !/^\d{6}$/.test(input.pincode.trim())) {
      throw new BadRequestError('PIN code must be a valid 6-digit Indian postal code.');
    }

    const legalName = input.legalName.trim();
    const tradeName = (input.tradeName?.trim() || legalName).trim();

    const stateCode =
      (input.stateCode?.trim() ||
        (cleanGstin ? cleanGstin.slice(0, 2) : undefined) ||
        resolveStateCodeByName(input.state) ||
        '').padStart(2, '0');
    if (!stateCode || !INDIAN_STATE_CODES[stateCode]) {
      throw new BadRequestError(
        `Valid Indian stateCode (2 digits, e.g. '27' for Maharashtra or '29' for Karnataka) is required.`
      );
    }

    const existing = await this.getAllRawSuppliers(tenantId);
    const duplicate = existing.find((s) => {
      if (s.isArchived) return false;
      const sameGstin = Boolean(cleanGstin && s.gstin && s.gstin === cleanGstin);
      const samePhone = s.normalizedPhone === phoneParsed.normalized;
      const sameName =
        s.legalName.trim().toLowerCase() === legalName.toLowerCase() ||
        s.tradeName.trim().toLowerCase() === tradeName.toLowerCase();
      return sameGstin || samePhone || sameName;
    });

    if (duplicate && !input.confirmDuplicate) {
      const reasons: string[] = [];
      if (cleanGstin && duplicate.gstin === cleanGstin) reasons.push(`GSTIN ${cleanGstin}`);
      if (duplicate.normalizedPhone === phoneParsed.normalized)
        reasons.push(`phone ${phoneParsed.normalized}`);
      if (
        duplicate.legalName.trim().toLowerCase() === legalName.toLowerCase() ||
        duplicate.tradeName.trim().toLowerCase() === tradeName.toLowerCase()
      ) {
        reasons.push(`name '${duplicate.tradeName}'`);
      }
      throw new ConflictError(
        `Likely duplicate supplier found matching ${reasons.join(', ')}: '${duplicate.tradeName}' (${duplicate.supplierCode}). Review existing record or confirm creation explicitly.`
      );
    }

    const creditPeriodDays = Math.max(0, Math.round(Number(input.creditPeriodDays ?? 21)));
    const creditLimit = roundPaise(Math.max(0, Number(input.creditLimit ?? 0)));
    const openingBalance = roundPaise(Math.max(0, Number(input.openingBalance ?? 0)));
    const now = new Date().toISOString();
    const supplierId = `sup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const supplierCode =
      input.supplierCode?.trim().toUpperCase() ||
      `SUP-${String(existing.length + 1).padStart(4, '0')}`;

    if (existing.some((s) => s.supplierCode.toUpperCase() === supplierCode)) {
      throw new ConflictError(`Supplier code '${supplierCode}' is already assigned.`);
    }

    const record: SupplierRecord = {
      id: supplierId,
      supplierId,
      tenantId,
      supplierCode,
      legalName,
      tradeName,
      contactPerson: input.contactPerson.trim(),
      primaryPhone: phoneParsed.formatted,
      normalizedPhone: phoneParsed.normalized,
      alternatePhone: altPhoneParsed,
      email: input.email?.trim() || null,
      gstin: cleanGstin,
      gstinFormatValid: Boolean(cleanGstin),
      gstinVerificationNote: cleanGstin
        ? 'GSTIN syntax validated locally; not government-verified via GST portal'
        : 'No GSTIN provided',
      pan: cleanPan,
      billingAddress: input.billingAddress?.trim() || null,
      shippingAddress: input.shippingAddress?.trim() || input.billingAddress?.trim() || null,
      state: input.state.trim(),
      stateCode,
      pincode: input.pincode?.trim() || null,
      drugLicenceNumber: input.drugLicenceNumber?.trim().toUpperCase() || null,
      supplierType: input.supplierType || 'DISTRIBUTOR',
      paymentTerms: input.paymentTerms?.trim() || `Net ${creditPeriodDays} days`,
      creditPeriodDays,
      creditLimit,
      openingBalance,
      currentOutstandingBalance: openingBalance,
      advanceBalance: 0,
      totalPurchases: 0,
      totalPayments: 0,
      lastPurchaseDate: null,
      lastPaymentDate: null,
      bankDetails: input.bankDetails || null,
      attachments: [],
      notes: input.notes?.trim() || null,
      status: 'ACTIVE',
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      blockReason: null,
      duplicateConfirmed: Boolean(duplicate && input.confirmDuplicate),
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    };

    if (this.isTest()) {
      testSupplierStore.set(`${tenantId}:${supplierId}`, record);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('suppliers')
        .doc(supplierId)
        .set(record);
    }

    if (openingBalance > 0) {
      try {
        await AccountingService.recordSupplierOpeningBalanceAccounting({
          tenantId,
          branchId: 'main',
          supplierId,
          supplierName: tradeName,
          openingBalance,
          createdAt: now,
          userId,
        });
      } catch (accErr) {
        logger.error({ err: accErr, supplierId }, 'Supplier opening balance accounting hook failed');
      }
    }

    await AuditService.log({
      tenantId,
      actingUserId: userId,
      action: 'SUPPLIER_CREATED',
      metadata: {
        entityType: 'supplier',
        entityId: supplierId,
        supplierCode,
        tradeName,
        gstin: cleanGstin,
        openingBalance,
      },
    });

    return this.sanitizeSupplier(record, viewer);
  }

  public static async updateSupplier(
    tenantId: string,
    supplierId: string,
    input: UpdateSupplierInput,
    userId: string,
    viewer?: SupplierViewerAccess
  ): Promise<SanitizedSupplierRecord> {
    const current = await this.getRawSupplier(tenantId, supplierId);

    const cleanGstin =
      input.gstin !== undefined ? validateGstinFormat(input.gstin) : current.gstin || null;
    const cleanPan =
      input.pan !== undefined ? validatePanFormat(input.pan) : current.pan || null;

    let primaryPhone = current.primaryPhone;
    let normalizedPhone = current.normalizedPhone;
    if (input.primaryPhone !== undefined) {
      const parsed = normalizeSupplierIndianPhone(input.primaryPhone);
      primaryPhone = parsed.formatted;
      normalizedPhone = parsed.normalized;
    }

    if (input.pincode !== undefined && input.pincode && !/^\d{6}$/.test(input.pincode.trim())) {
      throw new BadRequestError('PIN code must be a valid 6-digit Indian postal code.');
    }

    const nextStateCode =
      input.stateCode?.trim() ||
      (cleanGstin ? cleanGstin.slice(0, 2) : current.stateCode);

    if (!INDIAN_STATE_CODES[nextStateCode]) {
      throw new BadRequestError(`Invalid 2-digit Indian GST state code '${nextStateCode}'.`);
    }

    // Check bank details update authorization if supplied
    if (input.bankDetails !== undefined && viewer) {
      const isOwner = viewer.role === 'owner' || viewer.permissions.includes('*');
      if (!isOwner && !viewer.permissions.includes('suppliers.view_bank_details')) {
        throw new ForbiddenError('Missing required permission(s): [suppliers.view_bank_details]');
      }
    }

    const now = new Date().toISOString();
    const updated: SupplierRecord = {
      ...current,
      legalName: input.legalName !== undefined ? input.legalName.trim() : current.legalName,
      tradeName: input.tradeName !== undefined ? input.tradeName.trim() : current.tradeName,
      contactPerson:
        input.contactPerson !== undefined ? input.contactPerson.trim() : current.contactPerson,
      primaryPhone,
      normalizedPhone,
      alternatePhone:
        input.alternatePhone !== undefined
          ? input.alternatePhone?.trim()
            ? normalizeSupplierIndianPhone(input.alternatePhone).formatted
            : null
          : current.alternatePhone,
      email: input.email !== undefined ? input.email?.trim() || null : current.email,
      gstin: cleanGstin,
      gstinFormatValid: Boolean(cleanGstin),
      gstinVerificationNote: cleanGstin
        ? 'GSTIN syntax validated locally; not government-verified via GST portal'
        : 'No GSTIN provided',
      pan: cleanPan,
      billingAddress:
        input.billingAddress !== undefined
          ? input.billingAddress?.trim() || null
          : current.billingAddress,
      shippingAddress:
        input.shippingAddress !== undefined
          ? input.shippingAddress?.trim() || null
          : current.shippingAddress,
      state: input.state !== undefined ? input.state.trim() : current.state,
      stateCode: nextStateCode,
      pincode: input.pincode !== undefined ? input.pincode?.trim() || null : current.pincode,
      drugLicenceNumber:
        input.drugLicenceNumber !== undefined
          ? input.drugLicenceNumber?.trim().toUpperCase() || null
          : current.drugLicenceNumber,
      supplierType: input.supplierType ?? current.supplierType,
      paymentTerms: input.paymentTerms !== undefined ? input.paymentTerms.trim() : current.paymentTerms,
      creditPeriodDays:
        input.creditPeriodDays !== undefined
          ? Math.max(0, Math.round(Number(input.creditPeriodDays)))
          : current.creditPeriodDays,
      creditLimit:
        input.creditLimit !== undefined
          ? roundPaise(Math.max(0, Number(input.creditLimit)))
          : current.creditLimit,
      bankDetails: input.bankDetails !== undefined ? input.bankDetails : current.bankDetails,
      notes: input.notes !== undefined ? input.notes?.trim() || null : current.notes,
      updatedAt: now,
      updatedBy: userId,
    };

    if (this.isTest()) {
      testSupplierStore.set(`${tenantId}:${supplierId}`, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('suppliers')
        .doc(supplierId)
        .set(updated);
    }

    await AuditService.log({
      tenantId,
      actingUserId: userId,
      action: 'SUPPLIER_UPDATED',
      metadata: {
        entityType: 'supplier',
        entityId: supplierId,
        supplierCode: updated.supplierCode,
        tradeName: updated.tradeName,
      },
    });

    return this.sanitizeSupplier(updated, viewer);
  }

  public static async updateSupplierStatus(
    tenantId: string,
    supplierId: string,
    status: SupplierStatus,
    reason: string | undefined,
    userId: string,
    viewer?: SupplierViewerAccess
  ): Promise<SanitizedSupplierRecord> {
    const current = await this.getRawSupplier(tenantId, supplierId);
    const isOwner = !viewer || viewer.role === 'owner' || viewer.permissions.includes('*');

    // Archived or blocked suppliers require explicit owner reactivation
    if ((current.status === 'BLOCKED' || current.isArchived) && status === 'ACTIVE' && !isOwner) {
      throw new ForbiddenError(
        'Only an authorized pharmacy owner can reactivate a blocked or archived supplier.'
      );
    }

    const now = new Date().toISOString();
    const updated: SupplierRecord = {
      ...current,
      status,
      isArchived: status === 'ACTIVE' ? false : current.isArchived,
      archivedAt: status === 'ACTIVE' ? null : current.archivedAt,
      archivedBy: status === 'ACTIVE' ? null : current.archivedBy,
      blockReason: status === 'BLOCKED' ? reason?.trim() || 'Blocked by administration' : null,
      updatedAt: now,
      updatedBy: userId,
    };

    if (this.isTest()) {
      testSupplierStore.set(`${tenantId}:${supplierId}`, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('suppliers')
        .doc(supplierId)
        .set(updated);
    }

    await AuditService.log({
      tenantId,
      actingUserId: userId,
      action: status === 'BLOCKED' ? 'SUPPLIER_BLOCKED' : 'SUPPLIER_STATUS_UPDATED',
      metadata: {
        entityType: 'supplier',
        entityId: supplierId,
        previousStatus: current.status,
        newStatus: status,
        reason: reason || null,
      },
    });

    return this.sanitizeSupplier(updated, viewer);
  }

  public static async archiveSupplier(
    tenantId: string,
    supplierId: string,
    reason: string | undefined,
    userId: string,
    viewer?: SupplierViewerAccess
  ): Promise<SanitizedSupplierRecord> {
    const current = await this.getRawSupplier(tenantId, supplierId);
    if (toPaise(current.currentOutstandingBalance) > 0) {
      throw new BadRequestError(
        `Cannot archive supplier '${current.tradeName}' while outstanding payable balance is ₹${current.currentOutstandingBalance.toFixed(2)}.`
      );
    }

    const now = new Date().toISOString();
    const updated: SupplierRecord = {
      ...current,
      status: 'INACTIVE',
      isArchived: true,
      archivedAt: now,
      archivedBy: userId,
      updatedAt: now,
      updatedBy: userId,
    };

    if (this.isTest()) {
      testSupplierStore.set(`${tenantId}:${supplierId}`, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('suppliers')
        .doc(supplierId)
        .set(updated);
    }

    await AuditService.log({
      tenantId,
      actingUserId: userId,
      action: 'SUPPLIER_ARCHIVED',
      metadata: {
        entityType: 'supplier',
        entityId: supplierId,
        reason: reason || 'Archived by administrator',
      },
    });

    return this.sanitizeSupplier(updated, viewer);
  }

  public static async attachDocument(
    tenantId: string,
    branchId: string,
    supplierId: string,
    attachment: Omit<SupplierAttachment, 'id' | 'uploadedAt' | 'uploadedBy' | 'branchId'>,
    userId: string,
    viewer?: SupplierViewerAccess
  ): Promise<SanitizedSupplierRecord> {
    const current = await this.getRawSupplier(tenantId, supplierId);
    const now = new Date().toISOString();
    const entry: SupplierAttachment = {
      id: `satt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      name: attachment.name.trim(),
      category: attachment.category,
      storagePath: attachment.storagePath.trim(),
      branchId,
      fileId: attachment.fileId.trim(),
      contentType: attachment.contentType,
      uploadedBy: userId,
      uploadedAt: now,
    };

    const updated: SupplierRecord = {
      ...current,
      attachments: [entry, ...(current.attachments || [])],
      updatedAt: now,
      updatedBy: userId,
    };

    if (this.isTest()) {
      testSupplierStore.set(`${tenantId}:${supplierId}`, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('suppliers')
        .doc(supplierId)
        .set(updated);
    }

    await AuditService.log({
      tenantId,
      actingUserId: userId,
      action: 'SUPPLIER_DOCUMENT_ATTACHED',
      metadata: {
        entityType: 'supplier',
        entityId: supplierId,
        branchId,
        storagePath: entry.storagePath,
      },
    });

    return this.sanitizeSupplier(updated, viewer);
  }

  public static buildExportBuffer(
    format: 'csv' | 'pdf',
    title: string,
    supplier: SupplierRecord,
    rows: Array<{
      date: string;
      type: string;
      reference: string;
      description: string;
      debitInr: number;
      creditInr: number;
      balanceInr: number;
    }>,
    openingBalance: number,
    closingBalance: number
  ): { buffer: Buffer; mimeType: string; fileName: string } {
    const slug = supplier.tradeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28) || supplier.id;
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `supplier-statement-${slug}-${dateStamp}.${format}`;

    if (format === 'csv') {
      const csvRows: string[] = [
        ['Date', 'Entry Type', 'Reference', 'Description', 'Payable Added (INR)', 'Paid / Credit (INR)', 'Running Payable (INR)']
          .map(escapeCsvCell)
          .join(','),
      ];
      for (const r of rows) {
        csvRows.push(
          [
            r.date.slice(0, 19).replace('T', ' '),
            r.type,
            r.reference,
            r.description,
            r.debitInr.toFixed(2),
            r.creditInr.toFixed(2),
            r.balanceInr.toFixed(2),
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      }
      csvRows.push('');
      csvRows.push(
        [
          `Summary (${supplier.tradeName})`,
          'Opening Payable',
          openingBalance.toFixed(2),
          'Closing Payable',
          closingBalance.toFixed(2),
          '',
          '',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
      return {
        buffer: Buffer.from(csvRows.join('\n'), 'utf8'),
        mimeType: 'text/csv; charset=utf-8',
        fileName,
      };
    }

    const lines = [
      title,
      `Supplier: ${supplier.tradeName} (${supplier.supplierCode}) | GSTIN: ${supplier.gstin || 'N/A'}`,
      `Phone: ${supplier.primaryPhone} | Terms: ${supplier.paymentTerms}`,
      `Opening Balance: INR ${openingBalance.toFixed(2)} | Closing Balance: INR ${closingBalance.toFixed(2)}`,
      '--------------------------------------------------------------------------',
      'DATE        TYPE              REF                CREDIT(+)    DEBIT(-)     BAL',
      ...rows.map(
        (r) =>
          `${r.date.slice(0, 10)}  ${r.type.slice(0, 16).padEnd(16, ' ')}  ${r.reference
            .slice(0, 16)
            .padEnd(16, ' ')}  ${r.debitInr.toFixed(2).padStart(10, ' ')}  ${r.creditInr
            .toFixed(2)
            .padStart(10, ' ')}  ${r.balanceInr.toFixed(2).padStart(10, ' ')}`
      ),
    ];

    return {
      buffer: buildBasicPdfBuffer(lines),
      mimeType: 'application/pdf',
      fileName,
    };
  }

  public static async archiveExportedFile(
    tenantId: string,
    branchId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<{ storagePath: string; downloadUrl: string }> {
    const storagePath = `tenants/${tenantId}/branches/${branchId}/documents/${Date.now()}_${fileName}`;
    let downloadUrl = '';
    if (!this.isTest()) {
      try {
        const bucket = storage().bucket(env.FIREBASE_STORAGE_BUCKET);
        await bucket.file(storagePath).save(buffer, { contentType: mimeType, resumable: false });
        const dl = await StorageService.getSignedDownloadUrl({
          tenantId,
          branchId,
          category: 'documents',
          fileId: storagePath.split('/').pop()!,
        });
        downloadUrl = dl.downloadUrl;
      } catch (err: any) {
        logger.warn({ err: err?.message, storagePath }, 'Firebase Storage unavailable; returning inline export buffer');
      }
    } else {
      downloadUrl = `https://storage.googleapis.com/${env.FIREBASE_STORAGE_BUCKET}/${storagePath}?mockDownload=1`;
    }
    return { storagePath, downloadUrl };
  }
}

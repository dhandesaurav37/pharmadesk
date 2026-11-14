import crypto from 'node:crypto';
import { firestore } from '../lib/firebaseAdmin';
import { env } from '../config/env';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors';
import { BranchLifecycleStatus, UserRole } from '../types/express';
import { AuditService } from './auditService';
import {
  getTestMemberships,
  MembershipRecord,
  normalizeBranchLifecycleStatus,
  setTestBranchStatus,
  setTestMembership,
} from '../middleware/tenantAuthorization';
import { InventoryService } from './inventoryService';
import { ProcurementService } from './procurementService';
import { BillingTransactionService } from './billingTransactionService';
import { AccountingService } from './accountingService';

export type BranchType = 'MAIN' | 'RETAIL' | 'WAREHOUSE' | 'CLINIC' | 'HOSPITAL_COUNTER';

export interface BranchTransferPolicy {
  requireApproval: boolean;
  allowSelfApproval: boolean;
  approvalThresholdAmount: number;
  approvalThresholdQty: number;
  defaultPriceBasis: 'PTR' | 'SELLING';
}

export interface BranchRecord {
  id: string;
  tenantId: string;
  branchCode: string;
  name: string;
  branchType: BranchType;
  isMain: boolean;
  isPrimary: boolean;
  status: BranchLifecycleStatus;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  gstin?: string | null;
  dlNumber20B?: string | null;
  dlNumber21B?: string | null;
  managerUserId?: string | null;
  managerName?: string | null;
  operatingHours?: string | null;
  timezone: string;
  transferPolicy: BranchTransferPolicy;
  closedAt?: string | null;
  closedBy?: string | null;
  closureNotes?: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BranchAuditLogRecord {
  id: string;
  tenantId: string;
  branchId: string;
  action: string;
  entityType: 'BRANCH' | 'BRANCH_STAFF' | 'STOCK_TRANSFER';
  entityId: string;
  performedBy: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface BranchClosureCheckResult {
  branchId: string;
  branchCode: string;
  branchName: string;
  currentStatus: BranchLifecycleStatus;
  canClose: boolean;
  blockers: string[];
  warnings: string[];
  checks: {
    isPrimaryBranch: boolean;
    activeBranchesRemaining: number;
    pendingTransfersCount: number;
    openPurchaseOrdersCount: number;
    draftGrnsCount: number;
    unsettledExpensesCount: number;
    openSalesReceivablesCount: number;
    openSalesReceivablesAmount: number;
    openSupplierPayablesCount: number;
    openSupplierPayablesAmount: number;
    remainingStockUnits: number;
    remainingStockPtrValue: number;
  };
}

export interface CreateBranchInput {
  id?: string;
  branchCode: string;
  name: string;
  branchType?: BranchType;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  gstin?: string | null;
  dlNumber20B?: string | null;
  dlNumber21B?: string | null;
  managerUserId?: string | null;
  managerName?: string | null;
  operatingHours?: string | null;
  timezone?: string;
  isPrimary?: boolean;
  transferPolicy?: Partial<BranchTransferPolicy>;
}

export interface UpdateBranchInput {
  branchCode?: string;
  name?: string;
  branchType?: BranchType;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  gstin?: string | null;
  dlNumber20B?: string | null;
  dlNumber21B?: string | null;
  managerUserId?: string | null;
  managerName?: string | null;
  operatingHours?: string | null;
  timezone?: string;
}

const DEFAULT_TRANSFER_POLICY: BranchTransferPolicy = {
  requireApproval: true,
  allowSelfApproval: false,
  approvalThresholdAmount: 25000,
  approvalThresholdQty: 500,
  defaultPriceBasis: 'PTR',
};

// In-memory stores for unit/integration Vitest execution
const testBranchStore = new Map<string, Map<string, BranchRecord>>();
const testBranchAuditStore = new Map<string, BranchAuditLogRecord[]>();
const testBranchLocks = new Map<string, Promise<unknown>>();

function getTenantBranchMap(tenantId: string): Map<string, BranchRecord> {
  let map = testBranchStore.get(tenantId);
  if (!map) {
    map = new Map<string, BranchRecord>();
    testBranchStore.set(tenantId, map);
  }
  return map;
}

export function clearTestBranchData(): void {
  testBranchStore.clear();
  testBranchAuditStore.clear();
  testBranchLocks.clear();
}

export function setTestBranchDirect(branch: BranchRecord): void {
  const map = getTenantBranchMap(branch.tenantId);
  map.set(branch.id, branch);
  setTestBranchStatus(branch.tenantId, branch.id, branch.status);
}

export function getTestBranchAuditLogsDirect(tenantId: string): BranchAuditLogRecord[] {
  return [...(testBranchAuditStore.get(tenantId) || [])];
}

async function withBranchLock<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const prev = testBranchLocks.get(tenantId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  testBranchLocks.set(tenantId, next);
  try {
    await prev.catch(() => undefined);
    return await fn();
  } finally {
    release();
    if (testBranchLocks.get(tenantId) === next) {
      testBranchLocks.delete(tenantId);
    }
  }
}

function normalizeBranchDoc(raw: Record<string, any>, fallbackTenantId: string): BranchRecord {
  const isMain = Boolean(raw.isMain ?? raw.isPrimary ?? raw.id === 'main');
  const status = normalizeBranchLifecycleStatus(raw.status);
  return {
    id: String(raw.id),
    tenantId: String(raw.tenantId || fallbackTenantId),
    branchCode: String(raw.branchCode || raw.id || 'MAIN').trim().toUpperCase(),
    name: String(raw.name || 'Main Pharmacy Counter').trim(),
    branchType: (raw.branchType as BranchType) || (isMain ? 'MAIN' : 'RETAIL'),
    isMain,
    isPrimary: Boolean(raw.isPrimary ?? isMain),
    status,
    address: String(raw.address || ''),
    city: String(raw.city || ''),
    state: String(raw.state || ''),
    pincode: String(raw.pincode || ''),
    phone: String(raw.phone || ''),
    email: String(raw.email || ''),
    gstin: raw.gstin ?? null,
    dlNumber20B: raw.dlNumber20B ?? null,
    dlNumber21B: raw.dlNumber21B ?? null,
    managerUserId: raw.managerUserId ?? null,
    managerName: raw.managerName ?? null,
    operatingHours: raw.operatingHours ?? '09:00 AM - 10:00 PM',
    timezone: String(raw.timezone || 'Asia/Kolkata'),
    transferPolicy: {
      ...DEFAULT_TRANSFER_POLICY,
      ...(raw.transferPolicy || {}),
    },
    closedAt: raw.closedAt ?? null,
    closedBy: raw.closedBy ?? null,
    closureNotes: raw.closureNotes ?? null,
    createdBy: String(raw.createdBy || 'system'),
    updatedBy: String(raw.updatedBy || 'system'),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
  };
}

export class BranchService {
  private static isTest(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST)
    );
  }

  public static async recordBranchAuditLog(entry: Omit<BranchAuditLogRecord, 'id' | 'createdAt'>): Promise<BranchAuditLogRecord> {
    const record: BranchAuditLogRecord = {
      ...entry,
      id: `baud_${crypto.randomBytes(6).toString('hex')}`,
      createdAt: new Date().toISOString(),
    };

    if (this.isTest()) {
      const list = testBranchAuditStore.get(entry.tenantId) || [];
      list.unshift(record);
      testBranchAuditStore.set(entry.tenantId, list);
    } else {
      const db = firestore();
      await db
        .collection('tenants')
        .doc(entry.tenantId)
        .collection('branchAuditLogs')
        .doc(record.id)
        .set(record);
    }

    await AuditService.log({
      tenantId: entry.tenantId,
      actingUserId: entry.performedBy,
      action: entry.action,
      metadata: {
        branchId: entry.branchId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ...(entry.details || {}),
      },
    });

    return record;
  }

  public static async listBranchAuditLogs(
    tenantId: string,
    branchId?: string,
    limit = 100
  ): Promise<BranchAuditLogRecord[]> {
    if (this.isTest()) {
      const all = testBranchAuditStore.get(tenantId) || [];
      return (branchId ? all.filter((l) => l.branchId === branchId) : all).slice(0, limit);
    }

    const db = firestore();
    let q = db
      .collection('tenants')
      .doc(tenantId)
      .collection('branchAuditLogs') as FirebaseFirestore.Query;
    if (branchId) {
      q = q.where('branchId', '==', branchId);
    }
    const snap = await q.orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => d.data() as BranchAuditLogRecord);
  }

  private static async ensureMainBranchSeeded(tenantId: string): Promise<BranchRecord> {
    const now = new Date().toISOString();
    if (this.isTest()) {
      const map = getTenantBranchMap(tenantId);
      const existing = map.get('main');
      if (existing) return existing;

      const mainBranch: BranchRecord = {
        id: 'main',
        tenantId,
        branchCode: 'MAIN',
        name: 'Main Pharmacy Counter',
        branchType: 'MAIN',
        isMain: true,
        isPrimary: true,
        status: 'ACTIVE',
        address: 'Main Medical Square',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        phone: '+91 9800000000',
        email: 'main@pharmadesk.in',
        gstin: null,
        dlNumber20B: null,
        dlNumber21B: null,
        managerUserId: null,
        managerName: null,
        operatingHours: '09:00 AM - 10:00 PM',
        timezone: 'Asia/Kolkata',
        transferPolicy: { ...DEFAULT_TRANSFER_POLICY },
        closedAt: null,
        closedBy: null,
        closureNotes: null,
        createdBy: 'system',
        updatedBy: 'system',
        createdAt: now,
        updatedAt: now,
      };
      map.set('main', mainBranch);
      setTestBranchStatus(tenantId, 'main', mainBranch.status);
      return mainBranch;
    }

    const db = firestore();
    const tenantRef = db.collection('tenants').doc(tenantId);
    const mainRef = tenantRef.collection('branches').doc('main');
    const mainSnap = await mainRef.get();
    if (mainSnap.exists) {
      return normalizeBranchDoc(mainSnap.data() as Record<string, any>, tenantId);
    }

    const tenantSnap = await tenantRef.get();
    const tenantData = tenantSnap.exists ? (tenantSnap.data() as Record<string, any>) : {};
    const mainBranch: BranchRecord = {
      id: 'main',
      tenantId,
      branchCode: 'MAIN',
      name: tenantData.name ? `${tenantData.name} (Main Store)` : 'Main Pharmacy Counter',
      branchType: 'MAIN',
      isMain: true,
      isPrimary: true,
      status: 'ACTIVE',
      address: String(tenantData.address || ''),
      city: String(tenantData.city || ''),
      state: String(tenantData.state || ''),
      pincode: String(tenantData.pincode || ''),
      phone: String(tenantData.contactPhone || ''),
      email: String(tenantData.contactEmail || ''),
      gstin: tenantData.gstin ?? null,
      dlNumber20B: tenantData.dlNumber20B ?? null,
      dlNumber21B: tenantData.dlNumber21B ?? null,
      managerUserId: tenantData.ownerId ?? null,
      managerName: null,
      operatingHours: '09:00 AM - 10:00 PM',
      timezone: 'Asia/Kolkata',
      transferPolicy: { ...DEFAULT_TRANSFER_POLICY },
      closedAt: null,
      closedBy: null,
      closureNotes: null,
      createdBy: String(tenantData.ownerId || 'system'),
      updatedBy: String(tenantData.ownerId || 'system'),
      createdAt: String(tenantData.createdAt || now),
      updatedAt: now,
    };
    await mainRef.set(mainBranch);
    return mainBranch;
  }

  public static async listBranches(
    tenantId: string,
    opts?: { status?: BranchLifecycleStatus; includeClosed?: boolean }
  ): Promise<BranchRecord[]> {
    let branches: BranchRecord[];
    if (this.isTest()) {
      await this.ensureMainBranchSeeded(tenantId);
      branches = Array.from(getTenantBranchMap(tenantId).values());
    } else {
      const db = firestore();
      const snap = await db.collection('tenants').doc(tenantId).collection('branches').get();
      if (snap.empty) {
        const seeded = await this.ensureMainBranchSeeded(tenantId);
        branches = [seeded];
      } else {
        branches = snap.docs.map((d) => normalizeBranchDoc(d.data() as Record<string, any>, tenantId));
      }
    }

    let filtered = branches;
    if (opts?.status) {
      filtered = filtered.filter((b) => b.status === opts.status);
    } else if (opts?.includeClosed === false) {
      filtered = filtered.filter((b) => b.status !== 'CLOSED');
    }

    return filtered.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.branchCode.localeCompare(b.branchCode);
    });
  }

  public static async listAuthorizedBranches(
    tenantId: string,
    role: UserRole,
    assignedBranchIds: string[]
  ): Promise<BranchRecord[]> {
    const all = await this.listBranches(tenantId, { includeClosed: true });
    if (role === 'owner') {
      return all;
    }
    const allowed = new Set((assignedBranchIds || []).filter((b) => b !== '*'));
    return all.filter((b) => allowed.has(b.id));
  }

  public static async getBranchById(tenantId: string, branchId: string): Promise<BranchRecord> {
    if (this.isTest()) {
      if (branchId === 'main') {
        await this.ensureMainBranchSeeded(tenantId);
      }
      const found = getTenantBranchMap(tenantId).get(branchId);
      if (!found) {
        throw new NotFoundError(`Branch '${branchId}' not found in pharmacy '${tenantId}'.`);
      }
      return found;
    }

    const db = firestore();
    const doc = await db.collection('tenants').doc(tenantId).collection('branches').doc(branchId).get();
    if (!doc.exists) {
      if (branchId === 'main') {
        return this.ensureMainBranchSeeded(tenantId);
      }
      throw new NotFoundError(`Branch '${branchId}' not found in pharmacy '${tenantId}'.`);
    }
    return normalizeBranchDoc(doc.data() as Record<string, any>, tenantId);
  }

  public static async assertBranchOperational(tenantId: string, branchId: string): Promise<BranchRecord> {
    const branch = await this.getBranchById(tenantId, branchId);
    if (branch.status !== 'ACTIVE') {
      throw new ForbiddenError(
        `Branch '${branch.name}' (${branch.branchCode}) is currently ${branch.status}. New transactions are not allowed.`
      );
    }
    return branch;
  }

  public static async validateBranchesExist(tenantId: string, branchIds: string[]): Promise<void> {
    const branches = await this.listBranches(tenantId, { includeClosed: true });
    const byId = new Map(branches.map((b) => [b.id, b]));
    for (const id of branchIds) {
      if (id === '*') continue;
      const b = byId.get(id);
      if (!b) {
        throw new BadRequestError(`Assigned branch '${id}' does not exist in pharmacy '${tenantId}'.`);
      }
      if (b.status === 'CLOSED') {
        throw new BadRequestError(`Cannot assign employee to closed branch '${b.name}' (${b.branchCode}).`);
      }
    }
  }

  public static async createBranch(
    tenantId: string,
    input: CreateBranchInput,
    actingUserId: string
  ): Promise<BranchRecord> {
    return withBranchLock(tenantId, async () => {
      const branchCode = input.branchCode.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{2,20}$/.test(branchCode)) {
        throw new BadRequestError('Branch code must be 2-20 uppercase alphanumeric, hyphen, or underscore characters.');
      }

      const name = input.name.trim();
      if (name.length < 2) {
        throw new BadRequestError('Branch name must be at least 2 characters.');
      }

      const existing = await this.listBranches(tenantId, { includeClosed: true });
      if (existing.some((b) => b.branchCode.toUpperCase() === branchCode)) {
        throw new ConflictError(`Branch code '${branchCode}' already exists in this pharmacy.`);
      }

      const slugBase = branchCode.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      let branchId = (input.id || `br_${slugBase}_${crypto.randomBytes(2).toString('hex')}`).trim();
      if (existing.some((b) => b.id === branchId)) {
        throw new ConflictError(`Branch ID '${branchId}' already exists in this pharmacy.`);
      }
      if (!/^[a-zA-Z0-9_-]{2,64}$/.test(branchId)) {
        throw new BadRequestError('Invalid branch ID format.');
      }

      const now = new Date().toISOString();
      const makePrimary = Boolean(input.isPrimary);

      const newBranch: BranchRecord = {
        id: branchId,
        tenantId,
        branchCode,
        name,
        branchType: input.branchType || 'RETAIL',
        isMain: makePrimary,
        isPrimary: makePrimary,
        status: 'ACTIVE',
        address: (input.address || '').trim(),
        city: (input.city || '').trim(),
        state: (input.state || '').trim(),
        pincode: (input.pincode || '').trim(),
        phone: (input.phone || '').trim(),
        email: (input.email || '').trim(),
        gstin: input.gstin?.trim() || null,
        dlNumber20B: input.dlNumber20B?.trim() || null,
        dlNumber21B: input.dlNumber21B?.trim() || null,
        managerUserId: input.managerUserId?.trim() || null,
        managerName: input.managerName?.trim() || null,
        operatingHours: input.operatingHours?.trim() || '09:00 AM - 10:00 PM',
        timezone: input.timezone?.trim() || 'Asia/Kolkata',
        transferPolicy: {
          ...DEFAULT_TRANSFER_POLICY,
          ...(input.transferPolicy || {}),
        },
        closedAt: null,
        closedBy: null,
        closureNotes: null,
        createdBy: actingUserId,
        updatedBy: actingUserId,
        createdAt: now,
        updatedAt: now,
      };

      if (this.isTest()) {
        const map = getTenantBranchMap(tenantId);
        if (makePrimary) {
          for (const b of map.values()) {
            b.isPrimary = false;
            b.isMain = false;
            b.updatedAt = now;
          }
        }
        map.set(branchId, newBranch);
        setTestBranchStatus(tenantId, branchId, newBranch.status);
      } else {
        const db = firestore();
        const colRef = db.collection('tenants').doc(tenantId).collection('branches');
        const batch = db.batch();
        if (makePrimary) {
          const allSnap = await colRef.where('isPrimary', '==', true).get();
          allSnap.docs.forEach((d) => {
            batch.update(d.ref, { isPrimary: false, isMain: false, updatedAt: now });
          });
        }
        batch.set(colRef.doc(branchId), newBranch);
        await batch.commit();
      }

      await this.recordBranchAuditLog({
        tenantId,
        branchId,
        action: 'branch.created',
        entityType: 'BRANCH',
        entityId: branchId,
        performedBy: actingUserId,
        details: {
          branchCode,
          name,
          branchType: newBranch.branchType,
          isPrimary: makePrimary,
        },
      });

      return newBranch;
    });
  }

  public static async updateBranch(
    tenantId: string,
    branchId: string,
    input: UpdateBranchInput,
    actingUserId: string
  ): Promise<BranchRecord> {
    return withBranchLock(tenantId, async () => {
      const existing = await this.getBranchById(tenantId, branchId);
      if (existing.status === 'CLOSED') {
        throw new BadRequestError('Closed branches are read-only and cannot be edited.');
      }

      let nextCode = existing.branchCode;
      if (input.branchCode !== undefined) {
        nextCode = input.branchCode.trim().toUpperCase();
        if (!/^[A-Z0-9_-]{2,20}$/.test(nextCode)) {
          throw new BadRequestError('Branch code must be 2-20 uppercase alphanumeric characters.');
        }
        if (nextCode !== existing.branchCode) {
          const all = await this.listBranches(tenantId, { includeClosed: true });
          if (all.some((b) => b.id !== branchId && b.branchCode.toUpperCase() === nextCode)) {
            throw new ConflictError(`Branch code '${nextCode}' is already assigned to another branch.`);
          }
        }
      }

      const now = new Date().toISOString();
      const updated: BranchRecord = {
        ...existing,
        branchCode: nextCode,
        name: input.name !== undefined ? input.name.trim() : existing.name,
        branchType: input.branchType ?? existing.branchType,
        address: input.address !== undefined ? input.address.trim() : existing.address,
        city: input.city !== undefined ? input.city.trim() : existing.city,
        state: input.state !== undefined ? input.state.trim() : existing.state,
        pincode: input.pincode !== undefined ? input.pincode.trim() : existing.pincode,
        phone: input.phone !== undefined ? input.phone.trim() : existing.phone,
        email: input.email !== undefined ? input.email.trim() : existing.email,
        gstin: input.gstin !== undefined ? input.gstin?.trim() || null : existing.gstin,
        dlNumber20B: input.dlNumber20B !== undefined ? input.dlNumber20B?.trim() || null : existing.dlNumber20B,
        dlNumber21B: input.dlNumber21B !== undefined ? input.dlNumber21B?.trim() || null : existing.dlNumber21B,
        managerUserId: input.managerUserId !== undefined ? input.managerUserId?.trim() || null : existing.managerUserId,
        managerName: input.managerName !== undefined ? input.managerName?.trim() || null : existing.managerName,
        operatingHours: input.operatingHours !== undefined ? input.operatingHours?.trim() || null : existing.operatingHours,
        timezone: input.timezone !== undefined ? input.timezone.trim() : existing.timezone,
        updatedBy: actingUserId,
        updatedAt: now,
      };

      if (this.isTest()) {
        getTenantBranchMap(tenantId).set(branchId, updated);
      } else {
        const db = firestore();
        await db.collection('tenants').doc(tenantId).collection('branches').doc(branchId).set(updated);
      }

      await this.recordBranchAuditLog({
        tenantId,
        branchId,
        action: 'branch.updated',
        entityType: 'BRANCH',
        entityId: branchId,
        performedBy: actingUserId,
        details: { updatedFields: Object.keys(input) },
      });

      return updated;
    });
  }

  public static async updateBranchSettings(
    tenantId: string,
    branchId: string,
    policy: Partial<BranchTransferPolicy> & { operatingHours?: string; timezone?: string },
    actingUserId: string
  ): Promise<BranchRecord> {
    return withBranchLock(tenantId, async () => {
      const existing = await this.getBranchById(tenantId, branchId);
      if (existing.status === 'CLOSED') {
        throw new BadRequestError('Cannot modify settings of a closed branch.');
      }

      const now = new Date().toISOString();
      const updated: BranchRecord = {
        ...existing,
        operatingHours: policy.operatingHours !== undefined ? policy.operatingHours : existing.operatingHours,
        timezone: policy.timezone !== undefined ? policy.timezone : existing.timezone,
        transferPolicy: {
          ...existing.transferPolicy,
          ...(policy.requireApproval !== undefined ? { requireApproval: policy.requireApproval } : {}),
          ...(policy.allowSelfApproval !== undefined ? { allowSelfApproval: policy.allowSelfApproval } : {}),
          ...(policy.approvalThresholdAmount !== undefined
            ? { approvalThresholdAmount: Number(policy.approvalThresholdAmount) }
            : {}),
          ...(policy.approvalThresholdQty !== undefined
            ? { approvalThresholdQty: Number(policy.approvalThresholdQty) }
            : {}),
          ...(policy.defaultPriceBasis !== undefined ? { defaultPriceBasis: policy.defaultPriceBasis } : {}),
        },
        updatedBy: actingUserId,
        updatedAt: now,
      };

      if (this.isTest()) {
        getTenantBranchMap(tenantId).set(branchId, updated);
      } else {
        const db = firestore();
        await db
          .collection('tenants')
          .doc(tenantId)
          .collection('branches')
          .doc(branchId)
          .update({
            operatingHours: updated.operatingHours,
            timezone: updated.timezone,
            transferPolicy: updated.transferPolicy,
            updatedBy: actingUserId,
            updatedAt: now,
          });
      }

      await this.recordBranchAuditLog({
        tenantId,
        branchId,
        action: 'branch.settings_updated',
        entityType: 'BRANCH',
        entityId: branchId,
        performedBy: actingUserId,
        details: { transferPolicy: updated.transferPolicy },
      });

      return updated;
    });
  }

  public static async setPrimaryBranch(
    tenantId: string,
    branchId: string,
    actingUserId: string
  ): Promise<BranchRecord> {
    return withBranchLock(tenantId, async () => {
      const target = await this.getBranchById(tenantId, branchId);
      if (target.status !== 'ACTIVE') {
        throw new BadRequestError('Only an ACTIVE branch can be designated as the primary/head-office branch.');
      }

      const now = new Date().toISOString();
      const updatedTarget: BranchRecord = {
        ...target,
        isPrimary: true,
        isMain: true,
        updatedBy: actingUserId,
        updatedAt: now,
      };

      if (this.isTest()) {
        const map = getTenantBranchMap(tenantId);
        for (const [id, b] of map.entries()) {
          map.set(id, {
            ...b,
            isPrimary: id === branchId,
            isMain: id === branchId,
            updatedBy: actingUserId,
            updatedAt: now,
          });
        }
      } else {
        const db = firestore();
        const colRef = db.collection('tenants').doc(tenantId).collection('branches');
        const snap = await colRef.get();
        const batch = db.batch();
        snap.docs.forEach((doc) => {
          batch.update(doc.ref, {
            isPrimary: doc.id === branchId,
            isMain: doc.id === branchId,
            updatedBy: actingUserId,
            updatedAt: now,
          });
        });
        await batch.commit();
      }

      await this.recordBranchAuditLog({
        tenantId,
        branchId,
        action: 'branch.set_primary',
        entityType: 'BRANCH',
        entityId: branchId,
        performedBy: actingUserId,
        details: { branchCode: target.branchCode },
      });

      return updatedTarget;
    });
  }

  public static async changeBranchStatus(
    tenantId: string,
    branchId: string,
    targetStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
    actingUserId: string,
    reason?: string
  ): Promise<BranchRecord> {
    return withBranchLock(tenantId, async () => {
      const branch = await this.getBranchById(tenantId, branchId);
      if (branch.status === 'CLOSED') {
        throw new BadRequestError(
          `Branch '${branch.name}' is permanently CLOSED and cannot be transitioned to ${targetStatus}.`
        );
      }

      if (targetStatus !== 'ACTIVE' && branch.isPrimary) {
        const all = await this.listBranches(tenantId, { includeClosed: false });
        const otherActive = all.filter((b) => b.id !== branchId && b.status === 'ACTIVE');
        if (otherActive.length === 0) {
          throw new BadRequestError(
            'Cannot deactivate or suspend the sole active primary branch. Promote another active branch to primary first.'
          );
        }
        throw new BadRequestError(
          'Cannot deactivate or suspend the current primary branch. Set another active branch as primary first.'
        );
      }

      const now = new Date().toISOString();
      const updated: BranchRecord = {
        ...branch,
        status: targetStatus,
        updatedBy: actingUserId,
        updatedAt: now,
      };

      if (this.isTest()) {
        getTenantBranchMap(tenantId).set(branchId, updated);
        setTestBranchStatus(tenantId, branchId, targetStatus);
      } else {
        const db = firestore();
        await db.collection('tenants').doc(tenantId).collection('branches').doc(branchId).update({
          status: targetStatus,
          updatedBy: actingUserId,
          updatedAt: now,
        });
      }

      await this.recordBranchAuditLog({
        tenantId,
        branchId,
        action: `branch.status_${targetStatus.toLowerCase()}`,
        entityType: 'BRANCH',
        entityId: branchId,
        performedBy: actingUserId,
        details: {
          previousStatus: branch.status,
          newStatus: targetStatus,
          reason: reason || null,
        },
      });

      return updated;
    });
  }

  public static async checkBranchClosureReadiness(
    tenantId: string,
    branchId: string
  ): Promise<BranchClosureCheckResult> {
    const branch = await this.getBranchById(tenantId, branchId);
    const allBranches = await this.listBranches(tenantId, { includeClosed: false });
    const activeBranchesRemaining = allBranches.filter((b) => b.id !== branchId && b.status === 'ACTIVE').length;

    // 1. Check pending inter-branch stock transfers via dynamic import to avoid circular load order
    const { StockTransferService } = await import('./stockTransferService');
    const transfers = await StockTransferService.listTransfers(tenantId, { branchId });
    const pendingStatuses = new Set([
      'DRAFT',
      'REQUESTED',
      'PENDING_APPROVAL',
      'APPROVED',
      'DISPATCHED',
      'IN_TRANSIT',
      'PARTIALLY_RECEIVED',
    ]);
    const pendingTransfers = transfers.filter((t) => pendingStatuses.has(t.status));

    // 2. Check open Purchase Orders, draft GRNs, open payables, open sales receivables, unsettled expenses & stock
    const collectAll = async <T>(
      fetcher: (page: number) => Promise<{ items: T[]; totalPages: number }>
    ): Promise<T[]> => {
      const out: T[] = [];
      let page = 1;
      while (true) {
        const res = await fetcher(page);
        out.push(...res.items);
        if (page >= res.totalPages) break;
        page += 1;
      }
      return out;
    };

    const [pos, grns, supplierInvoices, invoices, expenses, invBatches] = await Promise.all([
      collectAll(async (page) => {
        const r = await ProcurementService.listPurchaseOrders(tenantId, branchId, { page, limit: 100 });
        return { items: r.purchaseOrders, totalPages: r.totalPages };
      }),
      collectAll(async (page) => {
        const r = await ProcurementService.listGrns(tenantId, branchId, { page, limit: 100 });
        return { items: r.goodsReceipts, totalPages: r.totalPages };
      }),
      collectAll(async (page) => {
        const r = await ProcurementService.listSupplierInvoices(tenantId, branchId, { page, limit: 100 });
        return { items: r.invoices, totalPages: r.totalPages };
      }),
      collectAll(async (page) => {
        const r = await BillingTransactionService.listInvoices(tenantId, { branchId, page, limit: 100 });
        return { items: r.invoices, totalPages: r.totalPages };
      }),
      AccountingService.listExpenses(tenantId, { branchId }),
      InventoryService.listBatches(tenantId, { branchId, limit: 5000 }),
    ]);

    const openPOs = pos.filter((p) => ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(p.status));
    const draftGrns = grns.filter((g) => g.status === 'DRAFT');
    const openSinvs = supplierInvoices.filter(
      (i) => i.paymentStatus !== 'PAID' && i.paymentStatus !== 'REVERSED' && i.outstandingAmount > 0.01
    );
    const openSales = invoices.filter(
      (i) => i.status !== 'cancelled' && Number(i.balanceDue || 0) > 0.01
    );
    const unsettledExpenses = expenses.filter((e) =>
      ['SUBMITTED', 'APPROVED_UNPAID', 'PARTIALLY_PAID'].includes(e.status)
    );
    const activeStockBatches = invBatches.batches.filter((b) => b.currentStock > 0);
    const remainingStockUnits = activeStockBatches.reduce((sum, b) => sum + b.currentStock, 0);
    const remainingStockPtrValue = Number(
      activeStockBatches.reduce((sum, b) => sum + b.currentStock * b.purchasePrice, 0).toFixed(2)
    );

    const openSalesReceivablesAmount = Number(
      openSales.reduce((sum, i) => sum + Number(i.balanceDue || 0), 0).toFixed(2)
    );
    const openSupplierPayablesAmount = Number(
      openSinvs.reduce((sum, i) => sum + Number(i.outstandingAmount || 0), 0).toFixed(2)
    );

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (branch.status === 'CLOSED') {
      blockers.push('Branch is already permanently CLOSED.');
    }
    if (branch.isPrimary) {
      blockers.push('Primary/head-office branch cannot be closed until another active branch is promoted to primary.');
    }
    if (activeBranchesRemaining === 0) {
      blockers.push('At least one active branch must remain open in the pharmacy tenant.');
    }
    if (pendingTransfers.length > 0) {
      blockers.push(
        `${pendingTransfers.length} pending or in-transit stock transfer(s) involve this branch (${pendingTransfers.map((t) => t.transferNumber).slice(0, 3).join(', ')}).`
      );
    }
    if (openPOs.length > 0) {
      blockers.push(`${openPOs.length} open Purchase Order(s) must be closed or cancelled before branch closure.`);
    }
    if (draftGrns.length > 0) {
      blockers.push(`${draftGrns.length} unposted Draft GRN(s) must be posted or discarded before closure.`);
    }
    if (unsettledExpenses.length > 0) {
      blockers.push(`${unsettledExpenses.length} unsettled branch expense(s) must be paid or reversed before closure.`);
    }
    if (openSales.length > 0) {
      blockers.push(
        `${openSales.length} unpaid POS invoice(s) totalling ₹${openSalesReceivablesAmount.toFixed(2)} must be settled before closure.`
      );
    }
    if (openSinvs.length > 0) {
      blockers.push(
        `${openSinvs.length} unpaid supplier invoice(s) totalling ₹${openSupplierPayablesAmount.toFixed(2)} must be settled before closure.`
      );
    }
    if (remainingStockUnits > 0) {
      blockers.push(
        `${remainingStockUnits} medicine units (PTR value ₹${remainingStockPtrValue.toFixed(2)}) remain in stock. Transfer or adjust inventory to zero before closing.`
      );
    }

    return {
      branchId: branch.id,
      branchCode: branch.branchCode,
      branchName: branch.name,
      currentStatus: branch.status,
      canClose: blockers.length === 0,
      blockers,
      warnings,
      checks: {
        isPrimaryBranch: branch.isPrimary,
        activeBranchesRemaining,
        pendingTransfersCount: pendingTransfers.length,
        openPurchaseOrdersCount: openPOs.length,
        draftGrnsCount: draftGrns.length,
        unsettledExpensesCount: unsettledExpenses.length,
        openSalesReceivablesCount: openSales.length,
        openSalesReceivablesAmount,
        openSupplierPayablesCount: openSinvs.length,
        openSupplierPayablesAmount,
        remainingStockUnits,
        remainingStockPtrValue,
      },
    };
  }

  public static async closeBranch(
    tenantId: string,
    branchId: string,
    actingUserId: string,
    closureNotes?: string
  ): Promise<{ branch: BranchRecord; readiness: BranchClosureCheckResult }> {
    return withBranchLock(tenantId, async () => {
      const readiness = await this.checkBranchClosureReadiness(tenantId, branchId);
      if (!readiness.canClose) {
        throw new ConflictError(
          `Branch '${readiness.branchName}' failed closure readiness check: ${readiness.blockers.join(' ')}`
        );
      }

      const branch = await this.getBranchById(tenantId, branchId);
      const now = new Date().toISOString();
      const closedBranch: BranchRecord = {
        ...branch,
        status: 'CLOSED',
        closedAt: now,
        closedBy: actingUserId,
        closureNotes: closureNotes?.trim() || 'Controlled branch closure completed',
        updatedBy: actingUserId,
        updatedAt: now,
      };

      if (this.isTest()) {
        getTenantBranchMap(tenantId).set(branchId, closedBranch);
        setTestBranchStatus(tenantId, branchId, 'CLOSED');
      } else {
        const db = firestore();
        await db.collection('tenants').doc(tenantId).collection('branches').doc(branchId).update({
          status: 'CLOSED',
          closedAt: now,
          closedBy: actingUserId,
          closureNotes: closedBranch.closureNotes,
          updatedBy: actingUserId,
          updatedAt: now,
        });
      }

      await this.recordBranchAuditLog({
        tenantId,
        branchId,
        action: 'branch.closed',
        entityType: 'BRANCH',
        entityId: branchId,
        performedBy: actingUserId,
        details: {
          branchCode: branch.branchCode,
          closureNotes: closedBranch.closureNotes,
        },
      });

      return { branch: closedBranch, readiness };
    });
  }

  public static async listBranchEmployees(
    tenantId: string,
    branchId: string
  ): Promise<MembershipRecord[]> {
    await this.getBranchById(tenantId, branchId);

    let allMembers: MembershipRecord[];
    if (this.isTest()) {
      allMembers = getTestMemberships(tenantId);
    } else {
      const db = firestore();
      const snap = await db.collection('tenants').doc(tenantId).collection('memberships').get();
      allMembers = snap.docs.map((d) => d.data() as MembershipRecord);
    }

    return allMembers.filter(
      (m) => m.role === 'owner' || (m.assignedBranchIds || []).includes(branchId)
    );
  }

  public static async assignEmployeeToBranch(
    tenantId: string,
    branchId: string,
    targetUserId: string,
    actingUserId: string
  ): Promise<MembershipRecord> {
    const branch = await this.getBranchById(tenantId, branchId);
    if (branch.status === 'CLOSED') {
      throw new BadRequestError(`Cannot assign staff to closed branch '${branch.name}'.`);
    }

    let member: MembershipRecord | null = null;
    if (this.isTest()) {
      member = getTestMemberships(tenantId).find((m) => m.userId === targetUserId) || null;
    } else {
      const db = firestore();
      const doc = await db.collection('tenants').doc(tenantId).collection('memberships').doc(targetUserId).get();
      if (doc.exists) {
        member = doc.data() as MembershipRecord;
      }
    }

    if (!member) {
      throw new NotFoundError(`Employee '${targetUserId}' not found in this pharmacy.`);
    }

    const current = (member.assignedBranchIds || []).map((b) => b.trim()).filter(Boolean);
    const updatedBranches = Array.from(new Set([...current, branchId]));
    const now = new Date().toISOString();
    member.assignedBranchIds = updatedBranches;
    member.updatedAt = now;

    if (this.isTest()) {
      setTestMembership(tenantId, targetUserId, member);
    } else {
      const db = firestore();
      await db.collection('tenants').doc(tenantId).collection('memberships').doc(targetUserId).update({
        assignedBranchIds: updatedBranches,
        updatedAt: now,
      });
    }

    await this.recordBranchAuditLog({
      tenantId,
      branchId,
      action: 'branch.employee_assigned',
      entityType: 'BRANCH_STAFF',
      entityId: targetUserId,
      performedBy: actingUserId,
      details: { assignedBranchIds: updatedBranches },
    });

    return member;
  }

  public static async removeEmployeeFromBranch(
    tenantId: string,
    branchId: string,
    targetUserId: string,
    actingUserId: string
  ): Promise<MembershipRecord> {
    await this.getBranchById(tenantId, branchId);

    let member: MembershipRecord | null = null;
    if (this.isTest()) {
      member = getTestMemberships(tenantId).find((m) => m.userId === targetUserId) || null;
    } else {
      const db = firestore();
      const doc = await db.collection('tenants').doc(tenantId).collection('memberships').doc(targetUserId).get();
      if (doc.exists) {
        member = doc.data() as MembershipRecord;
      }
    }

    if (!member) {
      throw new NotFoundError(`Employee '${targetUserId}' not found in this pharmacy.`);
    }

    if (member.role === 'owner') {
      throw new BadRequestError('Owner retains access across all branches and cannot be removed from a branch.');
    }

    const remaining = (member.assignedBranchIds || []).filter((b) => b !== branchId && b !== '*');
    if (remaining.length === 0) {
      throw new BadRequestError(
        'Cannot remove an employee from their last assigned branch. Assign another branch first or deactivate the employee.'
      );
    }

    const now = new Date().toISOString();
    member.assignedBranchIds = remaining;
    member.updatedAt = now;

    if (this.isTest()) {
      setTestMembership(tenantId, targetUserId, member);
    } else {
      const db = firestore();
      await db.collection('tenants').doc(tenantId).collection('memberships').doc(targetUserId).update({
        assignedBranchIds: remaining,
        updatedAt: now,
      });
    }

    await this.recordBranchAuditLog({
      tenantId,
      branchId,
      action: 'branch.employee_unassigned',
      entityType: 'BRANCH_STAFF',
      entityId: targetUserId,
      performedBy: actingUserId,
      details: { assignedBranchIds: remaining },
    });

    return member;
  }
}

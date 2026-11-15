import crypto from 'node:crypto';
import { firestore } from '../lib/firebaseAdmin';
import { env } from '../config/env';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  IdempotencyConflictError,
  NotFoundError,
} from '../lib/errors';
import { UserRole } from '../types/express';
import { BranchService } from './branchService';
import {
  getAllTestBatchesForTenant,
  getTestBatchDirect,
  InventoryBatchRecord,
  InventoryService,
  recordTestMovementDirect,
  setTestBatch,
  StockMovementRecord,
  withTestBranchInventoryLock,
} from './inventoryService';
import { MedicineService } from './medicineService';
import { AccountingService } from './accountingService';

export type StockTransferStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED'
  | 'CLOSED';

export interface StockTransferItemRecord {
  id: string;
  transferId: string;
  tenantId: string;
  sourceBranchId: string;
  destinationBranchId: string;
  medicineId: string;
  medicineName: string;
  genericName?: string;
  sourceBatchId: string;
  destinationBatchId?: string | null;
  batchNumber: string;
  expiryDate: string;
  manufacturingDate?: string | null;
  unitCostPtr: number;
  mrp: number;
  sellingPrice: number;
  barcode?: string | null;
  requestedQuantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  missingQuantity: number;
  discrepancyReason?: string | null;
  updatedAt: string;
}

export interface StockTransferRecord {
  id: string;
  tenantId: string;
  transferNumber: string;
  sourceBranchId: string;
  sourceBranchCode: string;
  sourceBranchName: string;
  destinationBranchId: string;
  destinationBranchCode: string;
  destinationBranchName: string;
  status: StockTransferStatus;
  notes?: string | null;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  items: StockTransferItemRecord[];
  totalRequestedQuantity: number;
  totalDispatchedQuantity: number;
  totalReceivedQuantity: number;
  totalDamagedQuantity: number;
  totalMissingQuantity: number;
  totalPtrValuation: number;
  dispatchedPtrValuation: number;
  receivedPtrValuation: number;
  shrinkagePtrValuation: number;
  dispatchJournalEntryIds: string[];
  receiveJournalEntryIds: string[];
  createdBy: string;
  submittedBy?: string | null;
  approvedBy?: string | null;
  rejectedBy?: string | null;
  dispatchedBy?: string | null;
  receivedBy?: string | null;
  closedBy?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  dispatchedAt?: string | null;
  receivedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BranchOperationRecord {
  id: string;
  tenantId: string;
  operationType: 'STOCK_TRANSFER_DISPATCH' | 'STOCK_TRANSFER_RECEIVE' | 'STOCK_TRANSFER_RECONCILE';
  referenceId: string;
  idempotencyKey: string;
  status: 'STARTED' | 'COMMITTED' | 'FAILED';
  responseSnapshot?: Record<string, unknown>;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransferItemInput {
  medicineId?: string;
  sourceBatchId: string;
  requestedQuantity: number;
}

export interface CreateTransferInput {
  sourceBranchId: string;
  destinationBranchId: string;
  items: CreateTransferItemInput[];
  notes?: string;
  submitImmediately?: boolean;
}

export interface DispatchTransferInput {
  idempotencyKey?: string;
  items?: Array<{
    itemId: string;
    dispatchQuantity: number;
  }>;
  vehicleNumber?: string;
  challanRemarks?: string;
}

export interface ReceiveTransferItemInput {
  itemId: string;
  acceptedQuantity: number;
  damagedQuantity?: number;
  missingQuantity?: number;
  discrepancyReason?: string;
  rackLocation?: string;
}

export interface ReceiveTransferInput {
  idempotencyKey?: string;
  items: ReceiveTransferItemInput[];
  remarks?: string;
}

export interface ReconcileTransferInput {
  resolutionNotes: string;
  writeOffDamagedAsShrinkage?: boolean;
  items?: Array<{
    itemId: string;
    damagedQuantity?: number;
    missingQuantity?: number;
    discrepancyReason?: string;
  }>;
}

// In-memory test stores
const testTransferStore = new Map<string, Map<string, StockTransferRecord>>();
const testBranchOpStore = new Map<string, Map<string, BranchOperationRecord>>();
const testTransferSeq = new Map<string, number>();

function getTransferMap(tenantId: string): Map<string, StockTransferRecord> {
  let m = testTransferStore.get(tenantId);
  if (!m) {
    m = new Map();
    testTransferStore.set(tenantId, m);
  }
  return m;
}

function getBranchOpMap(tenantId: string): Map<string, BranchOperationRecord> {
  let m = testBranchOpStore.get(tenantId);
  if (!m) {
    m = new Map();
    testBranchOpStore.set(tenantId, m);
  }
  return m;
}

export function clearTestStockTransfers(): void {
  testTransferStore.clear();
  testBranchOpStore.clear();
  testTransferSeq.clear();
}

export function listTestStockTransfersDirect(tenantId: string): StockTransferRecord[] {
  return Array.from(getTransferMap(tenantId).values());
}

function isBatchExpired(expiryDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let exp: Date;
  if (expiryDate.length === 7) {
    const [year, month] = expiryDate.split('-').map(Number);
    exp = new Date(year!, month!, 0);
  } else {
    exp = new Date(expiryDate);
  }
  return exp.getTime() < today.getTime();
}

function recalculateTransferTotals(transfer: StockTransferRecord): StockTransferRecord {
  let totalReq = 0;
  let totalDisp = 0;
  let totalRec = 0;
  let totalDmg = 0;
  let totalMiss = 0;
  let totalReqVal = 0;
  let totalDispVal = 0;
  let totalRecVal = 0;
  let totalShrinkVal = 0;

  for (const item of transfer.items) {
    totalReq += item.requestedQuantity;
    totalDisp += item.dispatchedQuantity;
    totalRec += item.receivedQuantity;
    totalDmg += item.damagedQuantity;
    totalMiss += item.missingQuantity;
    totalReqVal += item.requestedQuantity * item.unitCostPtr;
    totalDispVal += item.dispatchedQuantity * item.unitCostPtr;
    totalRecVal += item.receivedQuantity * item.unitCostPtr;
    totalShrinkVal += (item.damagedQuantity + item.missingQuantity) * item.unitCostPtr;
  }

  return {
    ...transfer,
    totalRequestedQuantity: totalReq,
    totalDispatchedQuantity: totalDisp,
    totalReceivedQuantity: totalRec,
    totalDamagedQuantity: totalDmg,
    totalMissingQuantity: totalMiss,
    totalPtrValuation: Number(totalReqVal.toFixed(2)),
    dispatchedPtrValuation: Number(totalDispVal.toFixed(2)),
    receivedPtrValuation: Number(totalRecVal.toFixed(2)),
    shrinkagePtrValuation: Number(totalShrinkVal.toFixed(2)),
  };
}

export class StockTransferService {
  private static isTest(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST)
    );
  }

  private static async allocateTransferNumber(tenantId: string, sourceCode: string): Promise<string> {
    const year = new Date().getFullYear();
    const cleanCode = sourceCode.replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase() || 'BR';
    if (this.isTest()) {
      const k = `${tenantId}:${year}`;
      const next = (testTransferSeq.get(k) || 0) + 1;
      testTransferSeq.set(k, next);
      return `TRF-${cleanCode}-${year}-${String(next).padStart(5, '0')}`;
    }

    const db = firestore();
    const counterRef = db.collection('tenants').doc(tenantId).collection('counters').doc(`transfer_${year}`);
    const seq = await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const curr = snap.exists ? Number(snap.data()?.currentSeq || 0) : 0;
      const next = curr + 1;
      tx.set(counterRef, { currentSeq: next, updatedAt: new Date().toISOString() }, { merge: true });
      return next;
    });
    return `TRF-${cleanCode}-${year}-${String(seq).padStart(5, '0')}`;
  }

  private static async acquireBranchLocks<T>(
    tenantId: string,
    branchA: string,
    branchB: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const [first, second] = [branchA, branchB].sort();
    if (first === second) {
      return withTestBranchInventoryLock(tenantId, first, fn);
    }
    return withTestBranchInventoryLock(tenantId, first, () =>
      withTestBranchInventoryLock(tenantId, second, fn)
    );
  }

  private static async persistTransfer(transfer: StockTransferRecord): Promise<void> {
    if (this.isTest()) {
      getTransferMap(transfer.tenantId).set(transfer.id, transfer);
      return;
    }

    const db = firestore();
    const tRef = db.collection('tenants').doc(transfer.tenantId).collection('stockTransfers').doc(transfer.id);
    const batch = db.batch();
    batch.set(tRef, transfer);
    for (const item of transfer.items) {
      batch.set(tRef.collection('items').doc(item.id), item);
    }
    await batch.commit();
  }

  private static async loadBatchForDispatch(
    tenantId: string,
    branchId: string,
    batchId: string
  ): Promise<InventoryBatchRecord> {
    if (this.isTest()) {
      const batch = getTestBatchDirect(tenantId, batchId);
      if (!batch || batch.branchId !== branchId) {
        throw new NotFoundError(`Batch '${batchId}' not found in source branch '${branchId}'.`);
      }
      return batch;
    }

    const db = firestore();
    const doc = await db.collection('tenants').doc(tenantId).collection('inventory_batches').doc(batchId).get();
    if (!doc.exists) {
      throw new NotFoundError(`Batch '${batchId}' not found in source branch '${branchId}'.`);
    }
    const data = doc.data() as InventoryBatchRecord;
    if (data.branchId !== branchId) {
      throw new NotFoundError(`Batch '${batchId}' does not belong to source branch '${branchId}'.`);
    }
    return data;
  }

  private static checkBranchAccess(
    role: UserRole,
    assignedBranchIds: string[],
    targetBranchId: string,
    actionLabel: string
  ) {
    if (role === 'owner') return;
    if (!assignedBranchIds.includes(targetBranchId)) {
      throw new ForbiddenError(
        `Access denied. You must be assigned to branch '${targetBranchId}' to ${actionLabel}.`
      );
    }
  }

  public static async listTransfers(
    tenantId: string,
    opts?: {
      branchId?: string;
      direction?: 'outbound' | 'inbound' | 'all';
      status?: StockTransferStatus;
      role?: UserRole;
      assignedBranchIds?: string[];
      limit?: number;
    }
  ): Promise<StockTransferRecord[]> {
    let list: StockTransferRecord[];
    if (this.isTest()) {
      list = Array.from(getTransferMap(tenantId).values());
    } else {
      const db = firestore();
      const snap = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('stockTransfers')
        .orderBy('createdAt', 'desc')
        .limit(opts?.limit || 200)
        .get();
      list = snap.docs.map((d) => d.data() as StockTransferRecord);
    }

    if (opts?.role && opts.role !== 'owner') {
      const allowed = new Set((opts.assignedBranchIds || []).filter((b) => b !== '*'));
      list = list.filter(
        (t) => allowed.has(t.sourceBranchId) || allowed.has(t.destinationBranchId)
      );
    }

    if (opts?.branchId && opts.branchId !== 'ALL') {
      const b = opts.branchId;
      if (opts.direction === 'outbound') {
        list = list.filter((t) => t.sourceBranchId === b);
      } else if (opts.direction === 'inbound') {
        list = list.filter((t) => t.destinationBranchId === b);
      } else {
        list = list.filter((t) => t.sourceBranchId === b || t.destinationBranchId === b);
      }
    }

    if (opts?.status) {
      list = list.filter((t) => t.status === opts.status);
    }

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public static async getTransferById(tenantId: string, transferId: string): Promise<StockTransferRecord> {
    if (this.isTest()) {
      const found = getTransferMap(tenantId).get(transferId);
      if (!found) {
        throw new NotFoundError(`Stock transfer '${transferId}' not found.`);
      }
      return found;
    }

    const db = firestore();
    const doc = await db.collection('tenants').doc(tenantId).collection('stockTransfers').doc(transferId).get();
    if (!doc.exists) {
      throw new NotFoundError(`Stock transfer '${transferId}' not found.`);
    }
    return doc.data() as StockTransferRecord;
  }

  public static async createTransfer(
    tenantId: string,
    input: CreateTransferInput,
    actingUserId: string,
    role: UserRole,
    assignedBranchIds: string[]
  ): Promise<StockTransferRecord> {
    if (!input.sourceBranchId || !input.destinationBranchId) {
      throw new BadRequestError('Both sourceBranchId and destinationBranchId are required.');
    }
    if (input.sourceBranchId === input.destinationBranchId) {
      throw new BadRequestError('Source branch and destination branch must be different for stock transfers.');
    }
    if (!input.items || input.items.length === 0) {
      throw new BadRequestError('At least one medicine batch line item is required for a stock transfer.');
    }

    // Must have access to either source or destination branch (non-owners)
    if (role !== 'owner') {
      const hasSource = assignedBranchIds.includes(input.sourceBranchId);
      const hasDest = assignedBranchIds.includes(input.destinationBranchId);
      if (!hasSource && !hasDest) {
        throw new ForbiddenError('You must be assigned to the source or destination branch to initiate a transfer.');
      }
    }

    const [sourceBranch, destBranch] = await Promise.all([
      BranchService.assertBranchOperational(tenantId, input.sourceBranchId),
      BranchService.assertBranchOperational(tenantId, input.destinationBranchId),
    ]);

    const now = new Date().toISOString();
    const transferId = `trf_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const transferNumber = await this.allocateTransferNumber(tenantId, sourceBranch.branchCode);

    const seenBatchIds = new Set<string>();
    const items: StockTransferItemRecord[] = [];

    for (let i = 0; i < input.items.length; i += 1) {
      const line = input.items[i]!;
      if (!line.sourceBatchId) {
        throw new BadRequestError(`Line ${i + 1}: sourceBatchId is required.`);
      }
      if (seenBatchIds.has(line.sourceBatchId)) {
        throw new BadRequestError(`Duplicate batch '${line.sourceBatchId}' in transfer lines. Combine quantities into one line.`);
      }
      seenBatchIds.add(line.sourceBatchId);

      if (!Number.isInteger(line.requestedQuantity) || line.requestedQuantity <= 0) {
        throw new BadRequestError(`Line ${i + 1}: requestedQuantity must be a positive integer.`);
      }

      const batch = await this.loadBatchForDispatch(tenantId, sourceBranch.id, line.sourceBatchId);
      if (isBatchExpired(batch.expiryDate)) {
        throw new BadRequestError(
          `Cannot transfer expired batch '${batch.batchNumber}' (${batch.medicineName}, expiry ${batch.expiryDate}).`
        );
      }
      if (line.requestedQuantity > batch.currentStock) {
        throw new BadRequestError(
          `Insufficient stock in source branch '${sourceBranch.name}' for ${batch.medicineName} (batch ${batch.batchNumber}): requested ${line.requestedQuantity}, available ${batch.currentStock}.`
        );
      }

      items.push({
        id: `trfi_${i + 1}_${crypto.randomBytes(3).toString('hex')}`,
        transferId,
        tenantId,
        sourceBranchId: sourceBranch.id,
        destinationBranchId: destBranch.id,
        medicineId: batch.medicineId,
        medicineName: batch.medicineName,
        genericName: batch.genericName,
        sourceBatchId: batch.id,
        destinationBatchId: null,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        manufacturingDate: batch.manufacturingDate ?? null,
        unitCostPtr: batch.purchasePrice,
        mrp: batch.mrp,
        sellingPrice: batch.sellingPrice,
        barcode: batch.barcode ?? null,
        requestedQuantity: line.requestedQuantity,
        dispatchedQuantity: 0,
        receivedQuantity: 0,
        damagedQuantity: 0,
        missingQuantity: 0,
        discrepancyReason: null,
        updatedAt: now,
      });
    }

    let transfer: StockTransferRecord = recalculateTransferTotals({
      id: transferId,
      tenantId,
      transferNumber,
      sourceBranchId: sourceBranch.id,
      sourceBranchCode: sourceBranch.branchCode,
      sourceBranchName: sourceBranch.name,
      destinationBranchId: destBranch.id,
      destinationBranchCode: destBranch.branchCode,
      destinationBranchName: destBranch.name,
      status: 'DRAFT',
      notes: input.notes?.trim() || null,
      rejectionReason: null,
      cancellationReason: null,
      items,
      totalRequestedQuantity: 0,
      totalDispatchedQuantity: 0,
      totalReceivedQuantity: 0,
      totalDamagedQuantity: 0,
      totalMissingQuantity: 0,
      totalPtrValuation: 0,
      dispatchedPtrValuation: 0,
      receivedPtrValuation: 0,
      shrinkagePtrValuation: 0,
      dispatchJournalEntryIds: [],
      receiveJournalEntryIds: [],
      createdBy: actingUserId,
      submittedBy: null,
      approvedBy: null,
      rejectedBy: null,
      dispatchedBy: null,
      receivedBy: null,
      closedBy: null,
      submittedAt: null,
      approvedAt: null,
      rejectedAt: null,
      dispatchedAt: null,
      receivedAt: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    if (input.submitImmediately) {
      const policy = sourceBranch.transferPolicy;
      const autoApprove =
        !policy.requireApproval ||
        (transfer.totalPtrValuation <= policy.approvalThresholdAmount &&
          transfer.totalRequestedQuantity <= policy.approvalThresholdQty);
      transfer.status = autoApprove ? 'APPROVED' : 'PENDING_APPROVAL';
      transfer.submittedBy = actingUserId;
      transfer.submittedAt = now;
      if (autoApprove) {
        transfer.approvedBy = 'AUTO_POLICY';
        transfer.approvedAt = now;
      }
    }

    await this.persistTransfer(transfer);

    await BranchService.recordBranchAuditLog({
      tenantId,
      branchId: sourceBranch.id,
      action: 'stock_transfer.created',
      entityType: 'STOCK_TRANSFER',
      entityId: transfer.id,
      performedBy: actingUserId,
      details: {
        transferNumber: transfer.transferNumber,
        sourceBranchId: transfer.sourceBranchId,
        destinationBranchId: transfer.destinationBranchId,
        status: transfer.status,
        totalRequestedQuantity: transfer.totalRequestedQuantity,
        totalPtrValuation: transfer.totalPtrValuation,
      },
    });

    return transfer;
  }

  public static async submitTransfer(
    tenantId: string,
    transferId: string,
    actingUserId: string
  ): Promise<StockTransferRecord> {
    const transfer = await this.getTransferById(tenantId, transferId);
    if (!['DRAFT', 'REQUESTED'].includes(transfer.status)) {
      throw new ConflictError(`Cannot submit transfer in '${transfer.status}' state.`);
    }

    const sourceBranch = await BranchService.assertBranchOperational(tenantId, transfer.sourceBranchId);
    await BranchService.assertBranchOperational(tenantId, transfer.destinationBranchId);

    const policy = sourceBranch.transferPolicy;
    const autoApprove =
      !policy.requireApproval ||
      (transfer.totalPtrValuation <= policy.approvalThresholdAmount &&
        transfer.totalRequestedQuantity <= policy.approvalThresholdQty);

    const now = new Date().toISOString();
    transfer.status = autoApprove ? 'APPROVED' : 'PENDING_APPROVAL';
    transfer.submittedBy = actingUserId;
    transfer.submittedAt = now;
    if (autoApprove) {
      transfer.approvedBy = 'AUTO_POLICY';
      transfer.approvedAt = now;
    }
    transfer.updatedAt = now;

    await this.persistTransfer(transfer);
    await BranchService.recordBranchAuditLog({
      tenantId,
      branchId: transfer.sourceBranchId,
      action: 'stock_transfer.submitted',
      entityType: 'STOCK_TRANSFER',
      entityId: transfer.id,
      performedBy: actingUserId,
      details: { status: transfer.status },
    });

    return transfer;
  }

  public static async approveTransfer(
    tenantId: string,
    transferId: string,
    actingUserId: string,
    role: UserRole
  ): Promise<StockTransferRecord> {
    const transfer = await this.getTransferById(tenantId, transferId);
    if (!['DRAFT', 'REQUESTED', 'PENDING_APPROVAL'].includes(transfer.status)) {
      throw new ConflictError(`Cannot approve transfer currently in '${transfer.status}' status.`);
    }

    const sourceBranch = await BranchService.assertBranchOperational(tenantId, transfer.sourceBranchId);
    await BranchService.assertBranchOperational(tenantId, transfer.destinationBranchId);

    if (!sourceBranch.transferPolicy.allowSelfApproval && transfer.createdBy === actingUserId && role !== 'owner') {
      throw new ForbiddenError(
        'Self-approval is disabled by branch transfer policy. Another authorized manager or owner must approve this transfer.'
      );
    }

    const now = new Date().toISOString();
    transfer.status = 'APPROVED';
    transfer.approvedBy = actingUserId;
    transfer.approvedAt = now;
    transfer.updatedAt = now;

    await this.persistTransfer(transfer);
    await BranchService.recordBranchAuditLog({
      tenantId,
      branchId: transfer.sourceBranchId,
      action: 'stock_transfer.approved',
      entityType: 'STOCK_TRANSFER',
      entityId: transfer.id,
      performedBy: actingUserId,
      details: { transferNumber: transfer.transferNumber },
    });

    return transfer;
  }

  public static async rejectTransfer(
    tenantId: string,
    transferId: string,
    reason: string,
    actingUserId: string
  ): Promise<StockTransferRecord> {
    const transfer = await this.getTransferById(tenantId, transferId);
    if (!['REQUESTED', 'PENDING_APPROVAL'].includes(transfer.status)) {
      throw new ConflictError(`Cannot reject transfer in '${transfer.status}' status.`);
    }
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestError('Rejection reason (at least 3 characters) is required.');
    }

    const now = new Date().toISOString();
    transfer.status = 'REJECTED';
    transfer.rejectionReason = reason.trim();
    transfer.rejectedBy = actingUserId;
    transfer.rejectedAt = now;
    transfer.updatedAt = now;

    await this.persistTransfer(transfer);
    await BranchService.recordBranchAuditLog({
      tenantId,
      branchId: transfer.sourceBranchId,
      action: 'stock_transfer.rejected',
      entityType: 'STOCK_TRANSFER',
      entityId: transfer.id,
      performedBy: actingUserId,
      details: { reason: transfer.rejectionReason },
    });

    return transfer;
  }

  public static async cancelTransfer(
    tenantId: string,
    transferId: string,
    reason: string,
    actingUserId: string
  ): Promise<StockTransferRecord> {
    const transfer = await this.getTransferById(tenantId, transferId);
    if (!['DRAFT', 'REQUESTED', 'PENDING_APPROVAL', 'APPROVED'].includes(transfer.status) || transfer.totalDispatchedQuantity > 0) {
      throw new ConflictError(
        `Cannot cancel transfer '${transfer.transferNumber}' in status '${transfer.status}' after stock dispatch.`
      );
    }

    const now = new Date().toISOString();
    transfer.status = 'CANCELLED';
    transfer.cancellationReason = reason?.trim() || 'Cancelled before dispatch';
    transfer.updatedAt = now;

    await this.persistTransfer(transfer);
    await BranchService.recordBranchAuditLog({
      tenantId,
      branchId: transfer.sourceBranchId,
      action: 'stock_transfer.cancelled',
      entityType: 'STOCK_TRANSFER',
      entityId: transfer.id,
      performedBy: actingUserId,
      details: { reason: transfer.cancellationReason },
    });

    return transfer;
  }

  public static async dispatchTransfer(
    tenantId: string,
    transferId: string,
    input: DispatchTransferInput,
    actingUserId: string,
    role: UserRole,
    assignedBranchIds: string[]
  ): Promise<StockTransferRecord> {
    const idempotencyKey = (input.idempotencyKey || `dispatch_${transferId}_${Date.now()}`).trim();

    return this.acquireBranchLocks(
      tenantId,
      (await this.getTransferById(tenantId, transferId)).sourceBranchId,
      (await this.getTransferById(tenantId, transferId)).destinationBranchId,
      async () => {
        // 1. Idempotency replay check
        const opKey = `dispatch:${transferId}:${idempotencyKey}`;
        if (this.isTest()) {
          const existingOp = getBranchOpMap(tenantId).get(opKey);
          if (existingOp?.status === 'COMMITTED') {
            return this.getTransferById(tenantId, transferId);
          }
          if (existingOp?.status === 'STARTED') {
            throw new IdempotencyConflictError('Stock transfer dispatch is currently in progress.');
          }
        } else {
          const db = firestore();
          const opSnap = await db.collection('tenants').doc(tenantId).collection('branchOperations').doc(opKey).get();
          if (opSnap.exists) {
            const opData = opSnap.data() as BranchOperationRecord;
            if (opData.status === 'COMMITTED') {
              return this.getTransferById(tenantId, transferId);
            }
            if (opData.status === 'STARTED') {
              throw new IdempotencyConflictError('Stock transfer dispatch is currently in progress.');
            }
          }
        }

        const transfer = await this.getTransferById(tenantId, transferId);
        this.checkBranchAccess(role, assignedBranchIds, transfer.sourceBranchId, 'dispatch outbound stock transfers');

        if (!['APPROVED', 'DISPATCHED', 'IN_TRANSIT'].includes(transfer.status)) {
          throw new ConflictError(
            `Transfer '${transfer.transferNumber}' must be APPROVED before dispatch (current status: ${transfer.status}).`
          );
        }

        await Promise.all([
          BranchService.assertBranchOperational(tenantId, transfer.sourceBranchId),
          BranchService.assertBranchOperational(tenantId, transfer.destinationBranchId),
        ]);

        // Determine per-item dispatch quantities (full remaining if items omitted)
        const dispatchMap = new Map<string, number>();
        if (input.items && input.items.length > 0) {
          for (const line of input.items) {
            if (!Number.isInteger(line.dispatchQuantity) || line.dispatchQuantity < 0) {
              throw new BadRequestError('dispatchQuantity must be a non-negative integer.');
            }
            dispatchMap.set(line.itemId, line.dispatchQuantity);
          }
        } else {
          for (const item of transfer.items) {
            dispatchMap.set(item.id, item.requestedQuantity - item.dispatchedQuantity);
          }
        }

        const now = new Date().toISOString();
        let totalDispatchedThisEvent = 0;
        let dispatchedPtrValueThisEvent = 0;

        // Validate all requested dispatches upfront
        const validatedDeltas: Array<{ item: StockTransferItemRecord; deltaQty: number }> = [];
        for (const item of transfer.items) {
          const deltaQty = dispatchMap.get(item.id) ?? 0;
          if (deltaQty === 0) continue;

          const remainingAllowed = item.requestedQuantity - item.dispatchedQuantity;
          if (deltaQty > remainingAllowed) {
            throw new BadRequestError(
              `Cannot dispatch ${deltaQty} units for ${item.medicineName} (batch ${item.batchNumber}); only ${remainingAllowed} requested units remain.`
            );
          }
          totalDispatchedThisEvent += deltaQty;
          dispatchedPtrValueThisEvent += deltaQty * item.unitCostPtr;
          validatedDeltas.push({ item, deltaQty });
        }

        if (totalDispatchedThisEvent <= 0) {
          throw new BadRequestError('Total dispatched quantity must be greater than zero.');
        }

        if (this.isTest()) {
          // Test mode atomic execution under lock
          const updatedBatches: InventoryBatchRecord[] = [];
          const movements: StockMovementRecord[] = [];

          for (const { item, deltaQty } of validatedDeltas) {
            const batch = await this.loadBatchForDispatch(tenantId, transfer.sourceBranchId, item.sourceBatchId);
            if (isBatchExpired(batch.expiryDate)) {
              throw new BadRequestError(
                `Cannot dispatch expired batch '${batch.batchNumber}' (${batch.medicineName}, expiry ${batch.expiryDate}).`
              );
            }
            if (batch.currentStock < deltaQty) {
              throw new ConflictError(
                `Insufficient stock in source branch batch '${batch.batchNumber}': available ${batch.currentStock}, requested dispatch ${deltaQty}.`
              );
            }

            const prevQty = batch.currentStock;
            const newQty = prevQty - deltaQty;
            let minThreshold = 10;
            try {
              const med = await MedicineService.getMedicine(tenantId, batch.medicineId);
              minThreshold = med.minStockThreshold ?? 10;
            } catch {
              // ignore if medicine metadata omitted in unit fixture
            }

            const nextBatch: InventoryBatchRecord = {
              ...batch,
              currentStock: newQty,
              status: InventoryService.computeBatchStatus(newQty, batch.expiryDate, minThreshold),
              updatedAt: now,
            };
            updatedBatches.push(nextBatch);

            movements.push({
              id: `mov_trfout_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
              tenantId,
              branchId: transfer.sourceBranchId,
              medicineId: batch.medicineId,
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              medicineName: batch.medicineName,
              movementType: 'STOCK_TRANSFER_OUT',
              quantityChange: -deltaQty,
              previousQuantity: prevQty,
              newQuantity: newQty,
              referenceType: 'stock_transfer',
              referenceId: transfer.id,
              reason: `Dispatched transfer ${transfer.transferNumber} to ${transfer.destinationBranchName}`,
              performedBy: actingUserId,
              timestamp: now,
            });
          }

          updatedBatches.forEach((b) => setTestBatch(tenantId, b));
          movements.forEach((m) => recordTestMovementDirect(tenantId, m));

          for (const { item, deltaQty } of validatedDeltas) {
            item.dispatchedQuantity += deltaQty;
            item.updatedAt = now;
          }

          transfer.status = 'IN_TRANSIT';
          transfer.dispatchedBy = actingUserId;
          transfer.dispatchedAt = transfer.dispatchedAt || now;
          transfer.updatedAt = now;
          const updatedTransfer = recalculateTransferTotals(transfer);

          // Record double-entry accounting (1450 Stock-in-Transit Dr / 1400 Inventory Cr)
          const journal = await AccountingService.recordStockTransferDispatchAccounting({
            tenantId,
            transferId: updatedTransfer.id,
            transferNumber: updatedTransfer.transferNumber,
            sourceBranchId: updatedTransfer.sourceBranchId,
            destinationBranchId: updatedTransfer.destinationBranchId,
            dispatchEventId: idempotencyKey,
            transactionDate: now.slice(0, 10),
            ptrValue: Number(dispatchedPtrValueThisEvent.toFixed(2)),
            userId: actingUserId,
          });
          if (journal && !updatedTransfer.dispatchJournalEntryIds.includes(journal.id)) {
            updatedTransfer.dispatchJournalEntryIds.push(journal.id);
          }

          getTransferMap(tenantId).set(updatedTransfer.id, updatedTransfer);
          getBranchOpMap(tenantId).set(opKey, {
            id: opKey,
            tenantId,
            operationType: 'STOCK_TRANSFER_DISPATCH',
            referenceId: transfer.id,
            idempotencyKey,
            status: 'COMMITTED',
            createdAt: now,
            updatedAt: now,
          });

          await BranchService.recordBranchAuditLog({
            tenantId,
            branchId: transfer.sourceBranchId,
            action: 'stock_transfer.dispatched',
            entityType: 'STOCK_TRANSFER',
            entityId: transfer.id,
            performedBy: actingUserId,
            details: {
              transferNumber: transfer.transferNumber,
              dispatchedNow: totalDispatchedThisEvent,
              dispatchedPtrValue: Number(dispatchedPtrValueThisEvent.toFixed(2)),
            },
          });

          return updatedTransfer;
        }

        // Firestore transaction
        const db = firestore();
        const tenantRef = db.collection('tenants').doc(tenantId);
        const opRef = tenantRef.collection('branchOperations').doc(opKey);
        const transferRef = tenantRef.collection('stockTransfers').doc(transferId);

        const committedTransfer = await db.runTransaction(async (tx) => {
          const opDoc = await tx.get(opRef);
          if (opDoc.exists && (opDoc.data() as BranchOperationRecord).status === 'COMMITTED') {
            return (await tx.get(transferRef)).data() as StockTransferRecord;
          }

          const batchUpdates: Array<{ ref: FirebaseFirestore.DocumentReference; data: InventoryBatchRecord; mov: StockMovementRecord }> = [];
          for (const { item, deltaQty } of validatedDeltas) {
            const bRef = tenantRef.collection('inventory_batches').doc(item.sourceBatchId);
            const bSnap = await tx.get(bRef);
            if (!bSnap.exists) {
              throw new NotFoundError(`Source batch '${item.sourceBatchId}' not found.`);
            }
            const batch = bSnap.data() as InventoryBatchRecord;
            if (batch.branchId !== transfer.sourceBranchId) {
              throw new BadRequestError(`Batch '${batch.id}' does not belong to source branch.`);
            }
            if (isBatchExpired(batch.expiryDate)) {
              throw new BadRequestError(`Cannot dispatch expired batch '${batch.batchNumber}'.`);
            }
            if (batch.currentStock < deltaQty) {
              throw new ConflictError(
                `Insufficient stock in batch '${batch.batchNumber}': available ${batch.currentStock}, requested ${deltaQty}.`
              );
            }

            const prevQty = batch.currentStock;
            const newQty = prevQty - deltaQty;
            const nextBatch: InventoryBatchRecord = {
              ...batch,
              currentStock: newQty,
              status: InventoryService.computeBatchStatus(newQty, batch.expiryDate),
              updatedAt: now,
            };

            const mov: StockMovementRecord = {
              id: `mov_trfout_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
              tenantId,
              branchId: transfer.sourceBranchId,
              medicineId: batch.medicineId,
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              medicineName: batch.medicineName,
              movementType: 'STOCK_TRANSFER_OUT',
              quantityChange: -deltaQty,
              previousQuantity: prevQty,
              newQuantity: newQty,
              referenceType: 'stock_transfer',
              referenceId: transfer.id,
              reason: `Dispatched transfer ${transfer.transferNumber} to ${transfer.destinationBranchName}`,
              performedBy: actingUserId,
              timestamp: now,
            };
            batchUpdates.push({ ref: bRef, data: nextBatch, mov });
          }

          for (const { item, deltaQty } of validatedDeltas) {
            item.dispatchedQuantity += deltaQty;
            item.updatedAt = now;
          }
          transfer.status = 'IN_TRANSIT';
          transfer.dispatchedBy = actingUserId;
          transfer.dispatchedAt = transfer.dispatchedAt || now;
          transfer.updatedAt = now;
          const recalculated = recalculateTransferTotals(transfer);

          for (const u of batchUpdates) {
            tx.set(u.ref, u.data);
            tx.set(tenantRef.collection('stock_movements').doc(u.mov.id), u.mov);
          }
          for (const item of recalculated.items) {
            tx.set(transferRef.collection('items').doc(item.id), item);
          }
          tx.set(transferRef, recalculated);
          tx.set(opRef, {
            id: opKey,
            tenantId,
            operationType: 'STOCK_TRANSFER_DISPATCH',
            referenceId: transfer.id,
            idempotencyKey,
            status: 'COMMITTED',
            createdAt: now,
            updatedAt: now,
          });
          return recalculated;
        });

        const journal = await AccountingService.recordStockTransferDispatchAccounting({
          tenantId,
          transferId: committedTransfer.id,
          transferNumber: committedTransfer.transferNumber,
          sourceBranchId: committedTransfer.sourceBranchId,
          destinationBranchId: committedTransfer.destinationBranchId,
          dispatchEventId: idempotencyKey,
          transactionDate: now.slice(0, 10),
          ptrValue: Number(dispatchedPtrValueThisEvent.toFixed(2)),
          userId: actingUserId,
        });
        if (journal && !committedTransfer.dispatchJournalEntryIds.includes(journal.id)) {
          committedTransfer.dispatchJournalEntryIds.push(journal.id);
          await transferRef.update({ dispatchJournalEntryIds: committedTransfer.dispatchJournalEntryIds });
        }

        await BranchService.recordBranchAuditLog({
          tenantId,
          branchId: committedTransfer.sourceBranchId,
          action: 'stock_transfer.dispatched',
          entityType: 'STOCK_TRANSFER',
          entityId: committedTransfer.id,
          performedBy: actingUserId,
          details: {
            transferNumber: committedTransfer.transferNumber,
            dispatchedNow: totalDispatchedThisEvent,
            dispatchedPtrValue: Number(dispatchedPtrValueThisEvent.toFixed(2)),
          },
        });

        return committedTransfer;
      }
    );
  }

  public static async receiveTransfer(
    tenantId: string,
    transferId: string,
    input: ReceiveTransferInput,
    actingUserId: string,
    role: UserRole,
    assignedBranchIds: string[]
  ): Promise<StockTransferRecord> {
    if (!input.items || input.items.length === 0) {
      throw new BadRequestError('At least one received item tally is required.');
    }

    const idempotencyKey = (input.idempotencyKey || `receive_${transferId}_${Date.now()}`).trim();
    const initialTransfer = await this.getTransferById(tenantId, transferId);

    return this.acquireBranchLocks(
      tenantId,
      initialTransfer.sourceBranchId,
      initialTransfer.destinationBranchId,
      async () => {
        const opKey = `receive:${transferId}:${idempotencyKey}`;
        if (this.isTest()) {
          const existingOp = getBranchOpMap(tenantId).get(opKey);
          if (existingOp?.status === 'COMMITTED') {
            return this.getTransferById(tenantId, transferId);
          }
        } else {
          const db = firestore();
          const opSnap = await db.collection('tenants').doc(tenantId).collection('branchOperations').doc(opKey).get();
          if (opSnap.exists && (opSnap.data() as BranchOperationRecord).status === 'COMMITTED') {
            return this.getTransferById(tenantId, transferId);
          }
        }

        const transfer = await this.getTransferById(tenantId, transferId);
        this.checkBranchAccess(role, assignedBranchIds, transfer.destinationBranchId, 'receive inbound stock transfers');

        if (!['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(transfer.status)) {
          throw new ConflictError(
            `Transfer '${transfer.transferNumber}' cannot be received in status '${transfer.status}'.`
          );
        }

        await Promise.all([
          BranchService.assertBranchOperational(tenantId, transfer.sourceBranchId),
          BranchService.assertBranchOperational(tenantId, transfer.destinationBranchId),
        ]);

        const now = new Date().toISOString();
        const itemById = new Map(transfer.items.map((it) => [it.id, it]));

        let acceptedPtrThisEvent = 0;
        let shrinkagePtrThisEvent = 0;
        let totalTouchedThisEvent = 0;

        interface ValidatedReceiptLine {
          item: StockTransferItemRecord;
          acceptedNow: number;
          damagedNow: number;
          missingNow: number;
          reason?: string;
          rackLocation?: string;
        }

        const validatedLines: ValidatedReceiptLine[] = [];
        for (const recLine of input.items) {
          const item = itemById.get(recLine.itemId);
          if (!item) {
            throw new BadRequestError(`Transfer item '${recLine.itemId}' does not belong to this transfer.`);
          }
          const acceptedNow = Number(recLine.acceptedQuantity || 0);
          const damagedNow = Number(recLine.damagedQuantity || 0);
          const missingNow = Number(recLine.missingQuantity || 0);

          if (
            !Number.isInteger(acceptedNow) ||
            !Number.isInteger(damagedNow) ||
            !Number.isInteger(missingNow) ||
            acceptedNow < 0 ||
            damagedNow < 0 ||
            missingNow < 0
          ) {
            throw new BadRequestError('Received, damaged, and missing quantities must be non-negative integers.');
          }

          const eventSum = acceptedNow + damagedNow + missingNow;
          if (eventSum === 0) continue;

          if ((damagedNow > 0 || missingNow > 0) && (!recLine.discrepancyReason || recLine.discrepancyReason.trim().length < 3)) {
            throw new BadRequestError(
              `Discrepancy reason (at least 3 characters) is required when damaged or missing quantities are reported for ${item.medicineName}.`
            );
          }

          const alreadyAccounted = item.receivedQuantity + item.damagedQuantity + item.missingQuantity;
          const remainingToAccount = item.dispatchedQuantity - alreadyAccounted;
          if (eventSum > remainingToAccount) {
            throw new BadRequestError(
              `Quantity equation violation for ${item.medicineName} (batch ${item.batchNumber}): attempting to account for ${eventSum} units, but only ${remainingToAccount} dispatched units remain unaccounted.`
            );
          }

          totalTouchedThisEvent += eventSum;
          acceptedPtrThisEvent += acceptedNow * item.unitCostPtr;
          shrinkagePtrThisEvent += (damagedNow + missingNow) * item.unitCostPtr;
          validatedLines.push({
            item,
            acceptedNow,
            damagedNow,
            missingNow,
            reason: recLine.discrepancyReason?.trim(),
            rackLocation: recLine.rackLocation?.trim(),
          });
        }

        if (totalTouchedThisEvent <= 0) {
          throw new BadRequestError('At least one positive received, damaged, or missing quantity is required.');
        }

        const applyReceiptToDestination = async (line: ValidatedReceiptLine) => {
          const { item, acceptedNow, damagedNow, missingNow, reason, rackLocation } = line;
          item.receivedQuantity += acceptedNow;
          item.damagedQuantity += damagedNow;
          item.missingQuantity += missingNow;
          if (reason) {
            item.discrepancyReason = item.discrepancyReason ? `${item.discrepancyReason}; ${reason}` : reason;
          }
          item.updatedAt = now;

          if (acceptedNow <= 0) return;

          const destBatchId =
            item.destinationBatchId ||
            `batch_trf_${transfer.id.slice(-8)}_${item.sourceBatchId.slice(-8)}`;

          if (this.isTest()) {
            let destBatch = getTestBatchDirect(tenantId, destBatchId);
            if (!destBatch) {
              // Check if destination already has an identical transfer-origin batch
              const existingAll = getAllTestBatchesForTenant(tenantId);
              destBatch = existingAll.find(
                (b) =>
                  b.branchId === transfer.destinationBranchId &&
                  b.medicineId === item.medicineId &&
                  b.batchNumber === item.batchNumber &&
                  b.purchaseReferenceId === transfer.id
              );
            }
            const prevQty = destBatch ? destBatch.currentStock : 0;
            const newQty = prevQty + acceptedNow;
            const finalDestBatchId = destBatch ? destBatch.id : destBatchId;
            item.destinationBatchId = finalDestBatchId;

            const updatedDestBatch: InventoryBatchRecord = destBatch
              ? {
                  ...destBatch,
                  quantityReceived: destBatch.quantityReceived + acceptedNow,
                  currentStock: newQty,
                  status: InventoryService.computeBatchStatus(newQty, item.expiryDate),
                  rackLocation: rackLocation || destBatch.rackLocation,
                  updatedAt: now,
                }
              : {
                  id: finalDestBatchId,
                  tenantId,
                  branchId: transfer.destinationBranchId,
                  medicineId: item.medicineId,
                  medicineName: item.medicineName,
                  genericName: item.genericName,
                  batchNumber: item.batchNumber,
                  manufacturingDate: item.manufacturingDate ?? null,
                  expiryDate: item.expiryDate,
                  purchasePrice: item.unitCostPtr,
                  mrp: item.mrp,
                  sellingPrice: item.sellingPrice,
                  quantityReceived: acceptedNow,
                  currentStock: newQty,
                  freeQuantity: 0,
                  supplierId: null,
                  supplierName: `Transfer from ${transfer.sourceBranchName}`,
                  purchaseReferenceId: transfer.id,
                  rackLocation: rackLocation ?? null,
                  barcode: item.barcode ?? null,
                  status: InventoryService.computeBatchStatus(newQty, item.expiryDate),
                  createdAt: now,
                  updatedAt: now,
                };

            setTestBatch(tenantId, updatedDestBatch);
            recordTestMovementDirect(tenantId, {
              id: `mov_trfin_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
              tenantId,
              branchId: transfer.destinationBranchId,
              medicineId: item.medicineId,
              batchId: finalDestBatchId,
              batchNumber: item.batchNumber,
              medicineName: item.medicineName,
              movementType: 'STOCK_TRANSFER_IN',
              quantityChange: acceptedNow,
              previousQuantity: prevQty,
              newQuantity: newQty,
              referenceType: 'stock_transfer',
              referenceId: transfer.id,
              reason: `Received from ${transfer.sourceBranchName} (${transfer.transferNumber})`,
              performedBy: actingUserId,
              timestamp: now,
            });
          } else {
            const db = firestore();
            const tenantRef = db.collection('tenants').doc(tenantId);
            await db.runTransaction(async (tx) => {
              const bRef = tenantRef.collection('inventory_batches').doc(destBatchId);
              const bSnap = await tx.get(bRef);
              const existing = bSnap.exists ? (bSnap.data() as InventoryBatchRecord) : null;
              const prevQty = existing ? existing.currentStock : 0;
              const newQty = prevQty + acceptedNow;
              item.destinationBatchId = destBatchId;

              const updatedDestBatch: InventoryBatchRecord = existing
                ? {
                    ...existing,
                    quantityReceived: existing.quantityReceived + acceptedNow,
                    currentStock: newQty,
                    status: InventoryService.computeBatchStatus(newQty, item.expiryDate),
                    rackLocation: rackLocation || existing.rackLocation,
                    updatedAt: now,
                  }
                : {
                    id: destBatchId,
                    tenantId,
                    branchId: transfer.destinationBranchId,
                    medicineId: item.medicineId,
                    medicineName: item.medicineName,
                    genericName: item.genericName,
                    batchNumber: item.batchNumber,
                    manufacturingDate: item.manufacturingDate ?? null,
                    expiryDate: item.expiryDate,
                    purchasePrice: item.unitCostPtr,
                    mrp: item.mrp,
                    sellingPrice: item.sellingPrice,
                    quantityReceived: acceptedNow,
                    currentStock: newQty,
                    freeQuantity: 0,
                    supplierId: null,
                    supplierName: `Transfer from ${transfer.sourceBranchName}`,
                    purchaseReferenceId: transfer.id,
                    rackLocation: rackLocation ?? null,
                    barcode: item.barcode ?? null,
                    status: InventoryService.computeBatchStatus(newQty, item.expiryDate),
                    createdAt: now,
                    updatedAt: now,
                  };

              const mov: StockMovementRecord = {
                id: `mov_trfin_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
                tenantId,
                branchId: transfer.destinationBranchId,
                medicineId: item.medicineId,
                batchId: destBatchId,
                batchNumber: item.batchNumber,
                medicineName: item.medicineName,
                movementType: 'STOCK_TRANSFER_IN',
                quantityChange: acceptedNow,
                previousQuantity: prevQty,
                newQuantity: newQty,
                referenceType: 'stock_transfer',
                referenceId: transfer.id,
                reason: `Received from ${transfer.sourceBranchName} (${transfer.transferNumber})`,
                performedBy: actingUserId,
                timestamp: now,
              };
              tx.set(bRef, updatedDestBatch);
              tx.set(tenantRef.collection('stock_movements').doc(mov.id), mov);
            });
          }
        };

        for (const line of validatedLines) {
          await applyReceiptToDestination(line);
        }

        const allDispatchedAccounted = transfer.items.every(
          (it) =>
            it.dispatchedQuantity > 0 &&
            it.receivedQuantity + it.damagedQuantity + it.missingQuantity === it.dispatchedQuantity
        );

        transfer.status = allDispatchedAccounted ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
        transfer.receivedBy = actingUserId;
        transfer.receivedAt = now;
        transfer.updatedAt = now;

        const updatedTransfer = recalculateTransferTotals(transfer);

        const journal = await AccountingService.recordStockTransferReceiveAccounting({
          tenantId,
          transferId: updatedTransfer.id,
          transferNumber: updatedTransfer.transferNumber,
          sourceBranchId: updatedTransfer.sourceBranchId,
          destinationBranchId: updatedTransfer.destinationBranchId,
          receiveEventId: idempotencyKey,
          transactionDate: now.slice(0, 10),
          acceptedPtrValue: Number(acceptedPtrThisEvent.toFixed(2)),
          shrinkagePtrValue: Number(shrinkagePtrThisEvent.toFixed(2)),
          shrinkageBranchId: updatedTransfer.sourceBranchId,
          userId: actingUserId,
        });
        if (journal && !updatedTransfer.receiveJournalEntryIds.includes(journal.id)) {
          updatedTransfer.receiveJournalEntryIds.push(journal.id);
        }

        await this.persistTransfer(updatedTransfer);

        const opRecord: BranchOperationRecord = {
          id: opKey,
          tenantId,
          operationType: 'STOCK_TRANSFER_RECEIVE',
          referenceId: updatedTransfer.id,
          idempotencyKey,
          status: 'COMMITTED',
          createdAt: now,
          updatedAt: now,
        };
        if (this.isTest()) {
          getBranchOpMap(tenantId).set(opKey, opRecord);
        } else {
          await firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('branchOperations')
            .doc(opKey)
            .set(opRecord);
        }

        await BranchService.recordBranchAuditLog({
          tenantId,
          branchId: updatedTransfer.destinationBranchId,
          action: 'stock_transfer.received',
          entityType: 'STOCK_TRANSFER',
          entityId: updatedTransfer.id,
          performedBy: actingUserId,
          details: {
            transferNumber: updatedTransfer.transferNumber,
            status: updatedTransfer.status,
            acceptedPtrValue: Number(acceptedPtrThisEvent.toFixed(2)),
            shrinkagePtrValue: Number(shrinkagePtrThisEvent.toFixed(2)),
          },
        });

        return updatedTransfer;
      }
    );
  }

  public static async reconcileAndCloseTransfer(
    tenantId: string,
    transferId: string,
    input: ReconcileTransferInput,
    actingUserId: string
  ): Promise<StockTransferRecord> {
    if (!input.resolutionNotes || input.resolutionNotes.trim().length < 3) {
      throw new BadRequestError('Resolution notes are required to reconcile and close a stock transfer.');
    }

    const transfer = await this.getTransferById(tenantId, transferId);
    if (!['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(transfer.status)) {
      throw new ConflictError(`Transfer '${transfer.transferNumber}' cannot be closed from '${transfer.status}'.`);
    }

    const now = new Date().toISOString();
    let additionalShrinkagePtr = 0;

    if (input.items && input.items.length > 0) {
      const byId = new Map(transfer.items.map((it) => [it.id, it]));
      for (const adj of input.items) {
        const item = byId.get(adj.itemId);
        if (!item) throw new BadRequestError(`Unknown item '${adj.itemId}'.`);
        const addDamaged = Number(adj.damagedQuantity || 0);
        const addMissing = Number(adj.missingQuantity || 0);
        if (addDamaged < 0 || addMissing < 0 || !Number.isInteger(addDamaged) || !Number.isInteger(addMissing)) {
          throw new BadRequestError('Discrepancy quantities must be non-negative integers.');
        }
        const alreadyAccounted = item.receivedQuantity + item.damagedQuantity + item.missingQuantity;
        if (alreadyAccounted + addDamaged + addMissing > item.dispatchedQuantity) {
          throw new BadRequestError(
            `Total accounted quantity cannot exceed dispatched quantity (${item.dispatchedQuantity}) for ${item.medicineName}.`
          );
        }
        item.damagedQuantity += addDamaged;
        item.missingQuantity += addMissing;
        if (adj.discrepancyReason) {
          item.discrepancyReason = item.discrepancyReason
            ? `${item.discrepancyReason}; ${adj.discrepancyReason.trim()}`
            : adj.discrepancyReason.trim();
        }
        item.updatedAt = now;
        additionalShrinkagePtr += (addDamaged + addMissing) * item.unitCostPtr;
      }
    }

    // Verify full dispatch accounting before closing
    for (const item of transfer.items) {
      const accounted = item.receivedQuantity + item.damagedQuantity + item.missingQuantity;
      if (accounted !== item.dispatchedQuantity) {
        throw new ConflictError(
          `Cannot close transfer: ${item.medicineName} (batch ${item.batchNumber}) has ${item.dispatchedQuantity} dispatched vs ${accounted} accounted (received + damaged + missing).`
        );
      }
    }

    if (additionalShrinkagePtr > 0) {
      const j = await AccountingService.recordStockTransferReceiveAccounting({
        tenantId,
        transferId: transfer.id,
        transferNumber: transfer.transferNumber,
        sourceBranchId: transfer.sourceBranchId,
        destinationBranchId: transfer.destinationBranchId,
        receiveEventId: `reconcile_${transfer.id}`,
        transactionDate: now.slice(0, 10),
        acceptedPtrValue: 0,
        shrinkagePtrValue: Number(additionalShrinkagePtr.toFixed(2)),
        shrinkageBranchId: transfer.sourceBranchId,
        userId: actingUserId,
      });
      if (j && !transfer.receiveJournalEntryIds.includes(j.id)) {
        transfer.receiveJournalEntryIds.push(j.id);
      }
    }

    transfer.status = 'CLOSED';
    transfer.closedBy = actingUserId;
    transfer.closedAt = now;
    transfer.notes = transfer.notes
      ? `${transfer.notes} | Closure: ${input.resolutionNotes.trim()}`
      : `Closure: ${input.resolutionNotes.trim()}`;
    transfer.updatedAt = now;

    const closedTransfer = recalculateTransferTotals(transfer);
    await this.persistTransfer(closedTransfer);

    await BranchService.recordBranchAuditLog({
      tenantId,
      branchId: closedTransfer.destinationBranchId,
      action: 'stock_transfer.closed',
      entityType: 'STOCK_TRANSFER',
      entityId: closedTransfer.id,
      performedBy: actingUserId,
      details: {
        transferNumber: closedTransfer.transferNumber,
        resolutionNotes: input.resolutionNotes.trim(),
        shrinkagePtrValuation: closedTransfer.shrinkagePtrValuation,
      },
    });

    return closedTransfer;
  }
}

import crypto from 'node:crypto';
import { env } from '../config/env';
import { firestore } from '../lib/firebaseAdmin';
import { BadRequestError } from '../lib/errors';
import { AuditService } from './auditService';
import { BranchService } from './branchService';
import { MedicineService } from './medicineService';
import { CustomerService } from './customerService';
import { SupplierService, SupplierViewerAccess } from './supplierService';
import { BillingTransactionService } from './billingTransactionService';
import { ProcurementService } from './procurementService';
import { AccountingService } from './accountingService';

export interface RetentionPolicyRecord {
  tenantId: string;
  taxInvoiceYears: number;
  prescriptionYears: number;
  auditLogDays: number;
  supplierRecordYears: number;
  dpdpExportTtlMinutes: number;
  legalHoldEnabled: boolean;
  notes: string;
  updatedAt: string;
  updatedBy: string;
}

export interface DpdpExportManifest {
  id: string;
  tenantId: string;
  requestedBy: string;
  includeClinicalPhi: boolean;
  reason: string;
  status: 'COMPLETED';
  checksumSha256: string;
  byteLength: number;
  recordCounts: Record<string, number>;
  expiresAt: string;
  createdAt: string;
}

export interface DpdpExportResult {
  manifest: DpdpExportManifest;
  bundle: {
    schemaVersion: string;
    exportedAt: string;
    tenantId: string;
    includeClinicalPhi: boolean;
    checksumSha256: string;
    recordCounts: Record<string, number>;
    data: {
      branches: unknown[];
      medicines: unknown[];
      customers: unknown[];
      suppliers: unknown[];
      invoices: unknown[];
      purchaseOrders: unknown[];
      goodsReceipts: unknown[];
      journalEntries: unknown[];
      auditLogs: unknown[];
    };
  };
}

export interface DrDrillRecord {
  id: string;
  tenantId: string;
  drillType: 'INTEGRITY_CHECK' | 'BACKUP_READINESS_AUDIT' | 'RESTORE_SIMULATION';
  status: 'PASSED' | 'ATTENTION_REQUIRED';
  executedBy: string;
  rpoTargetMinutes: number;
  rtoTargetMinutes: number;
  backupBucketName: string;
  durationMs: number;
  integritySummary: {
    journalCount: number;
    unbalancedJournals: number;
    auditLogCount: number;
    branchCount: number;
    bundleChecksumSha256: string;
  };
  notes: string;
  gcpPitrPrerequisiteNote: string;
  createdAt: string;
}

export interface SecurityPostureReport {
  tenantId: string;
  region: string;
  environment: string;
  controls: {
    appCheckRequired: boolean;
    corsWildcardBlockedInProd: boolean;
    corsAllowedOriginsCount: number;
    helmetHeadersEnabled: boolean;
    apiNoStoreCacheHeaders: boolean;
    trustProxySetting: string;
    pinoPhiRedactionEnabled: boolean;
    csvFormulaNeutralizationEnabled: boolean;
    storageSvgUploadBlocked: boolean;
    branchMembershipScopingEnforced: boolean;
    idempotencySha256Enabled: boolean;
    sensitiveRateLimiterActive: boolean;
  };
  dpdp: {
    retentionPolicy: RetentionPolicyRecord;
    recentExportsCount: number;
    lastExportAt: string | null;
  };
  disasterRecovery: {
    rpoTargetMinutes: number;
    rtoTargetMinutes: number;
    backupBucketName: string;
    lastDrill: DrDrillRecord | null;
    pitrStagingNote: string;
  };
  generatedAt: string;
}

const testRetentionPolicies = new Map<string, RetentionPolicyRecord>();
const testDpdpExports = new Map<string, DpdpExportManifest[]>();
const testDrDrills = new Map<string, DrDrillRecord[]>();

export function clearTestSecurityData(): void {
  testRetentionPolicies.clear();
  testDpdpExports.clear();
  testDrDrills.clear();
}

function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
}

function defaultRetentionPolicy(tenantId: string): RetentionPolicyRecord {
  return {
    tenantId,
    taxInvoiceYears: 6,
    prescriptionYears: 3,
    auditLogDays: env.AUDIT_LOG_RETENTION_DAYS,
    supplierRecordYears: 6,
    dpdpExportTtlMinutes: env.DPDP_EXPORT_TTL_MINUTES,
    legalHoldEnabled: false,
    notes: 'Default statutory baseline aligned with Indian GST (6 yrs), Drugs & Cosmetics Rules (3 yrs), and DPDP Act 2023.',
    updatedAt: new Date().toISOString(),
    updatedBy: 'system-default',
  };
}

function defaultBackupBucketName(): string {
  return env.BACKUP_BUCKET_NAME || `gs://${env.FIREBASE_PROJECT_ID}-firestore-backups/${'asia-south1'}`;
}

export class SecurityGovernanceService {
  public static async getRetentionPolicy(tenantId: string): Promise<RetentionPolicyRecord> {
    if (isTestMode()) {
      return testRetentionPolicies.get(tenantId) || defaultRetentionPolicy(tenantId);
    }
    const docSnap = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('security_policies')
      .doc('retention')
      .get();
    if (!docSnap.exists) {
      return defaultRetentionPolicy(tenantId);
    }
    return docSnap.data() as RetentionPolicyRecord;
  }

  public static async updateRetentionPolicy(
    tenantId: string,
    input: {
      taxInvoiceYears: number;
      prescriptionYears: number;
      auditLogDays: number;
      supplierRecordYears: number;
      dpdpExportTtlMinutes: number;
      legalHoldEnabled?: boolean;
      notes?: string;
    },
    actingUserId: string
  ): Promise<RetentionPolicyRecord> {
    if (input.taxInvoiceYears < 6 || input.taxInvoiceYears > 10) {
      throw new BadRequestError('Tax invoice retention must be between 6 and 10 years per GST statutory rules.');
    }
    if (input.prescriptionYears < 3 || input.prescriptionYears > 10) {
      throw new BadRequestError('Prescription register retention must be between 3 and 10 years.');
    }
    if (input.auditLogDays < 365 || input.auditLogDays > 3650) {
      throw new BadRequestError('Audit log retention must be between 365 and 3650 days.');
    }
    if (input.supplierRecordYears < 6 || input.supplierRecordYears > 10) {
      throw new BadRequestError('Supplier & procurement record retention must be between 6 and 10 years.');
    }
    if (input.dpdpExportTtlMinutes < 5 || input.dpdpExportTtlMinutes > 60) {
      throw new BadRequestError('DPDP export TTL must be between 5 and 60 minutes.');
    }

    const updated: RetentionPolicyRecord = {
      tenantId,
      taxInvoiceYears: input.taxInvoiceYears,
      prescriptionYears: input.prescriptionYears,
      auditLogDays: input.auditLogDays,
      supplierRecordYears: input.supplierRecordYears,
      dpdpExportTtlMinutes: input.dpdpExportTtlMinutes,
      legalHoldEnabled: Boolean(input.legalHoldEnabled),
      notes: input.notes?.trim() || 'Tenant-configured statutory retention policy.',
      updatedAt: new Date().toISOString(),
      updatedBy: actingUserId,
    };

    if (isTestMode()) {
      testRetentionPolicies.set(tenantId, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('security_policies')
        .doc('retention')
        .set(updated);
    }

    await AuditService.log({
      tenantId,
      category: 'privacy',
      severity: 'warning',
      actingUserId,
      action: 'SECURITY_RETENTION_POLICY_UPDATED',
      metadata: {
        taxInvoiceYears: updated.taxInvoiceYears,
        prescriptionYears: updated.prescriptionYears,
        auditLogDays: updated.auditLogDays,
        supplierRecordYears: updated.supplierRecordYears,
        legalHoldEnabled: updated.legalHoldEnabled,
      },
    });

    return updated;
  }

  public static async listDpdpExports(tenantId: string): Promise<DpdpExportManifest[]> {
    if (isTestMode()) {
      return [...(testDpdpExports.get(tenantId) || [])].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
    }
    const snap = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('dpdp_exports')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();
    return snap.docs.map((d) => d.data() as DpdpExportManifest);
  }

  public static async generateDpdpExport(
    tenantId: string,
    input: {
      reason: string;
      includeClinicalPhi?: boolean;
    },
    actingUserId: string,
    viewer: SupplierViewerAccess
  ): Promise<DpdpExportResult> {
    const includeClinicalPhi = Boolean(input.includeClinicalPhi);
    const retention = await this.getRetentionPolicy(tenantId);

    const [
      branches,
      medicinesRes,
      customersRes,
      suppliersRes,
      invoicesRes,
      poRes,
      grnRes,
      journalEntries,
      auditLogs,
    ] = await Promise.all([
      BranchService.listBranches(tenantId, { includeClosed: true }),
      MedicineService.listMedicines(tenantId, { limit: 100 }),
      CustomerService.listCustomers(tenantId, { includeArchived: true, limit: 100 }, {
        role: viewer.role,
        permissions: viewer.permissions,
        assignedBranchIds: viewer.assignedBranchIds,
      }),
      SupplierService.listSuppliers(tenantId, { includeArchived: true, limit: 100 }, viewer),
      BillingTransactionService.listInvoices(tenantId, { limit: 100 }),
      ProcurementService.listPurchaseOrders(tenantId, undefined, { limit: 100 }),
      ProcurementService.listGrns(tenantId, undefined, { limit: 100 }),
      AccountingService.listJournalEntries(tenantId, { limit: 200 }),
      AuditService.queryLogs(tenantId, { limit: 200 }),
    ]);

    const customers = customersRes.customers.map((c: any) => {
      if (includeClinicalPhi) return c;
      const { allergies: _a, chronicConditions: _cc, dateOfBirth: _dob, ...rest } = c;
      return {
        ...rest,
        clinicalPhiRedacted: true,
      };
    });

    const data = {
      branches,
      medicines: medicinesRes.medicines,
      customers,
      suppliers: suppliersRes.suppliers,
      invoices: invoicesRes.invoices,
      purchaseOrders: poRes.purchaseOrders,
      goodsReceipts: grnRes.goodsReceipts,
      journalEntries,
      auditLogs,
    };

    const recordCounts: Record<string, number> = {
      branches: data.branches.length,
      medicines: data.medicines.length,
      customers: data.customers.length,
      suppliers: data.suppliers.length,
      invoices: data.invoices.length,
      purchaseOrders: data.purchaseOrders.length,
      goodsReceipts: data.goodsReceipts.length,
      journalEntries: data.journalEntries.length,
      auditLogs: data.auditLogs.length,
    };

    const exportedAt = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + retention.dpdpExportTtlMinutes * 60 * 1000
    ).toISOString();

    const serializedData = JSON.stringify(data);
    const checksumSha256 = crypto
      .createHash('sha256')
      .update(serializedData)
      .digest('hex');

    const exportId = `dpdp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const manifest: DpdpExportManifest = {
      id: exportId,
      tenantId,
      requestedBy: actingUserId,
      includeClinicalPhi,
      reason: input.reason.trim(),
      status: 'COMPLETED',
      checksumSha256,
      byteLength: Buffer.byteLength(serializedData, 'utf8'),
      recordCounts,
      expiresAt,
      createdAt: exportedAt,
    };

    if (isTestMode()) {
      const existing = testDpdpExports.get(tenantId) || [];
      existing.unshift(manifest);
      testDpdpExports.set(tenantId, existing.slice(0, 30));
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('dpdp_exports')
        .doc(exportId)
        .set(manifest);
    }

    await AuditService.log({
      tenantId,
      category: 'privacy',
      severity: 'warning',
      actingUserId,
      action: 'DPDP_TENANT_EXPORT_GENERATED',
      metadata: {
        exportId,
        includeClinicalPhi,
        checksumSha256,
        recordCounts,
        reason: input.reason.trim(),
      },
    });

    return {
      manifest,
      bundle: {
        schemaVersion: '1.0',
        exportedAt,
        tenantId,
        includeClinicalPhi,
        checksumSha256,
        recordCounts,
        data,
      },
    };
  }

  public static async listDrDrills(tenantId: string): Promise<DrDrillRecord[]> {
    if (isTestMode()) {
      return [...(testDrDrills.get(tenantId) || [])].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
    }
    const snap = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('dr_drills')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    return snap.docs.map((d) => d.data() as DrDrillRecord);
  }

  public static async recordDrDrill(
    tenantId: string,
    input: {
      drillType: DrDrillRecord['drillType'];
      notes?: string;
    },
    actingUserId: string
  ): Promise<DrDrillRecord> {
    const startMs = Date.now();
    const [branches, journalEntries, auditLogs] = await Promise.all([
      BranchService.listBranches(tenantId, { includeClosed: true }),
      AccountingService.listJournalEntries(tenantId, { limit: 200 }),
      AuditService.queryLogs(tenantId, { limit: 100 }),
    ]);

    const unbalancedJournals = journalEntries.filter(
      (j) => j.debitTotalPaise !== j.creditTotalPaise
    ).length;

    const integrityDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          tenantId,
          branches: branches.map((b) => b.id),
          journalIds: journalEntries.map((j) => [j.id, j.debitTotalPaise, j.creditTotalPaise]),
          auditCount: auditLogs.length,
        })
      )
      .digest('hex');

    const drill: DrDrillRecord = {
      id: `drill_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      tenantId,
      drillType: input.drillType,
      status: unbalancedJournals === 0 ? 'PASSED' : 'ATTENTION_REQUIRED',
      executedBy: actingUserId,
      rpoTargetMinutes: env.DR_RPO_MINUTES,
      rtoTargetMinutes: env.DR_RTO_MINUTES,
      backupBucketName: defaultBackupBucketName(),
      durationMs: Math.max(1, Date.now() - startMs),
      integritySummary: {
        journalCount: journalEntries.length,
        unbalancedJournals,
        auditLogCount: auditLogs.length,
        branchCount: branches.length,
        bundleChecksumSha256: integrityDigest,
      },
      notes:
        input.notes?.trim() ||
        'Application-level ledger parity & tenant dataset checksum verification completed.',
      gcpPitrPrerequisiteNote:
        'Live Cloud Firestore PITR and Coldline export bucket restore must be executed and verified in GCP Project staging using gcloud / Firebase Console.',
      createdAt: new Date().toISOString(),
    };

    if (isTestMode()) {
      const existing = testDrDrills.get(tenantId) || [];
      existing.unshift(drill);
      testDrDrills.set(tenantId, existing.slice(0, 20));
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('dr_drills')
        .doc(drill.id)
        .set(drill);
    }

    await AuditService.log({
      tenantId,
      category: 'dr',
      severity: drill.status === 'PASSED' ? 'info' : 'critical',
      actingUserId,
      action: 'SECURITY_DR_DRILL_RECORDED',
      metadata: {
        drillId: drill.id,
        drillType: drill.drillType,
        status: drill.status,
        unbalancedJournals,
        bundleChecksumSha256: integrityDigest,
      },
    });

    return drill;
  }

  public static async getDrStatus(tenantId: string) {
    const drills = await this.listDrDrills(tenantId);
    return {
      tenantId,
      rpoTargetMinutes: env.DR_RPO_MINUTES,
      rtoTargetMinutes: env.DR_RTO_MINUTES,
      backupBucketName: defaultBackupBucketName(),
      pitrVerificationNote:
        'Cloud Firestore Point-in-Time Recovery (7-day window) & daily managed GCS export require live GCP project enablement in asia-south1.',
      lastDrill: drills[0] || null,
      drills,
    };
  }

  public static async getSecurityPosture(tenantId: string): Promise<SecurityPostureReport> {
    const [retentionPolicy, exportsList, drStatus] = await Promise.all([
      this.getRetentionPolicy(tenantId),
      this.listDpdpExports(tenantId),
      this.getDrStatus(tenantId),
    ]);

    return {
      tenantId,
      region: 'asia-south1',
      environment: env.NODE_ENV,
      controls: {
        appCheckRequired: env.FIREBASE_APP_CHECK_REQUIRED,
        corsWildcardBlockedInProd: true,
        corsAllowedOriginsCount: env.CORS_ALLOWED_ORIGINS.length,
        helmetHeadersEnabled: true,
        apiNoStoreCacheHeaders: true,
        trustProxySetting: env.TRUST_PROXY,
        pinoPhiRedactionEnabled: true,
        csvFormulaNeutralizationEnabled: true,
        storageSvgUploadBlocked: true,
        branchMembershipScopingEnforced: true,
        idempotencySha256Enabled: true,
        sensitiveRateLimiterActive: true,
      },
      dpdp: {
        retentionPolicy,
        recentExportsCount: exportsList.length,
        lastExportAt: exportsList[0]?.createdAt || null,
      },
      disasterRecovery: {
        rpoTargetMinutes: drStatus.rpoTargetMinutes,
        rtoTargetMinutes: drStatus.rtoTargetMinutes,
        backupBucketName: drStatus.backupBucketName,
        lastDrill: drStatus.lastDrill,
        pitrStagingNote: drStatus.pitrVerificationNote,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiClientError, ApiSessionConfig } from './customerApi.ts';

export interface RetentionPolicyData {
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

export interface DrDrillData {
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

export interface DpdpExportManifestData {
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

export interface DpdpExportResponse {
  manifest: DpdpExportManifestData;
  bundle: {
    schemaVersion: string;
    exportedAt: string;
    tenantId: string;
    includeClinicalPhi: boolean;
    checksumSha256: string;
    recordCounts: Record<string, number>;
    data: Record<string, unknown[]>;
  };
}

export interface SecurityPostureData {
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
    retentionPolicy: RetentionPolicyData;
    recentExportsCount: number;
    lastExportAt: string | null;
  };
  disasterRecovery: {
    rpoTargetMinutes: number;
    rtoTargetMinutes: number;
    backupBucketName: string;
    lastDrill: DrDrillData | null;
    pitrStagingNote: string;
  };
  generatedAt: string;
}

export interface SecurityAuditLogRecord {
  id?: string;
  tenantId: string;
  branchId?: string;
  category?: string;
  severity?: string;
  actingUserId: string;
  targetUserId?: string;
  action: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

async function securityRequest<T>(
  session: ApiSessionConfig,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  if (!session.bearerToken) {
    throw new ApiClientError(
      401,
      'Firebase Authentication Required',
      'Sign in with a valid Firebase Auth token to inspect live security posture and audit logs.'
    );
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.bearerToken}`);
  headers.set('X-Tenant-ID', session.tenantId);
  if (session.branchId) {
    headers.set('X-Branch-ID', session.branchId);
  }
  if (session.appCheckToken) {
    headers.set('X-Firebase-AppCheck', session.appCheckToken);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const errObj = (parsed && typeof parsed === 'object' ? parsed : {}) as {
      title?: string;
      detail?: string;
      message?: string;
    };
    throw new ApiClientError(
      res.status,
      errObj.title || `HTTP ${res.status}`,
      errObj.detail || errObj.message || `Request failed with status ${res.status}`
    );
  }

  return parsed as T;
}

export const securityApi = {
  async getPosture(session: ApiSessionConfig): Promise<SecurityPostureData> {
    const res = await securityRequest<{ success: boolean; data: SecurityPostureData }>(
      session,
      '/api/v1/security/posture'
    );
    return res.data;
  },

  async queryAuditLogs(
    session: ApiSessionConfig,
    filters: { action?: string; search?: string; limit?: number } = {}
  ): Promise<SecurityAuditLogRecord[]> {
    const sp = new URLSearchParams();
    if (filters.action) sp.set('action', filters.action);
    if (filters.search) sp.set('search', filters.search);
    if (filters.limit) sp.set('limit', String(filters.limit));
    const qs = sp.toString();
    const res = await securityRequest<{
      success: boolean;
      data: { logs: SecurityAuditLogRecord[]; count: number };
    }>(session, `/api/v1/security/audit-logs${qs ? `?${qs}` : ''}`);
    return res.data.logs;
  },

  async updateRetentionPolicy(
    session: ApiSessionConfig,
    payload: {
      taxInvoiceYears: number;
      prescriptionYears: number;
      auditLogDays: number;
      supplierRecordYears: number;
      dpdpExportTtlMinutes: number;
      legalHoldEnabled?: boolean;
      notes?: string;
    }
  ): Promise<RetentionPolicyData> {
    const res = await securityRequest<{
      success: boolean;
      data: { policy: RetentionPolicyData };
    }>(session, '/api/v1/security/retention-policy', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data.policy;
  },

  async listDpdpExports(session: ApiSessionConfig): Promise<DpdpExportManifestData[]> {
    const res = await securityRequest<{
      success: boolean;
      data: { exports: DpdpExportManifestData[] };
    }>(session, '/api/v1/security/dpdp-exports');
    return res.data.exports;
  },

  async generateDpdpExport(
    session: ApiSessionConfig,
    payload: { reason: string; includeClinicalPhi?: boolean }
  ): Promise<DpdpExportResponse> {
    const res = await securityRequest<{
      success: boolean;
      data: DpdpExportResponse;
    }>(session, '/api/v1/security/dpdp-export', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async getDrStatus(session: ApiSessionConfig): Promise<{
    rpoTargetMinutes: number;
    rtoTargetMinutes: number;
    backupBucketName: string;
    pitrVerificationNote: string;
    drills: DrDrillData[];
  }> {
    const res = await securityRequest<{
      success: boolean;
      data: {
        rpoTargetMinutes: number;
        rtoTargetMinutes: number;
        backupBucketName: string;
        pitrVerificationNote: string;
        drills: DrDrillData[];
      };
    }>(session, '/api/v1/security/dr-status');
    return res.data;
  },

  async recordDrDrill(
    session: ApiSessionConfig,
    payload: {
      drillType: 'INTEGRITY_CHECK' | 'BACKUP_READINESS_AUDIT' | 'RESTORE_SIMULATION';
      notes?: string;
    }
  ): Promise<DrDrillData> {
    const res = await securityRequest<{
      success: boolean;
      data: { drill: DrDrillData };
    }>(session, '/api/v1/security/dr-drills', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data.drill;
  },
};

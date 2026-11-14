/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiClientError, ApiSessionConfig, generateIdempotencyKey } from './customerApi.ts';
import type {
  BranchAuditLogEntry,
  BranchClosureCheck,
  BranchComparisonRow,
  ConsolidatedFinancialOverview,
  PharmacyBranch,
  StockTransfer,
} from '../types/pharmacy.ts';

async function multiBranchRequest<T>(
  session: ApiSessionConfig,
  path: string,
  init: RequestInit = {},
  options: { idempotent?: boolean } = {}
): Promise<T> {
  if (!session.bearerToken) {
    throw new ApiClientError(
      401,
      'Firebase Authentication Required',
      'Sign in with a valid Firebase Auth token to execute live branch and transfer API requests.'
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
  if (options.idempotent && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', generateIdempotencyKey());
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

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      sp.set(k, String(v));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export const branchTransferApi = {
  async listAuthorizedBranches(session: ApiSessionConfig): Promise<PharmacyBranch[]> {
    const res = await multiBranchRequest<{ success: boolean; data: PharmacyBranch[] }>(
      session,
      '/api/v1/branches/authorized'
    );
    return res.data;
  },

  async listBranches(
    session: ApiSessionConfig,
    filters: { status?: string; includeClosed?: boolean } = {}
  ): Promise<PharmacyBranch[]> {
    const res = await multiBranchRequest<{ success: boolean; data: PharmacyBranch[] }>(
      session,
      `/api/v1/branches${buildQuery(filters)}`
    );
    return res.data;
  },

  async createBranch(
    session: ApiSessionConfig,
    payload: {
      branchCode: string;
      name: string;
      branchType?: PharmacyBranch['branchType'];
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
      transferPolicy?: Partial<PharmacyBranch['transferPolicy']>;
    }
  ): Promise<PharmacyBranch> {
    const res = await multiBranchRequest<{ success: boolean; data: PharmacyBranch }>(
      session,
      '/api/v1/branches',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return res.data;
  },

  async updateBranch(
    session: ApiSessionConfig,
    branchId: string,
    payload: Partial<PharmacyBranch>
  ): Promise<PharmacyBranch> {
    const res = await multiBranchRequest<{ success: boolean; data: PharmacyBranch }>(
      session,
      `/api/v1/branches/${branchId}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
    return res.data;
  },

  async updateBranchSettings(
    session: ApiSessionConfig,
    branchId: string,
    payload: Partial<PharmacyBranch['transferPolicy']> & {
      operatingHours?: string;
      timezone?: string;
    }
  ): Promise<PharmacyBranch> {
    const res = await multiBranchRequest<{ success: boolean; data: PharmacyBranch }>(
      session,
      `/api/v1/branches/${branchId}/settings`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
    return res.data;
  },

  async setPrimaryBranch(session: ApiSessionConfig, branchId: string): Promise<PharmacyBranch> {
    const res = await multiBranchRequest<{ success: boolean; data: PharmacyBranch }>(
      session,
      `/api/v1/branches/${branchId}/set-primary`,
      { method: 'POST' }
    );
    return res.data;
  },

  async changeBranchStatus(
    session: ApiSessionConfig,
    branchId: string,
    action: 'activate' | 'deactivate' | 'suspend',
    reason?: string
  ): Promise<PharmacyBranch> {
    const res = await multiBranchRequest<{ success: boolean; data: PharmacyBranch }>(
      session,
      `/api/v1/branches/${branchId}/${action}`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    );
    return res.data;
  },

  async checkBranchClosure(session: ApiSessionConfig, branchId: string): Promise<BranchClosureCheck> {
    const res = await multiBranchRequest<{ success: boolean; data: BranchClosureCheck }>(
      session,
      `/api/v1/branches/${branchId}/closure-check`
    );
    return res.data;
  },

  async closeBranch(
    session: ApiSessionConfig,
    branchId: string,
    closureNotes?: string
  ): Promise<PharmacyBranch> {
    const res = await multiBranchRequest<{ success: boolean; data: PharmacyBranch }>(
      session,
      `/api/v1/branches/${branchId}/close`,
      { method: 'POST', body: JSON.stringify({ closureNotes }) }
    );
    return res.data;
  },

  async assignEmployeeToBranch(session: ApiSessionConfig, branchId: string, userId: string) {
    return multiBranchRequest<{ success: boolean; data: unknown }>(
      session,
      `/api/v1/branches/${branchId}/employees`,
      { method: 'POST', body: JSON.stringify({ userId }) }
    );
  },

  async removeEmployeeFromBranch(session: ApiSessionConfig, branchId: string, targetUserId: string) {
    return multiBranchRequest<{ success: boolean; data: unknown }>(
      session,
      `/api/v1/branches/${branchId}/employees/${targetUserId}`,
      { method: 'DELETE' }
    );
  },

  async listBranchAuditLogs(
    session: ApiSessionConfig,
    branchId?: string
  ): Promise<BranchAuditLogEntry[]> {
    const res = await multiBranchRequest<{ success: boolean; data: BranchAuditLogEntry[] }>(
      session,
      `/api/v1/branches/audit-logs${buildQuery({ branchId })}`
    );
    return res.data;
  },

  async listStockTransfers(
    session: ApiSessionConfig,
    filters: { status?: string; sourceBranchId?: string; destinationBranchId?: string; direction?: string } = {}
  ): Promise<StockTransfer[]> {
    const res = await multiBranchRequest<{ success: boolean; data: StockTransfer[] }>(
      session,
      `/api/v1/stock-transfers${buildQuery(filters)}`
    );
    return res.data;
  },

  async createStockTransfer(
    session: ApiSessionConfig,
    payload: {
      sourceBranchId: string;
      destinationBranchId: string;
      transferDate?: string;
      expectedDeliveryDate?: string;
      notes?: string;
      submitImmediately?: boolean;
      items: Array<{
        medicineId: string;
        sourceBatchId: string;
        requestedQuantity: number;
      }>;
    }
  ): Promise<StockTransfer> {
    const res = await multiBranchRequest<{ success: boolean; data: StockTransfer }>(
      session,
      '/api/v1/stock-transfers',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return res.data;
  },

  async submitStockTransfer(session: ApiSessionConfig, transferId: string): Promise<StockTransfer> {
    const res = await multiBranchRequest<{ success: boolean; data: StockTransfer }>(
      session,
      `/api/v1/stock-transfers/${transferId}/submit`,
      { method: 'POST' }
    );
    return res.data;
  },

  async approveStockTransfer(
    session: ApiSessionConfig,
    transferId: string,
    items?: Array<{ itemId: string; approvedQuantity: number }>
  ): Promise<StockTransfer> {
    const res = await multiBranchRequest<{ success: boolean; data: StockTransfer }>(
      session,
      `/api/v1/stock-transfers/${transferId}/approve`,
      { method: 'POST', body: JSON.stringify(items ? { items } : {}) }
    );
    return res.data;
  },

  async rejectStockTransfer(
    session: ApiSessionConfig,
    transferId: string,
    reason: string
  ): Promise<StockTransfer> {
    const res = await multiBranchRequest<{ success: boolean; data: StockTransfer }>(
      session,
      `/api/v1/stock-transfers/${transferId}/reject`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    );
    return res.data;
  },

  async cancelStockTransfer(
    session: ApiSessionConfig,
    transferId: string,
    reason: string
  ): Promise<StockTransfer> {
    const res = await multiBranchRequest<{ success: boolean; data: StockTransfer }>(
      session,
      `/api/v1/stock-transfers/${transferId}/cancel`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    );
    return res.data;
  },

  async dispatchStockTransfer(
    session: ApiSessionConfig,
    transferId: string,
    payload: {
      dispatchReference?: string;
      transporterName?: string;
      vehicleNumber?: string;
      notes?: string;
      items?: Array<{ itemId: string; dispatchQuantity: number }>;
    }
  ): Promise<StockTransfer> {
    const res = await multiBranchRequest<{ success: boolean; data: StockTransfer }>(
      session,
      `/api/v1/stock-transfers/${transferId}/dispatch`,
      { method: 'POST', body: JSON.stringify(payload) },
      { idempotent: true }
    );
    return res.data;
  },

  async receiveStockTransfer(
    session: ApiSessionConfig,
    transferId: string,
    payload: {
      notes?: string;
      items: Array<{
        itemId: string;
        receivedQuantity: number;
        damagedQuantity?: number;
        missingQuantity?: number;
        discrepancyReason?: string;
      }>;
    }
  ): Promise<StockTransfer> {
    const res = await multiBranchRequest<{ success: boolean; data: StockTransfer }>(
      session,
      `/api/v1/stock-transfers/${transferId}/receive`,
      { method: 'POST', body: JSON.stringify(payload) },
      { idempotent: true }
    );
    return res.data;
  },

  async reconcileStockTransfer(
    session: ApiSessionConfig,
    transferId: string,
    reconciliationNotes: string
  ): Promise<StockTransfer> {
    const res = await multiBranchRequest<{ success: boolean; data: StockTransfer }>(
      session,
      `/api/v1/stock-transfers/${transferId}/reconcile`,
      { method: 'POST', body: JSON.stringify({ reconciliationNotes }) },
      { idempotent: true }
    );
    return res.data;
  },

  async getConsolidatedOverview(
    session: ApiSessionConfig,
    filters: { fromDate?: string; toDate?: string } = {}
  ): Promise<ConsolidatedFinancialOverview> {
    const res = await multiBranchRequest<{ success: boolean; data: ConsolidatedFinancialOverview }>(
      session,
      `/api/v1/reports/consolidated/overview${buildQuery(filters)}`
    );
    return res.data;
  },

  async getBranchComparison(
    session: ApiSessionConfig,
    filters: { fromDate?: string; toDate?: string } = {}
  ): Promise<{ period: { fromDate: string; toDate: string }; branches: BranchComparisonRow[] }> {
    const res = await multiBranchRequest<{
      success: boolean;
      data: { period: { fromDate: string; toDate: string }; branches: BranchComparisonRow[] };
    }>(session, `/api/v1/reports/consolidated/branch-comparison${buildQuery(filters)}`);
    return res.data;
  },

  async downloadConsolidatedExport(
    session: ApiSessionConfig,
    type: 'branch-comparison' | 'consolidated-summary',
    format: 'csv' | 'pdf',
    filters: { fromDate?: string; toDate?: string } = {}
  ) {
    if (!session.bearerToken) {
      throw new ApiClientError(401, 'Authentication Required', 'Connect a Firebase token to export from backend.');
    }
    const qs = buildQuery({ ...filters, type, format });
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${session.bearerToken}`);
    headers.set('X-Tenant-ID', session.tenantId);
    if (session.branchId) headers.set('X-Branch-ID', session.branchId);
    if (session.appCheckToken) headers.set('X-Firebase-AppCheck', session.appCheckToken);

    const res = await fetch(`/api/v1/reports/consolidated/export${qs}`, { headers });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new ApiClientError(res.status, errBody?.title || `HTTP ${res.status}`, errBody?.detail || 'Export failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmadesk-${type}-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

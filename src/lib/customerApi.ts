/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CustomerAccount,
  CustomerLedgerEntry,
  CustomerPayment,
  CustomerReconciliation,
  CustomerStatement,
  CreditSummaryDashboard,
  OutstandingReport,
  OverdueReport,
  CustomerType,
  CustomerGender,
  CustomerStatus,
  KhataPaymentMode,
  PaymentMode,
} from '../types/pharmacy.ts';

export interface ApiSessionConfig {
  bearerToken: string | null;
  tenantId: string;
  branchId: string;
  appCheckToken?: string | null;
}

export interface ProblemDetailErrorItem {
  field?: string;
  message: string;
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly title: string;
  public readonly detail: string;
  public readonly errors?: ProblemDetailErrorItem[];

  constructor(
    status: number,
    title: string,
    detail: string,
    errors?: ProblemDetailErrorItem[]
  ) {
    super(detail || title);
    this.name = 'ApiClientError';
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.errors = errors;
  }
}

export function generateIdempotencyKey(prefix = 'pd'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function apiRequest<T>(
  session: ApiSessionConfig,
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  if (!session.bearerToken) {
    throw new ApiClientError(
      401,
      'Authentication Required',
      'No Firebase Auth bearer token is configured for live API access.'
    );
  }

  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${session.bearerToken}`);
  headers.set('X-Tenant-ID', session.tenantId);
  if (session.branchId) {
    headers.set('X-Branch-ID', session.branchId);
  }
  if (session.appCheckToken) {
    headers.set('X-Firebase-AppCheck', session.appCheckToken);
  }
  if (init.idempotencyKey) {
    headers.set('X-Idempotency-Key', init.idempotencyKey);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  let payload: any = null;
  if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
    payload = await response.json();
  } else {
    const text = await response.text();
    payload = { detail: text };
  }

  if (!response.ok) {
    const title = payload?.title || `HTTP ${response.status}`;
    const detail = payload?.detail || payload?.message || 'Request failed';
    throw new ApiClientError(response.status, title, detail, payload?.errors);
  }

  return payload as T;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) {
      qs.set(k, String(v));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export interface CreateCustomerPayload {
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

export interface UpdateCustomerPayload {
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

export interface BackendInvoiceRecord {
  id: string;
  invoiceNumber: string;
  branchId: string;
  customerId?: string;
  customer: {
    name: string;
    phone?: string;
    doctorName?: string;
    doctorRegNumber?: string;
  };
  items: Array<{
    batchId: string;
    batchNumber: string;
    medicineId: string;
    medicineName: string;
    quantity: number;
    mrp: number;
    discountPercent: number;
    lineTotal: number;
    gstRate: number;
  }>;
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
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  status: 'completed' | 'cancelled' | 'partially_returned' | 'returned';
  createdAt: string;
  isOverdue?: boolean;
  daysOverdue?: number;
}

export const customerApi = {
  async listCustomers(
    session: ApiSessionConfig,
    filters: {
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
    } = {}
  ): Promise<{
    customers: CustomerAccount[];
    pagination: { page: number; limit: number; totalCount: number; totalPages: number; hasNext: boolean };
  }> {
    const res = await apiRequest<{
      success: boolean;
      data: CustomerAccount[];
      pagination: { page: number; limit: number; totalCount: number; totalPages: number; hasNext: boolean };
    }>(session, `/api/v1/customers${buildQuery(filters)}`);
    return { customers: res.data, pagination: res.pagination };
  },

  async createCustomer(session: ApiSessionConfig, payload: CreateCustomerPayload): Promise<CustomerAccount> {
    const res = await apiRequest<{ success: boolean; data: CustomerAccount }>(
      session,
      '/api/v1/customers',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return res.data;
  },

  async getCustomer(session: ApiSessionConfig, customerId: string): Promise<CustomerAccount> {
    const res = await apiRequest<{ success: boolean; data: CustomerAccount }>(
      session,
      `/api/v1/customers/${encodeURIComponent(customerId)}`
    );
    return res.data;
  },

  async updateCustomer(
    session: ApiSessionConfig,
    customerId: string,
    payload: UpdateCustomerPayload
  ): Promise<CustomerAccount> {
    const res = await apiRequest<{ success: boolean; data: CustomerAccount }>(
      session,
      `/api/v1/customers/${encodeURIComponent(customerId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
    return res.data;
  },

  async updateCustomerStatus(
    session: ApiSessionConfig,
    customerId: string,
    status: CustomerStatus,
    reason?: string
  ): Promise<CustomerAccount> {
    const res = await apiRequest<{ success: boolean; data: CustomerAccount }>(
      session,
      `/api/v1/customers/${encodeURIComponent(customerId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      }
    );
    return res.data;
  },

  async archiveCustomer(
    session: ApiSessionConfig,
    customerId: string,
    reason?: string
  ): Promise<CustomerAccount> {
    const res = await apiRequest<{ success: boolean; data: CustomerAccount }>(
      session,
      `/api/v1/customers/${encodeURIComponent(customerId)}/archive`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
    return res.data;
  },

  async getCustomerPurchases(
    session: ApiSessionConfig,
    customerId: string,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      paymentStatus?: string;
      search?: string;
      branchId?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    invoices: BackendInvoiceRecord[];
    summary: {
      totalInvoices: number;
      totalPurchased: number;
      totalPaid: number;
      totalBalanceDue: number;
      overdueInvoices: number;
    };
    pagination: { page: number; limit: number; totalCount: number; totalPages: number; hasNext: boolean };
  }> {
    const res = await apiRequest<{
      success: boolean;
      data: BackendInvoiceRecord[];
      summary: {
        totalInvoices: number;
        totalPurchased: number;
        totalPaid: number;
        totalBalanceDue: number;
        overdueInvoices: number;
      };
      pagination: { page: number; limit: number; totalCount: number; totalPages: number; hasNext: boolean };
    }>(
      session,
      `/api/v1/customers/${encodeURIComponent(customerId)}/purchases${buildQuery(filters)}`
    );
    return { invoices: res.data, summary: res.summary, pagination: res.pagination };
  },

  async getCustomerLedger(
    session: ApiSessionConfig,
    customerId: string,
    filters: { dateFrom?: string; dateTo?: string; entryType?: string; page?: number; limit?: number } = {}
  ): Promise<{
    entries: CustomerLedgerEntry[];
    pagination: { page: number; limit: number; totalCount: number; totalPages: number; hasNext: boolean };
  }> {
    const res = await apiRequest<{
      success: boolean;
      data: CustomerLedgerEntry[];
      pagination: { page: number; limit: number; totalCount: number; totalPages: number; hasNext: boolean };
    }>(
      session,
      `/api/v1/customers/${encodeURIComponent(customerId)}/ledger${buildQuery(filters)}`
    );
    return { entries: res.data, pagination: res.pagination };
  },

  async reconcileCustomerBalance(
    session: ApiSessionConfig,
    customerId: string
  ): Promise<CustomerReconciliation> {
    const res = await apiRequest<{ success: boolean; data: CustomerReconciliation }>(
      session,
      `/api/v1/customers/${encodeURIComponent(customerId)}/ledger/reconcile`
    );
    return res.data;
  },

  async listCustomerPayments(
    session: ApiSessionConfig,
    customerId: string
  ): Promise<CustomerPayment[]> {
    const res = await apiRequest<{ success: boolean; data: CustomerPayment[] }>(
      session,
      `/api/v1/customers/${encodeURIComponent(customerId)}/payments`
    );
    return res.data;
  },

  async collectKhataPayment(
    session: ApiSessionConfig,
    customerId: string,
    payload: {
      amount: number;
      paymentMode: KhataPaymentMode;
      referenceNumber?: string;
      paymentDate?: string;
      invoiceId?: string;
      allowAdvance?: boolean;
      notes?: string;
    },
    idempotencyKey: string
  ): Promise<{
    payment: CustomerPayment;
    customer: CustomerAccount;
    ledgerEntry: CustomerLedgerEntry;
    fromCache?: boolean;
  }> {
    const res = await apiRequest<{
      success: boolean;
      data: {
        payment: CustomerPayment;
        customer: CustomerAccount;
        ledgerEntry: CustomerLedgerEntry;
        fromCache?: boolean;
      };
    }>(session, `/api/v1/customers/${encodeURIComponent(customerId)}/payments`, {
      method: 'POST',
      idempotencyKey,
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async updateCreditLimit(
    session: ApiSessionConfig,
    customerId: string,
    payload: {
      creditLimit: number;
      creditEnabled?: boolean;
      creditTermsDays?: 0 | 7 | 15 | 30;
      reason?: string;
    }
  ): Promise<CustomerAccount> {
    const res = await apiRequest<{ success: boolean; data: CustomerAccount }>(
      session,
      `/api/v1/customers/${encodeURIComponent(customerId)}/credit-limit`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
    return res.data;
  },

  async issueCreditNote(
    session: ApiSessionConfig,
    customerId: string,
    payload: {
      amount: number;
      reason: string;
      invoiceId?: string;
      returnId?: string;
      notes?: string;
      reduceInvoiceDue?: boolean;
    },
    idempotencyKey: string
  ): Promise<{ ledgerEntry: CustomerLedgerEntry; customer: CustomerAccount; fromCache?: boolean }> {
    const res = await apiRequest<{
      success: boolean;
      data: { ledgerEntry: CustomerLedgerEntry; customer: CustomerAccount; fromCache?: boolean };
    }>(session, `/api/v1/customers/${encodeURIComponent(customerId)}/credit-notes`, {
      method: 'POST',
      idempotencyKey,
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async createBalanceAdjustment(
    session: ApiSessionConfig,
    customerId: string,
    payload: {
      adjustmentType: 'DEBIT_ADJUSTMENT' | 'CREDIT_ADJUSTMENT' | 'OPENING_BALANCE' | 'REFUND';
      amount: number;
      reason: string;
      referenceNumber?: string;
      notes?: string;
    },
    idempotencyKey: string
  ): Promise<{ ledgerEntry: CustomerLedgerEntry; customer: CustomerAccount; fromCache?: boolean }> {
    const res = await apiRequest<{
      success: boolean;
      data: { ledgerEntry: CustomerLedgerEntry; customer: CustomerAccount; fromCache?: boolean };
    }>(session, `/api/v1/customers/${encodeURIComponent(customerId)}/adjustments`, {
      method: 'POST',
      idempotencyKey,
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async getCustomerStatement(
    session: ApiSessionConfig,
    customerId: string,
    filters: { dateFrom?: string; dateTo?: string } = {}
  ): Promise<CustomerStatement> {
    const res = await apiRequest<{ success: boolean; data: CustomerStatement }>(
      session,
      `/api/v1/customers/${encodeURIComponent(customerId)}/statement${buildQuery(filters)}`
    );
    return res.data;
  },

  async exportCustomerStatement(
    session: ApiSessionConfig,
    customerId: string,
    payload: { format: 'csv' | 'pdf'; dateFrom?: string; dateTo?: string }
  ): Promise<{
    fileName: string;
    mimeType: string;
    storagePath: string;
    downloadUrl: string;
    contentBase64: string;
  }> {
    const res = await apiRequest<{
      success: boolean;
      data: {
        fileName: string;
        mimeType: string;
        storagePath: string;
        downloadUrl: string;
        contentBase64: string;
      };
    }>(session, `/api/v1/customers/${encodeURIComponent(customerId)}/statement/export`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async prepareWhatsAppStatement(
    session: ApiSessionConfig,
    customerId: string,
    payload: { dateFrom?: string; dateTo?: string; storeName?: string } = {}
  ): Promise<{
    customerId: string;
    customerName: string;
    messageText: string;
    whatsappUrl: string;
    deliveryStatus: 'USER_ACTION_REQUIRED';
  }> {
    const res = await apiRequest<{
      success: boolean;
      data: {
        customerId: string;
        customerName: string;
        messageText: string;
        whatsappUrl: string;
        deliveryStatus: 'USER_ACTION_REQUIRED';
      };
    }>(session, `/api/v1/customers/${encodeURIComponent(customerId)}/statement/whatsapp`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async getOutstandingReport(
    session: ApiSessionConfig,
    filters: { branchId?: string; customerType?: string; search?: string } = {}
  ): Promise<OutstandingReport> {
    const res = await apiRequest<{ success: boolean; data: OutstandingReport }>(
      session,
      `/api/v1/customers/reports/outstanding${buildQuery(filters)}`
    );
    return res.data;
  },

  async getOverdueReport(
    session: ApiSessionConfig,
    filters: { branchId?: string; minDaysOverdue?: number } = {}
  ): Promise<OverdueReport> {
    const res = await apiRequest<{ success: boolean; data: OverdueReport }>(
      session,
      `/api/v1/customers/reports/overdue${buildQuery(filters)}`
    );
    return res.data;
  },

  async getCreditSummaryDashboard(
    session: ApiSessionConfig,
    branchId?: string
  ): Promise<CreditSummaryDashboard> {
    const res = await apiRequest<{ success: boolean; data: CreditSummaryDashboard }>(
      session,
      `/api/v1/customers/reports/credit-summary${buildQuery({ branchId })}`
    );
    return res.data;
  },

  async checkoutPOS(
    session: ApiSessionConfig,
    payload: {
      customerId?: string;
      customer: {
        name: string;
        phone?: string;
        doctorName?: string;
        doctorRegNumber?: string;
      };
      items: Array<{
        medicineId: string;
        batchId?: string;
        quantity: number;
        mrp?: number;
        discountPercent?: number;
        gstRate?: number;
      }>;
      payments?: Array<{ mode: PaymentMode; amount: number; referenceNumber?: string }>;
      paymentMode?: PaymentMode;
      creditTermsDays?: 0 | 7 | 15 | 30;
      overrideCreditLimit?: boolean;
      creditOverrideReason?: string;
      isInterState?: boolean;
      notes?: string;
    },
    idempotencyKey: string
  ) {
    const res = await apiRequest<{ success: boolean; data: any }>(
      session,
      '/api/v1/pos/checkout',
      {
        method: 'POST',
        idempotencyKey,
        body: JSON.stringify(payload),
      }
    );
    return res.data;
  },
};

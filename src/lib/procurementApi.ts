/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoodsReceiptNote,
  PurchaseOrder,
  PurchaseOrderStatus,
  Supplier,
  SupplierInvoice,
  SupplierPayment,
  SupplierPaymentMode,
  SupplierReturn,
  SupplierStatementEntry,
  SupplierStatus,
  SupplierType,
} from '../types/pharmacy.ts';
import { ApiClientError, ApiSessionConfig, generateIdempotencyKey } from './customerApi.ts';

async function procurementRequest<T>(
  session: ApiSessionConfig,
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  if (!session.bearerToken) {
    throw new ApiClientError(401, 'Authentication Required', 'No Firebase bearer token configured.');
  }

  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${session.bearerToken}`);
  headers.set('X-Tenant-ID', session.tenantId);
  if (session.branchId) headers.set('X-Branch-ID', session.branchId);
  if (session.appCheckToken) headers.set('X-Firebase-AppCheck', session.appCheckToken);
  if (init.idempotencyKey) headers.set('X-Idempotency-Key', init.idempotencyKey);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...init, headers });
  const ct = res.headers.get('content-type') || '';
  const payload = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      payload?.title || `HTTP ${res.status}`,
      payload?.detail || payload?.message || 'Procurement request failed',
      payload?.errors
    );
  }
  return payload as T;
}

export function mapApiSupplierToUi(s: any): Supplier {
  return {
    id: s.id,
    supplierCode: s.supplierCode,
    agencyName: s.tradeName || s.legalName,
    legalName: s.legalName,
    contactPerson: s.contactPerson,
    phone: s.primaryPhone,
    alternatePhone: s.alternatePhone,
    email: s.email || '',
    city: s.state || '',
    state: s.state,
    stateCode: s.stateCode,
    pincode: s.pincode,
    billingAddress: s.billingAddress,
    shippingAddress: s.shippingAddress,
    dlNumber: s.drugLicenceNumber || '',
    gstin: s.gstin || '',
    pan: s.pan,
    supplierType: s.supplierType,
    creditPeriodDays: s.creditPeriodDays,
    creditLimit: s.creditLimit,
    openingBalance: s.openingBalance,
    outstandingBalance: s.currentOutstandingBalance ?? 0,
    advanceBalance: s.advanceBalance,
    totalPurchases: s.totalPurchases,
    totalPayments: s.totalPayments,
    lastPurchaseDate: s.lastPurchaseDate,
    lastPaymentDate: s.lastPaymentDate,
    paymentTerms: s.paymentTerms || 'Net 21 days',
    bankDetails: s.bankDetails,
    bankDetailsRedacted: s.bankDetailsRedacted,
    financialsRedacted: s.financialsRedacted,
    attachments: s.attachments || [],
    notes: s.notes,
    status: s.status || 'ACTIVE',
    isArchived: Boolean(s.isArchived),
    blockReason: s.blockReason,
  };
}

export const procurementApi = {
  async listSuppliers(
    session: ApiSessionConfig,
    params: { search?: string; status?: SupplierStatus; includeArchived?: boolean } = {}
  ) {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.status) qs.set('status', params.status);
    if (params.includeArchived) qs.set('includeArchived', 'true');
    const res = await procurementRequest<{ success: boolean; data: { suppliers: any[]; total: number } }>(
      session,
      `/api/v1/suppliers?${qs.toString()}`
    );
    return {
      suppliers: res.data.suppliers.map(mapApiSupplierToUi),
      total: res.data.total,
    };
  },

  async createSupplier(
    session: ApiSessionConfig,
    payload: {
      legalName: string;
      tradeName?: string;
      contactPerson: string;
      primaryPhone: string;
      email?: string;
      gstin?: string;
      pan?: string;
      billingAddress?: string;
      state: string;
      pincode?: string;
      drugLicenceNumber?: string;
      supplierType?: SupplierType;
      creditPeriodDays?: number;
      creditLimit?: number;
      openingBalance?: number;
      bankDetails?: Supplier['bankDetails'];
      notes?: string;
      confirmDuplicate?: boolean;
    }
  ) {
    const res = await procurementRequest<{ success: boolean; data: { supplier: any } }>(
      session,
      '/api/v1/suppliers',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return mapApiSupplierToUi(res.data.supplier);
  },

  async updateSupplierStatus(
    session: ApiSessionConfig,
    supplierId: string,
    status: SupplierStatus,
    reason?: string
  ) {
    const res = await procurementRequest<{ success: boolean; data: { supplier: any } }>(
      session,
      `/api/v1/suppliers/${supplierId}/status`,
      { method: 'PATCH', body: JSON.stringify({ status, reason }) }
    );
    return mapApiSupplierToUi(res.data.supplier);
  },

  async getSupplierStatement(session: ApiSessionConfig, supplierId: string) {
    const res = await procurementRequest<{
      success: boolean;
      data: { openingBalance: number; closingBalance: number; entries: SupplierStatementEntry[] };
    }>(session, `/api/v1/suppliers/${supplierId}/statement`);
    return res.data;
  },

  async listPurchaseOrders(session: ApiSessionConfig, status?: PurchaseOrderStatus) {
    const qs = status ? `?status=${status}` : '';
    const res = await procurementRequest<{ success: boolean; data: { purchaseOrders: PurchaseOrder[] } }>(
      session,
      `/api/v1/purchase-orders${qs}`
    );
    return res.data.purchaseOrders;
  },

  async createPurchaseOrder(session: ApiSessionConfig, payload: Record<string, unknown>) {
    const res = await procurementRequest<{ success: boolean; data: { purchaseOrder: PurchaseOrder } }>(
      session,
      '/api/v1/purchase-orders',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return res.data.purchaseOrder;
  },

  async approvePurchaseOrder(session: ApiSessionConfig, poId: string) {
    const res = await procurementRequest<{ success: boolean; data: { purchaseOrder: PurchaseOrder } }>(
      session,
      `/api/v1/purchase-orders/${poId}/approve`,
      { method: 'POST' }
    );
    return res.data.purchaseOrder;
  },

  async cancelPurchaseOrder(session: ApiSessionConfig, poId: string, reason: string) {
    const res = await procurementRequest<{ success: boolean; data: { purchaseOrder: PurchaseOrder } }>(
      session,
      `/api/v1/purchase-orders/${poId}/cancel`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    );
    return res.data.purchaseOrder;
  },

  async listGrns(session: ApiSessionConfig) {
    const res = await procurementRequest<{ success: boolean; data: { goodsReceipts: GoodsReceiptNote[] } }>(
      session,
      '/api/v1/goods-receipts'
    );
    return res.data.goodsReceipts;
  },

  async postGrn(session: ApiSessionConfig, payload: Record<string, unknown>) {
    const res = await procurementRequest<{
      success: boolean;
      data: { grn: GoodsReceiptNote; purchaseOrder?: PurchaseOrder; invoice?: SupplierInvoice };
    }>(session, '/api/v1/goods-receipts', {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey: generateIdempotencyKey('grn'),
    });
    return res.data;
  },

  async reverseGrn(session: ApiSessionConfig, grnId: string, reason: string) {
    const res = await procurementRequest<{ success: boolean; data: { grn: GoodsReceiptNote } }>(
      session,
      `/api/v1/goods-receipts/${grnId}/reverse`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    );
    return res.data.grn;
  },

  async listSupplierInvoices(session: ApiSessionConfig, supplierId?: string) {
    const qs = supplierId ? `?supplierId=${supplierId}` : '';
    const res = await procurementRequest<{ success: boolean; data: { invoices: SupplierInvoice[] } }>(
      session,
      `/api/v1/supplier-invoices${qs}`
    );
    return res.data.invoices;
  },

  async createSupplierInvoice(session: ApiSessionConfig, payload: Record<string, unknown>) {
    const res = await procurementRequest<{ success: boolean; data: { invoice: SupplierInvoice } }>(
      session,
      '/api/v1/supplier-invoices',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return res.data.invoice;
  },

  async listSupplierPayments(session: ApiSessionConfig, supplierId?: string) {
    const qs = supplierId ? `?supplierId=${supplierId}` : '';
    const res = await procurementRequest<{ success: boolean; data: { payments: SupplierPayment[] } }>(
      session,
      `/api/v1/supplier-payments${qs}`
    );
    return res.data.payments;
  },

  async recordSupplierPayment(
    session: ApiSessionConfig,
    payload: {
      supplierId: string;
      paymentMode: SupplierPaymentMode;
      amount: number;
      referenceNumber?: string;
      notes?: string;
      allocations?: Array<{ invoiceId: string; amount: number }>;
      allowAdvance?: boolean;
    }
  ) {
    const res = await procurementRequest<{
      success: boolean;
      data: { payment: SupplierPayment; supplier: any };
    }>(session, '/api/v1/supplier-payments', {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey: generateIdempotencyKey('spay'),
    });
    return { payment: res.data.payment, supplier: mapApiSupplierToUi(res.data.supplier) };
  },

  async listSupplierReturns(session: ApiSessionConfig) {
    const res = await procurementRequest<{ success: boolean; data: { returns: SupplierReturn[] } }>(
      session,
      '/api/v1/supplier-returns'
    );
    return res.data.returns;
  },

  async createSupplierReturn(session: ApiSessionConfig, payload: Record<string, unknown>) {
    const res = await procurementRequest<{ success: boolean; data: { supplierReturn: SupplierReturn } }>(
      session,
      '/api/v1/supplier-returns',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        idempotencyKey: generateIdempotencyKey('sret'),
      }
    );
    return res.data.supplierReturn;
  },

  async getProcurementReports(session: ApiSessionConfig) {
    const res = await procurementRequest<{ success: boolean; data: any }>(
      session,
      '/api/v1/procurement/reports'
    );
    return res.data;
  },
};

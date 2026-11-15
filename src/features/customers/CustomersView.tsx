/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Search,
  Plus,
  Stethoscope,
  IndianRupee,
  BarChart3,
  LayoutDashboard,
  AlertTriangle,
  RefreshCw,
  KeyRound,
  X,
  ShieldAlert,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import {
  CustomerAccount,
  CustomerType,
  CustomerStatus,
  CreditSummaryDashboard,
  OutstandingReport,
  OverdueReport,
} from '../../types/pharmacy.ts';
import {
  customerApi,
  ApiClientError,
  BackendInvoiceRecord,
} from '../../lib/customerApi.ts';
import {
  formatINR,
  localCustomerToAccount,
  buildLocalReports,
  computeDaysOverdue,
  maskPhone,
} from './customerHelpers.ts';
import { CustomerFormModal } from './CustomerFormModal.tsx';
import { CustomerProfileView } from './CustomerProfileView.tsx';
import { CollectKhataPaymentModal } from './KhataModals.tsx';

type CustomersModuleTab = 'overview' | 'directory' | 'reports';

export const CustomersView: React.FC = () => {
  const {
    apiSession,
    setApiSession,
    store,
    customers,
    bills,
    customerPayments,
    hasUserPermission,
  } = usePharmacy();

  const isLiveApi = Boolean(apiSession.bearerToken);

  const canView = hasUserPermission('customers.view');
  const canCreate = hasUserPermission('customers.create');
  const canViewPhone = hasUserPermission('customers.view_phone');
  const canViewKhata = hasUserPermission('customers.khata_view');
  const canCollectKhata =
    hasUserPermission('customers.khata_collect') || hasUserPermission('customers.khata_settle');
  const canViewReports = hasUserPermission('customers.reports_view');

  const [activeTab, setActiveTab] = useState<CustomersModuleTab>('directory');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<CustomerType | ''>('');
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | ''>('');
  const [hasOutstandingOnly, setHasOutstandingOnly] = useState(false);
  const [overLimitOnly, setOverLimitOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);

  // Live API states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [apiCustomers, setApiCustomers] = useState<CustomerAccount[]>([]);
  const [apiTotalCount, setApiTotalCount] = useState(0);
  const [apiSummary, setApiSummary] = useState<CreditSummaryDashboard | null>(null);
  const [apiOutstanding, setApiOutstanding] = useState<OutstandingReport | null>(null);
  const [apiOverdue, setApiOverdue] = useState<OverdueReport | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [collectingTarget, setCollectingTarget] = useState<CustomerAccount | null>(null);
  const [collectingInvoices, setCollectingInvoices] = useState<BackendInvoiceRecord[]>([]);

  // Live API Session modal
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState(apiSession.bearerToken || '');
  const [tenantInput, setTenantInput] = useState(apiSession.tenantId || store.id);
  const [branchInput, setBranchInput] = useState(apiSession.branchId || 'main');

  const fetchLiveData = useCallback(async () => {
    if (!isLiveApi || !canView) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const tasks: Promise<void>[] = [
        customerApi
          .listCustomers(apiSession, {
            search: search.trim() || undefined,
            customerType: typeFilter || undefined,
            status: statusFilter || undefined,
            includeArchived,
            hasOutstanding: hasOutstandingOnly || undefined,
            overLimit: overLimitOnly || undefined,
            overdue: overdueOnly || undefined,
            page,
            limit: 25,
          })
          .then(res => {
            setApiCustomers(res.customers);
            setApiTotalCount(res.pagination.totalCount);
          }),
      ];

      if (canViewReports) {
        tasks.push(
          customerApi.getCreditSummaryDashboard(apiSession).then(setApiSummary),
          customerApi.getOutstandingReport(apiSession).then(setApiOutstanding),
          customerApi.getOverdueReport(apiSession).then(setApiOverdue)
        );
      }

      await Promise.all(tasks);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiClientError
          ? `${err.title}: ${err.detail}`
          : 'Failed to load customers from Express backend'
      );
    } finally {
      setLoading(false);
    }
  }, [
    isLiveApi,
    canView,
    canViewReports,
    apiSession,
    search,
    typeFilter,
    statusFilter,
    includeArchived,
    hasOutstandingOnly,
    overLimitOnly,
    overdueOnly,
    page,
  ]);

  useEffect(() => {
    fetchLiveData();
  }, [fetchLiveData]);

  // Preview mode computed state
  const localReports = useMemo(
    () =>
      buildLocalReports(
        customers,
        bills,
        customerPayments,
        store.id,
        canViewPhone,
        canViewKhata
      ),
    [customers, bills, customerPayments, store.id, canViewPhone, canViewKhata]
  );

  const overdueCustomerIdSet = useMemo(() => {
    const set = new Set<string>();
    for (const b of bills) {
      if (b.customerId && b.status !== 'cancelled' && b.status !== 'returned' && computeDaysOverdue(b.dueDate, b.balanceDue) > 0) {
        set.add(b.customerId);
      }
    }
    return set;
  }, [bills]);

  const localDirectoryRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .filter(c => (includeArchived ? true : !c.isArchived))
      .filter(c => {
        if (q) {
          const matches =
            c.name.toLowerCase().includes(q) ||
            c.phone.toLowerCase().includes(q) ||
            (c.doctorName && c.doctorName.toLowerCase().includes(q));
          if (!matches) return false;
        }
        if (typeFilter && (c.customerType || 'REGULAR') !== typeFilter) return false;
        if (statusFilter && (c.status || 'ACTIVE') !== statusFilter) return false;
        if (hasOutstandingOnly && c.khataBalance <= 0) return false;
        if (overLimitOnly && !((c.creditLimit ?? 0) > 0 && c.khataBalance > (c.creditLimit ?? 0)))
          return false;
        if (overdueOnly && !overdueCustomerIdSet.has(c.id)) return false;
        return true;
      })
      .map(c => localCustomerToAccount(c, store.id, canViewPhone, canViewKhata));
  }, [
    customers,
    includeArchived,
    search,
    typeFilter,
    statusFilter,
    hasOutstandingOnly,
    overLimitOnly,
    overdueOnly,
    overdueCustomerIdSet,
    store.id,
    canViewPhone,
    canViewKhata,
  ]);

  const directoryRows = isLiveApi ? apiCustomers : localDirectoryRows;
  const totalCount = isLiveApi ? apiTotalCount : localDirectoryRows.length;
  const summary = isLiveApi ? apiSummary : localReports.summary;
  const outstandingReport = isLiveApi ? apiOutstanding : localReports.outstanding;
  const overdueReport = isLiveApi ? apiOverdue : localReports.overdue;

  const handleOpenQuickCollect = async (account: CustomerAccount) => {
    setCollectingTarget(account);
    if (isLiveApi) {
      try {
        const hist = await customerApi.getCustomerPurchases(apiSession, account.id, { limit: 30 });
        setCollectingInvoices(hist.invoices.filter(i => i.balanceDue > 0 && i.status !== 'cancelled'));
      } catch {
        setCollectingInvoices([]);
      }
    } else {
      const localInv: BackendInvoiceRecord[] = bills
        .filter(b => b.customerId === account.id && b.balanceDue > 0 && b.status !== 'cancelled')
        .map(b => ({
          id: b.id,
          invoiceNumber: b.invoiceNumber,
          branchId: b.branchId || 'main',
          customerId: b.customerId,
          customer: { name: b.customerName, phone: canViewPhone ? b.customerPhone : maskPhone(b.customerPhone) },
          items: [],
          subtotal: b.subtotal,
          totalDiscount: b.totalDiscount,
          taxableAmount: b.taxableAmount,
          cgst: b.cgst,
          sgst: b.sgst,
          igst: b.igst || 0,
          roundOff: b.roundOff,
          grandTotal: b.grandTotal,
          amountPaid: b.amountPaid,
          khataCreditAmount: b.khataCreditAmount,
          balanceDue: b.balanceDue,
          dueDate: b.dueDate,
          paymentStatus: b.paymentStatus || 'partial',
          status: 'completed',
          createdAt: b.timestamp,
        }));
      setCollectingInvoices(localInv);
    }
  };

  if (!canView) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center space-y-2">
        <ShieldAlert className="w-8 h-8 text-amber-600 mx-auto" />
        <h2 className="text-base font-bold text-slate-900">Restricted Module</h2>
        <p className="text-xs text-slate-500">
          Your active role does not hold <code>customers.view</code> permission.
        </p>
      </div>
    );
  }

  if (selectedCustomerId) {
    return (
      <CustomerProfileView
        customerId={selectedCustomerId}
        onBack={() => setSelectedCustomerId(null)}
        onDirectoryChanged={fetchLiveData}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Customers & Khata Credit Ledger
            </h1>
            <span className="text-xs font-mono text-slate-500">
              · {totalCount} account(s) · {isLiveApi ? 'Cloud Firestore API' : 'Interactive Preview'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Double-entry customer Khata balances, credit limits, FIFO settlements, overdue aging & GST statements
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsSessionModalOpen(true)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border inline-flex items-center gap-1.5 ${
              isLiveApi
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{isLiveApi ? 'API Connected' : 'Connect Live API'}</span>
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Customer</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
              activeTab === 'directory'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Customer Directory</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Credit Overview</span>
          </button>

          {canViewReports && (
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                activeTab === 'reports'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Outstanding & Aging</span>
            </button>
          )}
        </div>

        {isLiveApi && (
          <button
            type="button"
            onClick={fetchLiveData}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg(null)} className="font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & CREDIT DASHBOARD */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total Khata Receivables
              </span>
              <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                {canViewKhata ? formatINR(summary.kpis.totalKhataOutstanding) : 'Redacted'}
              </div>
              <span className="text-[11px] text-slate-500 block mt-1">
                {summary.kpis.activeCreditAccounts} active credit accounts
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Overdue Receivables
              </span>
              <div className="text-2xl font-bold font-mono tabular-nums text-red-700 mt-1">
                {canViewKhata ? formatINR(summary.kpis.overdueTotalAmount) : 'Redacted'}
              </div>
              <span className="text-[11px] text-slate-500 block mt-1">
                {summary.kpis.overdueAccountsCount} account(s) past due date
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Advance Credit Pool
              </span>
              <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-1">
                {canViewKhata ? formatINR(summary.kpis.totalAdvanceBalance) : 'Redacted'}
              </div>
              <span className="text-[11px] text-slate-500 block mt-1">
                Available for automatic POS offset
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Risk & Limit Flags
              </span>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {summary.kpis.overLimitAccountsCount} / {summary.kpis.blockedAccountsCount}
              </div>
              <span className="text-[11px] text-slate-500 block mt-1">
                Over credit limit / Blocked accounts
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Highest Outstanding Customers */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Highest Outstanding Khata Accounts
                </h3>
              </div>
              {summary.highestOutstandingCustomers.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  All customer accounts are settled.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {summary.highestOutstandingCustomers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCustomerId(c.id)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {c.phone} · {c.customerType}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div className="font-bold text-amber-700">
                          {formatINR(c.currentOutstandingBalance)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Limit: {formatINR(c.creditLimit)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Credit Sales */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Recent Credit Invoices
                </h3>
              </div>
              {summary.recentCreditSales.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No credit sales recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {summary.recentCreditSales.map(sale => (
                    <div
                      key={sale.invoiceId}
                      className="px-4 py-3 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-mono font-semibold text-slate-900">
                          {sale.invoiceNumber} ·{' '}
                          <span className="font-sans font-semibold">{sale.customerName}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {sale.createdAt.slice(0, 10)}
                          {sale.dueDate ? ` · Due ${sale.dueDate.slice(0, 10)}` : ''}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div className="font-bold text-slate-900">{formatINR(sale.grandTotal)}</div>
                        <div className={`text-[11px] ${sale.balanceDue > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          Due: {formatINR(sale.balanceDue)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Khata Payments */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Recent Khata Collections
              </h3>
            </div>
            {summary.recentPayments.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No Khata collections posted yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/40 text-slate-600 font-semibold">
                      <th className="py-2 px-4">Receipt #</th>
                      <th className="py-2 px-4">Customer</th>
                      <th className="py-2 px-4">Mode</th>
                      <th className="py-2 px-4 text-right font-mono">Amount</th>
                      <th className="py-2 px-4 font-mono">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.recentPayments.map(p => (
                      <tr key={p.id}>
                        <td className="py-2 px-4 font-mono font-semibold text-slate-900">
                          {p.receiptNumber}
                        </td>
                        <td className="py-2 px-4 font-medium text-slate-800">{p.customerName}</td>
                        <td className="py-2 px-4 uppercase text-slate-600">
                          {p.paymentMode.replace('_', ' ')}
                        </td>
                        <td className="py-2 px-4 text-right font-mono tabular-nums font-bold text-emerald-700">
                          {formatINR(p.amount)}
                        </td>
                        <td className="py-2 px-4 font-mono text-slate-500">
                          {p.paymentDate.slice(0, 10)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CUSTOMER DIRECTORY */}
      {/* ========================================================================= */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              <div className="relative md:col-span-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by customer name, mobile number, or prescribing doctor..."
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <select
                value={typeFilter}
                onChange={e => {
                  setTypeFilter(e.target.value as CustomerType | '');
                  setPage(1);
                }}
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">All Categories</option>
                <option value="REGULAR">Regular Patient</option>
                <option value="CHRONIC">Chronic Care</option>
                <option value="SENIOR_CITIZEN">Senior Citizen</option>
                <option value="VIP">VIP</option>
                <option value="CLINIC">Clinic / Doctor</option>
                <option value="CORPORATE">Corporate</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => {
                  setStatusFilter(e.target.value as CustomerStatus | '');
                  setPage(1);
                }}
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="BLOCKED">Blocked</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-700 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasOutstandingOnly}
                  onChange={e => setHasOutstandingOnly(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Has Khata Due</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overLimitOnly}
                  onChange={e => setOverLimitOnly(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Over Credit Limit</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={e => setOverdueOnly(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Overdue Invoices</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={e => setIncludeArchived(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Include Archived</span>
              </label>
            </div>
          </div>

          {/* Directory Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {loading && directoryRows.length === 0 ? (
              <div className="p-8 space-y-3">
                <div className="h-8 bg-slate-100 rounded" />
                <div className="h-8 bg-slate-100 rounded" />
                <div className="h-8 bg-slate-100 rounded" />
              </div>
            ) : directoryRows.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Users className="w-9 h-9 mx-auto text-slate-300" />
                <h3 className="text-sm font-bold text-slate-800">No customers match these filters</h3>
                <p className="text-xs text-slate-500">
                  Adjust search parameters or register a new customer account.
                </p>
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold"
                  >
                    + Register Customer
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold">
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4 font-mono">Mobile</th>
                      <th className="py-3 px-4">Doctor / Category</th>
                      <th className="py-3 px-4 text-right font-mono">Total Billed</th>
                      <th className="py-3 px-4 text-right font-mono">Credit Limit</th>
                      <th className="py-3 px-4 text-right font-mono">Khata Due</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {directoryRows.map(acc => {
                      const due = acc.currentOutstandingBalance ?? 0;
                      const limit = acc.creditLimit ?? 0;
                      const isOver = limit > 0 && due > limit;
                      return (
                        <tr
                          key={acc.id}
                          onClick={() => setSelectedCustomerId(acc.id)}
                          className="hover:bg-slate-50/70 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{acc.name}</div>
                            {acc.address && (
                              <div className="text-[11px] text-slate-500 truncate max-w-xs">
                                {acc.address}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                            {acc.phone}
                          </td>

                          <td className="py-3 px-4">
                            <div className="text-slate-800 flex items-center gap-1">
                              {acc.preferredDoctorName ? (
                                <>
                                  <Stethoscope className="w-3 h-3 text-blue-600 shrink-0" />
                                  <span className="truncate max-w-[160px]">{acc.preferredDoctorName}</span>
                                </>
                              ) : (
                                <span className="text-slate-400">Walk-in / OTC</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {acc.customerType} · {acc.totalVisits} visit(s)
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                            {formatINR(acc.totalPurchases)}
                          </td>

                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                            {canViewKhata
                              ? acc.creditEnabled
                                ? formatINR(limit)
                                : 'Disabled'
                              : '—'}
                          </td>

                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {!canViewKhata ? (
                              <span className="text-slate-400">—</span>
                            ) : due > 0 ? (
                              <div>
                                <span className={`font-bold ${isOver ? 'text-red-700' : 'text-amber-700'}`}>
                                  {formatINR(due)}
                                </span>
                                {isOver && (
                                  <span className="block text-[10px] font-sans font-semibold text-red-700">
                                    Over Limit
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-emerald-700 font-semibold">₹0.00</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-[11px] font-semibold">
                            <span
                              className={
                                acc.isArchived
                                  ? 'text-slate-400'
                                  : acc.status === 'ACTIVE'
                                  ? 'text-emerald-700'
                                  : acc.status === 'BLOCKED'
                                  ? 'text-red-700'
                                  : 'text-slate-600'
                              }
                            >
                              {acc.isArchived ? 'ARCHIVED' : acc.status}
                            </span>
                          </td>

                          <td
                            className="py-3 px-4 text-right space-x-2"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedCustomerId(acc.id)}
                              className="text-blue-700 hover:underline font-semibold"
                            >
                              Open
                            </button>
                            {canCollectKhata && canViewKhata && due > 0 && !acc.isArchived && (
                              <button
                                type="button"
                                onClick={() => handleOpenQuickCollect(acc)}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                              >
                                <IndianRupee className="w-3 h-3" />
                                <span>Collect</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: OUTSTANDING & OVERDUE AGING REPORTS */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && canViewReports && overdueReport && outstandingReport && (
        <div className="space-y-4">
          {/* Aging Bucket Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                Not Yet Due
              </span>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatINR(overdueReport.agingSummary.notYetDueAmount)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                Due Today
              </span>
              <div className="text-lg font-bold font-mono tabular-nums text-blue-700 mt-1">
                {formatINR(overdueReport.agingSummary.dueTodayAmount)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-amber-700 uppercase block">
                1–15 Days Overdue
              </span>
              <div className="text-lg font-bold font-mono tabular-nums text-amber-700 mt-1">
                {formatINR(overdueReport.agingSummary.bucket1To15Days)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-orange-700 uppercase block">
                16–30 Days Overdue
              </span>
              <div className="text-lg font-bold font-mono tabular-nums text-orange-700 mt-1">
                {formatINR(overdueReport.agingSummary.bucket16To30Days)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-red-700 uppercase block">
                &gt; 30 Days Overdue
              </span>
              <div className="text-lg font-bold font-mono tabular-nums text-red-700 mt-1">
                {formatINR(overdueReport.agingSummary.bucketOver30Days)}
              </div>
            </div>
          </div>

          {/* Overdue Invoices Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Overdue Credit Invoices ({overdueReport.overdueInvoices.length})
              </h3>
              <span className="text-xs font-mono tabular-nums font-bold text-red-700">
                Total Overdue: {formatINR(overdueReport.agingSummary.totalOverdueAmount)}
              </span>
            </div>

            {overdueReport.overdueInvoices.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No overdue credit invoices found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/40 text-slate-600 font-semibold">
                      <th className="py-2.5 px-4">Invoice #</th>
                      <th className="py-2.5 px-4">Customer</th>
                      <th className="py-2.5 px-4 font-mono">Due Date</th>
                      <th className="py-2.5 px-4 font-mono text-center">Overdue</th>
                      <th className="py-2.5 px-4 text-right font-mono">Invoice Total</th>
                      <th className="py-2.5 px-4 text-right font-mono">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overdueReport.overdueInvoices.map(row => (
                      <tr
                        key={row.invoiceId}
                        onClick={() => row.customerId && setSelectedCustomerId(row.customerId)}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                          {row.invoiceNumber}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900">{row.customerName}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {row.customerPhone}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">
                          {row.dueDate.slice(0, 10)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-center font-bold text-red-700">
                          {row.daysOverdue}d
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {formatINR(row.grandTotal)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-red-700">
                          {formatINR(row.balanceDue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Customer Receivables Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Customer Receivables Register ({outstandingReport.customers.length})
              </h3>
              <span className="text-xs font-mono tabular-nums font-bold text-amber-700">
                Net Outstanding: {formatINR(outstandingReport.totals.totalOutstanding)}
              </span>
            </div>

            {outstandingReport.customers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No outstanding customer receivables.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/40 text-slate-600 font-semibold">
                      <th className="py-2.5 px-4">Customer</th>
                      <th className="py-2.5 px-4 text-right font-mono">Credit Limit</th>
                      <th className="py-2.5 px-4 text-right font-mono">Outstanding</th>
                      <th className="py-2.5 px-4 text-right font-mono">Overdue</th>
                      <th className="py-2.5 px-4 text-right font-mono">Advance</th>
                      <th className="py-2.5 px-4 text-center font-mono">Open Bills</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outstandingReport.customers.map(r => (
                      <tr
                        key={r.customerId}
                        onClick={() => setSelectedCustomerId(r.customerId)}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900">{r.name}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {r.phone} · {r.customerType}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {formatINR(r.creditLimit)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-amber-700">
                          {formatINR(r.currentOutstandingBalance)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-red-700">
                          {r.overdueAmount > 0 ? formatINR(r.overdueAmount) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-blue-700">
                          {r.advanceBalance > 0 ? formatINR(r.advanceBalance) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono tabular-nums">
                          {r.unpaidInvoiceCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <CustomerFormModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSaved={acc => {
          fetchLiveData();
          setSelectedCustomerId(acc.id);
        }}
      />

      {collectingTarget && (
        <CollectKhataPaymentModal
          isOpen={Boolean(collectingTarget)}
          onClose={() => setCollectingTarget(null)}
          customer={collectingTarget}
          unpaidInvoices={collectingInvoices}
          onSuccess={fetchLiveData}
        />
      )}

      {/* Live Cloud API Session Modal */}
      {isSessionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Express / Cloud Firestore API Session
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSessionModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                setApiSession({
                  bearerToken: tokenInput.trim() || null,
                  tenantId: tenantInput.trim() || store.id,
                  branchId: branchInput.trim() || 'main',
                });
                setIsSessionModalOpen(false);
              }}
              className="p-6 space-y-3 text-xs"
            >
              <p className="text-slate-600">
                Provide a Firebase ID Bearer Token to switch this workspace from interactive preview to live Cloud Firestore persistence via <code>/api/v1</code>.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Firebase Auth Bearer Token
                </label>
                <textarea
                  rows={3}
                  placeholder="eyJhbGciOiJSUzI1NiIs..."
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  className="w-full px-3 py-2 font-mono text-[11px] border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Tenant ID
                  </label>
                  <input
                    type="text"
                    value={tenantInput}
                    onChange={e => setTenantInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Branch ID
                  </label>
                  <input
                    type="text"
                    value={branchInput}
                    onChange={e => setBranchInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setTokenInput('');
                    setApiSession({ bearerToken: null });
                    setIsSessionModalOpen(false);
                  }}
                  className="text-red-700 hover:underline font-semibold"
                >
                  Disconnect to Preview
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSessionModalOpen(false)}
                    className="px-3 py-2 text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
                  >
                    Apply Session
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

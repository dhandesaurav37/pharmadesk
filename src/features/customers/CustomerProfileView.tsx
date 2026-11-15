/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  Phone,
  Stethoscope,
  IndianRupee,
  Edit3,
  ShieldCheck,
  FileMinus,
  SlidersHorizontal,
  Archive,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Download,
  MessageSquareShare,
  RefreshCw,
  FileText,
  Receipt,
  BookOpen,
  CreditCard,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import {
  BillInvoice,
  CustomerAccount,
  CustomerLedgerEntry,
  CustomerPayment,
  CustomerReconciliation,
  CustomerStatement,
} from '../../types/pharmacy.ts';
import {
  customerApi,
  ApiClientError,
  BackendInvoiceRecord,
} from '../../lib/customerApi.ts';
import {
  formatINR,
  computeDaysOverdue,
  localCustomerToAccount,
  reconcileLocalCustomerLedger,
  buildLocalCustomerStatement,
  downloadBase64File,
  downloadStatementCsvLocally,
  maskPhone,
} from './customerHelpers.ts';
import { CustomerFormModal } from './CustomerFormModal.tsx';
import {
  CollectKhataPaymentModal,
  CreditLimitModal,
  CreditNoteModal,
  BalanceAdjustmentModal,
  WhatsAppShareModal,
  StatusArchiveConfirmModal,
} from './KhataModals.tsx';

interface CustomerProfileViewProps {
  customerId: string;
  onBack: () => void;
  onDirectoryChanged?: () => void;
}

type ProfileTab = 'purchases' | 'ledger' | 'payments' | 'statement';

export const CustomerProfileView: React.FC<CustomerProfileViewProps> = ({
  customerId,
  onBack,
  onDirectoryChanged,
}) => {
  const {
    apiSession,
    store,
    customers,
    bills,
    customerLedgerEntries,
    customerPayments,
    hasUserPermission,
    setPrintInvoiceData,
  } = usePharmacy();

  const isLiveApi = Boolean(apiSession.bearerToken);

  const canViewPhone = hasUserPermission('customers.view_phone');
  const canUpdate = hasUserPermission('customers.update');
  const canArchive = hasUserPermission('customers.archive');
  const canViewPurchases = hasUserPermission('customers.view_purchase_history');
  const canViewKhata = hasUserPermission('customers.khata_view');
  const canCollectKhata =
    hasUserPermission('customers.khata_collect') || hasUserPermission('customers.khata_settle');
  const canManageLimit = hasUserPermission('customers.credit_limit_manage');
  const canIssueCreditNote = hasUserPermission('customers.credit_note');
  const canAdjustBalance = hasUserPermission('customers.balance_adjust');
  const canViewStatement = hasUserPermission('customers.statement_view');
  const canExportStatement = hasUserPermission('customers.statement_export');
  const canShareStatement = hasUserPermission('customers.statement_share');

  const defaultTab: ProfileTab = canViewPurchases
    ? 'purchases'
    : canViewKhata
    ? 'ledger'
    : 'statement';

  const [activeTab, setActiveTab] = useState<ProfileTab>(defaultTab);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Live API states
  const [apiAccount, setApiAccount] = useState<CustomerAccount | null>(null);
  const [apiPurchases, setApiPurchases] = useState<BackendInvoiceRecord[]>([]);
  const [apiLedger, setApiLedger] = useState<CustomerLedgerEntry[]>([]);
  const [apiPayments, setApiPayments] = useState<CustomerPayment[]>([]);
  const [apiReconciliation, setApiReconciliation] = useState<CustomerReconciliation | null>(null);
  const [apiStatement, setApiStatement] = useState<CustomerStatement | null>(null);

  // Filters
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchasePaymentFilter, setPurchasePaymentFilter] = useState('');
  const [purchasePage, setPurchasePage] = useState(1);
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'pdf' | null>(null);

  // Modals
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCollectOpen, setIsCollectOpen] = useState(false);
  const [isLimitOpen, setIsLimitOpen] = useState(false);
  const [isCreditNoteOpen, setIsCreditNoteOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [statusModalMode, setStatusModalMode] = useState<'status' | 'archive' | null>(null);

  const loadLiveProfile = useCallback(async () => {
    if (!isLiveApi) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const cust = await customerApi.getCustomer(apiSession, customerId);
      setApiAccount(cust);

      const tasks: Promise<void>[] = [];
      if (canViewPurchases) {
        tasks.push(
          customerApi
            .getCustomerPurchases(apiSession, customerId, { limit: 50 })
            .then(res => setApiPurchases(res.invoices))
        );
      }
      if (canViewKhata) {
        tasks.push(
          customerApi
            .getCustomerLedger(apiSession, customerId, { limit: 100 })
            .then(res => setApiLedger(res.entries)),
          customerApi
            .listCustomerPayments(apiSession, customerId)
            .then(res => setApiPayments(res)),
          customerApi
            .reconcileCustomerBalance(apiSession, customerId)
            .then(res => setApiReconciliation(res))
        );
      }
      if (canViewStatement) {
        tasks.push(
          customerApi
            .getCustomerStatement(apiSession, customerId, {
              dateFrom: statementFrom || undefined,
              dateTo: statementTo || undefined,
            })
            .then(res => setApiStatement(res))
        );
      }

      await Promise.all(tasks);
    } catch (err) {
      setErrorMsg(err instanceof ApiClientError ? err.detail : 'Unable to load customer profile');
    } finally {
      setLoading(false);
    }
  }, [
    isLiveApi,
    apiSession,
    customerId,
    canViewPurchases,
    canViewKhata,
    canViewStatement,
    statementFrom,
    statementTo,
  ]);

  useEffect(() => {
    loadLiveProfile();
  }, [loadLiveProfile]);

  const localCustomer = useMemo(
    () => customers.find(c => c.id === customerId) || null,
    [customers, customerId]
  );

  const account: CustomerAccount | null = useMemo(() => {
    if (isLiveApi) return apiAccount;
    if (!localCustomer) return null;
    return localCustomerToAccount(localCustomer, store.id, canViewPhone, canViewKhata);
  }, [isLiveApi, apiAccount, localCustomer, store.id, canViewPhone, canViewKhata]);

  const localPurchases: BackendInvoiceRecord[] = useMemo(() => {
    if (isLiveApi) return apiPurchases;
    return bills
      .filter(b => b.customerId === customerId)
      .map(b => ({
        id: b.id,
        invoiceNumber: b.invoiceNumber,
        branchId: b.branchId || 'main',
        customerId: b.customerId,
        customer: {
          name: b.customerName,
          phone: canViewPhone ? b.customerPhone : maskPhone(b.customerPhone),
          doctorName: b.doctorName,
          doctorRegNumber: b.doctorRegNumber,
        },
        items: b.items.map(i => ({
          batchId: i.batchId,
          batchNumber: i.batchNumber,
          medicineId: i.medicineId,
          medicineName: i.brandName,
          quantity: i.quantity,
          mrp: i.mrp,
          discountPercent: i.discountPercent,
          lineTotal: Math.round(i.mrp * i.quantity * (1 - i.discountPercent / 100) * 100) / 100,
          gstRate: i.gstSlab,
        })),
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
        creditTermsDays: b.creditTermsDays,
        dueDate: b.dueDate,
        paymentStatus: b.paymentStatus || (b.balanceDue > 0 ? 'partial' : 'paid'),
        status:
          b.status === 'cancelled' || b.status === 'returned' || b.status === 'partially_returned'
            ? b.status
            : 'completed',
        createdAt: b.timestamp,
        daysOverdue: computeDaysOverdue(b.dueDate, b.balanceDue),
        isOverdue: computeDaysOverdue(b.dueDate, b.balanceDue) > 0,
      }));
  }, [isLiveApi, apiPurchases, bills, customerId, canViewPhone]);

  const filteredPurchases = useMemo(() => {
    const q = purchaseSearch.trim().toLowerCase();
    return localPurchases.filter(inv => {
      if (purchasePaymentFilter && inv.paymentStatus !== purchasePaymentFilter) return false;
      if (q && !inv.invoiceNumber.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [localPurchases, purchaseSearch, purchasePaymentFilter]);

  const pageSize = 10;
  const totalPurchasePages = Math.max(1, Math.ceil(filteredPurchases.length / pageSize));
  const pagedPurchases = filteredPurchases.slice(
    (purchasePage - 1) * pageSize,
    purchasePage * pageSize
  );

  const ledgerEntries: CustomerLedgerEntry[] = useMemo(() => {
    if (isLiveApi) return apiLedger;
    return customerLedgerEntries
      .filter(e => e.customerId === customerId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [isLiveApi, apiLedger, customerLedgerEntries, customerId]);

  const paymentsList: CustomerPayment[] = useMemo(() => {
    if (isLiveApi) return apiPayments;
    return customerPayments
      .filter(p => p.customerId === customerId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [isLiveApi, apiPayments, customerPayments, customerId]);

  const reconciliation: CustomerReconciliation | null = useMemo(() => {
    if (isLiveApi) return apiReconciliation;
    if (!localCustomer) return null;
    return reconcileLocalCustomerLedger(localCustomer, customerLedgerEntries);
  }, [isLiveApi, apiReconciliation, localCustomer, customerLedgerEntries]);

  const statement: CustomerStatement | null = useMemo(() => {
    if (isLiveApi) return apiStatement;
    if (!account) return null;
    return buildLocalCustomerStatement(account, customerLedgerEntries, statementFrom, statementTo);
  }, [isLiveApi, apiStatement, account, customerLedgerEntries, statementFrom, statementTo]);

  const handleOpenInvoicePreview = (inv: BackendInvoiceRecord) => {
    const localMatch = bills.find(b => b.id === inv.id);
    if (localMatch) {
      setPrintInvoiceData(localMatch);
      return;
    }
    const mapped: BillInvoice = {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      timestamp: inv.createdAt,
      branchId: inv.branchId,
      customerId: inv.customerId,
      customerName: inv.customer.name,
      customerPhone: inv.customer.phone || '',
      doctorName: inv.customer.doctorName,
      doctorRegNumber: inv.customer.doctorRegNumber,
      items: inv.items.map(it => ({
        batchId: it.batchId,
        medicineId: it.medicineId,
        brandName: it.medicineName,
        saltComposition: '',
        batchNumber: it.batchNumber,
        expiryDate: '',
        packSize: '1 Pack',
        mrp: it.mrp,
        discountPercent: it.discountPercent,
        gstSlab: it.gstRate,
        quantity: it.quantity,
        availableStock: it.quantity,
        schedule: 'OTC',
      })),
      subtotal: inv.subtotal,
      totalDiscount: inv.totalDiscount,
      taxableAmount: inv.taxableAmount,
      cgst: inv.cgst,
      sgst: inv.sgst,
      igst: inv.igst,
      roundOff: inv.roundOff,
      grandTotal: inv.grandTotal,
      amountPaid: inv.amountPaid,
      khataCreditAmount: inv.khataCreditAmount,
      balanceDue: inv.balanceDue,
      creditTermsDays: inv.creditTermsDays as 0 | 7 | 15 | 30 | undefined,
      dueDate: inv.dueDate,
      paymentStatus: inv.paymentStatus,
      paymentMode: (inv.khataCreditAmount || 0) > 0 ? 'khata_credit' : 'cash',
      status: inv.status,
      cashierName: 'Counter Staff',
    };
    setPrintInvoiceData(mapped);
  };

  const handleExportStatement = async (format: 'csv' | 'pdf') => {
    if (!statement) return;
    setErrorMsg(null);

    if (isLiveApi) {
      setExportingFormat(format);
      try {
        const res = await customerApi.exportCustomerStatement(apiSession, customerId, {
          format,
          dateFrom: statementFrom || undefined,
          dateTo: statementTo || undefined,
        });
        downloadBase64File(res.contentBase64, res.fileName, res.mimeType);
        setActionMsg(`Exported ${res.fileName} and stored in Firebase Storage (${res.storagePath}).`);
      } catch (err) {
        setErrorMsg(err instanceof ApiClientError ? err.detail : `Failed to export ${format.toUpperCase()}`);
      } finally {
        setExportingFormat(null);
      }
      return;
    }

    if (format === 'csv') {
      downloadStatementCsvLocally(statement);
      setActionMsg('Downloaded Khata statement CSV.');
    } else {
      window.print();
    }
  };

  const handleRefresh = () => {
    if (isLiveApi) loadLiveProfile();
    onDirectoryChanged?.();
  };

  if (loading && !account) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 space-y-4">
        <div className="h-5 w-48 bg-slate-200 rounded" />
        <div className="grid grid-cols-4 gap-4">
          <div className="h-20 bg-slate-100 rounded-xl" />
          <div className="h-20 bg-slate-100 rounded-xl" />
          <div className="h-20 bg-slate-100 rounded-xl" />
          <div className="h-20 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
        <h3 className="text-sm font-bold text-slate-900">Customer Record Unavailable</h3>
        <p className="text-xs text-slate-500">{errorMsg || 'The requested customer record could not be loaded.'}</p>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold"
        >
          Back to Directory
        </button>
      </div>
    );
  }

  const outstanding = account.currentOutstandingBalance ?? 0;
  const advance = account.advanceBalance ?? 0;
  const limit = account.creditLimit ?? 0;
  const availableCredit = Math.max(0, limit - outstanding);
  const utilizationPct = limit > 0 ? Math.min(100, Math.round((outstanding / limit) * 100)) : 0;
  const unpaidInvoices = localPurchases.filter(i => i.status !== 'cancelled' && i.balanceDue > 0);

  return (
    <div className="space-y-4">
      {/* Top Return & Actions Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-5 rounded-xl border border-slate-200">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Customer Directory</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{account.name}</h1>
            <span className="text-xs font-medium text-slate-500">
              · {account.customerType} ·{' '}
              <span
                className={
                  account.status === 'ACTIVE'
                    ? 'text-emerald-700 font-semibold'
                    : account.status === 'BLOCKED'
                    ? 'text-red-700 font-semibold'
                    : 'text-slate-600 font-semibold'
                }
              >
                {account.isArchived ? 'ARCHIVED' : account.status}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              {account.phone}
            </span>
            {account.preferredDoctorName && (
              <span className="inline-flex items-center gap-1">
                <Stethoscope className="w-3.5 h-3.5 text-blue-600" />
                {account.preferredDoctorName}
              </span>
            )}
            {account.gstin && (
              <span className="font-mono text-[11px] text-slate-500">GSTIN: {account.gstin}</span>
            )}
            {account.address && (
              <span className="text-slate-500 truncate max-w-md">{account.address}</span>
            )}
          </div>

          {(account.allergies || account.chronicConditions) && (
            <div className="text-[11px] text-slate-600">
              {account.allergies && (
                <span>
                  <strong className="text-red-700">Allergies:</strong> {account.allergies}
                </span>
              )}
              {account.allergies && account.chronicConditions && <span> · </span>}
              {account.chronicConditions && (
                <span>
                  <strong className="text-slate-800">Chronic Conditions:</strong> {account.chronicConditions}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Audited Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canCollectKhata && !account.isArchived && (
            <button
              type="button"
              onClick={() => setIsCollectOpen(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <IndianRupee className="w-3.5 h-3.5" />
              <span>Collect Payment</span>
            </button>
          )}
          {canUpdate && (
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Profile</span>
            </button>
          )}
          {canManageLimit && !account.isArchived && (
            <button
              type="button"
              onClick={() => setIsLimitOpen(true)}
              className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Credit Policy</span>
            </button>
          )}
          {canIssueCreditNote && !account.isArchived && (
            <button
              type="button"
              onClick={() => setIsCreditNoteOpen(true)}
              className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <FileMinus className="w-3.5 h-3.5 text-purple-700" />
              <span>Credit Note</span>
            </button>
          )}
          {canAdjustBalance && !account.isArchived && (
            <button
              type="button"
              onClick={() => setIsAdjustOpen(true)}
              className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Adjust</span>
            </button>
          )}
          {canUpdate && !account.isArchived && (
            <button
              type="button"
              onClick={() => setStatusModalMode('status')}
              className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Ban className="w-3.5 h-3.5 text-amber-700" />
              <span>{account.status === 'BLOCKED' ? 'Unblock' : 'Status'}</span>
            </button>
          )}
          {canArchive && !account.isArchived && (
            <button
              type="button"
              onClick={() => setStatusModalMode('archive')}
              className="px-3 py-2 border border-red-200 hover:bg-red-50 text-red-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {actionMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
          <span>{actionMsg}</span>
          <button type="button" onClick={() => setActionMsg(null)} className="font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Financial Standing KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Khata Outstanding
          </span>
          <div className={`text-xl font-bold font-mono tabular-nums mt-1 ${outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {canViewKhata ? formatINR(outstanding) : 'Redacted'}
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            {unpaidInvoices.length} unpaid invoice(s)
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Credit Limit & Terms
          </span>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {canViewKhata ? (account.creditEnabled ? formatINR(limit) : 'Disabled') : 'Redacted'}
          </div>
          {canViewKhata && limit > 0 && (
            <div className="mt-1.5 space-y-1">
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${outstanding > limit ? 'bg-red-600' : 'bg-blue-600'}`}
                  style={{ width: `${utilizationPct}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                Avail: {formatINR(availableCredit)} · Net {account.creditTermsDays}d
              </span>
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Advance Credit
          </span>
          <div className="text-xl font-bold font-mono tabular-nums text-blue-700 mt-1">
            {canViewKhata ? formatINR(advance) : 'Redacted'}
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            Auto-applied on next credit bill
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Lifetime Purchases
          </span>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatINR(account.totalPurchases)}
          </div>
          <span className="text-[11px] text-slate-500 font-mono tabular-nums block mt-0.5">
            {account.totalVisits} store visit(s)
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Repaid
          </span>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {canViewKhata ? formatINR(account.totalPayments ?? 0) : 'Redacted'}
          </div>
          <span className="text-[11px] text-slate-500 font-mono block mt-0.5">
            Last pay: {account.lastPaymentDate ? account.lastPaymentDate.slice(0, 10) : '—'}
          </span>
        </div>
      </div>

      {/* Workspace Sub-Navigation */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {canViewPurchases && (
              <button
                type="button"
                onClick={() => setActiveTab('purchases')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                  activeTab === 'purchases'
                    ? 'bg-white text-slate-900 border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Purchase History ({localPurchases.length})</span>
              </button>
            )}
            {canViewKhata && (
              <button
                type="button"
                onClick={() => setActiveTab('ledger')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                  activeTab === 'ledger'
                    ? 'bg-white text-slate-900 border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Khata Ledger ({ledgerEntries.length})</span>
              </button>
            )}
            {canViewKhata && (
              <button
                type="button"
                onClick={() => setActiveTab('payments')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                  activeTab === 'payments'
                    ? 'bg-white text-slate-900 border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Payments ({paymentsList.length})</span>
              </button>
            )}
            {canViewStatement && (
              <button
                type="button"
                onClick={() => setActiveTab('statement')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                  activeTab === 'statement'
                    ? 'bg-white text-slate-900 border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Account Statement</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {/* SUB-TAB 1: PURCHASE HISTORY */}
        {activeTab === 'purchases' && canViewPurchases && (
          <div className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <input
                type="text"
                placeholder="Filter by invoice number..."
                value={purchaseSearch}
                onChange={e => {
                  setPurchaseSearch(e.target.value);
                  setPurchasePage(1);
                }}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg sm:w-64"
              />
              <select
                value={purchasePaymentFilter}
                onChange={e => {
                  setPurchasePaymentFilter(e.target.value);
                  setPurchasePage(1);
                }}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="">All Payment Statuses</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial Due</option>
                <option value="unpaid">Unpaid Credit</option>
              </select>
            </div>

            {pagedPurchases.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                No sales invoices recorded for this customer yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-semibold">
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right font-mono">Total</th>
                      <th className="py-2.5 px-3 text-right font-mono">Paid</th>
                      <th className="py-2.5 px-3 text-right font-mono">Due</th>
                      <th className="py-2.5 px-3">Due Date / Aging</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedPurchases.map(inv => {
                      const daysOver = inv.daysOverdue ?? computeDaysOverdue(inv.dueDate, inv.balanceDue);
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {inv.invoiceNumber}
                            {inv.status !== 'completed' && (
                              <span className="ml-1.5 text-[10px] font-sans uppercase text-slate-500">
                                ({inv.status.replace('_', ' ')})
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {inv.createdAt.slice(0, 10)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                            {formatINR(inv.grandTotal)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700">
                            {formatINR(inv.amountPaid)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                            <span className={inv.balanceDue > 0 ? 'text-amber-700' : 'text-slate-400'}>
                              {formatINR(inv.balanceDue)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px]">
                            {inv.balanceDue > 0 && inv.dueDate ? (
                              daysOver > 0 ? (
                                <span className="text-red-700 font-semibold">
                                  {inv.dueDate.slice(0, 10)} · {daysOver}d overdue
                                </span>
                              ) : (
                                <span className="text-slate-600">{inv.dueDate.slice(0, 10)}</span>
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => handleOpenInvoicePreview(inv)}
                              className="text-blue-700 hover:underline font-semibold"
                            >
                              View Invoice
                            </button>
                            {inv.balanceDue > 0 && canCollectKhata && (
                              <button
                                type="button"
                                onClick={() => setIsCollectOpen(true)}
                                className="text-emerald-700 hover:underline font-semibold"
                              >
                                Collect
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

            {totalPurchasePages > 1 && (
              <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
                <span>
                  Page {purchasePage} of {totalPurchasePages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={purchasePage <= 1}
                    onClick={() => setPurchasePage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 border border-slate-200 rounded disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={purchasePage >= totalPurchasePages}
                    onClick={() => setPurchasePage(p => Math.min(totalPurchasePages, p + 1))}
                    className="px-2.5 py-1 border border-slate-200 rounded disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 2: KHATA LEDGER & RECONCILIATION */}
        {activeTab === 'ledger' && canViewKhata && (
          <div className="p-4 space-y-4">
            {reconciliation && (
              <div
                className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
                  reconciliation.isBalanced
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {reconciliation.isBalanced ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                  )}
                  <span>
                    {reconciliation.isBalanced
                      ? 'Ledger Reconciled (Double-Entry Verified)'
                      : `Reconciliation Discrepancy Detected (${formatINR(reconciliation.discrepancy)})`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-[11px]">
                  <span>Debits: {formatINR(reconciliation.totalDebits)}</span>
                  <span>Credits: {formatINR(reconciliation.totalCredits)}</span>
                  <span>Net Ledger: {formatINR(reconciliation.netLedgerBalance)}</span>
                  <span>Entries: {reconciliation.entryCount}</span>
                </div>
              </div>
            )}

            {ledgerEntries.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                No Khata ledger transactions posted yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-semibold">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Entry Type</th>
                      <th className="py-2.5 px-3 text-right font-mono">Debit (+)</th>
                      <th className="py-2.5 px-3 text-right font-mono">Credit (-)</th>
                      <th className="py-2.5 px-3 text-right font-mono">Running Due</th>
                      <th className="py-2.5 px-3 text-right font-mono">Advance</th>
                      <th className="py-2.5 px-3">Reference / Description</th>
                      <th className="py-2.5 px-3">Performed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledgerEntries.map(entry => (
                      <tr key={entry.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {entry.timestamp.slice(0, 10)}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">
                          {entry.entryType.replace(/_/g, ' ')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-800 font-semibold">
                          {entry.direction === 'DEBIT' ? formatINR(entry.amount) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                          {entry.direction === 'CREDIT' ? formatINR(entry.amount) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {formatINR(entry.runningBalance)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-blue-700">
                          {entry.runningAdvanceBalance > 0
                            ? formatINR(entry.runningAdvanceBalance)
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          <div>{entry.description}</div>
                          {(entry.invoiceNumber || entry.referenceNumber || entry.reason) && (
                            <div className="text-[11px] text-slate-500 font-mono">
                              {[entry.invoiceNumber, entry.referenceNumber, entry.reason]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {entry.performedByName || entry.performedBy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 3: KHATA PAYMENTS */}
        {activeTab === 'payments' && canViewKhata && (
          <div className="p-4 space-y-3">
            {paymentsList.length === 0 ? (
              <div className="py-10 text-center space-y-2 text-xs text-slate-500">
                <p>No Khata repayment receipts recorded for this customer.</p>
                {canCollectKhata && outstanding > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsCollectOpen(true)}
                    className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold"
                  >
                    Collect Outstanding Payment
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-semibold">
                      <th className="py-2.5 px-3">Receipt #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Mode</th>
                      <th className="py-2.5 px-3 text-right font-mono">Amount</th>
                      <th className="py-2.5 px-3 text-right font-mono">To Due</th>
                      <th className="py-2.5 px-3 text-right font-mono">To Advance</th>
                      <th className="py-2.5 px-3">Allocated Invoices</th>
                      <th className="py-2.5 px-3">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paymentsList.map(pay => (
                      <tr key={pay.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {pay.receiptNumber}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {pay.paymentDate.slice(0, 10)}
                        </td>
                        <td className="py-2.5 px-3 uppercase font-semibold text-slate-700">
                          {pay.paymentMode.replace('_', ' ')}
                          {pay.referenceNumber && (
                            <span className="block font-mono text-[10px] text-slate-500">
                              {pay.referenceNumber}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                          {formatINR(pay.amount)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatINR(pay.appliedToBalance)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-blue-700">
                          {pay.addedToAdvance > 0 ? formatINR(pay.addedToAdvance) : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                          {pay.allocations.length > 0
                            ? pay.allocations
                                .map(a => `${a.invoiceNumber} (${formatINR(a.allocatedAmount)})`)
                                .join(', ')
                            : 'General Account'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {pay.recordedByName || pay.recordedBy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 4: ACCOUNT STATEMENT */}
        {activeTab === 'statement' && canViewStatement && (
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={statementFrom}
                    onChange={e => setStatementFrom(e.target.value)}
                    className="px-2.5 py-1.5 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={statementTo}
                    onChange={e => setStatementTo(e.target.value)}
                    className="px-2.5 py-1.5 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Statement</span>
                </button>
                {canExportStatement && (
                  <>
                    <button
                      type="button"
                      disabled={exportingFormat !== null}
                      onClick={() => handleExportStatement('csv')}
                      className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{exportingFormat === 'csv' ? 'Exporting...' : 'Export CSV'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={exportingFormat !== null}
                      onClick={() => handleExportStatement('pdf')}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{exportingFormat === 'pdf' ? 'Exporting...' : 'Export PDF'}</span>
                    </button>
                  </>
                )}
                {canShareStatement && (
                  <button
                    type="button"
                    onClick={() => setIsWhatsAppOpen(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <MessageSquareShare className="w-3.5 h-3.5" />
                    <span>WhatsApp Summary</span>
                  </button>
                )}
              </div>
            </div>

            {statement && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-500 block">Opening Net Balance</span>
                    <span className="font-mono tabular-nums font-bold text-sm text-slate-900">
                      {formatINR(statement.openingBalance)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Period Debits</span>
                    <span className="font-mono tabular-nums font-bold text-sm text-amber-700">
                      +{formatINR(statement.periodDebits)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Period Credits</span>
                    <span className="font-mono tabular-nums font-bold text-sm text-emerald-700">
                      -{formatINR(statement.periodCredits)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Closing Net Balance</span>
                    <span className="font-mono tabular-nums font-bold text-sm text-blue-700">
                      {formatINR(statement.closingBalance)}
                    </span>
                  </div>
                </div>

                {statement.entries.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No statement transactions found in the selected period.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-semibold">
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Particulars</th>
                          <th className="py-2 px-3 text-right font-mono">Debit</th>
                          <th className="py-2 px-3 text-right font-mono">Credit</th>
                          <th className="py-2 px-3 text-right font-mono">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {statement.entries.map(e => (
                          <tr key={e.id}>
                            <td className="py-2 px-3 font-mono text-slate-600">
                              {e.timestamp.slice(0, 10)}
                            </td>
                            <td className="py-2 px-3 text-slate-800">{e.description}</td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-800">
                              {e.direction === 'DEBIT' ? formatINR(e.amount) : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-700">
                              {e.direction === 'CREDIT' ? formatINR(e.amount) : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold">
                              {formatINR(e.runningBalance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <CustomerFormModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        editingCustomer={account}
        onSaved={() => {
          handleRefresh();
          setActionMsg('Customer profile updated.');
        }}
      />

      <CollectKhataPaymentModal
        isOpen={isCollectOpen}
        onClose={() => setIsCollectOpen(false)}
        customer={account}
        unpaidInvoices={unpaidInvoices}
        onSuccess={() => {
          handleRefresh();
          setActionMsg('Khata payment receipt recorded.');
        }}
      />

      <CreditLimitModal
        isOpen={isLimitOpen}
        onClose={() => setIsLimitOpen(false)}
        customer={account}
        onSuccess={() => {
          handleRefresh();
          setActionMsg('Customer credit policy updated.');
        }}
      />

      <CreditNoteModal
        isOpen={isCreditNoteOpen}
        onClose={() => setIsCreditNoteOpen(false)}
        customer={account}
        invoices={localPurchases}
        onSuccess={() => {
          handleRefresh();
          setActionMsg('Credit note posted to Khata ledger.');
        }}
      />

      <BalanceAdjustmentModal
        isOpen={isAdjustOpen}
        onClose={() => setIsAdjustOpen(false)}
        customer={account}
        onSuccess={() => {
          handleRefresh();
          setActionMsg('Audited Khata balance adjustment committed.');
        }}
      />

      <WhatsAppShareModal
        isOpen={isWhatsAppOpen}
        onClose={() => setIsWhatsAppOpen(false)}
        customer={account}
        dateFrom={statementFrom || undefined}
        dateTo={statementTo || undefined}
      />

      <StatusArchiveConfirmModal
        isOpen={statusModalMode !== null}
        onClose={() => setStatusModalMode(null)}
        customer={account}
        mode={statusModalMode || 'status'}
        onSuccess={() => {
          handleRefresh();
          if (statusModalMode === 'archive') {
            onBack();
          } else {
            setActionMsg('Customer account status updated.');
          }
        }}
      />
    </div>
  );
};

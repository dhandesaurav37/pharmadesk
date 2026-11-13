/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import {
  AccountLedgerData,
  accountingApi,
  BalanceSheetData,
  BranchPnlData,
  CashFlowData,
  CashOrBankBookData,
  ChartOfAccount,
  ExpenseSummaryData,
  GstSummaryData,
  JournalEntry,
  ProfitLossData,
  TrialBalanceData,
} from '../../lib/accountingApi.ts';
import {
  buildPreviewJournalsFromOperations,
  computePreviewAccountLedger,
  computePreviewReports,
} from '../accounts/accountingPreviewEngine.ts';

type ReportTab =
  | 'profit_loss'
  | 'branch_pnl'
  | 'balance_sheet'
  | 'trial_balance'
  | 'cash_flow'
  | 'gst_summary'
  | 'cash_bank_books'
  | 'general_ledger'
  | 'expenses';

const formatInr = (value: number): string =>
  `₹${(Number(value) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function triggerCsvDownload(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const ReportsView: React.FC = () => {
  const {
    apiSession,
    hasUserPermission,
    bills,
    inventory,
    goodsReceipts,
    supplierInvoices,
    supplierPayments,
    customers,
    customerPayments,
    suppliers,
    previewAccounts,
    previewExpenses,
    previewManualJournals,
    previewPeriods,
  } = usePharmacy();

  const isLiveApi = Boolean(apiSession.bearerToken);
  const canViewReports = hasUserPermission('accounting.reports.view') || hasUserPermission('accounting.view');
  const canExportReports = hasUserPermission('accounting.reports.export');

  const [activeTab, setActiveTab] = useState<ReportTab>('profit_loss');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [bookMode, setBookMode] = useState<'CASH' | 'BANK'>('CASH');
  const [selectedGlAccountId, setSelectedGlAccountId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live API states
  const [liveAccounts, setLiveAccounts] = useState<ChartOfAccount[]>([]);
  const [liveJournals, setLiveJournals] = useState<JournalEntry[]>([]);
  const [liveTrialBalance, setLiveTrialBalance] = useState<TrialBalanceData | null>(null);
  const [liveProfitLoss, setLiveProfitLoss] = useState<ProfitLossData | null>(null);
  const [liveBranchPnl, setLiveBranchPnl] = useState<BranchPnlData | null>(null);
  const [liveBalanceSheet, setLiveBalanceSheet] = useState<BalanceSheetData | null>(null);
  const [liveCashFlow, setLiveCashFlow] = useState<CashFlowData | null>(null);
  const [liveCashBook, setLiveCashBook] = useState<CashOrBankBookData | null>(null);
  const [liveBankBook, setLiveBankBook] = useState<CashOrBankBookData | null>(null);
  const [liveGstSummary, setLiveGstSummary] = useState<GstSummaryData | null>(null);
  const [liveExpenseSummary, setLiveExpenseSummary] = useState<ExpenseSummaryData | null>(null);
  const [liveAccountLedger, setLiveAccountLedger] = useState<AccountLedgerData | null>(null);

  const loadLiveReports = useCallback(async () => {
    if (!isLiveApi || !canViewReports) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const filters = {
        branchId: branchFilter !== 'ALL' ? branchFilter : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      };
      const [accs, jnls, tb, pl, bpnl, bs, cf, cb, bb, gst, exps] = await Promise.all([
        accountingApi.listAccounts(apiSession, { includeInactive: true }),
        accountingApi.listJournalEntries(apiSession, { ...filters, limit: 300 }),
        accountingApi.getTrialBalance(apiSession, filters),
        accountingApi.getProfitAndLoss(apiSession, filters),
        accountingApi.getBranchPnl(apiSession, { fromDate: filters.fromDate, toDate: filters.toDate }),
        accountingApi.getBalanceSheet(apiSession, { branchId: filters.branchId, asOfDate: asOfDate || undefined }),
        accountingApi.getCashFlow(apiSession, filters),
        accountingApi.getCashBook(apiSession, filters),
        accountingApi.getBankBook(apiSession, filters),
        accountingApi.getGstSummary(apiSession, filters),
        accountingApi.getExpenseSummary(apiSession, filters),
      ]);
      setLiveAccounts(accs);
      setLiveJournals(jnls);
      setLiveTrialBalance(tb);
      setLiveProfitLoss(pl);
      setLiveBranchPnl(bpnl);
      setLiveBalanceSheet(bs);
      setLiveCashFlow(cf);
      setLiveCashBook(cb);
      setLiveBankBook(bb);
      setLiveGstSummary(gst);
      setLiveExpenseSummary(exps);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load financial reports');
    } finally {
      setIsLoading(false);
    }
  }, [isLiveApi, canViewReports, apiSession, branchFilter, fromDate, toDate, asOfDate]);

  useEffect(() => {
    void loadLiveReports();
  }, [loadLiveReports]);

  // Preview Engine Derivation
  const previewJournals = useMemo(
    () =>
      buildPreviewJournalsFromOperations({
        accounts: previewAccounts,
        bills,
        inventory,
        goodsReceipts,
        supplierInvoices,
        supplierPayments,
        customers,
        customerPayments,
        suppliers,
        expenses: previewExpenses,
        manualJournals: previewManualJournals,
      }),
    [
      previewAccounts,
      bills,
      inventory,
      goodsReceipts,
      supplierInvoices,
      supplierPayments,
      customers,
      customerPayments,
      suppliers,
      previewExpenses,
      previewManualJournals,
    ]
  );

  const previewReports = useMemo(
    () =>
      computePreviewReports({
        accounts: previewAccounts,
        journals: previewJournals,
        expenses: previewExpenses,
        periods: previewPeriods,
        customers,
        suppliers,
        inventory,
        branchId: branchFilter,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }),
    [
      previewAccounts,
      previewJournals,
      previewExpenses,
      previewPeriods,
      customers,
      suppliers,
      inventory,
      branchFilter,
      fromDate,
      toDate,
    ]
  );

  const previewBalanceSheet = useMemo(
    () =>
      computePreviewReports({
        accounts: previewAccounts,
        journals: previewJournals,
        expenses: previewExpenses,
        periods: previewPeriods,
        customers,
        suppliers,
        inventory,
        branchId: branchFilter,
        toDate: asOfDate || undefined,
      }).balanceSheet,
    [
      previewAccounts,
      previewJournals,
      previewExpenses,
      previewPeriods,
      customers,
      suppliers,
      inventory,
      branchFilter,
      asOfDate,
    ]
  );

  const accounts = isLiveApi ? liveAccounts : previewAccounts;
  const journals = useMemo(() => {
    const base = isLiveApi ? liveJournals : previewJournals;
    return base.filter((j) => {
      if (branchFilter !== 'ALL' && j.branchId !== branchFilter) return false;
      if (fromDate && j.transactionDate < fromDate) return false;
      if (toDate && j.transactionDate > toDate) return false;
      return true;
    });
  }, [isLiveApi, liveJournals, previewJournals, branchFilter, fromDate, toDate]);

  useEffect(() => {
    if (!selectedGlAccountId && accounts.length > 0) {
      setSelectedGlAccountId(accounts[0].id);
    }
  }, [accounts, selectedGlAccountId]);

  // Fetch single account ledger in live API mode when selected in General Ledger tab
  useEffect(() => {
    if (!isLiveApi || activeTab !== 'general_ledger' || !selectedGlAccountId || selectedGlAccountId === 'ALL') {
      setLiveAccountLedger(null);
      return;
    }
    accountingApi
      .getAccountLedger(apiSession, selectedGlAccountId, {
        branchId: branchFilter !== 'ALL' ? branchFilter : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      })
      .then(setLiveAccountLedger)
      .catch(() => setLiveAccountLedger(null));
  }, [isLiveApi, activeTab, selectedGlAccountId, apiSession, branchFilter, fromDate, toDate]);

  const selectedAccountLedger = useMemo(() => {
    if (!selectedGlAccountId || selectedGlAccountId === 'ALL') return null;
    if (isLiveApi) return liveAccountLedger;
    const acc = previewAccounts.find((a) => a.id === selectedGlAccountId);
    if (!acc) return null;
    return computePreviewAccountLedger({
      account: acc,
      journals: previewJournals,
      branchId: branchFilter,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    });
  }, [
    isLiveApi,
    liveAccountLedger,
    selectedGlAccountId,
    previewAccounts,
    previewJournals,
    branchFilter,
    fromDate,
    toDate,
  ]);

  const trialBalance = isLiveApi ? liveTrialBalance : previewReports.trialBalance;
  const profitLoss = isLiveApi ? liveProfitLoss : previewReports.profitLoss;
  const branchPnl = isLiveApi ? liveBranchPnl : previewReports.branchPnl;
  const balanceSheet = isLiveApi ? liveBalanceSheet : previewBalanceSheet;
  const cashFlow = isLiveApi ? liveCashFlow : previewReports.cashFlow;
  const cashBook = isLiveApi ? liveCashBook : previewReports.cashBook;
  const bankBook = isLiveApi ? liveBankBook : previewReports.bankBook;
  const gstSummary = isLiveApi ? liveGstSummary : previewReports.gstSummary;
  const expenseSummary = isLiveApi ? liveExpenseSummary : previewReports.expenseSummary;

  const branchOptions = useMemo(() => {
    const ids = new Set<string>(['main', apiSession.branchId || 'main']);
    bills.forEach((b) => ids.add(b.branchId || 'main'));
    journals.forEach((j) => ids.add(j.branchId || 'main'));
    return ['ALL', ...Array.from(ids).sort()];
  }, [bills, journals, apiSession.branchId]);

  const mapTabToExportType = ():
    | 'trial-balance'
    | 'profit-loss'
    | 'balance-sheet'
    | 'gst-summary'
    | 'general-ledger'
    | 'expenses' => {
    switch (activeTab) {
      case 'trial_balance':
        return 'trial-balance';
      case 'balance_sheet':
        return 'balance-sheet';
      case 'gst_summary':
        return 'gst-summary';
      case 'general_ledger':
        return 'general-ledger';
      case 'expenses':
        return 'expenses';
      default:
        return 'profit-loss';
    }
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    if (!canExportReports) return;
    if (isLiveApi) {
      try {
        await accountingApi.downloadReportExport(apiSession, mapTabToExportType(), format, {
          branchId: branchFilter !== 'ALL' ? branchFilter : undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          asOfDate: asOfDate || undefined,
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Export failed');
      }
      return;
    }

    if (format === 'pdf') {
      window.print();
      return;
    }

    // Preview mode CSV export
    const todayStr = new Date().toISOString().slice(0, 10);
    if (activeTab === 'trial_balance' && trialBalance) {
      triggerCsvDownload(
        `pharmadesk-trial-balance-${todayStr}.csv`,
        ['Code', 'Account', 'Category', 'Opening Dr', 'Opening Cr', 'Period Dr', 'Period Cr', 'Closing Dr', 'Closing Cr'],
        trialBalance.rows.map((r) => [
          r.code,
          r.name,
          r.category,
          r.openingDebit,
          r.openingCredit,
          r.periodDebit,
          r.periodCredit,
          r.closingDebit,
          r.closingCredit,
        ])
      );
    } else if (activeTab === 'balance_sheet' && balanceSheet) {
      triggerCsvDownload(
        `pharmadesk-balance-sheet-${todayStr}.csv`,
        ['Section', 'Code', 'Account', 'Balance'],
        [
          ...balanceSheet.assets.items.map((i) => ['ASSETS', i.code, i.name, i.balance]),
          ...balanceSheet.liabilities.items.map((i) => ['LIABILITIES', i.code, i.name, i.balance]),
          ...balanceSheet.equity.items.map((i) => ['EQUITY', i.code, i.name, i.balance]),
        ]
      );
    } else if (activeTab === 'gst_summary' && gstSummary) {
      triggerCsvDownload(
        `pharmadesk-gst-summary-${todayStr}.csv`,
        ['Component', 'Amount'],
        [
          ['Output CGST', gstSummary.outputTax.cgst],
          ['Output SGST', gstSummary.outputTax.sgst],
          ['Output IGST', gstSummary.outputTax.igst],
          ['Total Output GST', gstSummary.outputTax.totalOutputGst],
          ['Input CGST ITC', gstSummary.inputTaxCredit.cgst],
          ['Input SGST ITC', gstSummary.inputTaxCredit.sgst],
          ['Input IGST ITC', gstSummary.inputTaxCredit.igst],
          ['Total Eligible ITC', gstSummary.inputTaxCredit.totalEligibleItc],
          ['Net GST Position', gstSummary.netGstPayable],
        ]
      );
    } else if (profitLoss) {
      triggerCsvDownload(
        `pharmadesk-profit-loss-${todayStr}.csv`,
        ['Section', 'Code', 'Account', 'Amount'],
        [
          ...profitLoss.incomeItems.map((i) => ['INCOME', i.code, i.name, i.amount]),
          ...profitLoss.cogsItems.map((i) => ['COGS', i.code, i.name, i.amount]),
          ...profitLoss.operatingExpenseItems.map((i) => ['OPERATING EXPENSE', i.code, i.name, i.amount]),
        ]
      );
    }
  };

  if (!canViewReports) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-xl mx-auto mt-10">
        <ShieldAlert className="w-10 h-10 text-amber-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Financial Reports Restricted</h2>
        <p className="text-sm text-slate-600 mt-1">
          Trial Balance, Profit &amp; Loss, Balance Sheet, and GST Registers require{' '}
          <span className="font-mono text-xs">accounting.reports.view</span> permission (Owner or Auditor role).
        </p>
      </div>
    );
  }

  const tabs: Array<{ id: ReportTab; label: string }> = [
    { id: 'profit_loss', label: 'Profit & Loss' },
    { id: 'branch_pnl', label: 'Branch P&L' },
    { id: 'balance_sheet', label: 'Balance Sheet' },
    { id: 'trial_balance', label: 'Trial Balance' },
    { id: 'cash_flow', label: 'Cash Flow' },
    { id: 'gst_summary', label: 'GST Summary' },
    { id: 'cash_bank_books', label: 'Cash & Bank Books' },
    { id: 'general_ledger', label: 'General Ledger' },
    { id: 'expenses', label: 'Expense Summary' },
  ];

  const activeBook = bookMode === 'CASH' ? cashBook : bankBook;

  return (
    <div className="space-y-6">
      {/* Page Title & Export Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Financial Statements &amp; GST Register</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Derived directly from balanced Cloud Firestore double-entry journal postings
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>

          {canExportReports && (
            <>
              <button
                type="button"
                onClick={() => void handleExport('csv')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => void handleExport('pdf')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Download className="w-3.5 h-3.5" />
                Export PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Branch Scope
          </label>
          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="text-xs font-semibold text-slate-900 bg-transparent focus:outline-none"
            >
              {branchOptions.map((b) => (
                <option key={b} value={b}>
                  {b === 'ALL' ? 'Consolidated (All Branches)' : b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeTab === 'balance_sheet' ? (
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Balance Sheet As-Of Date
            </label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                To Date
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>
          </>
        )}

        {(fromDate || toDate) && activeTab !== 'balance_sheet' && (
          <button
            type="button"
            onClick={() => {
              setFromDate('');
              setToDate('');
            }}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Clear Dates
          </button>
        )}

        {isLiveApi && (
          <button
            type="button"
            onClick={() => void loadLiveReports()}
            disabled={isLoading}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl px-4 py-3 text-sm font-medium">
          {errorMsg}
        </div>
      )}

      {/* Report Tabs */}
      <div className="border-b border-slate-200 flex items-center gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 1. PROFIT & LOSS */}
      {activeTab === 'profit_loss' && profitLoss && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500">Net Sales Revenue</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatInr(profitLoss.summary.netSales)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500">Cost of Goods Sold</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatInr(profitLoss.summary.totalCogs)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500">Gross Profit ({profitLoss.summary.grossMarginPercent}%)</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatInr(profitLoss.summary.grossProfit)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500">Net Profit / (Loss)</p>
              <p
                className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                  profitLoss.summary.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatInr(profitLoss.summary.netProfit)}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5">Code</th>
                  <th className="text-left px-4 py-2.5">Particulars</th>
                  <th className="text-left px-4 py-2.5">Classification</th>
                  <th className="text-right px-4 py-2.5">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profitLoss.incomeItems.map((i) => (
                  <tr key={i.accountId}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{i.code}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{i.name}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">Revenue</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatInr(i.amount)}
                    </td>
                  </tr>
                ))}
                {profitLoss.cogsItems.map((i) => (
                  <tr key={i.accountId}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{i.code}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{i.name}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">Direct Cost (COGS)</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-800">
                      ({formatInr(i.amount)})
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <td colSpan={3} className="px-4 py-2.5 text-slate-900">
                    Gross Profit ({profitLoss.summary.grossMarginPercent}% Margin)
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                    {formatInr(profitLoss.summary.grossProfit)}
                  </td>
                </tr>
                {profitLoss.operatingExpenseItems.map((i) => (
                  <tr key={i.accountId}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{i.code}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{i.name}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">Operating Expense</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-800">
                      ({formatInr(i.amount)})
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-900 text-white font-bold">
                  <td colSpan={3} className="px-4 py-3">
                    Net Profit / (Loss)
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatInr(profitLoss.summary.netProfit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. BRANCH P&L */}
      {activeTab === 'branch_pnl' && branchPnl && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5">Branch ID</th>
                <th className="text-right px-4 py-2.5">Net Sales (₹)</th>
                <th className="text-right px-4 py-2.5">COGS (₹)</th>
                <th className="text-right px-4 py-2.5">Gross Profit (₹)</th>
                <th className="text-right px-4 py-2.5">Operating Expenses (₹)</th>
                <th className="text-right px-4 py-2.5">Net Profit (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchPnl.branches.map((b) => (
                <tr key={b.branchId}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{b.branchId}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{formatInr(b.netSales)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{formatInr(b.totalCogs)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-medium">{formatInr(b.grossProfit)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{formatInr(b.operatingExpenses)}</td>
                  <td
                    className={`px-4 py-3 text-right font-mono tabular-nums font-bold ${
                      b.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {formatInr(b.netProfit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. BALANCE SHEET */}
      {activeTab === 'balance_sheet' && balanceSheet && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {balanceSheet.totals.isBalanced ? (
                <span className="text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Accounting Equation Verified: Assets = Liabilities + Equity
                </span>
              ) : (
                <span className="text-rose-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Out of balance by {formatInr(balanceSheet.totals.difference)}
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-slate-700">
              Total Assets: <strong>{formatInr(balanceSheet.totals.totalAssets)}</strong> · Liabilities + Equity:{' '}
              <strong>{formatInr(balanceSheet.totals.totalLiabilitiesAndEquity)}</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Assets</h3>
                <span className="font-mono text-sm font-bold text-slate-900">
                  {formatInr(balanceSheet.assets.total)}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {balanceSheet.assets.items.map((item) => (
                    <tr key={item.accountId}>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{item.code}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{item.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatInr(item.balance)}
                      </td>
                    </tr>
                  ))}
                  {balanceSheet.assets.items.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-xs text-slate-500">
                        No asset balances posted as of {balanceSheet.asOfDate}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Liabilities</h3>
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {formatInr(balanceSheet.liabilities.total)}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {balanceSheet.liabilities.items.map((item) => (
                      <tr key={item.accountId}>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{item.code}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{item.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatInr(item.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Owner&apos;s Equity &amp; Retained Earnings</h3>
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {formatInr(balanceSheet.equity.total)}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {balanceSheet.equity.items.map((item) => (
                      <tr key={item.accountId}>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{item.code}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{item.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatInr(item.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. TRIAL BALANCE */}
      {activeTab === 'trial_balance' && trialBalance && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900">Trial Balance Schedule</span>
            <span className={trialBalance.totals.isBalanced ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
              {trialBalance.totals.isBalanced ? 'Balanced: Total Debits = Total Credits' : 'Imbalance Detected'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5">Code</th>
                  <th className="text-left px-3 py-2.5">Ledger Account</th>
                  <th className="text-right px-3 py-2.5">Opening Dr</th>
                  <th className="text-right px-3 py-2.5">Opening Cr</th>
                  <th className="text-right px-3 py-2.5">Period Dr</th>
                  <th className="text-right px-3 py-2.5">Period Cr</th>
                  <th className="text-right px-3 py-2.5">Closing Dr</th>
                  <th className="text-right px-3 py-2.5">Closing Cr</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trialBalance.rows.map((r) => (
                  <tr key={r.accountId} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-mono font-semibold text-slate-900">{r.code}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatInr(r.openingDebit)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatInr(r.openingCredit)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatInr(r.periodDebit)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatInr(r.periodCredit)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{formatInr(r.closingDebit)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{formatInr(r.closingCredit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-mono font-bold">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 font-sans">
                    Total
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatInr(trialBalance.totals.openingDebit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatInr(trialBalance.totals.openingCredit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatInr(trialBalance.totals.periodDebit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatInr(trialBalance.totals.periodCredit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatInr(trialBalance.totals.closingDebit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatInr(trialBalance.totals.closingCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 5. CASH FLOW */}
      {activeTab === 'cash_flow' && cashFlow && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Cash &amp; Bank Flow Statement</h2>
          <div className="divide-y divide-slate-100 text-sm">
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">Opening Cash &amp; Bank Balance</span>
              <span className="font-mono tabular-nums font-semibold">{formatInr(cashFlow.openingCashAndBankBalance)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-700">Operating Cash Inflows (Sales, Khata Collections)</span>
              <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                + {formatInr(cashFlow.operatingActivities.cashInflows)}
              </span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-700">Operating Cash Outflows (Suppliers, Expenses, Bank Charges)</span>
              <span className="font-mono tabular-nums text-rose-700 font-semibold">
                - {formatInr(cashFlow.operatingActivities.cashOutflows)}
              </span>
            </div>
            <div className="py-2.5 flex justify-between font-semibold">
              <span className="text-slate-900">Net Operating Cash Flow</span>
              <span className="font-mono tabular-nums">{formatInr(cashFlow.operatingActivities.netOperatingCashFlow)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-700">Financing Activities (Capital / Opening Offsets)</span>
              <span className="font-mono tabular-nums">{formatInr(cashFlow.financingActivities.netFinancingCashFlow)}</span>
            </div>
            <div className="py-2.5 flex justify-between text-xs text-slate-500">
              <span>Internal Contra Transfers Excluded from Net Flow</span>
              <span className="font-mono tabular-nums">{formatInr(cashFlow.internalTransfersVolume)}</span>
            </div>
            <div className="py-3 flex justify-between font-bold text-base bg-slate-50 px-3 rounded-lg">
              <span className="text-slate-900">Closing Cash, Bank &amp; Settlement Balance</span>
              <span className="font-mono tabular-nums text-slate-900">{formatInr(cashFlow.closingCashAndBankBalance)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 6. GST SUMMARY */}
      {activeTab === 'gst_summary' && gstSummary && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <FileText className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Accounting Register Disclaimer (Not Direct GSTN Filing)
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">{gstSummary.disclaimer}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5 text-sm">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Output GST Liability (Sales)
              </h3>
              <div className="flex justify-between">
                <span className="text-slate-600">Output CGST (2210)</span>
                <span className="font-mono tabular-nums">{formatInr(gstSummary.outputTax.cgst)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Output SGST (2220)</span>
                <span className="font-mono tabular-nums">{formatInr(gstSummary.outputTax.sgst)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Output IGST (2230)</span>
                <span className="font-mono tabular-nums">{formatInr(gstSummary.outputTax.igst)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Sales Returns GST Reversed</span>
                <span className="font-mono tabular-nums">({formatInr(gstSummary.outputTax.salesReturnsTaxAdjustment)})</span>
              </div>
              <div className="flex justify-between font-bold border-t border-slate-100 pt-2">
                <span>Total Net Output GST</span>
                <span className="font-mono tabular-nums">{formatInr(gstSummary.outputTax.totalOutputGst)}</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5 text-sm">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Input Tax Credit (Purchases &amp; Expenses)
              </h3>
              <div className="flex justify-between">
                <span className="text-slate-600">Input CGST ITC (1510)</span>
                <span className="font-mono tabular-nums">{formatInr(gstSummary.inputTaxCredit.cgst)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Input SGST ITC (1520)</span>
                <span className="font-mono tabular-nums">{formatInr(gstSummary.inputTaxCredit.sgst)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Input IGST ITC (1530)</span>
                <span className="font-mono tabular-nums">{formatInr(gstSummary.inputTaxCredit.igst)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Purchase Return ITC Reversals</span>
                <span className="font-mono tabular-nums">
                  ({formatInr(gstSummary.inputTaxCredit.purchaseReturnItcReversal)})
                </span>
              </div>
              <div className="flex justify-between font-bold border-t border-slate-100 pt-2">
                <span>Total Eligible Input ITC</span>
                <span className="font-mono tabular-nums">{formatInr(gstSummary.inputTaxCredit.totalEligibleItc)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm">
              <div className="text-slate-600">
                Taxable Sales Total:{' '}
                <strong className="font-mono text-slate-900">{formatInr(gstSummary.taxableSalesTotal)}</strong>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Zero-Rated / Exempt Sales:{' '}
                <span className="font-mono">{formatInr(gstSummary.zeroRatedAndExemptSales)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-500 uppercase">
                {gstSummary.netPosition === 'PAYABLE' ? 'Net GST Payable' : 'Net ITC Carry-Forward Credit'}
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {formatInr(Math.abs(gstSummary.netGstPayable))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. CASH & BANK BOOKS */}
      {activeTab === 'cash_bank_books' && activeBook && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="inline-flex border border-slate-200 rounded-lg overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setBookMode('CASH')}
                className={`px-4 py-2 text-xs font-semibold ${
                  bookMode === 'CASH' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                Cash Book (1100 / 1110)
              </button>
              <button
                type="button"
                onClick={() => setBookMode('BANK')}
                className={`px-4 py-2 text-xs font-semibold ${
                  bookMode === 'BANK' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                Bank &amp; Settlement Book (1200 / 1210 / 1220)
              </button>
            </div>
            <div className="text-xs font-mono text-slate-700">
              Opening: {formatInr(activeBook.openingBalance)} · Closing:{' '}
              <strong>{formatInr(activeBook.closingBalance)}</strong>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2.5">Date</th>
                    <th className="text-left px-3 py-2.5">Voucher</th>
                    <th className="text-left px-3 py-2.5">Account</th>
                    <th className="text-left px-3 py-2.5">Narration</th>
                    <th className="text-right px-3 py-2.5">Receipt (Dr)</th>
                    <th className="text-right px-3 py-2.5">Payment (Cr)</th>
                    <th className="text-right px-3 py-2.5">Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeBook.rows.map((r, i) => (
                    <tr key={`${r.entryId}_${i}`}>
                      <td className="px-3 py-2 font-mono">{r.transactionDate}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-900">{r.voucherNumber}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {r.accountCode} · {r.accountName}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{r.narration}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700">
                        {r.receipt > 0 ? formatInr(r.receipt) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-rose-700">
                        {r.payment > 0 ? formatInr(r.payment) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatInr(r.balance)}
                      </td>
                    </tr>
                  ))}
                  {activeBook.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No {bookMode.toLowerCase()} book transactions in selected period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 8. GENERAL LEDGER & DAY BOOK */}
      {activeTab === 'general_ledger' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700">Inspect Account Ledger:</label>
              <select
                value={selectedGlAccountId}
                onChange={(e) => setSelectedGlAccountId(e.target.value)}
                className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white"
              >
                <option value="ALL">Day Book — All Posted Lines</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedAccountLedger && (
              <div className="text-xs font-mono text-slate-700">
                Opening: {formatInr(selectedAccountLedger.openingBalance)} · Closing:{' '}
                <strong>{formatInr(selectedAccountLedger.closingBalance)}</strong>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              {selectedAccountLedger ? (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2.5">Date</th>
                      <th className="text-left px-3 py-2.5">Voucher</th>
                      <th className="text-left px-3 py-2.5">Type</th>
                      <th className="text-left px-3 py-2.5">Narration</th>
                      <th className="text-right px-3 py-2.5">Debit (₹)</th>
                      <th className="text-right px-3 py-2.5">Credit (₹)</th>
                      <th className="text-right px-3 py-2.5">Running Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedAccountLedger.entries.map((e, i) => (
                      <tr key={`${e.entryId}_${i}`}>
                        <td className="px-3 py-2 font-mono">{e.transactionDate}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-900">{e.voucherNumber}</td>
                        <td className="px-3 py-2 text-slate-600">{e.entryType}</td>
                        <td className="px-3 py-2 text-slate-800">{e.narration}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {e.debit > 0 ? formatInr(e.debit) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {e.credit > 0 ? formatInr(e.credit) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-slate-900">
                          {formatInr(e.runningBalance)}
                        </td>
                      </tr>
                    ))}
                    {selectedAccountLedger.entries.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No entries on this account for selected period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2.5">Date</th>
                      <th className="text-left px-3 py-2.5">Voucher</th>
                      <th className="text-left px-3 py-2.5">Account</th>
                      <th className="text-left px-3 py-2.5">Narration</th>
                      <th className="text-right px-3 py-2.5">Debit (₹)</th>
                      <th className="text-right px-3 py-2.5">Credit (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {journals.flatMap((j) =>
                      j.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="px-3 py-2 font-mono">{j.transactionDate}</td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-900">{j.voucherNumber}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">
                            {l.accountCode} · {l.accountName}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{l.description || j.narration}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {l.debit > 0 ? formatInr(l.debit) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {l.credit > 0 ? formatInr(l.credit) : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 9. EXPENSE SUMMARY */}
      {activeTab === 'expenses' && expenseSummary && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500">Total Vouchers</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {expenseSummary.totalExpenseCount}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500">Total Operating Expenses</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatInr(expenseSummary.totalExpenseAmount)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500">Settled / Paid</p>
              <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {formatInr(expenseSummary.totalPaidAmount)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500">Unpaid Accrued (GL 2300)</p>
              <p className="text-lg font-bold font-mono tabular-nums text-amber-700 mt-1">
                {formatInr(expenseSummary.totalUnpaidAccrued)}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5">Code</th>
                  <th className="text-left px-4 py-2.5">Expense Category</th>
                  <th className="text-right px-4 py-2.5">Count</th>
                  <th className="text-right px-4 py-2.5">Total Amount (₹)</th>
                  <th className="text-right px-4 py-2.5">Paid (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenseSummary.byCategory.map((c) => (
                  <tr key={c.code}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{c.code}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{c.count}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                      {formatInr(c.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                      {formatInr(c.paid)}
                    </td>
                  </tr>
                ))}
                {expenseSummary.byCategory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                      No operating expenses in selected date window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

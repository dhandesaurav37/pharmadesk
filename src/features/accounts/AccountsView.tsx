/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  Landmark,
  Lock,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import {
  AccountCategory,
  AccountLedgerData,
  accountingApi,
  AccountingOverview,
  BankAccount,
  BankReconciliation,
  CashAccount,
  ChartOfAccount,
  ExpenseRecord,
  FinancialPeriod,
  JournalEntry,
  NormalBalance,
  ReconciliationCheckData,
} from '../../lib/accountingApi.ts';
import {
  buildPreviewJournalsFromOperations,
  computePreviewAccountLedger,
  computePreviewReports,
  DEFAULT_PREVIEW_CASH_ACCOUNTS,
} from './accountingPreviewEngine.ts';

type AccountsTab =
  | 'overview'
  | 'coa'
  | 'journals'
  | 'cash_bank'
  | 'expenses'
  | 'periods'
  | 'reconciliation';

const formatInr = (value: number): string =>
  `₹${(Number(value) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const CATEGORY_OPTIONS: AccountCategory[] = ['ASSETS', 'LIABILITIES', 'EQUITY', 'INCOME', 'EXPENSES'];

export const AccountsView: React.FC = () => {
  const {
    apiSession,
    store,
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
    setPreviewAccounts,
    previewExpenses,
    setPreviewExpenses,
    previewManualJournals,
    setPreviewManualJournals,
    previewBankAccounts,
    setPreviewBankAccounts,
    previewReconciliations,
    setPreviewReconciliations,
    previewPeriods,
    setPreviewPeriods,
  } = usePharmacy();

  const isLiveApi = Boolean(apiSession.bearerToken);

  // RBAC capabilities
  const canViewOverview = hasUserPermission('accounting.view') || hasUserPermission('accounting.reports.view');
  const canViewCoa = hasUserPermission('accounting.accounts.view') || hasUserPermission('accounting.view');
  const canManageCoa = hasUserPermission('accounting.accounts.manage');
  const canViewJournals = hasUserPermission('accounting.journals.view') || hasUserPermission('accounting.view');
  const canReverseJournals = hasUserPermission('accounting.journals.reverse');
  const canViewCashBank = hasUserPermission('accounting.cash_bank.view') || hasUserPermission('accounting.view');
  const canManageCashBank = hasUserPermission('accounting.cash_bank.manage');
  const canViewExpenses = hasUserPermission('accounting.expenses.view') || hasUserPermission('accounting.view');
  const canCreateExpenses = hasUserPermission('accounting.expenses.create');
  const canApproveExpenses = hasUserPermission('accounting.expenses.approve');
  const canPayExpenses = hasUserPermission('accounting.expenses.pay');
  const canViewPeriods = hasUserPermission('accounting.periods.view') || hasUserPermission('accounting.view');
  const canClosePeriods = hasUserPermission('accounting.periods.close');
  const canReopenPeriods = hasUserPermission('accounting.periods.reopen');
  const canPostOpening = hasUserPermission('accounting.opening_balances.manage');
  const canViewRecon =
    hasUserPermission('accounting.audit.view') ||
    hasUserPermission('accounting.reconciliation.manage') ||
    hasUserPermission('accounting.view');
  const canManageRecon = hasUserPermission('accounting.reconciliation.manage');

  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: AccountsTab; label: string; allowed: boolean }> = [
      { id: 'overview', label: 'Overview', allowed: canViewOverview },
      { id: 'coa', label: 'Chart of Accounts', allowed: canViewCoa },
      { id: 'journals', label: 'Journal Entries', allowed: canViewJournals },
      { id: 'cash_bank', label: 'Cash & Bank', allowed: canViewCashBank },
      { id: 'expenses', label: 'Expenses', allowed: canViewExpenses },
      { id: 'periods', label: 'Opening & Periods', allowed: canViewPeriods || canPostOpening },
      { id: 'reconciliation', label: 'Reconciliation', allowed: canViewRecon },
    ];
    return tabs.filter((t) => t.allowed);
  }, [
    canViewOverview,
    canViewCoa,
    canViewJournals,
    canViewCashBank,
    canViewExpenses,
    canViewPeriods,
    canPostOpening,
    canViewRecon,
  ]);

  const [activeTab, setActiveTab] = useState<AccountsTab>('overview');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Sync active tab when role permissions change
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.some((t) => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [availableTabs, activeTab]);

  // Live API Data State
  const [liveOverview, setLiveOverview] = useState<AccountingOverview | null>(null);
  const [liveAccounts, setLiveAccounts] = useState<ChartOfAccount[]>([]);
  const [liveJournals, setLiveJournals] = useState<JournalEntry[]>([]);
  const [liveCashAccounts, setLiveCashAccounts] = useState<CashAccount[]>([]);
  const [liveBankAccounts, setLiveBankAccounts] = useState<BankAccount[]>([]);
  const [liveReconciliations, setLiveReconciliations] = useState<BankReconciliation[]>([]);
  const [liveExpenses, setLiveExpenses] = useState<ExpenseRecord[]>([]);
  const [livePeriods, setLivePeriods] = useState<FinancialPeriod[]>([]);
  const [liveReconCheck, setLiveReconCheck] = useState<ReconciliationCheckData | null>(null);

  // CoA UI state
  const [coaCategoryFilter, setCoaCategoryFilter] = useState<'ALL' | AccountCategory>('ALL');
  const [coaShowInactive, setCoaShowInactive] = useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [newAccCode, setNewAccCode] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [newAccCategory, setNewAccCategory] = useState<AccountCategory>('EXPENSES');
  const [newAccSubType, setNewAccSubType] = useState('OPERATING_EXPENSE');
  const [newAccNormalBalance, setNewAccNormalBalance] = useState<NormalBalance>('DEBIT');
  const [newAccDesc, setNewAccDesc] = useState('');
  const [ledgerModalData, setLedgerModalData] = useState<AccountLedgerData | null>(null);

  // Journal Entries UI state
  const [journalSearch, setJournalSearch] = useState('');
  const [journalTypeFilter, setJournalTypeFilter] = useState('ALL');
  const [journalStatusFilter, setJournalStatusFilter] = useState<'ALL' | 'POSTED' | 'REVERSED'>('ALL');
  const [expandedJournalIds, setExpandedJournalIds] = useState<Record<string, boolean>>({});
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  // Cash & Bank Modals
  const [isAddBankOpen, setIsAddBankOpen] = useState(false);
  const [bankAccName, setBankAccName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankBranchName, setBankBranchName] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankLast4, setBankLast4] = useState('');
  const [bankOpenBal, setBankOpenBal] = useState('0');

  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [trfFromId, setTrfFromId] = useState('coa_1100');
  const [trfToId, setTrfToId] = useState('coa_1200');
  const [trfAmount, setTrfAmount] = useState('');
  const [trfDate, setTrfDate] = useState(new Date().toISOString().slice(0, 10));
  const [trfRef, setTrfRef] = useState('');
  const [trfNotes, setTrfNotes] = useState('');

  const [isBankChargeOpen, setIsBankChargeOpen] = useState(false);
  const [bchgAccId, setBchgAccId] = useState('coa_1200');
  const [bchgAmount, setBchgAmount] = useState('');
  const [bchgDate, setBchgDate] = useState(new Date().toISOString().slice(0, 10));
  const [bchgDesc, setBchgDesc] = useState('');
  const [bchgRef, setBchgRef] = useState('');

  // Bank Statement Import
  const [stmtBankId, setStmtBankId] = useState('');
  const [stmtDate, setStmtDate] = useState(new Date().toISOString().slice(0, 10));
  const [stmtBalance, setStmtBalance] = useState('');
  const [stmtRawText, setStmtRawText] = useState(
    `${new Date().toISOString().slice(0, 10)},UPI Batch Settlement,UTR-88412,0,1500\n${new Date().toISOString().slice(0, 10)},Bank NEFT Charge,CHG-01,29.50,0`
  );
  const [matchSelections, setMatchSelections] = useState<Record<string, string>>({});

  // Expenses UI State
  const [expStatusFilter, setExpStatusFilter] = useState<string>('ALL');
  const [expCategoryFilter, setExpCategoryFilter] = useState<string>('ALL');
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expCatId, setExpCatId] = useState('coa_5210');
  const [expVendor, setExpVendor] = useState('');
  const [expVendorGstin, setExpVendorGstin] = useState('');
  const [expInvNo, setExpInvNo] = useState('');
  const [expTaxable, setExpTaxable] = useState('');
  const [expCgst, setExpCgst] = useState('0');
  const [expSgst, setExpSgst] = useState('0');
  const [expIgst, setExpIgst] = useState('0');
  const [expItcEligible, setExpItcEligible] = useState(true);
  const [expPayMode, setExpPayMode] = useState<'UNPAID' | 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD'>('UNPAID');
  const [expPayAccId, setExpPayAccId] = useState('coa_1100');
  const [expPayRef, setExpPayRef] = useState('');
  const [expNotes, setExpNotes] = useState('');

  const [payExpenseTarget, setPayExpenseTarget] = useState<ExpenseRecord | null>(null);
  const [payExpMode, setPayExpMode] = useState<'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD'>('BANK_TRANSFER');
  const [payExpAccId, setPayExpAccId] = useState('coa_1200');
  const [payExpDate, setPayExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [payExpRef, setPayExpRef] = useState('');

  const [reverseExpenseTarget, setReverseExpenseTarget] = useState<ExpenseRecord | null>(null);
  const [reverseExpenseReason, setReverseExpenseReason] = useState('');

  // Opening Balances & Period Modals
  const [openingAsOfDate, setOpeningAsOfDate] = useState('2026-04-01');
  const [openingNotes, setOpeningNotes] = useState('Historical opening balances');
  const [openingRows, setOpeningRows] = useState<Array<{ accountId: string; debit: string; credit: string; description: string }>>([
    { accountId: 'coa_1100', debit: '10000', credit: '0', description: 'Opening counter cash' },
    { accountId: 'coa_1200', debit: '50000', credit: '0', description: 'Opening current bank balance' },
  ]);
  const [periodModal, setPeriodModal] = useState<{ mode: 'close' | 'reopen'; period: FinancialPeriod } | null>(null);
  const [periodReasonOrNotes, setPeriodReasonOrNotes] = useState('');

  // Load Live API Data
  const refreshLiveData = useCallback(async () => {
    if (!isLiveApi) return;
    setIsLoading(true);
    try {
      const branchParam = branchFilter !== 'ALL' ? branchFilter : undefined;
      const tasks: Promise<void>[] = [];
      if (canViewOverview) {
        tasks.push(accountingApi.getOverview(apiSession, { branchId: branchParam }).then(setLiveOverview));
      }
      if (canViewCoa || canPostOpening || canCreateExpenses || canViewCashBank) {
        tasks.push(accountingApi.listAccounts(apiSession, { includeInactive: true }).then(setLiveAccounts));
      }
      if (canViewJournals || canViewCashBank) {
        tasks.push(
          accountingApi.listJournalEntries(apiSession, { branchId: branchParam, limit: 200 }).then(setLiveJournals)
        );
      }
      if (canViewCashBank || canCreateExpenses || canPayExpenses) {
        tasks.push(
          accountingApi.listCashAndBankAccounts(apiSession).then((res) => {
            setLiveCashAccounts(res.cashAccounts);
            setLiveBankAccounts(res.bankAccounts);
            setLiveReconciliations(res.reconciliations);
          })
        );
      }
      if (canViewExpenses) {
        tasks.push(accountingApi.listExpenses(apiSession, { branchId: branchParam }).then(setLiveExpenses));
      }
      if (canViewPeriods) {
        tasks.push(accountingApi.listFinancialPeriods(apiSession).then(setLivePeriods));
      }
      if (canViewRecon) {
        tasks.push(accountingApi.getReconciliationExceptions(apiSession).then(setLiveReconCheck));
      }
      await Promise.all(tasks);
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to load accounting ledger data' });
    } finally {
      setIsLoading(false);
    }
  }, [
    isLiveApi,
    apiSession,
    branchFilter,
    canViewOverview,
    canViewCoa,
    canPostOpening,
    canCreateExpenses,
    canViewCashBank,
    canViewJournals,
    canPayExpenses,
    canViewExpenses,
    canViewPeriods,
    canViewRecon,
  ]);

  useEffect(() => {
    void refreshLiveData();
  }, [refreshLiveData]);

  // Ephemeral preview computed ledger
  const previewDerivedJournals = useMemo(
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

  const previewComputed = useMemo(
    () =>
      computePreviewReports({
        accounts: previewAccounts,
        journals: previewDerivedJournals,
        expenses: previewExpenses,
        periods: previewPeriods,
        customers,
        suppliers,
        inventory,
        branchId: branchFilter,
      }),
    [previewAccounts, previewDerivedJournals, previewExpenses, previewPeriods, customers, suppliers, inventory, branchFilter]
  );

  // Unified selectors (Live API vs Preview Engine)
  const accounts = isLiveApi ? liveAccounts : previewAccounts;
  const journals = useMemo(() => {
    const base = isLiveApi ? liveJournals : previewDerivedJournals;
    if (branchFilter === 'ALL') return base;
    return base.filter((j) => j.branchId === branchFilter);
  }, [isLiveApi, liveJournals, previewDerivedJournals, branchFilter]);

  const cashAccounts = isLiveApi ? liveCashAccounts : DEFAULT_PREVIEW_CASH_ACCOUNTS;
  const bankAccounts = isLiveApi ? liveBankAccounts : previewBankAccounts;
  const reconciliations = isLiveApi ? liveReconciliations : previewReconciliations;
  const expenses = useMemo(() => {
    const base = isLiveApi ? liveExpenses : previewExpenses;
    if (branchFilter === 'ALL') return base;
    return base.filter((e) => e.branchId === branchFilter);
  }, [isLiveApi, liveExpenses, previewExpenses, branchFilter]);

  const periods = isLiveApi ? livePeriods : previewPeriods;
  const overview = isLiveApi ? liveOverview : previewComputed.overview;
  const reconCheck = isLiveApi ? liveReconCheck : previewComputed.reconciliationCheck;

  useEffect(() => {
    if (!stmtBankId && bankAccounts.length > 0) {
      setStmtBankId(bankAccounts[0].id);
    }
  }, [bankAccounts, stmtBankId]);

  const branchOptions = useMemo(() => {
    const ids = new Set<string>(['main', apiSession.branchId || 'main']);
    journals.forEach((j) => ids.add(j.branchId || 'main'));
    bills.forEach((b) => ids.add(b.branchId || 'main'));
    return ['ALL', ...Array.from(ids).sort()];
  }, [journals, bills, apiSession.branchId]);

  const accountBalancesMap = useMemo(() => {
    const map = new Map<string, number>();
    accounts.forEach((a) => map.set(a.id, 0));
    const activeJournals = journals.filter((j) => j.status === 'POSTED');
    for (const j of activeJournals) {
      for (const l of j.lines) {
        const acc = accounts.find((a) => a.id === l.accountId);
        if (!acc) continue;
        const delta = acc.normalBalance === 'DEBIT' ? l.debit - l.credit : l.credit - l.debit;
        map.set(l.accountId, Math.round(((map.get(l.accountId) || 0) + delta) * 100) / 100);
      }
    }
    return map;
  }, [accounts, journals]);

  const liquidAssetAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => a.isActive && a.category === 'ASSETS' && ['CASH', 'BANK', 'CLEARING'].includes(a.subType)
      ),
    [accounts]
  );

  const operatingExpenseAccounts = useMemo(
    () => accounts.filter((a) => a.isActive && a.category === 'EXPENSES' && a.subType !== 'COGS'),
    [accounts]
  );

  // Sync default expense/transfer dropdown IDs with loaded accounts
  useEffect(() => {
    if (operatingExpenseAccounts.length > 0 && !operatingExpenseAccounts.some((a) => a.id === expCatId)) {
      setExpCatId(operatingExpenseAccounts[0].id);
    }
    if (liquidAssetAccounts.length > 0 && !liquidAssetAccounts.some((a) => a.id === expPayAccId)) {
      setExpPayAccId(liquidAssetAccounts[0].id);
    }
    if (liquidAssetAccounts.length > 0 && !liquidAssetAccounts.some((a) => a.id === trfFromId)) {
      setTrfFromId(liquidAssetAccounts[0].id);
    }
    if (liquidAssetAccounts.length > 1 && !liquidAssetAccounts.some((a) => a.id === trfToId)) {
      setTrfToId(liquidAssetAccounts[1].id);
    }
  }, [operatingExpenseAccounts, liquidAssetAccounts, expCatId, expPayAccId, trfFromId, trfToId]);

  // Filtered Views
  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (!coaShowInactive && !a.isActive) return false;
      if (coaCategoryFilter !== 'ALL' && a.category !== coaCategoryFilter) return false;
      return true;
    });
  }, [accounts, coaShowInactive, coaCategoryFilter]);

  const filteredJournals = useMemo(() => {
    const q = journalSearch.trim().toLowerCase();
    return journals.filter((j) => {
      if (journalTypeFilter !== 'ALL' && j.entryType !== journalTypeFilter) return false;
      if (journalStatusFilter !== 'ALL' && j.status !== journalStatusFilter) return false;
      if (q) {
        const match =
          j.voucherNumber.toLowerCase().includes(q) ||
          j.narration.toLowerCase().includes(q) ||
          (j.referenceNumber || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [journals, journalSearch, journalTypeFilter, journalStatusFilter]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (expStatusFilter !== 'ALL' && e.status !== expStatusFilter) return false;
      if (expCategoryFilter !== 'ALL' && e.categoryAccountId !== expCategoryFilter) return false;
      return true;
    });
  }, [expenses, expStatusFilter, expCategoryFilter]);

  const journalEntryTypes = useMemo(() => {
    const types = new Set<string>();
    journals.forEach((j) => types.add(j.entryType));
    return ['ALL', ...Array.from(types).sort()];
  }, [journals]);

  // Action Handlers
  const handleViewAccountLedger = async (acc: ChartOfAccount) => {
    try {
      if (isLiveApi) {
        const data = await accountingApi.getAccountLedger(apiSession, acc.id, {
          branchId: branchFilter !== 'ALL' ? branchFilter : undefined,
        });
        setLedgerModalData(data);
      } else {
        setLedgerModalData(
          computePreviewAccountLedger({
            account: acc,
            journals: previewDerivedJournals,
            branchId: branchFilter,
          })
        );
      }
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Unable to open account ledger' });
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccCode.trim() || !newAccName.trim()) {
      setBanner({ type: 'err', text: 'Account code and name are required.' });
      return;
    }
    try {
      if (isLiveApi) {
        await accountingApi.createAccount(apiSession, {
          code: newAccCode.trim(),
          name: newAccName.trim(),
          category: newAccCategory,
          subType: newAccSubType.trim() || 'GENERAL',
          normalBalance: newAccNormalBalance,
          description: newAccDesc.trim() || undefined,
        });
        await refreshLiveData();
      } else {
        if (previewAccounts.some((a) => a.code === newAccCode.trim())) {
          setBanner({ type: 'err', text: `Account code ${newAccCode.trim()} already exists.` });
          return;
        }
        const now = new Date().toISOString();
        const created: ChartOfAccount = {
          id: `coa_custom_${Date.now()}`,
          tenantId: store.id,
          code: newAccCode.trim(),
          name: newAccName.trim(),
          category: newAccCategory,
          subType: newAccSubType.trim() || 'GENERAL',
          normalBalance: newAccNormalBalance,
          parentAccountId: null,
          isSystemAccount: false,
          systemCode: null,
          isActive: true,
          description: newAccDesc.trim() || null,
          createdAt: now,
          updatedAt: now,
          createdBy: 'owner',
        };
        setPreviewAccounts((prev) => [...prev, created].sort((a, b) => a.code.localeCompare(b.code)));
      }
      setIsAddAccountOpen(false);
      setNewAccCode('');
      setNewAccName('');
      setNewAccDesc('');
      setBanner({ type: 'ok', text: `Account ${newAccCode.trim()} added to Chart of Accounts.` });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to create account' });
    }
  };

  const handleToggleAccountActive = async (acc: ChartOfAccount) => {
    try {
      if (isLiveApi) {
        await accountingApi.updateAccount(apiSession, acc.id, { isActive: !acc.isActive });
        await refreshLiveData();
      } else {
        setPreviewAccounts((prev) =>
          prev.map((a) => (a.id === acc.id ? { ...a, isActive: !a.isActive, updatedAt: new Date().toISOString() } : a))
        );
      }
      setBanner({
        type: 'ok',
        text: `${acc.code} ${acc.name} marked ${acc.isActive ? 'Inactive' : 'Active'}.`,
      });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Unable to update account status' });
    }
  };

  const handleDeleteAccount = async (acc: ChartOfAccount) => {
    const hasActivity = journals.some((j) => j.lines.some((l) => l.accountId === acc.id));
    if (acc.isSystemAccount || hasActivity) {
      setBanner({ type: 'err', text: 'Only unused non-system accounts can be deleted. Deactivate instead.' });
      return;
    }
    try {
      if (isLiveApi) {
        await accountingApi.deleteAccount(apiSession, acc.id);
        await refreshLiveData();
      } else {
        setPreviewAccounts((prev) => prev.filter((a) => a.id !== acc.id));
      }
      setBanner({ type: 'ok', text: `Deleted custom account ${acc.code} ${acc.name}.` });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to delete account' });
    }
  };

  const handleReverseJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseTarget || reverseReason.trim().length < 4) {
      setBanner({ type: 'err', text: 'Reversal audit reason must be at least 4 characters.' });
      return;
    }
    try {
      if (isLiveApi) {
        await accountingApi.reverseJournalEntry(apiSession, reverseTarget.id, reverseReason.trim());
        await refreshLiveData();
      } else {
        const revId = `je_rev_${Date.now()}`;
        const nowDate = new Date().toISOString().slice(0, 10);
        const revEntry: JournalEntry = {
          ...reverseTarget,
          id: revId,
          voucherNumber: `REV-${reverseTarget.voucherNumber}`,
          entryType: 'REVERSAL',
          status: 'POSTED',
          transactionDate: nowDate,
          narration: `Reversal of ${reverseTarget.voucherNumber}: ${reverseReason.trim()}`,
          reversesEntryId: reverseTarget.id,
          reversedByEntryId: null,
          reversedAt: null,
          reversedBy: null,
          reversalReason: reverseReason.trim(),
          createdAt: new Date().toISOString(),
          lines: reverseTarget.lines.map((l, idx) => ({
            ...l,
            id: `${revId}_l${idx + 1}`,
            entryId: revId,
            transactionDate: nowDate,
            debitPaise: l.creditPaise,
            creditPaise: l.debitPaise,
            debit: l.credit,
            credit: l.debit,
          })),
        };
        setPreviewManualJournals((prev) => [revEntry, ...prev]);
      }
      setBanner({ type: 'ok', text: `Reversal entry posted for ${reverseTarget.voucherNumber}.` });
      setReverseTarget(null);
      setReverseReason('');
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to reverse journal entry' });
    }
  };

  const handleCreateBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankAccName.trim() || !bankName.trim() || bankLast4.trim().length !== 4) {
      setBanner({ type: 'err', text: 'Provide account name, bank name, and 4-digit account suffix.' });
      return;
    }
    const openingBal = Number(bankOpenBal) || 0;
    try {
      if (isLiveApi) {
        await accountingApi.createBankAccount(apiSession, {
          branchId: branchFilter !== 'ALL' ? branchFilter : apiSession.branchId || 'main',
          accountName: bankAccName.trim(),
          bankName: bankName.trim(),
          branchName: bankBranchName.trim() || undefined,
          ifscCode: bankIfsc.trim() || undefined,
          accountNumberLast4: bankLast4.trim(),
          openingBalance: openingBal > 0 ? openingBal : undefined,
        });
        await refreshLiveData();
      } else {
        const nextCode = String(1201 + previewBankAccounts.length);
        const coaId = `coa_${nextCode}`;
        const now = new Date().toISOString();
        const newCoa: ChartOfAccount = {
          id: coaId,
          tenantId: store.id,
          code: nextCode,
          name: `${bankAccName.trim()} (${bankName.trim()})`,
          category: 'ASSETS',
          subType: 'BANK',
          normalBalance: 'DEBIT',
          parentAccountId: null,
          isSystemAccount: false,
          systemCode: null,
          isActive: true,
          description: `IFSC ${bankIfsc || 'N/A'} • A/C XXXX${bankLast4}`,
          createdAt: now,
          updatedAt: now,
          createdBy: 'owner',
        };
        const newBank: BankAccount = {
          id: `bank_${Date.now()}`,
          tenantId: store.id,
          branchId: branchFilter !== 'ALL' ? branchFilter : 'main',
          accountName: bankAccName.trim(),
          bankName: bankName.trim(),
          branchName: bankBranchName.trim() || null,
          ifscCode: bankIfsc.trim() || null,
          maskedAccountNumber: `XXXX${bankLast4.trim()}`,
          ledgerAccountId: coaId,
          ledgerAccountCode: nextCode,
          status: 'ACTIVE',
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        };
        setPreviewAccounts((prev) => [...prev, newCoa].sort((a, b) => a.code.localeCompare(b.code)));
        setPreviewBankAccounts((prev) => [...prev, newBank]);
        if (openingBal > 0) {
          const jId = `je_bankop_${Date.now()}`;
          const paise = Math.round(openingBal * 100);
          const today = now.slice(0, 10);
          setPreviewManualJournals((prev) => [
            {
              id: jId,
              tenantId: store.id,
              branchId: newBank.branchId,
              voucherNumber: `OP-BNK-${String(prev.length + 1).padStart(3, '0')}`,
              entryType: 'OPENING_BALANCE',
              status: 'POSTED',
              transactionDate: today,
              periodId: previewPeriods[0]?.id || 'fy_2026_p01',
              referenceType: 'opening_balance',
              referenceId: newBank.id,
              referenceNumber: newBank.maskedAccountNumber,
              narration: `Opening balance for ${newBank.accountName}`,
              idempotencyKey: jId,
              debitTotalPaise: paise,
              creditTotalPaise: paise,
              debitTotal: openingBal,
              creditTotal: openingBal,
              lines: [
                {
                  id: `${jId}_1`,
                  entryId: jId,
                  tenantId: store.id,
                  branchId: newBank.branchId,
                  transactionDate: today,
                  accountId: coaId,
                  accountCode: nextCode,
                  accountName: newCoa.name,
                  accountCategory: 'ASSETS',
                  normalBalance: 'DEBIT',
                  debitPaise: paise,
                  creditPaise: 0,
                  debit: openingBal,
                  credit: 0,
                  description: 'Bank opening balance',
                },
                {
                  id: `${jId}_2`,
                  entryId: jId,
                  tenantId: store.id,
                  branchId: newBank.branchId,
                  transactionDate: today,
                  accountId: 'coa_3200',
                  accountCode: '3200',
                  accountName: 'Opening Balance Equity',
                  accountCategory: 'EQUITY',
                  normalBalance: 'CREDIT',
                  debitPaise: 0,
                  creditPaise: paise,
                  debit: 0,
                  credit: openingBal,
                  description: 'Opening equity offset',
                },
              ],
              reversesEntryId: null,
              reversedByEntryId: null,
              reversedAt: null,
              reversedBy: null,
              reversalReason: null,
              createdBy: 'owner',
              createdAt: now,
            },
            ...prev,
          ]);
        }
      }
      setIsAddBankOpen(false);
      setBankAccName('');
      setBankName('');
      setBankBranchName('');
      setBankIfsc('');
      setBankLast4('');
      setBankOpenBal('0');
      setBanner({ type: 'ok', text: 'Bank account registered and linked to Chart of Accounts.' });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to register bank account' });
    }
  };

  const handleInternalTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(trfAmount);
    if (!trfFromId || !trfToId || trfFromId === trfToId || !Number.isFinite(amt) || amt <= 0) {
      setBanner({ type: 'err', text: 'Choose distinct source and destination accounts and a positive amount.' });
      return;
    }
    try {
      if (isLiveApi) {
        await accountingApi.recordInternalTransfer(apiSession, {
          branchId: branchFilter !== 'ALL' ? branchFilter : apiSession.branchId || 'main',
          fromAccountId: trfFromId,
          toAccountId: trfToId,
          amount: amt,
          transferDate: trfDate,
          referenceNumber: trfRef.trim() || undefined,
          notes: trfNotes.trim() || undefined,
        });
        await refreshLiveData();
      } else {
        const fromAcc = accounts.find((a) => a.id === trfFromId)!;
        const toAcc = accounts.find((a) => a.id === trfToId)!;
        const paise = Math.round(amt * 100);
        const jId = `je_trf_${Date.now()}`;
        const branch = branchFilter !== 'ALL' ? branchFilter : 'main';
        setPreviewManualJournals((prev) => [
          {
            id: jId,
            tenantId: store.id,
            branchId: branch,
            voucherNumber: `TRF-${String(prev.length + 1).padStart(4, '0')}`,
            entryType: 'INTERNAL_TRANSFER',
            status: 'POSTED',
            transactionDate: trfDate,
            periodId: previewPeriods[0]?.id || 'fy_2026_p01',
            referenceType: 'internal_transfer',
            referenceId: jId,
            referenceNumber: trfRef.trim() || null,
            narration: trfNotes.trim() || `Contra transfer ${fromAcc.name} → ${toAcc.name}`,
            idempotencyKey: jId,
            debitTotalPaise: paise,
            creditTotalPaise: paise,
            debitTotal: amt,
            creditTotal: amt,
            lines: [
              {
                id: `${jId}_1`,
                entryId: jId,
                tenantId: store.id,
                branchId: branch,
                transactionDate: trfDate,
                accountId: toAcc.id,
                accountCode: toAcc.code,
                accountName: toAcc.name,
                accountCategory: toAcc.category,
                normalBalance: toAcc.normalBalance,
                debitPaise: paise,
                creditPaise: 0,
                debit: amt,
                credit: 0,
                description: `Transfer in from ${fromAcc.code}`,
              },
              {
                id: `${jId}_2`,
                entryId: jId,
                tenantId: store.id,
                branchId: branch,
                transactionDate: trfDate,
                accountId: fromAcc.id,
                accountCode: fromAcc.code,
                accountName: fromAcc.name,
                accountCategory: fromAcc.category,
                normalBalance: fromAcc.normalBalance,
                debitPaise: 0,
                creditPaise: paise,
                debit: 0,
                credit: amt,
                description: `Transfer out to ${toAcc.code}`,
              },
            ],
            reversesEntryId: null,
            reversedByEntryId: null,
            reversedAt: null,
            reversedBy: null,
            reversalReason: null,
            createdBy: 'owner',
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
      setIsTransferOpen(false);
      setTrfAmount('');
      setTrfRef('');
      setTrfNotes('');
      setBanner({ type: 'ok', text: `Contra transfer of ${formatInr(amt)} posted.` });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to post internal transfer' });
    }
  };

  const handleBankCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(bchgAmount);
    if (!Number.isFinite(amt) || amt <= 0 || !bchgDesc.trim()) {
      setBanner({ type: 'err', text: 'Provide positive charge amount and description.' });
      return;
    }
    try {
      if (isLiveApi) {
        await accountingApi.recordBankCharge(apiSession, {
          branchId: branchFilter !== 'ALL' ? branchFilter : apiSession.branchId || 'main',
          bankLedgerAccountId: bchgAccId,
          amount: amt,
          chargeDate: bchgDate,
          description: bchgDesc.trim(),
          referenceNumber: bchgRef.trim() || undefined,
        });
        await refreshLiveData();
      } else {
        const bankAcc = accounts.find((a) => a.id === bchgAccId)!;
        const chargeAcc = accounts.find((a) => a.code === '5270')!;
        const paise = Math.round(amt * 100);
        const jId = `je_bchg_${Date.now()}`;
        const branch = branchFilter !== 'ALL' ? branchFilter : 'main';
        setPreviewManualJournals((prev) => [
          {
            id: jId,
            tenantId: store.id,
            branchId: branch,
            voucherNumber: `BCHG-${String(prev.length + 1).padStart(4, '0')}`,
            entryType: 'BANK_CHARGE',
            status: 'POSTED',
            transactionDate: bchgDate,
            periodId: previewPeriods[0]?.id || 'fy_2026_p01',
            referenceType: 'bank_charge',
            referenceId: jId,
            referenceNumber: bchgRef.trim() || null,
            narration: `Bank Charge: ${bchgDesc.trim()}`,
            idempotencyKey: jId,
            debitTotalPaise: paise,
            creditTotalPaise: paise,
            debitTotal: amt,
            creditTotal: amt,
            lines: [
              {
                id: `${jId}_1`,
                entryId: jId,
                tenantId: store.id,
                branchId: branch,
                transactionDate: bchgDate,
                accountId: chargeAcc.id,
                accountCode: chargeAcc.code,
                accountName: chargeAcc.name,
                accountCategory: chargeAcc.category,
                normalBalance: chargeAcc.normalBalance,
                debitPaise: paise,
                creditPaise: 0,
                debit: amt,
                credit: 0,
                description: bchgDesc.trim(),
              },
              {
                id: `${jId}_2`,
                entryId: jId,
                tenantId: store.id,
                branchId: branch,
                transactionDate: bchgDate,
                accountId: bankAcc.id,
                accountCode: bankAcc.code,
                accountName: bankAcc.name,
                accountCategory: bankAcc.category,
                normalBalance: bankAcc.normalBalance,
                debitPaise: 0,
                creditPaise: paise,
                debit: 0,
                credit: amt,
                description: bchgDesc.trim(),
              },
            ],
            reversesEntryId: null,
            reversedByEntryId: null,
            reversedAt: null,
            reversedBy: null,
            reversalReason: null,
            createdBy: 'owner',
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
      setIsBankChargeOpen(false);
      setBchgAmount('');
      setBchgDesc('');
      setBchgRef('');
      setBanner({ type: 'ok', text: `Bank charge of ${formatInr(amt)} recorded.` });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to post bank charge' });
    }
  };

  const handleImportBankStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stmtBankId || stmtRawText.trim().length === 0) {
      setBanner({ type: 'err', text: 'Select a bank account and enter statement lines.' });
      return;
    }
    const parsedLines: Array<{ date: string; description: string; reference?: string; debit?: number; credit?: number }> =
      [];
    const trimmed = stmtRawText.trim();
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) {
          arr.forEach((row) =>
            parsedLines.push({
              date: String(row.date || stmtDate),
              description: String(row.description || 'Statement line'),
              reference: row.reference ? String(row.reference) : undefined,
              debit: Number(row.debit) || 0,
              credit: Number(row.credit) || 0,
            })
          );
        }
      } catch {
        setBanner({ type: 'err', text: 'Invalid JSON statement array.' });
        return;
      }
    } else {
      trimmed.split(/\r?\n/).forEach((line) => {
        const cols = line.split(',').map((c) => c.trim());
        if (cols.length >= 4 && cols[0] && cols[0].toLowerCase() !== 'date') {
          parsedLines.push({
            date: cols[0],
            description: cols[1] || 'Bank entry',
            reference: cols[2] || undefined,
            debit: Number(cols[3]) || 0,
            credit: Number(cols[4]) || 0,
          });
        }
      });
    }
    if (parsedLines.length === 0) {
      setBanner({
        type: 'err',
        text: 'No valid statement lines parsed. Use CSV columns: YYYY-MM-DD,Description,Reference,Debit,Credit',
      });
      return;
    }
    const targetBank = bankAccounts.find((b) => b.id === stmtBankId);
    const ledgerBal = targetBank ? accountBalancesMap.get(targetBank.ledgerAccountId) || 0 : 0;
    const endingBal = stmtBalance.trim() !== '' ? Number(stmtBalance) : ledgerBal;

    try {
      if (isLiveApi) {
        await accountingApi.importBankStatement(apiSession, {
          bankAccountId: stmtBankId,
          statementDate: stmtDate,
          statementBalance: endingBal,
          lines: parsedLines,
        });
        await refreshLiveData();
      } else if (targetBank) {
        const now = new Date().toISOString();
        const recon: BankReconciliation = {
          id: `brecon_${Date.now()}`,
          tenantId: store.id,
          bankAccountId: targetBank.id,
          bankAccountName: `${targetBank.bankName} ${targetBank.maskedAccountNumber}`,
          ledgerAccountId: targetBank.ledgerAccountId,
          statementDate: stmtDate,
          statementBalance: endingBal,
          ledgerBalance: ledgerBal,
          difference: Math.round((endingBal - ledgerBal) * 100) / 100,
          lines: parsedLines.map((l, idx) => ({
            id: `stmtl_${Date.now()}_${idx + 1}`,
            date: l.date,
            description: l.description,
            reference: l.reference || null,
            debit: l.debit || 0,
            credit: l.credit || 0,
            matchedJournalEntryId: null,
            matchedVoucherNumber: null,
            matchedAt: null,
          })),
          matchedCount: 0,
          unmatchedCount: parsedLines.length,
          status: 'OPEN',
          createdBy: 'owner',
          createdAt: now,
          updatedAt: now,
        };
        setPreviewReconciliations((prev) => [recon, ...prev]);
      }
      setBanner({ type: 'ok', text: `Imported ${parsedLines.length} bank statement lines for reconciliation.` });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to import bank statement' });
    }
  };

  const handleMatchStatementLine = async (reconId: string, lineId: string) => {
    const journalEntryId = matchSelections[lineId];
    if (!journalEntryId) {
      setBanner({ type: 'err', text: 'Select a matching journal voucher first.' });
      return;
    }
    try {
      if (isLiveApi) {
        await accountingApi.matchBankStatementLine(apiSession, reconId, lineId, journalEntryId);
        await refreshLiveData();
      } else {
        const j = journals.find((entry) => entry.id === journalEntryId);
        if (!j) return;
        setPreviewReconciliations((prev) =>
          prev.map((r) => {
            if (r.id !== reconId) return r;
            const nextLines = r.lines.map((l) =>
              l.id === lineId
                ? {
                    ...l,
                    matchedJournalEntryId: j.id,
                    matchedVoucherNumber: j.voucherNumber,
                    matchedAt: new Date().toISOString(),
                  }
                : l
            );
            const matchedCount = nextLines.filter((l) => l.matchedJournalEntryId).length;
            const unmatchedCount = nextLines.length - matchedCount;
            return {
              ...r,
              lines: nextLines,
              matchedCount,
              unmatchedCount,
              status: unmatchedCount === 0 ? 'MATCHED' : 'OPEN',
              updatedAt: new Date().toISOString(),
            };
          })
        );
      }
      setBanner({ type: 'ok', text: 'Statement line matched to posted journal voucher.' });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to match statement line' });
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const taxable = Number(expTaxable) || 0;
    const cgst = Number(expCgst) || 0;
    const sgst = Number(expSgst) || 0;
    const igst = Number(expIgst) || 0;
    if (!expVendor.trim() || taxable <= 0) {
      setBanner({ type: 'err', text: 'Vendor name and positive taxable amount are required.' });
      return;
    }
    try {
      if (isLiveApi) {
        await accountingApi.createExpense(apiSession, {
          branchId: branchFilter !== 'ALL' ? branchFilter : apiSession.branchId || 'main',
          expenseDate: expDate,
          categoryAccountId: expCatId,
          vendorName: expVendor.trim(),
          vendorGstin: expVendorGstin.trim() || undefined,
          invoiceNumber: expInvNo.trim() || undefined,
          taxableAmount: taxable,
          cgst,
          sgst,
          igst,
          itcEligible: expItcEligible,
          paymentMode: expPayMode,
          paymentAccountId: expPayMode !== 'UNPAID' ? expPayAccId : undefined,
          paymentReference: expPayRef.trim() || undefined,
          notes: expNotes.trim() || undefined,
          autoApprove: canApproveExpenses,
        });
        await refreshLiveData();
      } else {
        const cat = accounts.find((a) => a.id === expCatId)!;
        const tot = Math.round((taxable + cgst + sgst + igst) * 100) / 100;
        const autoApprove = canApproveExpenses;
        const isPaidNow = autoApprove && expPayMode !== 'UNPAID';
        const status: ExpenseRecord['status'] = !autoApprove
          ? 'SUBMITTED'
          : isPaidNow
          ? 'PAID'
          : 'APPROVED_UNPAID';
        const now = new Date().toISOString();
        const created: ExpenseRecord = {
          id: `exp_${Date.now()}`,
          tenantId: store.id,
          branchId: branchFilter !== 'ALL' ? branchFilter : 'main',
          expenseNumber: `EXP-2026-${String(previewExpenses.length + 1).padStart(4, '0')}`,
          expenseDate: expDate,
          categoryAccountId: cat.id,
          categoryAccountCode: cat.code,
          categoryAccountName: cat.name,
          vendorName: expVendor.trim(),
          vendorGstin: expVendorGstin.trim() || null,
          invoiceNumber: expInvNo.trim() || null,
          taxableAmount: taxable,
          cgst,
          sgst,
          igst,
          itcEligible: expItcEligible,
          totalAmount: tot,
          paidAmount: isPaidNow ? tot : 0,
          outstandingAmount: isPaidNow ? 0 : tot,
          status,
          approvalStatus: autoApprove ? 'APPROVED' : 'PENDING',
          paymentMode: expPayMode,
          paymentAccountId: expPayMode !== 'UNPAID' ? expPayAccId : null,
          paymentReference: expPayRef.trim() || null,
          receiptAttachmentPath: null,
          notes: expNotes.trim() || null,
          recognitionJournalId: null,
          paymentJournalId: null,
          reversalJournalId: null,
          approvedBy: autoApprove ? 'owner' : null,
          approvedAt: autoApprove ? now : null,
          paidAt: isPaidNow ? now : null,
          createdBy: canApproveExpenses ? 'owner' : 'pharmacist',
          createdAt: now,
          updatedAt: now,
        };
        setPreviewExpenses((prev) => [created, ...prev]);
      }
      setIsAddExpenseOpen(false);
      setExpVendor('');
      setExpVendorGstin('');
      setExpInvNo('');
      setExpTaxable('');
      setExpCgst('0');
      setExpSgst('0');
      setExpIgst('0');
      setExpPayRef('');
      setExpNotes('');
      setBanner({
        type: 'ok',
        text: canApproveExpenses
          ? 'Expense approved and posted to General Ledger.'
          : 'Expense submitted for Owner approval (no GL posting until approved).',
      });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to create expense' });
    }
  };

  const handleApproveExpense = async (exp: ExpenseRecord) => {
    try {
      if (isLiveApi) {
        await accountingApi.approveExpense(apiSession, exp.id);
        await refreshLiveData();
      } else {
        setPreviewExpenses((prev) =>
          prev.map((item) => {
            if (item.id !== exp.id) return item;
            const paidNow = item.paymentMode && item.paymentMode !== 'UNPAID';
            return {
              ...item,
              approvalStatus: 'APPROVED',
              status: paidNow ? 'PAID' : 'APPROVED_UNPAID',
              paidAmount: paidNow ? item.totalAmount : 0,
              outstandingAmount: paidNow ? 0 : item.totalAmount,
              approvedAt: new Date().toISOString(),
              approvedBy: 'owner',
            };
          })
        );
      }
      setBanner({ type: 'ok', text: `Expense ${exp.expenseNumber} approved & posted.` });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to approve expense' });
    }
  };

  const handlePayExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payExpenseTarget) return;
    try {
      if (isLiveApi) {
        await accountingApi.payExpense(apiSession, payExpenseTarget.id, {
          paymentMode: payExpMode,
          paymentAccountId: payExpAccId,
          paymentDate: payExpDate,
          referenceNumber: payExpRef.trim() || undefined,
        });
        await refreshLiveData();
      } else {
        setPreviewExpenses((prev) =>
          prev.map((item) =>
            item.id === payExpenseTarget.id
              ? {
                  ...item,
                  status: 'PAID',
                  paymentMode: payExpMode,
                  paymentAccountId: payExpAccId,
                  paymentReference: payExpRef.trim() || null,
                  paidAmount: item.totalAmount,
                  outstandingAmount: 0,
                  paidAt: new Date().toISOString(),
                }
              : item
          )
        );
      }
      setBanner({ type: 'ok', text: `Expense ${payExpenseTarget.expenseNumber} settled.` });
      setPayExpenseTarget(null);
      setPayExpRef('');
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to pay expense' });
    }
  };

  const handleReverseExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseExpenseTarget || reverseExpenseReason.trim().length < 4) {
      setBanner({ type: 'err', text: 'Provide a reversal reason (at least 4 characters).' });
      return;
    }
    try {
      if (isLiveApi) {
        await accountingApi.reverseExpense(apiSession, reverseExpenseTarget.id, reverseExpenseReason.trim());
        await refreshLiveData();
      } else {
        setPreviewExpenses((prev) =>
          prev.map((item) =>
            item.id === reverseExpenseTarget.id
              ? { ...item, status: 'REVERSED', outstandingAmount: 0, updatedAt: new Date().toISOString() }
              : item
          )
        );
      }
      setBanner({ type: 'ok', text: `Expense ${reverseExpenseTarget.expenseNumber} reversed cleanly.` });
      setReverseExpenseTarget(null);
      setReverseExpenseReason('');
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to reverse expense' });
    }
  };

  const handlePostOpeningBalances = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = openingRows
      .map((r) => ({
        accountId: r.accountId,
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
        description: r.description.trim() || undefined,
      }))
      .filter((r) => r.accountId && (r.debit > 0 || r.credit > 0));

    if (cleaned.length === 0) {
      setBanner({ type: 'err', text: 'Add at least one non-zero opening balance row.' });
      return;
    }

    try {
      if (isLiveApi) {
        await accountingApi.postOpeningBalances(apiSession, {
          branchId: branchFilter !== 'ALL' ? branchFilter : apiSession.branchId || 'main',
          asOfDate: openingAsOfDate,
          entries: cleaned,
          notes: openingNotes.trim() || undefined,
        });
        await refreshLiveData();
      } else {
        const branch = branchFilter !== 'ALL' ? branchFilter : 'main';
        const jId = `je_open_${Date.now()}`;
        const lines: JournalEntry['lines'] = [];
        let sumDr = 0;
        let sumCr = 0;
        cleaned.forEach((row, idx) => {
          const acc = accounts.find((a) => a.id === row.accountId);
          if (!acc) return;
          const dP = Math.round(row.debit * 100);
          const cP = Math.round(row.credit * 100);
          sumDr += dP;
          sumCr += cP;
          lines.push({
            id: `${jId}_${idx + 1}`,
            entryId: jId,
            tenantId: store.id,
            branchId: branch,
            transactionDate: openingAsOfDate,
            accountId: acc.id,
            accountCode: acc.code,
            accountName: acc.name,
            accountCategory: acc.category,
            normalBalance: acc.normalBalance,
            debitPaise: dP,
            creditPaise: cP,
            debit: row.debit,
            credit: row.credit,
            description: row.description || 'Opening balance',
          });
        });
        const diff = sumDr - sumCr;
        if (diff !== 0) {
          const eqAcc = accounts.find((a) => a.code === '3200')!;
          lines.push({
            id: `${jId}_off`,
            entryId: jId,
            tenantId: store.id,
            branchId: branch,
            transactionDate: openingAsOfDate,
            accountId: eqAcc.id,
            accountCode: eqAcc.code,
            accountName: eqAcc.name,
            accountCategory: eqAcc.category,
            normalBalance: eqAcc.normalBalance,
            debitPaise: diff < 0 ? Math.abs(diff) : 0,
            creditPaise: diff > 0 ? diff : 0,
            debit: diff < 0 ? Math.abs(diff) / 100 : 0,
            credit: diff > 0 ? diff / 100 : 0,
            description: 'Opening Balance Equity offset',
          });
        }
        const totP = Math.max(sumDr, sumCr);
        setPreviewManualJournals((prev) => [
          {
            id: jId,
            tenantId: store.id,
            branchId: branch,
            voucherNumber: `OP-BAL-${String(prev.length + 1).padStart(3, '0')}`,
            entryType: 'OPENING_BALANCE',
            status: 'POSTED',
            transactionDate: openingAsOfDate,
            periodId: previewPeriods[0]?.id || 'fy_2026_p01',
            referenceType: 'opening_balance',
            referenceId: jId,
            referenceNumber: openingAsOfDate,
            narration: openingNotes.trim() || `Opening balances as of ${openingAsOfDate}`,
            idempotencyKey: jId,
            debitTotalPaise: totP,
            creditTotalPaise: totP,
            debitTotal: totP / 100,
            creditTotal: totP / 100,
            lines,
            reversesEntryId: null,
            reversedByEntryId: null,
            reversedAt: null,
            reversedBy: null,
            reversalReason: null,
            createdBy: 'owner',
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
      setBanner({ type: 'ok', text: `Opening balances posted as of ${openingAsOfDate}.` });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to post opening balances' });
    }
  };

  const handlePeriodAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodModal) return;
    if (periodModal.mode === 'reopen' && periodReasonOrNotes.trim().length < 5) {
      setBanner({ type: 'err', text: 'Reopen audit reason must be at least 5 characters.' });
      return;
    }
    try {
      if (isLiveApi) {
        if (periodModal.mode === 'close') {
          await accountingApi.closeFinancialPeriod(
            apiSession,
            periodModal.period.id,
            periodReasonOrNotes.trim() || undefined
          );
        } else {
          await accountingApi.reopenFinancialPeriod(apiSession, periodModal.period.id, periodReasonOrNotes.trim());
        }
        await refreshLiveData();
      } else {
        const now = new Date().toISOString();
        setPreviewPeriods((prev) =>
          prev.map((p) =>
            p.id !== periodModal.period.id
              ? p
              : periodModal.mode === 'close'
              ? { ...p, status: 'CLOSED', closedAt: now, closedBy: 'owner', closeNotes: periodReasonOrNotes.trim() || null }
              : { ...p, status: 'OPEN', reopenedAt: now, reopenedBy: 'owner', reopenReason: periodReasonOrNotes.trim() }
          )
        );
      }
      setBanner({
        type: 'ok',
        text: `Period ${periodModal.period.periodName} ${periodModal.mode === 'close' ? 'closed' : 'reopened'}.`,
      });
      setPeriodModal(null);
      setPeriodReasonOrNotes('');
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to update financial period' });
    }
  };

  const handleRunBackfill = async () => {
    try {
      if (isLiveApi) {
        const res = await accountingApi.runHistoricalBackfill(apiSession);
        await refreshLiveData();
        setBanner({
          type: 'ok',
          text: `Historical backfill finished: ${res.postedCount} posted, ${res.skippedCount} skipped, ${res.failedCount} failed.`,
        });
      } else {
        setBanner({
          type: 'ok',
          text: 'Preview engine journals are continuously synced with active session records. Connect Firebase Cloud Run API to backfill historical Firestore subledgers.',
        });
      }
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Historical backfill failed' });
    }
  };

  // Opening balances live tally
  const openingTotals = useMemo(() => {
    const dr = openingRows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
    const cr = openingRows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
    return {
      dr,
      cr,
      offset: Math.round((dr - cr) * 100) / 100,
    };
  }, [openingRows]);

  if (availableTabs.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-xl mx-auto mt-10">
        <ShieldAlert className="w-10 h-10 text-amber-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Accounting Access Restricted</h2>
        <p className="text-sm text-slate-600 mt-1">
          Your current role does not hold permissions to inspect ledgers or submit expenses. Ask the store Owner to
          enable Accounting permissions in Staff &amp; Roles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Accounts &amp; Double-Entry Ledger</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {isLiveApi
              ? 'Connected to Cloud Firestore General Ledger & Fiscal Period Controls'
              : 'Interactive Preview Mode — Live double-entry derivation from store transactions'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
            <Building2 className="w-4 h-4 text-slate-500" />
            <label htmlFor="acc-branch-select" className="text-xs font-semibold text-slate-600">
              Branch
            </label>
            <select
              id="acc-branch-select"
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

          {isLiveApi && (
            <button
              type="button"
              onClick={() => void refreshLiveData()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
            banner.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700" />
            )}
            <span>{banner.text}</span>
          </div>
          <button type="button" onClick={() => setBanner(null)} className="text-xs font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 flex items-center gap-1 overflow-x-auto">
        {availableTabs.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
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

      {/* 1. OVERVIEW TAB */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Sales</p>
              <p className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1.5">
                {formatInr(overview.netSales)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Gross Profit: <span className="font-mono font-semibold text-slate-800">{formatInr(overview.grossProfit)}</span> ({overview.grossMarginPercent}%)
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Profit</p>
              <p
                className={`text-xl font-bold font-mono tabular-nums mt-1.5 ${
                  overview.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatInr(overview.netProfit)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Operating Expenses: <span className="font-mono font-semibold text-slate-800">{formatInr(overview.totalOperatingExpenses)}</span>
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cash &amp; Bank</p>
              <p className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1.5">
                {formatInr(overview.cashInHandBalance + overview.bankAndClearingBalance)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Cash: <span className="font-mono">{formatInr(overview.cashInHandBalance)}</span> · Bank:{' '}
                <span className="font-mono">{formatInr(overview.bankAndClearingBalance)}</span>
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net GST Position</p>
              <p className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1.5">
                {formatInr(Math.abs(overview.netGstPayable))}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {overview.gstNetPosition === 'PAYABLE' ? 'Net Output GST Payable' : 'Net Eligible ITC Carry-Forward'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Receivables (GL 1300)</p>
              <p className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1.5">
                {formatInr(overview.accountsReceivable)}
              </p>
              <p className="text-xs text-slate-500 mt-1">Customer Khata control balance</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payables (GL 2100)</p>
              <p className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1.5">
                {formatInr(overview.accountsPayable)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Accrued Unpaid Expenses: <span className="font-mono">{formatInr(overview.unpaidAccruedExpenses)}</span>
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Inventory Asset (GL 1400)</p>
              <p className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1.5">
                {formatInr(overview.inventoryGlValue)}
              </p>
              <p className="text-xs text-slate-500 mt-1">PTR batch valuation control</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ledger Integrity</p>
              <p
                className={`text-base font-bold mt-1.5 flex items-center gap-1.5 ${
                  overview.balanceSheetBalanced ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {overview.balanceSheetBalanced ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Books Balanced
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" /> Imbalance Detected
                  </>
                )}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {overview.openPeriodsCount} open / {overview.closedPeriodsCount} closed periods ·{' '}
                {overview.reconciliationExceptionCount} recon alerts
              </p>
            </div>
          </div>

          {/* Recent Journal Activity Summary */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Latest Posted Ledger Vouchers</h2>
              {canViewJournals && (
                <button
                  type="button"
                  onClick={() => setActiveTab('journals')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Inspect Full Journal Register
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-left px-4 py-2.5">Voucher</th>
                    <th className="text-left px-4 py-2.5">Source Type</th>
                    <th className="text-left px-4 py-2.5">Narration</th>
                    <th className="text-right px-4 py-2.5">Debit (₹)</th>
                    <th className="text-right px-4 py-2.5">Credit (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {journals.slice(0, 8).map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 text-slate-700 font-mono text-xs">{j.transactionDate}</td>
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-900">{j.voucherNumber}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{j.entryType.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2.5 text-slate-700 truncate max-w-md">{j.narration}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium text-slate-900">
                        {formatInr(j.debitTotal)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium text-slate-900">
                        {formatInr(j.creditTotal)}
                      </td>
                    </tr>
                  ))}
                  {journals.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        No ledger vouchers posted yet for the selected scope.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. CHART OF ACCOUNTS TAB */}
      {activeTab === 'coa' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['ALL', ...CATEGORY_OPTIONS] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCoaCategoryFilter(cat)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                    coaCategoryFilter === cat
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {cat === 'ALL' ? 'All Categories' : cat}
                </button>
              ))}
              <label className="inline-flex items-center gap-1.5 ml-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={coaShowInactive}
                  onChange={(e) => setCoaShowInactive(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Show inactive
              </label>
            </div>

            {canManageCoa && (
              <button
                type="button"
                onClick={() => setIsAddAccountOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Custom Account
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5">Code</th>
                    <th className="text-left px-4 py-2.5">Account Name</th>
                    <th className="text-left px-4 py-2.5">Category · Type</th>
                    <th className="text-left px-4 py-2.5">Normal</th>
                    <th className="text-right px-4 py-2.5">Net Balance (₹)</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-right px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAccounts.map((acc) => {
                    const bal = accountBalancesMap.get(acc.id) || 0;
                    return (
                      <tr key={acc.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-900">{acc.code}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-900">{acc.name}</div>
                          {acc.description && <div className="text-xs text-slate-500">{acc.description}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">
                          {acc.category} · {acc.subType.replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-medium text-slate-700">{acc.normalBalance}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatInr(bal)}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-medium">
                          {acc.isActive ? (
                            <span className="text-emerald-700">Active</span>
                          ) : (
                            <span className="text-slate-500">Inactive</span>
                          )}
                          {acc.isSystemAccount && <span className="text-slate-400"> · System</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleViewAccountLedger(acc)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              Ledger
                            </button>
                            {canManageCoa && !acc.isSystemAccount && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleToggleAccountActive(acc)}
                                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                                >
                                  {acc.isActive ? 'Deactivate' : 'Activate'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteAccount(acc)}
                                  title="Delete unused custom account"
                                  className="text-rose-600 hover:text-rose-700"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. JOURNAL ENTRIES TAB */}
      {activeTab === 'journals' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={journalSearch}
                onChange={(e) => setJournalSearch(e.target.value)}
                placeholder="Search voucher #, reference #, or narration..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={journalTypeFilter}
              onChange={(e) => setJournalTypeFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              {journalEntryTypes.map((et) => (
                <option key={et} value={et}>
                  {et === 'ALL' ? 'All Entry Types' : et.replace(/_/g, ' ')}
                </option>
              ))}
            </select>

            <select
              value={journalStatusFilter}
              onChange={(e) => setJournalStatusFilter(e.target.value as 'ALL' | 'POSTED' | 'REVERSED')}
              className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="ALL">All Statuses</option>
              <option value="POSTED">Posted</option>
              <option value="REVERSED">Reversed</option>
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="divide-y divide-slate-200">
              {filteredJournals.map((j) => {
                const expanded = Boolean(expandedJournalIds[j.id]);
                return (
                  <div key={j.id}>
                    <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70">
                      <button
                        type="button"
                        onClick={() => setExpandedJournalIds((prev) => ({ ...prev, [j.id]: !prev[j.id] }))}
                        className="flex items-start gap-2.5 text-left flex-1 min-w-[260px]"
                      >
                        {expanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-slate-900">{j.voucherNumber}</span>
                            <span className="text-slate-400">·</span>
                            <span className="font-mono text-slate-600">{j.transactionDate}</span>
                            <span className="text-slate-400">·</span>
                            <span className="font-semibold text-slate-700">{j.entryType.replace(/_/g, ' ')}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-600">Branch: {j.branchId}</span>
                            {j.status === 'REVERSED' && (
                              <>
                                <span className="text-slate-400">·</span>
                                <span className="font-semibold text-amber-700">Reversed</span>
                              </>
                            )}
                          </div>
                          <p className="text-sm text-slate-800 font-medium mt-0.5">{j.narration}</p>
                        </div>
                      </button>

                      <div className="flex items-center gap-4">
                        <div className="text-right font-mono tabular-nums text-xs">
                          <div className="text-slate-900 font-bold">Dr {formatInr(j.debitTotal)}</div>
                          <div className="text-slate-500">Cr {formatInr(j.creditTotal)}</div>
                        </div>

                        {canReverseJournals && j.status === 'POSTED' && !j.reversesEntryId && (
                          <button
                            type="button"
                            onClick={() => {
                              setReverseTarget(j);
                              setReverseReason('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reverse
                          </button>
                        )}
                      </div>
                    </div>

                    {expanded && (
                      <div className="bg-slate-50/70 px-6 pb-3 pt-1 border-t border-slate-100">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-200">
                              <th className="text-left py-1.5">Code</th>
                              <th className="text-left py-1.5">Ledger Account</th>
                              <th className="text-left py-1.5">Description</th>
                              <th className="text-right py-1.5">Debit (₹)</th>
                              <th className="text-right py-1.5">Credit (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/60">
                            {j.lines.map((l) => (
                              <tr key={l.id}>
                                <td className="py-1.5 font-mono font-semibold text-slate-800">{l.accountCode}</td>
                                <td className="py-1.5 font-medium text-slate-800">{l.accountName}</td>
                                <td className="py-1.5 text-slate-600">{l.description || '—'}</td>
                                <td className="py-1.5 text-right font-mono tabular-nums text-slate-900">
                                  {l.debit > 0 ? formatInr(l.debit) : '—'}
                                </td>
                                <td className="py-1.5 text-right font-mono tabular-nums text-slate-900">
                                  {l.credit > 0 ? formatInr(l.credit) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredJournals.length === 0 && (
                <div className="p-8 text-center text-sm text-slate-500">
                  No journal vouchers matched your search filters.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. CASH & BANK TAB */}
      {activeTab === 'cash_bank' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">Cash Registers &amp; Bank Accounts</h2>
            {canManageCashBank && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTransferOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Contra Transfer
                </button>
                <button
                  type="button"
                  onClick={() => setIsBankChargeOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Record Bank Charge
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddBankOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  Add Bank Account
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cashAccounts.map((ca) => (
              <div key={ca.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Cash Register · GL {ca.ledgerAccountCode}</span>
                  <span className="font-semibold text-emerald-700">{ca.status}</span>
                </div>
                <p className="text-sm font-bold text-slate-900 mt-1">{ca.name}</p>
                <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-2">
                  {formatInr(accountBalancesMap.get(ca.ledgerAccountId) || 0)}
                </p>
              </div>
            ))}

            {bankAccounts.map((ba) => (
              <div key={ba.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {ba.bankName} · GL {ba.ledgerAccountCode}
                  </span>
                  <span className="font-semibold text-emerald-700">{ba.status}</span>
                </div>
                <p className="text-sm font-bold text-slate-900 mt-1">{ba.accountName}</p>
                <p className="text-xs text-slate-500 font-mono">
                  {ba.maskedAccountNumber}
                  {ba.ifscCode ? ` · ${ba.ifscCode}` : ''}
                </p>
                <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-2">
                  {formatInr(accountBalancesMap.get(ba.ledgerAccountId) || 0)}
                </p>
              </div>
            ))}
          </div>

          {/* Bank Statement Import & Matching */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Bank Statement Import &amp; Reconciliation</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Import CSV or JSON statement extracts exported from your netbanking portal to match entries against posted
                ledger vouchers. Direct bank API feeds are not connected.
              </p>
            </div>

            {canManageCashBank && (
              <form onSubmit={handleImportBankStatement} className="space-y-3 border-t border-slate-100 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Account</label>
                    <select
                      value={stmtBankId}
                      onChange={(e) => setStmtBankId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    >
                      {bankAccounts.map((ba) => (
                        <option key={ba.id} value={ba.id}>
                          {ba.bankName} ({ba.maskedAccountNumber})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Statement Date</label>
                    <input
                      type="date"
                      value={stmtDate}
                      onChange={(e) => setStmtDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Closing Statement Balance (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={stmtBalance}
                      onChange={(e) => setStmtBalance(e.target.value)}
                      placeholder="Auto or enter ending balance"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    CSV Rows (Date,Description,Reference,Debit,Credit) or JSON Array
                  </label>
                  <textarea
                    rows={3}
                    value={stmtRawText}
                    onChange={(e) => setStmtRawText(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  Import Statement for Matching
                </button>
              </form>
            )}

            {reconciliations.length > 0 && (
              <div className="space-y-4 border-t border-slate-200 pt-4">
                {reconciliations.map((rec) => (
                  <div key={rec.id} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-900">
                        {rec.bankAccountName} · Statement {rec.statementDate}
                      </span>
                      <span className="font-mono text-slate-700">
                        Statement: {formatInr(rec.statementBalance)} · Ledger: {formatInr(rec.ledgerBalance)} · Variance:{' '}
                        <strong>{formatInr(rec.difference)}</strong> · Matched {rec.matchedCount}/{rec.lines.length}
                      </span>
                    </div>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="text-left px-3 py-2">Date</th>
                            <th className="text-left px-3 py-2">Description</th>
                            <th className="text-left px-3 py-2">Reference</th>
                            <th className="text-right px-3 py-2">Debit</th>
                            <th className="text-right px-3 py-2">Credit</th>
                            <th className="text-left px-3 py-2">Match Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rec.lines.map((line) => (
                            <tr key={line.id}>
                              <td className="px-3 py-2 font-mono">{line.date}</td>
                              <td className="px-3 py-2 font-medium text-slate-800">{line.description}</td>
                              <td className="px-3 py-2 font-mono text-slate-500">{line.reference || '—'}</td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums">
                                {line.debit > 0 ? formatInr(line.debit) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums">
                                {line.credit > 0 ? formatInr(line.credit) : '—'}
                              </td>
                              <td className="px-3 py-2">
                                {line.matchedJournalEntryId ? (
                                  <span className="font-mono font-semibold text-emerald-700">
                                    Matched: {line.matchedVoucherNumber}
                                  </span>
                                ) : canManageCashBank ? (
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={matchSelections[line.id] || ''}
                                      onChange={(e) =>
                                        setMatchSelections((prev) => ({ ...prev, [line.id]: e.target.value }))
                                      }
                                      className="px-2 py-1 border border-slate-200 rounded text-xs max-w-[200px]"
                                    >
                                      <option value="">Select voucher...</option>
                                      {journals.slice(0, 40).map((j) => (
                                        <option key={j.id} value={j.id}>
                                          {j.voucherNumber} ({formatInr(j.debitTotal)})
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => void handleMatchStatementLine(rec.id, line.id)}
                                      className="px-2 py-1 font-semibold text-white bg-blue-600 rounded hover:bg-blue-700"
                                    >
                                      Match
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-slate-500">Unmatched</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. EXPENSES TAB */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={expStatusFilter}
                onChange={(e) => setExpStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="ALL">All Statuses</option>
                <option value="SUBMITTED">Submitted (Pending Approval)</option>
                <option value="APPROVED_UNPAID">Approved — Unpaid</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="PAID">Paid</option>
                <option value="REVERSED">Reversed</option>
              </select>

              <select
                value={expCategoryFilter}
                onChange={(e) => setExpCategoryFilter(e.target.value)}
                className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="ALL">All Expense Categories</option>
                {operatingExpenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>

            {canCreateExpenses && (
              <button
                type="button"
                onClick={() => setIsAddExpenseOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                {canApproveExpenses ? 'Record Operating Expense' : 'Submit Expense for Approval'}
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5">Expense # · Date</th>
                    <th className="text-left px-4 py-2.5">Category</th>
                    <th className="text-left px-4 py-2.5">Vendor · Invoice</th>
                    <th className="text-right px-4 py-2.5">Taxable</th>
                    <th className="text-right px-4 py-2.5">GST (ITC)</th>
                    <th className="text-right px-4 py-2.5">Total (₹)</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-right px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.map((exp) => {
                    const totalTax = exp.cgst + exp.sgst + exp.igst;
                    return (
                      <tr key={exp.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5">
                          <div className="font-mono text-xs font-bold text-slate-900">{exp.expenseNumber}</div>
                          <div className="font-mono text-xs text-slate-500">{exp.expenseDate}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-medium text-slate-800">
                          {exp.categoryAccountCode} · {exp.categoryAccountName}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{exp.vendorName}</div>
                          <div className="text-xs text-slate-500">
                            {exp.invoiceNumber || 'No bill #'}
                            {exp.vendorGstin ? ` · ${exp.vendorGstin}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-800">
                          {formatInr(exp.taxableAmount)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-xs text-slate-700">
                          {formatInr(totalTax)}
                          <div className="text-[11px] text-slate-400">
                            {exp.itcEligible ? 'ITC Eligible' : 'Non-ITC'}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                          {formatInr(exp.totalAmount)}
                          {exp.outstandingAmount > 0 && exp.status !== 'REVERSED' && (
                            <div className="text-[11px] font-normal text-amber-700">
                              Due {formatInr(exp.outstandingAmount)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-semibold">
                          <span
                            className={
                              exp.status === 'PAID'
                                ? 'text-emerald-700'
                                : exp.status === 'SUBMITTED'
                                ? 'text-blue-700'
                                : exp.status === 'REVERSED'
                                ? 'text-slate-500'
                                : 'text-amber-700'
                            }
                          >
                            {exp.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-2">
                          {canApproveExpenses && exp.status === 'SUBMITTED' && (
                            <button
                              type="button"
                              onClick={() => void handleApproveExpense(exp)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                            >
                              Approve
                            </button>
                          )}
                          {canPayExpenses &&
                            (exp.status === 'APPROVED_UNPAID' || exp.status === 'PARTIALLY_PAID') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayExpenseTarget(exp);
                                  setPayExpRef('');
                                }}
                                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                              >
                                Pay Now
                              </button>
                            )}
                          {canApproveExpenses && exp.status !== 'REVERSED' && exp.status !== 'SUBMITTED' && (
                            <button
                              type="button"
                              onClick={() => {
                                setReverseExpenseTarget(exp);
                                setReverseExpenseReason('');
                              }}
                              className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                            >
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredExpenses.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                        No operating expenses recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. OPENING & PERIODS TAB */}
      {activeTab === 'periods' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Opening Balances Form */}
          {canPostOpening && (
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Opening Balance Sheet Entry</h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Bring historical ledger balances online. Any net difference automatically offsets to 3200 Opening
                  Balance Equity.
                </p>
              </div>

              <form onSubmit={handlePostOpeningBalances} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">As-Of Date</label>
                    <input
                      type="date"
                      value={openingAsOfDate}
                      onChange={(e) => setOpeningAsOfDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Notes</label>
                    <input
                      type="text"
                      value={openingNotes}
                      onChange={(e) => setOpeningNotes(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {openingRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <select
                        value={row.accountId}
                        onChange={(e) =>
                          setOpeningRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, accountId: e.target.value } : r))
                          )
                        }
                        className="col-span-5 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Debit"
                        value={row.debit}
                        onChange={(e) =>
                          setOpeningRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, debit: e.target.value } : r))
                          )
                        }
                        className="col-span-3 px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg text-right"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Credit"
                        value={row.credit}
                        onChange={(e) =>
                          setOpeningRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, credit: e.target.value } : r))
                          )
                        }
                        className="col-span-3 px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg text-right"
                      />
                      <button
                        type="button"
                        onClick={() => setOpeningRows((prev) => prev.filter((_, i) => i !== idx))}
                        className="col-span-1 text-slate-400 hover:text-rose-600 flex justify-center"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setOpeningRows((prev) => [
                        ...prev,
                        { accountId: accounts[0]?.id || 'coa_1100', debit: '0', credit: '0', description: '' },
                      ])
                    }
                    className="font-semibold text-blue-600 hover:text-blue-700"
                  >
                    + Add Line
                  </button>
                  <div className="font-mono text-slate-700">
                    Dr {formatInr(openingTotals.dr)} · Cr {formatInr(openingTotals.cr)} · Offset (3200):{' '}
                    <strong>{formatInr(Math.abs(openingTotals.offset))}</strong>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Post Balanced Opening Journal
                </button>
              </form>
            </div>
          )}

          {/* Financial Periods */}
          <div className={`${canPostOpening ? 'lg:col-span-6' : 'lg:col-span-12'} bg-white border border-slate-200 rounded-xl overflow-hidden`}>
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-slate-600" />
                <h2 className="text-sm font-bold text-slate-900">Indian Financial Year Accounting Periods</h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5">Period</th>
                    <th className="text-left px-4 py-2.5">Window</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-right px-4 py-2.5">Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periods.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-semibold text-slate-900">
                        {p.periodName}
                        <span className="text-slate-400 font-normal"> · {p.financialYear}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">
                        {p.startDate} → {p.endDate}
                      </td>
                      <td className="px-4 py-2.5 font-semibold">
                        {p.status === 'OPEN' ? (
                          <span className="text-emerald-700 inline-flex items-center gap-1">
                            <Unlock className="w-3.5 h-3.5" /> Open
                          </span>
                        ) : (
                          <span className="text-slate-700 inline-flex items-center gap-1">
                            <Lock className="w-3.5 h-3.5" /> Closed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {p.status === 'OPEN' && canClosePeriods && (
                          <button
                            type="button"
                            onClick={() => {
                              setPeriodModal({ mode: 'close', period: p });
                              setPeriodReasonOrNotes('');
                            }}
                            className="font-semibold text-amber-700 hover:text-amber-800"
                          >
                            Close Period
                          </button>
                        )}
                        {p.status === 'CLOSED' && canReopenPeriods && (
                          <button
                            type="button"
                            onClick={() => {
                              setPeriodModal({ mode: 'reopen', period: p });
                              setPeriodReasonOrNotes('');
                            }}
                            className="font-semibold text-blue-600 hover:text-blue-700"
                          >
                            Reopen (Audit)
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 7. RECONCILIATION TAB */}
      {activeTab === 'reconciliation' && reconCheck && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Control Ledger vs Operational Subledger Reconciliation</h2>
              <p className="text-xs text-slate-600">
                Verifies GL control accounts (AR 1300, AP 2100, Inventory 1400) against live Khata, Supplier, and
                Batch PTR valuation records.
              </p>
            </div>
            {canManageRecon && (
              <button
                type="button"
                onClick={() => void handleRunBackfill()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Run Idempotent Historical Backfill
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5">Control Dimension</th>
                  <th className="text-right px-4 py-2.5">General Ledger (₹)</th>
                  <th className="text-right px-4 py-2.5">Operational Subledger (₹)</th>
                  <th className="text-right px-4 py-2.5">Variance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-900">Accounts Receivable (GL 1300) vs Customer Khata</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatInr(reconCheck.summary.accountsReceivableGl)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatInr(reconCheck.summary.customerKhataSubledger)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-bold">
                    {formatInr(reconCheck.summary.customerKhataSubledger - reconCheck.summary.accountsReceivableGl)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-900">Accounts Payable (GL 2100) vs Supplier Balances</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatInr(reconCheck.summary.accountsPayableGl)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatInr(reconCheck.summary.supplierPayablesSubledger)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-bold">
                    {formatInr(reconCheck.summary.supplierPayablesSubledger - reconCheck.summary.accountsPayableGl)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-900">Inventory Asset (GL 1400) vs Batch Stock @ PTR</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatInr(reconCheck.summary.inventoryGl)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatInr(reconCheck.summary.inventoryBatchPtrValuation)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-bold">
                    {formatInr(reconCheck.summary.inventoryBatchPtrValuation - reconCheck.summary.inventoryGl)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Exception Alerts ({reconCheck.exceptionCount})
            </h3>
            {reconCheck.exceptions.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium py-2">
                <CheckCircle2 className="w-4 h-4" />
                Zero GL/subledger exceptions detected.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {reconCheck.exceptions.map((ex) => (
                  <div key={ex.id} className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-amber-800">
                        {ex.severity} · {ex.category}
                      </div>
                      <div className="text-sm font-semibold text-slate-900 mt-0.5">{ex.title}</div>
                      <p className="text-xs text-slate-600 mt-0.5">{ex.description}</p>
                    </div>
                    {typeof ex.difference === 'number' && (
                      <div className="font-mono tabular-nums text-sm font-bold text-slate-900">
                        {formatInr(ex.difference)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODALS */}
      {/* Add Custom Account Modal */}
      {isAddAccountOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add Custom Ledger Account</h3>
              <button type="button" onClick={() => setIsAddAccountOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Account Code *</label>
                  <input
                    required
                    value={newAccCode}
                    onChange={(e) => setNewAccCode(e.target.value)}
                    placeholder="e.g. 5310"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
                  <select
                    value={newAccCategory}
                    onChange={(e) => {
                      const cat = e.target.value as AccountCategory;
                      setNewAccCategory(cat);
                      setNewAccNormalBalance(cat === 'ASSETS' || cat === 'EXPENSES' ? 'DEBIT' : 'CREDIT');
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Account Name *</label>
                <input
                  required
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="e.g. Cold Storage Maintenance"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sub-Type</label>
                  <input
                    value={newAccSubType}
                    onChange={(e) => setNewAccSubType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Normal Balance</label>
                  <select
                    value={newAccNormalBalance}
                    onChange={(e) => setNewAccNormalBalance(e.target.value as NormalBalance)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="DEBIT">DEBIT</option>
                    <option value="CREDIT">CREDIT</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <input
                  value={newAccDesc}
                  onChange={(e) => setNewAccDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddAccountOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg">
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Ledger Drilldown Modal */}
      {ledgerModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-4xl w-full max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {ledgerModalData.account.code} — {ledgerModalData.account.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Branch: {ledgerModalData.branchId} · Opening: {formatInr(ledgerModalData.openingBalance)} · Closing:{' '}
                  <strong className="text-slate-900">{formatInr(ledgerModalData.closingBalance)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLedgerModalData(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Voucher</th>
                    <th className="text-left px-3 py-2">Narration</th>
                    <th className="text-right px-3 py-2">Debit (₹)</th>
                    <th className="text-right px-3 py-2">Credit (₹)</th>
                    <th className="text-right px-3 py-2">Running Bal (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledgerModalData.entries.map((e, i) => (
                    <tr key={`${e.entryId}_${i}`}>
                      <td className="px-3 py-2 font-mono">{e.transactionDate}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-900">{e.voucherNumber}</td>
                      <td className="px-3 py-2 text-slate-700">{e.narration}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {e.debit > 0 ? formatInr(e.debit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {e.credit > 0 ? formatInr(e.credit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatInr(e.runningBalance)}
                      </td>
                    </tr>
                  ))}
                  {ledgerModalData.entries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                        No movements posted on this ledger account.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Journal Modal */}
      {reverseTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Reverse Voucher {reverseTarget.voucherNumber}
            </h3>
            <p className="text-xs text-slate-600">
              Original vouchers remain immutable. This action posts an equal and opposite reversal journal with an
              audited reason.
            </p>
            <form onSubmit={handleReverseJournal} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Reversal Reason *</label>
                <input
                  required
                  minLength={4}
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="e.g. Incorrect account classification"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReverseTarget(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg">
                  Post Reversal Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Bank Account Modal */}
      {isAddBankOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Register Store Bank Account</h3>
            <form onSubmit={handleCreateBankAccount} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Account Label *</label>
                <input
                  required
                  value={bankAccName}
                  onChange={(e) => setBankAccName(e.target.value)}
                  placeholder="e.g. ICICI OD Current Account"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name *</label>
                  <input
                    required
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="ICICI Bank"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Last 4 Digits *</label>
                  <input
                    required
                    maxLength={4}
                    minLength={4}
                    value={bankLast4}
                    onChange={(e) => setBankLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4910"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">IFSC Code</label>
                  <input
                    value={bankIfsc}
                    onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                    placeholder="ICIC0000104"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Opening Balance (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bankOpenBal}
                    onChange={(e) => setBankOpenBal(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Location</label>
                <input
                  value={bankBranchName}
                  onChange={(e) => setBankBranchName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddBankOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg">
                  Create Bank Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contra Internal Transfer Modal */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Internal Cash ↔ Bank Contra Transfer</h3>
            <form onSubmit={handleInternalTransfer} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">From Account *</label>
                <select
                  value={trfFromId}
                  onChange={(e) => setTrfFromId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {liquidAssetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">To Account *</label>
                <select
                  value={trfToId}
                  onChange={(e) => setTrfToId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {liquidAssetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={trfAmount}
                    onChange={(e) => setTrfAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Transfer Date</label>
                  <input
                    type="date"
                    value={trfDate}
                    onChange={(e) => setTrfDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deposit Slip / UTR Ref</label>
                <input
                  value={trfRef}
                  onChange={(e) => setTrfRef(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  value={trfNotes}
                  onChange={(e) => setTrfNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTransferOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg">
                  Post Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bank Charge Modal */}
      {isBankChargeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Record Bank Charge / MDR Fee</h3>
            <form onSubmit={handleBankCharge} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bank / Settlement Account</label>
                <select
                  value={bchgAccId}
                  onChange={(e) => setBchgAccId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {liquidAssetAccounts
                    .filter((a) => a.subType !== 'CASH')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Charge Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={bchgAmount}
                    onChange={(e) => setBchgAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Charge Date</label>
                  <input
                    type="date"
                    value={bchgDate}
                    onChange={(e) => setBchgDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
                <input
                  required
                  value={bchgDesc}
                  onChange={(e) => setBchgDesc(e.target.value)}
                  placeholder="e.g. Monthly POS terminal MDR fee"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBankChargeOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg">
                  Post Charge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Submit Expense Modal */}
      {isAddExpenseOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Record Store Operating Expense</h3>
              <button
                type="button"
                onClick={() => setIsAddExpenseOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateExpense} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Category *</label>
                  <select
                    value={expCatId}
                    onChange={(e) => setExpCatId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {operatingExpenseAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Date</label>
                  <input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor / Payee *</label>
                  <input
                    required
                    value={expVendor}
                    onChange={(e) => setExpVendor(e.target.value)}
                    placeholder="e.g. Adani Electricity Mumbai"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bill / Invoice #</label>
                  <input
                    value={expInvNo}
                    onChange={(e) => setExpInvNo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor GSTIN (Optional)</label>
                  <input
                    value={expVendorGstin}
                    onChange={(e) => setExpVendorGstin(e.target.value.toUpperCase())}
                    placeholder="27AAAAA0000A1Z5"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Taxable Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={expTaxable}
                    onChange={(e) => setExpTaxable(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">CGST (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={expCgst}
                    onChange={(e) => setExpCgst(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SGST (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={expSgst}
                    onChange={(e) => setExpSgst(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">IGST (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={expIgst}
                    onChange={(e) => setExpIgst(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={expItcEligible}
                  onChange={(e) => setExpItcEligible(e.target.checked)}
                />
                Input Tax Credit (ITC) Eligible — debit Input GST ledgers (1510/1520/1530)
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Settlement Mode</label>
                  <select
                    value={expPayMode}
                    onChange={(e) =>
                      setExpPayMode(e.target.value as 'UNPAID' | 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD')
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="UNPAID">Unpaid / Accrued (GL 2300)</option>
                    <option value="CASH">Cash Counter</option>
                    <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>

                {expPayMode !== 'UNPAID' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Paid From Account</label>
                    <select
                      value={expPayAccId}
                      onChange={(e) => setExpPayAccId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    >
                      {liquidAssetAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddExpenseOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg">
                  {canApproveExpenses ? 'Approve & Post' : 'Submit Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Accrued Expense Modal */}
      {payExpenseTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Settle Expense {payExpenseTarget.expenseNumber}</h3>
            <p className="text-xs text-slate-600">
              Vendor: <strong>{payExpenseTarget.vendorName}</strong> · Due:{' '}
              <strong className="font-mono">{formatInr(payExpenseTarget.outstandingAmount)}</strong>
            </p>
            <form onSubmit={handlePayExpenseSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Mode</label>
                <select
                  value={payExpMode}
                  onChange={(e) => setPayExpMode(e.target.value as 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">Card</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Credit Account</label>
                <select
                  value={payExpAccId}
                  onChange={(e) => setPayExpAccId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {liquidAssetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={payExpDate}
                    onChange={(e) => setPayExpDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">UTR / Reference</label>
                  <input
                    value={payExpRef}
                    onChange={(e) => setPayExpRef(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayExpenseTarget(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">
                  Confirm Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reverse Expense Modal */}
      {reverseExpenseTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Reverse Expense {reverseExpenseTarget.expenseNumber}</h3>
            <form onSubmit={handleReverseExpenseSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reversal Reason *</label>
                <input
                  required
                  minLength={4}
                  value={reverseExpenseReason}
                  onChange={(e) => setReverseExpenseReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReverseExpenseTarget(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg">
                  Reverse Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close / Reopen Period Modal */}
      {periodModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {periodModal.mode === 'close' ? 'Close Accounting Period' : 'Reopen Closed Accounting Period'} —{' '}
              {periodModal.period.periodName}
            </h3>
            <p className="text-xs text-slate-600">
              {periodModal.mode === 'close'
                ? 'Closed periods block historical POS, purchase, expense, and adjustment journal postings within this date window.'
                : 'Reopening a closed period is an owner-level audited event requiring a documented reason.'}
            </p>
            <form onSubmit={handlePeriodAction} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {periodModal.mode === 'close' ? 'Closing Notes (Optional)' : 'Mandatory Audit Reason *'}
                </label>
                <input
                  required={periodModal.mode === 'reopen'}
                  minLength={periodModal.mode === 'reopen' ? 5 : 0}
                  value={periodReasonOrNotes}
                  onChange={(e) => setPeriodReasonOrNotes(e.target.value)}
                  placeholder={periodModal.mode === 'reopen' ? 'e.g. Post CA year-end depreciation entry' : 'Monthly books closed'}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPeriodModal(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 text-xs font-semibold text-white rounded-lg ${
                    periodModal.mode === 'close' ? 'bg-amber-600' : 'bg-blue-600'
                  }`}
                >
                  {periodModal.mode === 'close' ? 'Lock Period' : 'Confirm Reopen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

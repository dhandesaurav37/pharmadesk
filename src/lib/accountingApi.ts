/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiClientError, ApiSessionConfig, generateIdempotencyKey } from './customerApi.ts';

export type AccountCategory = 'ASSETS' | 'LIABILITIES' | 'EQUITY' | 'INCOME' | 'EXPENSES';
export type NormalBalance = 'DEBIT' | 'CREDIT';

export interface ChartOfAccount {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  category: AccountCategory;
  subType: string;
  normalBalance: NormalBalance;
  parentAccountId: string | null;
  isSystemAccount: boolean;
  systemCode: string | null;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface JournalLine {
  id: string;
  entryId: string;
  tenantId: string;
  branchId: string;
  transactionDate: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountCategory: AccountCategory;
  normalBalance: NormalBalance;
  debitPaise: number;
  creditPaise: number;
  debit: number;
  credit: number;
  description: string | null;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  branchId: string;
  voucherNumber: string;
  entryType: string;
  status: 'POSTED' | 'REVERSED';
  transactionDate: string;
  periodId: string;
  referenceType: string;
  referenceId: string;
  referenceNumber: string | null;
  narration: string;
  idempotencyKey: string;
  debitTotalPaise: number;
  creditTotalPaise: number;
  debitTotal: number;
  creditTotal: number;
  lines: JournalLine[];
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface FinancialPeriod {
  id: string;
  tenantId: string;
  financialYear: string;
  periodName: string;
  periodNumber: number;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED';
  closedAt: string | null;
  closedBy: string | null;
  closeNotes: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccount {
  id: string;
  tenantId: string;
  branchId: string;
  accountName: string;
  bankName: string;
  branchName: string | null;
  ifscCode: string | null;
  maskedAccountNumber: string;
  ledgerAccountId: string;
  ledgerAccountCode: string;
  status: 'ACTIVE' | 'INACTIVE';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashAccount {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  ledgerAccountId: string;
  ledgerAccountCode: string;
  status: 'ACTIVE' | 'INACTIVE';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseRecord {
  id: string;
  tenantId: string;
  branchId: string;
  expenseNumber: string;
  expenseDate: string;
  categoryAccountId: string;
  categoryAccountCode: string;
  categoryAccountName: string;
  vendorName: string;
  vendorGstin: string | null;
  invoiceNumber: string | null;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  itcEligible: boolean;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: 'SUBMITTED' | 'APPROVED_UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REVERSED' | 'REJECTED';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  paymentMode: 'UNPAID' | 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | null;
  paymentAccountId: string | null;
  paymentReference: string | null;
  receiptAttachmentPath: string | null;
  notes: string | null;
  recognitionJournalId: string | null;
  paymentJournalId: string | null;
  reversalJournalId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankStatementLine {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  debit: number;
  credit: number;
  matchedJournalEntryId: string | null;
  matchedVoucherNumber: string | null;
  matchedAt: string | null;
}

export interface BankReconciliation {
  id: string;
  tenantId: string;
  bankAccountId: string;
  bankAccountName: string;
  ledgerAccountId: string;
  statementDate: string;
  statementBalance: number;
  ledgerBalance: number;
  difference: number;
  lines: BankStatementLine[];
  matchedCount: number;
  unmatchedCount: number;
  status: 'OPEN' | 'MATCHED';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingOverview {
  netSales: number;
  grossProfit: number;
  grossMarginPercent: number;
  netProfit: number;
  totalOperatingExpenses: number;
  unpaidAccruedExpenses: number;
  cashInHandBalance: number;
  bankAndClearingBalance: number;
  accountsReceivable: number;
  accountsPayable: number;
  inventoryGlValue: number;
  netGstPayable: number;
  gstNetPosition: 'PAYABLE' | 'ITC_CARRY_FORWARD';
  balanceSheetBalanced: boolean;
  openPeriodsCount: number;
  closedPeriodsCount: number;
  reconciliationExceptionCount: number;
}

export interface TrialBalanceData {
  branchId: string;
  fromDate: string | null;
  toDate: string | null;
  rows: Array<{
    accountId: string;
    code: string;
    name: string;
    category: AccountCategory;
    normalBalance: NormalBalance;
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
    netBalance: number;
  }>;
  totals: {
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
    isBalanced: boolean;
  };
}

export interface ProfitLossData {
  branchId: string;
  fromDate: string | null;
  toDate: string | null;
  incomeItems: Array<{ accountId: string; code: string; name: string; subType: string; amount: number }>;
  cogsItems: Array<{ accountId: string; code: string; name: string; subType: string; amount: number }>;
  operatingExpenseItems: Array<{ accountId: string; code: string; name: string; subType: string; amount: number }>;
  summary: {
    netSales: number;
    otherIncome: number;
    totalIncome: number;
    totalCogs: number;
    grossProfit: number;
    grossMarginPercent: number;
    totalOperatingExpenses: number;
    totalExpenses: number;
    netProfit: number;
  };
}

export interface BranchPnlData {
  fromDate: string | null;
  toDate: string | null;
  branches: Array<{
    branchId: string;
    netSales: number;
    totalCogs: number;
    grossProfit: number;
    operatingExpenses: number;
    netProfit: number;
  }>;
}

export interface BalanceSheetData {
  branchId: string;
  asOfDate: string;
  assets: { items: Array<{ accountId: string; code: string; name: string; subType: string; balance: number }>; total: number };
  liabilities: { items: Array<{ accountId: string; code: string; name: string; subType: string; balance: number }>; total: number };
  equity: { items: Array<{ accountId: string; code: string; name: string; subType: string; balance: number }>; total: number };
  totals: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
    difference: number;
    isBalanced: boolean;
  };
}

export interface CashFlowData {
  branchId: string;
  fromDate: string | null;
  toDate: string | null;
  openingCashAndBankBalance: number;
  operatingActivities: { cashInflows: number; cashOutflows: number; netOperatingCashFlow: number };
  financingActivities: { capitalInflows: number; capitalOutflows: number; netFinancingCashFlow: number };
  internalTransfersVolume: number;
  netIncreaseInCashAndBank: number;
  closingCashAndBankBalance: number;
}

export interface CashOrBankBookData {
  bookType: 'CASH' | 'BANK';
  branchId: string;
  fromDate: string | null;
  toDate: string | null;
  openingBalance: number;
  closingBalance: number;
  totalReceipts: number;
  totalPayments: number;
  rows: Array<{
    entryId: string;
    voucherNumber: string;
    transactionDate: string;
    entryType: string;
    status: string;
    accountCode: string;
    accountName: string;
    narration: string;
    receipt: number;
    payment: number;
    balance: number;
  }>;
}

export interface GstSummaryData {
  branchId: string;
  fromDate: string | null;
  toDate: string | null;
  disclaimer: string;
  outputTax: {
    cgst: number;
    sgst: number;
    igst: number;
    totalOutputGst: number;
    salesReturnsTaxAdjustment: number;
  };
  inputTaxCredit: {
    cgst: number;
    sgst: number;
    igst: number;
    totalEligibleItc: number;
    purchaseReturnItcReversal: number;
  };
  taxableSalesTotal: number;
  zeroRatedAndExemptSales: number;
  netGstPayable: number;
  netPosition: 'PAYABLE' | 'ITC_CARRY_FORWARD';
}

export interface ExpenseSummaryData {
  branchId: string;
  fromDate: string | null;
  toDate: string | null;
  totalExpenseCount: number;
  totalExpenseAmount: number;
  totalPaidAmount: number;
  totalUnpaidAccrued: number;
  byCategory: Array<{ code: string; name: string; count: number; total: number; paid: number }>;
}

export interface DiscrepancyException {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
  category: string;
  title: string;
  description: string;
  subledgerValue?: number;
  glValue?: number;
  difference?: number;
  referenceType?: string;
  referenceId?: string;
}

export interface ReconciliationCheckData {
  checkedAt: string;
  exceptionCount: number;
  criticalCount: number;
  highCount: number;
  summary: {
    accountsReceivableGl: number;
    customerKhataSubledger: number;
    accountsPayableGl: number;
    supplierPayablesSubledger: number;
    openSupplierInvoicesSubledger: number;
    inventoryGl: number;
    inventoryBatchPtrValuation: number;
  };
  exceptions: DiscrepancyException[];
}

export interface AccountLedgerData {
  account: ChartOfAccount;
  branchId: string;
  fromDate: string | null;
  toDate: string | null;
  openingBalance: number;
  closingBalance: number;
  entries: Array<{
    entryId: string;
    voucherNumber: string;
    transactionDate: string;
    entryType: string;
    status: string;
    branchId: string;
    referenceNumber: string | null;
    narration: string;
    debit: number;
    credit: number;
    runningBalance: number;
  }>;
}

async function accountingRequest<T>(
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
      payload?.detail || payload?.message || 'Accounting request failed',
      payload?.errors
    );
  }
  return payload as T;
}

function buildFilterQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      qs.set(k, String(v));
    }
  });
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export const accountingApi = {
  async getOverview(session: ApiSessionConfig, filters: { branchId?: string; fromDate?: string; toDate?: string } = {}) {
    const res = await accountingRequest<{ success: boolean; data: AccountingOverview }>(
      session,
      `/api/v1/accounting/overview${buildFilterQuery(filters)}`
    );
    return res.data;
  },

  async listAccounts(session: ApiSessionConfig, params: { category?: AccountCategory; includeInactive?: boolean } = {}) {
    const res = await accountingRequest<{ success: boolean; data: { accounts: ChartOfAccount[]; count: number } }>(
      session,
      `/api/v1/accounting/accounts${buildFilterQuery(params)}`
    );
    return res.data.accounts;
  },

  async createAccount(
    session: ApiSessionConfig,
    payload: {
      code: string;
      name: string;
      category: AccountCategory;
      subType?: string;
      normalBalance?: NormalBalance;
      parentAccountId?: string | null;
      description?: string;
    }
  ) {
    const res = await accountingRequest<{ success: boolean; data: { account: ChartOfAccount } }>(
      session,
      '/api/v1/accounting/accounts',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return res.data.account;
  },

  async updateAccount(
    session: ApiSessionConfig,
    accountId: string,
    payload: { name?: string; description?: string; isActive?: boolean; parentAccountId?: string | null }
  ) {
    const res = await accountingRequest<{ success: boolean; data: { account: ChartOfAccount } }>(
      session,
      `/api/v1/accounting/accounts/${accountId}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
    return res.data.account;
  },

  async deleteAccount(session: ApiSessionConfig, accountId: string) {
    await accountingRequest<{ success: boolean }>(session, `/api/v1/accounting/accounts/${accountId}`, {
      method: 'DELETE',
    });
  },

  async getAccountLedger(
    session: ApiSessionConfig,
    accountId: string,
    filters: { branchId?: string; fromDate?: string; toDate?: string } = {}
  ) {
    const res = await accountingRequest<{ success: boolean; data: AccountLedgerData }>(
      session,
      `/api/v1/accounting/accounts/${accountId}/ledger${buildFilterQuery(filters)}`
    );
    return res.data;
  },

  async listJournalEntries(
    session: ApiSessionConfig,
    filters: {
      branchId?: string;
      fromDate?: string;
      toDate?: string;
      accountId?: string;
      entryType?: string;
      status?: string;
      search?: string;
      limit?: number;
    } = {}
  ) {
    const res = await accountingRequest<{ success: boolean; data: { entries: JournalEntry[]; count: number } }>(
      session,
      `/api/v1/accounting/journal-entries${buildFilterQuery(filters)}`
    );
    return res.data.entries;
  },

  async reverseJournalEntry(session: ApiSessionConfig, entryId: string, reason: string, reversalDate?: string) {
    const res = await accountingRequest<{ success: boolean; data: { reversalEntry: JournalEntry; originalEntry: JournalEntry } }>(
      session,
      `/api/v1/accounting/journal-entries/${entryId}/reverse`,
      { method: 'POST', body: JSON.stringify({ reason, reversalDate }) }
    );
    return res.data;
  },

  async postOpeningBalances(
    session: ApiSessionConfig,
    payload: {
      branchId?: string;
      asOfDate: string;
      entries: Array<{ accountId: string; debit?: number; credit?: number; description?: string }>;
      notes?: string;
    }
  ) {
    const res = await accountingRequest<{ success: boolean; data: { journal: JournalEntry } }>(
      session,
      '/api/v1/accounting/opening-balances',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return res.data;
  },

  async listCashAndBankAccounts(session: ApiSessionConfig) {
    const res = await accountingRequest<{
      success: boolean;
      data: {
        cashAccounts: CashAccount[];
        bankAccounts: BankAccount[];
        reconciliations: BankReconciliation[];
      };
    }>(session, '/api/v1/accounting/cash-bank');
    return res.data;
  },

  async createBankAccount(
    session: ApiSessionConfig,
    payload: {
      branchId?: string;
      accountName: string;
      bankName: string;
      branchName?: string;
      ifscCode?: string;
      accountNumberLast4: string;
      openingBalance?: number;
      openingBalanceDate?: string;
    }
  ) {
    const res = await accountingRequest<{ success: boolean; data: { bankAccount: BankAccount } }>(
      session,
      '/api/v1/accounting/bank-accounts',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return res.data.bankAccount;
  },

  async recordInternalTransfer(
    session: ApiSessionConfig,
    payload: {
      branchId?: string;
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      transferDate?: string;
      referenceNumber?: string;
      notes?: string;
    }
  ) {
    const res = await accountingRequest<{ success: boolean; data: { journal: JournalEntry; replayed?: boolean } }>(
      session,
      '/api/v1/accounting/transfers',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        idempotencyKey: generateIdempotencyKey('trf'),
      }
    );
    return res.data;
  },

  async recordBankCharge(
    session: ApiSessionConfig,
    payload: {
      branchId?: string;
      bankLedgerAccountId?: string;
      amount: number;
      chargeDate?: string;
      description: string;
      referenceNumber?: string;
    }
  ) {
    const res = await accountingRequest<{ success: boolean; data: { journal: JournalEntry } }>(
      session,
      '/api/v1/accounting/bank-charges',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        idempotencyKey: generateIdempotencyKey('bchg'),
      }
    );
    return res.data;
  },

  async importBankStatement(
    session: ApiSessionConfig,
    payload: {
      bankAccountId: string;
      statementDate: string;
      statementBalance: number;
      lines: Array<{ date: string; description: string; reference?: string; debit?: number; credit?: number }>;
    }
  ) {
    const res = await accountingRequest<{ success: boolean; data: { reconciliation: BankReconciliation } }>(
      session,
      '/api/v1/accounting/bank-reconciliations',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return res.data.reconciliation;
  },

  async matchBankStatementLine(
    session: ApiSessionConfig,
    reconciliationId: string,
    lineId: string,
    journalEntryId: string
  ) {
    const res = await accountingRequest<{ success: boolean; data: { reconciliation: BankReconciliation } }>(
      session,
      `/api/v1/accounting/bank-reconciliations/${reconciliationId}/match`,
      { method: 'POST', body: JSON.stringify({ lineId, journalEntryId }) }
    );
    return res.data.reconciliation;
  },

  async listFinancialPeriods(session: ApiSessionConfig) {
    const res = await accountingRequest<{ success: boolean; data: { periods: FinancialPeriod[] } }>(
      session,
      '/api/v1/accounting/periods'
    );
    return res.data.periods;
  },

  async closeFinancialPeriod(session: ApiSessionConfig, periodId: string, notes?: string) {
    const res = await accountingRequest<{ success: boolean; data: { period: FinancialPeriod } }>(
      session,
      `/api/v1/accounting/periods/${periodId}/close`,
      { method: 'POST', body: JSON.stringify({ notes }) }
    );
    return res.data.period;
  },

  async reopenFinancialPeriod(session: ApiSessionConfig, periodId: string, reason: string) {
    const res = await accountingRequest<{ success: boolean; data: { period: FinancialPeriod } }>(
      session,
      `/api/v1/accounting/periods/${periodId}/reopen`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    );
    return res.data.period;
  },

  async listExpenses(
    session: ApiSessionConfig,
    filters: { branchId?: string; status?: string; categoryAccountId?: string; fromDate?: string; toDate?: string } = {}
  ) {
    const res = await accountingRequest<{ success: boolean; data: { expenses: ExpenseRecord[]; count: number } }>(
      session,
      `/api/v1/expenses${buildFilterQuery(filters)}`
    );
    return res.data.expenses;
  },

  async createExpense(
    session: ApiSessionConfig,
    payload: {
      branchId?: string;
      expenseDate?: string;
      categoryAccountId: string;
      vendorName: string;
      vendorGstin?: string;
      invoiceNumber?: string;
      taxableAmount: number;
      cgst?: number;
      sgst?: number;
      igst?: number;
      itcEligible?: boolean;
      paymentMode?: 'UNPAID' | 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD';
      paymentAccountId?: string;
      paymentReference?: string;
      notes?: string;
      autoApprove?: boolean;
    }
  ) {
    const res = await accountingRequest<{ success: boolean; data: { expense: ExpenseRecord } }>(
      session,
      '/api/v1/expenses',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return res.data.expense;
  },

  async approveExpense(session: ApiSessionConfig, expenseId: string) {
    const res = await accountingRequest<{ success: boolean; data: { expense: ExpenseRecord } }>(
      session,
      `/api/v1/expenses/${expenseId}/approve`,
      { method: 'POST' }
    );
    return res.data.expense;
  },

  async payExpense(
    session: ApiSessionConfig,
    expenseId: string,
    payload: {
      paymentMode: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD';
      paymentAccountId?: string;
      paymentDate?: string;
      referenceNumber?: string;
    }
  ) {
    const res = await accountingRequest<{ success: boolean; data: { expense: ExpenseRecord } }>(
      session,
      `/api/v1/expenses/${expenseId}/pay`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return res.data.expense;
  },

  async reverseExpense(session: ApiSessionConfig, expenseId: string, reason: string) {
    const res = await accountingRequest<{ success: boolean; data: { expense: ExpenseRecord } }>(
      session,
      `/api/v1/expenses/${expenseId}/reverse`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    );
    return res.data.expense;
  },

  async getTrialBalance(session: ApiSessionConfig, filters: { branchId?: string; fromDate?: string; toDate?: string } = {}) {
    const res = await accountingRequest<{ success: boolean; data: TrialBalanceData }>(
      session,
      `/api/v1/accounting/reports/trial-balance${buildFilterQuery(filters)}`
    );
    return res.data;
  },

  async getProfitAndLoss(session: ApiSessionConfig, filters: { branchId?: string; fromDate?: string; toDate?: string } = {}) {
    const res = await accountingRequest<{ success: boolean; data: ProfitLossData }>(
      session,
      `/api/v1/accounting/reports/profit-loss${buildFilterQuery(filters)}`
    );
    return res.data;
  },

  async getBranchPnl(session: ApiSessionConfig, filters: { branchId?: string; fromDate?: string; toDate?: string } = {}) {
    const res = await accountingRequest<{ success: boolean; data: BranchPnlData }>(
      session,
      `/api/v1/accounting/reports/branch-pnl${buildFilterQuery(filters)}`
    );
    return res.data;
  },

  async getBalanceSheet(session: ApiSessionConfig, filters: { branchId?: string; asOfDate?: string } = {}) {
    const res = await accountingRequest<{ success: boolean; data: BalanceSheetData }>(
      session,
      `/api/v1/accounting/reports/balance-sheet${buildFilterQuery(filters)}`
    );
    return res.data;
  },

  async getCashFlow(session: ApiSessionConfig, filters: { branchId?: string; fromDate?: string; toDate?: string } = {}) {
    const res = await accountingRequest<{ success: boolean; data: CashFlowData }>(
      session,
      `/api/v1/accounting/reports/cash-flow${buildFilterQuery(filters)}`
    );
    return res.data;
  },

  async getCashBook(session: ApiSessionConfig, filters: { branchId?: string; fromDate?: string; toDate?: string } = {}) {
    const res = await accountingRequest<{ success: boolean; data: CashOrBankBookData }>(
      session,
      `/api/v1/accounting/reports/cash-book${buildFilterQuery(filters)}`
    );
    return res.data;
  },

  async getBankBook(session: ApiSessionConfig, filters: { branchId?: string; fromDate?: string; toDate?: string } = {}) {
    const res = await accountingRequest<{ success: boolean; data: CashOrBankBookData }>(
      session,
      `/api/v1/accounting/reports/bank-book${buildFilterQuery(filters)}`
    );
    return res.data;
  },

  async getGstSummary(session: ApiSessionConfig, filters: { branchId?: string; fromDate?: string; toDate?: string } = {}) {
    const res = await accountingRequest<{ success: boolean; data: GstSummaryData }>(
      session,
      `/api/v1/accounting/reports/gst-summary${buildFilterQuery(filters)}`
    );
    return res.data;
  },

  async getExpenseSummary(session: ApiSessionConfig, filters: { branchId?: string; fromDate?: string; toDate?: string } = {}) {
    const res = await accountingRequest<{ success: boolean; data: ExpenseSummaryData }>(
      session,
      `/api/v1/accounting/reports/expenses${buildFilterQuery(filters)}`
    );
    return res.data;
  },

  async getReconciliationExceptions(session: ApiSessionConfig) {
    const res = await accountingRequest<{ success: boolean; data: ReconciliationCheckData }>(
      session,
      '/api/v1/accounting/reconciliation/exceptions'
    );
    return res.data;
  },

  async runHistoricalBackfill(session: ApiSessionConfig) {
    const res = await accountingRequest<{
      success: boolean;
      data: { postedCount: number; skippedCount: number; failedCount: number; failedRefs: string[] };
    }>(session, '/api/v1/accounting/reconciliation/backfill', { method: 'POST' });
    return res.data;
  },

  async downloadReportExport(
    session: ApiSessionConfig,
    reportType: 'trial-balance' | 'profit-loss' | 'balance-sheet' | 'gst-summary' | 'general-ledger' | 'expenses',
    format: 'csv' | 'pdf',
    filters: { branchId?: string; fromDate?: string; toDate?: string; asOfDate?: string } = {}
  ) {
    if (!session.bearerToken) {
      throw new ApiClientError(401, 'Authentication Required', 'Connect a Firebase token to export from backend.');
    }
    const qs = buildFilterQuery({ ...filters, reportType, format });
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${session.bearerToken}`);
    headers.set('X-Tenant-ID', session.tenantId);
    if (session.branchId) headers.set('X-Branch-ID', session.branchId);
    if (session.appCheckToken) headers.set('X-Firebase-AppCheck', session.appCheckToken);

    const res = await fetch(`/api/v1/accounting/reports/export${qs}`, { headers });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new ApiClientError(res.status, errBody?.title || `HTTP ${res.status}`, errBody?.detail || 'Export failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmadesk-${reportType}-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

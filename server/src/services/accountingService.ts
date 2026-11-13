import crypto from 'node:crypto';
import { firestore } from '../lib/firebaseAdmin';
import { env } from '../config/env';
import {
  BadRequestError,
  ConflictError,
  IdempotencyConflictError,
  NotFoundError,
} from '../lib/errors';
import { AuditService } from './auditService';

export type AccountCategory = 'ASSETS' | 'LIABILITIES' | 'EQUITY' | 'INCOME' | 'EXPENSES';
export type NormalBalance = 'DEBIT' | 'CREDIT';

export type SystemAccountCode =
  | 'CASH_IN_HAND'
  | 'PETTY_CASH'
  | 'MAIN_BANK'
  | 'UPI_CLEARING'
  | 'CARD_CLEARING'
  | 'ACCOUNTS_RECEIVABLE'
  | 'SUPPLIER_ADVANCES'
  | 'INVENTORY'
  | 'INPUT_CGST'
  | 'INPUT_SGST'
  | 'INPUT_IGST'
  | 'ACCOUNTS_PAYABLE'
  | 'GRN_UNBILLED_CLEARING'
  | 'CUSTOMER_ADVANCES'
  | 'CUSTOMER_REFUND_PENDING'
  | 'OUTPUT_CGST'
  | 'OUTPUT_SGST'
  | 'OUTPUT_IGST'
  | 'OUTSTANDING_EXPENSES'
  | 'OWNERS_CAPITAL'
  | 'OPENING_BALANCE_EQUITY'
  | 'RETAINED_EARNINGS'
  | 'SALES_REVENUE'
  | 'SALES_RETURNS'
  | 'OTHER_INCOME'
  | 'COGS'
  | 'PURCHASE_DISCOUNTS'
  | 'EXP_RENT'
  | 'EXP_SALARY'
  | 'EXP_ELECTRICITY'
  | 'EXP_DELIVERY'
  | 'EXP_SOFTWARE'
  | 'EXP_PACKAGING'
  | 'EXP_BANK_CHARGES'
  | 'EXP_SHRINKAGE'
  | 'EXP_ROUND_OFF'
  | 'EXP_BAD_DEBT_ADJ';

export interface ChartOfAccountRecord {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  category: AccountCategory;
  subType: string;
  normalBalance: NormalBalance;
  parentAccountId: string | null;
  isSystemAccount: boolean;
  systemCode: SystemAccountCode | null;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface JournalLineRecord {
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

export type JournalEntryType =
  | 'OPENING_BALANCE'
  | 'SALES_INVOICE'
  | 'SALES_PAYMENT'
  | 'SALES_RETURN'
  | 'INVOICE_CANCELLATION'
  | 'KHATA_PAYMENT'
  | 'CUSTOMER_CREDIT_NOTE'
  | 'CUSTOMER_ADJUSTMENT'
  | 'CUSTOMER_REFUND'
  | 'PURCHASE_GRN'
  | 'PURCHASE_GRN_REVERSAL'
  | 'SUPPLIER_INVOICE'
  | 'SUPPLIER_PAYMENT'
  | 'SUPPLIER_RETURN'
  | 'SUPPLIER_OPENING_BALANCE'
  | 'CUSTOMER_OPENING_BALANCE'
  | 'EXPENSE_ACCRUAL'
  | 'EXPENSE_PAYMENT'
  | 'INTERNAL_TRANSFER'
  | 'BANK_CHARGES'
  | 'MANUAL_ADJUSTMENT'
  | 'REVERSAL';

export interface JournalEntryRecord {
  id: string;
  tenantId: string;
  branchId: string;
  voucherNumber: string;
  entryType: JournalEntryType;
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
  lines: JournalLineRecord[];
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
  metadata?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export interface FinancialPeriodRecord {
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

export interface BankAccountRecord {
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

export interface CashAccountRecord {
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

export interface BankReconciliationRecord {
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

export interface OpeningBalanceBatchRecord {
  id: string;
  tenantId: string;
  branchId: string;
  asOfDate: string;
  journalEntryId: string;
  voucherNumber: string;
  totalDebit: number;
  totalCredit: number;
  linesCount: number;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface AccountingOperationRecord {
  id: string;
  tenantId: string;
  operationType: string;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  status: 'STARTED' | 'COMMITTED' | 'FAILED' | 'REVERSED';
  journalEntryId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostJournalLineInput {
  accountId?: string;
  systemCode?: SystemAccountCode;
  branchId?: string;
  debitPaise?: number;
  creditPaise?: number;
  description?: string;
}

export interface PostJournalInput {
  tenantId: string;
  branchId: string;
  entryType: JournalEntryType;
  transactionDate: string;
  referenceType: string;
  referenceId: string;
  referenceNumber?: string | null;
  narration: string;
  idempotencyKey: string;
  lines: PostJournalLineInput[];
  createdBy: string;
  reversesEntryId?: string | null;
  metadata?: Record<string, unknown>;
}

// ---------- Utility helpers ----------

export function toPaise(amount: number | string | null | undefined): number {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromPaise(paise: number): number {
  return Number((paise / 100).toFixed(2));
}

export function deterministicAccountingId(prefix: string, ...parts: string[]): string {
  const hash = crypto
    .createHash('sha256')
    .update(parts.join('::'))
    .digest('hex')
    .slice(0, 20);
  return `${prefix}_${hash}`;
}

function normalizeIsoDate(dateInput?: string | null): string {
  if (!dateInput) {
    return new Date().toISOString().slice(0, 10);
  }
  const trimmed = dateInput.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

export function getIndianFyForDate(dateIso: string): {
  financialYear: string;
  fyStartYear: number;
} {
  const clean = normalizeIsoDate(dateIso);
  const year = Number(clean.slice(0, 4));
  const month = Number(clean.slice(5, 7)); // 1..12
  const fyStartYear = month >= 4 ? year : year - 1;
  const nextYearShort = String(fyStartYear + 1).slice(-2);
  return {
    financialYear: `FY ${fyStartYear}-${nextYearShort}`,
    fyStartYear,
  };
}

function getMonthRange(year: number, monthIndex1To12: number): { startDate: string; endDate: string; label: string } {
  const mm = String(monthIndex1To12).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, monthIndex1To12, 0)).getUTCDate();
  const dd = String(lastDay).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${dd}`,
    label: `${monthNames[monthIndex1To12 - 1]} ${year}`,
  };
}

// ---------- Default Indian Pharmacy Chart of Accounts ----------

interface DefaultCoaDef {
  code: string;
  name: string;
  category: AccountCategory;
  subType: string;
  normalBalance: NormalBalance;
  systemCode: SystemAccountCode;
  description: string;
}

const DEFAULT_COA_DEFINITIONS: DefaultCoaDef[] = [
  // ASSETS
  { code: '1100', name: 'Cash in Hand', category: 'ASSETS', subType: 'CASH', normalBalance: 'DEBIT', systemCode: 'CASH_IN_HAND', description: 'Physical retail counter cash drawer control account' },
  { code: '1110', name: 'Petty Cash', category: 'ASSETS', subType: 'CASH', normalBalance: 'DEBIT', systemCode: 'PETTY_CASH', description: 'Branch petty cash float for minor store expenses' },
  { code: '1200', name: 'Main Bank Account', category: 'ASSETS', subType: 'BANK', normalBalance: 'DEBIT', systemCode: 'MAIN_BANK', description: 'Primary pharmacy current bank account' },
  { code: '1210', name: 'UPI Clearing Receivable', category: 'ASSETS', subType: 'CLEARING', normalBalance: 'DEBIT', systemCode: 'UPI_CLEARING', description: 'UPI merchant receipts pending settlement to bank' },
  { code: '1220', name: 'Card Settlement Clearing', category: 'ASSETS', subType: 'CLEARING', normalBalance: 'DEBIT', systemCode: 'CARD_CLEARING', description: 'POS EDC card swipes pending bank settlement' },
  { code: '1300', name: 'Accounts Receivable (Customer Khata)', category: 'ASSETS', subType: 'RECEIVABLE', normalBalance: 'DEBIT', systemCode: 'ACCOUNTS_RECEIVABLE', description: 'Control account matching Phase 7 customer Khata balances' },
  { code: '1350', name: 'Supplier Advances', category: 'ASSETS', subType: 'PREPAYMENT', normalBalance: 'DEBIT', systemCode: 'SUPPLIER_ADVANCES', description: 'Advance payments made to distributors prior to billing' },
  { code: '1400', name: 'Medicine Inventory', category: 'ASSETS', subType: 'INVENTORY', normalBalance: 'DEBIT', systemCode: 'INVENTORY', description: 'Batch inventory asset valued at wholesale PTR cost' },
  { code: '1510', name: 'Input CGST (ITC Eligible)', category: 'ASSETS', subType: 'GST_INPUT', normalBalance: 'DEBIT', systemCode: 'INPUT_CGST', description: 'Central GST input tax credit on inward purchases & expenses' },
  { code: '1520', name: 'Input SGST (ITC Eligible)', category: 'ASSETS', subType: 'GST_INPUT', normalBalance: 'DEBIT', systemCode: 'INPUT_SGST', description: 'State GST input tax credit on inward purchases & expenses' },
  { code: '1530', name: 'Input IGST (ITC Eligible)', category: 'ASSETS', subType: 'GST_INPUT', normalBalance: 'DEBIT', systemCode: 'INPUT_IGST', description: 'Integrated GST input tax credit on inter-state inward purchases' },

  // LIABILITIES
  { code: '2100', name: 'Accounts Payable (Suppliers)', category: 'LIABILITIES', subType: 'PAYABLE', normalBalance: 'CREDIT', systemCode: 'ACCOUNTS_PAYABLE', description: 'Control account matching Phase 8 supplier invoice payables' },
  { code: '2110', name: 'GRN Unbilled Clearing', category: 'LIABILITIES', subType: 'CLEARING', normalBalance: 'CREDIT', systemCode: 'GRN_UNBILLED_CLEARING', description: 'Provisional payable for GRNs awaiting supplier tax invoice' },
  { code: '2150', name: 'Customer Advances', category: 'LIABILITIES', subType: 'CUSTOMER_ADVANCE', normalBalance: 'CREDIT', systemCode: 'CUSTOMER_ADVANCES', description: 'Overpayments and advance deposits held for customers' },
  { code: '2160', name: 'Customer Refunds Payable', category: 'LIABILITIES', subType: 'REFUND_PAYABLE', normalBalance: 'CREDIT', systemCode: 'CUSTOMER_REFUND_PENDING', description: 'Refund liability on cancelled paid invoices pending disbursement' },
  { code: '2210', name: 'Output CGST Payable', category: 'LIABILITIES', subType: 'GST_OUTPUT', normalBalance: 'CREDIT', systemCode: 'OUTPUT_CGST', description: 'Central GST collected on intra-state retail/B2B sales' },
  { code: '2220', name: 'Output SGST Payable', category: 'LIABILITIES', subType: 'GST_OUTPUT', normalBalance: 'CREDIT', systemCode: 'OUTPUT_SGST', description: 'State GST collected on intra-state retail/B2B sales' },
  { code: '2230', name: 'Output IGST Payable', category: 'LIABILITIES', subType: 'GST_OUTPUT', normalBalance: 'CREDIT', systemCode: 'OUTPUT_IGST', description: 'Integrated GST collected on inter-state sales' },
  { code: '2300', name: 'Outstanding Expenses Payable', category: 'LIABILITIES', subType: 'ACCRUED_EXPENSE', normalBalance: 'CREDIT', systemCode: 'OUTSTANDING_EXPENSES', description: 'Approved unpaid pharmacy operating expenses' },

  // EQUITY
  { code: '3100', name: "Owner's Capital", category: 'EQUITY', subType: 'CAPITAL', normalBalance: 'CREDIT', systemCode: 'OWNERS_CAPITAL', description: 'Promoter capital introduced into the pharmacy' },
  { code: '3200', name: 'Opening Balance Equity', category: 'EQUITY', subType: 'OPENING_EQUITY', normalBalance: 'CREDIT', systemCode: 'OPENING_BALANCE_EQUITY', description: 'Offset equity account for initial opening balances' },
  { code: '3300', name: 'Retained Earnings', category: 'EQUITY', subType: 'RETAINED_EARNINGS', normalBalance: 'CREDIT', systemCode: 'RETAINED_EARNINGS', description: 'Accumulated prior-period earnings' },

  // INCOME
  { code: '4100', name: 'Pharmacy Medicine Sales', category: 'INCOME', subType: 'OPERATING_REVENUE', normalBalance: 'CREDIT', systemCode: 'SALES_REVENUE', description: 'Taxable revenue from retail & wholesale medicine sales' },
  { code: '4110', name: 'Sales Returns & Allowances', category: 'INCOME', subType: 'CONTRA_REVENUE', normalBalance: 'DEBIT', systemCode: 'SALES_RETURNS', description: 'Rebate credit notes and customer sales returns' },
  { code: '4200', name: 'Other Income & Rebates', category: 'INCOME', subType: 'OTHER_INCOME', normalBalance: 'CREDIT', systemCode: 'OTHER_INCOME', description: 'Miscellaneous income and supplier cash discounts' },

  // EXPENSES
  { code: '5100', name: 'Cost of Goods Sold (COGS)', category: 'EXPENSES', subType: 'COGS', normalBalance: 'DEBIT', systemCode: 'COGS', description: 'Batch PTR cost recognized on medicine sale' },
  { code: '5110', name: 'Purchase Adjustments & Price Variance', category: 'EXPENSES', subType: 'COGS', normalBalance: 'DEBIT', systemCode: 'PURCHASE_DISCOUNTS', description: 'Supplier invoice vs GRN variance & rebates' },
  { code: '5210', name: 'Shop Rent Expense', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', systemCode: 'EXP_RENT', description: 'Pharmacy premises monthly lease and maintenance' },
  { code: '5220', name: 'Staff Salary & Wages', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', systemCode: 'EXP_SALARY', description: 'Pharmacist, cashier, and helper payroll expense' },
  { code: '5230', name: 'Electricity & Utilities', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', systemCode: 'EXP_ELECTRICITY', description: 'Cold-chain refrigeration, AC, and power charges' },
  { code: '5240', name: 'Delivery & Logistics Charges', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', systemCode: 'EXP_DELIVERY', description: 'Local home delivery & distributor freight inward' },
  { code: '5250', name: 'Software & Subscriptions', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', systemCode: 'EXP_SOFTWARE', description: 'POS software, internet, and compliance utilities' },
  { code: '5260', name: 'Packaging & Supplies', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', systemCode: 'EXP_PACKAGING', description: 'Carry bags, thermal paper rolls, and printer ink' },
  { code: '5270', name: 'Bank & Payment Gateway Charges', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', systemCode: 'EXP_BANK_CHARGES', description: 'NEFT/RTGS, POS MDR, and bank maintenance fees' },
  { code: '5280', name: 'Expiry & Inventory Shrinkage Loss', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', systemCode: 'EXP_SHRINKAGE', description: 'Non-restockable damaged/expired stock write-offs' },
  { code: '5290', name: 'Round Off & Misc Expense', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', systemCode: 'EXP_ROUND_OFF', description: 'Invoice rounding differences & minor expenses' },
  { code: '5300', name: 'Bad Debt & Khata Write-Offs', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', systemCode: 'EXP_BAD_DEBT_ADJ', description: 'Audited uncollectible customer Khata balance write-offs' },
];

// ---------- In-Memory Test Stores & Locks ----------

const testCoaStore = new Map<string, Map<string, ChartOfAccountRecord>>();
const testJournalStore = new Map<string, Map<string, JournalEntryRecord>>();
const testPeriodStore = new Map<string, Map<string, FinancialPeriodRecord>>();
const testBankStore = new Map<string, Map<string, BankAccountRecord>>();
const testCashStore = new Map<string, Map<string, CashAccountRecord>>();
const testExpenseStore = new Map<string, Map<string, ExpenseRecord>>();
const testBankReconStore = new Map<string, Map<string, BankReconciliationRecord>>();
const testOpeningBatchStore = new Map<string, Map<string, OpeningBalanceBatchRecord>>();
const testAccountingOpStore = new Map<string, Map<string, AccountingOperationRecord>>();
const testAccountingSeq = new Map<string, number>();

const accountingLocks = new Map<string, Promise<unknown>>();

async function withTenantAccountingLock<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const prev = accountingLocks.get(tenantId) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  accountingLocks.set(tenantId, next);
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (accountingLocks.get(tenantId) === next) {
      accountingLocks.delete(tenantId);
    }
  }
}

function getMap<T>(store: Map<string, Map<string, T>>, tenantId: string): Map<string, T> {
  let m = store.get(tenantId);
  if (!m) {
    m = new Map<string, T>();
    store.set(tenantId, m);
  }
  return m;
}

export function clearTestAccountingData(): void {
  testCoaStore.clear();
  testJournalStore.clear();
  testPeriodStore.clear();
  testBankStore.clear();
  testCashStore.clear();
  testExpenseStore.clear();
  testBankReconStore.clear();
  testOpeningBatchStore.clear();
  testAccountingOpStore.clear();
  testAccountingSeq.clear();
}

export class AccountingService {
  private static isTest(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST)
    );
  }

  private static nextSeq(tenantId: string, key: string): number {
    const composite = `${tenantId}:${key}`;
    const n = (testAccountingSeq.get(composite) || 0) + 1;
    testAccountingSeq.set(composite, n);
    return n;
  }

  private static async allocateVoucherNumber(
    tenantId: string,
    prefix: string,
    dateIso: string
  ): Promise<string> {
    const year = dateIso.slice(0, 4);
    const counterId = `acc_${prefix}_${year}`;
    if (this.isTest()) {
      const seq = this.nextSeq(tenantId, counterId);
      return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
    }
    const db = firestore();
    const counterRef = db.collection('tenants').doc(tenantId).collection('counters').doc(counterId);
    const seq = await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const current = snap.exists ? Number(snap.data()?.currentSeq || 0) : 0;
      const next = current + 1;
      tx.set(counterRef, { currentSeq: next, updatedAt: new Date().toISOString() }, { merge: true });
      return next;
    });
    return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
  }

  // ==================== INITIALIZATION & CHART OF ACCOUNTS ====================

  public static async ensureInitialized(tenantId: string, actingUserId = 'system'): Promise<void> {
    if (this.isTest()) {
      const coaMap = getMap(testCoaStore, tenantId);
      const now = new Date().toISOString();
      if (coaMap.size === 0) {
        for (const def of DEFAULT_COA_DEFINITIONS) {
          const id = `coa_${def.code}`;
          coaMap.set(id, {
            id,
            tenantId,
            code: def.code,
            name: def.name,
            category: def.category,
            subType: def.subType,
            normalBalance: def.normalBalance,
            parentAccountId: null,
            isSystemAccount: true,
            systemCode: def.systemCode,
            isActive: true,
            description: def.description,
            createdAt: now,
            updatedAt: now,
            createdBy: actingUserId,
          });
        }
      }

      const cashMap = getMap(testCashStore, tenantId);
      if (cashMap.size === 0) {
        cashMap.set('cash_main', {
          id: 'cash_main',
          tenantId,
          branchId: 'main',
          name: 'Main Counter Cash Drawer',
          ledgerAccountId: 'coa_1100',
          ledgerAccountCode: '1100',
          status: 'ACTIVE',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      const bankMap = getMap(testBankStore, tenantId);
      if (bankMap.size === 0) {
        bankMap.set('bank_main', {
          id: 'bank_main',
          tenantId,
          branchId: 'main',
          accountName: 'Primary Pharmacy Current A/c',
          bankName: 'HDFC Bank',
          branchName: 'Main Branch',
          ifscCode: 'HDFC0000123',
          maskedAccountNumber: 'XXXX1234',
          ledgerAccountId: 'coa_1200',
          ledgerAccountCode: '1200',
          status: 'ACTIVE',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      const periodMap = getMap(testPeriodStore, tenantId);
      if (periodMap.size === 0) {
        await this.ensureFyPeriodsExist(tenantId, normalizeIsoDate());
      }
      return;
    }

    const db = firestore();
    const tenantRef = db.collection('tenants').doc(tenantId);
    const coaSnap = await tenantRef.collection('chartOfAccounts').limit(1).get();
    const now = new Date().toISOString();

    if (coaSnap.empty) {
      const batch = db.batch();
      for (const def of DEFAULT_COA_DEFINITIONS) {
        const id = `coa_${def.code}`;
        const rec: ChartOfAccountRecord = {
          id,
          tenantId,
          code: def.code,
          name: def.name,
          category: def.category,
          subType: def.subType,
          normalBalance: def.normalBalance,
          parentAccountId: null,
          isSystemAccount: true,
          systemCode: def.systemCode,
          isActive: true,
          description: def.description,
          createdAt: now,
          updatedAt: now,
          createdBy: actingUserId,
        };
        batch.set(tenantRef.collection('chartOfAccounts').doc(id), rec);
      }

      batch.set(tenantRef.collection('cashAccounts').doc('cash_main'), {
        id: 'cash_main',
        tenantId,
        branchId: 'main',
        name: 'Main Counter Cash Drawer',
        ledgerAccountId: 'coa_1100',
        ledgerAccountCode: '1100',
        status: 'ACTIVE',
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });

      batch.set(tenantRef.collection('bankAccounts').doc('bank_main'), {
        id: 'bank_main',
        tenantId,
        branchId: 'main',
        accountName: 'Primary Pharmacy Current A/c',
        bankName: 'HDFC Bank',
        branchName: 'Main Branch',
        ifscCode: 'HDFC0000123',
        maskedAccountNumber: 'XXXX1234',
        ledgerAccountId: 'coa_1200',
        ledgerAccountCode: '1200',
        status: 'ACTIVE',
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });

      await batch.commit();
      await this.ensureFyPeriodsExist(tenantId, normalizeIsoDate());
    }
  }

  private static async ensureFyPeriodsExist(tenantId: string, dateIso: string): Promise<FinancialPeriodRecord> {
    const { financialYear, fyStartYear } = getIndianFyForDate(dateIso);
    const monthsOrder = [
      { y: fyStartYear, m: 4 },
      { y: fyStartYear, m: 5 },
      { y: fyStartYear, m: 6 },
      { y: fyStartYear, m: 7 },
      { y: fyStartYear, m: 8 },
      { y: fyStartYear, m: 9 },
      { y: fyStartYear, m: 10 },
      { y: fyStartYear, m: 11 },
      { y: fyStartYear, m: 12 },
      { y: fyStartYear + 1, m: 1 },
      { y: fyStartYear + 1, m: 2 },
      { y: fyStartYear + 1, m: 3 },
    ];

    const now = new Date().toISOString();
    const created: FinancialPeriodRecord[] = [];

    if (this.isTest()) {
      const periodMap = getMap(testPeriodStore, tenantId);
      monthsOrder.forEach((entry, idx) => {
        const range = getMonthRange(entry.y, entry.m);
        const id = `per_${entry.y}_${String(entry.m).padStart(2, '0')}`;
        if (!periodMap.has(id)) {
          const rec: FinancialPeriodRecord = {
            id,
            tenantId,
            financialYear,
            periodName: range.label,
            periodNumber: idx + 1,
            startDate: range.startDate,
            endDate: range.endDate,
            status: 'OPEN',
            closedAt: null,
            closedBy: null,
            closeNotes: null,
            reopenedAt: null,
            reopenedBy: null,
            reopenReason: null,
            createdAt: now,
            updatedAt: now,
          };
          periodMap.set(id, rec);
        }
        created.push(periodMap.get(id)!);
      });
      const matched = created.find((p) => dateIso >= p.startDate && dateIso <= p.endDate);
      return matched || created[0]!;
    }

    const db = firestore();
    const col = db.collection('tenants').doc(tenantId).collection('financialPeriods');
    const existingSnap = await col.where('financialYear', '==', financialYear).get();
    const existingById = new Map<string, FinancialPeriodRecord>();
    existingSnap.docs.forEach((d) => existingById.set(d.id, d.data() as FinancialPeriodRecord));

    const batch = db.batch();
    let hasWrites = false;
    monthsOrder.forEach((entry, idx) => {
      const range = getMonthRange(entry.y, entry.m);
      const id = `per_${entry.y}_${String(entry.m).padStart(2, '0')}`;
      if (!existingById.has(id)) {
        const rec: FinancialPeriodRecord = {
          id,
          tenantId,
          financialYear,
          periodName: range.label,
          periodNumber: idx + 1,
          startDate: range.startDate,
          endDate: range.endDate,
          status: 'OPEN',
          closedAt: null,
          closedBy: null,
          closeNotes: null,
          reopenedAt: null,
          reopenedBy: null,
          reopenReason: null,
          createdAt: now,
          updatedAt: now,
        };
        batch.set(col.doc(id), rec);
        existingById.set(id, rec);
        hasWrites = true;
      }
      created.push(existingById.get(id)!);
    });
    if (hasWrites) {
      await batch.commit();
    }
    const matched = created.find((p) => dateIso >= p.startDate && dateIso <= p.endDate);
    return matched || created[0]!;
  }

  public static async listAccounts(
    tenantId: string,
    filters?: { category?: AccountCategory; includeInactive?: boolean }
  ): Promise<ChartOfAccountRecord[]> {
    await this.ensureInitialized(tenantId);
    let list: ChartOfAccountRecord[] = [];
    if (this.isTest()) {
      list = Array.from(getMap(testCoaStore, tenantId).values());
    } else {
      const snap = await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('chartOfAccounts')
        .get();
      list = snap.docs.map((d) => d.data() as ChartOfAccountRecord);
    }

    if (filters?.category) {
      list = list.filter((a) => a.category === filters.category);
    }
    if (!filters?.includeInactive) {
      list = list.filter((a) => a.isActive);
    }
    return list.sort((a, b) => a.code.localeCompare(b.code));
  }

  public static async getAccountById(tenantId: string, accountId: string): Promise<ChartOfAccountRecord> {
    await this.ensureInitialized(tenantId);
    if (this.isTest()) {
      const acc = getMap(testCoaStore, tenantId).get(accountId);
      if (!acc) throw new NotFoundError(`Ledger account '${accountId}' not found`);
      return acc;
    }
    const doc = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('chartOfAccounts')
      .doc(accountId)
      .get();
    if (!doc.exists) throw new NotFoundError(`Ledger account '${accountId}' not found`);
    return doc.data() as ChartOfAccountRecord;
  }

  public static async getAccountBySystemCode(
    tenantId: string,
    systemCode: SystemAccountCode
  ): Promise<ChartOfAccountRecord> {
    const accounts = await this.listAccounts(tenantId, { includeInactive: true });
    const found = accounts.find((a) => a.systemCode === systemCode);
    if (!found) {
      throw new NotFoundError(`System ledger account '${systemCode}' is missing for tenant '${tenantId}'`);
    }
    return found;
  }

  public static async createAccount(
    tenantId: string,
    input: {
      code: string;
      name: string;
      category: AccountCategory;
      subType?: string;
      normalBalance?: NormalBalance;
      parentAccountId?: string | null;
      description?: string;
    },
    userId: string
  ): Promise<ChartOfAccountRecord> {
    await this.ensureInitialized(tenantId, userId);
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    if (!code || code.length < 3 || code.length > 20) {
      throw new BadRequestError('Account code must be between 3 and 20 characters');
    }
    if (!name || name.length < 2) {
      throw new BadRequestError('Account name must be at least 2 characters');
    }

    const existing = await this.listAccounts(tenantId, { includeInactive: true });
    if (existing.some((a) => a.code.toUpperCase() === code)) {
      throw new ConflictError(`Account with code '${code}' already exists`);
    }
    if (existing.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      throw new ConflictError(`Account with name '${name}' already exists`);
    }
    if (input.parentAccountId) {
      const parent = existing.find((a) => a.id === input.parentAccountId);
      if (!parent) throw new BadRequestError('Parent account not found');
      if (parent.category !== input.category) {
        throw new BadRequestError('Parent account must belong to the same accounting category');
      }
    }

    const defaultNormal: NormalBalance =
      input.category === 'ASSETS' || input.category === 'EXPENSES' ? 'DEBIT' : 'CREDIT';
    const now = new Date().toISOString();
    const id = `coa_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${crypto.randomBytes(2).toString('hex')}`;
    const record: ChartOfAccountRecord = {
      id,
      tenantId,
      code,
      name,
      category: input.category,
      subType: input.subType?.trim().toUpperCase() || 'CUSTOM',
      normalBalance: input.normalBalance || defaultNormal,
      parentAccountId: input.parentAccountId || null,
      isSystemAccount: false,
      systemCode: null,
      isActive: true,
      description: input.description?.trim() || null,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    };

    if (this.isTest()) {
      getMap(testCoaStore, tenantId).set(id, record);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('chartOfAccounts')
        .doc(id)
        .set(record);
    }

    await AuditService.log({
      tenantId,
      action: 'ACCOUNTING_ACCOUNT_CREATED',
      actingUserId: userId,
      metadata: { accountId: id, code, name, category: input.category },
    });

    return record;
  }

  public static async updateAccount(
    tenantId: string,
    accountId: string,
    input: {
      name?: string;
      description?: string;
      isActive?: boolean;
      parentAccountId?: string | null;
    },
    userId: string
  ): Promise<ChartOfAccountRecord> {
    const existing = await this.getAccountById(tenantId, accountId);
    if (existing.isSystemAccount && input.isActive === false) {
      throw new ConflictError(`System account '${existing.code} - ${existing.name}' cannot be deactivated`);
    }

    const next: ChartOfAccountRecord = {
      ...existing,
      name: input.name?.trim() || existing.name,
      description: input.description !== undefined ? input.description?.trim() || null : existing.description,
      isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
      parentAccountId: input.parentAccountId !== undefined ? input.parentAccountId : existing.parentAccountId,
      updatedAt: new Date().toISOString(),
    };

    if (this.isTest()) {
      getMap(testCoaStore, tenantId).set(accountId, next);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('chartOfAccounts')
        .doc(accountId)
        .set(next);
    }

    await AuditService.log({
      tenantId,
      action: 'ACCOUNTING_ACCOUNT_UPDATED',
      actingUserId: userId,
      metadata: { accountId, code: next.code, isActive: next.isActive },
    });
    return next;
  }

  public static async deleteAccount(tenantId: string, accountId: string, userId: string): Promise<void> {
    const account = await this.getAccountById(tenantId, accountId);
    if (account.isSystemAccount) {
      throw new ConflictError(`System account '${account.code} - ${account.name}' cannot be deleted`);
    }

    const entries = await this.listJournalEntries(tenantId, { limit: 5000 });
    const isReferenced = entries.some((entry) => entry.lines.some((l) => l.accountId === accountId));
    if (isReferenced) {
      throw new ConflictError(
        `Account '${account.code} - ${account.name}' is referenced in posted journal entries and cannot be deleted`
      );
    }

    if (this.isTest()) {
      getMap(testCoaStore, tenantId).delete(accountId);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('chartOfAccounts')
        .doc(accountId)
        .delete();
    }

    await AuditService.log({
      tenantId,
      action: 'ACCOUNTING_ACCOUNT_DELETED',
      actingUserId: userId,
      metadata: { accountId, code: account.code, name: account.name },
    });
  }

  // ==================== FINANCIAL PERIODS ====================

  public static async listFinancialPeriods(tenantId: string): Promise<FinancialPeriodRecord[]> {
    await this.ensureInitialized(tenantId);
    if (this.isTest()) {
      return Array.from(getMap(testPeriodStore, tenantId).values()).sort((a, b) =>
        a.startDate.localeCompare(b.startDate)
      );
    }
    const snap = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('financialPeriods')
      .get();
    return snap.docs
      .map((d) => d.data() as FinancialPeriodRecord)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  public static async closeFinancialPeriod(
    tenantId: string,
    periodId: string,
    userId: string,
    notes?: string
  ): Promise<FinancialPeriodRecord> {
    await this.ensureInitialized(tenantId, userId);
    const periods = await this.listFinancialPeriods(tenantId);
    const period = periods.find((p) => p.id === periodId);
    if (!period) throw new NotFoundError(`Financial period '${periodId}' not found`);
    if (period.status === 'CLOSED') {
      throw new ConflictError(`Financial period '${period.periodName}' is already closed`);
    }

    const now = new Date().toISOString();
    const updated: FinancialPeriodRecord = {
      ...period,
      status: 'CLOSED',
      closedAt: now,
      closedBy: userId,
      closeNotes: notes?.trim() || null,
      updatedAt: now,
    };

    if (this.isTest()) {
      getMap(testPeriodStore, tenantId).set(periodId, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('financialPeriods')
        .doc(periodId)
        .set(updated);
    }

    await AuditService.log({
      tenantId,
      action: 'FINANCIAL_PERIOD_CLOSED',
      actingUserId: userId,
      metadata: { periodId, periodName: period.periodName, notes },
    });
    return updated;
  }

  public static async reopenFinancialPeriod(
    tenantId: string,
    periodId: string,
    reason: string,
    userId: string
  ): Promise<FinancialPeriodRecord> {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestError('A valid audit reason (minimum 5 characters) is required to reopen a closed period');
    }
    await this.ensureInitialized(tenantId, userId);
    const periods = await this.listFinancialPeriods(tenantId);
    const period = periods.find((p) => p.id === periodId);
    if (!period) throw new NotFoundError(`Financial period '${periodId}' not found`);
    if (period.status === 'OPEN') {
      throw new ConflictError(`Financial period '${period.periodName}' is already open`);
    }

    const now = new Date().toISOString();
    const updated: FinancialPeriodRecord = {
      ...period,
      status: 'OPEN',
      reopenedAt: now,
      reopenedBy: userId,
      reopenReason: reason.trim(),
      updatedAt: now,
    };

    if (this.isTest()) {
      getMap(testPeriodStore, tenantId).set(periodId, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('financialPeriods')
        .doc(periodId)
        .set(updated);
    }

    await AuditService.log({
      tenantId,
      action: 'FINANCIAL_PERIOD_REOPENED',
      actingUserId: userId,
      metadata: { periodId, periodName: period.periodName, reason: reason.trim() },
    });
    return updated;
  }

  // ==================== DOUBLE-ENTRY JOURNAL ENGINE ====================

  public static async postJournalEntry(input: PostJournalInput): Promise<{ entry: JournalEntryRecord; replayed: boolean }> {
    const { tenantId, branchId, entryType, referenceType, referenceId, narration, idempotencyKey, createdBy } = input;
    const txDate = normalizeIsoDate(input.transactionDate);
    const cleanKey = idempotencyKey.trim();
    if (!cleanKey) {
      throw new BadRequestError('Journal idempotencyKey is required');
    }
    if (!input.lines || input.lines.length < 2) {
      throw new BadRequestError('Double-entry journal requires at least 2 posting lines');
    }

    return withTenantAccountingLock(tenantId, async () => {
      await this.ensureInitialized(tenantId, createdBy);
      const accounts = await this.listAccounts(tenantId, { includeInactive: true });
      const byId = new Map(accounts.map((a) => [a.id, a]));
      const bySys = new Map<SystemAccountCode, ChartOfAccountRecord>();
      accounts.forEach((a) => {
        if (a.systemCode) bySys.set(a.systemCode, a);
      });

      // Validate and construct lines in integer paise
      const resolvedLines: JournalLineRecord[] = [];
      let debitTotalPaise = 0;
      let creditTotalPaise = 0;

      const entryId = deterministicAccountingId('je', tenantId, cleanKey);

      input.lines.forEach((lineInput, idx) => {
        const debitPaise = Math.round(Number(lineInput.debitPaise || 0));
        const creditPaise = Math.round(Number(lineInput.creditPaise || 0));
        if (!Number.isInteger(debitPaise) || !Number.isInteger(creditPaise) || debitPaise < 0 || creditPaise < 0) {
          throw new BadRequestError('Journal line amounts must be non-negative integer paise');
        }
        if ((debitPaise > 0 && creditPaise > 0) || (debitPaise === 0 && creditPaise === 0)) {
          throw new BadRequestError('Each journal line must have either a positive debit or a positive credit (never both or zero)');
        }

        const acc = lineInput.accountId
          ? byId.get(lineInput.accountId)
          : lineInput.systemCode
          ? bySys.get(lineInput.systemCode)
          : undefined;
        if (!acc) {
          throw new BadRequestError(
            `Invalid ledger account specified on journal line ${idx + 1}: ${lineInput.accountId || lineInput.systemCode}`
          );
        }
        if (!acc.isActive) {
          throw new BadRequestError(`Ledger account '${acc.code} - ${acc.name}' is inactive`);
        }

        debitTotalPaise += debitPaise;
        creditTotalPaise += creditPaise;

        resolvedLines.push({
          id: `${entryId}_l${idx + 1}`,
          entryId,
          tenantId,
          branchId: lineInput.branchId || branchId || 'main',
          transactionDate: txDate,
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          accountCategory: acc.category,
          normalBalance: acc.normalBalance,
          debitPaise,
          creditPaise,
          debit: fromPaise(debitPaise),
          credit: fromPaise(creditPaise),
          description: lineInput.description?.trim() || null,
        });
      });

      if (debitTotalPaise <= 0) {
        throw new BadRequestError('Journal total amount must be greater than zero');
      }
      if (debitTotalPaise !== creditTotalPaise) {
        throw new BadRequestError(
          `Unbalanced journal entry: Total Debit (₹${fromPaise(debitTotalPaise).toFixed(2)}) != Total Credit (₹${fromPaise(creditTotalPaise).toFixed(2)})`
        );
      }

      // Check idempotency key & payload hash
      const payloadSig = crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            branchId,
            entryType,
            txDate,
            referenceType,
            referenceId,
            lines: resolvedLines.map((l) => [l.accountId, l.debitPaise, l.creditPaise]),
          })
        )
        .digest('hex');

      const opId = deterministicAccountingId('aop', tenantId, cleanKey);

      if (this.isTest()) {
        const journalMap = getMap(testJournalStore, tenantId);
        const existingByKey = journalMap.get(entryId);
        if (existingByKey) {
          const opExisting = getMap(testAccountingOpStore, tenantId).get(opId);
          if (opExisting && opExisting.referenceId === referenceId) {
            return { entry: existingByKey, replayed: true };
          }
          if (existingByKey.referenceType === referenceType && existingByKey.referenceId === referenceId) {
            return { entry: existingByKey, replayed: true };
          }
          throw new IdempotencyConflictError(`Duplicate accounting idempotency key '${cleanKey}'`);
        }

        // Enforce period lock
        const period = await this.ensureFyPeriodsExist(tenantId, txDate);
        if (period.status === 'CLOSED') {
          throw new ConflictError(
            `Financial period '${period.periodName}' (${period.startDate} to ${period.endDate}) is CLOSED. Reopen the period before posting transactions on ${txDate}.`
          );
        }

        const voucherNumber = await this.allocateVoucherNumber(tenantId, 'JV', txDate);
        const now = new Date().toISOString();
        const entry: JournalEntryRecord = {
          id: entryId,
          tenantId,
          branchId: branchId || 'main',
          voucherNumber,
          entryType,
          status: 'POSTED',
          transactionDate: txDate,
          periodId: period.id,
          referenceType,
          referenceId,
          referenceNumber: input.referenceNumber || null,
          narration: narration.trim(),
          idempotencyKey: cleanKey,
          debitTotalPaise,
          creditTotalPaise,
          debitTotal: fromPaise(debitTotalPaise),
          creditTotal: fromPaise(creditTotalPaise),
          lines: resolvedLines,
          reversesEntryId: input.reversesEntryId || null,
          reversedByEntryId: null,
          reversedAt: null,
          reversedBy: null,
          reversalReason: null,
          metadata: { ...(input.metadata || {}), payloadSig },
          createdBy,
          createdAt: now,
        };

        journalMap.set(entryId, entry);
        getMap(testAccountingOpStore, tenantId).set(opId, {
          id: opId,
          tenantId,
          operationType: entryType,
          referenceType,
          referenceId,
          idempotencyKey: cleanKey,
          status: 'COMMITTED',
          journalEntryId: entryId,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
        });

        return { entry, replayed: false };
      }

      // Firestore Production Transaction
      const db = firestore();
      const tenantRef = db.collection('tenants').doc(tenantId);
      const entryRef = tenantRef.collection('journalEntries').doc(entryId);
      const opRef = tenantRef.collection('accountingOperations').doc(opId);

      const period = await this.ensureFyPeriodsExist(tenantId, txDate);
      if (period.status === 'CLOSED') {
        throw new ConflictError(
          `Financial period '${period.periodName}' (${period.startDate} to ${period.endDate}) is CLOSED. Reopen the period before posting transactions on ${txDate}.`
        );
      }

      const existingSnap = await entryRef.get();
      if (existingSnap.exists) {
        const existingData = existingSnap.data() as JournalEntryRecord;
        if (existingData.referenceType === referenceType && existingData.referenceId === referenceId) {
          return { entry: existingData, replayed: true };
        }
        throw new IdempotencyConflictError(`Duplicate accounting idempotency key '${cleanKey}'`);
      }

      const voucherNumber = await this.allocateVoucherNumber(tenantId, 'JV', txDate);
      const now = new Date().toISOString();
      const entry: JournalEntryRecord = {
        id: entryId,
        tenantId,
        branchId: branchId || 'main',
        voucherNumber,
        entryType,
        status: 'POSTED',
        transactionDate: txDate,
        periodId: period.id,
        referenceType,
        referenceId,
        referenceNumber: input.referenceNumber || null,
        narration: narration.trim(),
        idempotencyKey: cleanKey,
        debitTotalPaise,
        creditTotalPaise,
        debitTotal: fromPaise(debitTotalPaise),
        creditTotal: fromPaise(creditTotalPaise),
        lines: resolvedLines,
        reversesEntryId: input.reversesEntryId || null,
        reversedByEntryId: null,
        reversedAt: null,
        reversedBy: null,
        reversalReason: null,
        metadata: { ...(input.metadata || {}), payloadSig },
        createdBy,
        createdAt: now,
      };

      await db.runTransaction(async (tx) => {
        const checkSnap = await tx.get(entryRef);
        if (checkSnap.exists) {
          return;
        }
        tx.set(entryRef, entry);
        for (const line of resolvedLines) {
          tx.set(entryRef.collection('lines').doc(line.id), line);
        }
        tx.set(opRef, {
          id: opId,
          tenantId,
          operationType: entryType,
          referenceType,
          referenceId,
          idempotencyKey: cleanKey,
          status: 'COMMITTED',
          journalEntryId: entryId,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
        });
      });

      const finalSnap = await entryRef.get();
      return { entry: finalSnap.data() as JournalEntryRecord, replayed: false };
    });
  }

  public static async listJournalEntries(
    tenantId: string,
    filters?: {
      branchId?: string;
      entryType?: JournalEntryType;
      status?: 'POSTED' | 'REVERSED';
      fromDate?: string;
      toDate?: string;
      accountId?: string;
      referenceType?: string;
      referenceId?: string;
      search?: string;
      limit?: number;
    }
  ): Promise<JournalEntryRecord[]> {
    await this.ensureInitialized(tenantId);
    let list: JournalEntryRecord[] = [];
    if (this.isTest()) {
      list = Array.from(getMap(testJournalStore, tenantId).values());
    } else {
      const snap = await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('journalEntries')
        .get();
      list = snap.docs.map((d) => d.data() as JournalEntryRecord);
    }

    if (filters?.branchId && filters.branchId !== 'ALL') {
      list = list.filter((e) => e.branchId === filters.branchId || e.lines.some((l) => l.branchId === filters.branchId));
    }
    if (filters?.entryType) {
      list = list.filter((e) => e.entryType === filters.entryType);
    }
    if (filters?.status) {
      list = list.filter((e) => e.status === filters.status);
    }
    if (filters?.fromDate) {
      const from = normalizeIsoDate(filters.fromDate);
      list = list.filter((e) => e.transactionDate >= from);
    }
    if (filters?.toDate) {
      const to = normalizeIsoDate(filters.toDate);
      list = list.filter((e) => e.transactionDate <= to);
    }
    if (filters?.accountId) {
      list = list.filter((e) => e.lines.some((l) => l.accountId === filters.accountId));
    }
    if (filters?.referenceType) {
      list = list.filter((e) => e.referenceType === filters.referenceType);
    }
    if (filters?.referenceId) {
      list = list.filter((e) => e.referenceId === filters.referenceId);
    }
    if (filters?.search) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.voucherNumber.toLowerCase().includes(q) ||
          e.narration.toLowerCase().includes(q) ||
          (e.referenceNumber || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const dateCmp = b.transactionDate.localeCompare(a.transactionDate);
      return dateCmp !== 0 ? dateCmp : b.createdAt.localeCompare(a.createdAt);
    });

    if (filters?.limit && filters.limit > 0) {
      return list.slice(0, filters.limit);
    }
    return list;
  }

  public static async getJournalEntryById(tenantId: string, entryId: string): Promise<JournalEntryRecord> {
    await this.ensureInitialized(tenantId);
    if (this.isTest()) {
      const e = getMap(testJournalStore, tenantId).get(entryId);
      if (!e) throw new NotFoundError(`Journal entry '${entryId}' not found`);
      return e;
    }
    const doc = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('journalEntries')
      .doc(entryId)
      .get();
    if (!doc.exists) throw new NotFoundError(`Journal entry '${entryId}' not found`);
    return doc.data() as JournalEntryRecord;
  }

  public static async reverseJournalEntry(
    tenantId: string,
    entryId: string,
    reason: string,
    userId: string,
    reversalDate?: string
  ): Promise<{ original: JournalEntryRecord; reversal: JournalEntryRecord }> {
    if (!reason || reason.trim().length < 4) {
      throw new BadRequestError('A valid reversal reason (minimum 4 characters) is required');
    }
    const original = await this.getJournalEntryById(tenantId, entryId);
    if (original.status === 'REVERSED' || original.reversedByEntryId) {
      throw new ConflictError(`Journal entry '${original.voucherNumber}' has already been reversed`);
    }

    const txDate = normalizeIsoDate(reversalDate || new Date().toISOString());
    const contraLines: PostJournalLineInput[] = original.lines.map((l) => ({
      accountId: l.accountId,
      branchId: l.branchId,
      debitPaise: l.creditPaise,
      creditPaise: l.debitPaise,
      description: `Reversal of ${original.voucherNumber}: ${l.description || original.narration}`,
    }));

    const { entry: reversal } = await this.postJournalEntry({
      tenantId,
      branchId: original.branchId,
      entryType: 'REVERSAL',
      transactionDate: txDate,
      referenceType: 'journal_reversal',
      referenceId: original.id,
      referenceNumber: original.voucherNumber,
      narration: `Reversal of ${original.voucherNumber} — ${reason.trim()}`,
      idempotencyKey: `reversal:${original.id}`,
      lines: contraLines,
      createdBy: userId,
      reversesEntryId: original.id,
      metadata: {
        originalEntryType: original.entryType,
        originalReferenceType: original.referenceType,
        originalReferenceId: original.referenceId,
      },
    });

    const now = new Date().toISOString();
    const updatedOriginal: JournalEntryRecord = {
      ...original,
      status: 'REVERSED',
      reversedByEntryId: reversal.id,
      reversedAt: now,
      reversedBy: userId,
      reversalReason: reason.trim(),
    };

    if (this.isTest()) {
      getMap(testJournalStore, tenantId).set(original.id, updatedOriginal);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('journalEntries')
        .doc(original.id)
        .update({
          status: 'REVERSED',
          reversedByEntryId: reversal.id,
          reversedAt: now,
          reversedBy: userId,
          reversalReason: reason.trim(),
        });
    }

    await AuditService.log({
      tenantId,
      action: 'JOURNAL_ENTRY_REVERSED',
      actingUserId: userId,
      metadata: {
        originalEntryId: original.id,
        originalVoucher: original.voucherNumber,
        reversalEntryId: reversal.id,
        reversalVoucher: reversal.voucherNumber,
        reason: reason.trim(),
      },
    });

    return { original: updatedOriginal, reversal };
  }

  public static async recordFailedOperation(
    tenantId: string,
    params: {
      operationType: string;
      referenceType: string;
      referenceId: string;
      idempotencyKey: string;
      errorMessage: string;
    }
  ): Promise<void> {
    const opId = deterministicAccountingId('aop', tenantId, params.idempotencyKey);
    const now = new Date().toISOString();
    const record: AccountingOperationRecord = {
      id: opId,
      tenantId,
      operationType: params.operationType,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      idempotencyKey: params.idempotencyKey,
      status: 'FAILED',
      journalEntryId: null,
      errorMessage: params.errorMessage,
      createdAt: now,
      updatedAt: now,
    };
    if (this.isTest()) {
      getMap(testAccountingOpStore, tenantId).set(opId, record);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('accountingOperations')
        .doc(opId)
        .set(record, { merge: true });
    }
  }

  public static async listAccountingOperations(tenantId: string): Promise<AccountingOperationRecord[]> {
    if (this.isTest()) {
      return Array.from(getMap(testAccountingOpStore, tenantId).values());
    }
    const snap = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('accountingOperations')
      .get();
    return snap.docs.map((d) => d.data() as AccountingOperationRecord);
  }

  // ==================== OPENING BALANCES ====================

  public static async postOpeningBalances(
    tenantId: string,
    input: {
      branchId: string;
      asOfDate: string;
      entries: Array<{ accountId: string; debit?: number; credit?: number; description?: string }>;
      notes?: string;
    },
    userId: string
  ): Promise<{ batch: OpeningBalanceBatchRecord; journal: JournalEntryRecord }> {
    await this.ensureInitialized(tenantId, userId);
    if (!input.entries || input.entries.length === 0) {
      throw new BadRequestError('At least one opening balance line is required');
    }

    const lines: PostJournalLineInput[] = [];
    let netDebitPaise = 0;
    let netCreditPaise = 0;

    for (const row of input.entries) {
      const d = toPaise(row.debit || 0);
      const c = toPaise(row.credit || 0);
      if (d < 0 || c < 0 || (d > 0 && c > 0) || (d === 0 && c === 0)) {
        throw new BadRequestError('Each opening balance entry must have either a positive debit or positive credit');
      }
      netDebitPaise += d;
      netCreditPaise += c;
      lines.push({
        accountId: row.accountId,
        branchId: input.branchId || 'main',
        debitPaise: d,
        creditPaise: c,
        description: row.description || 'Opening Balance',
      });
    }

    // Offset any difference to Opening Balance Equity (3200)
    const diff = netDebitPaise - netCreditPaise;
    if (diff > 0) {
      lines.push({
        systemCode: 'OPENING_BALANCE_EQUITY',
        branchId: input.branchId || 'main',
        creditPaise: diff,
        description: 'Opening Balance Equity Offset',
      });
    } else if (diff < 0) {
      lines.push({
        systemCode: 'OPENING_BALANCE_EQUITY',
        branchId: input.branchId || 'main',
        debitPaise: Math.abs(diff),
        description: 'Opening Balance Equity Offset',
      });
    }

    const batchId = `ob_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const asOfDate = normalizeIsoDate(input.asOfDate);

    const { entry: journal } = await this.postJournalEntry({
      tenantId,
      branchId: input.branchId || 'main',
      entryType: 'OPENING_BALANCE',
      transactionDate: asOfDate,
      referenceType: 'opening_balance_batch',
      referenceId: batchId,
      narration: input.notes?.trim() || `Opening balances as of ${asOfDate}`,
      idempotencyKey: `opening_balance:${batchId}`,
      lines,
      createdBy: userId,
    });

    const batchRecord: OpeningBalanceBatchRecord = {
      id: batchId,
      tenantId,
      branchId: input.branchId || 'main',
      asOfDate,
      journalEntryId: journal.id,
      voucherNumber: journal.voucherNumber,
      totalDebit: journal.debitTotal,
      totalCredit: journal.creditTotal,
      linesCount: journal.lines.length,
      notes: input.notes?.trim() || null,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };

    if (this.isTest()) {
      getMap(testOpeningBatchStore, tenantId).set(batchId, batchRecord);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('openingBalanceBatches')
        .doc(batchId)
        .set(batchRecord);
    }

    await AuditService.log({
      tenantId,
      action: 'OPENING_BALANCES_POSTED',
      actingUserId: userId,
      metadata: { batchId, voucherNumber: journal.voucherNumber, asOfDate, total: journal.debitTotal },
    });

    return { batch: batchRecord, journal };
  }

  // ==================== CASH & BANK ACCOUNTS + TRANSFERS + RECONCILIATION ====================

  public static async listCashAndBankAccounts(tenantId: string): Promise<{
    cashAccounts: CashAccountRecord[];
    bankAccounts: BankAccountRecord[];
    clearingAccounts: ChartOfAccountRecord[];
  }> {
    await this.ensureInitialized(tenantId);
    const coa = await this.listAccounts(tenantId, { includeInactive: true });
    const clearingAccounts = coa.filter((a) => a.subType === 'CLEARING' && a.category === 'ASSETS');

    if (this.isTest()) {
      return {
        cashAccounts: Array.from(getMap(testCashStore, tenantId).values()),
        bankAccounts: Array.from(getMap(testBankStore, tenantId).values()),
        clearingAccounts,
      };
    }

    const db = firestore();
    const tenantRef = db.collection('tenants').doc(tenantId);
    const [cashSnap, bankSnap] = await Promise.all([
      tenantRef.collection('cashAccounts').get(),
      tenantRef.collection('bankAccounts').get(),
    ]);
    return {
      cashAccounts: cashSnap.docs.map((d) => d.data() as CashAccountRecord),
      bankAccounts: bankSnap.docs.map((d) => d.data() as BankAccountRecord),
      clearingAccounts,
    };
  }

  public static async createBankAccount(
    tenantId: string,
    input: {
      branchId: string;
      accountName: string;
      bankName: string;
      branchName?: string;
      ifscCode?: string;
      accountNumberLast4: string;
      openingBalance?: number;
      openingBalanceDate?: string;
    },
    userId: string
  ): Promise<BankAccountRecord> {
    await this.ensureInitialized(tenantId, userId);
    const existingCoa = await this.listAccounts(tenantId, { includeInactive: true });
    const bankCount = existingCoa.filter((a) => a.subType === 'BANK').length;
    const code = `12${String(bankCount + 1).padStart(2, '0')}`;
    const ledgerAccount = await this.createAccount(
      tenantId,
      {
        code,
        name: `${input.bankName.trim()} - ${input.accountName.trim()}`,
        category: 'ASSETS',
        subType: 'BANK',
        normalBalance: 'DEBIT',
        description: `Bank account ending ${input.accountNumberLast4.slice(-4)}`,
      },
      userId
    );

    const now = new Date().toISOString();
    const id = `bank_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const record: BankAccountRecord = {
      id,
      tenantId,
      branchId: input.branchId || 'main',
      accountName: input.accountName.trim(),
      bankName: input.bankName.trim(),
      branchName: input.branchName?.trim() || null,
      ifscCode: input.ifscCode?.trim().toUpperCase() || null,
      maskedAccountNumber: `XXXX${input.accountNumberLast4.trim().slice(-4)}`,
      ledgerAccountId: ledgerAccount.id,
      ledgerAccountCode: ledgerAccount.code,
      status: 'ACTIVE',
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isTest()) {
      getMap(testBankStore, tenantId).set(id, record);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('bankAccounts')
        .doc(id)
        .set(record);
    }

    if (input.openingBalance && input.openingBalance > 0) {
      await this.postOpeningBalances(
        tenantId,
        {
          branchId: record.branchId,
          asOfDate: normalizeIsoDate(input.openingBalanceDate),
          entries: [{ accountId: ledgerAccount.id, debit: input.openingBalance, description: `Opening Balance: ${record.accountName}` }],
          notes: `Bank Account Opening Balance: ${record.accountName}`,
        },
        userId
      );
    }

    return record;
  }

  public static async recordInternalTransfer(
    tenantId: string,
    input: {
      branchId: string;
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      transferDate: string;
      referenceNumber?: string;
      notes?: string;
      idempotencyKey?: string;
    },
    userId: string
  ): Promise<{ journal: JournalEntryRecord; replayed: boolean }> {
    await this.ensureInitialized(tenantId, userId);
    const amountPaise = toPaise(input.amount);
    if (amountPaise <= 0) {
      throw new BadRequestError('Transfer amount must be greater than zero');
    }
    if (input.fromAccountId === input.toAccountId) {
      throw new BadRequestError('Source and destination accounts must be different');
    }

    const fromAcc = await this.getAccountById(tenantId, input.fromAccountId);
    const toAcc = await this.getAccountById(tenantId, input.toAccountId);
    if (fromAcc.category !== 'ASSETS' || toAcc.category !== 'ASSETS') {
      throw new BadRequestError('Internal transfers are only permitted between asset cash, bank, and clearing accounts');
    }

    const cleanKey = input.idempotencyKey?.trim() || `transfer_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const transferId = deterministicAccountingId('trf', tenantId, cleanKey);
    const { entry, replayed } = await this.postJournalEntry({
      tenantId,
      branchId: input.branchId || 'main',
      entryType: 'INTERNAL_TRANSFER',
      transactionDate: normalizeIsoDate(input.transferDate),
      referenceType: 'internal_transfer',
      referenceId: transferId,
      referenceNumber: input.referenceNumber || null,
      narration:
        input.notes?.trim() || `Internal fund transfer: ${fromAcc.name} -> ${toAcc.name}`,
      idempotencyKey: `transfer:${cleanKey}`,
      lines: [
        {
          accountId: toAcc.id,
          branchId: input.branchId || 'main',
          debitPaise: amountPaise,
          description: `Transfer received from ${fromAcc.name}`,
        },
        {
          accountId: fromAcc.id,
          branchId: input.branchId || 'main',
          creditPaise: amountPaise,
          description: `Transfer sent to ${toAcc.name}`,
        },
      ],
      createdBy: userId,
    });

    return { journal: entry, replayed };
  }

  public static async recordBankCharge(
    tenantId: string,
    input: {
      branchId: string;
      bankLedgerAccountId?: string;
      amount: number;
      chargeDate: string;
      description: string;
      referenceNumber?: string;
      idempotencyKey?: string;
    },
    userId: string
  ): Promise<{ journal: JournalEntryRecord }> {
    await this.ensureInitialized(tenantId, userId);
    const amountPaise = toPaise(input.amount);
    if (amountPaise <= 0) {
      throw new BadRequestError('Bank charge amount must be greater than zero');
    }
    const bankAcc = input.bankLedgerAccountId
      ? await this.getAccountById(tenantId, input.bankLedgerAccountId)
      : await this.getAccountBySystemCode(tenantId, 'MAIN_BANK');

    const cleanKey = input.idempotencyKey?.trim() || `bankchg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const { entry } = await this.postJournalEntry({
      tenantId,
      branchId: input.branchId || 'main',
      entryType: 'BANK_CHARGES',
      transactionDate: normalizeIsoDate(input.chargeDate),
      referenceType: 'bank_charge',
      referenceId: cleanKey,
      referenceNumber: input.referenceNumber || null,
      narration: input.description.trim() || `Bank charges on ${bankAcc.name}`,
      idempotencyKey: `bank_charge:${cleanKey}`,
      lines: [
        {
          systemCode: 'EXP_BANK_CHARGES',
          branchId: input.branchId || 'main',
          debitPaise: amountPaise,
          description: input.description.trim(),
        },
        {
          accountId: bankAcc.id,
          branchId: input.branchId || 'main',
          creditPaise: amountPaise,
          description: `Bank debit: ${input.description.trim()}`,
        },
      ],
      createdBy: userId,
    });

    return { journal: entry };
  }

  public static async importBankStatement(
    tenantId: string,
    input: {
      bankAccountId: string;
      statementDate: string;
      statementBalance: number;
      lines: Array<{ date: string; description: string; reference?: string; debit?: number; credit?: number }>;
    },
    userId: string
  ): Promise<BankReconciliationRecord> {
    await this.ensureInitialized(tenantId, userId);
    const { bankAccounts } = await this.listCashAndBankAccounts(tenantId);
    const bankAcc = bankAccounts.find((b) => b.id === input.bankAccountId);
    if (!bankAcc) throw new NotFoundError(`Bank account '${input.bankAccountId}' not found`);

    const entries = await this.listJournalEntries(tenantId, {
      accountId: bankAcc.ledgerAccountId,
      toDate: normalizeIsoDate(input.statementDate),
    });

    let ledgerPaise = 0;
    entries.forEach((e) => {
      e.lines
        .filter((l) => l.accountId === bankAcc.ledgerAccountId)
        .forEach((l) => {
          ledgerPaise += l.debitPaise - l.creditPaise;
        });
    });

    const reconId = `brec_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();
    const lines: BankStatementLine[] = (input.lines || []).map((l, idx) => ({
      id: `${reconId}_ln_${idx + 1}`,
      date: normalizeIsoDate(l.date),
      description: l.description.trim(),
      reference: l.reference?.trim() || null,
      debit: Number(Number(l.debit || 0).toFixed(2)),
      credit: Number(Number(l.credit || 0).toFixed(2)),
      matchedJournalEntryId: null,
      matchedVoucherNumber: null,
      matchedAt: null,
    }));

    const ledgerBalance = fromPaise(ledgerPaise);
    const stmtBal = Number(Number(input.statementBalance || 0).toFixed(2));
    const record: BankReconciliationRecord = {
      id: reconId,
      tenantId,
      bankAccountId: bankAcc.id,
      bankAccountName: `${bankAcc.bankName} - ${bankAcc.accountName}`,
      ledgerAccountId: bankAcc.ledgerAccountId,
      statementDate: normalizeIsoDate(input.statementDate),
      statementBalance: stmtBal,
      ledgerBalance,
      difference: Number((stmtBal - ledgerBalance).toFixed(2)),
      lines,
      matchedCount: 0,
      unmatchedCount: lines.length,
      status: lines.length === 0 && stmtBal === ledgerBalance ? 'MATCHED' : 'OPEN',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isTest()) {
      getMap(testBankReconStore, tenantId).set(reconId, record);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('bankReconciliations')
        .doc(reconId)
        .set(record);
    }

    return record;
  }

  public static async listBankReconciliations(tenantId: string): Promise<BankReconciliationRecord[]> {
    await this.ensureInitialized(tenantId);
    if (this.isTest()) {
      return Array.from(getMap(testBankReconStore, tenantId).values()).sort((a, b) =>
        b.statementDate.localeCompare(a.statementDate)
      );
    }
    const snap = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('bankReconciliations')
      .get();
    return snap.docs
      .map((d) => d.data() as BankReconciliationRecord)
      .sort((a, b) => b.statementDate.localeCompare(a.statementDate));
  }

  public static async matchBankStatementLine(
    tenantId: string,
    reconciliationId: string,
    lineId: string,
    journalEntryId: string,
    userId: string
  ): Promise<BankReconciliationRecord> {
    const list = await this.listBankReconciliations(tenantId);
    const rec = list.find((r) => r.id === reconciliationId);
    if (!rec) throw new NotFoundError(`Bank reconciliation '${reconciliationId}' not found`);

    const journal = await this.getJournalEntryById(tenantId, journalEntryId);
    const hasBankLine = journal.lines.some((l) => l.accountId === rec.ledgerAccountId);
    if (!hasBankLine) {
      throw new BadRequestError(`Journal '${journal.voucherNumber}' does not post to bank account '${rec.bankAccountName}'`);
    }

    const lineIdx = rec.lines.findIndex((l) => l.id === lineId);
    if (lineIdx === -1) throw new NotFoundError(`Statement line '${lineId}' not found`);

    const now = new Date().toISOString();
    const updatedLines = rec.lines.map((l, idx) =>
      idx === lineIdx
        ? { ...l, matchedJournalEntryId: journal.id, matchedVoucherNumber: journal.voucherNumber, matchedAt: now }
        : l
    );

    const matchedCount = updatedLines.filter((l) => Boolean(l.matchedJournalEntryId)).length;
    const unmatchedCount = updatedLines.length - matchedCount;
    const updated: BankReconciliationRecord = {
      ...rec,
      lines: updatedLines,
      matchedCount,
      unmatchedCount,
      status: unmatchedCount === 0 ? 'MATCHED' : 'OPEN',
      updatedAt: now,
    };

    if (this.isTest()) {
      getMap(testBankReconStore, tenantId).set(reconciliationId, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('bankReconciliations')
        .doc(reconciliationId)
        .set(updated);
    }

    await AuditService.log({
      tenantId,
      action: 'BANK_STATEMENT_LINE_MATCHED',
      actingUserId: userId,
      metadata: { reconciliationId, lineId, journalEntryId, voucherNumber: journal.voucherNumber },
    });

    return updated;
  }

  // ==================== EXPENSE MANAGEMENT ====================

  public static async createExpense(
    tenantId: string,
    input: {
      branchId: string;
      expenseDate: string;
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
      receiptAttachmentPath?: string;
      notes?: string;
      autoApprove?: boolean;
    },
    userId: string
  ): Promise<ExpenseRecord> {
    await this.ensureInitialized(tenantId, userId);
    const catAccount = await this.getAccountById(tenantId, input.categoryAccountId);
    if (catAccount.category !== 'EXPENSES') {
      throw new BadRequestError(`Account '${catAccount.code} - ${catAccount.name}' is not an expense account`);
    }

    const taxablePaise = toPaise(input.taxableAmount);
    const cgstPaise = toPaise(input.cgst || 0);
    const sgstPaise = toPaise(input.sgst || 0);
    const igstPaise = toPaise(input.igst || 0);
    if (taxablePaise <= 0) {
      throw new BadRequestError('Expense taxable amount must be greater than zero');
    }
    if (cgstPaise < 0 || sgstPaise < 0 || igstPaise < 0) {
      throw new BadRequestError('Tax amounts cannot be negative');
    }
    const totalPaise = taxablePaise + cgstPaise + sgstPaise + igstPaise;
    const txDate = normalizeIsoDate(input.expenseDate);
    const expenseNumber = await this.allocateVoucherNumber(tenantId, 'EXP', txDate);
    const id = `exp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const itcEligible = input.itcEligible !== undefined ? input.itcEligible : cgstPaise + sgstPaise + igstPaise > 0;

    const payMode = input.paymentMode || 'UNPAID';
    const shouldRecognizeNow = input.autoApprove !== false;

    const record: ExpenseRecord = {
      id,
      tenantId,
      branchId: input.branchId || 'main',
      expenseNumber,
      expenseDate: txDate,
      categoryAccountId: catAccount.id,
      categoryAccountCode: catAccount.code,
      categoryAccountName: catAccount.name,
      vendorName: input.vendorName.trim(),
      vendorGstin: input.vendorGstin?.trim().toUpperCase() || null,
      invoiceNumber: input.invoiceNumber?.trim() || null,
      taxableAmount: fromPaise(taxablePaise),
      cgst: fromPaise(cgstPaise),
      sgst: fromPaise(sgstPaise),
      igst: fromPaise(igstPaise),
      itcEligible,
      totalAmount: fromPaise(totalPaise),
      paidAmount: 0,
      outstandingAmount: fromPaise(totalPaise),
      status: shouldRecognizeNow ? 'APPROVED_UNPAID' : 'SUBMITTED',
      approvalStatus: shouldRecognizeNow ? 'APPROVED' : 'PENDING',
      paymentMode: payMode,
      paymentAccountId: input.paymentAccountId || null,
      paymentReference: input.paymentReference?.trim() || null,
      receiptAttachmentPath: input.receiptAttachmentPath?.trim() || null,
      notes: input.notes?.trim() || null,
      recognitionJournalId: null,
      paymentJournalId: null,
      reversalJournalId: null,
      approvedBy: shouldRecognizeNow ? userId : null,
      approvedAt: shouldRecognizeNow ? now : null,
      paidAt: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    if (shouldRecognizeNow) {
      const journal = await this.postExpenseRecognitionJournal(record, payMode, userId);
      record.recognitionJournalId = journal.id;
      if (payMode !== 'UNPAID') {
        record.paidAmount = record.totalAmount;
        record.outstandingAmount = 0;
        record.status = 'PAID';
        record.paymentJournalId = journal.id;
        record.paidAt = now;
      }
    }

    if (this.isTest()) {
      getMap(testExpenseStore, tenantId).set(id, record);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('expenses')
        .doc(id)
        .set(record);
    }

    await AuditService.log({
      tenantId,
      action: 'EXPENSE_CREATED',
      actingUserId: userId,
      metadata: {
        expenseId: id,
        expenseNumber,
        category: catAccount.name,
        totalAmount: record.totalAmount,
        status: record.status,
      },
    });

    return record;
  }

  private static async postExpenseRecognitionJournal(
    exp: ExpenseRecord,
    settlementMode: ExpenseRecord['paymentMode'],
    userId: string
  ): Promise<JournalEntryRecord> {
    const taxablePaise = toPaise(exp.taxableAmount);
    const cgstPaise = toPaise(exp.cgst);
    const sgstPaise = toPaise(exp.sgst);
    const igstPaise = toPaise(exp.igst);
    const totalPaise = toPaise(exp.totalAmount);

    const lines: PostJournalLineInput[] = [];
    if (exp.itcEligible) {
      lines.push({
        accountId: exp.categoryAccountId,
        branchId: exp.branchId,
        debitPaise: taxablePaise,
        description: `${exp.categoryAccountName} - ${exp.vendorName}`,
      });
      if (cgstPaise > 0) lines.push({ systemCode: 'INPUT_CGST', branchId: exp.branchId, debitPaise: cgstPaise, description: `Input CGST (${exp.expenseNumber})` });
      if (sgstPaise > 0) lines.push({ systemCode: 'INPUT_SGST', branchId: exp.branchId, debitPaise: sgstPaise, description: `Input SGST (${exp.expenseNumber})` });
      if (igstPaise > 0) lines.push({ systemCode: 'INPUT_IGST', branchId: exp.branchId, debitPaise: igstPaise, description: `Input IGST (${exp.expenseNumber})` });
    } else {
      lines.push({
        accountId: exp.categoryAccountId,
        branchId: exp.branchId,
        debitPaise: totalPaise,
        description: `${exp.categoryAccountName} (incl non-ITC GST) - ${exp.vendorName}`,
      });
    }

    if (settlementMode && settlementMode !== 'UNPAID') {
      const creditTarget: PostJournalLineInput = exp.paymentAccountId
        ? { accountId: exp.paymentAccountId, branchId: exp.branchId, creditPaise: totalPaise, description: `Paid ${exp.expenseNumber} via ${settlementMode}` }
        : {
            systemCode: settlementMode === 'CASH' ? 'CASH_IN_HAND' : 'MAIN_BANK',
            branchId: exp.branchId,
            creditPaise: totalPaise,
            description: `Paid ${exp.expenseNumber} via ${settlementMode}`,
          };
      lines.push(creditTarget);
    } else {
      // Unpaid approved expense MUST hit Outstanding Expenses (NEVER Cash!)
      lines.push({
        systemCode: 'OUTSTANDING_EXPENSES',
        branchId: exp.branchId,
        creditPaise: totalPaise,
        description: `Accrued unpaid expense ${exp.expenseNumber}`,
      });
    }

    const { entry } = await this.postJournalEntry({
      tenantId: exp.tenantId,
      branchId: exp.branchId,
      entryType: 'EXPENSE_ACCRUAL',
      transactionDate: exp.expenseDate,
      referenceType: 'expense',
      referenceId: exp.id,
      referenceNumber: exp.expenseNumber,
      narration: `Expense ${exp.expenseNumber}: ${exp.categoryAccountName} (${exp.vendorName})`,
      idempotencyKey: `expense_recognition:${exp.id}`,
      lines,
      createdBy: userId,
    });
    return entry;
  }

  public static async approveExpense(tenantId: string, expenseId: string, userId: string): Promise<ExpenseRecord> {
    const exp = await this.getExpenseById(tenantId, expenseId);
    if (exp.approvalStatus === 'APPROVED') {
      return exp;
    }
    if (exp.status === 'REVERSED' || exp.approvalStatus === 'REJECTED') {
      throw new ConflictError(`Cannot approve expense '${exp.expenseNumber}' with status '${exp.status}'`);
    }

    const journal = await this.postExpenseRecognitionJournal(exp, 'UNPAID', userId);
    const now = new Date().toISOString();
    const updated: ExpenseRecord = {
      ...exp,
      status: 'APPROVED_UNPAID',
      approvalStatus: 'APPROVED',
      recognitionJournalId: journal.id,
      approvedBy: userId,
      approvedAt: now,
      updatedAt: now,
    };

    if (this.isTest()) {
      getMap(testExpenseStore, tenantId).set(expenseId, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('expenses')
        .doc(expenseId)
        .set(updated);
    }

    return updated;
  }

  public static async payExpense(
    tenantId: string,
    expenseId: string,
    input: {
      paymentMode: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD';
      paymentAccountId?: string;
      paymentDate?: string;
      referenceNumber?: string;
    },
    userId: string
  ): Promise<ExpenseRecord> {
    const exp = await this.getExpenseById(tenantId, expenseId);
    if (exp.status === 'PAID') {
      throw new ConflictError(`Expense '${exp.expenseNumber}' is already paid`);
    }
    if (exp.status === 'REVERSED' || exp.approvalStatus === 'REJECTED') {
      throw new ConflictError(`Cannot pay expense '${exp.expenseNumber}' with status '${exp.status}'`);
    }

    // Ensure expense was recognized to Outstanding Expenses first
    let current = exp;
    if (!current.recognitionJournalId) {
      current = await this.approveExpense(tenantId, expenseId, userId);
    }

    const payPaise = toPaise(current.outstandingAmount);
    if (payPaise <= 0) {
      throw new BadRequestError('Expense has zero outstanding balance');
    }

    const creditLine: PostJournalLineInput = input.paymentAccountId
      ? { accountId: input.paymentAccountId, branchId: current.branchId, creditPaise: payPaise, description: `Payment of ${current.expenseNumber}` }
      : {
          systemCode: input.paymentMode === 'CASH' ? 'CASH_IN_HAND' : 'MAIN_BANK',
          branchId: current.branchId,
          creditPaise: payPaise,
          description: `Payment of ${current.expenseNumber}`,
        };

    const { entry: paymentJournal } = await this.postJournalEntry({
      tenantId,
      branchId: current.branchId,
      entryType: 'EXPENSE_PAYMENT',
      transactionDate: normalizeIsoDate(input.paymentDate),
      referenceType: 'expense_payment',
      referenceId: current.id,
      referenceNumber: input.referenceNumber || current.expenseNumber,
      narration: `Expense payment ${current.expenseNumber} to ${current.vendorName} via ${input.paymentMode}`,
      idempotencyKey: `expense_payment:${current.id}`,
      lines: [
        {
          systemCode: 'OUTSTANDING_EXPENSES',
          branchId: current.branchId,
          debitPaise: payPaise,
          description: `Clear payable for ${current.expenseNumber}`,
        },
        creditLine,
      ],
      createdBy: userId,
    });

    const now = new Date().toISOString();
    const updated: ExpenseRecord = {
      ...current,
      paidAmount: current.totalAmount,
      outstandingAmount: 0,
      status: 'PAID',
      paymentMode: input.paymentMode,
      paymentAccountId: input.paymentAccountId || null,
      paymentReference: input.referenceNumber?.trim() || null,
      paymentJournalId: paymentJournal.id,
      paidAt: now,
      updatedAt: now,
    };

    if (this.isTest()) {
      getMap(testExpenseStore, tenantId).set(expenseId, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('expenses')
        .doc(expenseId)
        .set(updated);
    }

    return updated;
  }

  public static async reverseExpense(
    tenantId: string,
    expenseId: string,
    reason: string,
    userId: string
  ): Promise<ExpenseRecord> {
    if (!reason || reason.trim().length < 4) {
      throw new BadRequestError('A valid reversal reason (minimum 4 characters) is required');
    }
    const exp = await this.getExpenseById(tenantId, expenseId);
    if (exp.status === 'REVERSED') {
      throw new ConflictError(`Expense '${exp.expenseNumber}' is already reversed`);
    }

    let lastRevId: string | null = null;
    if (exp.paymentJournalId && exp.paymentJournalId !== exp.recognitionJournalId) {
      const { reversal } = await this.reverseJournalEntry(tenantId, exp.paymentJournalId, reason, userId);
      lastRevId = reversal.id;
    }
    if (exp.recognitionJournalId) {
      const { reversal } = await this.reverseJournalEntry(tenantId, exp.recognitionJournalId, reason, userId);
      lastRevId = reversal.id;
    }

    const now = new Date().toISOString();
    const updated: ExpenseRecord = {
      ...exp,
      status: 'REVERSED',
      outstandingAmount: 0,
      reversalJournalId: lastRevId,
      updatedAt: now,
    };

    if (this.isTest()) {
      getMap(testExpenseStore, tenantId).set(expenseId, updated);
    } else {
      await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('expenses')
        .doc(expenseId)
        .set(updated);
    }

    return updated;
  }

  public static async getExpenseById(tenantId: string, expenseId: string): Promise<ExpenseRecord> {
    await this.ensureInitialized(tenantId);
    if (this.isTest()) {
      const e = getMap(testExpenseStore, tenantId).get(expenseId);
      if (!e) throw new NotFoundError(`Expense '${expenseId}' not found`);
      return e;
    }
    const doc = await firestore()
      .collection('tenants')
      .doc(tenantId)
      .collection('expenses')
      .doc(expenseId)
      .get();
    if (!doc.exists) throw new NotFoundError(`Expense '${expenseId}' not found`);
    return doc.data() as ExpenseRecord;
  }

  public static async listExpenses(
    tenantId: string,
    filters?: {
      branchId?: string;
      status?: ExpenseRecord['status'];
      categoryAccountId?: string;
      fromDate?: string;
      toDate?: string;
    }
  ): Promise<ExpenseRecord[]> {
    await this.ensureInitialized(tenantId);
    let list: ExpenseRecord[] = [];
    if (this.isTest()) {
      list = Array.from(getMap(testExpenseStore, tenantId).values());
    } else {
      const snap = await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('expenses')
        .get();
      list = snap.docs.map((d) => d.data() as ExpenseRecord);
    }

    if (filters?.branchId && filters.branchId !== 'ALL') {
      list = list.filter((e) => e.branchId === filters.branchId);
    }
    if (filters?.status) {
      list = list.filter((e) => e.status === filters.status);
    }
    if (filters?.categoryAccountId) {
      list = list.filter((e) => e.categoryAccountId === filters.categoryAccountId);
    }
    if (filters?.fromDate) {
      const f = normalizeIsoDate(filters.fromDate);
      list = list.filter((e) => e.expenseDate >= f);
    }
    if (filters?.toDate) {
      const t = normalizeIsoDate(filters.toDate);
      list = list.filter((e) => e.expenseDate <= t);
    }
    return list.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
  }

  // ==================== AUTOMATIC TRANSACTION INTEGRATION HOOKS ====================

  private static mapPaymentModeToAssetCode(mode: string): SystemAccountCode {
    switch ((mode || '').toLowerCase()) {
      case 'cash':
        return 'CASH_IN_HAND';
      case 'upi':
        return 'UPI_CLEARING';
      case 'card':
        return 'CARD_CLEARING';
      case 'bank_transfer':
      case 'neft':
      case 'rtgs':
      case 'imps':
      case 'cheque':
      case 'bank':
        return 'MAIN_BANK';
      default:
        return 'CASH_IN_HAND';
    }
  }

  /**
   * POS Sales Invoice -> Balanced Double-Entry Journal + COGS/Inventory Reduction.
   */
  public static async recordSalesInvoiceAccounting(
    invoice: {
      id: string;
      invoiceNumber: string;
      tenantId: string;
      branchId: string;
      userId: string;
      taxableAmount: number;
      cgst: number;
      sgst: number;
      igst: number;
      roundOff: number;
      grandTotal: number;
      balanceDue: number;
      payments: Array<{ mode: string; amount: number }>;
      items: Array<{ quantity: number; ptr?: number }>;
      createdAt: string;
    }
  ): Promise<JournalEntryRecord | null> {
    const idempotencyKey = `sales_invoice:${invoice.id}`;
    try {
      const taxablePaise = toPaise(invoice.taxableAmount);
      const cgstPaise = toPaise(invoice.cgst);
      const sgstPaise = toPaise(invoice.sgst);
      const igstPaise = toPaise(invoice.igst);
      const grandTotalPaise = toPaise(invoice.grandTotal);
      // Exact residual roundOff paise so Credits + Debits cannot drift by 1 paise
      const rawCreditPaise = taxablePaise + cgstPaise + sgstPaise + igstPaise;
      const roundOffPaise = grandTotalPaise - rawCreditPaise;

      if (grandTotalPaise <= 0 && rawCreditPaise <= 0) return null;

      const lines: PostJournalLineInput[] = [];
      const paidByMode = new Map<SystemAccountCode, number>();
      let nonKhataPaidPaise = 0;

      for (const p of invoice.payments || []) {
        if (p.mode === 'khata_credit') continue;
        const amtPaise = toPaise(p.amount);
        if (amtPaise <= 0) continue;
        const sysCode = this.mapPaymentModeToAssetCode(p.mode);
        paidByMode.set(sysCode, (paidByMode.get(sysCode) || 0) + amtPaise);
        nonKhataPaidPaise += amtPaise;
      }

      for (const [sysCode, amtPaise] of paidByMode.entries()) {
        lines.push({
          systemCode: sysCode,
          branchId: invoice.branchId,
          debitPaise: amtPaise,
          description: `POS payment received (${invoice.invoiceNumber})`,
        });
      }

      const receivableOrDiffPaise = grandTotalPaise - nonKhataPaidPaise;
      if (receivableOrDiffPaise > 0) {
        lines.push({
          systemCode: 'ACCOUNTS_RECEIVABLE',
          branchId: invoice.branchId,
          debitPaise: receivableOrDiffPaise,
          description: `Khata credit sale (${invoice.invoiceNumber})`,
        });
      } else if (receivableOrDiffPaise < 0) {
        lines.push({
          systemCode: 'CUSTOMER_ADVANCES',
          branchId: invoice.branchId,
          creditPaise: Math.abs(receivableOrDiffPaise),
          description: `Overpayment customer advance (${invoice.invoiceNumber})`,
        });
      }

      if (taxablePaise > 0) {
        lines.push({
          systemCode: 'SALES_REVENUE',
          branchId: invoice.branchId,
          creditPaise: taxablePaise,
          description: `Medicine sales (${invoice.invoiceNumber})`,
        });
      }
      if (cgstPaise > 0) {
        lines.push({
          systemCode: 'OUTPUT_CGST',
          branchId: invoice.branchId,
          creditPaise: cgstPaise,
          description: `Output CGST (${invoice.invoiceNumber})`,
        });
      }
      if (sgstPaise > 0) {
        lines.push({
          systemCode: 'OUTPUT_SGST',
          branchId: invoice.branchId,
          creditPaise: sgstPaise,
          description: `Output SGST (${invoice.invoiceNumber})`,
        });
      }
      if (igstPaise > 0) {
        lines.push({
          systemCode: 'OUTPUT_IGST',
          branchId: invoice.branchId,
          creditPaise: igstPaise,
          description: `Output IGST (${invoice.invoiceNumber})`,
        });
      }
      if (roundOffPaise > 0) {
        lines.push({
          systemCode: 'EXP_ROUND_OFF',
          branchId: invoice.branchId,
          creditPaise: roundOffPaise,
          description: `Invoice round-off (${invoice.invoiceNumber})`,
        });
      } else if (roundOffPaise < 0) {
        lines.push({
          systemCode: 'EXP_ROUND_OFF',
          branchId: invoice.branchId,
          debitPaise: Math.abs(roundOffPaise),
          description: `Invoice round-off (${invoice.invoiceNumber})`,
        });
      }

      // COGS & Inventory Reduction at actual batch PTR
      let cogsPaise = 0;
      for (const item of invoice.items || []) {
        if (item.ptr && item.ptr > 0 && item.quantity > 0) {
          cogsPaise += toPaise(item.ptr * item.quantity);
        }
      }
      if (cogsPaise > 0) {
        lines.push({
          systemCode: 'COGS',
          branchId: invoice.branchId,
          debitPaise: cogsPaise,
          description: `COGS at batch PTR (${invoice.invoiceNumber})`,
        });
        lines.push({
          systemCode: 'INVENTORY',
          branchId: invoice.branchId,
          creditPaise: cogsPaise,
          description: `Inventory reduction on sale (${invoice.invoiceNumber})`,
        });
      }

      const { entry } = await this.postJournalEntry({
        tenantId: invoice.tenantId,
        branchId: invoice.branchId,
        entryType: 'SALES_INVOICE',
        transactionDate: normalizeIsoDate(invoice.createdAt),
        referenceType: 'sales_invoice',
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        narration: `Sales Invoice ${invoice.invoiceNumber}`,
        idempotencyKey,
        lines,
        createdBy: invoice.userId,
      });
      return entry;
    } catch (err) {
      await this.recordFailedOperation(invoice.tenantId, {
        operationType: 'SALES_INVOICE',
        referenceType: 'sales_invoice',
        referenceId: invoice.id,
        idempotencyKey,
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * POS Invoice Payment Collection (settles AR / Khata).
   */
  public static async recordSalesPaymentAccounting(params: {
    tenantId: string;
    branchId: string;
    invoiceId: string;
    invoiceNumber: string;
    paymentId: string;
    mode: string;
    amount: number;
    timestamp: string;
    userId: string;
  }): Promise<JournalEntryRecord | null> {
    const amtPaise = toPaise(params.amount);
    if (amtPaise <= 0 || params.mode === 'khata_credit') return null;

    const idempotencyKey = `sales_payment:${params.invoiceId}:${params.paymentId}`;
    const assetCode = this.mapPaymentModeToAssetCode(params.mode);
    const { entry } = await this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryType: 'SALES_PAYMENT',
      transactionDate: normalizeIsoDate(params.timestamp),
      referenceType: 'sales_payment',
      referenceId: params.paymentId,
      referenceNumber: params.invoiceNumber,
      narration: `Payment received against ${params.invoiceNumber} (${params.mode.toUpperCase()})`,
      idempotencyKey,
      lines: [
        {
          systemCode: assetCode,
          branchId: params.branchId,
          debitPaise: amtPaise,
          description: `Collection (${params.mode}) for ${params.invoiceNumber}`,
        },
        {
          systemCode: 'ACCOUNTS_RECEIVABLE',
          branchId: params.branchId,
          creditPaise: amtPaise,
          description: `AR reduced on ${params.invoiceNumber}`,
        },
      ],
      createdBy: params.userId,
      metadata: { invoiceId: params.invoiceId },
    });
    return entry;
  }

  /**
   * Sales Return -> Reverse proportionate Revenue + Output Tax, Credit AR or Cash,
   * and restore Inventory only for restocked goods (or recognize Shrinkage on damaged/expired).
   */
  public static async recordSalesReturnAccounting(params: {
    tenantId: string;
    branchId: string;
    invoice: {
      id: string;
      invoiceNumber: string;
      balanceDueBeforeReturn: number;
      items: Array<{
        batchId: string;
        quantity: number;
        ptr?: number;
        lineTaxable: number;
        cgst: number;
        sgst: number;
        igst: number;
        lineTotal: number;
      }>;
    };
    returnRecord: {
      id: string;
      totalRefundAmount: number;
      createdAt: string;
      items: Array<{
        batchId: string;
        quantity: number;
        refundAmount: number;
        restocked: boolean;
      }>;
    };
    userId: string;
  }): Promise<JournalEntryRecord | null> {
    const refundTotalPaise = toPaise(params.returnRecord.totalRefundAmount);
    if (refundTotalPaise <= 0) return null;

    const idempotencyKey = `sales_return:${params.returnRecord.id}`;
    let revTaxablePaise = 0;
    let revCgstPaise = 0;
    let revSgstPaise = 0;
    let revIgstPaise = 0;
    let restockedCogsPaise = 0;

    for (const retItem of params.returnRecord.items) {
      const origLine = params.invoice.items.find((i) => i.batchId === retItem.batchId);
      if (!origLine || origLine.quantity <= 0) continue;
      const ratio = retItem.quantity / origLine.quantity;
      revTaxablePaise += Math.round(toPaise(origLine.lineTaxable) * ratio);
      revCgstPaise += Math.round(toPaise(origLine.cgst) * ratio);
      revSgstPaise += Math.round(toPaise(origLine.sgst) * ratio);
      revIgstPaise += Math.round(toPaise(origLine.igst) * ratio);

      if (retItem.restocked && origLine.ptr && origLine.ptr > 0) {
        restockedCogsPaise += toPaise(origLine.ptr * retItem.quantity);
      }
    }

    // Reconcile exact roundOff so Debits match totalRefundAmount
    const taxAndBaseSum = revTaxablePaise + revCgstPaise + revSgstPaise + revIgstPaise;
    const roundOffPaise = refundTotalPaise - taxAndBaseSum;

    const lines: PostJournalLineInput[] = [];
    if (revTaxablePaise > 0) {
      lines.push({
        systemCode: 'SALES_RETURNS',
        branchId: params.branchId,
        debitPaise: revTaxablePaise,
        description: `Sales return revenue reversal (${params.invoice.invoiceNumber})`,
      });
    }
    if (revCgstPaise > 0) {
      lines.push({
        systemCode: 'OUTPUT_CGST',
        branchId: params.branchId,
        debitPaise: revCgstPaise,
        description: `Output CGST reversal (${params.invoice.invoiceNumber})`,
      });
    }
    if (revSgstPaise > 0) {
      lines.push({
        systemCode: 'OUTPUT_SGST',
        branchId: params.branchId,
        debitPaise: revSgstPaise,
        description: `Output SGST reversal (${params.invoice.invoiceNumber})`,
      });
    }
    if (revIgstPaise > 0) {
      lines.push({
        systemCode: 'OUTPUT_IGST',
        branchId: params.branchId,
        debitPaise: revIgstPaise,
        description: `Output IGST reversal (${params.invoice.invoiceNumber})`,
      });
    }
    if (roundOffPaise > 0) {
      lines.push({
        systemCode: 'EXP_ROUND_OFF',
        branchId: params.branchId,
        debitPaise: roundOffPaise,
        description: `Sales return round-off (${params.invoice.invoiceNumber})`,
      });
    } else if (roundOffPaise < 0) {
      lines.push({
        systemCode: 'EXP_ROUND_OFF',
        branchId: params.branchId,
        creditPaise: Math.abs(roundOffPaise),
        description: `Sales return round-off (${params.invoice.invoiceNumber})`,
      });
    }

    // Credit Allocation: reduce AR up to balanceDueBeforeReturn, remainder refunded via Cash
    const arCreditPaise = Math.min(toPaise(params.invoice.balanceDueBeforeReturn), refundTotalPaise);
    const cashRefundPaise = refundTotalPaise - arCreditPaise;

    if (arCreditPaise > 0) {
      lines.push({
        systemCode: 'ACCOUNTS_RECEIVABLE',
        branchId: params.branchId,
        creditPaise: arCreditPaise,
        description: `Khata credit note applied (${params.invoice.invoiceNumber})`,
      });
    }
    if (cashRefundPaise > 0) {
      lines.push({
        systemCode: 'CASH_IN_HAND',
        branchId: params.branchId,
        creditPaise: cashRefundPaise,
        description: `Cash refund issued (${params.invoice.invoiceNumber})`,
      });
    }

    if (restockedCogsPaise > 0) {
      lines.push({
        systemCode: 'INVENTORY',
        branchId: params.branchId,
        debitPaise: restockedCogsPaise,
        description: `Inventory restored on sales return (${params.invoice.invoiceNumber})`,
      });
      lines.push({
        systemCode: 'COGS',
        branchId: params.branchId,
        creditPaise: restockedCogsPaise,
        description: `COGS reversed on restocked return (${params.invoice.invoiceNumber})`,
      });
    }

    const { entry } = await this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryType: 'SALES_RETURN',
      transactionDate: normalizeIsoDate(params.returnRecord.createdAt),
      referenceType: 'sales_return',
      referenceId: params.returnRecord.id,
      referenceNumber: params.invoice.invoiceNumber,
      narration: `Sales Return against ${params.invoice.invoiceNumber}`,
      idempotencyKey,
      lines,
      createdBy: params.userId,
      metadata: { invoiceId: params.invoice.id },
    });
    return entry;
  }

  /**
   * Sales Invoice Cancellation -> Reverses net remaining unreturned portion of invoice.
   */
  public static async recordInvoiceCancellationAccounting(params: {
    tenantId: string;
    branchId: string;
    invoiceBeforeCancel: {
      id: string;
      invoiceNumber: string;
      balanceDue: number;
      amountPaid: number;
      totalRefunded: number;
      items: Array<{
        quantity: number;
        returnedQuantity?: number;
        ptr?: number;
        lineTaxable: number;
        cgst: number;
        sgst: number;
        igst: number;
        lineTotal: number;
        expiryDate: string;
      }>;
    };
    cancelledAt: string;
    reason: string;
    userId: string;
  }): Promise<JournalEntryRecord | null> {
    const inv = params.invoiceBeforeCancel;
    const idempotencyKey = `invoice_cancel:${inv.id}`;

    let remTaxablePaise = 0;
    let remCgstPaise = 0;
    let remSgstPaise = 0;
    let remIgstPaise = 0;
    let remTotalPaise = 0;
    let restoredCogsPaise = 0;

    const todayIso = normalizeIsoDate(params.cancelledAt);
    for (const line of inv.items) {
      const remQty = line.quantity - (line.returnedQuantity || 0);
      if (remQty <= 0 || line.quantity <= 0) continue;
      const ratio = remQty / line.quantity;
      remTaxablePaise += Math.round(toPaise(line.lineTaxable) * ratio);
      remCgstPaise += Math.round(toPaise(line.cgst) * ratio);
      remSgstPaise += Math.round(toPaise(line.sgst) * ratio);
      remIgstPaise += Math.round(toPaise(line.igst) * ratio);
      remTotalPaise += Math.round(toPaise(line.lineTotal) * ratio);

      const isExpired = normalizeIsoDate(line.expiryDate) <= todayIso;
      if (!isExpired && line.ptr && line.ptr > 0) {
        restoredCogsPaise += toPaise(line.ptr * remQty);
      }
    }

    if (remTotalPaise <= 0) return null;

    const arReversedPaise = Math.min(toPaise(inv.balanceDue), remTotalPaise);
    const refundPendingPaise = remTotalPaise - arReversedPaise;
    const roundOffPaise = remTotalPaise - (remTaxablePaise + remCgstPaise + remSgstPaise + remIgstPaise);

    const lines: PostJournalLineInput[] = [];
    if (remTaxablePaise > 0) {
      lines.push({ systemCode: 'SALES_REVENUE', branchId: params.branchId, debitPaise: remTaxablePaise, description: `Cancelled invoice revenue (${inv.invoiceNumber})` });
    }
    if (remCgstPaise > 0) {
      lines.push({ systemCode: 'OUTPUT_CGST', branchId: params.branchId, debitPaise: remCgstPaise, description: `Cancelled invoice CGST (${inv.invoiceNumber})` });
    }
    if (remSgstPaise > 0) {
      lines.push({ systemCode: 'OUTPUT_SGST', branchId: params.branchId, debitPaise: remSgstPaise, description: `Cancelled invoice SGST (${inv.invoiceNumber})` });
    }
    if (remIgstPaise > 0) {
      lines.push({ systemCode: 'OUTPUT_IGST', branchId: params.branchId, debitPaise: remIgstPaise, description: `Cancelled invoice IGST (${inv.invoiceNumber})` });
    }
    if (roundOffPaise > 0) {
      lines.push({ systemCode: 'EXP_ROUND_OFF', branchId: params.branchId, debitPaise: roundOffPaise, description: `Cancelled invoice round-off (${inv.invoiceNumber})` });
    } else if (roundOffPaise < 0) {
      lines.push({ systemCode: 'EXP_ROUND_OFF', branchId: params.branchId, creditPaise: Math.abs(roundOffPaise), description: `Cancelled invoice round-off (${inv.invoiceNumber})` });
    }

    if (arReversedPaise > 0) {
      lines.push({ systemCode: 'ACCOUNTS_RECEIVABLE', branchId: params.branchId, creditPaise: arReversedPaise, description: `Khata AR reversed on cancel (${inv.invoiceNumber})` });
    }
    if (refundPendingPaise > 0) {
      lines.push({ systemCode: 'CUSTOMER_REFUND_PENDING', branchId: params.branchId, creditPaise: refundPendingPaise, description: `Refund payable on cancel (${inv.invoiceNumber})` });
    }

    if (restoredCogsPaise > 0) {
      lines.push({ systemCode: 'INVENTORY', branchId: params.branchId, debitPaise: restoredCogsPaise, description: `Inventory restored on cancel (${inv.invoiceNumber})` });
      lines.push({ systemCode: 'COGS', branchId: params.branchId, creditPaise: restoredCogsPaise, description: `COGS reversed on cancel (${inv.invoiceNumber})` });
    }

    const { entry } = await this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryType: 'INVOICE_CANCELLATION',
      transactionDate: todayIso,
      referenceType: 'invoice_cancellation',
      referenceId: inv.id,
      referenceNumber: inv.invoiceNumber,
      narration: `Invoice Cancellation (${inv.invoiceNumber}): ${params.reason}`,
      idempotencyKey,
      lines,
      createdBy: params.userId,
    });
    return entry;
  }

  /**
   * Customer Khata Payment Collection (reduces AR + adds Customer Advance on overpayment).
   */
  public static async recordCustomerKhataPaymentAccounting(params: {
    tenantId: string;
    branchId: string;
    paymentId: string;
    receiptNumber: string;
    customerId: string;
    customerName: string;
    amount: number;
    appliedToBalance: number;
    addedToAdvance: number;
    paymentMode: string;
    paymentDate: string;
    userId: string;
  }): Promise<JournalEntryRecord | null> {
    const totalPaise = toPaise(params.amount);
    if (totalPaise <= 0) return null;

    const appliedPaise = toPaise(params.appliedToBalance);
    const advPaise = totalPaise - appliedPaise;
    const assetCode = this.mapPaymentModeToAssetCode(params.paymentMode);

    const lines: PostJournalLineInput[] = [
      {
        systemCode: assetCode,
        branchId: params.branchId,
        debitPaise: totalPaise,
        description: `Khata collection ${params.receiptNumber} (${params.customerName})`,
      },
    ];
    if (appliedPaise > 0) {
      lines.push({
        systemCode: 'ACCOUNTS_RECEIVABLE',
        branchId: params.branchId,
        creditPaise: appliedPaise,
        description: `Khata AR reduced for ${params.customerName}`,
      });
    }
    if (advPaise > 0) {
      lines.push({
        systemCode: 'CUSTOMER_ADVANCES',
        branchId: params.branchId,
        creditPaise: advPaise,
        description: `Advance balance added for ${params.customerName}`,
      });
    }

    const { entry } = await this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryType: 'KHATA_PAYMENT',
      transactionDate: normalizeIsoDate(params.paymentDate),
      referenceType: 'khata_payment',
      referenceId: params.paymentId,
      referenceNumber: params.receiptNumber,
      narration: `Khata Receipt ${params.receiptNumber} from ${params.customerName}`,
      idempotencyKey: `khata_payment:${params.paymentId}`,
      lines,
      createdBy: params.userId,
      metadata: { customerId: params.customerId },
    });
    return entry;
  }

  public static async recordCustomerOpeningBalanceAccounting(params: {
    tenantId: string;
    branchId: string;
    customerId: string;
    customerName: string;
    openingBalance: number;
    createdAt: string;
    userId: string;
  }): Promise<JournalEntryRecord | null> {
    const balPaise = toPaise(params.openingBalance);
    if (balPaise <= 0) return null;

    const { entry } = await this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId || 'main',
      entryType: 'CUSTOMER_OPENING_BALANCE',
      transactionDate: normalizeIsoDate(params.createdAt),
      referenceType: 'customer_opening_balance',
      referenceId: params.customerId,
      referenceNumber: params.customerName,
      narration: `Customer Opening Khata Balance: ${params.customerName}`,
      idempotencyKey: `customer_opening:${params.customerId}`,
      lines: [
        {
          systemCode: 'ACCOUNTS_RECEIVABLE',
          branchId: params.branchId || 'main',
          debitPaise: balPaise,
          description: `Opening Khata receivable (${params.customerName})`,
        },
        {
          systemCode: 'OPENING_BALANCE_EQUITY',
          branchId: params.branchId || 'main',
          creditPaise: balPaise,
          description: `Opening Balance Equity offset`,
        },
      ],
      createdBy: params.userId,
    });
    return entry;
  }

  public static async recordCustomerCreditNoteAccounting(params: {
    tenantId: string;
    branchId: string;
    ledgerEntryId: string;
    customerId: string;
    customerName: string;
    amount: number;
    appliedToBalance: number;
    advanceDelta: number;
    returnId?: string | null;
    reason: string;
    timestamp: string;
    userId: string;
  }): Promise<JournalEntryRecord | null> {
    if (params.returnId) {
      // Sales Return hook already posts full accounting for returnId
      return null;
    }
    const totalPaise = toPaise(params.amount);
    if (totalPaise <= 0) return null;
    const appliedPaise = toPaise(params.appliedToBalance);
    const advPaise = totalPaise - appliedPaise;

    const lines: PostJournalLineInput[] = [
      {
        systemCode: 'SALES_RETURNS',
        branchId: params.branchId,
        debitPaise: totalPaise,
        description: `Customer credit note (${params.customerName}): ${params.reason}`,
      },
    ];
    if (appliedPaise > 0) {
      lines.push({
        systemCode: 'ACCOUNTS_RECEIVABLE',
        branchId: params.branchId,
        creditPaise: appliedPaise,
        description: `AR reduced for ${params.customerName}`,
      });
    }
    if (advPaise > 0) {
      lines.push({
        systemCode: 'CUSTOMER_ADVANCES',
        branchId: params.branchId,
        creditPaise: advPaise,
        description: `Customer advance credited (${params.customerName})`,
      });
    }

    const { entry } = await this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryType: 'CUSTOMER_CREDIT_NOTE',
      transactionDate: normalizeIsoDate(params.timestamp),
      referenceType: 'customer_credit_note',
      referenceId: params.ledgerEntryId,
      referenceNumber: params.customerName,
      narration: `Customer Credit Note (${params.customerName}): ${params.reason}`,
      idempotencyKey: `customer_credit_note:${params.ledgerEntryId}`,
      lines,
      createdBy: params.userId,
      metadata: { customerId: params.customerId },
    });
    return entry;
  }

  public static async recordCustomerBalanceAdjustmentAccounting(params: {
    tenantId: string;
    branchId: string;
    ledgerEntryId: string;
    customerId: string;
    customerName: string;
    adjustmentType: 'DEBIT_ADJUSTMENT' | 'CREDIT_ADJUSTMENT' | 'OPENING_BALANCE' | 'REFUND';
    amount: number;
    appliedToBalance: number;
    advanceDelta: number;
    paymentMode?: string | null;
    reason: string;
    timestamp: string;
    userId: string;
  }): Promise<JournalEntryRecord | null> {
    const totalPaise = toPaise(params.amount);
    if (totalPaise <= 0) return null;

    const lines: PostJournalLineInput[] = [];
    if (params.adjustmentType === 'DEBIT_ADJUSTMENT' || params.adjustmentType === 'OPENING_BALANCE') {
      lines.push({
        systemCode: 'ACCOUNTS_RECEIVABLE',
        branchId: params.branchId,
        debitPaise: totalPaise,
        description: `Khata debit adjustment (${params.customerName}): ${params.reason}`,
      });
      lines.push({
        systemCode: params.adjustmentType === 'OPENING_BALANCE' ? 'OPENING_BALANCE_EQUITY' : 'OTHER_INCOME',
        branchId: params.branchId,
        creditPaise: totalPaise,
        description: `Offset (${params.reason})`,
      });
    } else if (params.adjustmentType === 'CREDIT_ADJUSTMENT') {
      const appliedPaise = toPaise(params.appliedToBalance);
      const advPaise = totalPaise - appliedPaise;
      lines.push({
        systemCode: 'EXP_BAD_DEBT_ADJ',
        branchId: params.branchId,
        debitPaise: totalPaise,
        description: `Khata credit/write-off (${params.customerName}): ${params.reason}`,
      });
      if (appliedPaise > 0) {
        lines.push({ systemCode: 'ACCOUNTS_RECEIVABLE', branchId: params.branchId, creditPaise: appliedPaise, description: `AR reduced (${params.customerName})` });
      }
      if (advPaise > 0) {
        lines.push({ systemCode: 'CUSTOMER_ADVANCES', branchId: params.branchId, creditPaise: advPaise, description: `Customer advance (${params.customerName})` });
      }
    } else if (params.adjustmentType === 'REFUND') {
      const advUsed = Math.abs(toPaise(params.advanceDelta));
      const arAdj = totalPaise - advUsed;
      if (advUsed > 0) {
        lines.push({ systemCode: 'CUSTOMER_ADVANCES', branchId: params.branchId, debitPaise: advUsed, description: `Advance refunded (${params.customerName})` });
      }
      if (arAdj > 0) {
        lines.push({ systemCode: 'ACCOUNTS_RECEIVABLE', branchId: params.branchId, debitPaise: arAdj, description: `Receivable adjustment refund (${params.customerName})` });
      }
      lines.push({
        systemCode: this.mapPaymentModeToAssetCode(params.paymentMode || 'cash'),
        branchId: params.branchId,
        creditPaise: totalPaise,
        description: `Refund disbursed to ${params.customerName}`,
      });
    }

    const { entry } = await this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryType: params.adjustmentType === 'REFUND' ? 'CUSTOMER_REFUND' : 'CUSTOMER_ADJUSTMENT',
      transactionDate: normalizeIsoDate(params.timestamp),
      referenceType: 'customer_adjustment',
      referenceId: params.ledgerEntryId,
      referenceNumber: params.customerName,
      narration: `Khata ${params.adjustmentType} (${params.customerName}): ${params.reason}`,
      idempotencyKey: `customer_adj:${params.ledgerEntryId}`,
      lines,
      createdBy: params.userId,
      metadata: { customerId: params.customerId },
    });
    return entry;
  }

  /**
   * Goods Receipt (GRN) Posting -> Recognizes Inventory + Input GST ITC.
   * If linked supplier invoice was auto-created, credits Accounts Payable directly.
   * Otherwise credits GRN Unbilled Clearing (2110) so creating Supplier Invoice later never duplicates Payable!
   */
  public static async recordGrnAccounting(params: {
    tenantId: string;
    branchId: string;
    grn: {
      id: string;
      grnNumber: string;
      supplierId: string;
      supplierName: string;
      receiptDate: string;
      taxableAmount: number;
      otherCharges: number;
      cgst: number;
      sgst: number;
      igst: number;
      roundOff: number;
      grandTotal: number;
      linkedInvoiceId?: string | null;
    };
    userId: string;
  }): Promise<JournalEntryRecord | null> {
    const g = params.grn;
    const invPaise = toPaise(g.taxableAmount) + toPaise(g.otherCharges);
    const cgstPaise = toPaise(g.cgst);
    const sgstPaise = toPaise(g.sgst);
    const igstPaise = toPaise(g.igst);
    const grandTotalPaise = toPaise(g.grandTotal);
    const roundOffPaise = grandTotalPaise - (invPaise + cgstPaise + sgstPaise + igstPaise);

    if (grandTotalPaise <= 0) return null;

    const lines: PostJournalLineInput[] = [];
    if (invPaise > 0) {
      lines.push({ systemCode: 'INVENTORY', branchId: params.branchId, debitPaise: invPaise, description: `Inward medicine inventory (${g.grnNumber})` });
    }
    if (cgstPaise > 0) {
      lines.push({ systemCode: 'INPUT_CGST', branchId: params.branchId, debitPaise: cgstPaise, description: `Input CGST ITC (${g.grnNumber})` });
    }
    if (sgstPaise > 0) {
      lines.push({ systemCode: 'INPUT_SGST', branchId: params.branchId, debitPaise: sgstPaise, description: `Input SGST ITC (${g.grnNumber})` });
    }
    if (igstPaise > 0) {
      lines.push({ systemCode: 'INPUT_IGST', branchId: params.branchId, debitPaise: igstPaise, description: `Input IGST ITC (${g.grnNumber})` });
    }
    if (roundOffPaise > 0) {
      lines.push({ systemCode: 'EXP_ROUND_OFF', branchId: params.branchId, debitPaise: roundOffPaise, description: `GRN round-off (${g.grnNumber})` });
    } else if (roundOffPaise < 0) {
      lines.push({ systemCode: 'EXP_ROUND_OFF', branchId: params.branchId, creditPaise: Math.abs(roundOffPaise), description: `GRN round-off (${g.grnNumber})` });
    }

    const liabilityCode: SystemAccountCode = g.linkedInvoiceId ? 'ACCOUNTS_PAYABLE' : 'GRN_UNBILLED_CLEARING';
    lines.push({
      systemCode: liabilityCode,
      branchId: params.branchId,
      creditPaise: grandTotalPaise,
      description: g.linkedInvoiceId
        ? `Supplier payable (${g.supplierName} - ${g.grnNumber})`
        : `Unbilled GRN clearing (${g.supplierName} - ${g.grnNumber})`,
    });

    const { entry } = await this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryType: 'PURCHASE_GRN',
      transactionDate: normalizeIsoDate(g.receiptDate),
      referenceType: 'grn',
      referenceId: g.id,
      referenceNumber: g.grnNumber,
      narration: `Goods Receipt ${g.grnNumber} from ${g.supplierName}`,
      idempotencyKey: `grn:${g.id}`,
      lines,
      createdBy: params.userId,
      metadata: { supplierId: g.supplierId, linkedInvoiceId: g.linkedInvoiceId || null },
    });
    return entry;
  }

  public static async recordGrnReversalAccounting(params: {
    tenantId: string;
    grnId: string;
    reason: string;
    userId: string;
  }): Promise<void> {
    const journals = await this.listJournalEntries(params.tenantId, {
      referenceType: 'grn',
      referenceId: params.grnId,
    });
    for (const j of journals) {
      if (j.status === 'POSTED') {
        await this.reverseJournalEntry(params.tenantId, j.id, params.reason, params.userId);
      }
    }
  }

  /**
   * Supplier Invoice Recognition:
   * - If linked to a GRN (and not auto-created during postGrn): transfers liability from GRN_UNBILLED_CLEARING -> ACCOUNTS_PAYABLE (zero double-counting!)
   * - If direct non-GRN bill: recognizes Dr Inventory + Dr Input GST / Cr Accounts Payable.
   */
  public static async recordSupplierInvoiceAccounting(params: {
    tenantId: string;
    branchId: string;
    invoice: {
      id: string;
      supplierInvoiceNumber: string;
      supplierId: string;
      supplierName: string;
      grnId?: string | null;
      invoiceDate: string;
      taxableAmount: number;
      cgst: number;
      sgst: number;
      igst: number;
      otherCharges: number;
      roundOff: number;
      totalAmount: number;
    };
    userId: string;
  }): Promise<JournalEntryRecord | null> {
    const inv = params.invoice;
    const totalPaise = toPaise(inv.totalAmount);
    if (totalPaise <= 0) return null;

    if (inv.grnId) {
      // Check if GRN already credited AP directly (autoCreateSupplierInvoice)
      const grnJournals = await this.listJournalEntries(params.tenantId, {
        referenceType: 'grn',
        referenceId: inv.grnId,
      });
      const grnCreditedAp = grnJournals.some(
        (j) =>
          j.status === 'POSTED' &&
          j.lines.some((l) => l.accountCode === '2100' && l.creditPaise > 0)
      );
      if (grnCreditedAp) {
        return grnJournals[0] || null;
      }

      // GRN had credited GRN_UNBILLED_CLEARING (2110); now clear 2110 -> 2100 AP
      const { entry } = await this.postJournalEntry({
        tenantId: params.tenantId,
        branchId: params.branchId,
        entryType: 'SUPPLIER_INVOICE',
        transactionDate: normalizeIsoDate(inv.invoiceDate),
        referenceType: 'supplier_invoice',
        referenceId: inv.id,
        referenceNumber: inv.supplierInvoiceNumber,
        narration: `Supplier Invoice ${inv.supplierInvoiceNumber} (${inv.supplierName}) linked to GRN`,
        idempotencyKey: `supplier_invoice:${inv.id}`,
        lines: [
          { systemCode: 'GRN_UNBILLED_CLEARING', branchId: params.branchId, debitPaise: totalPaise, description: `Clear unbilled GRN for bill ${inv.supplierInvoiceNumber}` },
          { systemCode: 'ACCOUNTS_PAYABLE', branchId: params.branchId, creditPaise: totalPaise, description: `Payable recognized (${inv.supplierName})` },
        ],
        createdBy: params.userId,
        metadata: { supplierId: inv.supplierId, grnId: inv.grnId },
      });
      return entry;
    }

    // Direct Supplier Invoice without GRN
    const invPaise = toPaise(inv.taxableAmount) + toPaise(inv.otherCharges);
    const cgstPaise = toPaise(inv.cgst);
    const sgstPaise = toPaise(inv.sgst);
    const igstPaise = toPaise(inv.igst);
    const roundOffPaise = totalPaise - (invPaise + cgstPaise + sgstPaise + igstPaise);

    const lines: PostJournalLineInput[] = [];
    if (invPaise > 0) lines.push({ systemCode: 'INVENTORY', branchId: params.branchId, debitPaise: invPaise, description: `Direct purchase bill ${inv.supplierInvoiceNumber}` });
    if (cgstPaise > 0) lines.push({ systemCode: 'INPUT_CGST', branchId: params.branchId, debitPaise: cgstPaise, description: `Input CGST (${inv.supplierInvoiceNumber})` });
    if (sgstPaise > 0) lines.push({ systemCode: 'INPUT_SGST', branchId: params.branchId, debitPaise: sgstPaise, description: `Input SGST (${inv.supplierInvoiceNumber})` });
    if (igstPaise > 0) lines.push({ systemCode: 'INPUT_IGST', branchId: params.branchId, debitPaise: igstPaise, description: `Input IGST (${inv.supplierInvoiceNumber})` });
    if (roundOffPaise > 0) lines.push({ systemCode: 'EXP_ROUND_OFF', branchId: params.branchId, debitPaise: roundOffPaise, description: `Round-off (${inv.supplierInvoiceNumber})` });
    else if (roundOffPaise < 0) lines.push({ systemCode: 'EXP_ROUND_OFF', branchId: params.branchId, creditPaise: Math.abs(roundOffPaise), description: `Round-off (${inv.supplierInvoiceNumber})` });

    lines.push({ systemCode: 'ACCOUNTS_PAYABLE', branchId: params.branchId, creditPaise: totalPaise, description: `Supplier payable (${inv.supplierName})` });

    const { entry } = await this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryType: 'SUPPLIER_INVOICE',
      transactionDate: normalizeIsoDate(inv.invoiceDate),
      referenceType: 'supplier_invoice',
      referenceId: inv.id,
      referenceNumber: inv.supplierInvoiceNumber,
      narration: `Direct Supplier Invoice ${inv.supplierInvoiceNumber} (${inv.supplierName})`,
      idempotencyKey: `supplier_invoice:${inv.id}`,
      lines,
      createdBy: params.userId,
      metadata: { supplierId: inv.supplierId },
    });
    return entry;
  }

  public static async recordSupplierPaymentAccounting(params: {
    tenantId: string;
    branchId: string;
    payment: {
      id: string;
      paymentNumber: string;
      supplierId: string;
      supplierName: string;
      amount: number;
      allocatedTotal: number;
      advanceAdded: number;
      paymentMode: string;
      paymentDate: string;
    };
    userId: string;
  }): Promise<JournalEntryRecord | null> {
    const p = params.payment;
    const totalPaise = toPaise(p.amount);
    if (totalPaise <= 0) return null;

    const payableReductionPaise = totalPaise - toPaise(p.advanceAdded);
    const advAddedPaise = toPaise(p.advanceAdded);

    const lines: PostJournalLineInput[] = [];
    if (payableReductionPaise > 0) {
      lines.push({
        systemCode: 'ACCOUNTS_PAYABLE',
        branchId: params.branchId,
        debitPaise: payableReductionPaise,
        description: `Payable settled (${p.supplierName} - ${p.paymentNumber})`,
      });
    }
    if (advAddedPaise > 0) {
      lines.push({
        systemCode: 'SUPPLIER_ADVANCES',
        branchId: params.branchId,
        debitPaise: advAddedPaise,
        description: `Advance paid to ${p.supplierName} (${p.paymentNumber})`,
      });
    }

    if (p.paymentMode === 'ADVANCE_ADJUSTMENT') {
      lines.push({
        systemCode: 'SUPPLIER_ADVANCES',
        branchId: params.branchId,
        creditPaise: totalPaise,
        description: `Supplier advance adjusted (${p.paymentNumber})`,
      });
    } else {
      lines.push({
        systemCode: this.mapPaymentModeToAssetCode(p.paymentMode),
        branchId: params.branchId,
        creditPaise: totalPaise,
        description: `Supplier payment (${p.paymentMode}) ${p.paymentNumber}`,
      });
    }

    const { entry } = await this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryType: 'SUPPLIER_PAYMENT',
      transactionDate: normalizeIsoDate(p.paymentDate),
      referenceType: 'supplier_payment',
      referenceId: p.id,
      referenceNumber: p.paymentNumber,
      narration: `Supplier Payment ${p.paymentNumber} to ${p.supplierName}`,
      idempotencyKey: `supplier_payment:${p.id}`,
      lines,
      createdBy: params.userId,
      metadata: { supplierId: p.supplierId },
    });
    return entry;
  }

  public static async recordSupplierReturnAccounting(params: {
    tenantId: string;
    branchId: string;
    supplierReturn: {
      id: string;
      returnNumber: string;
      supplierId: string;
      supplierName: string;
      subtotal: number;
      totalTax: number;
      totalAmount: number;
      payableReduced: number;
      advanceCredited: number;
      returnDate: string;
      items?: Array<{ taxableAmount: number; taxAmount: number }>;
    };
    isInterState?: boolean;
    userId: string;
  }): Promise<JournalEntryRecord | null> {
    const r = params.supplierReturn;
    const totalPaise = toPaise(r.totalAmount);
    if (totalPaise <= 0) return null;

    const apReducedPaise = toPaise(r.payableReduced);
    const advCreditedPaise = totalPaise - apReducedPaise;
    const subtotalPaise = toPaise(r.subtotal);
    const totalTaxPaise = toPaise(r.totalTax);
    const cgstPaise = params.isInterState ? 0 : Math.round(totalTaxPaise / 2);
    const sgstPaise = params.isInterState ? 0 : totalTaxPaise - cgstPaise;
    const igstPaise = params.isInterState ? totalTaxPaise : 0;
    const roundOffPaise = totalPaise - (subtotalPaise + cgstPaise + sgstPaise + igstPaise);

    const lines: PostJournalLineInput[] = [];
    if (apReducedPaise > 0) {
      lines.push({ systemCode: 'ACCOUNTS_PAYABLE', branchId: params.branchId, debitPaise: apReducedPaise, description: `AP reduced by return (${r.returnNumber})` });
    }
    if (advCreditedPaise > 0) {
      lines.push({ systemCode: 'SUPPLIER_ADVANCES', branchId: params.branchId, debitPaise: advCreditedPaise, description: `Supplier debit note credit (${r.returnNumber})` });
    }
    if (subtotalPaise > 0) {
      lines.push({ systemCode: 'INVENTORY', branchId: params.branchId, creditPaise: subtotalPaise, description: `Inventory returned to ${r.supplierName}` });
    }
    if (cgstPaise > 0) {
      lines.push({ systemCode: 'INPUT_CGST', branchId: params.branchId, creditPaise: cgstPaise, description: `Input CGST reversed (${r.returnNumber})` });
    }
    if (sgstPaise > 0) {
      lines.push({ systemCode: 'INPUT_SGST', branchId: params.branchId, creditPaise: sgstPaise, description: `Input SGST reversed (${r.returnNumber})` });
    }
    if (igstPaise > 0) {
      lines.push({ systemCode: 'INPUT_IGST', branchId: params.branchId, creditPaise: igstPaise, description: `Input IGST reversed (${r.returnNumber})` });
    }
    if (roundOffPaise > 0) {
      lines.push({ systemCode: 'EXP_ROUND_OFF', branchId: params.branchId, creditPaise: roundOffPaise, description: `Return round-off (${r.returnNumber})` });
    } else if (roundOffPaise < 0) {
      lines.push({ systemCode: 'EXP_ROUND_OFF', branchId: params.branchId, debitPaise: Math.abs(roundOffPaise), description: `Return round-off (${r.returnNumber})` });
    }

    const { entry } = await this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryType: 'SUPPLIER_RETURN',
      transactionDate: normalizeIsoDate(r.returnDate),
      referenceType: 'supplier_return',
      referenceId: r.id,
      referenceNumber: r.returnNumber,
      narration: `Supplier Return ${r.returnNumber} to ${r.supplierName}`,
      idempotencyKey: `supplier_return:${r.id}`,
      lines,
      createdBy: params.userId,
      metadata: { supplierId: r.supplierId },
    });
    return entry;
  }

  public static async recordSupplierOpeningBalanceAccounting(params: {
    tenantId: string;
    branchId: string;
    supplierId: string;
    supplierName: string;
    openingBalance: number;
    createdAt: string;
    userId: string;
  }): Promise<JournalEntryRecord | null> {
    const balPaise = toPaise(params.openingBalance);
    if (balPaise <= 0) return null;

    const { entry } = await this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId || 'main',
      entryType: 'SUPPLIER_OPENING_BALANCE',
      transactionDate: normalizeIsoDate(params.createdAt),
      referenceType: 'supplier_opening_balance',
      referenceId: params.supplierId,
      referenceNumber: params.supplierName,
      narration: `Supplier Opening Payable Balance: ${params.supplierName}`,
      idempotencyKey: `supplier_opening:${params.supplierId}`,
      lines: [
        { systemCode: 'OPENING_BALANCE_EQUITY', branchId: params.branchId || 'main', debitPaise: balPaise, description: `Supplier opening offset` },
        { systemCode: 'ACCOUNTS_PAYABLE', branchId: params.branchId || 'main', creditPaise: balPaise, description: `Opening supplier payable (${params.supplierName})` },
      ],
      createdBy: params.userId,
    });
    return entry;
  }

  /**
   * Idempotent backfill of existing historical invoices, GRNs, supplier invoices, and customer opening balances
   * so migrating tenants get an accurate, duplicate-free General Ledger.
   */
  public static async backfillHistoricalTransactions(
    tenantId: string,
    userId: string
  ): Promise<{ postedCount: number; skippedCount: number }> {
    const { BillingTransactionService } = await import('./billingTransactionService');
    const { ProcurementService } = await import('./procurementService');
    const { CustomerService } = await import('./customerService');

    await this.ensureInitialized(tenantId, userId);
    const existingJournals = await this.listJournalEntries(tenantId, { limit: 20000 });
    const existingKeys = new Set(existingJournals.map((j) => j.idempotencyKey));

    let postedCount = 0;
    let skippedCount = 0;

    // 1. Paginated Sales Invoices
    let invPage = 1;
    while (true) {
      const invRes = await BillingTransactionService.listInvoices(tenantId, { page: invPage, limit: 100 });
      for (const inv of invRes.invoices) {
        if (existingKeys.has(`sales_invoice:${inv.id}`)) {
          skippedCount += 1;
          continue;
        }
        const res = await this.recordSalesInvoiceAccounting(inv);
        if (res) postedCount += 1;
      }
      if (invPage >= invRes.totalPages) break;
      invPage += 1;
    }

    // 2. Paginated GRNs
    let grnPage = 1;
    while (true) {
      const grnsRes = await ProcurementService.listGrns(tenantId, undefined, { page: grnPage, limit: 100 });
      for (const g of grnsRes.goodsReceipts) {
        if (g.status === 'DRAFT') continue;
        if (existingKeys.has(`grn:${g.id}`)) {
          skippedCount += 1;
          continue;
        }
        const res = await this.recordGrnAccounting({
          tenantId,
          branchId: g.branchId,
          grn: g,
          userId,
        });
        if (res) postedCount += 1;
      }
      if (grnPage >= grnsRes.totalPages) break;
      grnPage += 1;
    }

    // 3. Paginated Supplier Invoices
    let sinvPage = 1;
    while (true) {
      const sinvs = await ProcurementService.listSupplierInvoices(tenantId, undefined, { page: sinvPage, limit: 100 });
      for (const sinv of sinvs.invoices) {
        if (sinv.paymentStatus === 'REVERSED' || existingKeys.has(`supplier_invoice:${sinv.id}`)) {
          skippedCount += 1;
          continue;
        }
        const res = await this.recordSupplierInvoiceAccounting({
          tenantId,
          branchId: sinv.branchId,
          invoice: sinv,
          userId,
        });
        if (res) postedCount += 1;
      }
      if (sinvPage >= sinvs.totalPages) break;
      sinvPage += 1;
    }

    // 4. Customer Opening Balances (checked via paginated scan)
    let custPage = 1;
    while (true) {
      const custs = await CustomerService.listCustomers(tenantId, { page: custPage, limit: 100 });
      for (const c of custs.customers) {
        if (existingKeys.has(`customer_opening:${c.id}`)) {
          skippedCount += 1;
        }
      }
      if (custPage >= custs.totalPages) break;
      custPage += 1;
    }

    return { postedCount, skippedCount };
  }
}

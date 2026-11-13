/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AccountLedgerData,
  AccountingOverview,
  BalanceSheetData,
  BankAccount,
  BankReconciliation,
  BranchPnlData,
  CashAccount,
  CashFlowData,
  CashOrBankBookData,
  ChartOfAccount,
  ExpenseRecord,
  ExpenseSummaryData,
  FinancialPeriod,
  GstSummaryData,
  JournalEntry,
  JournalLine,
  ProfitLossData,
  ReconciliationCheckData,
  TrialBalanceData,
} from '../../lib/accountingApi.ts';
import {
  BillInvoice,
  Customer,
  CustomerPayment,
  GoodsReceiptNote,
  InventoryBatch,
  Supplier,
  SupplierInvoice,
  SupplierPayment,
} from '../../types/pharmacy.ts';

const toPaise = (v: number) => Math.round((Number(v) || 0) * 100);
const fromPaise = (p: number) => Math.round(p) / 100;

export const DEFAULT_PREVIEW_COA: ChartOfAccount[] = [
  { id: 'coa_1100', tenantId: 'store-01', code: '1100', name: 'Cash in Hand (POS Register)', category: 'ASSETS', subType: 'CASH', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'CASH_IN_HAND', isActive: true, description: 'Main counter cash drawer', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_1110', tenantId: 'store-01', code: '1110', name: 'Petty Cash Drawer', category: 'ASSETS', subType: 'CASH', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'PETTY_CASH', isActive: true, description: 'Store petty cash box', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_1200', tenantId: 'store-01', code: '1200', name: 'Main Bank Account', category: 'ASSETS', subType: 'BANK', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'MAIN_BANK', isActive: true, description: 'Primary current bank account', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_1210', tenantId: 'store-01', code: '1210', name: 'UPI Settlement / Clearing', category: 'ASSETS', subType: 'CLEARING', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'UPI_CLEARING', isActive: true, description: 'UPI collections clearing ledger', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_1220', tenantId: 'store-01', code: '1220', name: 'Card POS Settlement / Clearing', category: 'ASSETS', subType: 'CLEARING', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'CARD_CLEARING', isActive: true, description: 'Debit/credit card terminal clearing', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_1300', tenantId: 'store-01', code: '1300', name: 'Accounts Receivable (Customer Khata)', category: 'ASSETS', subType: 'RECEIVABLE', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'ACCOUNTS_RECEIVABLE', isActive: true, description: 'Customer Khata receivable control account', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_1350', tenantId: 'store-01', code: '1350', name: 'Supplier Advances', category: 'ASSETS', subType: 'ADVANCE', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'SUPPLIER_ADVANCES', isActive: true, description: 'Unallocated advances paid to suppliers', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_1400', tenantId: 'store-01', code: '1400', name: 'Medicine & Surgical Inventory (PTR)', category: 'ASSETS', subType: 'INVENTORY', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'INVENTORY', isActive: true, description: 'Stock asset valued at batch PTR', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_1510', tenantId: 'store-01', code: '1510', name: 'Input GST — CGST Receivable (ITC)', category: 'ASSETS', subType: 'TAX_ASSET', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'INPUT_CGST', isActive: true, description: 'Eligible CGST input tax credit', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_1520', tenantId: 'store-01', code: '1520', name: 'Input GST — SGST Receivable (ITC)', category: 'ASSETS', subType: 'TAX_ASSET', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'INPUT_SGST', isActive: true, description: 'Eligible SGST input tax credit', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_1530', tenantId: 'store-01', code: '1530', name: 'Input GST — IGST Receivable (ITC)', category: 'ASSETS', subType: 'TAX_ASSET', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'INPUT_IGST', isActive: true, description: 'Eligible IGST input tax credit', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_2100', tenantId: 'store-01', code: '2100', name: 'Accounts Payable (Suppliers)', category: 'LIABILITIES', subType: 'PAYABLE', normalBalance: 'CREDIT', parentAccountId: null, isSystemAccount: true, systemCode: 'ACCOUNTS_PAYABLE', isActive: true, description: 'Supplier trade payable control account', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_2110', tenantId: 'store-01', code: '2110', name: 'GRN Unbilled Clearing (Goods Received Not Invoiced)', category: 'LIABILITIES', subType: 'CLEARING_LIABILITY', normalBalance: 'CREDIT', parentAccountId: null, isSystemAccount: true, systemCode: 'GRN_UNBILLED_CLEARING', isActive: true, description: 'Prevents GRN + Invoice double counting', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_2150', tenantId: 'store-01', code: '2150', name: 'Customer Advances (Khata Credit)', category: 'LIABILITIES', subType: 'ADVANCE_LIABILITY', normalBalance: 'CREDIT', parentAccountId: null, isSystemAccount: true, systemCode: 'CUSTOMER_ADVANCES', isActive: true, description: 'Advance payments held for customers', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_2210', tenantId: 'store-01', code: '2210', name: 'Output GST — CGST Payable', category: 'LIABILITIES', subType: 'TAX_LIABILITY', normalBalance: 'CREDIT', parentAccountId: null, isSystemAccount: true, systemCode: 'OUTPUT_CGST', isActive: true, description: 'CGST collected on retail sales', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_2220', tenantId: 'store-01', code: '2220', name: 'Output GST — SGST Payable', category: 'LIABILITIES', subType: 'TAX_LIABILITY', normalBalance: 'CREDIT', parentAccountId: null, isSystemAccount: true, systemCode: 'OUTPUT_SGST', isActive: true, description: 'SGST collected on retail sales', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_2230', tenantId: 'store-01', code: '2230', name: 'Output GST — IGST Payable', category: 'LIABILITIES', subType: 'TAX_LIABILITY', normalBalance: 'CREDIT', parentAccountId: null, isSystemAccount: true, systemCode: 'OUTPUT_IGST', isActive: true, description: 'IGST collected on inter-state supplies', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_2300', tenantId: 'store-01', code: '2300', name: 'Outstanding Expenses Payable', category: 'LIABILITIES', subType: 'ACCRUED_EXPENSE', normalBalance: 'CREDIT', parentAccountId: null, isSystemAccount: true, systemCode: 'OUTSTANDING_EXPENSES', isActive: true, description: 'Approved unpaid operating expenses', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_3100', tenantId: 'store-01', code: '3100', name: "Owner's Capital", category: 'EQUITY', subType: 'CAPITAL', normalBalance: 'CREDIT', parentAccountId: null, isSystemAccount: true, systemCode: 'OWNERS_CAPITAL', isActive: true, description: 'Proprietor equity contribution', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_3200', tenantId: 'store-01', code: '3200', name: 'Opening Balance Equity', category: 'EQUITY', subType: 'OPENING_EQUITY', normalBalance: 'CREDIT', parentAccountId: null, isSystemAccount: true, systemCode: 'OPENING_BALANCE_EQUITY', isActive: true, description: 'Historical opening balance offset account', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_4100', tenantId: 'store-01', code: '4100', name: 'Medicine Sales Revenue', category: 'INCOME', subType: 'OPERATING_REVENUE', normalBalance: 'CREDIT', parentAccountId: null, isSystemAccount: true, systemCode: 'SALES_REVENUE', isActive: true, description: 'Taxable pharmacy retail sales', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_4110', tenantId: 'store-01', code: '4110', name: 'Sales Returns & Allowances', category: 'INCOME', subType: 'CONTRA_REVENUE', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'SALES_RETURNS', isActive: true, description: 'Contra revenue for patient returns', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_4200', tenantId: 'store-01', code: '4200', name: 'Other Operating Income', category: 'INCOME', subType: 'OTHER_INCOME', normalBalance: 'CREDIT', parentAccountId: null, isSystemAccount: true, systemCode: 'OTHER_INCOME', isActive: true, description: 'Miscellaneous rebates and credits', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_5100', tenantId: 'store-01', code: '5100', name: 'Cost of Goods Sold (COGS)', category: 'EXPENSES', subType: 'COGS', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'COGS', isActive: true, description: 'Batch PTR cost recognized on dispensing', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_5210', tenantId: 'store-01', code: '5210', name: 'Shop Rent & Lease', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'EXP_RENT', isActive: true, description: 'Monthly medical store lease rent', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_5220', tenantId: 'store-01', code: '5220', name: 'Staff Salaries & Wages', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'EXP_SALARY', isActive: true, description: 'Pharmacist and staff payroll', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_5230', tenantId: 'store-01', code: '5230', name: 'Electricity & Cold-Chain Utilities', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'EXP_ELECTRICITY', isActive: true, description: 'Refrigeration and power bills', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_5240', tenantId: 'store-01', code: '5240', name: 'Courier & Home Delivery Expense', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'EXP_DELIVERY', isActive: true, description: 'Patient doorstep medicine delivery', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_5250', tenantId: 'store-01', code: '5250', name: 'Software, Internet & Telecom', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'EXP_SOFTWARE', isActive: true, description: 'Subscriptions and broadband', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_5260', tenantId: 'store-01', code: '5260', name: 'Packaging, Thermal Paper & Bags', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'EXP_PACKAGING', isActive: true, description: 'Dispensary consumables', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_5270', tenantId: 'store-01', code: '5270', name: 'Bank Charges & POS MDR Fees', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'EXP_BANK_CHARGES', isActive: true, description: 'Merchant and NEFT charges', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_5280', tenantId: 'store-01', code: '5280', name: 'Stock Shrinkage, Expiry & Spoilage', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'EXP_SHRINKAGE', isActive: true, description: 'Non-restocked return or damaged stock loss', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
  { id: 'coa_5290', tenantId: 'store-01', code: '5290', name: 'Rounding & Write-Off Adjustments', category: 'EXPENSES', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', parentAccountId: null, isSystemAccount: true, systemCode: 'EXP_ROUND_OFF', isActive: true, description: 'Bill rounding differences', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', createdBy: 'system' },
];

export function buildDefaultPreviewPeriods(): FinancialPeriod[] {
  const now = new Date();
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyLabel = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;
  const months = [
    { offset: 3, name: 'April' },
    { offset: 4, name: 'May' },
    { offset: 5, name: 'June' },
    { offset: 6, name: 'July' },
    { offset: 7, name: 'August' },
    { offset: 8, name: 'September' },
    { offset: 9, name: 'October' },
    { offset: 10, name: 'November' },
    { offset: 11, name: 'December' },
    { offset: 0, name: 'January', nextYear: true },
    { offset: 1, name: 'February', nextYear: true },
    { offset: 2, name: 'March', nextYear: true },
  ];
  return months.map((m, idx) => {
    const year = m.nextYear ? fyStartYear + 1 : fyStartYear;
    const start = `${year}-${String(m.offset + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, m.offset + 1, 0).getDate();
    const end = `${year}-${String(m.offset + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return {
      id: `fy_${fyStartYear}_p${String(idx + 1).padStart(2, '0')}`,
      tenantId: 'store-01',
      financialYear: fyLabel,
      periodName: `${m.name} ${year}`,
      periodNumber: idx + 1,
      startDate: start,
      endDate: end,
      status: 'OPEN',
      closedAt: null,
      closedBy: null,
      closeNotes: null,
      reopenedAt: null,
      reopenedBy: null,
      reopenReason: null,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
    };
  });
}

export const DEFAULT_PREVIEW_CASH_ACCOUNTS: CashAccount[] = [
  { id: 'cash_main', tenantId: 'store-01', branchId: 'main', name: 'POS Main Counter Cash Drawer', ledgerAccountId: 'coa_1100', ledgerAccountCode: '1100', status: 'ACTIVE', isDefault: true, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z' },
];

export const DEFAULT_PREVIEW_BANK_ACCOUNTS: BankAccount[] = [
  { id: 'bank_main', tenantId: 'store-01', branchId: 'main', accountName: 'Store Primary Current Account', bankName: 'HDFC Bank', branchName: 'Andheri West', ifscCode: 'HDFC0000412', maskedAccountNumber: 'XXXX6891', ledgerAccountId: 'coa_1200', ledgerAccountCode: '1200', status: 'ACTIVE', isDefault: true, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z' },
];

export function buildPreviewJournalsFromOperations(params: {
  accounts: ChartOfAccount[];
  bills: BillInvoice[];
  inventory: InventoryBatch[];
  goodsReceipts: GoodsReceiptNote[];
  supplierInvoices: SupplierInvoice[];
  supplierPayments: SupplierPayment[];
  customers: Customer[];
  customerPayments: CustomerPayment[];
  suppliers: Supplier[];
  expenses: ExpenseRecord[];
  manualJournals: JournalEntry[];
}): JournalEntry[] {
  const {
    accounts,
    bills,
    inventory,
    goodsReceipts,
    supplierInvoices,
    supplierPayments,
    customerPayments,
    expenses,
    manualJournals,
  } = params;

  const accById = new Map(accounts.map((a) => [a.id, a]));
  const ptrByBatch = new Map(inventory.map((b) => [b.id, b.ptr || b.mrp * 0.72]));
  const entries: JournalEntry[] = [];
  let seq = 1;

  const mkJournal = (input: {
    id: string;
    branchId: string;
    entryType: string;
    date: string;
    refType: string;
    refId: string;
    refNum: string | null;
    narration: string;
    lines: Array<{ accountId: string; debitPaise?: number; creditPaise?: number; desc?: string }>;
  }): JournalEntry | null => {
    const cleanLines: JournalLine[] = [];
    let drP = 0;
    let crP = 0;
    input.lines.forEach((l, idx) => {
      const d = Math.max(0, Math.round(l.debitPaise || 0));
      const c = Math.max(0, Math.round(l.creditPaise || 0));
      if (d === 0 && c === 0) return;
      const acc = accById.get(l.accountId);
      if (!acc) return;
      drP += d;
      crP += c;
      cleanLines.push({
        id: `${input.id}_l${idx + 1}`,
        entryId: input.id,
        tenantId: 'store-01',
        branchId: input.branchId || 'main',
        transactionDate: input.date.slice(0, 10),
        accountId: acc.id,
        accountCode: acc.code,
        accountName: acc.name,
        accountCategory: acc.category,
        normalBalance: acc.normalBalance,
        debitPaise: d,
        creditPaise: c,
        debit: fromPaise(d),
        credit: fromPaise(c),
        description: l.desc || input.narration,
      });
    });
    if (cleanLines.length === 0 || drP !== crP || drP <= 0) return null;
    const vNum = `JV-2026-${String(seq++).padStart(5, '0')}`;
    return {
      id: input.id,
      tenantId: 'store-01',
      branchId: input.branchId || 'main',
      voucherNumber: vNum,
      entryType: input.entryType,
      status: 'POSTED',
      transactionDate: input.date.slice(0, 10),
      periodId: 'fy_2026_p08',
      referenceType: input.refType,
      referenceId: input.refId,
      referenceNumber: input.refNum,
      narration: input.narration,
      idempotencyKey: input.id,
      debitTotalPaise: drP,
      creditTotalPaise: crP,
      debitTotal: fromPaise(drP),
      creditTotal: fromPaise(crP),
      lines: cleanLines,
      reversesEntryId: null,
      reversedByEntryId: null,
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
      createdBy: 'system',
      createdAt: `${input.date.slice(0, 10)}T10:00:00Z`,
    };
  };

  // Opening inventory seed entry so Balance Sheet & Inventory GL match current stock baseline
  const initialStockPaise = inventory.reduce((s, b) => s + toPaise(b.currentStock * (b.ptr || 0)), 0);
  if (initialStockPaise > 0) {
    const j = mkJournal({
      id: 'je_seed_stock',
      branchId: 'main',
      entryType: 'OPENING_BALANCE',
      date: '2026-10-01',
      refType: 'opening_balance',
      refId: 'seed-stock',
      refNum: 'OP-INV-01',
      narration: 'Opening Batch Stock Valuation (at PTR)',
      lines: [
        { accountId: 'coa_1400', debitPaise: initialStockPaise },
        { accountId: 'coa_3200', creditPaise: initialStockPaise },
      ],
    });
    if (j) entries.push(j);
  }

  // POS Invoices
  for (const bill of bills) {
    if (bill.status === 'cancelled') continue;
    const txDate = bill.timestamp.slice(0, 10);
    const branchId = bill.branchId || 'main';
    const grandP = toPaise(bill.grandTotal);
    const taxP = toPaise(bill.taxableAmount);
    const cgstP = toPaise(bill.cgst);
    const sgstP = toPaise(bill.sgst);
    const igstP = toPaise(bill.igst || 0);
    const roundP = grandP - (taxP + cgstP + sgstP + igstP);

    const lines: Array<{ accountId: string; debitPaise?: number; creditPaise?: number }> = [];
    const khataP = toPaise(bill.khataCreditAmount ?? (bill.paymentMode === 'khata_credit' ? bill.balanceDue : 0));
    const paidP = Math.max(0, grandP - khataP);
    if (paidP > 0) {
      const modeMap: Record<string, string> = {
        cash: 'coa_1100',
        upi: 'coa_1210',
        card: 'coa_1220',
        bank_transfer: 'coa_1200',
      };
      lines.push({ accountId: modeMap[bill.paymentMode] || 'coa_1100', debitPaise: paidP });
    }
    if (khataP > 0) lines.push({ accountId: 'coa_1300', debitPaise: khataP });
    lines.push({ accountId: 'coa_4100', creditPaise: taxP });
    if (cgstP > 0) lines.push({ accountId: 'coa_2210', creditPaise: cgstP });
    if (sgstP > 0) lines.push({ accountId: 'coa_2220', creditPaise: sgstP });
    if (igstP > 0) lines.push({ accountId: 'coa_2230', creditPaise: igstP });
    if (roundP > 0) lines.push({ accountId: 'coa_5290', creditPaise: roundP });
    else if (roundP < 0) lines.push({ accountId: 'coa_5290', debitPaise: Math.abs(roundP) });

    const cogsP = bill.items.reduce(
      (s, it) => s + toPaise((ptrByBatch.get(it.batchId) || it.mrp * 0.72) * it.quantity),
      0
    );
    if (cogsP > 0) {
      lines.push({ accountId: 'coa_5100', debitPaise: cogsP });
      lines.push({ accountId: 'coa_1400', creditPaise: cogsP });
    }

    const j = mkJournal({
      id: `je_bill_${bill.id}`,
      branchId,
      entryType: 'SALES_INVOICE',
      date: txDate,
      refType: 'sales_invoice',
      refId: bill.id,
      refNum: bill.invoiceNumber,
      narration: `POS Sale ${bill.invoiceNumber} — ${bill.customerName}`,
      lines,
    });
    if (j) entries.push(j);
  }

  // Customer Khata Collections
  for (const kp of customerPayments) {
    const modeMap: Record<string, string> = {
      cash: 'coa_1100',
      upi: 'coa_1210',
      card: 'coa_1220',
      bank_transfer: 'coa_1200',
    };
    const amtP = toPaise(kp.amount);
    const balP = toPaise(kp.appliedToBalance);
    const advP = amtP - balP;
    const lines: Array<{ accountId: string; debitPaise?: number; creditPaise?: number }> = [
      { accountId: modeMap[kp.paymentMode] || 'coa_1100', debitPaise: amtP },
    ];
    if (balP > 0) lines.push({ accountId: 'coa_1300', creditPaise: balP });
    if (advP > 0) lines.push({ accountId: 'coa_2150', creditPaise: advP });

    const j = mkJournal({
      id: `je_kpay_${kp.id}`,
      branchId: kp.branchId || 'main',
      entryType: 'KHATA_PAYMENT',
      date: kp.paymentDate,
      refType: 'khata_payment',
      refId: kp.id,
      refNum: kp.receiptNumber,
      narration: `Khata Receipt ${kp.receiptNumber} — ${kp.customerName}`,
      lines,
    });
    if (j) entries.push(j);
  }

  // GRNs
  for (const grn of goodsReceipts) {
    if (grn.status === 'DRAFT') continue;
    const creditAcc = grn.linkedInvoiceId ? 'coa_2100' : 'coa_2110';
    const taxP = toPaise(grn.taxableAmount);
    const cgstP = toPaise(grn.cgst);
    const sgstP = toPaise(grn.sgst);
    const igstP = toPaise(grn.igst);
    const grandP = toPaise(grn.grandTotal);
    const roundP = grandP - (taxP + cgstP + sgstP + igstP);
    const lines: Array<{ accountId: string; debitPaise?: number; creditPaise?: number }> = [
      { accountId: 'coa_1400', debitPaise: taxP },
    ];
    if (cgstP > 0) lines.push({ accountId: 'coa_1510', debitPaise: cgstP });
    if (sgstP > 0) lines.push({ accountId: 'coa_1520', debitPaise: sgstP });
    if (igstP > 0) lines.push({ accountId: 'coa_1530', debitPaise: igstP });
    if (roundP > 0) lines.push({ accountId: 'coa_5290', debitPaise: roundP });
    else if (roundP < 0) lines.push({ accountId: 'coa_5290', creditPaise: Math.abs(roundP) });
    lines.push({ accountId: creditAcc, creditPaise: grandP });

    const j = mkJournal({
      id: `je_grn_${grn.id}`,
      branchId: grn.branchId || 'main',
      entryType: 'PURCHASE_GRN',
      date: grn.receiptDate,
      refType: 'grn',
      refId: grn.id,
      refNum: grn.grnNumber,
      narration: `GRN ${grn.grnNumber} — ${grn.supplierName}`,
      lines,
    });
    if (j) entries.push(j);
  }

  // Direct Supplier Invoices (not linked to GRN)
  for (const sinv of supplierInvoices) {
    if (sinv.paymentStatus === 'REVERSED' || sinv.grnId) continue;
    const taxP = toPaise(sinv.taxableAmount);
    const cgstP = toPaise(sinv.cgst);
    const sgstP = toPaise(sinv.sgst);
    const igstP = toPaise(sinv.igst);
    const totP = toPaise(sinv.totalAmount);
    const roundP = totP - (taxP + cgstP + sgstP + igstP);
    const lines: Array<{ accountId: string; debitPaise?: number; creditPaise?: number }> = [
      { accountId: 'coa_1400', debitPaise: taxP },
    ];
    if (cgstP > 0) lines.push({ accountId: 'coa_1510', debitPaise: cgstP });
    if (sgstP > 0) lines.push({ accountId: 'coa_1520', debitPaise: sgstP });
    if (igstP > 0) lines.push({ accountId: 'coa_1530', debitPaise: igstP });
    if (roundP > 0) lines.push({ accountId: 'coa_5290', debitPaise: roundP });
    else if (roundP < 0) lines.push({ accountId: 'coa_5290', creditPaise: Math.abs(roundP) });
    lines.push({ accountId: 'coa_2100', creditPaise: totP });

    const j = mkJournal({
      id: `je_sinv_${sinv.id}`,
      branchId: sinv.branchId || 'main',
      entryType: 'SUPPLIER_INVOICE',
      date: sinv.invoiceDate,
      refType: 'supplier_invoice',
      refId: sinv.id,
      refNum: sinv.supplierInvoiceNumber,
      narration: `Supplier Bill ${sinv.supplierInvoiceNumber} — ${sinv.supplierName}`,
      lines,
    });
    if (j) entries.push(j);
  }

  // Supplier Payments
  for (const sp of supplierPayments) {
    const modeMap: Record<string, string> = {
      CASH: 'coa_1100',
      UPI: 'coa_1210',
      CARD: 'coa_1220',
      BANK_TRANSFER: 'coa_1200',
      NEFT_RTGS: 'coa_1200',
      CHEQUE: 'coa_1200',
    };
    const amtP = toPaise(sp.amount);
    const allocP = toPaise(sp.allocatedTotal);
    const advP = amtP - allocP;
    const lines: Array<{ accountId: string; debitPaise?: number; creditPaise?: number }> = [];
    if (allocP > 0) lines.push({ accountId: 'coa_2100', debitPaise: allocP });
    if (advP > 0) lines.push({ accountId: 'coa_1350', debitPaise: advP });
    lines.push({ accountId: modeMap[sp.paymentMode] || 'coa_1200', creditPaise: amtP });

    const j = mkJournal({
      id: `je_spay_${sp.id}`,
      branchId: sp.branchId || 'main',
      entryType: 'SUPPLIER_PAYMENT',
      date: sp.paymentDate,
      refType: 'supplier_payment',
      refId: sp.id,
      refNum: sp.paymentNumber,
      narration: `Supplier Payment ${sp.paymentNumber} — ${sp.supplierName}`,
      lines,
    });
    if (j) entries.push(j);
  }

  // Expenses
  for (const exp of expenses) {
    if (exp.status === 'REVERSED' || exp.status === 'REJECTED' || exp.status === 'SUBMITTED') continue;
    const taxP = toPaise(exp.taxableAmount);
    const cgstP = toPaise(exp.cgst);
    const sgstP = toPaise(exp.sgst);
    const igstP = toPaise(exp.igst);
    const totP = toPaise(exp.totalAmount);
    const creditAcc = exp.status === 'PAID' ? exp.paymentAccountId || 'coa_1100' : 'coa_2300';
    const lines: Array<{ accountId: string; debitPaise?: number; creditPaise?: number }> = [
      { accountId: exp.categoryAccountId, debitPaise: exp.itcEligible ? taxP : totP },
    ];
    if (exp.itcEligible) {
      if (cgstP > 0) lines.push({ accountId: 'coa_1510', debitPaise: cgstP });
      if (sgstP > 0) lines.push({ accountId: 'coa_1520', debitPaise: sgstP });
      if (igstP > 0) lines.push({ accountId: 'coa_1530', debitPaise: igstP });
    }
    lines.push({ accountId: creditAcc, creditPaise: totP });

    const j = mkJournal({
      id: `je_exp_${exp.id}`,
      branchId: exp.branchId || 'main',
      entryType: exp.status === 'PAID' ? 'EXPENSE_PAYMENT' : 'EXPENSE_ACCRUAL',
      date: exp.expenseDate,
      refType: 'expense',
      refId: exp.id,
      refNum: exp.expenseNumber,
      narration: `Expense ${exp.expenseNumber} (${exp.categoryAccountName}) — ${exp.vendorName}`,
      lines,
    });
    if (j) entries.push(j);
  }

  // Append custom in-session manual transfers / opening balances / reversals
  for (const mj of manualJournals) {
    entries.push(mj);
  }

  return entries.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
}

export function computePreviewReports(params: {
  accounts: ChartOfAccount[];
  journals: JournalEntry[];
  expenses: ExpenseRecord[];
  periods: FinancialPeriod[];
  customers: Customer[];
  suppliers: Supplier[];
  inventory: InventoryBatch[];
  branchId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const { accounts, journals, expenses, periods, customers, suppliers, inventory, branchId, fromDate, toDate } = params;
  const filterBranch = branchId && branchId !== 'ALL' ? branchId : null;
  const scoped = journals.filter((e) => {
    if (filterBranch && e.branchId !== filterBranch) return false;
    return true;
  });

  // Trial Balance
  const tbMap = new Map<string, { opDr: number; opCr: number; perDr: number; perCr: number }>();
  accounts.forEach((a) => tbMap.set(a.id, { opDr: 0, opCr: 0, perDr: 0, perCr: 0 }));

  for (const e of scoped) {
    if (toDate && e.transactionDate > toDate) continue;
    const isOp = Boolean(fromDate && e.transactionDate < fromDate);
    for (const l of e.lines) {
      if (filterBranch && l.branchId !== filterBranch) continue;
      const cur = tbMap.get(l.accountId) || { opDr: 0, opCr: 0, perDr: 0, perCr: 0 };
      if (isOp) {
        cur.opDr += l.debitPaise;
        cur.opCr += l.creditPaise;
      } else {
        cur.perDr += l.debitPaise;
        cur.perCr += l.creditPaise;
      }
      tbMap.set(l.accountId, cur);
    }
  }

  const tbRows: TrialBalanceData['rows'] = [];
  let sumOpDr = 0;
  let sumOpCr = 0;
  let sumPerDr = 0;
  let sumPerCr = 0;
  let sumClDr = 0;
  let sumClCr = 0;

  for (const acc of accounts) {
    const s = tbMap.get(acc.id)!;
    const opNet = s.opDr - s.opCr;
    const opDr = opNet > 0 ? opNet : 0;
    const opCr = opNet < 0 ? Math.abs(opNet) : 0;
    const clNet = s.opDr + s.perDr - (s.opCr + s.perCr);
    const clDr = clNet > 0 ? clNet : 0;
    const clCr = clNet < 0 ? Math.abs(clNet) : 0;
    if (opDr === 0 && opCr === 0 && s.perDr === 0 && s.perCr === 0 && clDr === 0 && clCr === 0) continue;

    sumOpDr += opDr;
    sumOpCr += opCr;
    sumPerDr += s.perDr;
    sumPerCr += s.perCr;
    sumClDr += clDr;
    sumClCr += clCr;

    tbRows.push({
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      category: acc.category,
      normalBalance: acc.normalBalance,
      openingDebit: fromPaise(opDr),
      openingCredit: fromPaise(opCr),
      periodDebit: fromPaise(s.perDr),
      periodCredit: fromPaise(s.perCr),
      closingDebit: fromPaise(clDr),
      closingCredit: fromPaise(clCr),
      netBalance:
        acc.normalBalance === 'DEBIT'
          ? fromPaise(s.opDr + s.perDr - (s.opCr + s.perCr))
          : fromPaise(s.opCr + s.perCr - (s.opDr + s.perDr)),
    });
  }

  const trialBalance: TrialBalanceData = {
    branchId: filterBranch || 'ALL',
    fromDate: fromDate || null,
    toDate: toDate || null,
    rows: tbRows,
    totals: {
      openingDebit: fromPaise(sumOpDr),
      openingCredit: fromPaise(sumOpCr),
      periodDebit: fromPaise(sumPerDr),
      periodCredit: fromPaise(sumPerCr),
      closingDebit: fromPaise(sumClDr),
      closingCredit: fromPaise(sumClCr),
      isBalanced: sumClDr === sumClCr,
    },
  };

  // Profit & Loss
  const incomeItems: ProfitLossData['incomeItems'] = [];
  const cogsItems: ProfitLossData['cogsItems'] = [];
  const opExpItems: ProfitLossData['operatingExpenseItems'] = [];
  let netSalesP = 0;
  let totalIncomeP = 0;
  let totalCogsP = 0;
  let totalOpExpP = 0;

  for (const row of tbRows) {
    const s = tbMap.get(row.accountId)!;
    const acc = accounts.find((a) => a.id === row.accountId)!;
    if (acc.category === 'INCOME') {
      const p = s.perCr - s.perDr;
      if (p === 0) continue;
      totalIncomeP += p;
      if (acc.subType === 'OPERATING_REVENUE' || acc.subType === 'CONTRA_REVENUE') netSalesP += p;
      incomeItems.push({ accountId: acc.id, code: acc.code, name: acc.name, subType: acc.subType, amount: fromPaise(p) });
    } else if (acc.category === 'EXPENSES') {
      const p = s.perDr - s.perCr;
      if (p === 0) continue;
      if (acc.subType === 'COGS') {
        totalCogsP += p;
        cogsItems.push({ accountId: acc.id, code: acc.code, name: acc.name, subType: acc.subType, amount: fromPaise(p) });
      } else {
        totalOpExpP += p;
        opExpItems.push({ accountId: acc.id, code: acc.code, name: acc.name, subType: acc.subType, amount: fromPaise(p) });
      }
    }
  }
  const grossP = netSalesP - totalCogsP;
  const otherIncP = totalIncomeP - netSalesP;
  const netProfitP = grossP + otherIncP - totalOpExpP;

  const profitLoss: ProfitLossData = {
    branchId: filterBranch || 'ALL',
    fromDate: fromDate || null,
    toDate: toDate || null,
    incomeItems,
    cogsItems,
    operatingExpenseItems: opExpItems,
    summary: {
      netSales: fromPaise(netSalesP),
      otherIncome: fromPaise(otherIncP),
      totalIncome: fromPaise(totalIncomeP),
      totalCogs: fromPaise(totalCogsP),
      grossProfit: fromPaise(grossP),
      grossMarginPercent: netSalesP > 0 ? Number(((grossP / netSalesP) * 100).toFixed(2)) : 0,
      totalOperatingExpenses: fromPaise(totalOpExpP),
      totalExpenses: fromPaise(totalCogsP + totalOpExpP),
      netProfit: fromPaise(netProfitP),
    },
  };

  // Balance Sheet
  const assetsItems: BalanceSheetData['assets']['items'] = [];
  const liabItems: BalanceSheetData['liabilities']['items'] = [];
  const eqItems: BalanceSheetData['equity']['items'] = [];
  let totAssetsP = 0;
  let totLiabP = 0;
  let totEqP = 0;
  let bsNetProfitP = 0;

  for (const acc of accounts) {
    const s = tbMap.get(acc.id)!;
    const dr = s.opDr + s.perDr;
    const cr = s.opCr + s.perCr;
    if (acc.category === 'ASSETS') {
      const bal = dr - cr;
      if (bal !== 0) {
        totAssetsP += bal;
        assetsItems.push({ accountId: acc.id, code: acc.code, name: acc.name, subType: acc.subType, balance: fromPaise(bal) });
      }
    } else if (acc.category === 'LIABILITIES') {
      const bal = cr - dr;
      if (bal !== 0) {
        totLiabP += bal;
        liabItems.push({ accountId: acc.id, code: acc.code, name: acc.name, subType: acc.subType, balance: fromPaise(bal) });
      }
    } else if (acc.category === 'EQUITY') {
      const bal = cr - dr;
      if (bal !== 0) {
        totEqP += bal;
        eqItems.push({ accountId: acc.id, code: acc.code, name: acc.name, subType: acc.subType, balance: fromPaise(bal) });
      }
    } else if (acc.category === 'INCOME') {
      bsNetProfitP += cr - dr;
    } else if (acc.category === 'EXPENSES') {
      bsNetProfitP -= dr - cr;
    }
  }
  if (bsNetProfitP !== 0 || eqItems.length === 0) {
    totEqP += bsNetProfitP;
    eqItems.push({
      accountId: 'current_period_net_profit',
      code: '3999',
      name: 'Current Period Net Profit / (Loss)',
      subType: 'CURRENT_EARNINGS',
      balance: fromPaise(bsNetProfitP),
    });
  }

  const balanceSheet: BalanceSheetData = {
    branchId: filterBranch || 'ALL',
    asOfDate: toDate || new Date().toISOString().slice(0, 10),
    assets: { items: assetsItems, total: fromPaise(totAssetsP) },
    liabilities: { items: liabItems, total: fromPaise(totLiabP) },
    equity: { items: eqItems, total: fromPaise(totEqP) },
    totals: {
      totalAssets: fromPaise(totAssetsP),
      totalLiabilities: fromPaise(totLiabP),
      totalEquity: fromPaise(totEqP),
      totalLiabilitiesAndEquity: fromPaise(totLiabP + totEqP),
      difference: fromPaise(totAssetsP - (totLiabP + totEqP)),
      isBalanced: totAssetsP === totLiabP + totEqP,
    },
  };

  // Cash & Bank Books
  const buildBook = (bookType: 'CASH' | 'BANK'): CashOrBankBookData => {
    const subs = bookType === 'CASH' ? ['CASH'] : ['BANK', 'CLEARING'];
    const targetIds = new Set(accounts.filter((a) => a.category === 'ASSETS' && subs.includes(a.subType)).map((a) => a.id));
    let running = 0;
    let opening = 0;
    const rows: CashOrBankBookData['rows'] = [];
    const asc = [...scoped].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
    for (const e of asc) {
      if (toDate && e.transactionDate > toDate) continue;
      for (const l of e.lines) {
        if (!targetIds.has(l.accountId)) continue;
        const delta = l.debitPaise - l.creditPaise;
        running += delta;
        if (fromDate && e.transactionDate < fromDate) opening += delta;
        else {
          rows.push({
            entryId: e.id,
            voucherNumber: e.voucherNumber,
            transactionDate: e.transactionDate,
            entryType: e.entryType,
            status: e.status,
            accountCode: l.accountCode,
            accountName: l.accountName,
            narration: e.narration,
            receipt: l.debit,
            payment: l.credit,
            balance: fromPaise(running),
          });
        }
      }
    }
    return {
      bookType,
      branchId: filterBranch || 'ALL',
      fromDate: fromDate || null,
      toDate: toDate || null,
      openingBalance: fromPaise(opening),
      closingBalance: fromPaise(running),
      totalReceipts: fromPaise(rows.reduce((s, r) => s + toPaise(r.receipt), 0)),
      totalPayments: fromPaise(rows.reduce((s, r) => s + toPaise(r.payment), 0)),
      rows,
    };
  };

  const cashBook = buildBook('CASH');
  const bankBook = buildBook('BANK');

  // Cash Flow Statement
  const liquidIds = new Set(accounts.filter((a) => a.category === 'ASSETS' && ['CASH', 'BANK', 'CLEARING'].includes(a.subType)).map((a) => a.id));
  let opIn = 0;
  let opOut = 0;
  let trfVol = 0;
  for (const e of scoped) {
    if (fromDate && e.transactionDate < fromDate) continue;
    if (toDate && e.transactionDate > toDate) continue;
    const d = e.lines.filter((l) => liquidIds.has(l.accountId)).reduce((s, l) => s + (l.debitPaise - l.creditPaise), 0);
    if (d === 0 && e.entryType === 'INTERNAL_TRANSFER') trfVol += e.debitTotalPaise;
    else if (d > 0) opIn += d;
    else if (d < 0) opOut += Math.abs(d);
  }
  const cashFlow: CashFlowData = {
    branchId: filterBranch || 'ALL',
    fromDate: fromDate || null,
    toDate: toDate || null,
    openingCashAndBankBalance: 0,
    operatingActivities: { cashInflows: fromPaise(opIn), cashOutflows: fromPaise(opOut), netOperatingCashFlow: fromPaise(opIn - opOut) },
    financingActivities: { capitalInflows: 0, capitalOutflows: 0, netFinancingCashFlow: 0 },
    internalTransfersVolume: fromPaise(trfVol),
    netIncreaseInCashAndBank: fromPaise(opIn - opOut),
    closingCashAndBankBalance: fromPaise(opIn - opOut),
  };

  // GST Summary
  const sumCode = (code: string, isOutput: boolean) => {
    const row = tbRows.find((r) => r.code === code);
    if (!row) return 0;
    const s = tbMap.get(row.accountId)!;
    return isOutput ? s.perCr - s.perDr : s.perDr - s.perCr;
  };
  const outCgst = sumCode('2210', true);
  const outSgst = sumCode('2220', true);
  const outIgst = sumCode('2230', true);
  const inCgst = sumCode('1510', false);
  const inSgst = sumCode('1520', false);
  const inIgst = sumCode('1530', false);
  const totOut = outCgst + outSgst + outIgst;
  const totIn = inCgst + inSgst + inIgst;
  const netGst = totOut - totIn;
  const gstSummary: GstSummaryData = {
    branchId: filterBranch || 'ALL',
    fromDate: fromDate || null,
    toDate: toDate || null,
    disclaimer:
      'Internal accounting GST register derived from posted double-entry journals. Verify with your Chartered Accountant before filing GSTR-1 / GSTR-3B on the GSTN portal.',
    outputTax: {
      cgst: fromPaise(outCgst),
      sgst: fromPaise(outSgst),
      igst: fromPaise(outIgst),
      totalOutputGst: fromPaise(totOut),
      salesReturnsTaxAdjustment: 0,
    },
    inputTaxCredit: {
      cgst: fromPaise(inCgst),
      sgst: fromPaise(inSgst),
      igst: fromPaise(inIgst),
      totalEligibleItc: fromPaise(totIn),
      purchaseReturnItcReversal: 0,
    },
    taxableSalesTotal: profitLoss.summary.netSales,
    zeroRatedAndExemptSales: 0,
    netGstPayable: fromPaise(netGst),
    netPosition: netGst >= 0 ? 'PAYABLE' : 'ITC_CARRY_FORWARD',
  };

  // Expense Summary
  const activeExp = expenses.filter((e) => e.status !== 'REVERSED' && e.status !== 'REJECTED');
  const byCat = new Map<string, { code: string; name: string; count: number; total: number; paid: number }>();
  for (const e of activeExp) {
    const cur = byCat.get(e.categoryAccountId) || { code: e.categoryAccountCode, name: e.categoryAccountName, count: 0, total: 0, paid: 0 };
    cur.count += 1;
    cur.total += e.totalAmount;
    cur.paid += e.paidAmount;
    byCat.set(e.categoryAccountId, cur);
  }
  const expenseSummary: ExpenseSummaryData = {
    branchId: filterBranch || 'ALL',
    fromDate: fromDate || null,
    toDate: toDate || null,
    totalExpenseCount: activeExp.length,
    totalExpenseAmount: activeExp.reduce((s, e) => s + e.totalAmount, 0),
    totalPaidAmount: activeExp.reduce((s, e) => s + e.paidAmount, 0),
    totalUnpaidAccrued: activeExp.reduce((s, e) => s + e.outstandingAmount, 0),
    byCategory: Array.from(byCat.values()),
  };

  // Branch PnL
  const branchIds = Array.from(new Set(journals.map((j) => j.branchId || 'main'))).sort();
  if (branchIds.length === 0) branchIds.push('main');
  const branchPnl: BranchPnlData = {
    fromDate: fromDate || null,
    toDate: toDate || null,
    branches: branchIds.map((bId) => {
      const bJournals = journals.filter((j) => j.branchId === bId);
      let bSales = 0;
      let bCogs = 0;
      let bExp = 0;
      for (const j of bJournals) {
        if (fromDate && j.transactionDate < fromDate) continue;
        if (toDate && j.transactionDate > toDate) continue;
        for (const l of j.lines) {
          if (l.accountCode === '4100' || l.accountCode === '4110') bSales += l.creditPaise - l.debitPaise;
          else if (l.accountCode === '5100') bCogs += l.debitPaise - l.creditPaise;
          else if (l.accountCategory === 'EXPENSES') bExp += l.debitPaise - l.creditPaise;
        }
      }
      return {
        branchId: bId,
        netSales: fromPaise(bSales),
        totalCogs: fromPaise(bCogs),
        grossProfit: fromPaise(bSales - bCogs),
        operatingExpenses: fromPaise(bExp),
        netProfit: fromPaise(bSales - bCogs - bExp),
      };
    }),
  };

  const arItem = balanceSheet.assets.items.find((i) => i.code === '1300');
  const apItem = balanceSheet.liabilities.items.find((i) => i.code === '2100');
  const invItem = balanceSheet.assets.items.find((i) => i.code === '1400');

  const khataSubledger = customers.reduce((s, c) => s + (c.khataBalance || 0), 0);
  const supSubledger = suppliers.reduce((s, sup) => s + (sup.outstandingBalance || 0), 0);
  const batchPtrVal = inventory.reduce((s, b) => s + (b.currentStock > 0 ? b.currentStock * (b.ptr || 0) : 0), 0);

  const exceptions: ReconciliationCheckData['exceptions'] = [];
  if (Math.abs(khataSubledger - (arItem?.balance || 0)) > 1) {
    exceptions.push({
      id: 'preview_ar_diff',
      severity: 'INFO',
      category: 'AR_KHATA_DRIFT',
      title: 'Accounts Receivable GL vs Customer Khata Subledger Variance',
      description: `Customer Khata subledger is ₹${khataSubledger.toFixed(2)} vs GL 1300 ₹${(arItem?.balance || 0).toFixed(2)} (pre-ledger opening balances can be posted via Opening Balances).`,
      subledgerValue: khataSubledger,
      glValue: arItem?.balance || 0,
      difference: Math.round((khataSubledger - (arItem?.balance || 0)) * 100) / 100,
    });
  }
  if (Math.abs(supSubledger - (apItem?.balance || 0)) > 1) {
    exceptions.push({
      id: 'preview_ap_diff',
      severity: 'INFO',
      category: 'AP_SUPPLIER_DRIFT',
      title: 'Accounts Payable GL vs Supplier Payables Variance',
      description: `Supplier payables subledger is ₹${supSubledger.toFixed(2)} vs GL 2100 ₹${(apItem?.balance || 0).toFixed(2)}.`,
      subledgerValue: supSubledger,
      glValue: apItem?.balance || 0,
      difference: Math.round((supSubledger - (apItem?.balance || 0)) * 100) / 100,
    });
  }

  const reconciliationCheck: ReconciliationCheckData = {
    checkedAt: new Date().toISOString(),
    exceptionCount: exceptions.length,
    criticalCount: 0,
    highCount: 0,
    summary: {
      accountsReceivableGl: arItem?.balance || 0,
      customerKhataSubledger: Math.round(khataSubledger * 100) / 100,
      accountsPayableGl: apItem?.balance || 0,
      supplierPayablesSubledger: Math.round(supSubledger * 100) / 100,
      openSupplierInvoicesSubledger: Math.round(supSubledger * 100) / 100,
      inventoryGl: invItem?.balance || 0,
      inventoryBatchPtrValuation: Math.round(batchPtrVal * 100) / 100,
    },
    exceptions,
  };

  const overview: AccountingOverview = {
    netSales: profitLoss.summary.netSales,
    grossProfit: profitLoss.summary.grossProfit,
    grossMarginPercent: profitLoss.summary.grossMarginPercent,
    netProfit: profitLoss.summary.netProfit,
    totalOperatingExpenses: profitLoss.summary.totalOperatingExpenses,
    unpaidAccruedExpenses: expenseSummary.totalUnpaidAccrued,
    cashInHandBalance: cashBook.closingBalance,
    bankAndClearingBalance: bankBook.closingBalance,
    accountsReceivable: arItem?.balance || 0,
    accountsPayable: apItem?.balance || 0,
    inventoryGlValue: invItem?.balance || 0,
    netGstPayable: gstSummary.netGstPayable,
    gstNetPosition: gstSummary.netPosition,
    balanceSheetBalanced: balanceSheet.totals.isBalanced,
    openPeriodsCount: periods.filter((p) => p.status === 'OPEN').length,
    closedPeriodsCount: periods.filter((p) => p.status === 'CLOSED').length,
    reconciliationExceptionCount: exceptions.length,
  };

  return {
    overview,
    trialBalance,
    profitLoss,
    branchPnl,
    balanceSheet,
    cashFlow,
    cashBook,
    bankBook,
    gstSummary,
    expenseSummary,
    reconciliationCheck,
  };
}

export function computePreviewAccountLedger(params: {
  account: ChartOfAccount;
  journals: JournalEntry[];
  branchId?: string;
  fromDate?: string;
  toDate?: string;
}): AccountLedgerData {
  const { account, journals, branchId, fromDate, toDate } = params;
  const filterBranch = branchId && branchId !== 'ALL' ? branchId : null;
  const asc = [...journals]
    .filter((j) => !filterBranch || j.branchId === filterBranch)
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

  let openingPaise = 0;
  let runningPaise = 0;
  const entries: AccountLedgerData['entries'] = [];

  for (const e of asc) {
    if (toDate && e.transactionDate > toDate) continue;
    for (const l of e.lines) {
      if (l.accountId !== account.id) continue;
      if (filterBranch && l.branchId !== filterBranch) continue;
      const signed =
        account.normalBalance === 'DEBIT'
          ? l.debitPaise - l.creditPaise
          : l.creditPaise - l.debitPaise;
      runningPaise += signed;
      if (fromDate && e.transactionDate < fromDate) {
        openingPaise += signed;
      } else {
        entries.push({
          entryId: e.id,
          voucherNumber: e.voucherNumber,
          transactionDate: e.transactionDate,
          entryType: e.entryType,
          status: e.status,
          branchId: e.branchId,
          referenceNumber: e.referenceNumber,
          narration: e.narration,
          debit: l.debit,
          credit: l.credit,
          runningBalance: fromPaise(runningPaise),
        });
      }
    }
  }

  return {
    account,
    branchId: filterBranch || 'ALL',
    fromDate: fromDate || null,
    toDate: toDate || null,
    openingBalance: fromPaise(openingPaise),
    closingBalance: fromPaise(runningPaise),
    entries,
  };
}

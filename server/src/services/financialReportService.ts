import {
  AccountingService,
  AccountCategory,
  ChartOfAccountRecord,
  fromPaise,
  JournalEntryRecord,
  toPaise,
} from './accountingService';
import { BillingTransactionService } from './billingTransactionService';
import { CustomerService } from './customerService';
import { InventoryService } from './inventoryService';
import { ProcurementService } from './procurementService';
import { SupplierService } from './supplierService';
import { escapeCsvCell } from '../lib/csv';

export interface ReportFilterOptions {
  branchId?: string;
  fromDate?: string;
  toDate?: string;
  asOfDate?: string;
  accountId?: string;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  category: AccountCategory;
  normalBalance: 'DEBIT' | 'CREDIT';
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  netBalance: number;
}

export interface DiscrepancyException {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
  category:
    | 'UNBALANCED_JOURNAL'
    | 'DUPLICATE_POSTING'
    | 'MISSING_JOURNAL'
    | 'FAILED_OPERATION'
    | 'AR_KHATA_DRIFT'
    | 'AP_SUPPLIER_DRIFT'
    | 'INVENTORY_PTR_DRIFT';
  title: string;
  description: string;
  subledgerValue?: number;
  glValue?: number;
  difference?: number;
  referenceType?: string;
  referenceId?: string;
}

function normalizeDate(val?: string | null, fallback = '1970-01-01'): string {
  if (!val) return fallback;
  return val.trim().slice(0, 10);
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildSimplePdfBuffer(title: string, lines: string[]): Buffer {
  const safeLines = [title, '='.repeat(Math.min(72, Math.max(20, title.length))), '', ...lines].slice(0, 52);
  let y = 780;
  const contentParts: string[] = ['BT', '/F1 9 Tf'];
  for (const line of safeLines) {
    contentParts.push(`1 0 0 1 42 ${y} Tm (${escapePdfText(line.slice(0, 110))}) Tj`);
    y -= 13;
  }
  contentParts.push('ET');
  const streamContent = contentParts.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 842] /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

export class FinancialReportService {
  private static async loadLedgerContext(tenantId: string, branchId?: string) {
    const [accounts, allEntries] = await Promise.all([
      AccountingService.listAccounts(tenantId, { includeInactive: true }),
      AccountingService.listJournalEntries(tenantId, { limit: 20000 }),
    ]);

    const filterBranch = branchId && branchId !== 'ALL' ? branchId : null;
    const entries = filterBranch
      ? allEntries.filter(
          (e) => e.branchId === filterBranch || e.lines.some((l) => l.branchId === filterBranch)
        )
      : allEntries;

    return { accounts, entries, filterBranch };
  }

  private static extractLinesForBranch(entry: JournalEntryRecord, filterBranch: string | null) {
    if (!filterBranch) return entry.lines;
    return entry.lines.filter((l) => l.branchId === filterBranch);
  }

  // ==================== 1. TRIAL BALANCE ====================

  public static async getTrialBalance(tenantId: string, opts?: ReportFilterOptions) {
    const { accounts, entries, filterBranch } = await this.loadLedgerContext(tenantId, opts?.branchId);
    const fromDate = opts?.fromDate ? normalizeDate(opts.fromDate) : null;
    const toDate = opts?.toDate ? normalizeDate(opts.toDate) : null;

    const accStats = new Map<
      string,
      { opDr: number; opCr: number; perDr: number; perCr: number }
    >();
    accounts.forEach((a) => accStats.set(a.id, { opDr: 0, opCr: 0, perDr: 0, perCr: 0 }));

    for (const entry of entries) {
      if (toDate && entry.transactionDate > toDate) continue;
      const isOpening = Boolean(fromDate && entry.transactionDate < fromDate);
      for (const line of this.extractLinesForBranch(entry, filterBranch)) {
        const s = accStats.get(line.accountId) || { opDr: 0, opCr: 0, perDr: 0, perCr: 0 };
        if (isOpening) {
          s.opDr += line.debitPaise;
          s.opCr += line.creditPaise;
        } else {
          s.perDr += line.debitPaise;
          s.perCr += line.creditPaise;
        }
        accStats.set(line.accountId, s);
      }
    }

    const rows: TrialBalanceRow[] = [];
    let totalOpeningDebitPaise = 0;
    let totalOpeningCreditPaise = 0;
    let totalPeriodDebitPaise = 0;
    let totalPeriodCreditPaise = 0;
    let totalClosingDebitPaise = 0;
    let totalClosingCreditPaise = 0;

    for (const acc of accounts) {
      const s = accStats.get(acc.id)!;
      const opNet = s.opDr - s.opCr;
      const openingDebitPaise = opNet > 0 ? opNet : 0;
      const openingCreditPaise = opNet < 0 ? Math.abs(opNet) : 0;

      const closeNet = s.opDr + s.perDr - (s.opCr + s.perCr);
      const closingDebitPaise = closeNet > 0 ? closeNet : 0;
      const closingCreditPaise = closeNet < 0 ? Math.abs(closeNet) : 0;

      if (
        openingDebitPaise === 0 &&
        openingCreditPaise === 0 &&
        s.perDr === 0 &&
        s.perCr === 0 &&
        closingDebitPaise === 0 &&
        closingCreditPaise === 0
      ) {
        continue;
      }

      totalOpeningDebitPaise += openingDebitPaise;
      totalOpeningCreditPaise += openingCreditPaise;
      totalPeriodDebitPaise += s.perDr;
      totalPeriodCreditPaise += s.perCr;
      totalClosingDebitPaise += closingDebitPaise;
      totalClosingCreditPaise += closingCreditPaise;

      const naturalBalance =
        acc.normalBalance === 'DEBIT'
          ? fromPaise(s.opDr + s.perDr - (s.opCr + s.perCr))
          : fromPaise(s.opCr + s.perCr - (s.opDr + s.perDr));

      rows.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        category: acc.category,
        normalBalance: acc.normalBalance,
        openingDebit: fromPaise(openingDebitPaise),
        openingCredit: fromPaise(openingCreditPaise),
        periodDebit: fromPaise(s.perDr),
        periodCredit: fromPaise(s.perCr),
        closingDebit: fromPaise(closingDebitPaise),
        closingCredit: fromPaise(closingCreditPaise),
        netBalance: naturalBalance,
      });
    }

    return {
      branchId: filterBranch || 'ALL',
      fromDate,
      toDate,
      rows,
      totals: {
        openingDebit: fromPaise(totalOpeningDebitPaise),
        openingCredit: fromPaise(totalOpeningCreditPaise),
        periodDebit: fromPaise(totalPeriodDebitPaise),
        periodCredit: fromPaise(totalPeriodCreditPaise),
        closingDebit: fromPaise(totalClosingDebitPaise),
        closingCredit: fromPaise(totalClosingCreditPaise),
        isBalanced:
          totalClosingDebitPaise === totalClosingCreditPaise &&
          totalPeriodDebitPaise === totalPeriodCreditPaise,
      },
    };
  }

  // ==================== 2. PROFIT & LOSS (INCOME STATEMENT) ====================

  public static async getProfitAndLoss(tenantId: string, opts?: ReportFilterOptions) {
    const { accounts, entries, filterBranch } = await this.loadLedgerContext(tenantId, opts?.branchId);
    const fromDate = opts?.fromDate ? normalizeDate(opts.fromDate) : null;
    const toDate = opts?.toDate ? normalizeDate(opts.toDate) : null;

    const netByAccount = new Map<string, number>();
    for (const entry of entries) {
      if (fromDate && entry.transactionDate < fromDate) continue;
      if (toDate && entry.transactionDate > toDate) continue;
      for (const line of this.extractLinesForBranch(entry, filterBranch)) {
        if (line.accountCategory === 'INCOME') {
          // Income natural credit
          netByAccount.set(
            line.accountId,
            (netByAccount.get(line.accountId) || 0) + (line.creditPaise - line.debitPaise)
          );
        } else if (line.accountCategory === 'EXPENSES') {
          // Expense natural debit
          netByAccount.set(
            line.accountId,
            (netByAccount.get(line.accountId) || 0) + (line.debitPaise - line.creditPaise)
          );
        }
      }
    }

    const incomeItems: Array<{ accountId: string; code: string; name: string; subType: string; amount: number }> = [];
    const cogsItems: Array<{ accountId: string; code: string; name: string; subType: string; amount: number }> = [];
    const operatingExpenseItems: Array<{ accountId: string; code: string; name: string; subType: string; amount: number }> = [];

    let netSalesPaise = 0;
    let totalIncomePaise = 0;
    let totalCogsPaise = 0;
    let totalOperatingExpensePaise = 0;

    for (const acc of accounts) {
      const paise = netByAccount.get(acc.id) || 0;
      if (paise === 0) continue;
      if (acc.category === 'INCOME') {
        totalIncomePaise += paise;
        if (acc.subType === 'OPERATING_REVENUE' || acc.subType === 'CONTRA_REVENUE') {
          netSalesPaise += paise;
        }
        incomeItems.push({ accountId: acc.id, code: acc.code, name: acc.name, subType: acc.subType, amount: fromPaise(paise) });
      } else if (acc.category === 'EXPENSES') {
        if (acc.subType === 'COGS') {
          totalCogsPaise += paise;
          cogsItems.push({ accountId: acc.id, code: acc.code, name: acc.name, subType: acc.subType, amount: fromPaise(paise) });
        } else {
          totalOperatingExpensePaise += paise;
          operatingExpenseItems.push({ accountId: acc.id, code: acc.code, name: acc.name, subType: acc.subType, amount: fromPaise(paise) });
        }
      }
    }

    const grossProfitPaise = netSalesPaise - totalCogsPaise;
    const otherIncomePaise = totalIncomePaise - netSalesPaise;
    const netProfitPaise = grossProfitPaise + otherIncomePaise - totalOperatingExpensePaise;
    const grossMarginPercent =
      netSalesPaise > 0 ? Number(((grossProfitPaise / netSalesPaise) * 100).toFixed(2)) : 0;

    return {
      branchId: filterBranch || 'ALL',
      fromDate,
      toDate,
      incomeItems,
      cogsItems,
      operatingExpenseItems,
      summary: {
        netSales: fromPaise(netSalesPaise),
        otherIncome: fromPaise(otherIncomePaise),
        totalIncome: fromPaise(totalIncomePaise),
        totalCogs: fromPaise(totalCogsPaise),
        grossProfit: fromPaise(grossProfitPaise),
        grossMarginPercent,
        totalOperatingExpenses: fromPaise(totalOperatingExpensePaise),
        totalExpenses: fromPaise(totalCogsPaise + totalOperatingExpensePaise),
        netProfit: fromPaise(netProfitPaise),
      },
    };
  }

  // ==================== 3. BRANCH-WISE PROFITABILITY ====================

  public static async getBranchWiseProfitAndLoss(tenantId: string, opts?: ReportFilterOptions) {
    const { entries } = await this.loadLedgerContext(tenantId);
    const branchIds = new Set<string>();
    entries.forEach((e) => {
      branchIds.add(e.branchId || 'main');
      e.lines.forEach((l) => branchIds.add(l.branchId || 'main'));
    });
    if (branchIds.size === 0) branchIds.add('main');

    const branches = await Promise.all(
      Array.from(branchIds)
        .sort()
        .map(async (bId) => {
          const pnl = await this.getProfitAndLoss(tenantId, { ...opts, branchId: bId });
          return {
            branchId: bId,
            netSales: pnl.summary.netSales,
            totalCogs: pnl.summary.totalCogs,
            grossProfit: pnl.summary.grossProfit,
            operatingExpenses: pnl.summary.totalOperatingExpenses,
            netProfit: pnl.summary.netProfit,
          };
        })
    );
    return { fromDate: opts?.fromDate || null, toDate: opts?.toDate || null, branches };
  }

  // ==================== 4. BALANCE SHEET ====================

  public static async getBalanceSheet(tenantId: string, opts?: ReportFilterOptions) {
    const asOfDate = opts?.asOfDate ? normalizeDate(opts.asOfDate) : normalizeDate(opts?.toDate, '2099-12-31');
    const { accounts, entries, filterBranch } = await this.loadLedgerContext(tenantId, opts?.branchId);

    const netByAccount = new Map<string, number>();
    let netProfitPaise = 0;

    for (const entry of entries) {
      if (entry.transactionDate > asOfDate) continue;
      for (const line of this.extractLinesForBranch(entry, filterBranch)) {
        if (line.accountCategory === 'ASSETS') {
          netByAccount.set(line.accountId, (netByAccount.get(line.accountId) || 0) + (line.debitPaise - line.creditPaise));
        } else if (line.accountCategory === 'LIABILITIES' || line.accountCategory === 'EQUITY') {
          netByAccount.set(line.accountId, (netByAccount.get(line.accountId) || 0) + (line.creditPaise - line.debitPaise));
        } else if (line.accountCategory === 'INCOME') {
          netProfitPaise += line.creditPaise - line.debitPaise;
        } else if (line.accountCategory === 'EXPENSES') {
          netProfitPaise -= line.debitPaise - line.creditPaise;
        }
      }
    }

    const mapGroup = (category: AccountCategory) => {
      const items: Array<{ accountId: string; code: string; name: string; subType: string; balance: number }> = [];
      let totalPaise = 0;
      for (const acc of accounts) {
        if (acc.category !== category) continue;
        const p = netByAccount.get(acc.id) || 0;
        if (p === 0) continue;
        totalPaise += p;
        items.push({ accountId: acc.id, code: acc.code, name: acc.name, subType: acc.subType, balance: fromPaise(p) });
      }
      return { items, totalPaise };
    };

    const assets = mapGroup('ASSETS');
    const liabilities = mapGroup('LIABILITIES');
    const equity = mapGroup('EQUITY');

    if (netProfitPaise !== 0 || equity.items.length === 0) {
      equity.items.push({
        accountId: 'current_period_net_profit',
        code: '3999',
        name: 'Current Period Net Profit / (Loss)',
        subType: 'CURRENT_EARNINGS',
        balance: fromPaise(netProfitPaise),
      });
      equity.totalPaise += netProfitPaise;
    }

    const totalAssetsPaise = assets.totalPaise;
    const totalLiabilitiesAndEquityPaise = liabilities.totalPaise + equity.totalPaise;

    return {
      branchId: filterBranch || 'ALL',
      asOfDate: asOfDate === '2099-12-31' ? new Date().toISOString().slice(0, 10) : asOfDate,
      assets: { items: assets.items, total: fromPaise(totalAssetsPaise) },
      liabilities: { items: liabilities.items, total: fromPaise(liabilities.totalPaise) },
      equity: { items: equity.items, total: fromPaise(equity.totalPaise) },
      totals: {
        totalAssets: fromPaise(totalAssetsPaise),
        totalLiabilities: fromPaise(liabilities.totalPaise),
        totalEquity: fromPaise(equity.totalPaise),
        totalLiabilitiesAndEquity: fromPaise(totalLiabilitiesAndEquityPaise),
        difference: fromPaise(totalAssetsPaise - totalLiabilitiesAndEquityPaise),
        isBalanced: totalAssetsPaise === totalLiabilitiesAndEquityPaise,
      },
    };
  }

  // ==================== 5. CASH FLOW STATEMENT ====================

  public static async getCashFlowStatement(tenantId: string, opts?: ReportFilterOptions) {
    const { accounts, entries, filterBranch } = await this.loadLedgerContext(tenantId, opts?.branchId);
    const fromDate = opts?.fromDate ? normalizeDate(opts.fromDate) : '1900-01-01';
    const toDate = opts?.toDate ? normalizeDate(opts.toDate) : '2099-12-31';

    const liquidIds = new Set(
      accounts
        .filter((a) => a.category === 'ASSETS' && ['CASH', 'BANK', 'CLEARING'].includes(a.subType))
        .map((a) => a.id)
    );

    let openingLiquidPaise = 0;
    let operatingCashInPaise = 0;
    let operatingCashOutPaise = 0;
    let financingInPaise = 0;
    let financingOutPaise = 0;
    let transfersInternalPaise = 0;

    for (const entry of entries) {
      const lines = this.extractLinesForBranch(entry, filterBranch);
      const entryLiquidDeltaPaise = lines
        .filter((l) => liquidIds.has(l.accountId))
        .reduce((sum, l) => sum + (l.debitPaise - l.creditPaise), 0);

      if (entry.transactionDate < fromDate) {
        openingLiquidPaise += entryLiquidDeltaPaise;
        continue;
      }
      if (entry.transactionDate > toDate) continue;
      if (entryLiquidDeltaPaise === 0) {
        if (entry.entryType === 'INTERNAL_TRANSFER') {
          transfersInternalPaise += entry.debitTotalPaise;
        }
        continue;
      }

      const isEquityFinancing = entry.lines.some((l) => l.accountCode === '3100');
      if (isEquityFinancing) {
        if (entryLiquidDeltaPaise > 0) financingInPaise += entryLiquidDeltaPaise;
        else financingOutPaise += Math.abs(entryLiquidDeltaPaise);
      } else {
        if (entryLiquidDeltaPaise > 0) operatingCashInPaise += entryLiquidDeltaPaise;
        else operatingCashOutPaise += Math.abs(entryLiquidDeltaPaise);
      }
    }

    const netOperatingPaise = operatingCashInPaise - operatingCashOutPaise;
    const netFinancingPaise = financingInPaise - financingOutPaise;
    const netChangePaise = netOperatingPaise + netFinancingPaise;
    const closingLiquidPaise = openingLiquidPaise + netChangePaise;

    return {
      branchId: filterBranch || 'ALL',
      fromDate: opts?.fromDate || null,
      toDate: opts?.toDate || null,
      openingCashAndBankBalance: fromPaise(openingLiquidPaise),
      operatingActivities: {
        cashInflows: fromPaise(operatingCashInPaise),
        cashOutflows: fromPaise(operatingCashOutPaise),
        netOperatingCashFlow: fromPaise(netOperatingPaise),
      },
      financingActivities: {
        capitalInflows: fromPaise(financingInPaise),
        capitalOutflows: fromPaise(financingOutPaise),
        netFinancingCashFlow: fromPaise(netFinancingPaise),
      },
      internalTransfersVolume: fromPaise(transfersInternalPaise),
      netIncreaseInCashAndBank: fromPaise(netChangePaise),
      closingCashAndBankBalance: fromPaise(closingLiquidPaise),
    };
  }

  // ==================== 6. GENERAL LEDGER, ACCOUNT LEDGER & BOOKS ====================

  public static async getAccountLedger(tenantId: string, accountId: string, opts?: ReportFilterOptions) {
    const account = await AccountingService.getAccountById(tenantId, accountId);
    const { entries, filterBranch } = await this.loadLedgerContext(tenantId, opts?.branchId);
    const fromDate = opts?.fromDate ? normalizeDate(opts.fromDate) : null;
    const toDate = opts?.toDate ? normalizeDate(opts.toDate) : null;

    const sorted = [...entries].sort((a, b) => {
      const d = a.transactionDate.localeCompare(b.transactionDate);
      return d !== 0 ? d : a.createdAt.localeCompare(b.createdAt);
    });

    let runningPaise = 0;
    let openingBalancePaise = 0;
    const rows: Array<{
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
    }> = [];

    for (const entry of sorted) {
      if (toDate && entry.transactionDate > toDate) continue;
      for (const line of this.extractLinesForBranch(entry, filterBranch)) {
        if (line.accountId !== accountId) continue;
        const delta =
          account.normalBalance === 'DEBIT'
            ? line.debitPaise - line.creditPaise
            : line.creditPaise - line.debitPaise;
        runningPaise += delta;
        if (fromDate && entry.transactionDate < fromDate) {
          openingBalancePaise += delta;
        } else {
          rows.push({
            entryId: entry.id,
            voucherNumber: entry.voucherNumber,
            transactionDate: entry.transactionDate,
            entryType: entry.entryType,
            status: entry.status,
            branchId: line.branchId,
            referenceNumber: entry.referenceNumber,
            narration: line.description || entry.narration,
            debit: line.debit,
            credit: line.credit,
            runningBalance: fromPaise(runningPaise),
          });
        }
      }
    }

    return {
      account,
      branchId: filterBranch || 'ALL',
      fromDate,
      toDate,
      openingBalance: fromPaise(openingBalancePaise),
      closingBalance: fromPaise(runningPaise),
      entries: rows,
    };
  }

  public static async getGeneralLedgerOrDayBook(tenantId: string, opts?: ReportFilterOptions) {
    const entries = await AccountingService.listJournalEntries(tenantId, {
      branchId: opts?.branchId,
      fromDate: opts?.fromDate,
      toDate: opts?.toDate,
      accountId: opts?.accountId,
      limit: 5000,
    });
    const totalDebitPaise = entries.reduce((s, e) => s + e.debitTotalPaise, 0);
    const totalCreditPaise = entries.reduce((s, e) => s + e.creditTotalPaise, 0);
    return {
      branchId: opts?.branchId || 'ALL',
      fromDate: opts?.fromDate || null,
      toDate: opts?.toDate || null,
      count: entries.length,
      totalDebit: fromPaise(totalDebitPaise),
      totalCredit: fromPaise(totalCreditPaise),
      entries,
    };
  }

  public static async getCashOrBankBook(
    tenantId: string,
    bookType: 'CASH' | 'BANK',
    opts?: ReportFilterOptions
  ) {
    const accounts = await AccountingService.listAccounts(tenantId, { includeInactive: true });
    const targetSubTypes = bookType === 'CASH' ? ['CASH'] : ['BANK', 'CLEARING'];
    const targetIds = new Set(
      accounts.filter((a) => a.category === 'ASSETS' && targetSubTypes.includes(a.subType)).map((a) => a.id)
    );

    const { entries, filterBranch } = await this.loadLedgerContext(tenantId, opts?.branchId);
    const fromDate = opts?.fromDate ? normalizeDate(opts.fromDate) : null;
    const toDate = opts?.toDate ? normalizeDate(opts.toDate) : null;

    const sorted = [...entries].sort((a, b) => {
      const d = a.transactionDate.localeCompare(b.transactionDate);
      return d !== 0 ? d : a.createdAt.localeCompare(b.createdAt);
    });

    let runningPaise = 0;
    let openingPaise = 0;
    const rows: Array<{
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
    }> = [];

    for (const entry of sorted) {
      if (toDate && entry.transactionDate > toDate) continue;
      for (const line of this.extractLinesForBranch(entry, filterBranch)) {
        if (!targetIds.has(line.accountId)) continue;
        const delta = line.debitPaise - line.creditPaise;
        runningPaise += delta;
        if (fromDate && entry.transactionDate < fromDate) {
          openingPaise += delta;
        } else {
          rows.push({
            entryId: entry.id,
            voucherNumber: entry.voucherNumber,
            transactionDate: entry.transactionDate,
            entryType: entry.entryType,
            status: entry.status,
            accountCode: line.accountCode,
            accountName: line.accountName,
            narration: entry.narration,
            receipt: line.debit,
            payment: line.credit,
            balance: fromPaise(runningPaise),
          });
        }
      }
    }

    return {
      bookType,
      branchId: filterBranch || 'ALL',
      fromDate,
      toDate,
      openingBalance: fromPaise(openingPaise),
      closingBalance: fromPaise(runningPaise),
      totalReceipts: fromPaise(rows.reduce((s, r) => s + toPaise(r.receipt), 0)),
      totalPayments: fromPaise(rows.reduce((s, r) => s + toPaise(r.payment), 0)),
      rows,
    };
  }

  // ==================== 7. GST ACCOUNTING SUMMARY ====================

  public static async getGstSummary(tenantId: string, opts?: ReportFilterOptions) {
    const { entries, filterBranch } = await this.loadLedgerContext(tenantId, opts?.branchId);
    const fromDate = opts?.fromDate ? normalizeDate(opts.fromDate) : null;
    const toDate = opts?.toDate ? normalizeDate(opts.toDate) : null;

    let outputCgstPaise = 0;
    let outputSgstPaise = 0;
    let outputIgstPaise = 0;
    let inputCgstPaise = 0;
    let inputSgstPaise = 0;
    let inputIgstPaise = 0;
    let salesReturnTaxReversedPaise = 0;
    let purchaseReturnItcReversedPaise = 0;

    for (const entry of entries) {
      if (fromDate && entry.transactionDate < fromDate) continue;
      if (toDate && entry.transactionDate > toDate) continue;
      for (const line of this.extractLinesForBranch(entry, filterBranch)) {
        if (line.accountCode === '2210') {
          outputCgstPaise += line.creditPaise - line.debitPaise;
          if (entry.entryType === 'SALES_RETURN' || entry.entryType === 'INVOICE_CANCELLATION') {
            salesReturnTaxReversedPaise += line.debitPaise - line.creditPaise;
          }
        } else if (line.accountCode === '2220') {
          outputSgstPaise += line.creditPaise - line.debitPaise;
          if (entry.entryType === 'SALES_RETURN' || entry.entryType === 'INVOICE_CANCELLATION') {
            salesReturnTaxReversedPaise += line.debitPaise - line.creditPaise;
          }
        } else if (line.accountCode === '2230') {
          outputIgstPaise += line.creditPaise - line.debitPaise;
          if (entry.entryType === 'SALES_RETURN' || entry.entryType === 'INVOICE_CANCELLATION') {
            salesReturnTaxReversedPaise += line.debitPaise - line.creditPaise;
          }
        } else if (line.accountCode === '1510') {
          inputCgstPaise += line.debitPaise - line.creditPaise;
          if (entry.entryType === 'SUPPLIER_RETURN') purchaseReturnItcReversedPaise += line.creditPaise - line.debitPaise;
        } else if (line.accountCode === '1520') {
          inputSgstPaise += line.debitPaise - line.creditPaise;
          if (entry.entryType === 'SUPPLIER_RETURN') purchaseReturnItcReversedPaise += line.creditPaise - line.debitPaise;
        } else if (line.accountCode === '1530') {
          inputIgstPaise += line.debitPaise - line.creditPaise;
          if (entry.entryType === 'SUPPLIER_RETURN') purchaseReturnItcReversedPaise += line.creditPaise - line.debitPaise;
        }
      }
    }

    // Also compute zero-rated/exempt sales from sales_invoices across pages
    let zeroRatedSalesPaise = 0;
    let totalTaxableSalesPaise = 0;
    let invPage = 1;
    while (true) {
      const invRes = await BillingTransactionService.listInvoices(tenantId, {
        branchId: filterBranch || undefined,
        page: invPage,
        limit: 100,
      });
      for (const inv of invRes.invoices) {
        if (inv.status === 'cancelled') continue;
        const d = inv.createdAt.slice(0, 10);
        if (fromDate && d < fromDate) continue;
        if (toDate && d > toDate) continue;
        totalTaxableSalesPaise += toPaise(inv.taxableAmount);
        for (const item of inv.items) {
          if ((item.gstRate || 0) === 0) {
            zeroRatedSalesPaise += toPaise(item.lineTaxable);
          }
        }
      }
      if (invPage >= invRes.totalPages) break;
      invPage += 1;
    }

    const totalOutputGstPaise = outputCgstPaise + outputSgstPaise + outputIgstPaise;
    const totalInputItcPaise = inputCgstPaise + inputSgstPaise + inputIgstPaise;
    const netGstPayablePaise = totalOutputGstPaise - totalInputItcPaise;

    return {
      branchId: filterBranch || 'ALL',
      fromDate,
      toDate,
      disclaimer:
        'Internal accounting GST register derived from posted double-entry journals. Verify with your Chartered Accountant before filing GSTR-1 / GSTR-3B on the GSTN portal.',
      outputTax: {
        cgst: fromPaise(outputCgstPaise),
        sgst: fromPaise(outputSgstPaise),
        igst: fromPaise(outputIgstPaise),
        totalOutputGst: fromPaise(totalOutputGstPaise),
        salesReturnsTaxAdjustment: fromPaise(salesReturnTaxReversedPaise),
      },
      inputTaxCredit: {
        cgst: fromPaise(inputCgstPaise),
        sgst: fromPaise(inputSgstPaise),
        igst: fromPaise(inputIgstPaise),
        totalEligibleItc: fromPaise(totalInputItcPaise),
        purchaseReturnItcReversal: fromPaise(purchaseReturnItcReversedPaise),
      },
      taxableSalesTotal: fromPaise(totalTaxableSalesPaise),
      zeroRatedAndExemptSales: fromPaise(zeroRatedSalesPaise),
      netGstPayable: fromPaise(netGstPayablePaise),
      netPosition: netGstPayablePaise >= 0 ? 'PAYABLE' : 'ITC_CARRY_FORWARD',
    };
  }

  // ==================== 8. EXPENSE, RECEIVABLES, PAYABLES & OVERVIEW SUMMARIES ====================

  public static async getExpenseSummary(tenantId: string, opts?: ReportFilterOptions) {
    const expenses = await AccountingService.listExpenses(tenantId, {
      branchId: opts?.branchId,
      fromDate: opts?.fromDate,
      toDate: opts?.toDate,
    });
    const active = expenses.filter((e) => e.status !== 'REVERSED' && e.status !== 'REJECTED');
    const byCategory = new Map<string, { code: string; name: string; count: number; totalPaise: number; paidPaise: number }>();

    let totalPaise = 0;
    let paidPaise = 0;
    let unpaidPaise = 0;
    for (const e of active) {
      const t = toPaise(e.totalAmount);
      const p = toPaise(e.paidAmount);
      totalPaise += t;
      paidPaise += p;
      unpaidPaise += toPaise(e.outstandingAmount);
      const cur = byCategory.get(e.categoryAccountId) || {
        code: e.categoryAccountCode,
        name: e.categoryAccountName,
        count: 0,
        totalPaise: 0,
        paidPaise: 0,
      };
      cur.count += 1;
      cur.totalPaise += t;
      cur.paidPaise += p;
      byCategory.set(e.categoryAccountId, cur);
    }

    return {
      branchId: opts?.branchId || 'ALL',
      fromDate: opts?.fromDate || null,
      toDate: opts?.toDate || null,
      totalExpenseCount: active.length,
      totalExpenseAmount: fromPaise(totalPaise),
      totalPaidAmount: fromPaise(paidPaise),
      totalUnpaidAccrued: fromPaise(unpaidPaise),
      byCategory: Array.from(byCategory.values()).map((c) => ({
        code: c.code,
        name: c.name,
        count: c.count,
        total: fromPaise(c.totalPaise),
        paid: fromPaise(c.paidPaise),
      })),
    };
  }

  public static async getOverviewMetrics(tenantId: string, opts?: ReportFilterOptions) {
    const [pnl, bs, gst, cashBook, bankBook, expSummary, periods, recon] = await Promise.all([
      this.getProfitAndLoss(tenantId, opts),
      this.getBalanceSheet(tenantId, opts),
      this.getGstSummary(tenantId, opts),
      this.getCashOrBankBook(tenantId, 'CASH', opts),
      this.getCashOrBankBook(tenantId, 'BANK', opts),
      this.getExpenseSummary(tenantId, opts),
      AccountingService.listFinancialPeriods(tenantId),
      this.runReconciliationCheck(tenantId),
    ]);

    const arItem = bs.assets.items.find((i) => i.code === '1300');
    const apItem = bs.liabilities.items.find((i) => i.code === '2100');
    const invItem = bs.assets.items.find((i) => i.code === '1400');

    return {
      netSales: pnl.summary.netSales,
      grossProfit: pnl.summary.grossProfit,
      grossMarginPercent: pnl.summary.grossMarginPercent,
      netProfit: pnl.summary.netProfit,
      totalOperatingExpenses: pnl.summary.totalOperatingExpenses,
      unpaidAccruedExpenses: expSummary.totalUnpaidAccrued,
      cashInHandBalance: cashBook.closingBalance,
      bankAndClearingBalance: bankBook.closingBalance,
      accountsReceivable: arItem?.balance || 0,
      accountsPayable: apItem?.balance || 0,
      inventoryGlValue: invItem?.balance || 0,
      netGstPayable: gst.netGstPayable,
      gstNetPosition: gst.netPosition,
      balanceSheetBalanced: bs.totals.isBalanced,
      openPeriodsCount: periods.filter((p) => p.status === 'OPEN').length,
      closedPeriodsCount: periods.filter((p) => p.status === 'CLOSED').length,
      reconciliationExceptionCount: recon.exceptionCount,
    };
  }

  // ==================== 9. RECONCILIATION & DISCREPANCY DETECTOR ====================

  public static async runReconciliationCheck(tenantId: string) {
    const loadAllInvoices = async () => {
      const all = [];
      let page = 1;
      while (true) {
        const res = await BillingTransactionService.listInvoices(tenantId, { page, limit: 100 });
        all.push(...res.invoices);
        if (page >= res.totalPages) break;
        page += 1;
      }
      return all;
    };
    const loadAllCustomers = async () => {
      const all = [];
      let page = 1;
      while (true) {
        const res = await CustomerService.listCustomers(tenantId, { page, limit: 100 });
        all.push(...res.customers);
        if (page >= res.totalPages) break;
        page += 1;
      }
      return all;
    };
    const loadAllSuppliers = async () => {
      const all = [];
      let page = 1;
      while (true) {
        const res = await SupplierService.listSuppliers(tenantId, { page, limit: 100 });
        all.push(...res.suppliers);
        if (page >= res.totalPages) break;
        page += 1;
      }
      return all;
    };
    const loadAllBatches = async () => {
      const all = [];
      let page = 1;
      while (true) {
        const res = await InventoryService.listBatches(tenantId, { page, limit: 100 });
        all.push(...res.batches);
        if (page >= res.totalPages) break;
        page += 1;
      }
      return all;
    };
    const loadAllGrns = async () => {
      const all = [];
      let page = 1;
      while (true) {
        const res = await ProcurementService.listGrns(tenantId, undefined, { page, limit: 100 });
        all.push(...res.goodsReceipts);
        if (page >= res.totalPages) break;
        page += 1;
      }
      return all;
    };
    const loadAllSupplierInvoices = async () => {
      const all = [];
      let page = 1;
      while (true) {
        const res = await ProcurementService.listSupplierInvoices(tenantId, undefined, { page, limit: 100 });
        all.push(...res.invoices);
        if (page >= res.totalPages) break;
        page += 1;
      }
      return all;
    };

    const [accounts, entries, ops, invoices, grns, customers, suppliers, batches, supplierInvoices] =
      await Promise.all([
        AccountingService.listAccounts(tenantId, { includeInactive: true }),
        AccountingService.listJournalEntries(tenantId, { limit: 20000 }),
        AccountingService.listAccountingOperations(tenantId),
        loadAllInvoices(),
        loadAllGrns(),
        loadAllCustomers(),
        loadAllSuppliers(),
        loadAllBatches(),
        loadAllSupplierInvoices(),
      ]);

    const exceptions: DiscrepancyException[] = [];

    // 1. Check unbalanced journals
    for (const e of entries) {
      if (e.debitTotalPaise !== e.creditTotalPaise || e.debitTotalPaise <= 0) {
        exceptions.push({
          id: `unbal_${e.id}`,
          severity: 'CRITICAL',
          category: 'UNBALANCED_JOURNAL',
          title: `Unbalanced Journal Voucher ${e.voucherNumber}`,
          description: `Debit ₹${e.debitTotal.toFixed(2)} != Credit ₹${e.creditTotal.toFixed(2)}`,
          difference: fromPaise(e.debitTotalPaise - e.creditTotalPaise),
          referenceType: 'journal_entry',
          referenceId: e.id,
        });
      }
    }

    // 2. Duplicate active journal postings for same source reference
    const activeRefKeys = new Map<string, number>();
    for (const e of entries) {
      if (e.status !== 'POSTED') continue;
      if (e.entryType === 'REVERSAL') continue;
      const k = `${e.entryType}::${e.referenceType}::${e.referenceId}`;
      activeRefKeys.set(k, (activeRefKeys.get(k) || 0) + 1);
    }
    for (const [k, count] of activeRefKeys.entries()) {
      if (count > 1) {
        exceptions.push({
          id: `dup_${k}`,
          severity: 'HIGH',
          category: 'DUPLICATE_POSTING',
          title: `Duplicate Journal Posting Detected`,
          description: `Reference '${k}' has ${count} active posted journal entries.`,
        });
      }
    }

    // 3. Failed accounting operations
    for (const op of ops) {
      if (op.status === 'FAILED') {
        exceptions.push({
          id: `op_${op.id}`,
          severity: 'HIGH',
          category: 'FAILED_OPERATION',
          title: `Failed Accounting Integration (${op.operationType})`,
          description: op.errorMessage || `Operation for ${op.referenceType} ${op.referenceId} failed.`,
          referenceType: op.referenceType,
          referenceId: op.referenceId,
        });
      }
    }

    // 4. Missing sales invoice journals
    const postedSalesRefs = new Set(
      entries.filter((e) => e.referenceType === 'sales_invoice').map((e) => e.referenceId)
    );
    for (const inv of invoices) {
      if (inv.grandTotal > 0 && !postedSalesRefs.has(inv.id)) {
        exceptions.push({
          id: `miss_inv_${inv.id}`,
          severity: 'MEDIUM',
          category: 'MISSING_JOURNAL',
          title: `Missing GL Entry for Sales Invoice ${inv.invoiceNumber}`,
          description: `Invoice total ₹${inv.grandTotal.toFixed(2)} has not been posted to General Ledger yet. Run historical backfill to synchronize.`,
          subledgerValue: inv.grandTotal,
          glValue: 0,
          difference: inv.grandTotal,
          referenceType: 'sales_invoice',
          referenceId: inv.id,
        });
      }
    }

    // 5. Missing GRN journals
    const postedGrnRefs = new Set(entries.filter((e) => e.referenceType === 'grn').map((e) => e.referenceId));
    for (const grn of grns) {
      if (grn.status !== 'DRAFT' && grn.grandTotal > 0 && !postedGrnRefs.has(grn.id)) {
        exceptions.push({
          id: `miss_grn_${grn.id}`,
          severity: 'MEDIUM',
          category: 'MISSING_JOURNAL',
          title: `Missing GL Entry for GRN ${grn.grnNumber}`,
          description: `GRN total ₹${grn.grandTotal.toFixed(2)} has not been posted to General Ledger yet.`,
          subledgerValue: grn.grandTotal,
          glValue: 0,
          difference: grn.grandTotal,
          referenceType: 'grn',
          referenceId: grn.id,
        });
      }
    }

    // 6. Control Account Reconciliation: AR GL (1300) vs Phase 7 Customers Khata
    const arAcc = accounts.find((a) => a.code === '1300');
    const apAcc = accounts.find((a) => a.code === '2100');
    const invAcc = accounts.find((a) => a.code === '1400');

    const glNetPaise = (acc?: ChartOfAccountRecord) => {
      if (!acc) return 0;
      let net = 0;
      for (const e of entries) {
        for (const l of e.lines) {
          if (l.accountId === acc.id) {
            net += acc.normalBalance === 'DEBIT' ? l.debitPaise - l.creditPaise : l.creditPaise - l.debitPaise;
          }
        }
      }
      return net;
    };

    const arGlPaise = glNetPaise(arAcc);
    const customerKhataSubledgerPaise = customers.reduce(
      (s, c) => s + toPaise(c.currentOutstandingBalance),
      0
    );
    const arDiffPaise = Math.abs(customerKhataSubledgerPaise - arGlPaise);
    if (arDiffPaise > 100) {
      exceptions.push({
        id: 'ar_khata_drift',
        severity: 'MEDIUM',
        category: 'AR_KHATA_DRIFT',
        title: 'Accounts Receivable GL vs Customer Khata Subledger Variance',
        description: `Customer Khata balances total ₹${fromPaise(customerKhataSubledgerPaise).toFixed(2)} vs GL 1300 balance ₹${fromPaise(arGlPaise).toFixed(2)}.`,
        subledgerValue: fromPaise(customerKhataSubledgerPaise),
        glValue: fromPaise(arGlPaise),
        difference: fromPaise(customerKhataSubledgerPaise - arGlPaise),
      });
    }

    // 7. Control Account Reconciliation: AP GL (2100) vs Phase 8 Supplier Payables
    const apGlPaise = glNetPaise(apAcc);
    const supplierPayablesSubledgerPaise = suppliers.reduce(
      (s, sup) => s + toPaise(sup.currentOutstandingBalance || 0),
      0
    );
    const openSinvsPaise = supplierInvoices
      .filter((i) => i.paymentStatus !== 'REVERSED')
      .reduce((s, i) => s + toPaise(i.outstandingAmount), 0);
    const apDiffPaise = Math.abs(supplierPayablesSubledgerPaise - apGlPaise);
    if (apDiffPaise > 100) {
      exceptions.push({
        id: 'ap_supplier_drift',
        severity: 'MEDIUM',
        category: 'AP_SUPPLIER_DRIFT',
        title: 'Accounts Payable GL vs Supplier Payables Variance',
        description: `Supplier payables total ₹${fromPaise(supplierPayablesSubledgerPaise).toFixed(2)} vs GL 2100 balance ₹${fromPaise(apGlPaise).toFixed(2)}.`,
        subledgerValue: fromPaise(supplierPayablesSubledgerPaise),
        glValue: fromPaise(apGlPaise),
        difference: fromPaise(supplierPayablesSubledgerPaise - apGlPaise),
      });
    }

    // 8. Control Account Reconciliation: Inventory GL (1400) vs Batch PTR Stock Valuation
    const invGlPaise = glNetPaise(invAcc);
    const transitAcc = accounts.find((a) => a.systemCode === 'STOCK_IN_TRANSIT');
    const stockInTransitGlPaise = glNetPaise(transitAcc);
    const inventorySubledgerPaise = batches.reduce(
      (s, b) => s + (b.currentStock > 0 ? toPaise(b.currentStock * b.purchasePrice) : 0),
      0
    );
    const invDiffPaise = Math.abs(inventorySubledgerPaise - invGlPaise);
    if (invDiffPaise > 500) {
      exceptions.push({
        id: 'inventory_ptr_drift',
        severity: 'INFO',
        category: 'INVENTORY_PTR_DRIFT',
        title: 'Inventory Batch PTR Valuation vs Inventory GL Variance',
        description: `Live batch stock PTR value ₹${fromPaise(inventorySubledgerPaise).toFixed(2)} vs GL 1400 Inventory ₹${fromPaise(invGlPaise).toFixed(2)} (note: opening stock or free quantities before GL setup can contribute).`,
        subledgerValue: fromPaise(inventorySubledgerPaise),
        glValue: fromPaise(invGlPaise),
        difference: fromPaise(inventorySubledgerPaise - invGlPaise),
      });
    }

    return {
      checkedAt: new Date().toISOString(),
      exceptionCount: exceptions.length,
      criticalCount: exceptions.filter((e) => e.severity === 'CRITICAL').length,
      highCount: exceptions.filter((e) => e.severity === 'HIGH').length,
      summary: {
        accountsReceivableGl: fromPaise(arGlPaise),
        customerKhataSubledger: fromPaise(customerKhataSubledgerPaise),
        accountsPayableGl: fromPaise(apGlPaise),
        supplierPayablesSubledger: fromPaise(supplierPayablesSubledgerPaise),
        openSupplierInvoicesSubledger: fromPaise(openSinvsPaise),
        inventoryGl: fromPaise(invGlPaise),
        stockInTransitGl: fromPaise(stockInTransitGlPaise),
        inventoryBatchPtrValuation: fromPaise(inventorySubledgerPaise),
      },
      exceptions,
    };
  }

  // ==================== 9b. PHASE 10 BRANCH & CONSOLIDATED MULTI-BRANCH REPORTS ====================

  private static async collectAllPaged<T>(
    fetcher: (page: number) => Promise<{ items: T[]; totalPages: number }>
  ): Promise<T[]> {
    const out: T[] = [];
    let page = 1;
    while (true) {
      const res = await fetcher(page);
      out.push(...res.items);
      if (page >= res.totalPages) break;
      page += 1;
    }
    return out;
  }

  public static async getBranchSalesReport(
    tenantId: string,
    branchId: string,
    opts?: { fromDate?: string; toDate?: string }
  ) {
    const { BranchService } = await import('./branchService');
    const branch = await BranchService.getBranchById(tenantId, branchId);
    const fromDate = opts?.fromDate ? normalizeDate(opts.fromDate) : null;
    const toDate = opts?.toDate ? normalizeDate(opts.toDate) : null;

    const invoices = await this.collectAllPaged(async (page) => {
      const r = await BillingTransactionService.listInvoices(tenantId, { branchId, page, limit: 100 });
      return { items: r.invoices, totalPages: r.totalPages };
    });

    const filtered = invoices.filter((inv) => {
      const d = normalizeDate(inv.createdAt);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });

    let activeCount = 0;
    let cancelledCount = 0;
    let grossRevenue = 0;
    let totalTax = 0;
    let totalDiscount = 0;
    let totalCollected = 0;
    let totalCreditOutstanding = 0;
    const medicineStats = new Map<string, { medicineId: string; medicineName: string; quantitySold: number; revenue: number }>();

    for (const inv of filtered) {
      if (inv.status === 'cancelled') {
        cancelledCount += 1;
        continue;
      }
      activeCount += 1;
      grossRevenue += Number(inv.grandTotal || 0);
      totalTax += Number(inv.cgst || 0) + Number(inv.sgst || 0) + Number(inv.igst || 0);
      totalDiscount += Number(inv.totalDiscount || 0);
      totalCollected += Number(inv.amountPaid || 0);
      totalCreditOutstanding += Number(inv.balanceDue || 0);

      for (const item of inv.items || []) {
        const curr = medicineStats.get(item.medicineId) || {
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          quantitySold: 0,
          revenue: 0,
        };
        curr.quantitySold += Number(item.quantity || 0);
        curr.revenue = Number((curr.revenue + Number(item.lineTotal || 0)).toFixed(2));
        medicineStats.set(item.medicineId, curr);
      }
    }

    const topMedicines = Array.from(medicineStats.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      branchId: branch.id,
      branchCode: branch.branchCode,
      branchName: branch.name,
      branchStatus: branch.status,
      fromDate,
      toDate,
      summary: {
        invoiceCount: activeCount,
        cancelledCount,
        grossSales: Number(grossRevenue.toFixed(2)),
        totalTaxCollected: Number(totalTax.toFixed(2)),
        totalDiscount: Number(totalDiscount.toFixed(2)),
        totalCollected: Number(totalCollected.toFixed(2)),
        totalCreditOutstanding: Number(totalCreditOutstanding.toFixed(2)),
        averageBillValue: activeCount > 0 ? Number((grossRevenue / activeCount).toFixed(2)) : 0,
      },
      topMedicines,
    };
  }

  public static async getBranchInventoryReport(tenantId: string, branchId: string) {
    const { BranchService } = await import('./branchService');
    const { StockTransferService } = await import('./stockTransferService');
    const branch = await BranchService.getBranchById(tenantId, branchId);

    const [batchRes, transfers] = await Promise.all([
      InventoryService.listBatches(tenantId, { branchId, limit: 5000 }),
      StockTransferService.listTransfers(tenantId, { branchId }),
    ]);

    const batches = batchRes.batches;
    let totalUnits = 0;
    let ptrValuation = 0;
    let mrpValuation = 0;
    let lowStockCount = 0;
    let nearExpiryCount = 0;
    let expiredCount = 0;

    for (const b of batches) {
      if (b.currentStock > 0) {
        totalUnits += b.currentStock;
        ptrValuation += b.currentStock * b.purchasePrice;
        mrpValuation += b.currentStock * b.mrp;
      }
      if (b.status === 'low_stock') lowStockCount += 1;
      if (b.status === 'near_expiry') nearExpiryCount += 1;
      if (b.status === 'expired' && b.currentStock > 0) expiredCount += 1;
    }

    const inTransitStatuses = new Set(['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED']);
    let inboundInTransitUnits = 0;
    let inboundInTransitPtrValue = 0;
    let outboundInTransitUnits = 0;
    let outboundInTransitPtrValue = 0;

    for (const t of transfers) {
      if (!inTransitStatuses.has(t.status)) continue;
      for (const item of t.items) {
        const remaining = item.dispatchedQuantity - (item.receivedQuantity + item.damagedQuantity + item.missingQuantity);
        if (remaining <= 0) continue;
        if (t.destinationBranchId === branchId) {
          inboundInTransitUnits += remaining;
          inboundInTransitPtrValue += remaining * item.unitCostPtr;
        } else if (t.sourceBranchId === branchId) {
          outboundInTransitUnits += remaining;
          outboundInTransitPtrValue += remaining * item.unitCostPtr;
        }
      }
    }

    return {
      branchId: branch.id,
      branchCode: branch.branchCode,
      branchName: branch.name,
      branchStatus: branch.status,
      summary: {
        activeBatchCount: batches.filter((b) => b.currentStock > 0).length,
        totalStockUnits: totalUnits,
        ptrValuation: Number(ptrValuation.toFixed(2)),
        mrpValuation: Number(mrpValuation.toFixed(2)),
        lowStockCount,
        nearExpiryCount,
        expiredCount,
        inboundInTransitUnits,
        inboundInTransitPtrValue: Number(inboundInTransitPtrValue.toFixed(2)),
        outboundInTransitUnits,
        outboundInTransitPtrValue: Number(outboundInTransitPtrValue.toFixed(2)),
      },
      batches: batches.slice(0, 100),
    };
  }

  public static async getBranchFinancialSummary(
    tenantId: string,
    branchId: string,
    opts?: { fromDate?: string; toDate?: string }
  ) {
    const { BranchService } = await import('./branchService');
    const branch = await BranchService.getBranchById(tenantId, branchId);
    const [pnl, balanceSheet, salesReport, inventoryReport, supplierInvoices, expenses] = await Promise.all([
      this.getProfitAndLoss(tenantId, { ...opts, branchId }),
      this.getBalanceSheet(tenantId, { ...opts, branchId }),
      this.getBranchSalesReport(tenantId, branchId, opts),
      this.getBranchInventoryReport(tenantId, branchId),
      this.collectAllPaged(async (page) => {
        const r = await ProcurementService.listSupplierInvoices(tenantId, branchId, { page, limit: 100 });
        return { items: r.invoices, totalPages: r.totalPages };
      }),
      AccountingService.listExpenses(tenantId, { branchId, fromDate: opts?.fromDate, toDate: opts?.toDate }),
    ]);

    const payablesOutstanding = supplierInvoices
      .filter((i) => i.paymentStatus !== 'REVERSED' && i.paymentStatus !== 'PAID')
      .reduce((sum, i) => sum + Number(i.outstandingAmount || 0), 0);

    const expensesTotal = expenses
      .filter((e) => e.status !== 'REVERSED' && e.status !== 'REJECTED')
      .reduce((sum, e) => sum + Number(e.totalAmount || 0), 0);

    return {
      branch,
      fromDate: opts?.fromDate || null,
      toDate: opts?.toDate || null,
      profitAndLoss: pnl,
      balanceSheet,
      salesSummary: salesReport.summary,
      inventorySummary: inventoryReport.summary,
      payablesOutstanding: Number(payablesOutstanding.toFixed(2)),
      expensesTotal: Number(expensesTotal.toFixed(2)),
    };
  }

  public static async getBranchComparisonReport(
    tenantId: string,
    opts?: { fromDate?: string; toDate?: string }
  ) {
    const { BranchService } = await import('./branchService');
    const { StockTransferService } = await import('./stockTransferService');

    const [branches, allTransfers, allBatchesRes, allInvoices, allSupplierInvoices] = await Promise.all([
      BranchService.listBranches(tenantId, { includeClosed: true }),
      StockTransferService.listTransfers(tenantId),
      InventoryService.listBatches(tenantId, { limit: 10000 }),
      this.collectAllPaged(async (page) => {
        const r = await BillingTransactionService.listInvoices(tenantId, { page, limit: 100 });
        return { items: r.invoices, totalPages: r.totalPages };
      }),
      this.collectAllPaged(async (page) => {
        const r = await ProcurementService.listSupplierInvoices(tenantId, undefined, { page, limit: 100 });
        return { items: r.invoices, totalPages: r.totalPages };
      }),
    ]);

    const fromDate = opts?.fromDate ? normalizeDate(opts.fromDate) : null;
    const toDate = opts?.toDate ? normalizeDate(opts.toDate) : null;

    const rows = await Promise.all(
      branches.map(async (b) => {
        const pnl = await this.getProfitAndLoss(tenantId, { ...opts, branchId: b.id });
        const branchBatches = allBatchesRes.batches.filter((x) => x.branchId === b.id && x.currentStock > 0);
        const inventoryPtrValuation = Number(
          branchBatches.reduce((sum, x) => sum + x.currentStock * x.purchasePrice, 0).toFixed(2)
        );
        const branchStockUnits = branchBatches.reduce((sum, x) => sum + x.currentStock, 0);

        const branchInvoices = allInvoices.filter((inv) => {
          if (inv.branchId !== b.id || inv.status === 'cancelled') return false;
          const d = normalizeDate(inv.createdAt);
          if (fromDate && d < fromDate) return false;
          if (toDate && d > toDate) return false;
          return true;
        });

        const posGrossSales = Number(
          branchInvoices.reduce((sum, inv) => sum + Number(inv.grandTotal || 0), 0).toFixed(2)
        );
        const receivablesAmount = Number(
          allInvoices
            .filter((inv) => inv.branchId === b.id && inv.status !== 'cancelled')
            .reduce((sum, inv) => sum + Number(inv.balanceDue || 0), 0)
            .toFixed(2)
        );

        const payablesAmount = Number(
          allSupplierInvoices
            .filter((sinv) => sinv.branchId === b.id && sinv.paymentStatus !== 'REVERSED')
            .reduce((sum, sinv) => sum + Number(sinv.outstandingAmount || 0), 0)
            .toFixed(2)
        );

        const outboundTransfers = allTransfers.filter((t) => t.sourceBranchId === b.id);
        const inboundTransfers = allTransfers.filter((t) => t.destinationBranchId === b.id);

        return {
          branchId: b.id,
          branchCode: b.branchCode,
          name: b.name,
          branchType: b.branchType,
          status: b.status,
          isPrimary: b.isPrimary,
          invoiceCount: branchInvoices.length,
          posGrossSales,
          netSales: pnl.summary.netSales,
          totalCogs: pnl.summary.totalCogs,
          grossProfit: pnl.summary.grossProfit,
          grossMarginPercent: pnl.summary.grossMarginPercent,
          operatingExpenses: pnl.summary.totalOperatingExpenses,
          netProfit: pnl.summary.netProfit,
          stockUnits: branchStockUnits,
          inventoryPtrValuation,
          receivablesAmount,
          payablesAmount,
          outboundTransferCount: outboundTransfers.length,
          inboundTransferCount: inboundTransfers.length,
        };
      })
    );

    return {
      fromDate,
      toDate,
      branchCount: rows.length,
      branches: rows,
    };
  }

  public static async getConsolidatedOverviewReport(
    tenantId: string,
    opts?: { fromDate?: string; toDate?: string }
  ) {
    const { StockTransferService } = await import('./stockTransferService');
    const [comparison, consolidatedPnl, consolidatedBs, consolidatedTb, transfers] = await Promise.all([
      this.getBranchComparisonReport(tenantId, opts),
      this.getProfitAndLoss(tenantId, { ...opts, branchId: 'ALL' }),
      this.getBalanceSheet(tenantId, { ...opts, branchId: 'ALL' }),
      this.getTrialBalance(tenantId, { ...opts, branchId: 'ALL' }),
      StockTransferService.listTransfers(tenantId),
    ]);

    const branchTotals = comparison.branches.reduce(
      (acc, r) => ({
        invoiceCount: acc.invoiceCount + r.invoiceCount,
        posGrossSales: Number((acc.posGrossSales + r.posGrossSales).toFixed(2)),
        netSales: Number((acc.netSales + r.netSales).toFixed(2)),
        totalCogs: Number((acc.totalCogs + r.totalCogs).toFixed(2)),
        grossProfit: Number((acc.grossProfit + r.grossProfit).toFixed(2)),
        operatingExpenses: Number((acc.operatingExpenses + r.operatingExpenses).toFixed(2)),
        netProfit: Number((acc.netProfit + r.netProfit).toFixed(2)),
        stockUnits: acc.stockUnits + r.stockUnits,
        inventoryPtrValuation: Number((acc.inventoryPtrValuation + r.inventoryPtrValuation).toFixed(2)),
        receivablesAmount: Number((acc.receivablesAmount + r.receivablesAmount).toFixed(2)),
        payablesAmount: Number((acc.payablesAmount + r.payablesAmount).toFixed(2)),
      }),
      {
        invoiceCount: 0,
        posGrossSales: 0,
        netSales: 0,
        totalCogs: 0,
        grossProfit: 0,
        operatingExpenses: 0,
        netProfit: 0,
        stockUnits: 0,
        inventoryPtrValuation: 0,
        receivablesAmount: 0,
        payablesAmount: 0,
      }
    );

    const activeTransitStatuses = new Set(['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED']);
    const inTransitTransfers = transfers.filter((t) => activeTransitStatuses.has(t.status));
    const stockInTransitRow = consolidatedTb.rows.find((r) => r.code === '1450');
    const stockInTransitGlValue = stockInTransitRow ? stockInTransitRow.netBalance : 0;

    const totalInterBranchTransferVolumePtr = Number(
      transfers
        .filter((t) => t.status !== 'CANCELLED' && t.status !== 'REJECTED')
        .reduce((sum, t) => sum + Number(t.dispatchedPtrValuation || t.totalPtrValuation || 0), 0)
        .toFixed(2)
    );

    return {
      fromDate: opts?.fromDate || null,
      toDate: opts?.toDate || null,
      branchCount: comparison.branchCount,
      branches: comparison.branches,
      branchTotals,
      interBranchEliminations: {
        totalTransfersCount: transfers.length,
        inTransitTransfersCount: inTransitTransfers.length,
        totalInterBranchTransferVolumePtr,
        stockInTransitGlValue,
        interBranchRevenueRecognized: 0,
        interBranchCogsEliminated: 0,
        note: 'Inter-branch transfers relocate inventory PTR asset value via 1450 Stock-in-Transit without generating internal sales revenue or artificial profit.',
      },
      consolidatedFinancials: {
        netSales: consolidatedPnl.summary.netSales,
        totalCogs: consolidatedPnl.summary.totalCogs,
        grossProfit: consolidatedPnl.summary.grossProfit,
        grossMarginPercent: consolidatedPnl.summary.grossMarginPercent,
        operatingExpenses: consolidatedPnl.summary.totalOperatingExpenses,
        netProfit: consolidatedPnl.summary.netProfit,
        totalAssets: consolidatedBs.totals.totalAssets,
        totalLiabilities: consolidatedBs.totals.totalLiabilities,
        totalEquity: consolidatedBs.totals.totalEquity,
        isBalanceSheetBalanced: consolidatedBs.totals.isBalanced,
        isTrialBalanceBalanced: consolidatedTb.totals.isBalanced,
      },
    };
  }

  // ==================== 10. CSV & PDF EXPORTS ====================

  public static async exportReport(
    tenantId: string,
    reportType:
      | 'trial-balance'
      | 'profit-loss'
      | 'balance-sheet'
      | 'gst-summary'
      | 'general-ledger'
      | 'expenses'
      | 'branch-comparison'
      | 'consolidated-summary',
    format: 'csv' | 'pdf',
    opts?: ReportFilterOptions
  ): Promise<{ contentType: string; filename: string; body: string | Buffer }> {
    const stamp = new Date().toISOString().slice(0, 10);
    const csvRows: string[][] = [];
    const pdfLines: string[] = [];
    let title = `PharmaDesk Financial Report (${reportType})`;

    if (reportType === 'trial-balance') {
      title = 'PharmaDesk Trial Balance';
      const tb = await this.getTrialBalance(tenantId, opts);
      csvRows.push(['Code', 'Account', 'Category', 'Opening Dr', 'Opening Cr', 'Period Dr', 'Period Cr', 'Closing Dr', 'Closing Cr']);
      tb.rows.forEach((r) => {
        csvRows.push([
          r.code,
          r.name,
          r.category,
          r.openingDebit.toFixed(2),
          r.openingCredit.toFixed(2),
          r.periodDebit.toFixed(2),
          r.periodCredit.toFixed(2),
          r.closingDebit.toFixed(2),
          r.closingCredit.toFixed(2),
        ]);
        pdfLines.push(
          `${r.code.padEnd(6)} ${r.name.slice(0, 32).padEnd(34)} Dr:${r.closingDebit.toFixed(2).padStart(11)} Cr:${r.closingCredit.toFixed(2).padStart(11)}`
        );
      });
      pdfLines.push('-'.repeat(72));
      pdfLines.push(
        `TOTAL  ${' '.repeat(34)} Dr:${tb.totals.closingDebit.toFixed(2).padStart(11)} Cr:${tb.totals.closingCredit.toFixed(2).padStart(11)}`
      );
    } else if (reportType === 'profit-loss') {
      title = 'PharmaDesk Profit & Loss Statement';
      const pnl = await this.getProfitAndLoss(tenantId, opts);
      csvRows.push(['Section', 'Code', 'Account', 'Amount (INR)']);
      pnl.incomeItems.forEach((i) => {
        csvRows.push(['INCOME', i.code, i.name, i.amount.toFixed(2)]);
        pdfLines.push(`INCOME  ${i.code} ${i.name.padEnd(36)} ${i.amount.toFixed(2).padStart(12)}`);
      });
      pnl.cogsItems.forEach((i) => {
        csvRows.push(['COGS', i.code, i.name, i.amount.toFixed(2)]);
        pdfLines.push(`COGS    ${i.code} ${i.name.padEnd(36)} ${i.amount.toFixed(2).padStart(12)}`);
      });
      pnl.operatingExpenseItems.forEach((i) => {
        csvRows.push(['EXPENSE', i.code, i.name, i.amount.toFixed(2)]);
        pdfLines.push(`EXPENSE ${i.code} ${i.name.padEnd(36)} ${i.amount.toFixed(2).padStart(12)}`);
      });
      csvRows.push(['SUMMARY', '', 'Gross Profit', pnl.summary.grossProfit.toFixed(2)]);
      csvRows.push(['SUMMARY', '', 'Net Profit', pnl.summary.netProfit.toFixed(2)]);
      pdfLines.push('-'.repeat(72));
      pdfLines.push(`Gross Profit: INR ${pnl.summary.grossProfit.toFixed(2)} (${pnl.summary.grossMarginPercent}%)`);
      pdfLines.push(`Net Profit:   INR ${pnl.summary.netProfit.toFixed(2)}`);
    } else if (reportType === 'balance-sheet') {
      title = 'PharmaDesk Balance Sheet';
      const bs = await this.getBalanceSheet(tenantId, opts);
      csvRows.push(['Section', 'Code', 'Account', 'Balance (INR)']);
      bs.assets.items.forEach((i) => {
        csvRows.push(['ASSET', i.code, i.name, i.balance.toFixed(2)]);
        pdfLines.push(`ASSET     ${i.code} ${i.name.padEnd(34)} ${i.balance.toFixed(2).padStart(12)}`);
      });
      bs.liabilities.items.forEach((i) => {
        csvRows.push(['LIABILITY', i.code, i.name, i.balance.toFixed(2)]);
        pdfLines.push(`LIABILITY ${i.code} ${i.name.padEnd(34)} ${i.balance.toFixed(2).padStart(12)}`);
      });
      bs.equity.items.forEach((i) => {
        csvRows.push(['EQUITY', i.code, i.name, i.balance.toFixed(2)]);
        pdfLines.push(`EQUITY    ${i.code} ${i.name.padEnd(34)} ${i.balance.toFixed(2).padStart(12)}`);
      });
      pdfLines.push('-'.repeat(72));
      pdfLines.push(`Total Assets: INR ${bs.totals.totalAssets.toFixed(2)} | Liab+Equity: INR ${bs.totals.totalLiabilitiesAndEquity.toFixed(2)}`);
    } else if (reportType === 'gst-summary') {
      title = 'PharmaDesk GST Accounting Summary';
      const gst = await this.getGstSummary(tenantId, opts);
      csvRows.push(['Component', 'CGST', 'SGST', 'IGST', 'Total']);
      csvRows.push(['Output GST (Sales)', gst.outputTax.cgst.toFixed(2), gst.outputTax.sgst.toFixed(2), gst.outputTax.igst.toFixed(2), gst.outputTax.totalOutputGst.toFixed(2)]);
      csvRows.push(['Eligible Input ITC (Purchases & Expenses)', gst.inputTaxCredit.cgst.toFixed(2), gst.inputTaxCredit.sgst.toFixed(2), gst.inputTaxCredit.igst.toFixed(2), gst.inputTaxCredit.totalEligibleItc.toFixed(2)]);
      csvRows.push(['Net GST Payable / (Credit)', '', '', '', gst.netGstPayable.toFixed(2)]);
      pdfLines.push(`Output GST Total:     INR ${gst.outputTax.totalOutputGst.toFixed(2)} (CGST ${gst.outputTax.cgst.toFixed(2)} / SGST ${gst.outputTax.sgst.toFixed(2)} / IGST ${gst.outputTax.igst.toFixed(2)})`);
      pdfLines.push(`Input ITC Eligible:   INR ${gst.inputTaxCredit.totalEligibleItc.toFixed(2)} (CGST ${gst.inputTaxCredit.cgst.toFixed(2)} / SGST ${gst.inputTaxCredit.sgst.toFixed(2)} / IGST ${gst.inputTaxCredit.igst.toFixed(2)})`);
      pdfLines.push(`Net GST Payable:      INR ${gst.netGstPayable.toFixed(2)} (${gst.netPosition})`);
    } else if (reportType === 'expenses') {
      title = 'PharmaDesk Expense Register';
      const expenses = await AccountingService.listExpenses(tenantId, opts);
      csvRows.push(['Date', 'Expense No', 'Branch', 'Category', 'Vendor', 'Total', 'Status']);
      expenses.forEach((e) => {
        csvRows.push([e.expenseDate, e.expenseNumber, e.branchId, e.categoryAccountName, e.vendorName, e.totalAmount.toFixed(2), e.status]);
        pdfLines.push(`${e.expenseDate} ${e.expenseNumber.padEnd(15)} ${e.categoryAccountName.slice(0, 20).padEnd(22)} ${e.totalAmount.toFixed(2).padStart(10)} ${e.status}`);
      });
    } else if (reportType === 'branch-comparison') {
      title = 'PharmaDesk Branch Performance Comparison';
      const cmp = await this.getBranchComparisonReport(tenantId, opts);
      csvRows.push([
        'Branch Code',
        'Branch Name',
        'Status',
        'Invoices',
        'POS Sales',
        'GL Net Sales',
        'COGS',
        'Gross Profit',
        'Expenses',
        'Net Profit',
        'Stock PTR Value',
        'Receivables',
        'Payables',
      ]);
      cmp.branches.forEach((b) => {
        csvRows.push([
          b.branchCode,
          b.name,
          b.status,
          String(b.invoiceCount),
          b.posGrossSales.toFixed(2),
          b.netSales.toFixed(2),
          b.totalCogs.toFixed(2),
          b.grossProfit.toFixed(2),
          b.operatingExpenses.toFixed(2),
          b.netProfit.toFixed(2),
          b.inventoryPtrValuation.toFixed(2),
          b.receivablesAmount.toFixed(2),
          b.payablesAmount.toFixed(2),
        ]);
        pdfLines.push(
          `${b.branchCode.padEnd(8)} ${b.name.slice(0, 20).padEnd(22)} Sales:${b.netSales.toFixed(2).padStart(10)} Profit:${b.netProfit.toFixed(2).padStart(10)} InvPTR:${b.inventoryPtrValuation.toFixed(2).padStart(10)}`
        );
      });
    } else if (reportType === 'consolidated-summary') {
      title = 'PharmaDesk Consolidated Multi-Branch Financial Summary';
      const cons = await this.getConsolidatedOverviewReport(tenantId, opts);
      csvRows.push(['Section', 'Metric', 'Amount / Value']);
      csvRows.push(['Branch Totals', 'Sum of Branch Net Sales', cons.branchTotals.netSales.toFixed(2)]);
      csvRows.push(['Branch Totals', 'Sum of Branch Inventory PTR', cons.branchTotals.inventoryPtrValuation.toFixed(2)]);
      csvRows.push(['Inter-Branch', 'Transfer Volume (PTR)', cons.interBranchEliminations.totalInterBranchTransferVolumePtr.toFixed(2)]);
      csvRows.push(['Inter-Branch', 'Stock in Transit GL (1450)', cons.interBranchEliminations.stockInTransitGlValue.toFixed(2)]);
      csvRows.push(['Inter-Branch', 'Inter-Branch Revenue Eliminated', cons.interBranchEliminations.interBranchRevenueRecognized.toFixed(2)]);
      csvRows.push(['Consolidated', 'Consolidated Net Sales', cons.consolidatedFinancials.netSales.toFixed(2)]);
      csvRows.push(['Consolidated', 'Consolidated Gross Profit', cons.consolidatedFinancials.grossProfit.toFixed(2)]);
      csvRows.push(['Consolidated', 'Consolidated Net Profit', cons.consolidatedFinancials.netProfit.toFixed(2)]);
      csvRows.push(['Consolidated', 'Total Assets', cons.consolidatedFinancials.totalAssets.toFixed(2)]);
      pdfLines.push(`Branches: ${cons.branchCount} | Transfers: ${cons.interBranchEliminations.totalTransfersCount} (In-Transit: ${cons.interBranchEliminations.inTransitTransfersCount})`);
      pdfLines.push(`Consolidated Net Sales:  INR ${cons.consolidatedFinancials.netSales.toFixed(2)}`);
      pdfLines.push(`Consolidated Net Profit: INR ${cons.consolidatedFinancials.netProfit.toFixed(2)}`);
      pdfLines.push(`Stock in Transit (1450): INR ${cons.interBranchEliminations.stockInTransitGlValue.toFixed(2)}`);
      pdfLines.push(`Total Assets:            INR ${cons.consolidatedFinancials.totalAssets.toFixed(2)}`);
    } else {
      title = 'PharmaDesk General Ledger';
      const gl = await this.getGeneralLedgerOrDayBook(tenantId, opts);
      csvRows.push(['Date', 'Voucher', 'Type', 'Status', 'Branch', 'Account', 'Debit', 'Credit', 'Narration']);
      gl.entries.forEach((e) => {
        e.lines.forEach((l) => {
          csvRows.push([e.transactionDate, e.voucherNumber, e.entryType, e.status, l.branchId, `${l.accountCode} ${l.accountName}`, l.debit.toFixed(2), l.credit.toFixed(2), e.narration]);
          pdfLines.push(`${e.transactionDate} ${e.voucherNumber} ${l.accountCode} Dr:${l.debit.toFixed(2)} Cr:${l.credit.toFixed(2)} ${e.narration.slice(0, 28)}`);
        });
      });
    }

    if (format === 'pdf') {
      return {
        contentType: 'application/pdf',
        filename: `pharmadesk-${reportType}-${stamp}.pdf`,
        body: buildSimplePdfBuffer(title, pdfLines),
      };
    }

    const csv = csvRows.map((r) => r.map((cell) => escapeCsvCell(cell)).join(',')).join('\n');
    return {
      contentType: 'text/csv; charset=utf-8',
      filename: `pharmadesk-${reportType}-${stamp}.csv`,
      body: csv,
    };
  }
}

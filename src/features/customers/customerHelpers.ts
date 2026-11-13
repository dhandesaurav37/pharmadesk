/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BillInvoice,
  Customer,
  CustomerAccount,
  CustomerLedgerEntry,
  CustomerPayment,
  CustomerReconciliation,
  CustomerStatement,
  OutstandingReport,
  OverdueReport,
  CreditSummaryDashboard,
} from '../../types/pharmacy.ts';

export const roundPaise = (amount: number): number =>
  Math.round((amount + Number.EPSILON) * 100) / 100;

export const toPaise = (amount: number): number => Math.round((amount + Number.EPSILON) * 100);
export const fromPaise = (paise: number): number => paise / 100;

export const formatINR = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const normalizeIndianPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return phone.trim();
};

export const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '******';
  return `******${digits.slice(-4)}`;
};

export const computeDaysOverdue = (dueDate?: string, balanceDue?: number): number => {
  if (!dueDate || !balanceDue || balanceDue <= 0) return 0;
  const due = new Date(`${dueDate.slice(0, 10)}T23:59:59Z`).getTime();
  const now = Date.now();
  if (Number.isNaN(due) || now <= due) return 0;
  return Math.max(1, Math.floor((now - due) / (1000 * 60 * 60 * 24)));
};

export const localCustomerToAccount = (
  c: Customer,
  tenantId: string,
  canViewPhone: boolean,
  canViewKhata: boolean
): CustomerAccount => {
  const limit = c.creditLimit ?? 0;
  const outstanding = c.khataBalance ?? 0;
  const advance = c.advanceBalance ?? 0;
  return {
    id: c.id,
    tenantId,
    primaryBranchId: 'main',
    name: c.name,
    phone: canViewPhone ? c.phone : maskPhone(c.phone),
    normalizedPhone: canViewPhone ? normalizeIndianPhone(c.phone) : undefined,
    phoneMasked: !canViewPhone,
    khataRedacted: !canViewKhata,
    alternatePhone: canViewPhone ? c.alternatePhone || null : null,
    email: c.email || null,
    customerType: c.customerType || 'REGULAR',
    address: c.address || null,
    city: c.city || null,
    state: c.state || null,
    pincode: c.pincode || null,
    dateOfBirth: c.dateOfBirth || null,
    gender: c.gender || null,
    preferredDoctorName: c.doctorName || null,
    allergies: c.allergies || null,
    chronicConditions: c.chronicConditions || null,
    gstin: c.gstin || null,
    creditEnabled: c.creditEnabled ?? true,
    creditLimit: canViewKhata ? limit : null,
    creditTermsDays: c.creditTermsDays ?? 15,
    currentOutstandingBalance: canViewKhata ? outstanding : null,
    advanceBalance: canViewKhata ? advance : null,
    availableCredit: canViewKhata ? roundPaise(Math.max(0, limit - outstanding)) : null,
    isOverLimit: canViewKhata ? limit > 0 && outstanding > limit : false,
    totalPurchases: c.totalPurchased || 0,
    totalPayments: canViewKhata ? c.totalPayments ?? 0 : null,
    totalVisits: c.totalVisits || 0,
    lastPurchaseDate: c.lastVisit || null,
    lastPaymentDate: c.lastPaymentDate || null,
    status: c.status || 'ACTIVE',
    isArchived: Boolean(c.isArchived),
    notes: c.notes || null,
    createdBy: 'system',
    updatedBy: 'system',
    createdAt: c.lastVisit || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export const reconcileLocalCustomerLedger = (
  customer: Customer,
  entries: CustomerLedgerEntry[]
): CustomerReconciliation => {
  const custEntries = entries.filter(e => e.customerId === customer.id);
  let totalDebitsP = 0;
  let totalCreditsP = 0;
  for (const e of custEntries) {
    const amtP = toPaise(e.amount);
    if (e.direction === 'DEBIT') totalDebitsP += amtP;
    else totalCreditsP += amtP;
  }
  const netP = totalDebitsP - totalCreditsP;
  const expectedOutP = netP > 0 ? netP : 0;
  const expectedAdvP = netP < 0 ? Math.abs(netP) : 0;
  const storedOutP = toPaise(customer.khataBalance || 0);
  const storedAdvP = toPaise(customer.advanceBalance || 0);
  const discrepancyP = Math.abs((storedOutP - storedAdvP) - netP);

  return {
    customerId: customer.id,
    totalDebits: fromPaise(totalDebitsP),
    totalCredits: fromPaise(totalCreditsP),
    netLedgerBalance: fromPaise(netP),
    expectedOutstandingBalance: fromPaise(expectedOutP),
    expectedAdvanceBalance: fromPaise(expectedAdvP),
    storedOutstandingBalance: fromPaise(storedOutP),
    storedAdvanceBalance: fromPaise(storedAdvP),
    discrepancy: fromPaise(discrepancyP),
    isBalanced: discrepancyP === 0,
    entryCount: custEntries.length,
  };
};

export const buildLocalCustomerStatement = (
  account: CustomerAccount,
  entries: CustomerLedgerEntry[],
  dateFrom?: string,
  dateTo?: string
): CustomerStatement => {
  const sorted = [...entries]
    .filter(e => e.customerId === account.id)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const fromIso = dateFrom ? `${dateFrom}T00:00:00.000Z` : '1970-01-01T00:00:00.000Z';
  const toIso = dateTo ? `${dateTo}T23:59:59.999Z` : '9999-12-31T23:59:59.999Z';

  let openingNetP = 0;
  let periodDebitsP = 0;
  let periodCreditsP = 0;
  const periodEntries: CustomerLedgerEntry[] = [];

  for (const e of sorted) {
    const amtP = toPaise(e.amount);
    const signedP = e.direction === 'DEBIT' ? amtP : -amtP;
    if (e.timestamp < fromIso) {
      openingNetP += signedP;
    } else if (e.timestamp <= toIso) {
      periodEntries.push(e);
      if (e.direction === 'DEBIT') periodDebitsP += amtP;
      else periodCreditsP += amtP;
    }
  }

  const closingNetP = openingNetP + periodDebitsP - periodCreditsP;

  return {
    customer: account,
    period: {
      dateFrom: dateFrom || (sorted[0]?.timestamp.slice(0, 10) || new Date().toISOString().slice(0, 10)),
      dateTo: dateTo || new Date().toISOString().slice(0, 10),
    },
    openingBalance: fromPaise(openingNetP),
    periodDebits: fromPaise(periodDebitsP),
    periodCredits: fromPaise(periodCreditsP),
    closingBalance: fromPaise(closingNetP),
    currentOutstandingBalance: account.currentOutstandingBalance ?? 0,
    advanceBalance: account.advanceBalance ?? 0,
    entries: periodEntries,
  };
};

export const buildLocalReports = (
  customers: Customer[],
  bills: BillInvoice[],
  payments: CustomerPayment[],
  tenantId: string,
  canViewPhone: boolean,
  canViewKhata: boolean
): {
  summary: CreditSummaryDashboard;
  outstanding: OutstandingReport;
  overdue: OverdueReport;
} => {
  const activeCustomers = customers.filter(c => !c.isArchived);
  const accounts = activeCustomers.map(c =>
    localCustomerToAccount(c, tenantId, canViewPhone, canViewKhata)
  );

  const overdueInvoices: OverdueReport['overdueInvoices'] = [];
  let notYetDueP = 0;
  let dueTodayP = 0;
  let bucket1To15P = 0;
  let bucket16To30P = 0;
  let bucketOver30P = 0;

  const todayStr = new Date().toISOString().slice(0, 10);

  for (const b of bills) {
    if (b.status === 'cancelled' || b.status === 'returned' || b.balanceDue <= 0) continue;
    const dueP = toPaise(b.balanceDue);
    const dueDate = b.dueDate || '';
    const days = computeDaysOverdue(dueDate, b.balanceDue);

    if (!dueDate || dueDate.slice(0, 10) > todayStr) {
      notYetDueP += dueP;
    } else if (dueDate.slice(0, 10) === todayStr && days === 0) {
      dueTodayP += dueP;
    } else if (days <= 15) {
      bucket1To15P += dueP;
      overdueInvoices.push({
        invoiceId: b.id,
        invoiceNumber: b.invoiceNumber,
        branchId: b.branchId || 'main',
        customerId: b.customerId || '',
        customerName: b.customerName,
        customerPhone: canViewPhone ? b.customerPhone : maskPhone(b.customerPhone),
        grandTotal: b.grandTotal,
        amountPaid: b.amountPaid,
        balanceDue: b.balanceDue,
        dueDate,
        daysOverdue: days,
        agingBucket: '1_15_days',
        createdAt: b.timestamp,
      });
    } else if (days <= 30) {
      bucket16To30P += dueP;
      overdueInvoices.push({
        invoiceId: b.id,
        invoiceNumber: b.invoiceNumber,
        branchId: b.branchId || 'main',
        customerId: b.customerId || '',
        customerName: b.customerName,
        customerPhone: canViewPhone ? b.customerPhone : maskPhone(b.customerPhone),
        grandTotal: b.grandTotal,
        amountPaid: b.amountPaid,
        balanceDue: b.balanceDue,
        dueDate,
        daysOverdue: days,
        agingBucket: '16_30_days',
        createdAt: b.timestamp,
      });
    } else {
      bucketOver30P += dueP;
      overdueInvoices.push({
        invoiceId: b.id,
        invoiceNumber: b.invoiceNumber,
        branchId: b.branchId || 'main',
        customerId: b.customerId || '',
        customerName: b.customerName,
        customerPhone: canViewPhone ? b.customerPhone : maskPhone(b.customerPhone),
        grandTotal: b.grandTotal,
        amountPaid: b.amountPaid,
        balanceDue: b.balanceDue,
        dueDate,
        daysOverdue: days,
        agingBucket: 'over_30_days',
        createdAt: b.timestamp,
      });
    }
  }

  overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const outstandingRows: OutstandingReport['customers'] = activeCustomers
    .filter(c => c.khataBalance > 0 || (c.advanceBalance || 0) > 0)
    .map(c => {
      const custBills = bills.filter(
        b => b.customerId === c.id && b.status !== 'cancelled' && b.status !== 'returned' && b.balanceDue > 0
      );
      const overdueAmtP = custBills
        .filter(b => computeDaysOverdue(b.dueDate, b.balanceDue) > 0)
        .reduce((s, b) => s + toPaise(b.balanceDue), 0);
      const limit = c.creditLimit ?? 0;
      return {
        customerId: c.id,
        name: c.name,
        phone: canViewPhone ? c.phone : maskPhone(c.phone),
        customerType: c.customerType || 'REGULAR',
        status: c.status || 'ACTIVE',
        creditLimit: limit,
        currentOutstandingBalance: c.khataBalance,
        advanceBalance: c.advanceBalance || 0,
        availableCredit: roundPaise(Math.max(0, limit - c.khataBalance)),
        isOverLimit: limit > 0 && c.khataBalance > limit,
        unpaidInvoiceCount: custBills.length,
        overdueAmount: fromPaise(overdueAmtP),
        lastPurchaseDate: c.lastVisit || null,
        lastPaymentDate: c.lastPaymentDate || null,
      };
    })
    .sort((a, b) => b.currentOutstandingBalance - a.currentOutstandingBalance);

  const totalOutstanding = roundPaise(
    activeCustomers.reduce((s, c) => s + (c.khataBalance || 0), 0)
  );
  const totalAdvance = roundPaise(
    activeCustomers.reduce((s, c) => s + (c.advanceBalance || 0), 0)
  );
  const totalOverdue = fromPaise(bucket1To15P + bucket16To30P + bucketOver30P);
  const overdueCustomerIds = new Set(overdueInvoices.map(i => i.customerId).filter(Boolean));

  const summary: CreditSummaryDashboard = {
    kpis: {
      totalCustomers: activeCustomers.length,
      activeCreditAccounts: activeCustomers.filter(c => c.creditEnabled !== false && c.status !== 'BLOCKED').length,
      totalKhataOutstanding: totalOutstanding,
      totalAdvanceBalance: totalAdvance,
      overdueAccountsCount: overdueCustomerIds.size,
      overdueTotalAmount: totalOverdue,
      overLimitAccountsCount: outstandingRows.filter(r => r.isOverLimit).length,
      blockedAccountsCount: activeCustomers.filter(c => c.status === 'BLOCKED').length,
    },
    recentCreditSales: bills
      .filter(b => (b.khataCreditAmount || 0) > 0 || b.paymentMode === 'khata_credit')
      .slice(0, 8)
      .map(b => ({
        invoiceId: b.id,
        invoiceNumber: b.invoiceNumber,
        customerId: b.customerId,
        customerName: b.customerName,
        grandTotal: b.grandTotal,
        balanceDue: b.balanceDue,
        dueDate: b.dueDate,
        createdAt: b.timestamp,
      })),
    topCustomersByPurchases: [...accounts]
      .sort((a, b) => b.totalPurchases - a.totalPurchases)
      .slice(0, 5),
    highestOutstandingCustomers: [...accounts]
      .filter(a => (a.currentOutstandingBalance || 0) > 0)
      .sort((a, b) => (b.currentOutstandingBalance || 0) - (a.currentOutstandingBalance || 0))
      .slice(0, 5),
    recentPayments: payments.slice(0, 8),
  };

  return {
    summary,
    outstanding: {
      customers: outstandingRows,
      totals: {
        totalCustomersWithDue: outstandingRows.filter(r => r.currentOutstandingBalance > 0).length,
        totalOutstanding,
        totalAdvance,
        totalOverdue,
        overLimitCount: outstandingRows.filter(r => r.isOverLimit).length,
      },
    },
    overdue: {
      overdueInvoices,
      agingSummary: {
        notYetDueAmount: fromPaise(notYetDueP),
        dueTodayAmount: fromPaise(dueTodayP),
        bucket1To15Days: fromPaise(bucket1To15P),
        bucket16To30Days: fromPaise(bucket16To30P),
        bucketOver30Days: fromPaise(bucketOver30P),
        totalOverdueAmount: totalOverdue,
      },
    },
  };
};

export const downloadBase64File = (base64: string, fileName: string, mimeType: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const downloadStatementCsvLocally = (statement: CustomerStatement) => {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Customer Name', statement.customer.name].map(esc).join(','),
    ['Phone', statement.customer.phone].map(esc).join(','),
    ['Period', `${statement.period.dateFrom} to ${statement.period.dateTo}`].map(esc).join(','),
    ['Opening Balance (INR)', statement.openingBalance.toFixed(2)].map(esc).join(','),
    ['Period Debits (INR)', statement.periodDebits.toFixed(2)].map(esc).join(','),
    ['Period Credits (INR)', statement.periodCredits.toFixed(2)].map(esc).join(','),
    ['Closing Balance (INR)', statement.closingBalance.toFixed(2)].map(esc).join(','),
    '',
    ['Date', 'Entry Type', 'Direction', 'Debit (INR)', 'Credit (INR)', 'Running Balance', 'Advance', 'Reference', 'Description'].map(esc).join(','),
    ...statement.entries.map(e =>
      [
        e.timestamp.slice(0, 10),
        e.entryType,
        e.direction,
        e.direction === 'DEBIT' ? e.amount.toFixed(2) : '',
        e.direction === 'CREDIT' ? e.amount.toFixed(2) : '',
        e.runningBalance.toFixed(2),
        e.runningAdvanceBalance.toFixed(2),
        e.invoiceNumber || e.referenceNumber || e.paymentId || '',
        e.description,
      ]
        .map(esc)
        .join(',')
    ),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `khata-statement-${statement.customer.id}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  IndianRupee,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  FileMinus,
  SlidersHorizontal,
  MessageSquareShare,
  ExternalLink,
  Archive,
  Ban,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import {
  CustomerAccount,
  CustomerLedgerEntry,
  CustomerPayment,
  CustomerStatus,
  KhataPaymentMode,
} from '../../types/pharmacy.ts';
import {
  customerApi,
  ApiClientError,
  generateIdempotencyKey,
  BackendInvoiceRecord,
} from '../../lib/customerApi.ts';
import { formatINR, roundPaise } from './customerHelpers.ts';

interface CollectPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerAccount;
  unpaidInvoices: BackendInvoiceRecord[];
  onSuccess?: () => void;
}

export const CollectKhataPaymentModal: React.FC<CollectPaymentModalProps> = ({
  isOpen,
  onClose,
  customer,
  unpaidInvoices,
  onSuccess,
}) => {
  const {
    apiSession,
    store,
    currentUser,
    updateCustomerRecord,
    appendCustomerLedgerEntry,
    appendCustomerPayment,
    recordBillPayment,
  } = usePharmacy();

  const isLiveApi = Boolean(apiSession.bearerToken);
  const outstanding = customer.currentOutstandingBalance ?? 0;

  const [amount, setAmount] = useState<string>(outstanding > 0 ? String(outstanding) : '');
  const [paymentMode, setPaymentMode] = useState<KhataPaymentMode>('cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [allowAdvance, setAllowAdvance] = useState(false);
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [receiptResult, setReceiptResult] = useState<CustomerPayment | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setAmount(outstanding > 0 ? String(outstanding) : '');
    setPaymentMode('cash');
    setReferenceNumber('');
    setSelectedInvoiceId('');
    setAllowAdvance(false);
    setNotes('');
    setIdempotencyKey(generateIdempotencyKey('khata_pay'));
    setConfirmStep(false);
    setSubmitting(false);
    setErrorMsg(null);
    setReceiptResult(null);
  }, [isOpen, customer.id, outstanding]);

  const numericAmount = roundPaise(Number(amount) || 0);
  const exceedsOutstanding = numericAmount > outstanding;

  const allocationPreview = useMemo(() => {
    if (numericAmount <= 0) return { appliedToBal: 0, addedAdvance: 0, lines: [] as Array<{ invoiceNumber: string; allocated: number }> };
    const appliedToBal = Math.min(outstanding, numericAmount);
    const addedAdvance = roundPaise(Math.max(0, numericAmount - appliedToBal));

    let remaining = appliedToBal;
    const lines: Array<{ invoiceNumber: string; allocated: number }> = [];

    if (selectedInvoiceId) {
      const target = unpaidInvoices.find(i => i.id === selectedInvoiceId);
      if (target && remaining > 0) {
        const alloc = Math.min(target.balanceDue, remaining);
        lines.push({ invoiceNumber: target.invoiceNumber, allocated: roundPaise(alloc) });
        remaining = roundPaise(remaining - alloc);
      }
    }

    const sortedUnpaid = [...unpaidInvoices]
      .filter(i => i.balanceDue > 0 && i.id !== selectedInvoiceId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const inv of sortedUnpaid) {
      if (remaining <= 0) break;
      const alloc = Math.min(inv.balanceDue, remaining);
      if (alloc > 0) {
        lines.push({ invoiceNumber: inv.invoiceNumber, allocated: roundPaise(alloc) });
        remaining = roundPaise(remaining - alloc);
      }
    }

    return { appliedToBal: roundPaise(appliedToBal), addedAdvance, lines };
  }, [numericAmount, outstanding, selectedInvoiceId, unpaidInvoices]);

  if (!isOpen) return null;

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (numericAmount <= 0) {
      setErrorMsg('Enter a valid payment amount greater than ₹0.');
      return;
    }
    if (exceedsOutstanding && !allowAdvance) {
      setErrorMsg(
        `Payment ₹${numericAmount.toFixed(2)} exceeds outstanding ₹${outstanding.toFixed(2)}. Enable "Keep excess as Advance Credit" to proceed.`
      );
      return;
    }
    setConfirmStep(true);
  };

  const handleConfirmSubmit = async () => {
    if (submitting) return;
    setErrorMsg(null);

    if (isLiveApi) {
      setSubmitting(true);
      try {
        const res = await customerApi.collectKhataPayment(
          apiSession,
          customer.id,
          {
            amount: numericAmount,
            paymentMode,
            referenceNumber: referenceNumber.trim() || undefined,
            invoiceId: selectedInvoiceId || undefined,
            allowAdvance,
            notes: notes.trim() || undefined,
          },
          idempotencyKey
        );
        setReceiptResult(res.payment);
        onSuccess?.();
      } catch (err) {
        setErrorMsg(err instanceof ApiClientError ? err.detail : 'Failed to record payment');
        setConfirmStep(false);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Preview mode atomic state sync
    const prevOut = outstanding;
    const prevAdv = customer.advanceBalance ?? 0;
    const appliedToBal = Math.min(prevOut, numericAmount);
    const addedAdv = roundPaise(Math.max(0, numericAmount - appliedToBal));
    const nextOut = roundPaise(prevOut - appliedToBal);
    const nextAdv = roundPaise(prevAdv + addedAdv);
    const nowIso = new Date().toISOString();

    const payId = `pay-${Date.now().toString(36)}`;
    const ledId = `led-${Date.now().toString(36)}`;
    const receiptNo = `RCP-2026-${String(Math.floor(1000 + Math.random() * 8999))}`;

    const entryTypeMap: Record<KhataPaymentMode, CustomerLedgerEntry['entryType']> = {
      cash: 'CASH_PAYMENT',
      upi: 'UPI_PAYMENT',
      card: 'CARD_PAYMENT',
      bank_transfer: 'BANK_TRANSFER',
    };

    // Allocate across local bills in preview mode
    let remainingToAlloc = appliedToBal;
    const allocs: CustomerPayment['allocations'] = [];

    const orderedInvoices = [
      ...unpaidInvoices.filter(i => i.id === selectedInvoiceId),
      ...unpaidInvoices
        .filter(i => i.id !== selectedInvoiceId && i.balanceDue > 0)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    ];

    for (const inv of orderedInvoices) {
      if (remainingToAlloc <= 0) break;
      const alloc = roundPaise(Math.min(inv.balanceDue, remainingToAlloc));
      if (alloc > 0) {
        allocs.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          allocatedAmount: alloc,
          previousBalanceDue: inv.balanceDue,
          newBalanceDue: roundPaise(inv.balanceDue - alloc),
        });
        recordBillPayment(inv.id, {
          mode: paymentMode,
          amount: alloc,
          referenceNumber: referenceNumber.trim() || undefined,
        });
        remainingToAlloc = roundPaise(remainingToAlloc - alloc);
      }
    }

    if (orderedInvoices.length === 0) {
      updateCustomerRecord(customer.id, {
        khataBalance: nextOut,
        advanceBalance: nextAdv,
        totalPayments: roundPaise((customer.totalPayments || 0) + numericAmount),
        lastPaymentDate: nowIso.slice(0, 10),
      });
      appendCustomerLedgerEntry({
        id: ledId,
        tenantId: store.id,
        branchId: 'main',
        customerId: customer.id,
        entryType: entryTypeMap[paymentMode],
        direction: 'CREDIT',
        amount: numericAmount,
        appliedToBalance: appliedToBal,
        advanceDelta: addedAdv,
        previousBalance: prevOut,
        runningBalance: nextOut,
        previousAdvanceBalance: prevAdv,
        runningAdvanceBalance: nextAdv,
        referenceType: 'khata_payment',
        referenceId: payId,
        paymentId: payId,
        paymentMode,
        referenceNumber: referenceNumber.trim() || null,
        description: `Khata collection (${receiptNo})`,
        performedBy: currentUser.id,
        performedByName: currentUser.name,
        timestamp: nowIso,
      });
    } else if (addedAdv > 0) {
      updateCustomerRecord(customer.id, {
        khataBalance: nextOut,
        advanceBalance: nextAdv,
      });
    }

    const paymentRec: CustomerPayment = {
      id: payId,
      receiptNumber: receiptNo,
      tenantId: store.id,
      branchId: 'main',
      customerId: customer.id,
      customerName: customer.name,
      amount: numericAmount,
      appliedToBalance: appliedToBal,
      addedToAdvance: addedAdv,
      paymentMode,
      referenceNumber: referenceNumber.trim() || null,
      paymentDate: nowIso,
      allocations: allocs,
      notes: notes.trim() || null,
      recordedBy: currentUser.id,
      recordedByName: currentUser.name,
      ledgerEntryId: ledId,
      timestamp: nowIso,
    };

    if (orderedInvoices.length === 0) {
      appendCustomerPayment(paymentRec);
    }

    setReceiptResult(paymentRec);
    onSuccess?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-emerald-700" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Collect Khata Payment</h3>
              <p className="text-[11px] text-slate-500">{customer.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {receiptResult ? (
          <div className="p-6 text-center space-y-3 text-xs">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <div>
              <h4 className="text-base font-bold text-slate-900">Payment Receipt Issued</h4>
              <p className="font-mono font-semibold text-slate-700 mt-0.5">
                {receiptResult.receiptNumber} · {formatINR(receiptResult.amount)}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left space-y-1 font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-500">Applied to Dues:</span>
                <span className="font-semibold text-slate-900">{formatINR(receiptResult.appliedToBalance)}</span>
              </div>
              {receiptResult.addedToAdvance > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Added to Advance:</span>
                  <span className="font-semibold text-blue-700">{formatINR(receiptResult.addedToAdvance)}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold"
            >
              Done
            </button>
          </div>
        ) : confirmStep ? (
          <div className="p-6 space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="font-bold text-slate-900">Confirm Payment Posting</div>
              <div className="flex justify-between font-mono tabular-nums">
                <span className="text-slate-600">Amount Received:</span>
                <span className="font-bold text-slate-900">{formatINR(numericAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Mode:</span>
                <span className="font-semibold uppercase text-slate-800">{paymentMode.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between font-mono tabular-nums">
                <span className="text-slate-600">Applied to Balance:</span>
                <span className="font-semibold text-emerald-700">{formatINR(allocationPreview.appliedToBal)}</span>
              </div>
              {allocationPreview.addedAdvance > 0 && (
                <div className="flex justify-between font-mono tabular-nums">
                  <span className="text-slate-600">Advance Credit Added:</span>
                  <span className="font-semibold text-blue-700">{formatINR(allocationPreview.addedAdvance)}</span>
                </div>
              )}
              {allocationPreview.lines.length > 0 && (
                <div className="pt-2 border-t border-slate-200 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500">Invoice Allocation:</span>
                  {allocationPreview.lines.map(l => (
                    <div key={l.invoiceNumber} className="flex justify-between font-mono text-[11px]">
                      <span>{l.invoiceNumber}</span>
                      <span>{formatINR(l.allocated)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmStep(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-900"
              >
                Back
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmSubmit}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-lg"
              >
                {submitting ? 'Posting...' : 'Confirm & Issue Receipt'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleContinue} className="p-6 space-y-3.5 text-xs">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between font-mono tabular-nums">
              <span className="text-slate-600">Current Khata Due:</span>
              <span className="text-sm font-bold text-amber-700">{formatINR(outstanding)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Amount Received (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums font-bold border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Payment Mode *
                </label>
                <select
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value as KhataPaymentMode)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:border-blue-600"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / QR</option>
                  <option value="card">Card / POS</option>
                  <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Invoice Allocation Strategy
              </label>
              <select
                value={selectedInvoiceId}
                onChange={e => setSelectedInvoiceId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:border-blue-600"
              >
                <option value="">FIFO — Oldest Unpaid Invoices First</option>
                {unpaidInvoices
                  .filter(i => i.balanceDue > 0)
                  .map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — Due {formatINR(inv.balanceDue)}
                    </option>
                  ))}
              </select>
            </div>

            {exceedsOutstanding && (
              <label className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowAdvance}
                  onChange={e => setAllowAdvance(e.target.checked)}
                  className="rounded text-blue-600 mt-0.5"
                />
                <span>
                  Keep excess <strong>{formatINR(numericAmount - outstanding)}</strong> as Customer Advance Credit
                </span>
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  UTR / Reference #
                </label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={referenceNumber}
                  onChange={e => setReferenceNumber(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Monthly settlement"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
              >
                Review Receipt
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

interface CreditLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerAccount;
  onSuccess?: () => void;
}

export const CreditLimitModal: React.FC<CreditLimitModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSuccess,
}) => {
  const { apiSession, updateCustomerRecord } = usePharmacy();
  const isLiveApi = Boolean(apiSession.bearerToken);

  const [creditLimit, setCreditLimit] = useState<string>(String(customer.creditLimit ?? 5000));
  const [creditEnabled, setCreditEnabled] = useState<boolean>(customer.creditEnabled);
  const [creditTermsDays, setCreditTermsDays] = useState<0 | 7 | 15 | 30>(customer.creditTermsDays ?? 15);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCreditLimit(String(customer.creditLimit ?? 5000));
    setCreditEnabled(customer.creditEnabled);
    setCreditTermsDays(customer.creditTermsDays ?? 15);
    setReason('');
    setErrorMsg(null);
  }, [isOpen, customer]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    const numLimit = roundPaise(Number(creditLimit) || 0);
    if (numLimit < 0) {
      setErrorMsg('Credit limit cannot be negative.');
      return;
    }

    if (isLiveApi) {
      setSubmitting(true);
      try {
        await customerApi.updateCreditLimit(apiSession, customer.id, {
          creditLimit: numLimit,
          creditEnabled,
          creditTermsDays,
          reason: reason.trim() || undefined,
        });
        onSuccess?.();
        onClose();
      } catch (err) {
        setErrorMsg(err instanceof ApiClientError ? err.detail : 'Failed to update credit policy');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    updateCustomerRecord(customer.id, {
      creditLimit: numLimit,
      creditEnabled,
      creditTermsDays,
    });
    onSuccess?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Manage Khata Credit Policy</h3>
              <p className="text-[11px] text-slate-500">{customer.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">{errorMsg}</div>
          )}

          <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={creditEnabled}
              onChange={e => setCreditEnabled(e.target.checked)}
              className="rounded text-blue-600"
            />
            <span>Khata Credit Enabled for this customer</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Credit Limit (₹) *
              </label>
              <input
                type="number"
                min="0"
                step="100"
                required
                value={creditLimit}
                onChange={e => setCreditLimit(e.target.value)}
                className="w-full px-3 py-2 font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Payment Terms
              </label>
              <select
                value={creditTermsDays}
                onChange={e => setCreditTermsDays(Number(e.target.value) as 0 | 7 | 15 | 30)}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg bg-white"
              >
                <option value={0}>Due Immediately</option>
                <option value={7}>Net 7 Days</option>
                <option value={15}>Net 15 Days</option>
                <option value={30}>Net 30 Days</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Audit Reason (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Monthly chronic refill approval"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
            >
              {submitting ? 'Updating...' : 'Save Credit Policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface CreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerAccount;
  invoices: BackendInvoiceRecord[];
  onSuccess?: () => void;
}

export const CreditNoteModal: React.FC<CreditNoteModalProps> = ({
  isOpen,
  onClose,
  customer,
  invoices,
  onSuccess,
}) => {
  const { apiSession, store, currentUser, updateCustomerRecord, appendCustomerLedgerEntry } = usePharmacy();
  const isLiveApi = Boolean(apiSession.bearerToken);

  const [amount, setAmount] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [reduceInvoiceDue, setReduceInvoiceDue] = useState(true);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setAmount('');
    setInvoiceId('');
    setReduceInvoiceDue(true);
    setReason('');
    setConfirming(false);
    setErrorMsg(null);
    setIdempotencyKey(generateIdempotencyKey('cn'));
  }, [isOpen, customer.id]);

  if (!isOpen) return null;

  const numericAmount = roundPaise(Number(amount) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (numericAmount <= 0 || reason.trim().length < 3) {
      setErrorMsg('Provide a positive amount and a reason (minimum 3 characters).');
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }

    if (isLiveApi) {
      setSubmitting(true);
      try {
        await customerApi.issueCreditNote(
          apiSession,
          customer.id,
          {
            amount: numericAmount,
            reason: reason.trim(),
            invoiceId: invoiceId || undefined,
            reduceInvoiceDue,
          },
          idempotencyKey
        );
        onSuccess?.();
        onClose();
      } catch (err) {
        setErrorMsg(err instanceof ApiClientError ? err.detail : 'Failed to issue credit note');
        setConfirming(false);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const prevOut = customer.currentOutstandingBalance ?? 0;
    const prevAdv = customer.advanceBalance ?? 0;
    const appliedToBal = Math.min(prevOut, numericAmount);
    const addedAdv = roundPaise(numericAmount - appliedToBal);
    const nextOut = roundPaise(prevOut - appliedToBal);
    const nextAdv = roundPaise(prevAdv + addedAdv);
    const nowIso = new Date().toISOString();

    updateCustomerRecord(customer.id, { khataBalance: nextOut, advanceBalance: nextAdv });
    appendCustomerLedgerEntry({
      id: `led-${Date.now().toString(36)}`,
      tenantId: store.id,
      branchId: 'main',
      customerId: customer.id,
      entryType: 'CREDIT_NOTE',
      direction: 'CREDIT',
      amount: numericAmount,
      appliedToBalance: appliedToBal,
      advanceDelta: addedAdv,
      previousBalance: prevOut,
      runningBalance: nextOut,
      previousAdvanceBalance: prevAdv,
      runningAdvanceBalance: nextAdv,
      referenceType: 'credit_note',
      invoiceId: invoiceId || null,
      invoiceNumber: invoices.find(i => i.id === invoiceId)?.invoiceNumber || null,
      description: `Credit Note issued (${formatINR(numericAmount)})`,
      reason: reason.trim(),
      performedBy: currentUser.id,
      performedByName: currentUser.name,
      timestamp: nowIso,
    });
    onSuccess?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileMinus className="w-4 h-4 text-purple-700" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Issue Khata Credit Note</h3>
              <p className="text-[11px] text-slate-500">{customer.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">{errorMsg}</div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Credit Note Amount (₹) *
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              disabled={confirming}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums font-bold border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Link to Invoice (Optional)
            </label>
            <select
              disabled={confirming}
              value={invoiceId}
              onChange={e => setInvoiceId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">General Account Credit Note</option>
              {invoices.map(inv => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — Total {formatINR(inv.grandTotal)} (Due {formatINR(inv.balanceDue)})
                </option>
              ))}
            </select>
          </div>

          {invoiceId && (
            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                disabled={confirming}
                checked={reduceInvoiceDue}
                onChange={e => setReduceInvoiceDue(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>Apply credit note directly against selected invoice balance due</span>
            </label>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Reason / Justification *
            </label>
            <textarea
              required
              minLength={3}
              rows={2}
              disabled={confirming}
              placeholder="e.g. Damaged strip goodwill credit / billing rebate"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          {confirming && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
              Confirm posting an immutable <strong>{formatINR(numericAmount)}</strong> CREDIT_NOTE to{' '}
              <strong>{customer.name}</strong>&apos;s Khata ledger.
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={confirming ? () => setConfirming(false) : onClose}
              className="px-4 py-2 text-slate-600"
            >
              {confirming ? 'Back' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-lg"
            >
              {submitting ? 'Posting...' : confirming ? 'Confirm Credit Note' : 'Review Credit Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface BalanceAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerAccount;
  onSuccess?: () => void;
}

export const BalanceAdjustmentModal: React.FC<BalanceAdjustmentModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSuccess,
}) => {
  const { apiSession, store, currentUser, updateCustomerRecord, appendCustomerLedgerEntry } = usePharmacy();
  const isLiveApi = Boolean(apiSession.bearerToken);

  const [adjustmentType, setAdjustmentType] = useState<
    'DEBIT_ADJUSTMENT' | 'CREDIT_ADJUSTMENT' | 'OPENING_BALANCE' | 'REFUND'
  >('CREDIT_ADJUSTMENT');
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setAdjustmentType('CREDIT_ADJUSTMENT');
    setAmount('');
    setReferenceNumber('');
    setReason('');
    setConfirming(false);
    setErrorMsg(null);
    setIdempotencyKey(generateIdempotencyKey('adj'));
  }, [isOpen, customer.id]);

  if (!isOpen) return null;

  const numericAmount = roundPaise(Number(amount) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (numericAmount <= 0 || reason.trim().length < 3) {
      setErrorMsg('Enter a valid amount and an audit reason (min 3 chars).');
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }

    if (isLiveApi) {
      setSubmitting(true);
      try {
        await customerApi.createBalanceAdjustment(
          apiSession,
          customer.id,
          {
            adjustmentType,
            amount: numericAmount,
            reason: reason.trim(),
            referenceNumber: referenceNumber.trim() || undefined,
          },
          idempotencyKey
        );
        onSuccess?.();
        onClose();
      } catch (err) {
        setErrorMsg(err instanceof ApiClientError ? err.detail : 'Failed to post adjustment');
        setConfirming(false);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const prevOut = customer.currentOutstandingBalance ?? 0;
    const prevAdv = customer.advanceBalance ?? 0;
    let nextOut = prevOut;
    let nextAdv = prevAdv;
    let direction: 'DEBIT' | 'CREDIT' = 'CREDIT';
    let appliedToBal = 0;
    let advDelta = 0;

    if (adjustmentType === 'CREDIT_ADJUSTMENT') {
      direction = 'CREDIT';
      appliedToBal = Math.min(prevOut, numericAmount);
      advDelta = roundPaise(numericAmount - appliedToBal);
      nextOut = roundPaise(prevOut - appliedToBal);
      nextAdv = roundPaise(prevAdv + advDelta);
    } else if (adjustmentType === 'REFUND') {
      if (numericAmount > prevAdv) {
        setErrorMsg(`Refund cannot exceed available advance balance (${formatINR(prevAdv)}).`);
        setConfirming(false);
        return;
      }
      direction = 'DEBIT';
      appliedToBal = 0;
      advDelta = -numericAmount;
      nextAdv = roundPaise(prevAdv - numericAmount);
    } else {
      direction = 'DEBIT';
      const advConsumed = Math.min(prevAdv, numericAmount);
      appliedToBal = roundPaise(numericAmount - advConsumed);
      advDelta = -advConsumed;
      nextOut = roundPaise(prevOut + appliedToBal);
      nextAdv = roundPaise(prevAdv - advConsumed);
    }

    updateCustomerRecord(customer.id, { khataBalance: nextOut, advanceBalance: nextAdv });
    appendCustomerLedgerEntry({
      id: `led-${Date.now().toString(36)}`,
      tenantId: store.id,
      branchId: 'main',
      customerId: customer.id,
      entryType: adjustmentType,
      direction,
      amount: numericAmount,
      appliedToBalance: appliedToBal,
      advanceDelta: advDelta,
      previousBalance: prevOut,
      runningBalance: nextOut,
      previousAdvanceBalance: prevAdv,
      runningAdvanceBalance: nextAdv,
      referenceType: 'adjustment',
      referenceNumber: referenceNumber.trim() || null,
      description: `${adjustmentType.replace('_', ' ')} (${formatINR(numericAmount)})`,
      reason: reason.trim(),
      performedBy: currentUser.id,
      performedByName: currentUser.name,
      timestamp: new Date().toISOString(),
    });
    onSuccess?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-800" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Audited Balance Adjustment</h3>
              <p className="text-[11px] text-slate-500">{customer.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">{errorMsg}</div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Adjustment Type *
            </label>
            <select
              disabled={confirming}
              value={adjustmentType}
              onChange={e => setAdjustmentType(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="CREDIT_ADJUSTMENT">Credit Adjustment (Reduce Due)</option>
              <option value="DEBIT_ADJUSTMENT">Debit Adjustment (Increase Due)</option>
              <option value="OPENING_BALANCE">Opening Balance Entry</option>
              <option value="REFUND">Refund Advance Credit to Customer</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Amount (₹) *
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                disabled={confirming}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full px-3 py-2 font-mono tabular-nums font-bold border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Reference #
              </label>
              <input
                type="text"
                disabled={confirming}
                placeholder="Optional voucher ref"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Mandatory Audit Reason *
            </label>
            <textarea
              required
              minLength={3}
              rows={2}
              disabled={confirming}
              placeholder="Explain the accounting adjustment..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          {confirming && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
              Confirm posting <strong>{adjustmentType}</strong> of <strong>{formatINR(numericAmount)}</strong> to immutable ledger.
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={confirming ? () => setConfirming(false) : onClose}
              className="px-4 py-2 text-slate-600"
            >
              {confirming ? 'Back' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg"
            >
              {submitting ? 'Posting...' : confirming ? 'Commit Adjustment' : 'Review Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface WhatsAppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerAccount;
  dateFrom?: string;
  dateTo?: string;
}

export const WhatsAppShareModal: React.FC<WhatsAppShareModalProps> = ({
  isOpen,
  onClose,
  customer,
  dateFrom,
  dateTo,
}) => {
  const { apiSession, store } = usePharmacy();
  const isLiveApi = Boolean(apiSession.bearerToken);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shareData, setShareData] = useState<{
    messageText: string;
    whatsappUrl: string;
    deliveryStatus: 'USER_ACTION_REQUIRED';
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setShareData(null);

    if (isLiveApi) {
      setLoading(true);
      customerApi
        .prepareWhatsAppStatement(apiSession, customer.id, {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          storeName: store.name,
        })
        .then(res => setShareData(res))
        .catch(err =>
          setErrorMsg(err instanceof ApiClientError ? err.detail : 'Unable to prepare WhatsApp summary')
        )
        .finally(() => setLoading(false));
    } else {
      // Strictly sanitized financial-only message (zero clinical/sensitive details)
      const outstanding = customer.currentOutstandingBalance ?? 0;
      const advance = customer.advanceBalance ?? 0;
      const digits = customer.phone.replace(/\D/g, '');
      const waPhone = digits.length === 10 ? `91${digits}` : digits;
      const msg = [
        `Namaste ${customer.name},`,
        `Khata Statement Summary from ${store.name}:`,
        `Current Outstanding Due: ${formatINR(outstanding)}`,
        advance > 0 ? `Advance Credit Available: ${formatINR(advance)}` : null,
        `Period: ${dateFrom || 'All Time'} to ${dateTo || new Date().toISOString().slice(0, 10)}`,
        `Please ignore if already settled. Thank you.`,
      ]
        .filter(Boolean)
        .join('\n');

      setShareData({
        messageText: msg,
        whatsappUrl: `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`,
        deliveryStatus: 'USER_ACTION_REQUIRED',
      });
    }
  }, [isOpen, isLiveApi, apiSession, customer, dateFrom, dateTo, store.name]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquareShare className="w-4 h-4 text-emerald-700" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Share Statement via WhatsApp</h3>
              <p className="text-[11px] text-slate-500">Sanitized financial summary only · No medical/clinical data</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {loading && <div className="py-6 text-center text-slate-500">Generating sanitized summary...</div>}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">{errorMsg}</div>
          )}

          {shareData && (
            <>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl whitespace-pre-wrap font-mono text-[11px] text-slate-800">
                {shareData.messageText}
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                Status: <strong>{shareData.deliveryStatus}</strong> — Clicking below launches WhatsApp Web / App with the pre-filled message for you to send manually.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600">
                  Close
                </button>
                <a
                  href={shareData.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg inline-flex items-center gap-1.5"
                >
                  <span>Open WhatsApp Web</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface StatusArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerAccount;
  mode: 'status' | 'archive';
  onSuccess?: () => void;
}

export const StatusArchiveConfirmModal: React.FC<StatusArchiveModalProps> = ({
  isOpen,
  onClose,
  customer,
  mode,
  onSuccess,
}) => {
  const { apiSession, updateCustomerRecord } = usePharmacy();
  const isLiveApi = Boolean(apiSession.bearerToken);

  const [targetStatus, setTargetStatus] = useState<CustomerStatus>(customer.status);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTargetStatus(customer.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED');
    setReason('');
    setErrorMsg(null);
  }, [isOpen, customer]);

  if (!isOpen) return null;

  const outstanding = customer.currentOutstandingBalance ?? 0;
  const advance = customer.advanceBalance ?? 0;
  const archiveBlockedByBalance = mode === 'archive' && (outstanding > 0 || advance > 0);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || archiveBlockedByBalance) return;
    setErrorMsg(null);

    if (isLiveApi) {
      setSubmitting(true);
      try {
        if (mode === 'archive') {
          await customerApi.archiveCustomer(apiSession, customer.id, reason.trim() || undefined);
        } else {
          await customerApi.updateCustomerStatus(
            apiSession,
            customer.id,
            targetStatus,
            reason.trim() || undefined
          );
        }
        onSuccess?.();
        onClose();
      } catch (err) {
        setErrorMsg(err instanceof ApiClientError ? err.detail : 'Operation failed');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode === 'archive') {
      updateCustomerRecord(customer.id, { isArchived: true, status: 'INACTIVE' });
    } else {
      updateCustomerRecord(customer.id, { status: targetStatus });
    }
    onSuccess?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'archive' ? (
              <Archive className="w-4 h-4 text-red-600" />
            ) : (
              <Ban className="w-4 h-4 text-amber-700" />
            )}
            <h3 className="text-sm font-bold text-slate-900">
              {mode === 'archive' ? 'Archive Customer Account' : 'Update Customer Account Status'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">{errorMsg}</div>
          )}

          {archiveBlockedByBalance && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
              Cannot archive <strong>{customer.name}</strong> while Khata balance ({formatINR(outstanding)}) or Advance credit ({formatINR(advance)}) is non-zero. Settle balances to ₹0.00 first.
            </div>
          )}

          {mode === 'status' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Account Status
              </label>
              <select
                value={targetStatus}
                onChange={e => setTargetStatus(e.target.value as CustomerStatus)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="ACTIVE">ACTIVE — Normal retail & Khata access</option>
                <option value="INACTIVE">INACTIVE — Dormant account (no new Khata)</option>
                <option value="BLOCKED">BLOCKED — Khata credit frozen</option>
              </select>
            </div>
          )}

          {mode === 'archive' && !archiveBlockedByBalance && (
            <p className="text-slate-600">
              Archiving hides <strong>{customer.name}</strong> from default POS & directory views while preserving all historical invoices and Khata ledger entries for statutory audit.
            </p>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Reason (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Overdue 45 days / Duplicate account"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || archiveBlockedByBalance}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-semibold rounded-lg"
            >
              {submitting ? 'Processing...' : mode === 'archive' ? 'Confirm Archive' : 'Update Status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

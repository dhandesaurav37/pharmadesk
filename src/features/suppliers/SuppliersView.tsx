/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Truck,
  Search,
  Plus,
  Phone,
  Mail,
  FileText,
  Download,
  CreditCard,
  ShieldAlert,
  Archive,
  CheckCircle2,
  X,
  Paperclip,
  Edit3,
  Printer,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { Supplier, SupplierPaymentMode, SupplierStatus, SupplierType } from '../../types/pharmacy.ts';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

const INDIAN_STATES: Array<{ code: string; name: string }> = [
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '24', name: 'Gujarat' },
  { code: '07', name: 'Delhi' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '19', name: 'West Bengal' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '08', name: 'Rajasthan' },
  { code: '32', name: 'Kerala' },
  { code: '23', name: 'Madhya Pradesh' },
];

export const SuppliersView: React.FC = () => {
  const {
    suppliers,
    addSupplier,
    updateSupplierRecord,
    updateSupplierStatus,
    archiveSupplier,
    purchaseOrders,
    goodsReceipts,
    supplierInvoices,
    supplierPayments,
    supplierReturns,
    recordSupplierPayment,
    hasUserPermission,
    currentUser,
    setActiveModule,
  } = usePharmacy();

  const canCreate = hasUserPermission('suppliers.create');
  const canUpdate = hasUserPermission('suppliers.update');
  const canArchive = hasUserPermission('suppliers.archive');
  const canViewFinancials = hasUserPermission('suppliers.view_financials');
  const canViewBank = hasUserPermission('suppliers.view_bank_details');
  const canExport = hasUserPermission('suppliers.export');
  const canPay = hasUserPermission('supplier_payments.create');
  const isOwner = currentUser.role === 'owner';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SupplierStatus>('ALL');
  const [showArchived, setShowArchived] = useState(false);
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);

  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<'overview' | 'history' | 'invoices' | 'statement' | 'attachments'>('overview');

  // Add/Edit Supplier Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Mumbai');
  const [stateName, setStateName] = useState('Maharashtra');
  const [stateCode, setStateCode] = useState('27');
  const [pincode, setPincode] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [dlNumber, setDlNumber] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [supplierType, setSupplierType] = useState<SupplierType>('DISTRIBUTOR');
  const [creditPeriodDays, setCreditPeriodDays] = useState(21);
  const [creditLimit, setCreditLimit] = useState(200000);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [bankHolder, setBankHolder] = useState('');
  const [bankAcc, setBankAcc] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [notes, setNotes] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Payment Modal State
  const [paymentModalSupplier, setPaymentModalSupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<SupplierPaymentMode>('NEFT_RTGS');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payAllowAdvance, setPayAllowAdvance] = useState(false);

  // Attachment Modal State
  const [attachName, setAttachName] = useState('');

  const selectedSupplier = useMemo(
    () => suppliers.find(s => s.id === selectedSupplierId) || null,
    [suppliers, selectedSupplierId]
  );

  const kpis = useMemo(() => {
    const nonArchived = suppliers.filter(s => !s.isArchived);
    const activeCount = nonArchived.filter(s => (s.status || 'ACTIVE') === 'ACTIVE').length;
    const totalPayables = nonArchived.reduce((s, x) => s + (x.outstandingBalance || 0), 0);
    const totalAdvance = nonArchived.reduce((s, x) => s + (x.advanceBalance || 0), 0);
    const totalPurchases = nonArchived.reduce((s, x) => s + (x.totalPurchases || 0), 0);
    return { activeCount, totalCount: nonArchived.length, totalPayables, totalAdvance, totalPurchases };
  }, [suppliers]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      if (!showArchived && s.isArchived) return false;
      if (statusFilter !== 'ALL' && (s.status || 'ACTIVE') !== statusFilter) return false;
      if (onlyOutstanding && (s.outstandingBalance || 0) <= 0) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        s.agencyName.toLowerCase().includes(q) ||
        (s.legalName || '').toLowerCase().includes(q) ||
        (s.supplierCode || '').toLowerCase().includes(q) ||
        s.contactPerson.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        (s.gstin || '').toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q)
      );
    });
  }, [suppliers, search, statusFilter, showArchived, onlyOutstanding]);

  const openAddModal = () => {
    setEditingSupplier(null);
    setLegalName('');
    setTradeName('');
    setContactPerson('');
    setPrimaryPhone('');
    setEmail('');
    setCity('Mumbai');
    setStateName('Maharashtra');
    setStateCode('27');
    setPincode('');
    setBillingAddress('');
    setDlNumber('');
    setGstin('');
    setPan('');
    setSupplierType('DISTRIBUTOR');
    setCreditPeriodDays(21);
    setCreditLimit(200000);
    setOpeningBalance(0);
    setBankHolder('');
    setBankAcc('');
    setBankIfsc('');
    setBankName('');
    setUpiId('');
    setNotes('');
    setDuplicateWarning(null);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (sup: Supplier) => {
    setEditingSupplier(sup);
    setLegalName(sup.legalName || sup.agencyName);
    setTradeName(sup.agencyName);
    setContactPerson(sup.contactPerson);
    setPrimaryPhone(sup.phone);
    setEmail(sup.email || '');
    setCity(sup.city || 'Mumbai');
    setStateName(sup.state || 'Maharashtra');
    setStateCode(sup.stateCode || '27');
    setPincode(sup.pincode || '');
    setBillingAddress(sup.billingAddress || '');
    setDlNumber(sup.dlNumber || '');
    setGstin(sup.gstin || '');
    setPan(sup.pan || '');
    setSupplierType(sup.supplierType || 'DISTRIBUTOR');
    setCreditPeriodDays(sup.creditPeriodDays ?? 21);
    setCreditLimit(sup.creditLimit ?? 0);
    setOpeningBalance(sup.openingBalance ?? sup.outstandingBalance ?? 0);
    setBankHolder(sup.bankDetails?.accountHolderName || '');
    setBankAcc(sup.bankDetails?.accountNumber || '');
    setBankIfsc(sup.bankDetails?.ifscCode || '');
    setBankName(sup.bankDetails?.bankName || '');
    setUpiId(sup.bankDetails?.upiId || '');
    setNotes(sup.notes || '');
    setDuplicateWarning(null);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSaveSupplier = (confirmDuplicate = false) => {
    setFormError(null);
    const cleanGstin = gstin.trim().toUpperCase();
    const cleanPan = pan.trim().toUpperCase();

    if (!legalName.trim() || !contactPerson.trim() || !primaryPhone.trim()) {
      setFormError('Legal name, contact person, and primary phone are required.');
      return;
    }
    if (cleanGstin && !GSTIN_REGEX.test(cleanGstin)) {
      setFormError(`Invalid GSTIN '${cleanGstin}'. Expected 15-character GSTIN e.g. 27AAECM4019C1Z4.`);
      return;
    }
    if (cleanPan && !PAN_REGEX.test(cleanPan)) {
      setFormError(`Invalid PAN '${cleanPan}'. Expected 10-character PAN e.g. AAECM4019C.`);
      return;
    }
    const phoneDigits = primaryPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 12) {
      setFormError('Enter a valid 10-digit Indian mobile or landline number.');
      return;
    }
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) {
      setFormError('PIN code must be 6 digits.');
      return;
    }

    const effectiveTrade = (tradeName.trim() || legalName.trim()).trim();
    const formattedPhone = primaryPhone.trim().startsWith('+91')
      ? primaryPhone.trim()
      : `+91 ${phoneDigits.slice(-10, -5)} ${phoneDigits.slice(-5)}`;

    if (!editingSupplier && !confirmDuplicate) {
      const dupe = suppliers.find(s => {
        if (s.isArchived) return false;
        const matchGstin = Boolean(cleanGstin && s.gstin?.toUpperCase() === cleanGstin);
        const matchPhone = s.phone.replace(/\D/g, '').slice(-10) === phoneDigits.slice(-10);
        const matchName = s.agencyName.trim().toLowerCase() === effectiveTrade.toLowerCase();
        return matchGstin || matchPhone || matchName;
      });
      if (dupe) {
        setDuplicateWarning(
          `Possible duplicate supplier detected matching existing record '${dupe.agencyName}' (${dupe.supplierCode || dupe.id}). Click "Confirm & Create Anyway" only if this is a distinct vendor.`
        );
        return;
      }
    }

    const bankDetails = canViewBank
      ? {
          accountHolderName: bankHolder.trim() || null,
          accountNumber: bankAcc.trim() || null,
          ifscCode: bankIfsc.trim().toUpperCase() || null,
          bankName: bankName.trim() || null,
          upiId: upiId.trim() || null,
        }
      : undefined;

    if (editingSupplier) {
      updateSupplierRecord(editingSupplier.id, {
        legalName: legalName.trim(),
        agencyName: effectiveTrade,
        contactPerson: contactPerson.trim(),
        phone: formattedPhone,
        email: email.trim(),
        city: city.trim(),
        state: stateName,
        stateCode: cleanGstin ? cleanGstin.slice(0, 2) : stateCode,
        pincode: pincode.trim(),
        billingAddress: billingAddress.trim(),
        dlNumber: dlNumber.trim().toUpperCase(),
        gstin: cleanGstin,
        pan: cleanPan || null,
        supplierType,
        creditPeriodDays: Number(creditPeriodDays) || 0,
        paymentTerms: `Net ${Number(creditPeriodDays) || 0} days`,
        creditLimit: Number(creditLimit) || 0,
        bankDetails: bankDetails ?? editingSupplier.bankDetails,
        notes: notes.trim() || null,
      });
      setBannerMessage({ type: 'ok', text: `Updated supplier '${effectiveTrade}'.` });
    } else {
      addSupplier({
        agencyName: effectiveTrade,
        legalName: legalName.trim(),
        contactPerson: contactPerson.trim(),
        phone: formattedPhone,
        email: email.trim(),
        city: city.trim(),
        state: stateName,
        stateCode: cleanGstin ? cleanGstin.slice(0, 2) : stateCode,
        pincode: pincode.trim(),
        billingAddress: billingAddress.trim(),
        dlNumber: dlNumber.trim().toUpperCase(),
        gstin: cleanGstin,
        pan: cleanPan || null,
        supplierType,
        creditPeriodDays: Number(creditPeriodDays) || 0,
        paymentTerms: `Net ${Number(creditPeriodDays) || 0} days`,
        creditLimit: Number(creditLimit) || 0,
        openingBalance: Number(openingBalance) || 0,
        outstandingBalance: Number(openingBalance) || 0,
        advanceBalance: 0,
        totalPurchases: 0,
        totalPayments: 0,
        bankDetails: bankDetails || null,
        notes: notes.trim() || null,
      });
      setBannerMessage({ type: 'ok', text: `Added distributor '${effectiveTrade}'.` });
    }

    setIsFormOpen(false);
    setDuplicateWarning(null);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalSupplier) return;
    const amt = Number(payAmount);
    const res = recordSupplierPayment({
      supplierId: paymentModalSupplier.id,
      paymentMode: payMode,
      amount: amt,
      referenceNumber: payRef.trim() || undefined,
      notes: payNotes.trim() || undefined,
      allowAdvance: payAllowAdvance,
    });
    if (!res.ok) {
      setBannerMessage({ type: 'err', text: res.error || 'Payment failed' });
      return;
    }
    setBannerMessage({
      type: 'ok',
      text: `Recorded payment ${res.payment?.paymentNumber} of ₹${amt.toFixed(2)} to ${paymentModalSupplier.agencyName}.`,
    });
    setPaymentModalSupplier(null);
    setPayAmount('');
    setPayRef('');
    setPayNotes('');
  };

  // Statement rows computed for selected supplier
  const statementRows = useMemo(() => {
    if (!selectedSupplier) return [];
    const rows: Array<{
      date: string;
      type: string;
      ref: string;
      desc: string;
      debit: number;
      credit: number;
      balance: number;
    }> = [];

    const openBal = selectedSupplier.openingBalance ?? 0;
    if (openBal > 0) {
      rows.push({
        date: '2026-10-01',
        type: 'OPENING',
        ref: selectedSupplier.supplierCode || 'OPEN',
        desc: 'Opening payable carried forward',
        debit: openBal,
        credit: 0,
        balance: 0,
      });
    }
    supplierInvoices
      .filter(i => i.supplierId === selectedSupplier.id && i.paymentStatus !== 'REVERSED')
      .forEach(i =>
        rows.push({
          date: i.invoiceDate.slice(0, 10),
          type: 'BILL',
          ref: i.supplierInvoiceNumber,
          desc: i.grnNumber ? `GRN ${i.grnNumber}` : 'Direct Supplier Bill',
          debit: i.totalAmount,
          credit: 0,
          balance: 0,
        })
      );
    supplierPayments
      .filter(p => p.supplierId === selectedSupplier.id)
      .forEach(p =>
        rows.push({
          date: p.paymentDate.slice(0, 10),
          type: 'PAYMENT',
          ref: p.paymentNumber,
          desc: `${p.paymentMode}${p.referenceNumber ? ` (${p.referenceNumber})` : ''}`,
          debit: 0,
          credit: p.amount - p.advanceAdded,
          balance: 0,
        })
      );
    supplierReturns
      .filter(r => r.supplierId === selectedSupplier.id)
      .forEach(r =>
        rows.push({
          date: r.returnDate.slice(0, 10),
          type: 'RETURN',
          ref: r.creditNoteNumber,
          desc: `Purchase return (${r.grnNumber})`,
          debit: 0,
          credit: r.payableReduced,
          balance: 0,
        })
      );

    rows.sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    return rows.map(r => {
      running = Math.round((running + r.debit - r.credit) * 100) / 100;
      return { ...r, balance: running };
    });
  }, [selectedSupplier, supplierInvoices, supplierPayments, supplierReturns]);

  const exportCsvStatement = (sup: Supplier) => {
    const header = ['Date', 'Type', 'Reference', 'Description', 'Payable Added', 'Paid / Credit', 'Balance'].join(',');
    const body = statementRows
      .map(r => [r.date, r.type, r.ref, `"${r.desc.replace(/"/g, '""')}"`, r.debit.toFixed(2), r.credit.toFixed(2), r.balance.toFixed(2)].join(','))
      .join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-statement-${sup.supplierCode || sup.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Suppliers & Accounts Payable
            </h1>
            <span className="text-xs font-mono font-semibold text-slate-500">
              {kpis.totalCount} Vendors
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pharmaceutical distributors, C&F stockists, GST compliance, payables ledger & vendor governance
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveModule('purchases')}
            className="px-3 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
          >
            Open PO & GRN Desk
          </button>
          {canCreate && (
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Supplier</span>
            </button>
          )}
        </div>
      </div>

      {bannerMessage && (
        <div
          className={`px-4 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between ${
            bannerMessage.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{bannerMessage.text}</span>
          <button onClick={() => setBannerMessage(null)} className="text-current opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Supplier Payables
          </span>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1">
            {canViewFinancials
              ? `₹${kpis.totalPayables.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
              : 'Restricted'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Open distributor credit balance</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Active Vendors
          </span>
          <div className="text-2xl font-bold font-mono text-blue-700 tabular-nums mt-1">
            {kpis.activeCount} / {kpis.totalCount}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Cleared for purchase orders & GRNs</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Supplier Advances
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-700 tabular-nums mt-1">
            {canViewFinancials
              ? `₹${kpis.totalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
              : 'Restricted'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Credit notes & pre-paid vendor funds</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Cumulative Procurement
          </span>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1">
            {canViewFinancials
              ? `₹${kpis.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
              : 'Restricted'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Posted GRN inward stock value</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search distributor name, code, GSTIN, city, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive</option>
            <option value="BLOCKED">Blocked</option>
          </select>

          <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyOutstanding}
              onChange={e => setOnlyOutstanding(e.target.checked)}
              className="rounded text-blue-600"
            />
            <span>Due &gt; ₹0</span>
          </label>

          <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              className="rounded text-blue-600"
            />
            <span>Include Archived</span>
          </label>
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filteredSuppliers.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <h3 className="text-sm font-semibold text-slate-700">No suppliers match these filters</h3>
            <p className="text-xs text-slate-500 mt-1">Clear filters or register a new distributor.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">GSTIN & DL No.</th>
                  <th className="py-3 px-4">Terms</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right font-mono">Payable Due (₹)</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map(sup => {
                  const st = sup.status || 'ACTIVE';
                  return (
                    <tr key={sup.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <button
                          onClick={() => {
                            setSelectedSupplierId(sup.id);
                            setProfileTab('overview');
                          }}
                          className="text-left group"
                        >
                          <div className="font-semibold text-slate-900 group-hover:text-blue-700">
                            {sup.agencyName}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {sup.supplierCode || sup.id} · {sup.city}
                            {sup.stateCode ? ` (State ${sup.stateCode})` : ''}
                          </div>
                        </button>
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-slate-800 font-medium">{sup.contactPerson}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{sup.phone}</div>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                        <div>{sup.gstin || 'Unregistered'}</div>
                        <div className="text-slate-500">{sup.dlNumber || 'No DL recorded'}</div>
                      </td>

                      <td className="py-3 px-4 text-slate-700">
                        <div>{sup.paymentTerms}</div>
                        {canViewFinancials && sup.creditLimit ? (
                          <div className="text-[11px] text-slate-500 font-mono">
                            Limit ₹{sup.creditLimit.toLocaleString('en-IN')}
                          </div>
                        ) : null}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`text-[11px] font-semibold ${
                            st === 'ACTIVE'
                              ? 'text-emerald-700'
                              : st === 'BLOCKED'
                              ? 'text-rose-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {sup.isArchived ? 'ARCHIVED' : st}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                        {canViewFinancials
                          ? `₹${(sup.outstandingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                          : '—'}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        <button
                          onClick={() => {
                            setSelectedSupplierId(sup.id);
                            setProfileTab('overview');
                          }}
                          className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 rounded"
                        >
                          Profile
                        </button>
                        {canPay && (sup.outstandingBalance || 0) > 0 && (
                          <button
                            onClick={() => {
                              setPaymentModalSupplier(sup);
                              setPayAmount(String(sup.outstandingBalance));
                            }}
                            className="px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 rounded"
                          >
                            Pay
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

      {/* Selected Supplier Workspace Panel */}
      {selectedSupplier && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-slate-900">{selectedSupplier.agencyName}</h2>
                <span className="text-xs font-mono text-slate-500">{selectedSupplier.supplierCode}</span>
                <span
                  className={`text-xs font-semibold ${
                    selectedSupplier.status === 'BLOCKED'
                      ? 'text-rose-700'
                      : selectedSupplier.isArchived
                      ? 'text-slate-500'
                      : 'text-emerald-700'
                  }`}
                >
                  {selectedSupplier.isArchived ? 'ARCHIVED' : selectedSupplier.status || 'ACTIVE'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedSupplier.legalName || selectedSupplier.agencyName} · GSTIN: {selectedSupplier.gstin || 'N/A'} · DL: {selectedSupplier.dlNumber || 'N/A'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canUpdate && (
                <button
                  onClick={() => openEditModal(selectedSupplier)}
                  className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}

              {canUpdate && (selectedSupplier.status === 'BLOCKED' || selectedSupplier.isArchived) && isOwner && (
                <button
                  onClick={() => {
                    updateSupplierStatus(selectedSupplier.id, 'ACTIVE');
                    setBannerMessage({ type: 'ok', text: `Owner reactivated '${selectedSupplier.agencyName}'.` });
                  }}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Reactivate (Owner)
                </button>
              )}

              {canUpdate && (selectedSupplier.status || 'ACTIVE') === 'ACTIVE' && !selectedSupplier.isArchived && (
                <button
                  onClick={() => {
                    updateSupplierStatus(selectedSupplier.id, 'BLOCKED', 'Compliance / manual hold');
                    setBannerMessage({ type: 'ok', text: `Blocked supplier '${selectedSupplier.agencyName}'.` });
                  }}
                  className="px-3 py-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Block
                </button>
              )}

              {canArchive && !selectedSupplier.isArchived && (
                <button
                  onClick={() => {
                    const res = archiveSupplier(selectedSupplier.id);
                    if (!res.ok) setBannerMessage({ type: 'err', text: res.error || 'Archive blocked' });
                    else setBannerMessage({ type: 'ok', text: `Archived '${selectedSupplier.agencyName}'.` });
                  }}
                  className="px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Archive
                </button>
              )}

              <button
                onClick={() => setSelectedSupplierId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sub-Tabs */}
          <div className="px-5 border-b border-slate-200 flex gap-5 overflow-x-auto text-xs font-semibold">
            {(
              [
                ['overview', 'Overview & Bank'],
                ['history', 'POs & GRNs'],
                ['invoices', 'Invoices & Payments'],
                ['statement', 'Statement & Exports'],
                ['attachments', 'Documents'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setProfileTab(key)}
                className={`py-3 border-b-2 whitespace-nowrap transition-colors ${
                  profileTab === key
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {profileTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    Statutory & Contact Details
                  </h3>
                  <div className="grid grid-cols-2 gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div>
                      <span className="text-slate-500 block">Primary Contact</span>
                      <span className="font-semibold text-slate-900">{selectedSupplier.contactPerson}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Phone</span>
                      <span className="font-mono font-semibold text-slate-900">{selectedSupplier.phone}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Email</span>
                      <span className="text-slate-900">{selectedSupplier.email || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">State / GST Code</span>
                      <span className="text-slate-900">
                        {selectedSupplier.state || selectedSupplier.city} ({selectedSupplier.stateCode || '27'})
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500 block">Billing Address</span>
                      <span className="text-slate-900">{selectedSupplier.billingAddress || selectedSupplier.city}</span>
                    </div>
                    {selectedSupplier.gstin && (
                      <div className="col-span-2 text-[11px] text-slate-500">
                        GSTIN format validated locally; not government-verified via GST portal.
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    Settlement & Bank Details
                  </h3>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                    {canViewFinancials ? (
                      <div className="grid grid-cols-3 gap-3 pb-3 border-b border-slate-200">
                        <div>
                          <span className="text-slate-500 block">Payable Due</span>
                          <span className="font-mono font-bold text-slate-900">
                            ₹{(selectedSupplier.outstandingBalance || 0).toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Advance</span>
                          <span className="font-mono font-bold text-emerald-700">
                            ₹{(selectedSupplier.advanceBalance || 0).toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Credit Limit</span>
                          <span className="font-mono font-semibold text-slate-800">
                            ₹{(selectedSupplier.creditLimit || 0).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-500 italic">Financial balances restricted by RBAC policy.</div>
                    )}

                    {canViewBank ? (
                      selectedSupplier.bankDetails ? (
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <span className="text-slate-500 block">Account Holder</span>
                            <span className="font-semibold text-slate-900">
                              {selectedSupplier.bankDetails.accountHolderName || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Bank / Branch</span>
                            <span className="text-slate-900">
                              {selectedSupplier.bankDetails.bankName || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Account Number</span>
                            <span className="font-mono font-semibold text-slate-900">
                              {selectedSupplier.bankDetails.accountNumber || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">IFSC / UPI</span>
                            <span className="font-mono text-slate-900">
                              {selectedSupplier.bankDetails.ifscCode || selectedSupplier.bankDetails.upiId || '—'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-500">No bank details configured yet.</div>
                      )
                    ) : (
                      <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Bank account & IFSC details redacted (requires `suppliers.view_bank_details`).
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {profileTab === 'history' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="border border-slate-200 rounded-xl p-4">
                  <h4 className="font-bold text-slate-800 mb-3">Purchase Orders</h4>
                  {purchaseOrders.filter(p => p.supplierId === selectedSupplier.id).length === 0 ? (
                    <p className="text-slate-500">No purchase orders recorded for this vendor.</p>
                  ) : (
                    <div className="space-y-2">
                      {purchaseOrders
                        .filter(p => p.supplierId === selectedSupplier.id)
                        .map(po => (
                          <div key={po.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                            <div>
                              <div className="font-mono font-semibold text-slate-900">{po.poNumber}</div>
                              <div className="text-[11px] text-slate-500">
                                {po.orderDate.slice(0, 10)} · {po.status}
                              </div>
                            </div>
                            <div className="font-mono font-semibold text-slate-900">
                              ₹{po.grandTotal.toFixed(2)}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl p-4">
                  <h4 className="font-bold text-slate-800 mb-3">Goods Receipt Notes (GRN)</h4>
                  {goodsReceipts.filter(g => g.supplierId === selectedSupplier.id).length === 0 ? (
                    <p className="text-slate-500">No goods receipts posted for this vendor.</p>
                  ) : (
                    <div className="space-y-2">
                      {goodsReceipts
                        .filter(g => g.supplierId === selectedSupplier.id)
                        .map(g => (
                          <div key={g.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                            <div>
                              <div className="font-mono font-semibold text-slate-900">{g.grnNumber}</div>
                              <div className="text-[11px] text-slate-500">
                                {g.receiptDate.slice(0, 10)} · {g.totalAcceptedQty} acc / {g.totalRejectedQty} rej · {g.status}
                              </div>
                            </div>
                            <div className="font-mono font-semibold text-slate-900">
                              ₹{g.grandTotal.toFixed(2)}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {profileTab === 'invoices' && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800">Supplier Bills & Payouts</h4>
                  {canPay && (
                    <button
                      onClick={() => {
                        setPaymentModalSupplier(selectedSupplier);
                        setPayAmount(String(selectedSupplier.outstandingBalance || 0));
                      }}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Record Payment
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2.5 px-3">Invoice No.</th>
                        <th className="py-2.5 px-3">GRN Ref</th>
                        <th className="py-2.5 px-3">Due Date</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right font-mono">Total (₹)</th>
                        <th className="py-2.5 px-3 text-right font-mono">Outstanding (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {supplierInvoices
                        .filter(i => i.supplierId === selectedSupplier.id)
                        .map(inv => (
                          <tr key={inv.id}>
                            <td className="py-2.5 px-3 font-mono font-semibold">{inv.supplierInvoiceNumber}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">{inv.grnNumber || 'Direct Bill'}</td>
                            <td className="py-2.5 px-3 font-mono">{inv.dueDate.slice(0, 10)}</td>
                            <td className="py-2.5 px-3 font-semibold">{inv.paymentStatus}</td>
                            <td className="py-2.5 px-3 text-right font-mono">₹{inv.totalAmount.toFixed(2)}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold">₹{inv.outstandingAmount.toFixed(2)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {profileTab === 'statement' && (
              <div className="space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-slate-800">Payables Account Statement</h4>
                    <p className="text-[11px] text-slate-500">
                      Chronological bills, payments, and return credit notes
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canExport && (
                      <button
                        onClick={() => exportCsvStatement(selectedSupplier)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-slate-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export CSV
                      </button>
                    )}
                    <button
                      onClick={() => window.print()}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-slate-50"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Statement
                    </button>
                  </div>
                </div>

                {!canViewFinancials ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                    Statement financials require `suppliers.view_financials`.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Reference</th>
                          <th className="py-2.5 px-3">Description</th>
                          <th className="py-2.5 px-3 text-right font-mono">Payable (+)</th>
                          <th className="py-2.5 px-3 text-right font-mono">Paid / Credit (-)</th>
                          <th className="py-2.5 px-3 text-right font-mono">Running Due</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {statementRows.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-6 text-center text-slate-400">
                              No ledger movements posted yet.
                            </td>
                          </tr>
                        ) : (
                          statementRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="py-2 px-3 font-mono">{row.date}</td>
                              <td className="py-2 px-3 font-semibold">{row.type}</td>
                              <td className="py-2 px-3 font-mono">{row.ref}</td>
                              <td className="py-2 px-3">{row.desc}</td>
                              <td className="py-2 px-3 text-right font-mono">
                                {row.debit > 0 ? `₹${row.debit.toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-emerald-700">
                                {row.credit > 0 ? `₹${row.credit.toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold">
                                ₹{row.balance.toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {profileTab === 'attachments' && (
              <div className="space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Document title (e.g. Form 20B Wholesale Licence 2026)"
                    value={attachName}
                    onChange={e => setAttachName(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  {canUpdate && (
                    <button
                      onClick={() => {
                        if (!attachName.trim()) return;
                        const fileId = `doc_${Date.now().toString(36)}`;
                        const nextAtt = {
                          id: fileId,
                          name: attachName.trim(),
                          category: 'documents' as const,
                          storagePath: `tenants/store-01/branches/main/documents/${fileId}`,
                          branchId: 'main',
                          fileId,
                          uploadedBy: currentUser.name,
                          uploadedAt: new Date().toISOString(),
                        };
                        updateSupplierRecord(selectedSupplier.id, {
                          attachments: [nextAtt, ...(selectedSupplier.attachments || [])],
                        });
                        setAttachName('');
                      }}
                      className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      Link Firebase Storage Doc
                    </button>
                  )}
                </div>

                {(selectedSupplier.attachments || []).length === 0 ? (
                  <p className="text-slate-500">No supplier compliance documents or invoice scans attached yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedSupplier.attachments!.map(att => (
                      <div key={att.id} className="p-3 border border-slate-200 rounded-lg flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-900">{att.name}</div>
                          <div className="text-[11px] font-mono text-slate-500">{att.storagePath}</div>
                        </div>
                        <span className="text-[11px] text-slate-500">{att.uploadedAt.slice(0, 10)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Supplier Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  {editingSupplier ? `Edit Supplier · ${editingSupplier.agencyName}` : 'Register Pharmaceutical Supplier'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  GSTIN, Indian Drug Licence, payment terms & payable controls
                </p>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                  {formError}
                </div>
              )}

              {duplicateWarning && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                  <p className="font-medium">{duplicateWarning}</p>
                  <button
                    type="button"
                    onClick={() => handleSaveSupplier(true)}
                    className="px-3 py-1 bg-amber-700 text-white rounded font-semibold text-[11px]"
                  >
                    Confirm & Create Anyway
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Legal Name *</label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={e => setLegalName(e.target.value)}
                    placeholder="Mahalaxmi Pharma Distributors Pvt. Ltd."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trade / Agency Name</label>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={e => setTradeName(e.target.value)}
                    placeholder="Mahalaxmi Pharma"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Contact Person *</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={e => setContactPerson(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Primary Phone *</label>
                  <input
                    type="tel"
                    value={primaryPhone}
                    onChange={e => setPrimaryPhone(e.target.value)}
                    placeholder="98200 88776"
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Supplier Type</label>
                  <select
                    value={supplierType}
                    onChange={e => setSupplierType(e.target.value as SupplierType)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="DISTRIBUTOR">Distributor</option>
                    <option value="MANUFACTURER">Manufacturer</option>
                    <option value="C_AND_F">C&F Agent</option>
                    <option value="WHOLESALER">Wholesaler</option>
                    <option value="SURGICAL_VENDOR">Surgical Vendor</option>
                    <option value="GENERIC_STOCKIST">Generic Stockist</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">GSTIN (15-char)</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={e => {
                      const v = e.target.value.toUpperCase();
                      setGstin(v);
                      if (/^\d{2}/.test(v)) setStateCode(v.slice(0, 2));
                    }}
                    placeholder="27AAECM4019C1Z4"
                    className="w-full px-3 py-2 font-mono uppercase border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">PAN (10-char)</label>
                  <input
                    type="text"
                    value={pan}
                    onChange={e => setPan(e.target.value.toUpperCase())}
                    placeholder="AAECM4019C"
                    className="w-full px-3 py-2 font-mono uppercase border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Drug Licence Number</label>
                  <input
                    type="text"
                    value={dlNumber}
                    onChange={e => setDlNumber(e.target.value)}
                    placeholder="MH-MZ4-20B/8911"
                    className="w-full px-3 py-2 font-mono uppercase border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">State & GST Code *</label>
                  <select
                    value={stateCode}
                    onChange={e => {
                      const found = INDIAN_STATES.find(s => s.code === e.target.value);
                      setStateCode(e.target.value);
                      if (found) setStateName(found.name);
                    }}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {INDIAN_STATES.map(s => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">PIN Code</label>
                  <input
                    type="text"
                    value={pincode}
                    onChange={e => setPincode(e.target.value)}
                    placeholder="400002"
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Billing Address</label>
                  <input
                    type="text"
                    value={billingAddress}
                    onChange={e => setBillingAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Credit Period (Days)</label>
                  <input
                    type="number"
                    min="0"
                    value={creditPeriodDays}
                    onChange={e => setCreditPeriodDays(Number(e.target.value))}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Credit Limit (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={creditLimit}
                    onChange={e => setCreditLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                {!editingSupplier && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Opening Payable (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={openingBalance}
                      onChange={e => setOpeningBalance(Number(e.target.value))}
                      className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                )}
              </div>

              {canViewBank && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                    Bank Details (Authorized Roles Only)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Account Holder Name"
                      value={bankHolder}
                      onChange={e => setBankHolder(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Bank Name"
                      value={bankName}
                      onChange={e => setBankName(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Account Number"
                      value={bankAcc}
                      onChange={e => setBankAcc(e.target.value)}
                      className="px-3 py-2 font-mono border border-slate-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="IFSC Code or UPI ID"
                      value={bankIfsc || upiId}
                      onChange={e => setBankIfsc(e.target.value)}
                      className="px-3 py-2 font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3 py-2 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveSupplier(false)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  {editingSupplier ? 'Save Changes' : 'Create Supplier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Supplier Payment Modal */}
      {paymentModalSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <form
            onSubmit={handlePaymentSubmit}
            className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden text-xs"
          >
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 uppercase tracking-wider">
                  Record Supplier Payment
                </h3>
                <p className="text-[11px] text-slate-500">
                  {paymentModalSupplier.agencyName} · Current Due: ₹
                  {(paymentModalSupplier.outstandingBalance || 0).toFixed(2)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalSupplier(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Payment Mode</label>
                <select
                  value={payMode}
                  onChange={e => setPayMode(e.target.value as SupplierPaymentMode)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="NEFT_RTGS">NEFT / RTGS</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">UTR / Reference Number</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={e => setPayRef(e.target.value)}
                  placeholder="UTR / Cheque No."
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={payAllowAdvance}
                  onChange={e => setPayAllowAdvance(e.target.checked)}
                />
                <span>Allow overpayment to be recorded as Vendor Advance</span>
              </label>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPaymentModalSupplier(null)}
                  className="px-3 py-1.5 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
                >
                  Post Payment (FIFO)
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  Trash2,
  Receipt,
  User,
  Phone,
  Stethoscope,
  IndianRupee,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  CreditCard,
  Wallet,
  Building,
  Clock,
  Printer,
  RotateCcw,
  Barcode,
  Layers,
  ArrowRightLeft,
  X,
  FileText,
  DollarSign,
  Undo2,
  ShieldAlert,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { CartItem, PaymentMode, ScheduleCategory, BillInvoice, PaymentRecord } from '../../types/pharmacy.ts';

export const BillingView: React.FC = () => {
  const {
    inventory,
    medicines,
    customers,
    store,
    currentUser,
    bills,
    createBill,
    cancelBill,
    processSalesReturn,
    recordBillPayment,
    setPrintInvoiceData,
    hasUserPermission,
  } = usePharmacy();

  // Tab State: 'terminal' (Counter Billing) vs 'history' (Recent Invoices & Returns)
  const [activeTab, setActiveTab] = useState<'terminal' | 'history'>('terminal');

  // Search & Scanner states
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScannerMode, setIsScannerMode] = useState(false);
  const [scannerFeedback, setScannerFeedback] = useState<string | null>(null);

  // Cart & Customer states
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorRegNumber, setDoctorRegNumber] = useState('');
  const [isInterState, setIsInterState] = useState(false);

  // Payment states
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi');
  const [splitPayments, setSplitPayments] = useState<Array<{ mode: PaymentMode; amount: number; ref?: string }>>([
    { mode: 'cash', amount: 0 },
    { mode: 'upi', amount: 0 },
  ]);

  const [customerDiscount, setCustomerDiscount] = useState<number>(store.defaultDiscountPercent || 10);
  const [billSuccessMessage, setBillSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Return modal state
  const [selectedInvoiceForReturn, setSelectedInvoiceForReturn] = useState<BillInvoice | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('Customer Return');
  const [restockReturn, setRestockReturn] = useState(true);

  // Cancel modal state
  const [selectedInvoiceForCancel, setSelectedInvoiceForCancel] = useState<BillInvoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Payment collection modal state
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<BillInvoice | null>(null);
  const [collectionAmount, setCollectionAmount] = useState<number>(0);
  const [collectionMode, setCollectionMode] = useState<PaymentMode>('cash');
  const [collectionRef, setCollectionRef] = useState('');

  // History search state
  const [historySearch, setHistorySearch] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut for billing terminal: F2 to focus search, F4 to toggle scanner
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setIsScannerMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isScannerMode) {
      barcodeInputRef.current?.focus();
    }
  }, [isScannerMode]);

  // Check if batch is expired
  const isExpired = (expiryDate: string): boolean => {
    if (!expiryDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = expiryDate.length === 7 ? new Date(`${expiryDate}-01`) : new Date(expiryDate);
    return exp.getTime() < today.getTime();
  };

  // Filter available batches by medicine brand, salt, batch number, or barcode
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return inventory.filter(
      b =>
        b.currentStock > 0 &&
        !isExpired(b.expiryDate) &&
        (b.brandName.toLowerCase().includes(q) ||
          b.saltComposition.toLowerCase().includes(q) ||
          b.batchNumber.toLowerCase().includes(q) ||
          (b.barcode && b.barcode.toLowerCase().includes(q)))
    );
  }, [searchQuery, inventory]);

  // Check if any cart item is Schedule H, H1, or X
  const hasScheduledDrug = cart.some(
    item => item.schedule === 'Schedule H' || item.schedule === 'Schedule H1' || item.schedule === 'Schedule X'
  );

  // Handle barcode scanner input auto-submission
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    // Search inventory for matching barcode
    const match = inventory.find(
      b => b.barcode === code || b.batchNumber.toLowerCase() === code.toLowerCase()
    );

    if (match) {
      if (match.currentStock <= 0 || isExpired(match.expiryDate)) {
        setScannerFeedback(`Batch '${match.batchNumber}' is expired or out of stock!`);
      } else {
        handleAddToCart(match);
        setScannerFeedback(`Scanned & added: ${match.brandName} (${match.batchNumber})`);
      }
    } else {
      setScannerFeedback(`No product found for barcode: ${code}`);
    }

    setBarcodeInput('');
    setTimeout(() => setScannerFeedback(null), 3000);
  };

  const handleAddToCart = (batch: (typeof inventory)[0]) => {
    const medMaster = medicines.find(m => m.id === batch.medicineId);
    const schedule: ScheduleCategory = medMaster ? medMaster.schedule : 'Schedule H';
    const gstSlab = medMaster ? medMaster.gstSlab : 12;

    setCart(prev => {
      const existing = prev.find(item => item.batchId === batch.id);
      if (existing) {
        if (existing.quantity >= batch.currentStock) {
          setErrorMessage(`Cannot exceed available batch stock of ${batch.currentStock} units.`);
          setTimeout(() => setErrorMessage(null), 3000);
          return prev;
        }
        return prev.map(item =>
          item.batchId === batch.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      const newItem: CartItem = {
        batchId: batch.id,
        medicineId: batch.medicineId,
        brandName: batch.brandName,
        saltComposition: batch.saltComposition,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        packSize: batch.packSize,
        mrp: batch.mrp,
        discountPercent: customerDiscount,
        gstSlab,
        quantity: 1,
        availableStock: batch.currentStock,
        schedule,
      };
      return [...prev, newItem];
    });

    setSearchQuery('');
  };

  const handleUpdateQuantity = (batchId: string, qty: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.batchId === batchId) {
            const validQty = Math.max(1, Math.min(qty, item.availableStock));
            return { ...item, quantity: validQty };
          }
          return item;
        })
        .filter(item => item.quantity > 0)
    );
  };

  const handleUpdateItemDiscount = (batchId: string, disc: number) => {
    setCart(prev =>
      prev.map(item =>
        item.batchId === batchId
          ? { ...item, discountPercent: Math.max(0, Math.min(disc, 50)) }
          : item
      )
    );
  };

  const handleRemoveFromCart = (batchId: string) => {
    setCart(prev => prev.filter(item => item.batchId !== batchId));
  };

  const handleCustomerPhoneChange = (input: string) => {
    setCustomerPhone(input);
    const cleaned = input.trim();
    if (cleaned.length >= 10) {
      const existing = customers.find(c => c.phone.includes(cleaned));
      if (existing) {
        setCustomerName(existing.name);
        if (existing.doctorName && !doctorName) {
          setDoctorName(existing.doctorName);
        }
      }
    }
  };

  // Monetary calculations with 2-decimal paise precision
  const roundPaise = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;

  const subtotal = roundPaise(cart.reduce((acc, curr) => acc + curr.mrp * curr.quantity, 0));
  const totalDiscount = roundPaise(
    cart.reduce((acc, curr) => acc + (curr.mrp * curr.quantity * curr.discountPercent) / 100, 0)
  );
  const netPayable = roundPaise(subtotal - totalDiscount);

  // Indian GST retail calculation (tax inclusive of MRP)
  let taxableAmount = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  cart.forEach(item => {
    const lineNet = roundPaise(item.mrp * item.quantity);
    const lineDisc = roundPaise(lineNet * (item.discountPercent / 100));
    const linePay = roundPaise(lineNet - lineDisc);
    const lineTaxable = roundPaise(linePay / (1 + item.gstSlab / 100));
    const lineTax = roundPaise(linePay - lineTaxable);

    taxableAmount = roundPaise(taxableAmount + lineTaxable);
    if (isInterState) {
      igst = roundPaise(igst + lineTax);
    } else {
      const halfTax = roundPaise(lineTax / 2);
      cgst = roundPaise(cgst + halfTax);
      sgst = roundPaise(sgst + (lineTax - halfTax));
    }
  });

  const rawTotal = roundPaise(taxableAmount + cgst + sgst + igst);
  const grandTotal = Math.round(rawTotal);
  const roundOff = roundPaise(grandTotal - rawTotal);

  // Split payment totals
  const totalSplitPaid = roundPaise(splitPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
  const remainingSplitDue = roundPaise(Math.max(0, grandTotal - totalSplitPaid));

  const handleCompleteBill = () => {
    if (cart.length === 0) return;

    if (hasScheduledDrug && !doctorName.trim()) {
      setErrorMessage('Prescription Alert: Schedule H / H1 / X drugs require prescribing Doctor Name for statutory Form 20B/21B compliance.');
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }

    let finalPayments: PaymentRecord[] = [];
    let paidAmount = 0;
    let effectivePaymentMode: PaymentMode = paymentMode;

    if (isSplitPayment) {
      finalPayments = splitPayments
        .filter(p => p.amount > 0)
        .map(p => ({
          id: `pay-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
          mode: p.mode,
          amount: p.amount,
          referenceNumber: p.ref,
          timestamp: new Date().toISOString(),
        }));
      paidAmount = roundPaise(finalPayments.reduce((acc, p) => acc + p.amount, 0));
      effectivePaymentMode = finalPayments[0]?.mode || 'cash';
    } else {
      paidAmount = paymentMode === 'khata_credit' ? 0 : grandTotal;
      finalPayments = [
        {
          id: `pay-${Date.now().toString(36)}`,
          mode: paymentMode,
          amount: paidAmount,
          timestamp: new Date().toISOString(),
        },
      ];
    }

    const balanceDue = roundPaise(Math.max(0, grandTotal - paidAmount));
    const paymentStatus = balanceDue === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';

    const created = createBill({
      customerName: customerName.trim() || 'Walk-in Customer',
      customerPhone: customerPhone.trim(),
      doctorName: doctorName.trim(),
      doctorRegNumber: doctorRegNumber.trim(),
      items: cart,
      subtotal,
      totalDiscount,
      taxableAmount,
      cgst,
      sgst,
      igst,
      roundOff,
      grandTotal,
      amountPaid: paidAmount,
      balanceDue,
      paymentStatus,
      payments: finalPayments,
      paymentMode: effectivePaymentMode,
      status: paymentMode === 'khata_credit' ? 'credit' : 'completed',
    });

    setBillSuccessMessage(`Bill ${created.invoiceNumber} created successfully! (₹${created.grandTotal})`);
    setPrintInvoiceData(created);

    // Reset terminal
    setCart([]);
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setDoctorName('');
    setDoctorRegNumber('');
    setIsSplitPayment(false);
    setSplitPayments([
      { mode: 'cash', amount: 0 },
      { mode: 'upi', amount: 0 },
    ]);
    setTimeout(() => {
      setBillSuccessMessage(null);
    }, 4000);
  };

  // Returns logic
  const handleOpenReturnModal = (invoice: BillInvoice) => {
    setSelectedInvoiceForReturn(invoice);
    const initialQtys: Record<string, number> = {};
    invoice.items.forEach(item => {
      initialQtys[item.batchId] = 0;
    });
    setReturnQuantities(initialQtys);
    setReturnReason('Patient Medicine Return');
  };

  const handleConfirmReturn = () => {
    if (!selectedInvoiceForReturn) return;

    const returnItems = Object.entries(returnQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([batchId, quantity]) => ({
        batchId,
        quantity,
        reason: returnReason,
        restock: restockReturn,
      }));

    if (returnItems.length === 0) {
      alert('Please specify return quantity for at least one item');
      return;
    }

    processSalesReturn(selectedInvoiceForReturn.id, returnItems, returnReason);
    setSelectedInvoiceForReturn(null);
    setBillSuccessMessage(`Sales return processed for ${selectedInvoiceForReturn.invoiceNumber}`);
    setTimeout(() => setBillSuccessMessage(null), 3000);
  };

  // Cancellation logic
  const handleConfirmCancel = () => {
    if (!selectedInvoiceForCancel) return;
    if (!cancelReason.trim()) {
      alert('Please enter a cancellation reason');
      return;
    }

    cancelBill(selectedInvoiceForCancel.id, cancelReason);
    setSelectedInvoiceForCancel(null);
    setCancelReason('');
    setBillSuccessMessage(`Invoice ${selectedInvoiceForCancel.invoiceNumber} has been cancelled`);
    setTimeout(() => setBillSuccessMessage(null), 3000);
  };

  // Collection modal logic
  const handleOpenCollectionModal = (invoice: BillInvoice) => {
    setSelectedInvoiceForPayment(invoice);
    setCollectionAmount(invoice.balanceDue);
    setCollectionMode('cash');
    setCollectionRef('');
  };

  const handleConfirmCollection = () => {
    if (!selectedInvoiceForPayment || collectionAmount <= 0) return;
    recordBillPayment(selectedInvoiceForPayment.id, {
      mode: collectionMode,
      amount: collectionAmount,
      referenceNumber: collectionRef || undefined,
    });
    setSelectedInvoiceForPayment(null);
    setBillSuccessMessage(`Payment of ₹${collectionAmount} recorded for ${selectedInvoiceForPayment.invoiceNumber}`);
    setTimeout(() => setBillSuccessMessage(null), 3000);
  };

  const filteredBills = useMemo(() => {
    if (!historySearch.trim()) return bills;
    const q = historySearch.toLowerCase();
    return bills.filter(
      b =>
        b.invoiceNumber.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        b.customerPhone.includes(q)
    );
  }, [historySearch, bills]);

  return (
    <div className="space-y-4">
      {/* Top Banner & Tab Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
            POS
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">Retail Billing & Dispensing Counter</h1>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>Biller: <strong className="text-slate-700">{currentUser.name}</strong></span>
              <span>·</span>
              <span>Branch: <strong className="text-slate-700">Counter 01 ({store.name})</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setActiveTab('terminal')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'terminal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              POS Terminal
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'history' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Recent Invoices & Returns ({bills.length})
            </button>
          </div>
        </div>
      </div>

      {billSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{billSuccessMessage}</span>
          </div>
          <span className="text-emerald-700 font-mono text-[11px]">Audit committed</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-700 text-xs">Dismiss</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: POS TERMINAL VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'terminal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Customer, Barcode Scanner & Search (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Customer Details & Statutory Prescriber */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  Customer & Prescription Verification
                </span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInterState}
                      onChange={e => setIsInterState(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>Inter-State (IGST)</span>
                  </label>
                  {hasScheduledDrug && (
                    <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-red-600" />
                      Prescription Rx Required
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Customer Mobile
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="tel"
                      placeholder="98200 12345"
                      value={customerPhone}
                      onChange={e => handleCustomerPhoneChange(e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    placeholder="Walk-in Customer"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Doctor Name {hasScheduledDrug && <span className="text-red-600">*</span>}
                  </label>
                  <div className="relative">
                    <Stethoscope className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Dr. Rajesh Mehta"
                      value={doctorName}
                      onChange={e => setDoctorName(e.target.value)}
                      className={`w-full pl-8 pr-2 py-1.5 text-xs border rounded-lg focus:outline-hidden ${
                        hasScheduledDrug && !doctorName
                          ? 'border-red-300 bg-red-50/30'
                          : 'border-slate-300 focus:border-blue-600'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Doctor Reg No.
                  </label>
                  <input
                    type="text"
                    placeholder="MCI-19842"
                    value={doctorRegNumber}
                    onChange={e => setDoctorRegNumber(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                  />
                </div>
              </div>
            </div>

            {/* Barcode Scanner / Free Search Card */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsScannerMode(false)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      !isScannerMode ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Formulary Search (F2)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsScannerMode(true)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
                      isScannerMode ? 'bg-purple-50 text-purple-700 font-bold border border-purple-200' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Barcode className="w-3.5 h-3.5" />
                    <span>Barcode Reader Mode (F4)</span>
                  </button>
                </div>

                <span className="text-[10px] text-slate-400 font-mono">FEFO Engine Active</span>
              </div>

              {/* Barcode Input Mode */}
              {isScannerMode ? (
                <form onSubmit={handleBarcodeSubmit} className="space-y-2">
                  <div className="relative">
                    <Barcode className="w-5 h-5 text-purple-600 absolute left-3 top-2.5" />
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      placeholder="Scan or enter barcode / lot number and press Enter..."
                      value={barcodeInput}
                      onChange={e => setBarcodeInput(e.target.value)}
                      className="w-full pl-10 pr-24 py-2.5 text-sm font-mono border-2 border-purple-400 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 bg-purple-50/20"
                    />
                    <button
                      type="submit"
                      className="absolute right-2 top-2 px-3 py-1 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700"
                    >
                      Inward Scan
                    </button>
                  </div>
                  {scannerFeedback && (
                    <div className="text-xs font-medium text-purple-700 px-1">{scannerFeedback}</div>
                  )}
                </form>
              ) : (
                /* Free Search Mode */
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search brand, generic salt, batch number, or barcode... (F2)"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              )}

              {/* Search Results Dropdown with FEFO Badge */}
              {searchQuery && !isScannerMode && (
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No matching eligible non-expired batch found for "{searchQuery}".
                    </div>
                  ) : (
                    searchResults.map((batch, idx) => {
                      const isEarliestFEFO = idx === 0;
                      return (
                        <div
                          key={batch.id}
                          className="p-3 hover:bg-white flex items-center justify-between transition-colors"
                        >
                          <div className="min-w-0 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {batch.brandName}
                              </span>
                              <span className="text-[10px] font-mono bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded">
                                Lot: {batch.batchNumber}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                Exp: {batch.expiryDate}
                              </span>
                              {isEarliestFEFO && (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                                  <Layers className="w-2.5 h-2.5" />
                                  FEFO Pick
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {batch.saltComposition} • Rack: {batch.rackLocation}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <span className="text-xs font-mono font-bold text-slate-900 block">
                                ₹{batch.mrp.toFixed(2)}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500">
                                Stock: {batch.currentStock} {batch.packSize}
                              </span>
                            </div>

                            <button
                              onClick={() => handleAddToCart(batch)}
                              disabled={batch.currentStock <= 0}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Fast Dispensing Quick Chips */}
              {!searchQuery && !isScannerMode && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block mb-2">
                    Fast Dispensing Favorites:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {inventory.slice(0, 6).map(b => (
                      <button
                        key={b.id}
                        onClick={() => handleAddToCart(b)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 transition-colors"
                      >
                        + {b.brandName.split(' ')[0]} (₹{b.mrp.toFixed(0)})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cart Items Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Cart Items ({cart.length})
                </span>
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    className="text-[11px] text-red-600 hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Clear Cart
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-medium text-slate-500">POS Cart is empty</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Search medicines or scan barcodes to begin retail dispensing.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/40 text-slate-600 font-semibold text-[11px]">
                        <th className="py-2 px-3">Medicine Formulation</th>
                        <th className="py-2 px-2 font-mono">Lot / Exp</th>
                        <th className="py-2 px-2 text-center">Qty</th>
                        <th className="py-2 px-2 text-right font-mono">MRP</th>
                        <th className="py-2 px-2 text-center font-mono">Disc %</th>
                        <th className="py-2 px-3 text-right font-mono">Total</th>
                        <th className="py-2 px-2 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cart.map(item => {
                        const lineGross = roundPaise(item.mrp * item.quantity);
                        const lineDisc = roundPaise(lineGross * (item.discountPercent / 100));
                        const lineTotal = roundPaise(lineGross - lineDisc);
                        return (
                          <tr key={item.batchId} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900 block truncate max-w-[150px]">
                                {item.brandName}
                              </span>
                              <span className="text-[10px] text-slate-500 block truncate max-w-[150px]">
                                {item.saltComposition}
                              </span>
                              {item.schedule.startsWith('Schedule') && (
                                <span className="text-[9px] font-bold text-red-600 uppercase">
                                  {item.schedule}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-2 font-mono text-[10px] text-slate-600">
                              <div>{item.batchNumber}</div>
                              <div className="text-slate-400">{item.expiryDate}</div>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <div className="inline-flex items-center border border-slate-200 rounded-md">
                                <button
                                  onClick={() => handleUpdateQuantity(item.batchId, item.quantity - 1)}
                                  className="px-2 py-0.5 text-slate-600 hover:bg-slate-100"
                                >
                                  -
                                </button>
                                <span className="px-2 font-mono font-bold text-slate-800">
                                  {item.quantity}
                                </span>
                                <button
                                  onClick={() => handleUpdateQuantity(item.batchId, item.quantity + 1)}
                                  className="px-2 py-0.5 text-slate-600 hover:bg-slate-100"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700">
                              ₹{item.mrp.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono">
                              <input
                                type="number"
                                min="0"
                                max="50"
                                value={item.discountPercent}
                                onChange={e => handleUpdateItemDiscount(item.batchId, Number(e.target.value))}
                                className="w-12 text-center text-xs py-0.5 border border-slate-200 rounded font-mono"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                              ₹{lineTotal.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <button
                                onClick={() => handleRemoveFromCart(item.batchId)}
                                className="p-1 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Payment Settlement & Dispense (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Payment Collection & Settlement
                </h3>
                <label className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSplitPayment}
                    onChange={e => setIsSplitPayment(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Split Payment</span>
                </label>
              </div>

              {/* Single Payment Mode Selector */}
              {!isSplitPayment ? (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                    Select Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setPaymentMode('upi')}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 font-medium transition-all ${
                        paymentMode === 'upi'
                          ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-bold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <QrCode className="w-4 h-4 text-purple-600" />
                      <span>UPI / QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMode('cash')}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 font-medium transition-all ${
                        paymentMode === 'cash'
                          ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-bold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <Wallet className="w-4 h-4 text-emerald-600" />
                      <span>Cash</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMode('card')}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 font-medium transition-all ${
                        paymentMode === 'card'
                          ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-bold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      <span>Card / POS</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMode('khata_credit')}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 font-medium transition-all ${
                        paymentMode === 'khata_credit'
                          ? 'border-amber-600 bg-amber-50 text-amber-800 font-bold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <IndianRupee className="w-4 h-4 text-amber-600" />
                      <span>Khata Credit</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Split Payment Mode Breakdown */
                <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">Split Payment Allocation:</span>
                    <span className="font-mono text-slate-500">Due: ₹{grandTotal}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium w-16 text-slate-600">Cash (₹):</span>
                      <input
                        type="number"
                        min="0"
                        value={splitPayments[0]?.amount || ''}
                        onChange={e => {
                          const val = Number(e.target.value) || 0;
                          setSplitPayments(prev => [
                            { ...prev[0]!, amount: val },
                            { ...prev[1]!, amount: Math.max(0, grandTotal - val) },
                          ]);
                        }}
                        className="w-full px-2.5 py-1 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                        placeholder="0"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium w-16 text-slate-600">UPI (₹):</span>
                      <input
                        type="number"
                        min="0"
                        value={splitPayments[1]?.amount || ''}
                        onChange={e => {
                          const val = Number(e.target.value) || 0;
                          setSplitPayments(prev => [prev[0]!, { ...prev[1]!, amount: val }]);
                        }}
                        className="w-full px-2.5 py-1 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-200">
                    <span className="text-slate-500">Allocated: ₹{totalSplitPaid}</span>
                    <span className={`font-mono font-bold ${remainingSplitDue > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                      {remainingSplitDue > 0 ? `Unallocated: ₹${remainingSplitDue}` : 'Fully Allocated ✓'}
                    </span>
                  </div>
                </div>
              )}

              {/* Dynamic UPI QR Display */}
              {((paymentMode === 'upi' && !isSplitPayment) || (isSplitPayment && (splitPayments[1]?.amount || 0) > 0)) && (
                <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl flex items-center gap-3">
                  <div className="w-12 h-12 bg-white p-1 rounded-lg border border-purple-200 shrink-0 flex items-center justify-center">
                    <QrCode className="w-10 h-10 text-purple-700" />
                  </div>
                  <div className="text-[11px] text-purple-900">
                    <span className="font-bold block">Dynamic Counter UPI QR</span>
                    <span>VPA: apexmedicos@hdfcbank</span>
                    <div className="font-mono font-bold text-xs text-purple-800 mt-0.5">
                      Amount: ₹{isSplitPayment ? splitPayments[1]?.amount : grandTotal}
                    </div>
                  </div>
                </div>
              )}

              {/* Tax & Financial Breakdown */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Gross MRP Subtotal:</span>
                  <span className="font-mono tabular-nums">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Special Discount:</span>
                  <span className="font-mono tabular-nums">-₹{totalDiscount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Taxable Value:</span>
                  <span className="font-mono tabular-nums">₹{taxableAmount.toFixed(2)}</span>
                </div>
                {isInterState ? (
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>IGST (Inter-state):</span>
                    <span className="font-mono tabular-nums">₹{igst.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>CGST + SGST (Intra-state):</span>
                    <span className="font-mono tabular-nums">₹{(cgst + sgst).toFixed(2)}</span>
                  </div>
                )}
                {roundOff !== 0 && (
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Round-off:</span>
                    <span className="font-mono tabular-nums">₹{roundOff.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex items-baseline justify-between pt-3 border-t border-slate-900 text-slate-900 font-bold">
                  <span className="text-sm">PAYABLE AMOUNT:</span>
                  <span className="text-2xl font-mono tabular-nums text-blue-700">
                    ₹{grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Complete & Print CTA */}
              <button
                onClick={handleCompleteBill}
                disabled={cart.length === 0}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all focus:ring-4 focus:ring-blue-500/20"
              >
                <Printer className="w-4 h-4" />
                <span>Complete Sale & Print Tax Invoice (Enter)</span>
              </button>

              <div className="text-[10px] text-slate-400 text-center font-mono">
                Statutory Retail Drug Form 20B/21B Compliant • Concurrency-Safe
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: RECENT INVOICES & RETURNS VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Sales Invoice History & Returns</h2>
              <p className="text-[11px] text-slate-500">Reprint receipts, record payment collections, and issue sales returns</p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search invoice no, customer name or phone..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-semibold text-[11px]">
                  <th className="py-2.5 px-3">Invoice Number</th>
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3 text-right font-mono">Grand Total</th>
                  <th className="py-2.5 px-3 text-right font-mono">Balance Due</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                      No matching sales invoices found.
                    </td>
                  </tr>
                ) : (
                  filteredBills.map(bill => {
                    const isCancelled = bill.status === 'cancelled';
                    const isReturned = bill.status === 'returned';
                    const hasDue = bill.balanceDue > 0 && !isCancelled;

                    return (
                      <tr key={bill.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">
                          {bill.invoiceNumber}
                        </td>
                        <td className="py-3 px-3 text-slate-500 text-[11px]">
                          {bill.timestamp}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-slate-800 block">{bill.customerName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{bill.customerPhone || 'Walk-in'}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          ₹{bill.grandTotal.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {hasDue ? (
                            <span className="text-amber-600 font-bold">₹{bill.balanceDue.toFixed(2)}</span>
                          ) : (
                            <span className="text-slate-400">₹0.00</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {isCancelled ? (
                            <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                              Cancelled
                            </span>
                          ) : isReturned ? (
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                              Returned
                            </span>
                          ) : bill.status === 'partially_returned' ? (
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                              Partial Return
                            </span>
                          ) : hasDue ? (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              Due
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              Settled
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Print Receipt */}
                            <button
                              onClick={() => setPrintInvoiceData(bill)}
                              title="Reprint Invoice"
                              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-lg"
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            {/* Collect Balance Due */}
                            {hasDue && (
                              <button
                                onClick={() => handleOpenCollectionModal(bill)}
                                title="Collect Due Payment"
                                className="px-2 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                              >
                                <DollarSign className="w-3 h-3" />
                                <span>Collect</span>
                              </button>
                            )}

                            {/* Sales Return */}
                            {!isCancelled && !isReturned && hasUserPermission('billing.return') && (
                              <button
                                onClick={() => handleOpenReturnModal(bill)}
                                title="Process Return"
                                className="px-2 py-1 bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                              >
                                <Undo2 className="w-3 h-3" />
                                <span>Return</span>
                              </button>
                            )}

                            {/* Cancel Invoice */}
                            {!isCancelled && !isReturned && hasUserPermission('billing.cancel') && (
                              <button
                                onClick={() => setSelectedInvoiceForCancel(bill)}
                                title="Cancel Invoice"
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SALES RETURN PROCESSING */}
      {/* ========================================================================= */}
      {selectedInvoiceForReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Undo2 className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Sales Return • {selectedInvoiceForReturn.invoiceNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedInvoiceForReturn(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600">
                Specify quantities of items returned by customer. Non-damaged items will be restored to active inventory.
              </p>

              <div className="space-y-2 border border-slate-200 rounded-xl divide-y divide-slate-100 p-2">
                {selectedInvoiceForReturn.items.map(item => (
                  <div key={item.batchId} className="flex items-center justify-between py-2 px-1">
                    <div>
                      <span className="font-bold text-slate-800 block">{item.brandName}</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Lot: {item.batchNumber} • Sold: {item.quantity} packs
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-slate-500">Return Qty:</label>
                      <input
                        type="number"
                        min="0"
                        max={item.quantity}
                        value={returnQuantities[item.batchId] || 0}
                        onChange={e => {
                          const val = Math.min(item.quantity, Math.max(0, Number(e.target.value) || 0));
                          setReturnQuantities(prev => ({ ...prev, [item.batchId]: val }));
                        }}
                        className="w-16 px-2 py-1 text-xs font-mono border border-slate-300 rounded-lg text-center"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Reason for Return *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Doctor changed dosage / Wrong product taken"
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={restockReturn}
                  onChange={e => setRestockReturn(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Restock returned units back to shelf inventory (Non-expired & intact)</span>
              </label>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceForReturn(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReturn}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Confirm Sales Return
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: INVOICE CANCELLATION */}
      {/* ========================================================================= */}
      {selectedInvoiceForCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-red-50">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-bold text-red-900">
                  Cancel Invoice • {selectedInvoiceForCancel.invoiceNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedInvoiceForCancel(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600">
                Cancelling this invoice will permanently mark it as cancelled, reverse all stock deductions back to the inventory batches, and commit an immutable audit record.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Cancellation Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Billed under incorrect customer / Entry mistake"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-red-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceForCancel(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Void & Cancel Invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: COLLECT BALANCE DUE PAYMENT */}
      {/* ========================================================================= */}
      {selectedInvoiceForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-amber-50">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-amber-900">
                  Collect Due • {selectedInvoiceForPayment.invoiceNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedInvoiceForPayment(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono">
                <span className="text-slate-500">Remaining Balance:</span>
                <span className="font-bold text-base text-amber-700">₹{selectedInvoiceForPayment.balanceDue.toFixed(2)}</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Collection Amount (₹) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedInvoiceForPayment.balanceDue}
                  value={collectionAmount}
                  onChange={e => setCollectionAmount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-amber-600 font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Payment Mode *
                </label>
                <select
                  value={collectionMode}
                  onChange={e => setCollectionMode(e.target.value as PaymentMode)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / QR</option>
                  <option value="card">Card / POS</option>
                  <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Reference / Transaction No. (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. UPI-987123"
                  value={collectionRef}
                  onChange={e => setCollectionRef(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceForPayment(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCollection}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

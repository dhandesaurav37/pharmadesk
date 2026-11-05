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
  Clock,
  Printer,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { CartItem, PaymentMode, ScheduleCategory } from '../../types/pharmacy.ts';

export const BillingView: React.FC = () => {
  const {
    inventory,
    medicines,
    customers,
    store,
    currentUser,
    createBill,
    setPrintInvoiceData,
  } = usePharmacy();

  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi');
  const [customerDiscount, setCustomerDiscount] = useState<number>(store.defaultDiscountPercent || 10);
  const [billSuccessMessage, setBillSuccessMessage] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut for billing terminal: F2 to focus search, Esc to clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter batches by medicine brand or salt
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return inventory.filter(
      b =>
        b.brandName.toLowerCase().includes(q) ||
        b.saltComposition.toLowerCase().includes(q) ||
        b.batchNumber.toLowerCase().includes(q)
    );
  }, [searchQuery, inventory]);

  // Check if any cart item is Schedule H or H1
  const hasScheduledDrug = cart.some(
    item => item.schedule === 'Schedule H' || item.schedule === 'Schedule H1' || item.schedule === 'Schedule X'
  );

  const handleAddToCart = (batch: (typeof inventory)[0]) => {
    const medMaster = medicines.find(m => m.id === batch.medicineId);
    const schedule: ScheduleCategory = medMaster ? medMaster.schedule : 'Schedule H';
    const gstSlab = medMaster ? medMaster.gstSlab : 12;

    setCart(prev => {
      const existing = prev.find(item => item.batchId === batch.id);
      if (existing) {
        if (existing.quantity >= batch.currentStock) {
          alert(`Cannot exceed available stock of ${batch.currentStock} units.`);
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

  // Calculations
  const subtotal = cart.reduce((acc, curr) => acc + curr.mrp * curr.quantity, 0);
  const totalDiscount = cart.reduce(
    (acc, curr) => acc + (curr.mrp * curr.quantity * curr.discountPercent) / 100,
    0
  );
  const netBeforeTax = subtotal - totalDiscount;
  // GST calculation (in retail MRP, GST is inclusive)
  const taxableAmount = Number((netBeforeTax / 1.12).toFixed(2));
  const cgst = Number(((netBeforeTax - taxableAmount) / 2).toFixed(2));
  const sgst = cgst;
  const rawTotal = netBeforeTax;
  const grandTotal = Math.round(rawTotal);
  const roundOff = Number((grandTotal - rawTotal).toFixed(2));

  const handleCompleteBill = () => {
    if (cart.length === 0) return;

    if (hasScheduledDrug && !doctorName.trim()) {
      alert('Prescription Alert: Schedule H / H1 drugs require the prescribing Doctor\'s name for statutory compliance.');
      return;
    }

    const created = createBill({
      customerName: customerName.trim() || 'Walk-in Customer',
      customerPhone: customerPhone.trim(),
      doctorName: doctorName.trim(),
      items: cart,
      subtotal,
      totalDiscount,
      taxableAmount,
      cgst,
      sgst,
      roundOff,
      grandTotal,
      paymentMode,
      status: paymentMode === 'khata_credit' ? 'credit' : 'paid',
    });

    setBillSuccessMessage(`Bill ${created.invoiceNumber} created successfully! (₹${created.grandTotal})`);
    setPrintInvoiceData(created);

    // Reset form
    setCart([]);
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setDoctorName('');
    setTimeout(() => {
      setBillSuccessMessage(null);
    }, 4000);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Keyboard shortcut hint */}
      <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
            POS
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">Retail Billing Terminal</h1>
            <p className="text-[11px] text-slate-500">
              Cashier: <span className="font-semibold text-slate-700">{currentUser.name}</span> • Counter 01
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
          <span className="hidden sm:inline-block px-2 py-0.5 bg-slate-100 rounded text-slate-600">
            F2: Search
          </span>
          <span className="hidden sm:inline-block px-2 py-0.5 bg-slate-100 rounded text-slate-600">
            Enter: Dispense
          </span>
        </div>
      </div>

      {billSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{billSuccessMessage}</span>
          </div>
          <span className="text-emerald-700 font-mono">Invoice printed</span>
        </div>
      )}

      {/* Main Grid: Medicine Selector & Cart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Col: Medicine Search & Prescribing Customer (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Customer & Doctor details card */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                Customer & Prescription
              </span>
              {hasScheduledDrug && (
                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Prescription Rx Mandatory
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  Prescribing Doctor
                </label>
                <div className="relative">
                  <Stethoscope className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="e.g. Dr. Rajesh Mehta"
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
            </div>
          </div>

          {/* Medicine Search Box */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search medicine brand, salt composition, batch or barcode... (F2)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Search Dropdown / Live Results */}
            {searchQuery && (
              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                {searchResults.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No matching medicine batch in stock for "{searchQuery}".
                  </div>
                ) : (
                  searchResults.map(batch => {
                    const isLow = batch.status === 'low_stock';
                    const isExp = batch.status === 'near_expiry';
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
                              Batch: {batch.batchNumber}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Exp: {batch.expiryDate}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {batch.saltComposition} • {batch.rackLocation}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-xs font-mono font-bold text-slate-900 block">
                              ₹{batch.mrp.toFixed(2)}
                            </span>
                            <span className={`text-[10px] font-mono ${isLow ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>
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

            {/* Quick Fast-Moving Formulary Chips */}
            {!searchQuery && (
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-2">
                  Fast Dispensing Quick Select:
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

          {/* Cart Items List */}
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
                <p className="text-xs font-medium text-slate-500">Cart is empty</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Search above or click quick-dispense medicines to add.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/40 text-slate-600 font-semibold text-[11px]">
                      <th className="py-2 px-3">Medicine</th>
                      <th className="py-2 px-2 font-mono">Batch / Exp</th>
                      <th className="py-2 px-2 text-center">Qty</th>
                      <th className="py-2 px-2 text-right font-mono">MRP</th>
                      <th className="py-2 px-2 text-center font-mono">Disc %</th>
                      <th className="py-2 px-3 text-right font-mono">Total</th>
                      <th className="py-2 px-2 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cart.map(item => {
                      const lineTotal = item.mrp * item.quantity * (1 - item.discountPercent / 100);
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
                              onChange={e =>
                                handleUpdateItemDiscount(item.batchId, Number(e.target.value))
                              }
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

        {/* Right Col: Bill Summary, Payment Mode & Dispense (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
              Payment & Bill Settlement
            </h3>

            {/* Payment Mode Selector */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                Payment Method
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMode('upi');
                    setShowQrCode(true);
                  }}
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
                  onClick={() => {
                    setPaymentMode('cash');
                    setShowQrCode(false);
                  }}
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
                  onClick={() => {
                    setPaymentMode('card');
                    setShowQrCode(false);
                  }}
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
                  onClick={() => {
                    setPaymentMode('khata_credit');
                    setShowQrCode(false);
                  }}
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

            {/* UPI QR Simulation */}
            {paymentMode === 'upi' && grandTotal > 0 && (
              <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl flex items-center gap-3">
                <div className="w-12 h-12 bg-white p-1 rounded-lg border border-purple-200 shrink-0 flex items-center justify-center">
                  <QrCode className="w-10 h-10 text-purple-700" />
                </div>
                <div className="text-[11px] text-purple-900">
                  <span className="font-bold block">Dynamic Dynamic UPI QR</span>
                  <span>UPI ID: apexmedicos@hdfcbank</span>
                  <div className="font-mono font-bold text-xs text-purple-800 mt-0.5">
                    Amount: ₹{grandTotal.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {/* Bill Breakdown */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal (Gross MRP):</span>
                <span className="font-mono tabular-nums">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Total Discount:</span>
                <span className="font-mono tabular-nums">-₹{totalDiscount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Taxable Value (approx):</span>
                <span className="font-mono tabular-nums">₹{taxableAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>CGST (6%) + SGST (6%):</span>
                <span className="font-mono tabular-nums">₹{(cgst + sgst).toFixed(2)}</span>
              </div>
              {roundOff !== 0 && (
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Round-off:</span>
                  <span className="font-mono tabular-nums">₹{roundOff.toFixed(2)}</span>
                </div>
              )}

              <div className="flex items-baseline justify-between pt-3 border-t border-slate-900 text-slate-900 font-bold">
                <span className="text-sm">TOTAL AMOUNT:</span>
                <span className="text-2xl font-mono tabular-nums text-blue-700">
                  ₹{grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Dispense CTA */}
            <button
              onClick={handleCompleteBill}
              disabled={cart.length === 0}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all focus:ring-4 focus:ring-blue-500/20"
            >
              <Printer className="w-4 h-4" />
              <span>Complete & Print Invoice (Enter)</span>
            </button>

            <div className="text-[11px] text-slate-400 text-center">
              GST compliant invoice conforming to Form 20B/21B retail guidelines.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  IndianRupee,
  Receipt,
  Boxes,
  AlertTriangle,
  Clock,
  TrendingUp,
  PlusCircle,
  UserPlus,
  Pill,
  ArrowUpRight,
  Printer,
  ChevronRight,
  ShieldAlert,
  Calendar,
  CheckCircle2,
  Truck,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { BillInvoice } from '../../types/pharmacy.ts';

export const DashboardView: React.FC = () => {
  const {
    store,
    currentUser,
    setActiveModule,
    bills,
    inventory,
    medicines,
    suppliers,
    setActiveQuickModal,
    setPrintInvoiceData,
  } = usePharmacy();

  // Metrics
  const todaySales = bills.reduce((acc, curr) => acc + curr.grandTotal, 0);
  const totalBillsCount = bills.length;
  const totalStockUnits = inventory.reduce((acc, curr) => acc + curr.currentStock, 0);
  const lowStockCount = inventory.filter(b => b.status === 'low_stock').length;
  const nearExpiryCount = inventory.filter(b => b.status === 'near_expiry').length;

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Pharmacy Operations Dashboard
            </h1>
            <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-md border border-blue-100">
              {store.branchName}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Welcome back, <span className="font-semibold text-slate-700">{currentUser.name}</span>. Store Drug License: {store.dlNumber20B}
          </p>
        </div>

        {/* Quick Actions (Section 5) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveModule('billing')}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Create New Bill</span>
          </button>

          <button
            onClick={() => setActiveQuickModal('medicine')}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Pill className="w-3.5 h-3.5 text-blue-600" />
            <span>Add Medicine</span>
          </button>

          <button
            onClick={() => setActiveQuickModal('customer')}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5 text-blue-600" />
            <span>Add Customer</span>
          </button>

          <button
            onClick={() => setActiveQuickModal('stock')}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Boxes className="w-3.5 h-3.5 text-blue-600" />
            <span>Add Stock</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Today's Sales */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Today's Sales</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            ₹{todaySales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-[11px] text-emerald-600 font-medium flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>Active retail counter billing</span>
          </div>
        </div>

        {/* Number of Bills */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Bills</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {totalBillsCount}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Avg bill value: ₹{(todaySales / (totalBillsCount || 1)).toFixed(0)}
          </div>
        </div>

        {/* Total Inventory Items */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Inventory Items</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {totalStockUnits} <span className="text-xs font-normal text-slate-500">packs</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Across {medicines.length} formulations
          </div>
        </div>

        {/* Low Stock Medicines */}
        <div
          onClick={() => setActiveModule('inventory')}
          className="bg-white p-4 rounded-xl border border-amber-200 hover:border-amber-300 shadow-xs cursor-pointer group transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Low Stock Alerts
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 font-mono tabular-nums">
            {lowStockCount}
          </div>
          <div className="mt-2 text-[11px] text-amber-700 font-medium group-hover:underline">
            Items below reorder level →
          </div>
        </div>

        {/* Near Expiry Batches */}
        <div
          onClick={() => setActiveModule('inventory')}
          className="bg-white p-4 rounded-xl border border-red-200 hover:border-red-300 shadow-xs cursor-pointer group transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-red-700">
              Near Expiry (&lt; 90d)
            </span>
            <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-red-600 font-mono tabular-nums">
            {nearExpiryCount}
          </div>
          <div className="mt-2 text-[11px] text-red-700 font-medium group-hover:underline">
            Review for stockist return →
          </div>
        </div>
      </div>

      {/* Regulatory & Critical Operational Alerts */}
      <div className="bg-gradient-to-r from-amber-50/70 to-orange-50/70 border border-amber-200/90 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Important Pharmacy Alerts & Statutory Compliance
            </h3>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-white/80 p-3 rounded-xl border border-amber-200/60">
                <span className="font-semibold text-slate-900 block">
                  Schedule H1 Dispense Register Audit
                </span>
                <span className="text-slate-600 text-[11px] mt-0.5 block leading-normal">
                  Augmentin 625 Duo was dispensed today. Ensure the doctor’s registration number and patient mobile are entered in the Schedule H1 physical register.
                </span>
              </div>
              <div className="bg-white/80 p-3 rounded-xl border border-amber-200/60">
                <span className="font-semibold text-slate-900 block">
                  Near Expiry Distributor Return Window
                </span>
                <span className="text-slate-600 text-[11px] mt-0.5 block leading-normal">
                  Ascoril LS Syrup (Batch AS-8819, Expiry Nov 2026) is within 30 days. Contact Mahalaxmi Pharma Distributors for debit note replacement.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Recent Sales & Recent Purchases */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sales (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Customer Bills</h2>
              <p className="text-xs text-slate-500">Live retail dispensing register</p>
            </div>
            <button
              onClick={() => setActiveModule('billing')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
            >
              <span>POS Billing</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/30 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">Invoice #</th>
                  <th className="py-2.5 px-4">Time</th>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4 text-center">Items</th>
                  <th className="py-2.5 px-4 text-right">Amount (₹)</th>
                  <th className="py-2.5 px-4">Payment</th>
                  <th className="py-2.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bills.slice(0, 5).map(bill => (
                  <tr key={bill.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-semibold text-blue-600">
                      {bill.invoiceNumber}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">
                      {bill.timestamp.split(' ')[1] || bill.timestamp}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">
                      <div>{bill.customerName}</div>
                      {bill.doctorName && (
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                          {bill.doctorName}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center font-mono">
                      {bill.items.length}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                      ₹{bill.grandTotal.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                        bill.paymentMode === 'khata_credit'
                          ? 'bg-amber-100 text-amber-800'
                          : bill.paymentMode === 'upi'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {bill.paymentMode === 'khata_credit' ? 'Khata Credit' : bill.paymentMode}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <button
                        onClick={() => setPrintInvoiceData(bill)}
                        className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                        title="Print / View Tax Invoice"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Purchases & Suppliers (1 col) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Stock Purchases</h2>
              <p className="text-xs text-slate-500">Inward stock from stockists</p>
            </div>
            <button
              onClick={() => setActiveModule('suppliers')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
            >
              Suppliers
            </button>
          </div>

          <div className="p-4 space-y-3 flex-1 overflow-y-auto">
            {suppliers.map(supplier => (
              <div
                key={supplier.id}
                className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 pr-2">
                    <span className="text-xs font-bold text-slate-900 block truncate">
                      {supplier.agencyName}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Contact: {supplier.contactPerson} ({supplier.city})
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                      DL: {supplier.dlNumber}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-400 block">Pending Balance</span>
                    <span className="text-xs font-mono font-bold text-slate-900 tabular-nums">
                      ₹{supplier.outstandingBalance.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-slate-500 block font-medium">
                      {supplier.paymentTerms}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
            <button
              onClick={() => setActiveQuickModal('stock')}
              className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-dashed border-blue-300 transition-colors"
            >
              + Inward Invoiced Batch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Receipt,
  LayoutDashboard,
  Pill,
  ShoppingBag,
  Users,
  Search,
  Plus,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

type DemoTabKey = 'billing' | 'dashboard' | 'inventory' | 'purchases' | 'customers';

interface DemoMedicine {
  id: string;
  name: string;
  salt: string;
  batch: string;
  expiry: string;
  mrp: number;
  gstRate: number;
  stock: number;
}

const SAMPLE_MEDICINES: DemoMedicine[] = [
  {
    id: 'm1',
    name: 'Dolo 650mg Tablet',
    salt: 'Paracetamol 650mg',
    batch: 'DL-2408',
    expiry: '10/2027',
    mrp: 34.0,
    gstRate: 12,
    stock: 142,
  },
  {
    id: 'm2',
    name: 'Augmentin 625 Duo',
    salt: 'Amoxycillin + Clavulanic Acid',
    batch: 'AG-9914',
    expiry: '07/2027',
    mrp: 223.4,
    gstRate: 12,
    stock: 38,
  },
  {
    id: 'm3',
    name: 'Pan-D Capsule PR',
    salt: 'Pantoprazole + Domperidone',
    batch: 'PD-1182',
    expiry: '02/2027',
    mrp: 199.0,
    gstRate: 12,
    stock: 14,
  },
  {
    id: 'm4',
    name: 'Telma 40 Tablet',
    salt: 'Telmisartan 40mg',
    batch: 'TL-7705',
    expiry: '11/2027',
    mrp: 224.5,
    gstRate: 12,
    stock: 96,
  },
];

const SAMPLE_PURCHASE_ORDERS = [
  {
    poNumber: 'PO-2026-019',
    supplier: 'Sample Pharma Distributors',
    branch: 'Main Retail Counter',
    itemsCount: 14,
    amount: 'Rs 28,450.00',
    status: 'APPROVED',
  },
  {
    poNumber: 'PO-2026-018',
    supplier: 'Sample MedSupply Agency',
    branch: 'Main Retail Counter',
    itemsCount: 9,
    amount: 'Rs 16,920.00',
    status: 'FULLY RECEIVED (GRN)',
  },
  {
    poNumber: 'PO-2026-017',
    supplier: 'Sample Care Stockists',
    branch: 'Branch 02',
    itemsCount: 22,
    amount: 'Rs 41,280.00',
    status: 'PARTIALLY RECEIVED',
  },
];

const SAMPLE_CUSTOMERS = [
  {
    name: 'Sample Patient Account A',
    phone: '+91 98*** **210',
    type: 'CHRONIC',
    limit: 'Rs 5,000.00',
    outstanding: 'Rs 1,240.00',
    status: 'ACTIVE',
  },
  {
    name: 'Sample Clinic Account B',
    phone: '+91 98*** **445',
    type: 'CLINIC',
    limit: 'Rs 25,000.00',
    outstanding: 'Rs 6,850.00',
    status: 'ACTIVE',
  },
  {
    name: 'Sample Regular Customer C',
    phone: '+91 97*** **881',
    type: 'REGULAR',
    limit: 'Rs 2,000.00',
    outstanding: 'Rs 0.00',
    status: 'SETTLED',
  },
];

export const ProductDemoSection: React.FC<{ onRequestTrial: () => void }> = ({
  onRequestTrial,
}) => {
  const [activeTab, setActiveTab] = useState<DemoTabKey>('billing');
  const [posSearch, setPosSearch] = useState('');
  const [cartQty, setCartQty] = useState<Record<string, number>>({
    m1: 2,
    m2: 1,
  });
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'low' | 'expiry'>('all');

  const tabs: Array<{ key: DemoTabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'billing', label: 'Billing', icon: Receipt },
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'inventory', label: 'Medicines & Stock', icon: Pill },
    { key: 'purchases', label: 'Purchases', icon: ShoppingBag },
    { key: 'customers', label: 'Customers', icon: Users },
  ];

  const filteredMeds = SAMPLE_MEDICINES.filter(
    (m) =>
      m.name.toLowerCase().includes(posSearch.toLowerCase()) ||
      m.salt.toLowerCase().includes(posSearch.toLowerCase())
  );

  const cartLines = SAMPLE_MEDICINES.filter((m) => (cartQty[m.id] || 0) > 0).map((m) => ({
    ...m,
    qty: cartQty[m.id] || 0,
    lineTotal: (cartQty[m.id] || 0) * m.mrp,
  }));

  const grandTotal = cartLines.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxableValue = grandTotal / 1.12;
  const gstAmount = grandTotal - taxableValue;

  const filteredBatches = SAMPLE_MEDICINES.filter((m) => {
    if (inventoryFilter === 'low') return m.stock < 25;
    if (inventoryFilter === 'expiry') return m.expiry.startsWith('02/') || m.expiry.startsWith('07/');
    return true;
  });

  return (
    <section
      id="product-demo"
      className="py-16 lg:py-24 bg-slate-50 border-y border-slate-200"
      aria-labelledby="demo-section-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold text-blue-700 tracking-wide">
            Interactive Product Demonstration · Sample Pharmacy Data
          </p>
          <h2
            id="demo-section-heading"
            className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
          >
            Explore How Your Team Uses PharmaDesk Daily
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
            Switch between modules below to inspect billing, stock batches, purchase inward, and
            customer Khata workflows using clearly marked sample data before signing up.
          </p>
        </div>

        {/* Interactive Tab Selector */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div
            className="flex flex-wrap items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl"
            role="tablist"
            aria-label="PharmaDesk product preview tabs"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <span className="text-xs text-slate-500">
            Demonstration Environment · No live pharmacy records displayed
          </span>
        </div>

        {/* Interactive Preview Frame */}
        <div className="mt-5 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-5 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-semibold">PharmaDesk Sample Store</span>
              <span aria-hidden="true" className="text-slate-500">/</span>
              <span className="text-slate-300">Main Retail Counter · Sample Preview</span>
            </div>
            <button
              type="button"
              onClick={onRequestTrial}
              className="text-blue-300 hover:text-white font-semibold whitespace-nowrap"
            >
              Request Guided Walkthrough →
            </button>
          </div>

          <div className="p-5 sm:p-6">
            {activeTab === 'billing' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      Counter POS · Add Medicine by Name, Salt or Barcode
                    </h3>
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={posSearch}
                        onChange={(e) => setPosSearch(e.target.value)}
                        placeholder="Search sample medicine..."
                        aria-label="Search sample medicines in POS demo"
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="py-2.5 px-3">Medicine &amp; Salt</th>
                          <th className="py-2.5 px-3">FEFO Batch</th>
                          <th className="py-2.5 px-3 text-right">MRP</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredMeds.map((med) => (
                          <tr key={med.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3">
                              <span className="font-semibold text-slate-900 block">{med.name}</span>
                              <span className="text-[11px] text-slate-500">{med.salt}</span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                              {med.batch} · Exp {med.expiry}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                              Rs {med.mrp.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setCartQty((prev) => ({
                                    ...prev,
                                    [med.id]: (prev[med.id] || 0) + 1,
                                  }))
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold whitespace-nowrap"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <span className="text-xs font-bold text-slate-900">Active Sample Bill</span>
                    <span className="text-[11px] font-mono text-slate-500">GST 12% Split</span>
                  </div>

                  {cartLines.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">
                      Click Add on any sample medicine to calculate GST totals.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {cartLines.map((line) => (
                        <div
                          key={line.id}
                          className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                        >
                          <div>
                            <span className="font-semibold text-slate-900 block">{line.name}</span>
                            <span className="text-[11px] font-mono text-slate-500">
                              {line.qty} × Rs {line.mrp.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-semibold tabular-nums text-slate-900">
                              Rs {line.lineTotal.toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setCartQty((prev) => ({
                                  ...prev,
                                  [line.id]: Math.max(0, (prev[line.id] || 0) - 1),
                                }))
                              }
                              className="text-[11px] text-slate-500 hover:text-rose-600 font-semibold"
                              aria-label={`Remove one ${line.name}`}
                            >
                              −
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Taxable Value</span>
                      <span className="font-mono tabular-nums">Rs {taxableValue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>CGST + SGST (12%)</span>
                      <span className="font-mono tabular-nums">Rs {gstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-slate-900 pt-1">
                      <span>Net Invoice Total</span>
                      <span className="font-mono tabular-nums text-blue-700">
                        Rs {grandTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                    <span className="text-xs text-slate-500 block">Sample Today Sales</span>
                    <span className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1 block">
                      Rs 42,680.00
                    </span>
                    <span className="text-[11px] text-slate-600 mt-1 block">
                      Cash · UPI · Card · Khata split
                    </span>
                  </div>
                  <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                    <span className="text-xs text-slate-500 block">Sample Near-Expiry Batches</span>
                    <span className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1 block">
                      6 Batches
                    </span>
                    <span className="text-[11px] text-slate-600 mt-1 block">
                      Flagged inside 90-day window
                    </span>
                  </div>
                  <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                    <span className="text-xs text-slate-500 block">Sample Low-Stock Items</span>
                    <span className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1 block">
                      9 Items
                    </span>
                    <span className="text-[11px] text-slate-600 mt-1 block">
                      Below minimum threshold
                    </span>
                  </div>
                  <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                    <span className="text-xs text-slate-500 block">Sample Customer Khata Due</span>
                    <span className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1 block">
                      Rs 8,090.00
                    </span>
                    <span className="text-[11px] text-slate-600 mt-1 block">
                      Tracked across credit accounts
                    </span>
                  </div>
                </div>

                <div className="p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-700">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      Dashboard numbers shown above are illustrative sample figures. Live accounts
                      compute totals directly from your Firestore invoices, batches, and general ledger.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'inventory' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    Sample Batch Inventory &amp; Expiry Control
                  </h3>
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                    {[
                      { id: 'all', label: 'All Batches' },
                      { id: 'low', label: 'Low Stock' },
                      { id: 'expiry', label: 'Near Expiry' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setInventoryFilter(f.id as 'all' | 'low' | 'expiry')}
                        className={`px-3 py-1 rounded-md font-medium whitespace-nowrap ${
                          inventoryFilter === f.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-4">Medicine</th>
                        <th className="py-2.5 px-4">Batch Number</th>
                        <th className="py-2.5 px-4">Expiry Date</th>
                        <th className="py-2.5 px-4 text-right">Available Stock</th>
                        <th className="py-2.5 px-4">Safety Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredBatches.map((item) => {
                        const isLow = item.stock < 25;
                        return (
                          <tr key={item.id}>
                            <td className="py-2.5 px-4 font-semibold text-slate-900">{item.name}</td>
                            <td className="py-2.5 px-4 font-mono text-slate-600">{item.batch}</td>
                            <td className="py-2.5 px-4 font-mono text-slate-700">{item.expiry}</td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                              {item.stock} units
                            </td>
                            <td className="py-2.5 px-4">
                              {isLow ? (
                                <span className="inline-flex items-center gap-1 text-amber-800 font-medium">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Low Stock Alert</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>FEFO Ready</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'purchases' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Sample Purchase Orders &amp; GRN Inward Tracking
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-4">PO Number</th>
                        <th className="py-2.5 px-4">Supplier</th>
                        <th className="py-2.5 px-4">Destination Branch</th>
                        <th className="py-2.5 px-4 text-right">Lines</th>
                        <th className="py-2.5 px-4 text-right">Order Value</th>
                        <th className="py-2.5 px-4">Workflow State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {SAMPLE_PURCHASE_ORDERS.map((po) => (
                        <tr key={po.poNumber}>
                          <td className="py-2.5 px-4 font-mono font-semibold text-blue-700">
                            {po.poNumber}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-slate-900">{po.supplier}</td>
                          <td className="py-2.5 px-4 text-slate-600">{po.branch}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                            {po.itemsCount}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                            {po.amount}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-slate-700">
                            {po.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'customers' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Sample Customer Directory &amp; Khata Credit Ledger
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-4">Account</th>
                        <th className="py-2.5 px-4">Masked Phone</th>
                        <th className="py-2.5 px-4">Category</th>
                        <th className="py-2.5 px-4 text-right">Credit Limit</th>
                        <th className="py-2.5 px-4 text-right">Outstanding Khata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {SAMPLE_CUSTOMERS.map((cust) => (
                        <tr key={cust.name}>
                          <td className="py-2.5 px-4 font-semibold text-slate-900">{cust.name}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-600">{cust.phone}</td>
                          <td className="py-2.5 px-4 text-slate-600">{cust.type}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                            {cust.limit}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {cust.outstanding}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

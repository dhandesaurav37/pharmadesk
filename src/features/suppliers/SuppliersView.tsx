/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Truck,
  Search,
  Plus,
  Phone,
  Mail,
  Building,
  CheckCircle2,
  Boxes,
  X,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { Supplier } from '../../types/pharmacy.ts';

export const SuppliersView: React.FC = () => {
  const { suppliers, addSupplier, setActiveQuickModal } = usePharmacy();

  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form State
  const [agencyName, setAgencyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Mumbai');
  const [dlNumber, setDlNumber] = useState('');
  const [gstin, setGstin] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 21 days');
  const [outstandingBalance, setOutstandingBalance] = useState(0);

  const totalPayables = suppliers.reduce((sum, s) => sum + s.outstandingBalance, 0);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      const q = search.toLowerCase();
      return (
        s.agencyName.toLowerCase().includes(q) ||
        s.contactPerson.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.gstin.toLowerCase().includes(q)
      );
    });
  }, [suppliers, search]);

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    addSupplier({
      agencyName,
      contactPerson,
      phone: phone.startsWith('+91') ? phone : `+91 ${phone}`,
      email,
      city,
      dlNumber,
      gstin: gstin.toUpperCase(),
      paymentTerms,
      outstandingBalance: Number(outstandingBalance) || 0,
    });
    setIsAddOpen(false);
    // Reset
    setAgencyName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setDlNumber('');
    setGstin('');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Suppliers & Stockists Directory
            </h1>
            <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md font-mono">
              {suppliers.length} Stockists
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pharmaceutical distributors, wholesale drug licenses, and credit payment terms
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Supplier</span>
        </button>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Total Supplier Payables
          </span>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1">
            ₹{totalPayables.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Pending invoices from pharmaceutical distributors
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Active Wholesalers
          </span>
          <div className="text-2xl font-bold font-mono text-blue-700 tabular-nums mt-1">
            {suppliers.length}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Authorized Form 20B/21B wholesale distributors
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Standard Credit Terms
          </span>
          <div className="text-xl font-bold text-slate-800 mt-1">
            Net 15 - 30 Days
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Expiry returns & debit note reconciliation
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search stockist agency name, contact person, city, or GSTIN..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredSuppliers.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <h3 className="text-sm font-semibold text-slate-700">No suppliers found</h3>
            <p className="text-xs text-slate-500 mt-1">Add a new pharmaceutical distributor.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Distributor Agency</th>
                  <th className="py-3 px-4">Contact & Phone</th>
                  <th className="py-3 px-4 font-mono">Drug License (DL)</th>
                  <th className="py-3 px-4 font-mono">GSTIN</th>
                  <th className="py-3 px-4">Payment Terms</th>
                  <th className="py-3 px-4 text-right font-mono">Outstanding Due (₹)</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map(sup => (
                  <tr key={sup.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{sup.agencyName}</div>
                      <div className="text-[11px] text-slate-500">{sup.city}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="text-slate-800 font-medium">{sup.contactPerson}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{sup.phone}</div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                      {sup.dlNumber}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                      {sup.gstin}
                    </td>

                    <td className="py-3 px-4">
                      <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {sup.paymentTerms}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                      ₹{sup.outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setActiveQuickModal('stock')}
                        className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        + Inward Stock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Supplier Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Add Pharmaceutical Distributor
                </h3>
                <p className="text-[11px] text-slate-500">Record stockist credentials & wholesale license</p>
              </div>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Distributor Agency Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Pharma Distributors"
                  value={agencyName}
                  onChange={e => setAgencyName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Person *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Haresh Vora"
                    value={contactPerson}
                    onChange={e => setContactPerson(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile / Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="98200 12345"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Terms
                  </label>
                  <select
                    value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                  >
                    <option value="Net 15 days">Net 15 days</option>
                    <option value="Net 21 days">Net 21 days</option>
                    <option value="Net 30 days">Net 30 days</option>
                    <option value="Cash on Delivery">Cash on Delivery</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Wholesale DL No *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="MH-MZ4-20B/8911"
                    value={dlNumber}
                    onChange={e => setDlNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GSTIN *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="27AAECM4019C1Z4"
                    value={gstin}
                    onChange={e => setGstin(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Opening Payable Balance (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={outstandingBalance}
                  onChange={e => setOutstandingBalance(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

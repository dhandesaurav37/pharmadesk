/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  IndianRupee,
  CheckCircle2,
  Calendar,
  Stethoscope,
  CreditCard,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { Customer } from '../../types/pharmacy.ts';

export const CustomersView: React.FC = () => {
  const { customers, updateCustomerKhata, setActiveQuickModal } = usePharmacy();

  const [search, setSearch] = useState('');
  const [filterKhataOnly, setFilterKhataOnly] = useState(false);
  const [settlingCustomer, setSettlingCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [settleSuccess, setSettleSuccess] = useState(false);

  const totalKhataOutstanding = customers.reduce((sum, c) => sum + c.khataBalance, 0);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const q = search.toLowerCase();
      const matchesSearch =
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.doctorName && c.doctorName.toLowerCase().includes(q));

      if (!matchesSearch) return false;
      if (filterKhataOnly) return c.khataBalance > 0;
      return true;
    });
  }, [customers, search, filterKhataOnly]);

  const handleOpenSettle = (c: Customer) => {
    setSettlingCustomer(c);
    setPaymentAmount(c.khataBalance);
  };

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingCustomer || !paymentAmount) return;

    updateCustomerKhata(settlingCustomer.id, -Number(paymentAmount));
    setSettleSuccess(true);
    setTimeout(() => {
      setSettleSuccess(false);
      setSettlingCustomer(null);
    }, 800);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Customers & Patient Khata Directory
            </h1>
            <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md font-mono">
              {customers.length} Accounts
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Track customer medical profiles, prescribing doctors, and credit balances
          </p>
        </div>

        <button
          onClick={() => setActiveQuickModal('customer')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Customer</span>
        </button>
      </div>

      {/* KPI Cards Strip for Khata */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Total Khata Receivables
          </span>
          <div className="text-2xl font-bold font-mono text-amber-700 tabular-nums mt-1">
            ₹{totalKhataOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Across {customers.filter(c => c.khataBalance > 0).length} customer credit accounts
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Registered Patients
          </span>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1">
            {customers.length}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Repeat walk-in and chronic medication patients
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Prescription Linkage
          </span>
          <div className="text-2xl font-bold font-mono text-blue-700 tabular-nums mt-1">
            {customers.filter(c => c.doctorName).length}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Patients with linked consulting doctors
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by customer name, phone number or doctor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={filterKhataOnly}
              onChange={e => setFilterKhataOnly(e.target.checked)}
              className="rounded text-blue-600"
            />
            <span className="font-medium">Show Pending Khata Only</span>
          </label>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <h3 className="text-sm font-semibold text-slate-700">No customers found</h3>
            <p className="text-xs text-slate-500 mt-1">Add a new patient or adjust search terms.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4 font-mono">Mobile Number</th>
                  <th className="py-3 px-4">Prescribing Doctor</th>
                  <th className="py-3 px-4 text-center font-mono">Visits</th>
                  <th className="py-3 px-4 text-right font-mono">Total Billed</th>
                  <th className="py-3 px-4 text-right font-mono">Khata Due (₹)</th>
                  <th className="py-3 px-4 font-mono">Last Visit</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map(customer => {
                  const hasKhata = customer.khataBalance > 0;
                  return (
                    <tr key={customer.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{customer.name}</div>
                        {customer.address && (
                          <div className="text-[11px] text-slate-500 truncate max-w-xs">
                            {customer.address}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-700">
                        {customer.phone}
                      </td>

                      <td className="py-3 px-4">
                        {customer.doctorName ? (
                          <div className="flex items-center gap-1.5 text-slate-800">
                            <Stethoscope className="w-3 h-3 text-blue-600 shrink-0" />
                            <span className="truncate max-w-[180px]">{customer.doctorName}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Self Medication / OTC</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">
                        {customer.totalVisits}
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        ₹{customer.totalPurchased.toLocaleString('en-IN')}
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {hasKhata ? (
                          <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                            ₹{customer.khataBalance.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-semibold">₹0.00 (Clear)</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {customer.lastVisit}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {hasKhata ? (
                          <button
                            onClick={() => handleOpenSettle(customer)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs transition-colors"
                          >
                            Receive Cash
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
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

      {/* Settle Khata Payment Modal */}
      {settlingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Receive Khata Credit Payment
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  {settlingCustomer.name}
                </p>
              </div>
              <button
                onClick={() => setSettlingCustomer(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {settleSuccess ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-900">Payment Recorded</h4>
                <p className="text-xs text-slate-500">Customer Khata ledger updated.</p>
              </div>
            ) : (
              <form onSubmit={handleSettleSubmit} className="p-5 space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                  Current Outstanding Due:{' '}
                  <span className="font-bold font-mono">
                    ₹{settlingCustomer.khataBalance.toFixed(2)}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount Received (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={settlingCustomer.khataBalance}
                    required
                    value={paymentAmount}
                    onChange={e =>
                      setPaymentAmount(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSettlingCustomer(null)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                  >
                    Record Receipt
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

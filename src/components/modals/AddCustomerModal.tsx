/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, UserPlus, CheckCircle2 } from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';

export const AddCustomerModal: React.FC = () => {
  const { activeQuickModal, setActiveQuickModal, addCustomer } = usePharmacy();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [khataBalance, setKhataBalance] = useState(0);
  const [notes, setNotes] = useState('');
  const [success, setSuccess] = useState(false);

  if (activeQuickModal !== 'customer') return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedPhone = phone.startsWith('+91') ? phone : `+91 ${phone.trim()}`;
    addCustomer({
      name,
      phone: formattedPhone,
      address,
      doctorName,
      khataBalance: Number(khataBalance) || 0,
      notes,
    });

    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setActiveQuickModal(null);
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Add Customer / Patient</h3>
              <p className="text-[11px] text-slate-500">Record Khata credit account & doctor details</p>
            </div>
          </div>

          <button
            onClick={() => setActiveQuickModal(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <h4 className="text-base font-bold text-slate-900">Customer Added</h4>
            <p className="text-xs text-slate-500 mt-1">Customer profile and Khata ledger ready.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Rameshwar Gupta"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mobile Number *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-slate-400 font-mono">+91</span>
                <input
                  type="tel"
                  required
                  placeholder="98200 12345"
                  value={phone.replace(/^\+91\s*/, '')}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full pl-11 pr-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Prescribing Doctor (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Dr. Rajesh Mehta (Cardiologist)"
                value={doctorName}
                onChange={e => setDoctorName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Address / Flat / Area
              </label>
              <input
                type="text"
                placeholder="e.g. Flat 102, Shanti Niwas, Bandra West"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Opening Khata Credit (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={khataBalance}
                  onChange={e => setKhataBalance(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Customer Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Senior citizen, monthly BP"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveQuickModal(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
              >
                Save Customer
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

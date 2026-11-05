/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Building2,
  FileText,
  Printer,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Shield,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { PharmacyStore } from '../../types/pharmacy.ts';

export const StoreOnboardingModal: React.FC = () => {
  const { store, updateStore, isStoreOnboardingOpen, setIsStoreOnboardingOpen } = usePharmacy();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<PharmacyStore>(store);
  const [successMessage, setSuccessMessage] = useState(false);

  if (!isStoreOnboardingOpen) return null;

  const handleChange = (field: keyof PharmacyStore, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateStore(formData);
    setSuccessMessage(true);
    setTimeout(() => {
      setSuccessMessage(false);
      setIsStoreOnboardingOpen(false);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Store Onboarding & Configuration
              </h2>
              <p className="text-xs text-slate-500">
                Setup legal pharmacy licenses, GSTIN, and retail billing format
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsStoreOnboardingOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps indicator */}
        <div className="px-6 py-3 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-1.5 font-medium ${
              step === 1 ? 'text-blue-700 font-semibold' : 'text-slate-500'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 1 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-700'}`}>1</span>
            <span>Store Profile</span>
          </button>
          <span className="text-slate-300">/</span>
          <button
            type="button"
            onClick={() => setStep(2)}
            className={`flex items-center gap-1.5 font-medium ${
              step === 2 ? 'text-blue-700 font-semibold' : 'text-slate-500'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-700'}`}>2</span>
            <span>Drug Licenses & GST</span>
          </button>
          <span className="text-slate-300">/</span>
          <button
            type="button"
            onClick={() => setStep(3)}
            className={`flex items-center gap-1.5 font-medium ${
              step === 3 ? 'text-blue-700 font-semibold' : 'text-slate-500'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 3 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-700'}`}>3</span>
            <span>Billing & Invoices</span>
          </button>
        </div>

        {successMessage ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Store Details Updated</h3>
            <p className="text-sm text-slate-500">
              The pharmacy profile and billing headers have been synchronized.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Pharmacy / Store Trade Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={e => handleChange('name', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                        placeholder="e.g. Apex Medicos & Healthcare"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Branch Name / Location *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.branchName}
                        onChange={e => handleChange('branchName', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                        placeholder="e.g. Main Store (Bandra West)"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Shop Address *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.address}
                      onChange={e => handleChange('address', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                      placeholder="Shop No. 4, Hill Road, Bandra West"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        City *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.city}
                        onChange={e => handleChange('city', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                        placeholder="Mumbai"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        State *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.state}
                        onChange={e => handleChange('state', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                        placeholder="Maharashtra"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        PIN Code *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.pincode}
                        onChange={e => handleChange('pincode', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                        placeholder="400050"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Contact Phone / Mobile *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.phone}
                        onChange={e => handleChange('phone', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                        placeholder="+91 98201 44820"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Store Email
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={e => handleChange('email', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                        placeholder="apexmedicos.mumbai@gmail.com"
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-blue-800 leading-relaxed">
                    Under the Drugs and Cosmetics Act, 1940 and GST regulations in India, retail pharmacies must record Form 20B and 21B drug licenses on all customer invoices.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Drug License 20B (Retail Allopathic) *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.dlNumber20B}
                        onChange={e => handleChange('dlNumber20B', e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                        placeholder="MH-MZ4-194820"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Drug License 21B (Specified Schedules) *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.dlNumber21B}
                        onChange={e => handleChange('dlNumber21B', e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                        placeholder="MH-MZ4-194821"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      GSTIN (15 Digits) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.gstin}
                      onChange={e => handleChange('gstin', e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                      placeholder="27AABCS1429B1Z8"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      FSSAI Food License Number (Optional for nutraceuticals)
                    </label>
                    <input
                      type="text"
                      value={formData.fssaiNumber}
                      onChange={e => handleChange('fssaiNumber', e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                      placeholder="11522018000412"
                    />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Invoice Bill Prefix *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.invoicePrefix}
                        onChange={e => handleChange('invoicePrefix', e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                        placeholder="AMB"
                      />
                      <span className="text-[11px] text-slate-500 mt-1 block">
                        Example invoice format: {formData.invoicePrefix || 'INV'}-2026-1049
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Default Customer Discount (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={formData.defaultDiscountPercent}
                        onChange={e => handleChange('defaultDiscountPercent', Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-hidden"
                      />
                      <span className="text-[11px] text-slate-500 mt-1 block">
                        Applied to walk-in prescriptions automatically
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Receipt Printer Hardware
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label
                        className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                          formData.thermalPrinter
                            ? 'border-blue-600 bg-blue-50/50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="printer"
                          checked={formData.thermalPrinter}
                          onChange={() => handleChange('thermalPrinter', true)}
                          className="mt-1"
                        />
                        <div>
                          <span className="text-xs font-semibold text-slate-900 block">
                            Thermal POS (80mm / 3 inch)
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Fast roll printing for retail checkout counter
                          </span>
                        </div>
                      </label>

                      <label
                        className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                          !formData.thermalPrinter
                            ? 'border-blue-600 bg-blue-50/50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="printer"
                          checked={!formData.thermalPrinter}
                          onChange={() => handleChange('thermalPrinter', false)}
                          className="mt-1"
                        />
                        <div>
                          <span className="text-xs font-semibold text-slate-900 block">
                            Standard A4 / A5 Tax Invoice
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Detailed GST breakdown with duplicate copy
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div>
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center gap-1.5"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsStoreOnboardingOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div>
                {step < 3 ? (
                  <button
                    type="button"
                    onClick={() => setStep(step + 1)}
                    className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 shadow-xs"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Save Store Settings</span>
                  </button>
                )}
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

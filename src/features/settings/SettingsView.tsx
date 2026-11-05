/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Settings,
  Building2,
  FileText,
  Printer,
  ShieldCheck,
  Database,
  CheckCircle2,
  Save,
  Server,
  Key,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { PharmacyStore } from '../../types/pharmacy.ts';

type SettingsTab = 'store' | 'billing' | 'roles' | 'architecture';

export const SettingsView: React.FC = () => {
  const { store, updateStore, usersList } = usePharmacy();

  const [activeTab, setActiveTab] = useState<SettingsTab>('store');
  const [formData, setFormData] = useState<PharmacyStore>(store);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleFieldChange = (key: keyof PharmacyStore, val: any) => {
    setFormData(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateStore(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Pharmacy & Store Settings
            </h1>
            <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md font-mono">
              Configuration
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Store identity, drug licensing, receipt printing format and system architecture
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings saved</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('store')}
          className={`pb-3 px-3 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'store'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Pharmacy & Licenses</span>
        </button>

        <button
          onClick={() => setActiveTab('billing')}
          className={`pb-3 px-3 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'billing'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>Receipt & Billing</span>
        </button>

        <button
          onClick={() => setActiveTab('roles')}
          className={`pb-3 px-3 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'roles'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Role Permissions</span>
        </button>

        <button
          onClick={() => setActiveTab('architecture')}
          className={`pb-3 px-3 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'architecture'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>Backend & Cloud Architecture</span>
        </button>
      </div>

      {/* Tab 1: Pharmacy Profile & Licenses */}
      {activeTab === 'store' && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pharmacy Trade Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => handleFieldChange('name', e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Branch Name *
              </label>
              <input
                type="text"
                required
                value={formData.branchName}
                onChange={e => handleFieldChange('branchName', e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
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
              onChange={e => handleFieldChange('address', e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={e => handleFieldChange('city', e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
              <input
                type="text"
                value={formData.state}
                onChange={e => handleFieldChange('state', e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">PIN Code</label>
              <input
                type="text"
                value={formData.pincode}
                onChange={e => handleFieldChange('pincode', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
              Statutory Drug Licenses & GSTIN
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Drug License Form 20B (Retail Allopathic) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.dlNumber20B}
                  onChange={e => handleFieldChange('dlNumber20B', e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Drug License Form 21B (Retail Specific Drugs) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.dlNumber21B}
                  onChange={e => handleFieldChange('dlNumber21B', e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  GSTIN (Goods and Services Tax Identification Number) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.gstin}
                  onChange={e => handleFieldChange('gstin', e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  FSSAI Food License Number
                </label>
                <input
                  type="text"
                  value={formData.fssaiNumber}
                  onChange={e => handleFieldChange('fssaiNumber', e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Pharmacy Profile</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Billing & Receipt Setup */}
      {activeTab === 'billing' && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice Series Prefix *
              </label>
              <input
                type="text"
                required
                value={formData.invoicePrefix}
                onChange={e => handleFieldChange('invoicePrefix', e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Resulting format: {formData.invoicePrefix || 'INV'}-2026-1049
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Patient Discount (%)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={formData.defaultDiscountPercent}
                onChange={e => handleFieldChange('defaultDiscountPercent', Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Auto-applied on standard prescriptions
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Default Printer Hardware & Invoice Output
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-4 border rounded-xl cursor-pointer flex items-start gap-3 transition-colors ${
                  formData.thermalPrinter
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="printerSetting"
                  checked={formData.thermalPrinter}
                  onChange={() => handleFieldChange('thermalPrinter', true)}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    80mm Thermal Receipt (3-inch roll)
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    High-speed point-of-sale receipt for walk-in retail counters.
                  </span>
                </div>
              </label>

              <label
                className={`p-4 border rounded-xl cursor-pointer flex items-start gap-3 transition-colors ${
                  !formData.thermalPrinter
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="printerSetting"
                  checked={!formData.thermalPrinter}
                  onChange={() => handleFieldChange('thermalPrinter', false)}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Standard A4 / A5 Tax Invoice
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Detailed GST breakdown with duplicate buyer and seller copies.
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Billing Preferences</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab 3: Role Permissions Matrix */}
      {activeTab === 'roles' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Role-Based Access Control (RBAC)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Strict access levels configured for independent stores and multi-branch employees
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                  <th className="py-2.5 px-4">Module / Permission</th>
                  <th className="py-2.5 px-4 text-center font-bold text-blue-700">Owner (Admin)</th>
                  <th className="py-2.5 px-4 text-center font-bold text-slate-800">Pharmacist</th>
                  <th className="py-2.5 px-4 text-center font-bold text-slate-800">Cashier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">POS Billing & Dispensing</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Medicines Master & Composition</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Edit</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Inventory & Expiry Audit</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Customer Directory & Khata Settle</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ View</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Settle Only</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Suppliers & Stock Inward</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Inward</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Accounts & Ledger Registers</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">GST Reports & GSTR-1 Summaries</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ View Only</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Pharmacy Licensing & Store Settings</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Backend & Cloud Architecture (Section 9 Compliance) */}
      {activeTab === 'architecture' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              System Architecture & Phase 2 Cloud Readiness
            </h3>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs text-slate-700 leading-relaxed">
            <div className="font-bold text-slate-900">
              Honest Architecture Disclosure (Phase 1 Foundation):
            </div>
            <p>
              PharmaDesk is designed strictly following the architectural specification:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
              <li>
                <span className="font-semibold text-slate-800">Primary Database:</span> Relational PostgreSQL on Google Cloud (Cloud SQL) with strict foreign keys between medicines, batches, customers, and invoice items. Firestore is NOT used for primary pharmacy transactional records.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Identity & Authentication:</span> Firebase Authentication will manage multi-tenant pharmacist credentials, phone OTP verification, and JWT custom role claims (Owner, Pharmacist, Cashier).
              </li>
              <li>
                <span className="font-semibold text-slate-800">Backend API:</span> Node.js with TypeScript and Express proxy endpoints ready for cloud deployment.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Offline Resilience:</span> IndexedDB / LocalStorage client cache ensures uninterrupted counter billing when local internet connectivity fluctuates.
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Client Layer
              </span>
              <span className="font-bold text-slate-900 block mt-1">React 19 + TypeScript</span>
              <span className="text-emerald-700 font-medium text-[11px]">✓ Production-Grade UI</span>
            </div>
            <div className="p-3 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Primary Database
              </span>
              <span className="font-bold text-slate-900 block mt-1">PostgreSQL on GCP</span>
              <span className="text-blue-600 font-medium text-[11px]">Schema Designed (Phase 2)</span>
            </div>
            <div className="p-3 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Authentication
              </span>
              <span className="font-bold text-slate-900 block mt-1">Firebase Auth</span>
              <span className="text-blue-600 font-medium text-[11px]">Claims Ready (Phase 2)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

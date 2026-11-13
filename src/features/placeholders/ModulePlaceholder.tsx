/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ShoppingBag,
  Landmark,
  UserCheck,
  BarChart3,
  ArrowLeft,
  Calendar,
  Layers,
  Sparkles,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { NavigationModule } from '../../types/pharmacy.ts';

interface ModulePlaceholderProps {
  module: NavigationModule;
}

interface ModuleInfo {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  phase: string;
  plannedFeatures: string[];
  databaseSchema: string;
}

const MODULE_DETAILS: Record<string, ModuleInfo> = {
  purchases: {
    title: 'Purchases & Inward Invoices',
    subtitle: 'Distributor purchase bill entry with batch reception, purchase tax credits (ITC) and stockist debit notes',
    icon: ShoppingBag,
    phase: 'Phase 8: Supply Chain Integration',
    plannedFeatures: [
      'Inward purchase entry matching distributor GST tax invoices',
      'Automatic batch creation with PTR, trade discount, and scheme free strips (e.g., 10+1)',
      'Input Tax Credit (ITC) reconciliation with GST portal',
      'Debit notes & credit notes for near-expiry and damaged medicine returns',
    ],
    databaseSchema: 'tenants/{tenantId}/goods_receipts/{receiptId} & tenants/{tenantId}/purchase_orders/{poId}',
  },
  accounts: {
    title: 'Accounts, Daily Cash & Reconciliation',
    subtitle: 'Daily register closing, cash drawer reconciliation, UPI settlements, and distributor payables ledger',
    icon: Landmark,
    phase: 'Phase 9: Financial Ledger',
    plannedFeatures: [
      'Day-end cash drawer tally with opening and closing balance validation',
      'Bank UPI / Card swipe terminal settlement reconciliation',
      'Patient Khata ledger statements with automated payment reminder links',
      'Distributor payment scheduling with Net 15/30 day alerts',
    ],
    databaseSchema: 'tenants/{tenantId}/accounting_records/{entryId} & tenants/{tenantId}/expenses/{expenseId}',
  },
  employees: {
    title: 'Staff, Pharmacists & Role Access',
    subtitle: 'Multi-branch employee management, pharmacist council registration numbers, and shift attendance',
    icon: UserCheck,
    phase: 'Active: Team Operations',
    plannedFeatures: [
      'State Pharmacy Council registration verification for dispensing staff',
      'Granular permission assignment (Billing only, Stock entry only, Owner audit)',
      'Daily counter billing shift assignment and cashier discrepancy tracking',
      'Firebase Authentication integration with live Firestore membership checks',
    ],
    databaseSchema: 'tenants/{tenantId}/memberships/{userId} & tenants/{tenantId}/invitations/{invitationId}',
  },
  reports: {
    title: 'Reports & GST Filings',
    subtitle: 'GSTR-1 outward supply summaries, HSN-wise sales data, Schedule H1 audit export, and expiry loss analysis',
    icon: BarChart3,
    phase: 'Phase 9: Analytics & Statutory Filing',
    plannedFeatures: [
      'GSTR-1 JSON and Excel format export for monthly/quarterly tax filing',
      'Schedule H1 & Narcotic physical register audit log ready for Drug Inspector inspection',
      'Fast-moving vs non-moving dead stock inventory analytics',
      'Expiry loss prevention report with 30, 60, and 90-day stock alerts',
    ],
    databaseSchema: 'tenants/{tenantId}/reports/{reportId} (computed from sales_invoices & inventory_batches)',
  },
};

export const ModulePlaceholder: React.FC<ModulePlaceholderProps> = ({ module }) => {
  const { setActiveModule } = usePharmacy();
  const info = MODULE_DETAILS[module] || {
    title: module.toUpperCase(),
    subtitle: 'Upcoming Cloud Firestore module',
    icon: Layers,
    phase: 'Roadmap Module',
    plannedFeatures: ['Upcoming pharmacy feature module.'],
    databaseSchema: 'tenants/{tenantId}/...',
  };

  const Icon = info.icon;

  return (
    <div className="space-y-6">
      {/* Breadcrumb / Back */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveModule('dashboard')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Main Roadmap Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-8 max-w-3xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-100">
            <Icon className="w-6 h-6" />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                {info.phase}
              </span>
              <span className="text-xs text-slate-400">Architecture Roadmap</span>
            </div>

            <h1 className="text-xl font-bold text-slate-900 mt-2">
              {info.title}
            </h1>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {info.subtitle}
            </p>
          </div>
        </div>

        {/* Planned Features List */}
        <div className="mt-6 pt-6 border-t border-slate-100">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
            Planned Module Capabilities
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {info.plannedFeatures.map((feat, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start gap-2.5 text-xs"
              >
                <div className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  ✓
                </div>
                <span className="text-slate-700 leading-normal">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Database Schema Alignment */}
        <div className="mt-6 p-4 bg-slate-950 text-slate-200 rounded-xl font-mono text-xs">
          <div className="text-[11px] text-slate-400 font-sans font-semibold uppercase tracking-wider mb-1">
            Planned Cloud Firestore Collection Path:
          </div>
          <div className="text-emerald-400 overflow-x-auto">
            {info.databaseSchema}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 pt-6 border-t border-slate-100 flex items-center gap-3">
          <button
            onClick={() => setActiveModule('billing')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Open Active Billing (POS)</span>
          </button>
          <button
            onClick={() => setActiveModule('medicines')}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors"
          >
            View Medicines Directory
          </button>
        </div>
      </div>
    </div>
  );
};

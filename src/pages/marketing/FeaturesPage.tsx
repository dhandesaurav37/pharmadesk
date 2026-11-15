/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Receipt,
  Pill,
  ShoppingBag,
  Users,
  BarChart3,
  GitBranch,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import type { MarketingRoutePath } from '../../lib/seo.ts';

interface FeaturesPageProps {
  onNavigate: (route: MarketingRoutePath) => void;
}

const FEATURE_MODULES = [
  {
    icon: Receipt,
    title: 'Fast Counter POS & GST Billing',
    summary: 'Built for busy retail counters needing speed, accuracy, and compliance.',
    points: [
      'Instant medicine search by brand name, generic salt composition, or barcode scan',
      'Automatic FEFO batch recommendation and hard guard blocking expired stock',
      'Split settlements across Cash, UPI, Card, and Customer Khata credit',
      '80mm thermal receipt and A4/A5 GST tax invoice print templates with Drug License numbers',
      'Invoice cancellation and controlled sales return workflows',
    ],
  },
  {
    icon: Pill,
    title: 'Medicines Master, Batches & Expiry Safety',
    summary: 'Track every strip, bottle, and batch from purchase inward to customer dispense.',
    points: [
      'Complete Medicine Master with HSN codes, GST slabs, schedules, and pack sizes',
      'Batch-level PTR, MRP, selling rate, rack location, and expiry date tracking',
      'Dedicated near-expiry, expired, and low-stock alert views',
      'Complete stock movement ledger recording every sale, return, adjustment, and transfer',
    ],
  },
  {
    icon: ShoppingBag,
    title: 'Suppliers, Purchase Orders & GRN Inward',
    summary: 'Eliminate stock inward discrepancies and distributor payable confusion.',
    points: [
      'Supplier master with GSTIN, drug license, payment terms, and status controls',
      'Branch Purchase Orders with draft, submit, approve, and close lifecycle',
      'Goods Receipt Notes (GRN) capturing accepted, rejected, and free quantities per batch',
      'Supplier invoices, supplier returns, and invoice-allocated payments',
    ],
  },
  {
    icon: Users,
    title: 'Customer Directory & Khata Credit Ledger',
    summary: 'Replace manual credit notebooks with structured patient ledgers.',
    points: [
      'Normalized Indian mobile validation and customer categorization (Regular, Chronic, Clinic)',
      'Configurable credit limits and credit term tracking per customer',
      'FIFO payment allocation automatically settling oldest unpaid credit invoices',
      'Formatted WhatsApp balance summary helper for manual staff follow-up',
    ],
  },
  {
    icon: BarChart3,
    title: 'Double-Entry Accounting & Financial Reports',
    summary: 'Operational transactions flow directly into a structured general ledger.',
    points: [
      'Pharmacy Chart of Accounts, automatic journal vouchers, and manual journal support',
      'Branch operating expenses with approval and GST Input Tax Credit tracking',
      'Cash & Bank accounts with statement reconciliation and financial period locks',
      'Trial Balance, Profit & Loss, Balance Sheet, GST Input/Output, and CSV exports',
    ],
  },
  {
    icon: GitBranch,
    title: 'Multi-Branch Operations & Stock Transfers',
    summary: 'Run one pharmacy or coordinate multiple branches from a single workspace.',
    points: [
      'Branch-isolated stock batches, counters, expenses, and sales ledgers',
      'Owner/Auditor consolidated view across authorized branches',
      'Inter-branch stock transfer requests with approval, dispatch challans, receiving, and reconciliation',
      'Branch lifecycle controls (Active, Suspended, Closed) with pre-closure safety checks',
    ],
  },
  {
    icon: UserCheck,
    title: 'Staff Invitations & Role-Based Access Control',
    summary: 'Control exactly what every team member can view or modify.',
    points: [
      '5 predefined roles: Store Owner, Pharmacist, Cashier, Helper, and Auditor',
      'Granular permission overrides and per-branch staff assignments',
      'Immediate employee deactivation and backend token/session revocation',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Security, Audit Trail & DPDP Governance',
    summary: 'Enterprise-grade data isolation across Firebase Auth, Firestore, and Cloud Run.',
    points: [
      'Strict multi-tenant Firestore and Storage security rules with App Check support',
      'Server-side PHI/PII log redaction and immutable audit history',
      'DPDP data portability export endpoints and scheduled retention controls',
    ],
  },
];

export const FeaturesPage: React.FC<FeaturesPageProps> = ({ onNavigate }) => {
  return (
    <div className="bg-white">
      <section className="py-12 lg:py-20 border-b border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <p className="text-xs font-semibold text-blue-700 tracking-wide">
              PharmaDesk Capabilities
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Complete Modules for Modern Indian Pharmacies
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Every module below is implemented in PharmaDesk today — unified across retail billing,
              batch inventory, distributor procurement, accounting, and branch governance.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('/contact')}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors inline-flex items-center gap-2"
              >
                <span>Book a Live Demo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/pricing')}
                className="px-5 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold transition-colors"
              >
                Compare Plans
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FEATURE_MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.title}
                  className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{mod.title}</h2>
                      <p className="text-xs sm:text-sm text-slate-600 mt-1">{mod.summary}</p>
                    </div>
                  </div>
                  <ul className="space-y-2 pt-2 border-t border-slate-100">
                    {mod.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2 text-xs sm:text-sm text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Transparent Planned Automation Notice */}
          <div className="mt-10 bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Clock className="w-4 h-4 text-slate-600" />
                <span>Planned Roadmap (Not Yet Automated)</span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Upcoming Automation Extensions
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Automated distributor Purchase Order dispatch rules and scheduled automated
                WhatsApp/SMS credit reminders are planned future additions and are not marketed as
                live unattended automation today.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/contact')}
              className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              Discuss Your Workflow
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowRight, CheckCircle2, ShieldCheck, Building2, Layers } from 'lucide-react';
import type { PublicInquiryType } from '../../lib/publicLeadApi.ts';
import type { MarketingRoutePath } from '../../lib/seo.ts';

interface AboutPageProps {
  onNavigate: (route: MarketingRoutePath, inquiryType?: PublicInquiryType) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate }) => {
  return (
    <div className="bg-white">
      <section className="py-12 lg:py-20 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <p className="text-xs font-semibold text-blue-700 tracking-wide">About PharmaDesk</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Built to Simplify Daily Operations for Indian Medical Stores
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Pharmacies handle strict batch expiries, GST schedules, supplier credit terms, and
              patient refills every hour. PharmaDesk brings these operational records into one clean,
              dependable cloud platform.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-slate-200 rounded-2xl p-6 space-y-3">
              <Layers className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">One Connected System</h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Instead of maintaining separate POS tools, Excel expiry sheets, and paper Khata
                notebooks, every invoice, GRN, and settlement updates inventory and ledgers together.
              </p>
            </div>
            <div className="border border-slate-200 rounded-2xl p-6 space-y-3">
              <Building2 className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Designed for Indian Compliance</h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Supports GST CGST/SGST/IGST calculations, HSN taxonomy, Drug License headers (Form
                20B/21B), thermal/A4 printing, and multi-branch retail chains.
              </p>
            </div>
            <div className="border border-slate-200 rounded-2xl p-6 space-y-3">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Security-First Foundation</h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Built on Firebase Authentication, Cloud Firestore tenant isolation, Firebase App
                Check, and Google Cloud Run hosted in Mumbai (asia-south1).
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-xl font-bold text-slate-900">
                Who PharmaDesk Serves
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs sm:text-sm text-slate-700">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Independent retail medical stores</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Clinic &amp; hospital-attached dispensaries</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Multi-branch pharmacy owners</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Pharmacists, cashiers &amp; CA auditors</span>
                </li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/contact', 'BOOK_DEMO')}
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
            >
              <span>Schedule a Walkthrough</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ShieldCheck,
  Lock,
  Building2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Hero3DShowcase } from '../../components/marketing/Hero3DShowcase.tsx';
import { ProductDemoSection } from '../../components/marketing/ProductDemoSection.tsx';
import { LeadEnquiryForm } from '../../components/marketing/LeadEnquiryForm.tsx';
import {
  AUTOMATION_CAPABILITIES,
  FAQ_ITEMS,
  HOW_IT_WORKS_STEPS,
  PRODUCT_FEATURES_CORE,
} from '../../data/marketingContent.ts';
import type { PublicInquiryType } from '../../lib/publicLeadApi.ts';
import type { MarketingRoutePath } from '../../lib/seo.ts';

interface HomePageProps {
  onNavigate: (route: MarketingRoutePath) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [enquiryType, setEnquiryType] = useState<PublicInquiryType>('FREE_TRIAL');
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  const scrollToEnquiry = (type: PublicInquiryType) => {
    setEnquiryType(type);
    const el = document.getElementById('enquiry-form');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div>
      {/* 1. Hero Section */}
      <section className="bg-white pt-10 pb-16 lg:pt-16 lg:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            {/* Left Copy & Conversion Actions */}
            <div className="lg:col-span-5 flex flex-col justify-center space-y-6">
              <div className="space-y-4">
                <p className="text-xs font-semibold text-blue-700 tracking-wide">
                  Pharmacy &amp; Medical Store Management Software
                </p>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-[1.12]">
                  Your Pharmacy. Smarter with PharmaDesk.
                </h1>
                <p className="text-base sm:text-lg font-medium text-slate-800 leading-snug">
                  Everything Your Pharmacy Needs. In One Simple Platform.
                </p>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                  Fast billing, smart inventory, easier purchases and complete pharmacy management —
                  all in one place. Built for Indian medical stores, retail counters, and
                  multi-branch pharmacy teams.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => scrollToEnquiry('FREE_TRIAL')}
                  className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <span>Start Free Trial</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollToEnquiry('BOOK_DEMO')}
                  className="px-6 py-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  Book a Demo
                </button>
              </div>

              {/* Clean operational assurances (zero pill clutter) */}
              <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>GST POS &amp; Thermal Print</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>FEFO &amp; Expiry Guard</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Multi-Branch Ready</span>
                </div>
              </div>
            </div>

            {/* Right 3D Pharmacy Workstation Visual */}
            <div className="lg:col-span-7 flex flex-col">
              <Hero3DShowcase />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Product Showcase Section */}
      <section className="py-16 lg:py-24 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 max-w-none">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold text-blue-700 tracking-wide">
                Core Pharmacy Modules
              </p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Everything You Need to Run Your Pharmacy
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
                Manage billing, medicines, stock, purchases, accounts, and staff from one
                easy-to-use cloud platform.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/features')}
              className="text-sm font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span>Inspect All Features</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PRODUCT_FEATURES_CORE.map((feat) => (
              <div
                key={feat.key}
                className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                    <span>{feat.code}</span>
                    <span className="text-emerald-700 font-sans font-semibold">Live Module</span>
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-slate-900">{feat.title}</h3>
                  <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {feat.summary}
                  </p>
                  <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                    {feat.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-xs text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Interactive Product Demo Section */}
      <ProductDemoSection onRequestTrial={() => scrollToEnquiry('FREE_TRIAL')} />

      {/* 4. Automation & Smart Workflows Section */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-blue-700 tracking-wide">
              Operational Efficiency
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Spend Less Time Managing. More Time Growing.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
              PharmaDesk removes repetitive counter and ledger math while clearly distinguishing
              between live workflows and upcoming roadmap automation.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {AUTOMATION_CAPABILITIES.map((item) => {
              const isPlanned = item.status === 'PLANNED';
              return (
                <div
                  key={item.title}
                  className={`rounded-2xl border p-6 space-y-3 ${
                    isPlanned
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`font-semibold inline-flex items-center gap-1.5 ${
                        isPlanned ? 'text-slate-600' : 'text-blue-700'
                      }`}
                    >
                      {isPlanned ? (
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{item.badgeLabel}</span>
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. How It Works */}
      <section className="py-16 lg:py-24 bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-blue-700 tracking-wide">
              Simple Store Onboarding
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              How Your Pharmacy Gets Started
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS_STEPS.map((item) => (
              <div
                key={item.step}
                className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3"
              >
                <span className="text-xs font-mono font-bold text-blue-700">STEP {item.step}</span>
                <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Security, Trust & Honest Customer Review Policy */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5 space-y-4">
              <p className="text-xs font-semibold text-blue-700 tracking-wide">
                Architecture &amp; Trust
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Engineered for Medical Store Accuracy &amp; Data Privacy
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Your store invoices, supplier ledgers, and customer records stay isolated in your
                tenant workspace on Google Cloud &amp; Firebase (Mumbai region, asia-south1).
              </p>
              <button
                type="button"
                onClick={() => onNavigate('/privacy')}
                className="text-sm font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1.5"
              >
                <span>Read Privacy &amp; Security Policy</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-2xl p-5 space-y-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Tenant &amp; Branch Isolation</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Firestore Security Rules and server-verified Firebase Auth tokens enforce strict
                  tenant and branch boundaries on every operation.
                </p>
              </div>
              <div className="border border-slate-200 rounded-2xl p-5 space-y-2">
                <Lock className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">5-Role Staff Permissions</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Granular access across Owner, Pharmacist, Cashier, Helper, and Auditor with
                  immutable audit trails and immediate session revocation.
                </p>
              </div>
              <div className="border border-slate-200 rounded-2xl p-5 space-y-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Indian Compliance Ready</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Built around CGST/SGST/IGST splits, HSN codes, Drug License headers (Form
                  20B/21B), and DPDP privacy redaction controls.
                </p>
              </div>
              <div className="border border-slate-200 rounded-2xl p-5 space-y-2 bg-slate-50">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Customer Feedback Policy</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  We publish pharmacy stories only after verified store onboarding and written
                  customer consent — never synthetic quotes or inflated store counts.
                </p>
              </div>
            </div>
          </div>

          {!import.meta.env.PROD && (
            <div className="mt-8 p-5 border border-dashed border-slate-300 rounded-2xl bg-slate-50 text-xs text-slate-600">
              <span className="font-semibold text-slate-900 block">
                Development Preview Note — Customer Review Slot Hidden in Production
              </span>
              <span className="block mt-1">
                Verified customer testimonials will appear here once real pharmacies complete
                onboarding and grant written publication approval.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* 7. FAQ Section */}
      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-semibold text-blue-700 tracking-wide">
              Common Questions
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="mt-10 space-y-3">
            {FAQ_ITEMS.map((faq, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div
                  key={faq.question}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-sm font-semibold text-slate-900">{faq.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 8. Conversion / Enquiry Form Section */}
      <section
        id="enquiry-form"
        className="py-16 lg:py-24 bg-white border-t border-slate-200"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5 space-y-5">
              <p className="text-xs font-semibold text-blue-700 tracking-wide">
                Get Started with PharmaDesk
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Start Your Trial or Book a Live Walkthrough
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Whether you operate one retail medical store or multiple branches, we will walk your
                team through billing, FEFO inventory, supplier GRNs, and accounts setup.
              </p>
              <ul className="space-y-3 text-xs sm:text-sm text-slate-700 pt-2">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Guided setup for GSTIN, Drug Licenses, and branch structure</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Live demonstration using pharmacy counter &amp; stock workflows</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>No online payment or credit card required to submit an enquiry</span>
                </li>
              </ul>
            </div>

            <div className="lg:col-span-7">
              <LeadEnquiryForm defaultInquiryType={enquiryType} sourcePath="/" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

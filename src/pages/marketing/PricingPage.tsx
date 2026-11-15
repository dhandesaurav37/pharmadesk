/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CheckCircle2, ShieldCheck, ArrowRight, Info } from 'lucide-react';
import {
  BillingCycle,
  PRICING_COMPARISON_ROWS,
  PRICING_PLANS,
  PRICING_PUBLICATION_NOTICE,
  SAFETY_GUARANTEE_ITEMS,
} from '../../config/pricing.ts';
import type { PublicInquiryType } from '../../lib/publicLeadApi.ts';
import type { MarketingRoutePath } from '../../lib/seo.ts';

interface PricingPageProps {
  onNavigate: (route: MarketingRoutePath, inquiryType?: PublicInquiryType) => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onNavigate }) => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('yearly');

  return (
    <div className="bg-white">
      {/* Header */}
      <section className="py-12 lg:py-20 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <p className="text-xs font-semibold text-blue-700 tracking-wide">
              Plans &amp; Packaging
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Clear Plans Scaled for Independent Stores to Multi-Branch Chains
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Choose a plan matching your branch count, team size, and financial workflow needs.
              Essential medicine safety and expiry controls are included across every tier.
            </p>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div
              className="inline-flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl w-fit"
              role="group"
              aria-label="Billing cycle view"
            >
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  billingCycle === 'monthly'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Monthly Cycle
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  billingCycle === 'yearly'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Yearly Cycle
              </button>
            </div>
          </div>

          {/* Transparent pricing status notice */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3 text-xs sm:text-sm text-blue-950">
            <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <span>{PRICING_PUBLICATION_NOTICE}</span>
          </div>
        </div>
      </section>

      {/* Plan Cards */}
      <section className="py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-2xl p-6 flex flex-col justify-between border ${
                  plan.highlighted
                    ? 'border-blue-600 ring-1 ring-blue-600/20 bg-white'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
                      {plan.highlighted && (
                        <span className="text-[11px] font-semibold text-blue-700">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-500 mt-1">{plan.audience}</p>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">{plan.summary}</p>
                  </div>

                  <div className="py-3 border-y border-slate-100 space-y-1">
                    <span className="text-sm font-bold text-slate-900 block">
                      {billingCycle === 'monthly'
                        ? plan.proposedMonthlyLabel
                        : plan.proposedYearlyLabel}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {billingCycle === 'yearly'
                        ? plan.yearlySavingsNote
                        : plan.trialAvailabilityNote}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-700">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Branches</span>
                      <span className="font-semibold text-slate-900">{plan.branchLimitLabel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Staff</span>
                      <span className="font-semibold text-slate-900">
                        {plan.employeeLimitLabel}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Storage</span>
                      <span className="font-semibold text-slate-900">{plan.storageLimitLabel}</span>
                    </div>
                    <div className="pt-1 text-[11px] text-slate-600">
                      Support: <span className="font-medium text-slate-800">{plan.supportLevelLabel}</span>
                    </div>
                  </div>

                  <ul className="space-y-2 pt-3 border-t border-slate-100">
                    {plan.includedHighlights.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-xs text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onNavigate(
                      '/contact',
                      plan.id === 'starter'
                        ? 'FREE_TRIAL'
                        : plan.id === 'enterprise'
                        ? 'SALES_ENQUIRY'
                        : 'BOOK_DEMO'
                    )
                  }
                  className={`mt-6 w-full py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    plan.highlighted
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  <span>{plan.ctaLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Medicine Safety Guarantee */}
          <div className="mt-10 bg-emerald-50/70 border border-emerald-200 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2 max-w-xl">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5 text-emerald-700" />
                  <span>Medicine Safety Never Locked Behind Higher Plans</span>
                </div>
                <p className="text-xs sm:text-sm text-emerald-950/80 leading-relaxed">
                  Every PharmaDesk tier — including Starter for single-counter medical stores —
                  includes full batch expiry tracking and checkout safety checks.
                </p>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-emerald-950">
                {SAFETY_GUARANTEE_ITEMS.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Feature Comparison Table */}
          <div className="mt-14">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              Detailed Plan Comparison
            </h2>
            <div className="mt-5 border border-slate-200 rounded-2xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="py-3.5 px-4">Capability</th>
                    <th className="py-3.5 px-4">Starter</th>
                    <th className="py-3.5 px-4">Growth</th>
                    <th className="py-3.5 px-4">Professional</th>
                    <th className="py-3.5 px-4">Enterprise</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PRICING_COMPARISON_ROWS.map((row) => (
                    <tr key={row.feature} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4">
                        <span className="text-[11px] text-slate-500 block">{row.category}</span>
                        <span className="font-semibold text-slate-900">{row.feature}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{row.starter}</td>
                      <td className="py-3 px-4 text-slate-700">{row.growth}</td>
                      <td className="py-3 px-4 text-slate-700">{row.professional}</td>
                      <td className="py-3 px-4 text-slate-700">{row.enterprise}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

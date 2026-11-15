/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, FileText, ArrowRight } from 'lucide-react';
import type { MarketingRoutePath } from '../../lib/seo.ts';

interface LegalPageProps {
  mode: 'privacy' | 'terms';
  onNavigate: (route: MarketingRoutePath) => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({ mode, onNavigate }) => {
  const isPrivacy = mode === 'privacy';

  return (
    <div className="bg-white py-12 lg:py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="space-y-3 border-b border-slate-200 pb-6">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700">
            {isPrivacy ? <ShieldCheck className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            <span>{isPrivacy ? 'Privacy & Data Protection' : 'Platform Service Terms'}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {isPrivacy ? 'Privacy Policy' : 'Terms and Conditions'}
          </h1>
          <p className="text-xs text-slate-500">
            Publication Note: Standard operational baseline aligned with PharmaDesk architecture.
            Final commercial legal text should be reviewed by qualified counsel before billing launch.
          </p>
        </div>

        {isPrivacy ? (
          <div className="space-y-6 text-sm text-slate-700 leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">1. Data Isolation &amp; Storage</h2>
              <p>
                Business records created inside authenticated PharmaDesk pharmacy workspaces
                (invoices, medicine batches, supplier invoices, customer Khata entries, and accounting
                journals) are isolated per tenant in Cloud Firestore and Firebase Storage hosted in
                Google Cloud&apos;s Mumbai region (asia-south1).
              </p>
            </section>
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">2. Website Enquiry Information</h2>
              <p>
                Information submitted through the public Free Trial, Book a Demo, Callback, or Sales
                Enquiry forms (pharmacy name, owner name, mobile number, email, city, branch count,
                and enquiry note) is persisted server-side in a non-public collection used solely
                for onboarding and product communication. Public client reads of enquiry records are
                blocked by Firestore Security Rules and backend API authorization.
              </p>
            </section>
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">3. DPDP &amp; PHI Safeguards</h2>
              <p>
                PharmaDesk enforces server-side Firebase Authentication verification, RBAC role and
                branch restrictions, PHI/PII redaction in operational logs, immutable audit trails,
                and tenant data export controls aligned with Digital Personal Data Protection (DPDP)
                principles.
              </p>
            </section>
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">4. Questions &amp; Requests</h2>
              <p>
                For privacy or data governance inquiries, please reach out through our{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('/contact')}
                  className="text-blue-700 font-semibold hover:underline"
                >
                  Contact page
                </button>
                .
              </p>
            </section>
          </div>
        ) : (
          <div className="space-y-6 text-sm text-slate-700 leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">1. Platform Scope</h2>
              <p>
                PharmaDesk provides cloud-based pharmacy operations, GST POS billing, batch expiry
                inventory tracking, procurement, customer Khata, and accounting software for medical
                stores and pharmacy businesses.
              </p>
            </section>
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">
                2. Pharmacy Licensing &amp; Clinical Responsibility
              </h2>
              <p>
                Store owners and licensed pharmacists remain responsible for verifying valid Drug
                Licenses (Form 20B/21B), GSTIN registration accuracy, Schedule H/H1/X dispensing
                rules, and tax filings applicable in their state.
              </p>
            </section>
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">3. Account Access &amp; Security</h2>
              <p>
                Store Owners are responsible for assigning appropriate staff roles (Owner,
                Pharmacist, Cashier, Helper, Auditor) and promptly deactivating access when team
                members leave.
              </p>
            </section>
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">4. Trials &amp; Commercial Plans</h2>
              <p>
                No automatic online card billing occurs on this marketing website. Commercial
                subscription terms, onboarding timelines, and branch limits are confirmed directly
                during trial or commercial onboarding.
              </p>
            </section>
          </div>
        )}

        <div className="pt-6 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigate(isPrivacy ? '/terms' : '/privacy')}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            {isPrivacy ? 'View Terms and Conditions' : 'View Privacy Policy'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/contact')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
          >
            <span>Contact Onboarding Team</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, Clock, Building2 } from 'lucide-react';
import { LeadEnquiryForm } from '../../components/marketing/LeadEnquiryForm.tsx';
import type { PublicInquiryType } from '../../lib/publicLeadApi.ts';

interface ContactPageProps {
  defaultInquiryType?: PublicInquiryType;
}

export const ContactPage: React.FC<ContactPageProps> = ({
  defaultInquiryType = 'BOOK_DEMO',
}) => {
  return (
    <div className="bg-white">
      <section className="py-12 lg:py-20 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <p className="text-xs font-semibold text-blue-700 tracking-wide">
              Sales, Trial &amp; Support Enquiries
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Talk to the PharmaDesk Onboarding Team
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Request a free trial setup, schedule a guided live demo for your staff, or reach out
              with multi-branch and onboarding questions.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5 space-y-6">
              <div className="border border-slate-200 rounded-2xl p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">What Happens After You Submit</h2>
                <div className="space-y-3 text-xs sm:text-sm text-slate-600">
                  <div className="flex items-start gap-3">
                    <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <p>
                      Your enquiry receives a unique reference code and is stored securely for our
                      onboarding specialists to review.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Building2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <p>
                      We tailor your walkthrough to your branch count, billing counter workflow,
                      and supplier inward volume.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <p>
                      Contact details submitted here are private to PharmaDesk onboarding and are
                      never exposed via public endpoints.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-2 text-xs text-slate-600 leading-relaxed">
                <h3 className="text-sm font-bold text-slate-900">Direct Contact Directory Status</h3>
                <p>
                  Official business phone numbers, support email aliases, and registered office
                  address details will be published here once finalized for public commercial launch.
                  Please submit the form alongside for verified callback and onboarding follow-up.
                </p>
              </div>
            </div>

            <div className="lg:col-span-7">
              <LeadEnquiryForm
                defaultInquiryType={defaultInquiryType}
                sourcePath="/contact"
                heading="Send an Enquiry or Request a Demo"
                subheading="Choose your enquiry type below and share your medical store details."
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

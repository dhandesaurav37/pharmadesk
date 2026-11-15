/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Send } from 'lucide-react';
import {
  PublicInquiryType,
  PublicLeadResponse,
  submitPublicLead,
} from '../../lib/publicLeadApi.ts';

interface LeadEnquiryFormProps {
  defaultInquiryType?: PublicInquiryType;
  sourcePath?: string;
  heading?: string;
  subheading?: string;
}

const INQUIRY_OPTIONS: Array<{ value: PublicInquiryType; label: string }> = [
  { value: 'FREE_TRIAL', label: 'Start Free Trial Enquiry' },
  { value: 'BOOK_DEMO', label: 'Book a Live Product Demo' },
  { value: 'CALLBACK', label: 'Request a Callback' },
  { value: 'SALES_ENQUIRY', label: 'Sales & Pricing Quote' },
  { value: 'SUPPORT', label: 'Onboarding / Support Enquiry' },
];

export const LeadEnquiryForm: React.FC<LeadEnquiryFormProps> = ({
  defaultInquiryType = 'FREE_TRIAL',
  sourcePath = '/',
  heading = 'Request a Trial Onboarding or Live Walkthrough',
  subheading = 'Share your pharmacy details below. Our team will contact you to schedule a demo or configure your trial workspace.',
}) => {
  const [inquiryType, setInquiryType] = useState<PublicInquiryType>(defaultInquiryType);
  const [pharmacyName, setPharmacyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [branchCount, setBranchCount] = useState<number>(1);
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // Honeypot trap

  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<PublicLeadResponse | null>(null);

  useEffect(() => {
    setInquiryType(defaultInquiryType);
  }, [defaultInquiryType]);

  const validateClientFields = (): string | null => {
    if (pharmacyName.trim().length < 2) return 'Please enter your pharmacy or store name.';
    if (ownerName.trim().length < 2) return 'Please enter the owner or contact name.';
    const digits = mobile.replace(/\D/g, '');
    const normalized10 =
      digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : digits.length === 11 && digits.startsWith('0')
        ? digits.slice(1)
        : digits;
    if (!/^[6-9]\d{9}$/.test(normalized10)) {
      return 'Please enter a valid 10-digit Indian mobile number.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'Please enter a valid email address.';
    }
    if (city.trim().length < 2) return 'Please enter your city or town.';
    if (!Number.isInteger(branchCount) || branchCount < 1 || branchCount > 500) {
      return 'Please enter a valid number of branches (1 to 500).';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);

    const validationError = validateClientFields();
    if (validationError) {
      setErrorText(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const response = await submitPublicLead({
        inquiryType,
        pharmacyName: pharmacyName.trim(),
        ownerName: ownerName.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
        city: city.trim(),
        branchCount,
        message: message.trim(),
        sourcePath,
        website,
      });
      setSubmittedResult(response);
      setPharmacyName('');
      setOwnerName('');
      setMobile('');
      setEmail('');
      setCity('');
      setBranchCount(1);
      setMessage('');
    } catch (err: any) {
      setErrorText(
        err?.message || 'Unable to submit enquiry right now. Please try again shortly.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedResult) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-bold text-slate-900">Enquiry Recorded</h3>
            <p className="text-sm text-slate-600 mt-1">{submittedResult.message}</p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Reference Number</span>
            <span className="font-mono font-bold text-slate-900">
              {submittedResult.referenceCode}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Enquiry Type</span>
            <span className="font-medium text-slate-800">{submittedResult.inquiryType}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Submitted At</span>
            <span className="font-mono text-slate-700">
              {new Date(submittedResult.submittedAt).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSubmittedResult(null)}
          className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 transition-colors"
        >
          Submit Another Enquiry
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5"
    >
      <div>
        <h3 className="text-lg sm:text-xl font-bold text-slate-900">{heading}</h3>
        <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">{subheading}</p>
      </div>

      {errorText && (
        <div
          role="alert"
          className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorText}</span>
        </div>
      )}

      {/* Honeypot field hidden from legitimate users */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="lead-website-trap">Website</label>
        <input
          id="lead-website-trap"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="lead-inquiry-type" className="block text-xs font-semibold text-slate-700 mb-1.5">
          How can we help?
        </label>
        <select
          id="lead-inquiry-type"
          value={inquiryType}
          onChange={(e) => setInquiryType(e.target.value as PublicInquiryType)}
          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
        >
          {INQUIRY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="lead-pharmacy-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Pharmacy Name *
          </label>
          <input
            id="lead-pharmacy-name"
            type="text"
            required
            value={pharmacyName}
            onChange={(e) => setPharmacyName(e.target.value)}
            placeholder="e.g. Shree Medical Store"
            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
        </div>

        <div>
          <label htmlFor="lead-owner-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Owner Name *
          </label>
          <input
            id="lead-owner-name"
            type="text"
            required
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Your full name"
            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="lead-mobile" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Mobile Number (India) *
          </label>
          <input
            id="lead-mobile"
            type="tel"
            required
            inputMode="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="10-digit mobile number"
            className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
        </div>

        <div>
          <label htmlFor="lead-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Email Address *
          </label>
          <input
            id="lead-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@yourpharmacy.in"
            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="lead-city" className="block text-xs font-semibold text-slate-700 mb-1.5">
            City *
          </label>
          <input
            id="lead-city"
            type="text"
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Pune, Nagpur, Bengaluru"
            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
        </div>

        <div>
          <label htmlFor="lead-branches" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Number of Branches *
          </label>
          <input
            id="lead-branches"
            type="number"
            min={1}
            max={500}
            required
            value={branchCount}
            onChange={(e) => setBranchCount(Math.max(1, Number(e.target.value) || 1))}
            className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
        </div>
      </div>

      <div>
        <label htmlFor="lead-message" className="block text-xs font-semibold text-slate-700 mb-1.5">
          Message (Optional)
        </label>
        <textarea
          id="lead-message"
          rows={3}
          maxLength={1500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your billing counters, stock volume, or preferred demo time..."
          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
        />
      </div>

      <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500">
          Your enquiry is stored privately for onboarding follow-up and is never shared publicly.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-60"
        >
          <Send className="w-4 h-4" />
          <span>{submitting ? 'Submitting...' : 'Submit Enquiry'}</span>
        </button>
      </div>
    </form>
  );
};

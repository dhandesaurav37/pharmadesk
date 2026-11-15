/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { MarketingRoutePath } from '../../lib/seo.ts';

interface MarketingFooterProps {
  onNavigate: (route: MarketingRoutePath) => void;
  onBookDemo: () => void;
  onOpenLogin: () => void;
}

export const MarketingFooter: React.FC<MarketingFooterProps> = ({
  onNavigate,
  onBookDemo,
  onOpenLogin,
}) => {
  const linkClass =
    'text-xs text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap';

  return (
    <footer className="bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-5 space-y-3">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/');
              }}
              className="text-lg font-bold tracking-tight text-slate-900 inline-block"
            >
              PharmaDesk
            </a>
            <p className="text-sm text-slate-600 max-w-sm leading-relaxed">
              Everything Your Pharmacy Needs. In One Simple Platform. Built for Indian medical
              stores, retail pharmacies, and multi-branch teams.
            </p>
            <p className="text-xs text-slate-500">
              Hosted on Google Cloud &amp; Firebase (asia-south1, Mumbai)
            </p>
          </div>

          <div className="md:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold text-slate-900">Product</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/');
                  }}
                  className={linkClass}
                >
                  Overview
                </a>
              </li>
              <li>
                <a
                  href="/features"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/features');
                  }}
                  className={linkClass}
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="/pricing"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/pricing');
                  }}
                  className={linkClass}
                >
                  Pricing
                </a>
              </li>
              <li>
                <button type="button" onClick={onBookDemo} className={linkClass}>
                  Book a Demo
                </button>
              </li>
            </ul>
          </div>

          <div className="md:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold text-slate-900">Company</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="/about"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/about');
                  }}
                  className={linkClass}
                >
                  About
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/contact');
                  }}
                  className={linkClass}
                >
                  Contact
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/contact');
                  }}
                  className={linkClass}
                >
                  Support
                </a>
              </li>
              <li>
                <button type="button" onClick={onOpenLogin} className={linkClass}>
                  Staff Login
                </button>
              </li>
            </ul>
          </div>

          <div className="md:col-span-3 space-y-3">
            <h3 className="text-xs font-semibold text-slate-900">Legal &amp; Trust</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="/privacy"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/privacy');
                  }}
                  className={linkClass}
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="/terms"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/terms');
                  }}
                  className={linkClass}
                >
                  Terms and Conditions
                </a>
              </li>
            </ul>
            <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
              Direct phone &amp; street address details will be published once finalized by the
              commercial team. Use the Contact page for sales and support enquiries.
            </p>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} PharmaDesk. All rights reserved.</span>
          <span>Pharmacy &amp; Medical Store Management SaaS</span>
        </div>
      </div>
    </footer>
  );
};

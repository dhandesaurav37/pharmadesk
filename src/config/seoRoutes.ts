/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MarketingRoutePath =
  | '/'
  | '/features'
  | '/pricing'
  | '/about'
  | '/contact'
  | '/privacy'
  | '/terms'
  | '/app';

export interface PageSeoMeta {
  title: string;
  description: string;
  robots?: string;
}

export const PAGE_SEO_MAP: Record<MarketingRoutePath, PageSeoMeta> = {
  '/': {
    title: 'PharmaDesk – Pharmacy & Medical Store Management Software',
    description:
      'Run your medical store smarter with PharmaDesk. Manage fast GST billing, batch expiry stock, purchases, customer credit, and multi-branch operations in one platform.',
  },
  '/features': {
    title: 'Features – GST Billing, FEFO Stock & Accounts | PharmaDesk',
    description:
      'Explore PharmaDesk pharmacy modules: fast POS billing, barcode lookup, batch and expiry tracking, supplier procurement, Khata ledger, double-entry accounts, and staff RBAC.',
  },
  '/pricing': {
    title: 'Plans & Pricing Comparison – Starter to Enterprise | PharmaDesk',
    description:
      'Compare PharmaDesk plans for independent medical stores and multi-branch pharmacies. Essential medicine expiry tracking is included on every plan.',
  },
  '/about': {
    title: 'About PharmaDesk – Built for Indian Pharmacies & Medical Stores',
    description:
      'Learn how PharmaDesk simplifies retail pharmacy operations in India by unifying GST billing, batch safety, procurement, customer Khata, and branch controls.',
  },
  '/contact': {
    title: 'Book a Demo & Sales Enquiry | PharmaDesk',
    description:
      'Request a live PharmaDesk walkthrough, trial onboarding enquiry, or callback for your pharmacy or multi-branch medical store team.',
  },
  '/privacy': {
    title: 'Privacy Policy & Data Protection | PharmaDesk',
    description:
      'How PharmaDesk protects pharmacy business records, patient prescription fields, and public enquiry data under tenant isolation and DPDP principles.',
  },
  '/terms': {
    title: 'Terms & Conditions | PharmaDesk',
    description:
      'Service terms and usage guidelines for the PharmaDesk cloud pharmacy management platform.',
  },
  '/app': {
    title: 'PharmaDesk Workspace – Pharmacy Operations Console',
    description:
      'Authenticated PharmaDesk pharmacy management workspace for billing, inventory, purchases, accounting, and branch management.',
    robots: 'noindex, nofollow',
  },
};

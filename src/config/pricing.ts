/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type BillingCycle = 'monthly' | 'yearly';

export interface PricingPlanConfig {
  id: 'starter' | 'growth' | 'professional' | 'enterprise';
  name: string;
  audience: string;
  summary: string;
  highlighted?: boolean;
  /**
   * Commercial publication status. Set numeric monthlyInr / yearlyInr values
   * only once final commercial pricing is approved by management.
   */
  pricingStatus: 'PROPOSED_PLACEHOLDER' | 'PUBLISHED';
  proposedMonthlyLabel: string;
  proposedYearlyLabel: string;
  yearlySavingsNote: string;
  branchLimitLabel: string;
  employeeLimitLabel: string;
  storageLimitLabel: string;
  supportLevelLabel: string;
  trialAvailabilityNote: string;
  ctaLabel: string;
  includedHighlights: string[];
}

export interface PricingFeatureRow {
  category: string;
  feature: string;
  starter: string;
  growth: string;
  professional: string;
  enterprise: string;
}

export const PRICING_PUBLICATION_NOTICE =
  'Proposed plan structure below. Final commercial INR subscription tariffs and self-serve billing activation are confirmed during onboarding enquiry — no online card charge is taken on this site.';

export const SAFETY_GUARANTEE_ITEMS = [
  'Batch-level expiry date tracking & near-expiry alerts',
  'Automatic block preventing expired medicine billing at POS',
  'Low-stock threshold alerts & FEFO batch prioritization',
  'GST tax invoice formatting with drug license headers',
];

export const PRICING_PLANS: PricingPlanConfig[] = [
  {
    id: 'starter',
    name: 'Starter',
    audience: 'Single-counter independent medical stores',
    summary: 'Core retail POS billing, medicine catalogue, and full batch expiry safety.',
    pricingStatus: 'PROPOSED_PLACEHOLDER',
    proposedMonthlyLabel: 'Proposed INR Quote (Monthly)',
    proposedYearlyLabel: 'Proposed INR Quote (Annual)',
    yearlySavingsNote: 'Annual billing discount finalized with commercial tariff',
    branchLimitLabel: '1 Store Branch',
    employeeLimitLabel: 'Up to 3 Staff Accounts',
    storageLimitLabel: '5 GB Cloud Document Storage',
    supportLevelLabel: 'Email & Guided Onboarding Support',
    trialAvailabilityNote: 'Assisted trial evaluation via onboarding request',
    ctaLabel: 'Request Starter Trial',
    includedHighlights: [
      'Fast GST POS billing & thermal/A4 receipts',
      'Medicine master with composition & barcode lookup',
      'Batch expiry alerts & expired-stock checkout guard',
      'Customer directory & Khata balance ledger',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    audience: 'Busy retail pharmacies & multi-counter shops',
    summary: 'Adds supplier procurement, GRN stock inward, and deeper financial visibility.',
    highlighted: true,
    pricingStatus: 'PROPOSED_PLACEHOLDER',
    proposedMonthlyLabel: 'Proposed INR Quote (Monthly)',
    proposedYearlyLabel: 'Proposed INR Quote (Annual)',
    yearlySavingsNote: 'Annual billing discount finalized with commercial tariff',
    branchLimitLabel: 'Up to 2 Branches',
    employeeLimitLabel: 'Up to 10 Staff Accounts',
    storageLimitLabel: '20 GB Cloud Document Storage',
    supportLevelLabel: 'Priority Email & Callback Support',
    trialAvailabilityNote: 'Assisted trial evaluation + sample data walkthrough',
    ctaLabel: 'Request Growth Demo',
    includedHighlights: [
      'Everything in Starter',
      'Supplier directory, Purchase Orders & GRN inward',
      'Supplier invoices, returns & payable tracking',
      'Role-based access permissions across 5 staff roles',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    audience: 'Growing pharmacy chains & hospital counters',
    summary: 'Full double-entry accounting, inter-branch transfers, and audit reporting.',
    pricingStatus: 'PROPOSED_PLACEHOLDER',
    proposedMonthlyLabel: 'Proposed INR Quote (Monthly)',
    proposedYearlyLabel: 'Proposed INR Quote (Annual)',
    yearlySavingsNote: 'Annual billing discount finalized with commercial tariff',
    branchLimitLabel: 'Up to 5 Branches',
    employeeLimitLabel: 'Up to 30 Staff Accounts',
    storageLimitLabel: '50 GB Cloud Document Storage',
    supportLevelLabel: 'Dedicated Onboarding & Priority Support',
    trialAvailabilityNote: 'Guided pilot deployment available on enquiry',
    ctaLabel: 'Request Professional Demo',
    includedHighlights: [
      'Everything in Growth',
      'Inter-branch stock transfer challans & reconciliation',
      'Double-entry Chart of Accounts, P&L & Balance Sheet',
      'Consolidated multi-branch reporting & auditor access',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    audience: 'Large regional chains & institutional groups',
    summary: 'Custom branch scale, DPDP governance controls, and tailored rollout assistance.',
    pricingStatus: 'PROPOSED_PLACEHOLDER',
    proposedMonthlyLabel: 'Custom Commercial Proposal',
    proposedYearlyLabel: 'Custom Annual Agreement',
    yearlySavingsNote: 'Volume multi-branch agreement',
    branchLimitLabel: '6+ Branches (Custom Scale)',
    employeeLimitLabel: 'Unlimited Custom Role Staff',
    storageLimitLabel: 'Custom Storage & Archival Quota',
    supportLevelLabel: 'Dedicated Account Onboarding & Escalation',
    trialAvailabilityNote: 'Custom architecture & rollout consultation',
    ctaLabel: 'Contact Sales',
    includedHighlights: [
      'Everything in Professional',
      'DPDP data portability exports & retention policy controls',
      'Custom branch onboarding & staff role migration support',
      'DR integrity verification drills & compliance reviews',
    ],
  },
];

export const PRICING_COMPARISON_ROWS: PricingFeatureRow[] = [
  {
    category: 'Scale & Access',
    feature: 'Branches / Counters',
    starter: '1 Branch',
    growth: 'Up to 2',
    professional: 'Up to 5',
    enterprise: '6+ (Custom)',
  },
  {
    category: 'Scale & Access',
    feature: 'Staff Users & RBAC Roles',
    starter: 'Up to 3',
    growth: 'Up to 10',
    professional: 'Up to 30',
    enterprise: 'Custom',
  },
  {
    category: 'Scale & Access',
    feature: 'Firebase Document Storage',
    starter: '5 GB',
    growth: '20 GB',
    professional: '50 GB',
    enterprise: 'Custom',
  },
  {
    category: 'Medicine Safety (Always Included)',
    feature: 'Batch Expiry & Near-Expiry Alerts',
    starter: 'Included',
    growth: 'Included',
    professional: 'Included',
    enterprise: 'Included',
  },
  {
    category: 'Medicine Safety (Always Included)',
    feature: 'Expired Batch Billing Block & FEFO',
    starter: 'Included',
    growth: 'Included',
    professional: 'Included',
    enterprise: 'Included',
  },
  {
    category: 'Medicine Safety (Always Included)',
    feature: 'Low-Stock Threshold Alerts',
    starter: 'Included',
    growth: 'Included',
    professional: 'Included',
    enterprise: 'Included',
  },
  {
    category: 'Operations',
    feature: 'GST POS Billing & Receipts (80mm / A4)',
    starter: 'Included',
    growth: 'Included',
    professional: 'Included',
    enterprise: 'Included',
  },
  {
    category: 'Operations',
    feature: 'Customer Profiles & Khata Credit Ledger',
    starter: 'Included',
    growth: 'Included',
    professional: 'Included',
    enterprise: 'Included',
  },
  {
    category: 'Procurement & Finance',
    feature: 'Suppliers, Purchase Orders & GRN Inward',
    starter: '—',
    growth: 'Included',
    professional: 'Included',
    enterprise: 'Included',
  },
  {
    category: 'Procurement & Finance',
    feature: 'Double-Entry Accounting, Expenses & P&L',
    starter: '—',
    growth: 'Basic Summaries',
    professional: 'Full Ledger + CoA',
    enterprise: 'Full Ledger + CoA',
  },
  {
    category: 'Multi-Branch & Governance',
    feature: 'Inter-Branch Stock Transfers & Consolidated Reports',
    starter: '—',
    growth: '—',
    professional: 'Included',
    enterprise: 'Included',
  },
  {
    category: 'Multi-Branch & Governance',
    feature: 'DPDP Export Controls & Audit Log Retention',
    starter: 'Standard Audit',
    growth: 'Standard Audit',
    professional: 'Full Audit Trail',
    enterprise: 'Full + Custom Governance',
  },
  {
    category: 'Support',
    feature: 'Onboarding & Support Channel',
    starter: 'Email Support',
    growth: 'Priority Callback',
    professional: 'Dedicated Onboarding',
    enterprise: 'Dedicated Account Lead',
  },
];

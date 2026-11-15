/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ShowcaseFeatureItem {
  key: string;
  code: string;
  title: string;
  status: 'IMPLEMENTED';
  summary: string;
  bullets: string[];
}

export const PRODUCT_FEATURES_CORE: ShowcaseFeatureItem[] = [
  {
    key: 'billing',
    code: '01',
    title: 'Fast Billing',
    status: 'IMPLEMENTED',
    summary: 'Built for high-speed counter checkout with GST compliance and FEFO batch selection.',
    bullets: [
      'Create retail GST bills quickly',
      'Search medicines by brand or salt composition',
      'Barcode scanning lookup support',
      'Manage split Cash, UPI, Card, and Khata credit payments',
      'Print 80mm thermal receipts or A4/A5 tax invoices',
    ],
  },
  {
    key: 'inventory',
    code: '02',
    title: 'Medicines & Stock',
    status: 'IMPLEMENTED',
    summary: 'Batch-level pharmacy stock visibility engineered to eliminate expiry waste.',
    bullets: [
      'Manage complete medicine catalogue with HSN & GST rates',
      'Track batches with purchase PTR and MRP pricing',
      'Monitor available sellable stock across branches',
      'Track batch expiry dates and block expired billing',
      'Receive low-stock and near-expiry alerts inside your workspace',
    ],
  },
  {
    key: 'purchases',
    code: '03',
    title: 'Easy Purchases',
    status: 'IMPLEMENTED',
    summary: 'Structured supplier procurement from order commitment through Goods Receipt.',
    bullets: [
      'Manage pharmaceutical distributors and wholesalers',
      'Create and approve branch Purchase Orders',
      'Receive stock via GRN with accepted/rejected splits',
      'Track supplier invoices, returns, and purchase history',
    ],
  },
  {
    key: 'customers',
    code: '04',
    title: 'Customer Management',
    status: 'IMPLEMENTED',
    summary: 'Keep patient histories and credit balances accurate without paper notebooks.',
    bullets: [
      'Save customer details with validated mobile normalization',
      'View past invoices and repeat purchase history',
      'Manage Khata outstanding credit limits and due invoices',
      'Record customer payments with automatic FIFO allocation',
    ],
  },
  {
    key: 'reports',
    code: '05',
    title: 'Business Reports',
    status: 'IMPLEMENTED',
    summary: 'Real-time operational and double-entry financial visibility for store owners and CAs.',
    bullets: [
      'Daily sales and collection summaries',
      'Purchase and supplier payable ageing reports',
      'Branch operating expense workflows and cash/bank books',
      'Trial Balance, P&L, Balance Sheet, and GST summaries',
    ],
  },
  {
    key: 'employees',
    code: '06',
    title: 'Employee Management',
    status: 'IMPLEMENTED',
    summary: 'Clear separation of duties across store owners, pharmacists, cashiers, and auditors.',
    bullets: [
      'Invite and onboard staff accounts securely',
      'Assign Owner, Pharmacist, Cashier, Helper, or Auditor roles',
      'Restrict staff visibility to assigned pharmacy branches',
      'Deactivate accounts or revoke active sessions immediately',
    ],
  },
];

export interface AutomationCapabilityItem {
  title: string;
  description: string;
  status: 'IMPLEMENTED' | 'PLANNED';
  badgeLabel: string;
}

export const AUTOMATION_CAPABILITIES: AutomationCapabilityItem[] = [
  {
    title: 'Low-Stock & Near-Expiry Alerts',
    description:
      'Batches crossing minimum stock thresholds or approaching expiry are automatically flagged in the Inventory view and Notifications drawer.',
    status: 'IMPLEMENTED',
    badgeLabel: 'Available Now',
  },
  {
    title: 'FEFO Batch Prioritization & Quick Search',
    description:
      'The POS billing terminal prioritizes earliest-expiring usable batches first and blocks expired batches during checkout.',
    status: 'IMPLEMENTED',
    badgeLabel: 'Available Now',
  },
  {
    title: 'Instant Double-Entry Ledger Posting',
    description:
      'Completed sales invoices, GRNs, customer settlements, and expenses automatically generate balanced accounting vouchers.',
    status: 'IMPLEMENTED',
    badgeLabel: 'Available Now',
  },
  {
    title: 'Daily Financial & Branch Summaries',
    description:
      'Owner and auditor dashboards compile daily revenue, stock valuation, payables, and receivables automatically from live transactions.',
    status: 'IMPLEMENTED',
    badgeLabel: 'Available Now',
  },
  {
    title: 'Formatted WhatsApp Balance Summaries',
    description:
      'Generates clinical-free Khata balance summaries ready for staff to share manually with customers.',
    status: 'IMPLEMENTED',
    badgeLabel: 'Assisted Sharing',
  },
  {
    title: 'Automated Reorder Suggestions & Scheduled Alerts',
    description:
      'Rule-based automatic Purchase Order dispatch to suppliers and scheduled automated WhatsApp/SMS payment reminder delivery.',
    status: 'PLANNED',
    badgeLabel: 'Planned (Not Yet Automated)',
  },
];

export const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    title: 'Set Up Your Pharmacy',
    description:
      'Create your account and configure your pharmacy profile, GSTIN, drug licenses (Form 20B/21B), and branch details.',
  },
  {
    step: '02',
    title: 'Add Your Medicines & Team',
    description:
      'Set up your medicine catalogue, opening batch inventory, and invite pharmacists, cashiers, or auditors with role-based permissions.',
  },
  {
    step: '03',
    title: 'Start Managing Your Pharmacy',
    description:
      'Begin fast GST billing, track expiry and stock levels across branches, record purchases, and monitor accounts in one place.',
  },
];

export const FAQ_ITEMS = [
  {
    question: 'What is PharmaDesk?',
    answer:
      'PharmaDesk is a cloud-based pharmacy management software designed for Indian medical stores, retail pharmacies, and multi-branch pharmacy businesses. It combines GST POS billing, batch and expiry tracking, supplier purchases, customer Khata management, double-entry accounting, and staff access control in one platform.',
  },
  {
    question: 'Is PharmaDesk suitable for small medical stores?',
    answer:
      'Yes. Independent single-counter medical stores can start with fast billing, medicine search, expiry tracking, and customer Khata management without needing to configure multi-branch or enterprise accounting modules.',
  },
  {
    question: 'Can I manage multiple employees?',
    answer:
      'Yes. Store owners can invite staff and assign specific roles — Store Owner, Pharmacist, Cashier, Helper, or Auditor — along with branch-level access restrictions and immediate account deactivation if a team member leaves.',
  },
  {
    question: 'Can I track medicine expiry?',
    answer:
      'Yes. PharmaDesk tracks inventory at the batch level with expiry dates, prioritizes earliest-expiring batches (FEFO) during billing, highlights near-expiry stock, and prevents expired batches from being billed. Expiry safety features are available on every plan.',
  },
  {
    question: 'Does PharmaDesk support barcode scanners?',
    answer:
      'Yes. The POS billing counter and medicine catalogue support standard USB/HID barcode scanner input alongside quick name and generic salt search.',
  },
  {
    question: 'Can I print bills?',
    answer:
      'Yes. You can print GST invoices formatted for both 80mm thermal receipt printers and standard A4/A5 laser printers, with pharmacy address, GSTIN, and drug license details.',
  },
  {
    question: 'Can I manage customer credit?',
    answer:
      'Yes. PharmaDesk includes a Customer Khata ledger where you can set credit limits, track outstanding dues per customer, settle multiple invoices via FIFO payment allocation, and view ageing balances.',
  },
  {
    question: 'Can I access PharmaDesk online?',
    answer:
      'Yes. PharmaDesk is a cloud web platform hosted on Google Cloud and Firebase infrastructure in the Mumbai region (asia-south1), accessible from modern desktop and tablet browsers with authenticated login.',
  },
  {
    question: 'How is my pharmacy data protected?',
    answer:
      'All business data is isolated per pharmacy tenant in Cloud Firestore with server-side Firebase Authentication verification, strict Firestore and Storage security rules, role-based permissions, PHI log redaction, and immutable audit trails.',
  },
  {
    question: 'How do I get started?',
    answer:
      'Submit an enquiry using the Start Free Trial or Book a Demo form on this website. Our onboarding team will follow up to schedule a guided product walkthrough and help configure your pharmacy workspace.',
  },
];

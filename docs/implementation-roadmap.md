# PharmaDesk 12-Phase Implementation Roadmap

**Document Version:** 2.0.0 (Hardened Execution Blueprint)  
**Engineering Methodology:** Incremental Milestone Delivery with Strict Acceptance Criteria & Security Gates  
**Status:** Architecture Completed $\rightarrow$ Ready for Backend Implementation (Phase 1)

---

## 1. Roadmap Overview & Sequencing

```mermaid
gantt
    title PharmaDesk Implementation Milestones
    dateFormat  YYYY-MM-DD
    section Foundation & Data
    Phase 1: Backend Monolith Foundation       :active, p1, 2026-11-10, 5d
    Phase 2: PostgreSQL Schema, Triggers & RLS :p2, after p1, 7d
    Phase 3: Firebase Identity & Onboarding    :p3, after p2, 6d
    Phase 4: Staff RBAC & Branch Permissions   :p4, after p3, 5d
    section Operational Core
    Phase 5: Medicine Formulary & Batch Stock  :p5, after p4, 8d
    Phase 6: POS Billing & Idempotent Engine   :p6, after p5, 10d
    Phase 7: Customers & Khata Credit Ledger   :p7, after p6, 6d
    Phase 8: Suppliers & Inward Goods Receipt  :p8, after p7, 8d
    section Financials & Release
    Phase 9: Double-Entry Accounts & P&L       :p9, after p8, 7d
    Phase 10: Multi-Branch & Stock Transfers   :p10, after p9, 8d
    Phase 11: Security Hardening & DR Drills   :p11, after p10, 6d
    Phase 12: Pilot Deployment & Expert Review :p12, after p11, 14d
```

---

## 2. Granular Phase Specifications

---

### Phase 1: Backend Foundation & Monolith Structure [COMPLETED]
- **Status:** Completed & Verified. Express modular monolith established in `server/`, Zod-validated environment parsing, Pino structured logging, RFC 7807 problem details error handling, and 17 automated integration tests passing.
- **Scope:** Initialize Express.js modular monolith in `server/`, strict TypeScript configuration, structured JSON logger (Pino), and RFC 7807 problem details error handling.
- **Prerequisites:** Completed architecture documentation suite in `/docs`.
- **Files Created/Modified:** `server/src/app.ts`, `server/src/server.ts`, `server/tsconfig.json`, `package.json`, `.env.example`, `server/src/config/*`, `server/src/middleware/*`, `server/src/routes/*`, `server/src/lib/*`, `server/tests/*`.
- **Migration Requirements:** None.
- **Security Requirements:** Helmet security headers, CORS origin locking, and request payload size limits.
- **Automated Tests:** Vitest integration tests (17 passed). Server boots cleanly; returns HTTP 200 on `GET /api/v1/health/live`, `GET /api/v1/health/ready`, `GET /api/v1`; returns RFC 7807 Problem Details on errors.
- **Manual Verification:** Integration tests executed against Express factory; 100% assertions passed.
- **Acceptance Criteria:** Express server compiles cleanly with zero TypeScript errors, passes all automated tests, and handles graceful shutdown.
- **Explicit Exclusions:** No live database connections or Firebase Admin initialization in this phase.

---

### Phase 2: PostgreSQL Connection, Migrations & Tenant RLS [NEXT ACTIVE PHASE]
- **Scope:** Setup `pg` connection pool, SQL migration framework, execute hardened DDL from `docs/database-schema.md`, implement `SET LOCAL app.current_tenant_id` session wrapper, and install database triggers.
- **Prerequisites:** Phase 1 completion, Cloud SQL PostgreSQL instance available.
- **Files Expected to Change:** `server/src/db/pool.ts`, `server/src/db/migrations/*`, `server/src/middleware/tenantContext.ts`.
- **Migration Requirements:** Execute initial migration scripts establishing 43 tables, composite unique keys `(tenant_id, id)`, foreign keys, and RLS policies.
- **Security Requirements:** Application database role (`pharmadesk_app`) owns zero tables and possesses strictly NO `BYPASSRLS`. Migration role (`pharmadesk_migrator`) used only in migration scripts.
- **Automated Tests:** pgTAP tests verifying composite foreign key rejection, RLS row filtering, negative stock prevention trigger (`trg_check_inventory_stock`), and journal balance trigger.
- **Manual Verification:** Inspect table definitions and verify RLS flags with `\d+` in psql.
- **Acceptance Criteria:** 100% of tenant tables enforce composite isolation; cross-tenant referencing is rejected at database engine level.
- **Explicit Exclusions:** No domain business logic or HTTP endpoints.

---

### Phase 3: Firebase Authentication & Pharmacy Onboarding
- **Scope:** Integrate Firebase Admin SDK for RS256 token verification. Implement owner onboarding flow: creating tenant, main branch, user record, owner membership, and chart of accounts.
- **Prerequisites:** Phase 2 completion.
- **Files Expected to Change:** `server/src/modules/auth/*`, `server/src/modules/onboarding/*`, `src/services/api/auth.ts`.
- **Migration Requirements:** Seed initial global drug schedules, categories, and chart of accounts templates.
- **Security Requirements:** Decouple identity (Firebase) from authorization (PostgreSQL). Validate phone number verification status.
- **Automated Tests:** Integration test verifying that `POST /onboarding/pharmacy` creates tenant, branch, user, and membership atomically inside a single transaction.
- **Manual Verification:** Complete web onboarding flow in browser using test phone OTP.
- **Acceptance Criteria:** New pharmacy owner can register, authenticate via phone OTP, and resolve active pharmacy tenant context.
- **Explicit Exclusions:** Employee invitations and multi-branch management.

---

### Phase 4: Staff RBAC & Branch Permissions
- **Scope:** Staff invitations (`POST /employees/invite`), normalized branch assignment via `invitation_branches` and `membership_branches`, role matrices (`OWNER`, `PHARMACIST`, `CASHIER`, `HELPER`), user permission overrides, and immediate employee deactivation.
- **Prerequisites:** Phase 3 completion.
- **Files Expected to Change:** `server/src/modules/employees/*`, `server/src/middleware/authorize.ts`, `src/features/employees/*`.
- **Migration Requirements:** Migration adding `invitation_branches` table.
- **Security Requirements:** Immediate revocation: deactivating a membership immediately blocks API requests without waiting for JWT expiration. Role permissions and overrides must not cross tenant boundaries.
- **Automated Tests:** Permission authorization tests for all 4 roles; negative test verifying deactivated staff receives immediate HTTP 403 Forbidden.
- **Manual Verification:** Invite an employee, log in with their credentials, and verify restricted UI access.
- **Acceptance Criteria:** Employees can access only their authorized branches and permitted functional capabilities.
- **Explicit Exclusions:** Clinical credential verification algorithms.

---

### Phase 5: Medicine Catalogue & Batch-Level Inventory
- **Scope:** Master medicine catalog, Indian manufacturer directory, salt formulations, HSN/GST configurations, physical batch records per branch, and physical count audit adjustments.
- **Prerequisites:** Phase 4 completion.
- **Files Expected to Change:** `server/src/modules/medicines/*`, `server/src/modules/inventory/*`, `src/features/medicines/*`, `src/features/inventory/*`.
- **Migration Requirements:** Seed top 500 standard Indian medicine formulations and salt compositions.
- **Security Requirements:** Branch-scoped inventory access; cashiers and helpers blocked from viewing wholesale purchase rates (PTR).
- **Automated Tests:** Batch creation, search queries, and audit variance adjustments verifying that `stock_adjustments` and `stock_movements` update atomically.
- **Manual Verification:** Add a medicine, create a batch with shelf location, and adjust stock in UI.
- **Acceptance Criteria:** Live stock levels queryable by batch number, expiry date, and physical rack location with immutable movement ledger.
- **Explicit Exclusions:** Automated barcode label printing.

---

### Phase 6: POS Billing & Idempotent Transaction Engine
- **Scope:** High-speed point-of-sale checkout terminal. Concurrency-safe branch sequence invoice numbering, pessimistic row locking (`SELECT ... FOR UPDATE`), atomic inventory decrements, idempotency key verification, and thermal receipt printing.
- **Prerequisites:** Phase 5 completion.
- **Files Expected to Change:** `server/src/modules/billing/*`, `src/features/billing/*`, `src/components/modals/PrintInvoiceModal.tsx`.
- **Migration Requirements:** Migration adding `idempotency_keys` table and sales invoice constraints.
- **Security Requirements:** Mandatory `Idempotency-Key` header; database trigger `trg_protect_sales_invoices` preventing modification of committed tax invoices.
- **Automated Tests:** Concurrent checkout race condition simulation (two cashiers selling the last strip of medicine); duplicate idempotency payload test; Schedule H1 doctor validation test.
- **Manual Verification:** Dispense a multi-item cart at POS, confirm stock decrement, and inspect generated thermal receipt.
- **Acceptance Criteria:** POS checkout completes with verified atomic batch deduction, double-entry journal posting, and duplicate request protection.
- **Explicit Exclusions:** Offline transaction queueing (online-first pilot).

---

### Phase 7: Customer Directory & Khata Credit Ledger
- **Scope:** Master patient directory, prescribing doctor tracking, Khata credit ledger, repayment settlements (Cash/UPI), and WhatsApp debt statement links.
- **Prerequisites:** Phase 6 completion.
- **Files Expected to Change:** `server/src/modules/customers/*`, `src/features/customers/*`.
- **Migration Requirements:** Initial migration for `customers` and `customer_ledger`.
- **Security Requirements:** Patient contact information masked from unauthorized roles; Khata credit limit checks enforced during POS checkout.
- **Automated Tests:** Khata credit purchase increases balance; repayment credits ledger and decreases balance; assert running balance equals ledger sum.
- **Manual Verification:** Bill an order on Khata credit, verify customer balance update, and settle with cash payment.
- **Acceptance Criteria:** Customer Khata ledger maintains verifiable double-entry balance with complete audit trail.
- **Explicit Exclusions:** Automated SMS gateway integrations (manual WhatsApp links used for pilot).

---

### Phase 8: Suppliers, Purchase Orders & Goods Receipts
- **Scope:** Pharmaceutical distributor directory, wholesale drug license tracking, purchase order creation, goods receipt inwarding from distributor invoices, and PTR/MRP margin calculations.
- **Prerequisites:** Phase 7 completion.
- **Files Expected to Change:** `server/src/modules/suppliers/*`, `server/src/modules/procurement/*`, `src/features/suppliers/*`.
- **Migration Requirements:** Tables for `suppliers`, `purchase_orders`, `goods_receipts`.
- **Security Requirements:** Wholesale purchase costs (PTR) restricted to `OWNER` and `PHARMACIST` roles.
- **Automated Tests:** Goods receipt transaction increments batch stock, writes to `stock_movements`, and credits supplier accounts payable.
- **Manual Verification:** Inward a distributor tax invoice with 3 batches, verify stock availability on POS counter.
- **Acceptance Criteria:** Inwarded distributor stock immediately available for dispensing with verified landed costs and tax credits.
- **Explicit Exclusions:** Electronic Data Interchange (EDI) direct distributor feeds.

---

### Phase 9: Double-Entry Accounts & Financial Reporting
- **Scope:** Chart of accounts, daily cash register closing, operational expense tracking, gross/net profit reporting (accounting for COGS and taxes), and GSTR-1 outward supply summaries.
- **Prerequisites:** Phase 8 completion.
- **Files Expected to Change:** `server/src/modules/accounts/*`, `server/src/modules/reports/*`, `src/features/accounts/*`, `src/features/reports/*`.
- **Migration Requirements:** Accounting tables and default Chart of Accounts seed data.
- **Security Requirements:** Financial ledger entries are immutable; financial reports restricted exclusively to `OWNER` role.
- **Automated Tests:** Journal balance trigger test ($\sum \text{Debits} == \sum \text{Credits}$); Net Profit derivation test ($\text{Net Revenue} - \text{COGS} - \text{Expenses}$).
- **Manual Verification:** Perform day-end cash register close, record shop electricity expense, and generate P&L report.
- **Acceptance Criteria:** All financial and GST reports derived from underlying double-entry journals without mock or hardcoded numbers.
- **Explicit Exclusions:** Direct GST portal API filing.

---

### Phase 10: Multi-Branch & Stock Transfers
- **Scope:** Multi-branch chain configuration, branch-switching workstation selector, inter-branch stock transfers (`ISSUED` $\rightarrow$ `IN_TRANSIT` $\rightarrow$ `RECEIVED`), and consolidated chain-wide reports.
- **Prerequisites:** Phase 9 completion.
- **Files Expected to Change:** `server/src/modules/branches/*`, `server/src/modules/transfers/*`, `src/features/branches/*`.
- **Migration Requirements:** Stock transfer tables and composite constraints.
- **Security Requirements:** Transfer items locked at source branch upon dispatch; transit verified before stock increment at destination branch.
- **Automated Tests:** Inter-branch transfer lifecycle test asserting zero stock duplication or phantom inventory during transit.
- **Manual Verification:** Dispatch 10 strips from Branch 1, switch workstation to Branch 2, and receive shipment.
- **Acceptance Criteria:** Multi-branch stock transfers reconcile with verified transit audit records.
- **Explicit Exclusions:** Automated inter-branch transit trucking logistics integration.

---

### Phase 11: Security Hardening & DR Drills
- **Scope:** Google Cloud Secret Manager integration, VPC private database access, Cloud Armor WAF rate limiting, automated database snapshot restore drills, and DPDP compliance export.
- **Prerequisites:** Phase 10 completion.
- **Files Expected to Change:** `server/src/config/secrets.ts`, `server/src/modules/export/*`, `cloudbuild.yaml`.
- **Migration Requirements:** Audit log and export job tables.
- **Security Requirements:** Zero plain-text credentials in repository; DPDP export bundles data into encrypted ZIP archive with SHA-256 hash.
- **Automated Tests:** Disaster recovery drill script restoring Cloud SQL snapshot to staging database in $< 30\text{ minutes}$.
- **Manual Verification:** Request full pharmacy data export from UI and verify downloaded archive integrity.
- **Acceptance Criteria:** Recovery Time Objective (RTO) $< 30\text{ minutes}$ verified via automated test drill.
- **Explicit Exclusions:** Multi-region active-active cluster setup.

---

### Phase 12: Pilot Deployment & Operational Review
- **Scope:** Deploy production container to Google Cloud Run in `asia-south1` (Mumbai). Onboard an independent retail medical store in Mumbai for live pilot testing with physical 80mm thermal receipt printers.
- **Prerequisites:** Phase 11 completion, passing all Quality Release Gates.
- **Files Expected to Change:** Operational runbooks, deployment documentation, environment configuration.
- **Migration Requirements:** Production database provisioning and seed validation.
- **Security Requirements:** Enforce HTTPS TLS 1.3, strict security headers, and least-privilege service account IAM roles.
- **Automated Tests:** Full end-to-end regression test suite passing in staging environment.
- **Manual Verification:** Supervise full operating shift of live counter dispensing, physical cash-up, and distributor inwarding at pilot store.
- **Acceptance Criteria:** Pilot store completes operational operating shifts with uninterrupted counter dispensing, verified batch inventory reconciliation, and formal sign-off from a registered Indian pharmacist and certified GST practitioner.
- **Explicit Exclusions:** Commercial public SaaS self-serve marketing launch.

# PharmaDesk 12-Phase Implementation Roadmap

**Document Version:** 1.0.0 (Execution Blueprint)  
**Engineering Methodology:** Incremental Milestone Delivery with Verifiable Acceptance Gates  
**Status:** Architecture Completed $\rightarrow$ Backend Implementation Ready  

---

## 1. Roadmap Overview & Milestones

```mermaid
gantt
    title PharmaDesk Implementation Milestones
    dateFormat  YYYY-MM-DD
    section Core Foundation
    Phase 1: Backend Monolith Foundation       :active, p1, 2026-11-10, 5d
    Phase 2: PostgreSQL Schema & RLS Setup     :p2, after p1, 7d
    Phase 3: Firebase Auth & Onboarding Flow   :p3, after p2, 6d
    Phase 4: Employee Management & RBAC        :p4, after p3, 5d
    section Operational Engine
    Phase 5: Medicine Formulary & Batch Stock  :p5, after p4, 8d
    Phase 6: Billing POS & Atomic Transactions :p6, after p5, 10d
    Phase 7: Customers & Khata Credit Ledger   :p7, after p6, 6d
    Phase 8: Suppliers & Inward Goods Receipt  :p8, after p7, 8d
    section Financials & Scale
    Phase 9: Accounts, Expenses & P&L Reports  :p9, after p8, 7d
    Phase 10: Multi-Branch & Stock Transfers   :p10, after p9, 8d
    Phase 11: Security Hardening & DR Drills   :p11, after p10, 6d
    Phase 12: Pilot Deployment & Store Review  :p12, after p11, 14d
```

---

## 2. Granular Phase Specifications

---

### Phase 1: Backend Foundation & Monolith Structure
- **Scope:** Initialize Express.js modular monolith in `server/`, TypeScript configuration, structured JSON logger (Pino), and RFC 7807 error middleware.
- **Dependencies:** None.
- **Files Changing:** `server/src/app.ts`, `server/src/server.ts`, `server/tsconfig.json`, `package.json`.
- **API Endpoints:** `GET /health`, `GET /version`.
- **Tests:** Server boots, returns health envelope, handles 404 cleanly.
- **Acceptance Criteria:** Express server compiles cleanly and starts on port 3000.
- **Exclusions:** No database or Firebase connections yet.

---

### Phase 2: PostgreSQL Connection, Migrations & Tenant RLS
- **Scope:** Setup `pg` connection pool, SQL migration runner (e.g. `node-pg-migrate`), execute DDL from `docs/database-schema.md`, implement `SET LOCAL app.current_tenant_id` session wrapper.
- **Dependencies:** Phase 1.
- **Files Changing:** `server/src/db/pool.ts`, `server/src/db/migrations/*`, `server/src/middleware/tenantContext.ts`.
- **Database Migrations:** Tables 1.1 to 1.11, Composite FKs, RLS policies, trigger `trg_check_inventory_stock`.
- **Tests:** pgTAP tests for composite key isolation, RLS row filtering, negative stock prevention.
- **Acceptance Criteria:** Cross-tenant inserts rejected by PostgreSQL engine.

---

### Phase 3: Firebase Authentication & Pharmacy Onboarding
- **Scope:** Integrate Firebase Admin SDK for JWT verification. Implement pharmacy owner registration, tenant creation, and main branch setup.
- **Dependencies:** Phase 2.
- **Files Changing:** `server/src/modules/auth/*`, `server/src/modules/onboarding/*`, `src/services/api/auth.ts`.
- **API Endpoints:** `POST /api/v1/auth/session-sync`, `POST /api/v1/onboarding/pharmacy`.
- **Tests:** Owner registration creates `tenants`, `branches`, `users`, and `tenant_memberships` in a single atomic transaction.
- **Acceptance Criteria:** Owner can log in via phone OTP and see their onboarded pharmacy.

---

### Phase 4: Employee Management & Granular Permissions
- **Scope:** Staff invitations, role assignments (`PHARMACIST`, `CASHIER`, `HELPER`), branch mapping via `membership_branches`, and user overrides.
- **Dependencies:** Phase 3.
- **Files Changing:** `server/src/modules/employees/*`, `server/src/middleware/authorize.ts`, `src/features/employees/*`.
- **API Endpoints:** `GET /api/v1/employees`, `POST /api/v1/employees/invite`, `PUT /api/v1/employees/:id/permissions`, `POST /api/v1/employees/:id/deactivate`.
- **Tests:** Deactivated staff token immediately rejected with HTTP 403.
- **Acceptance Criteria:** Cashier cannot access restricted owner modules.

---

### Phase 5: Medicine Catalogue & Batch-Level Inventory
- **Scope:** Master medicine directory, Indian manufacturers, dosage categories, Schedule H/H1 tags, and batch inventory tracking per branch.
- **Dependencies:** Phase 4.
- **Files Changing:** `server/src/modules/medicines/*`, `server/src/modules/inventory/*`, `src/features/medicines/*`, `src/features/inventory/*`.
- **API Endpoints:** `GET/POST /api/v1/medicines`, `GET /api/v1/inventory/batches`, `POST /api/v1/inventory/batches/adjust`.
- **Tests:** Batch stock adjustment logs variance in `stock_adjustments` and writes to `stock_movements`.
- **Acceptance Criteria:** Real-time stock counts by batch number, expiry date, and shelf location.

---

### Phase 6: Point of Sale (POS) Billing & Invoicing Engine
- **Scope:** High-speed counter checkout terminal. Pessimistic batch locking (`SELECT ... FOR UPDATE`), atomic inventory decrement, invoice sequencing, and thermal receipt printing.
- **Dependencies:** Phase 5.
- **Files Changing:** `server/src/modules/billing/*`, `src/features/billing/*`, `src/components/modals/PrintInvoiceModal.tsx`.
- **API Endpoints:** `POST /api/v1/billing/invoices`, `POST /api/v1/billing/invoices/:id/returns`.
- **Tests:** Concurrent checkout race condition test: two cashiers selling 1 remaining unit $\rightarrow$ exactly one succeeds, one gets 409 Conflict. Duplicate idempotency test.
- **Acceptance Criteria:** Single-line checkout $\le 200\text{ms}$ with zero duplicate bills.

---

### Phase 7: Customer Directory & Khata Credit Ledger
- **Scope:** Patient profiles, prescribing doctor link, Khata debt ledger, cash repayment settlement, and WhatsApp statement links.
- **Dependencies:** Phase 6.
- **Files Changing:** `server/src/modules/customers/*`, `src/features/customers/*`.
- **API Endpoints:** `GET/POST /api/v1/customers`, `POST /api/v1/customers/:id/payments`.
- **Tests:** Khata repayments credit `customer_ledger` and decrement `customers.khata_balance`.
- **Acceptance Criteria:** Ledger balances match historical debit/credit sums.

---

### Phase 8: Suppliers, Purchase Orders & Goods Receipts
- **Scope:** Pharmaceutical distributors, wholesale licenses, PO generation, and batch inwarding from supplier invoices with PTR/MRP margin calculation.
- **Dependencies:** Phase 7.
- **Files Changing:** `server/src/modules/suppliers/*`, `server/src/modules/procurement/*`, `src/features/suppliers/*`.
- **API Endpoints:** `GET/POST /api/v1/suppliers`, `POST /api/v1/purchases/goods-receipts`.
- **Tests:** Inwarding batches increments inventory and records `supplier_ledger` accounts payable.
- **Acceptance Criteria:** Inward stock reflects immediately on POS counter shelves.

---

### Phase 9: Double-Entry Accounting & Financial Reporting
- **Scope:** Chart of accounts, daily cash register closing, operational expenses, gross/net profit formulas, and GSTR-1 outward supply summaries.
- **Dependencies:** Phase 8.
- **Files Changing:** `server/src/modules/accounts/*`, `server/src/modules/reports/*`, `src/features/accounts/*`, `src/features/reports/*`.
- **API Endpoints:** `GET /api/v1/accounts/cash-register`, `POST /api/v1/accounts/expenses`, `GET /api/v1/reports/gst/gstr-1`.
- **Tests:** Trigger verifies double-entry balance ($\sum \text{Debit} = \sum \text{Credit}$).
- **Acceptance Criteria:** Real-time P&L and GST reports derived from underlying ledger tables.

---

### Phase 10: Multi-Branch & Inter-Branch Stock Transfers
- **Scope:** Multi-branch chain configuration, branch-switching dropdown, transit workflows (`ISSUED` $\rightarrow$ `IN_TRANSIT` $\rightarrow$ `RECEIVED`), and consolidated owner dashboard.
- **Dependencies:** Phase 9.
- **Files Changing:** `server/src/modules/branches/*`, `server/src/modules/transfers/*`.
- **API Endpoints:** `POST /api/v1/inventory/transfers`.
- **Tests:** Stock leaves Branch 1, enters transit, and arrives at Branch 2 without balance discrepancy.
- **Acceptance Criteria:** Store owner can toggle branches or view consolidated chain metrics.

---

### Phase 11: Security Hardening, Backup Drills & Audit Export
- **Scope:** Rate limiting (Cloud Armor), Secret Manager credential integration, automated restore drills from Cloud SQL snapshots, DPDP automated data export ZIP.
- **Dependencies:** Phase 10.
- **Files Changing:** `server/src/config/secrets.ts`, `server/src/modules/export/*`.
- **API Endpoints:** `POST /api/v1/settings/export`, `GET /api/v1/audit/logs`.
- **Tests:** Snapshot restored to staging database in $< 30\text{ minutes}$ with zero corruption.
- **Acceptance Criteria:** Full tenant data export delivers valid JSON/CSV archive with SHA-256 checksum.

---

### Phase 12: Pilot Deployment & Operational Review
- **Scope:** Deploy to Google Cloud Run in `asia-south1`. Onboard pilot independent medical store in Mumbai. Live retail counter dispensing with physical thermal printer.
- **Dependencies:** Phase 11.
- **Deliverables:** Production runbook, staff training guide, and formal statutory compliance review by qualified Indian Pharmacist and GST Practitioner.
- **Acceptance Criteria:** Store completes full operating day of counter billing with zero downtime.

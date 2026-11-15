# PharmaDesk 12-Phase Implementation Roadmap

**Document Version:** 7.0.0 (Firebase-Standardized & Phase 11 Completed Roadmap)  
**Engineering Methodology:** Incremental Milestone Delivery with Strict Acceptance Criteria & Security Gates  
**Current Milestone Status:** Phases 1–11 Completed & Verified in Automated Tests (Live Emulator / Cloud Run / GCP PITR Staging Deployment Pending) $\rightarrow$ Phase 12 awaits pilot deployment

---

## 1. Roadmap Overview & Sequencing

```mermaid
gantt
    title PharmaDesk Implementation Milestones
    dateFormat  YYYY-MM-DD
    section Foundation & Firebase Platform
    Phase 1: Backend Monolith Foundation          :done, p1, 2026-11-10, 4d
    Phase 2: Multi-Tenant Isolation & Firebase Standardization :done, p2, after p1, 4d
    Phase 3: Firebase Auth, Firestore & Onboarding :done, p3, after p2, 5d
    Phase 4: Staff RBAC & Branch Permissions      :done, p4, after p3, 5d
    section Operational Core
    Phase 5: Medicine Formulary & Batch Stock     :done, p5, after p4, 7d
    Phase 6: POS Billing & Idempotent Engine      :done, p6, after p5, 8d
    Phase 7: Customers & Khata Credit Ledger      :done, p7, after p6, 6d
    Phase 8: Suppliers & Inward Goods Receipt     :done, p8, after p7, 8d
    Phase 9: Double-Entry Accounts & P&L          :done, p9, after p8, 7d
    Phase 10: Multi-Branch & Stock Transfers      :done, p10, after p9, 8d
    section Security & Pilot Release
    Phase 11: Security Hardening & DR Drills      :done, p11, after p10, 6d
    Phase 12: Pilot Deployment & Expert Review    :p12, after p11, 14d
```

---

## 2. Granular Phase Specifications

---

### Phase 1: Backend Foundation & Monolith Structure [COMPLETED]
- **Status:** Completed & Verified. Express modular monolith established in `server/`, Zod-validated environment parsing, Pino structured logging, RFC 7807 problem details error handling, Helmet/CORS/rate-limiting middleware, and integration tests passing.
- **Files:** `server/src/app.ts`, `server/src/server.ts`, `server/tsconfig.json`, `package.json`, `.env.example`, `server/src/config/*`, `server/src/middleware/*`, `server/src/routes/*`, `server/src/lib/*`.
- **Acceptance Criteria:** Express server compiles cleanly with zero TypeScript errors, passes health/error integration tests, and handles graceful shutdown.

---

### Phase 2: Multi-Tenant Data Architecture & Firebase Standardization [COMPLETED]
- **Status:** Completed & Standardized. All legacy SQL/PostgreSQL experiments permanently removed. Standardized Cloud Firestore schema (`firebase-blueprint.json`), `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json` (Firebase Hosting + `/api/**` Cloud Run rewrite), `.firebaserc`, and Cloud Run `Dockerfile` (`asia-south1`).
- **Security Invariants:** Strict hierarchical `tenants/{tenantId}/...` path isolation, `isTenantMember(tenantId)` and `hasBranchAccess(tenantId, branchId)` security rules, and zero `localStorage` persistence of business records in `src/context/PharmacyContext.tsx`.

---

### Phase 3: Firebase Authentication, Storage & Pharmacy Onboarding [COMPLETED]
- **Status:** Completed & Verified.
- **Scope:** Integrated Firebase Admin SDK (`server/src/lib/firebaseAdmin.ts`), RS256 ID token verification (`firebaseAuthMiddleware.ts`), optional Firebase App Check verification (`appCheckMiddleware.ts`), Firebase Storage signed URL service (`storageService.ts`, supporting `invoice_pdfs`, `prescriptions`, `supplier_bills`, `product_images`, `documents`), and atomic pharmacy onboarding (`POST /api/v1/onboarding/pharmacy`) creating tenant, main branch, owner membership, and user registry document in Cloud Firestore.
- **Automated Tests:** Auth verification, tenant/branch isolation, onboarding transaction, and storage signed URL tests passing.

---

### Phase 4: Staff RBAC & Branch Permissions [COMPLETED]
- **Status:** Completed & Verified.
- **Scope:** Staff invitations (`POST /api/v1/tenants/:tenantId/invitations`, 72-hour expiring token, `/resend`, `/cancel`, `POST /api/v1/invitations/accept`), role matrix (`owner`, `pharmacist`, `cashier`, `helper`, `auditor`), `assignedBranchIds` enforcement, per-user `permissionOverrides` (`granted`/`revoked`), immutable `audit_logs`, and immediate access revocation via `PATCH /api/v1/tenants/:tenantId/employees/:userId/status`.
- **Security Guarantee:** Every request evaluates live Firestore `tenants/{tenantId}/memberships/{uid}` (never static custom claims); deactivated staff are blocked immediately with `HTTP 403 ERR_EMPLOYEE_DEACTIVATED`.

---

### Phase 5: Medicine Catalogue & Batch-Level Inventory [COMPLETED]
- **Status:** Completed & Verified.
- **Scope:** Tenant-wide master medicine catalogue (`tenants/{tenantId}/medicines`, brand/salt/HSN/GST/schedule/duplicate checks/soft archiving), branch-scoped batch inventory (`tenants/{tenantId}/inventory_batches`), opening stock inward (`POST /api/v1/inventory/opening-stock`), physical count & variance adjustments (`POST /api/v1/inventory/adjustments`), immutable `stock_movements` audit ledger (`GET /api/v1/inventory/movements`), low-stock alerts, 30/60/90-day expiry monitoring, and PTR/MRP valuation (`inventory.ptr_margin` protected).
- **Invariants:** Non-negative batch stock invariant (`422 InsufficientStockError`) and automatic stock status computation (`normal`, `low_stock`, `near_expiry`, `expired`, `out_of_stock`).

---

### Phase 6: POS Billing & Idempotent Transaction Engine [COMPLETED — VERIFIED IN AUTOMATED TESTS]
- **Status:** Completed, Hardened (Phase 6 Corrective Audit), and Verified in Automated Tests (live Firebase Emulator & Cloud Run staging deployment pending).
- **Scope:** High-speed POS checkout engine (`server/src/services/billingTransactionService.ts`, `server/src/routes/billing.routes.ts`):
  - Automated **FEFO** (First Expiry, First Out) multi-batch allocation with automatic expired-batch exclusion and intra-cart working-stock tracking across duplicate batch lines (`items.length <= 50` cap matching Firestore's 500-op transaction limit).
  - Single-transaction read-before-write execution (`db.runTransaction`) across checkout, payment collection, sales returns, invoice cancellation, and stock adjustments; sequential invoice numbering (`INV-{BRANCH}-{YYYY}-{SEQ}`) allocated inside the checkout transaction so failed attempts never burn numbers.
  - Canonical SHA-256 payload hashing and branch-scoped `Idempotency-Key` protection (`X-Cache: HIT` replay vs `409 Conflict`) enforced across checkout, balance payment collection (`POST /api/v1/invoices/:id/payments`), sales returns (`POST /api/v1/invoices/:id/returns`), and optionally invoice cancellation (`POST /api/v1/invoices/:id/cancel`).
  - Decimal-safe paise rounding (`roundPaise`), intra-state CGST/SGST and inter-state IGST calculation after line discounts, and strict rejection of overpayments (`amount > balanceDue` returns `400 Bad Request`).
  - Partial/full sales returns with expired/damaged return quarantine (`restocked: false`, zero-delta `EXPIRY`/`DAMAGE` audit movement — never increments sellable batch stock), owner-restricted cancellation with dedicated `INVOICE_CANCEL_REVERSAL` movement and `refundStatus`/`refundAmount` tracking, and printable GST receipt snapshots (`GET /api/v1/invoices/:id/print`).
  - Fail-closed `firestore.rules` (Admin SDK-only authoritative writes, `isTenantActive`, explicit non-empty `assignedBranchIds` for non-owners), active tenant standing checks, and wildcard permission override rejection for non-owners.
- **Automated Tests:** 11 Vitest suites (`95` tests passing across Auth, Tenant/Branch Isolation, RBAC, Inventory, Storage, Firebase Admin SDK init, Security Rules & Zero-PostgreSQL Guards, and POS Billing/Idempotency/Returns/Cancellation).

---

### Phase 7: Customer Directory & Khata Credit Ledger [COMPLETED — VERIFIED IN AUTOMATED TESTS]
- **Status:** Completed and verified in automated Vitest/Supertest suites (live Firebase Emulator Suite deferred until Java runtime is available).
- **Scope:** Full tenant-scoped customer directory & Khata credit ledger (`server/src/services/customerService.ts`, `server/src/routes/customer.routes.ts`, `src/features/customers/*`, integrated `BillingView.tsx` POS checkout):
  - Customer CRUD, E.164 Indian phone normalization (`+91XXXXXXXXXX`), duplicate phone `409` conflict guard with `confirmSharedPhone`, status lifecycle (`ACTIVE`/`INACTIVE`/`BLOCKED`), and zero-balance archival protection.
  - Append-only `customers/{customerId}/ledger` and `customers/{customerId}/payments` subcollections reconciled using integer paise arithmetic inside `db.runTransaction`.
  - POS `khata_credit` checkout (full & split), credit terms (`0/7/15/30` days `dueDate`), credit limit enforcement, `customers.credit_override` owner approval with reason & audit log, auto-consumption of `advanceBalance`, and atomic `CREDIT_NOTE` reversals on sales returns and invoice cancellations.
  - Idempotent FIFO / targeted invoice repayment collection, credit notes, audited adjustments, period statements, CSV & `%PDF-1.4` exports archived to Firebase Storage, sanitized clinical-free `wa.me` sharing, overdue aging buckets (`0_7_days`, `8_15_days`, `16_30_days`, `over_30_days`), and `customers.view_phone` phone masking for restricted roles (`auditor`, `helper`).

---

### Phase 8: Suppliers, Purchase Orders, Goods Receipts & Accounts Payable [COMPLETED — VERIFIED IN AUTOMATED TESTS]
- **Status:** Completed and verified in automated Vitest/Supertest suites (live Firebase Emulator Suite & Cloud Run deployment deferred to staging environment with Java/gcloud credentials).
- **Scope:** Full tenant-scoped Supplier Directory & Procurement engine (`server/src/services/supplierService.ts`, `server/src/services/procurementService.ts`, `server/src/routes/supplier.routes.ts`, `server/src/routes/procurement.routes.ts`, `src/features/suppliers/SuppliersView.tsx`, `src/features/purchases/PurchasesView.tsx`):
  - Supplier CRUD, GSTIN/PAN/Indian phone checks, duplicate conflict guard (`409` vs `confirmDuplicate`), status blocking & owner-only reactivation, zero-balance archive protection, Firebase Storage document metadata, and server-side RBAC bank & financial field redaction (`suppliers.view_bank_details`, `suppliers.view_financials`).
  - Purchase Order lifecycle (`DRAFT` $\rightarrow$ `PENDING_APPROVAL` $\rightarrow$ `APPROVED` $\rightarrow$ `PARTIALLY_RECEIVED`/`FULLY_RECEIVED`/`CLOSED`/`CANCELLED`), integer-paise intra-state CGST+SGST & inter-state IGST calculation, concurrency lock against double approvals, and print templates.
  - Idempotent GRN receiving (PO-linked & direct), multi-batch split per line, `accepted + rejected === received`, expired & `mfgDate > expiryDate` rejection, configurable short-expiry warnings, rejected stock exclusion, over-receipt policy enforcement (`goods_receipts.correct`), atomic Phase 5 batch & `PURCHASE_RECEIPT` movement creation, `purchaseOperations` state machine, and auditable reversal (`/reverse`).
  - Single-liability `SupplierInvoice` recognition (unique per `grnId` preventing double payables), FIFO / targeted `SupplierPayment` with `allowAdvance`, `SupplierReturn` (`PURCHASE_RETURN` + credit note payable reduction), chronological `getSupplierStatement` with CSV/`%PDF-1.4` exports, and procurement reports (`GET /api/v1/procurement/reports`).

---

### Phase 9: Double-Entry Accounting & Financial Reporting [COMPLETED — VERIFIED IN AUTOMATED TESTS]
- **Status:** Completed and verified in automated Vitest/Supertest suites (live Firebase Emulator Suite & Cloud Run deployment deferred to staging environment with Java/gcloud credentials).
- **Scope:** Full double-entry General Ledger & Financial Reporting engine (`server/src/services/accountingService.ts`, `server/src/services/financialReportService.ts`, `server/src/routes/accounting.routes.ts`, `server/src/routes/expense.routes.ts`, `src/features/accounts/AccountsView.tsx`, `src/features/reports/ReportsView.tsx`):
  - Default Indian pharmacy Chart of Accounts (`tenants/{tenantId}/accounts`, 30+ system accounts spanning Cash `1100`, Petty Cash `1110`, Bank `1200`, UPI/Card Clearing `1210/1220`, AR Khata `1300`, Supplier Advances `1350`, Inventory `1400`, Input GST ITC `1510–1530`, AP Suppliers `2100`, GRN Unbilled Clearing `2110`, Output GST `2210–2230`, Accrued Expenses `2300`, Owner Equity/Opening Offset `3100/3200`, Sales Revenue & Returns `4100/4110`, COGS `5100`, Operating Expenses `5210–5290`).
  - Strict balanced voucher posting (`sum(debitPaise) === sum(creditPaise)`) inside Firestore transactions with immutable journals and audited contra reversals (`POST /api/v1/accounting/journal-entries/:entryId/reverse`). No public arbitrary manual journal creation endpoint.
  - Automatic post-commit ledger integration with Phase 6 POS checkout/payments/returns/cancellations, Phase 7 Khata repayments/adjustments, and Phase 8 GRNs/supplier invoices/payments/returns without duplicating subledgers.
  - Operating Expenses workflow (pharmacist submission `SUBMITTED` without GL posting -> owner approval `APPROVED_UNPAID` -> payment `PAID` -> audited reversal `REVERSED`), Cash/Bank transfers & charges, manual CSV/JSON bank statement import & line matching, Opening Balances (`3200`), Indian FY (Apr–Mar) Period Locks with audited reopening, GL-vs-subledger exception detection + idempotent backfill, Financial Reports (Trial Balance, P&L, Branch P&L, Balance Sheet, Cash Flow, Cash/Bank Books, General Ledger, GST Register with CA filing disclaimer, Expense Summary), and CSV/`%PDF-1.4` exports.

---

### Phase 10: Multi-Branch Management & Inter-Branch Stock Transfers [COMPLETED — VERIFIED IN AUTOMATED TESTS]
- **Status:** Completed and verified in automated Vitest/Supertest suites (live Firebase Emulator Suite & Cloud Run deployment deferred to staging environment with Java/gcloud credentials).
- **Scope:** Full multi-branch administration, workspace switching, inter-branch transfer workflow, and consolidated reporting (`server/src/services/branchService.ts`, `server/src/services/stockTransferService.ts`, `server/src/routes/branch.routes.ts`, `server/src/routes/stockTransfer.routes.ts`, `server/src/routes/multiBranchReport.routes.ts`, `src/features/branches/BranchesView.tsx`, `src/features/transfers/StockTransfersView.tsx`, updated `TopHeader.tsx`, `PharmacyContext.tsx`, `ReportsView.tsx`):
  - Branch CRUD, unique `branchCode` checks, primary promotion, drug licenses (`20B`/`21B`), transfer policies, staff branch assignments (protecting last branch), `branchAuditLogs`, and lifecycle states (`ACTIVE`/`INACTIVE`/`SUSPENDED`/`CLOSED`) with `requireActiveBranchMiddleware` blocking mutating operations on non-active branches.
  - Controlled branch closure (`GET /closure-check`, `POST /close`) enforcing zero stock, zero pending transfers, and settled payables/receivables/expenses prior to permanent closure.
  - Two-phase idempotent inter-branch transfers (`DRAFT` $\rightarrow$ `PENDING_APPROVAL` $\rightarrow$ `APPROVED` $\rightarrow$ `IN_TRANSIT` $\rightarrow$ `PARTIALLY_RECEIVED` $\rightarrow$ `RECEIVED`/`CLOSED`) with deadlock-free sorted branch locks, `STOCK_TRANSFER_OUT`/`IN` movements, metadata-preserving destination batches, mandatory discrepancy reasons, `1450 Stock in Transit` + `5280 EXP_SHRINKAGE` GL posting (zero revenue/COGS/GST), printable transfer challan, branch comparison, consolidated overview with eliminations, and CSV/`%PDF-1.4` exports.

---

### Phase 11: Security Hardening, Data Protection & Disaster Recovery [COMPLETED — VERIFIED IN AUTOMATED TESTS]
- **Status:** Completed and verified in automated Vitest/Supertest suites (live Cloud Firestore PITR, Cloud Secret Manager, Cloud Armor WAF, and Java-based Firebase Emulator validation deferred to staging/GCP project deployment).
- **Scope:** Defense-in-depth application hardening, privacy controls, and DR readiness (`server/src/services/securityGovernanceService.ts`, `server/src/routes/security.routes.ts`, `server/src/lib/csv.ts`, `server/src/services/auditService.ts`, `src/features/settings/SettingsView.tsx`):
  - **Transport, CORS & Headers:** Configured Cloud Run `TRUST_PROXY`, production rejection of wildcard `'*'` CORS origins, `X-Frame-Options: DENY`, `Strict-Origin-When-Cross-Origin`, production HSTS, strict `Cache-Control: no-store` headers on API routes, sensitive route rate limiters, and optional fail-closed `X-Firebase-AppCheck` validation.
  - **Privacy, Storage & CSV Hygiene:** Expanded Pino PHI/banking/secret log redaction; metadata masking & filtered querying in `AuditService`; removed `image/.*` wildcard in `storage.rules` (blocking `image/svg+xml` XSS uploads + enforcing MIME-to-extension checks); neutralized CSV formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`); masked issued invitation tokens on `GET /invitations` and closed remaining cross-branch route guards across Inventory, Billing, Procurement, Accounting, and Stock Transfers.
  - **DPDP & DR Governance:** Configurable statutory retention policies (`security_policies/retention`), audited DPDP tenant data portability JSON exports with SHA-256 checksums (`dpdp_exports`), ledger integrity verification & DR drill tracking (`dr_drills`), hardened non-root `node` Cloud Run `Dockerfile` with `HEALTHCHECK`, and interactive Security/Audit/DR UI console for Owners and read-only Auditors.
- **Staging Prerequisites Remaining:** Enable Google Cloud Firestore PITR (7-day window), daily Coldline Cloud Storage exports, Cloud Secret Manager bindings, and Cloud Armor WAF rules in the target GCP `asia-south1` project.

---

### Phase 12: Pilot Deployment & Operational Review
- **Scope:** Deploy static SPA to Firebase Hosting (`firebase deploy --only hosting,firestore,storage`) and Express container to Google Cloud Run (`asia-south1` Mumbai). Onboard pilot Indian retail pharmacy for live counter dispensing with 80mm thermal receipt printing and statutory pharmacist/GST verification.
- **Prerequisites:** Phase 11 completion, passing all Quality Release Gates.
- **Acceptance Criteria:** Live store completes full daily operating shifts with uninterrupted POS dispensing, accurate batch reconciliation, and verified GST output reports.

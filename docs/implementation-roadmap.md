# PharmaDesk 12-Phase Implementation Roadmap

**Document Version:** 3.0.0 (Firebase-Standardized Roadmap)  
**Engineering Methodology:** Incremental Milestone Delivery with Strict Acceptance Criteria & Security Gates  
**Current Milestone Status:** Phases 1–6 Completed + Architecture Standardized on Firebase & Cloud Run $\rightarrow$ Ready for Phase 7 (Customer Directory & Khata Credit Ledger)

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
    section Planned Next Phases
    Phase 7: Customers & Khata Credit Ledger      :p7, after p6, 6d
    Phase 8: Suppliers & Inward Goods Receipt     :p8, after p7, 8d
    Phase 9: Double-Entry Accounts & P&L          :p9, after p8, 7d
    Phase 10: Multi-Branch & Stock Transfers      :p10, after p9, 8d
    Phase 11: Security Hardening & DR Drills      :p11, after p10, 6d
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

### Phase 6: POS Billing & Idempotent Transaction Engine [COMPLETED]
- **Status:** Completed & Verified.
- **Scope:** High-speed POS checkout engine (`server/src/services/billingTransactionService.ts`, `server/src/routes/billing.routes.ts`):
  - Automated **FEFO** (First Expiry, First Out) multi-batch allocation with automatic expired-batch exclusion.
  - Concurrency-safe server-side sequential invoice numbering (`INV-{BRANCH}-{YYYY}-{SEQ}` via `tenants/{tenantId}/counters`).
  - Canonical SHA-256 payload hashing and Firestore-transactional `Idempotency-Key` protection (`X-Cache: HIT` replay vs `409 IdempotencyConflictError` on mismatched payload).
  - Decimal-safe paise rounding (`roundPaise`), intra-state CGST/SGST and inter-state IGST calculation after line discounts.
  - Split payments (`cash`, `upi`, `card`, `bank_transfer`, `khata_credit`) and balance due collection (`POST /api/v1/invoices/:id/payments`).
  - Partial/full sales returns with proportional refund calculation and non-expired restocking (`POST /api/v1/invoices/:id/returns`), owner-restricted invoice cancellation stock reversal (`POST /api/v1/invoices/:id/cancel`), and printable GST receipt snapshots (`GET /api/v1/invoices/:id/print`).
- **Automated Tests:** Full Vitest integration suite (`server/tests/posBilling.test.ts`) passing alongside all 8 prior suites (9 files, 77 tests).

---

### Phase 7: Customer Directory & Khata Credit Ledger [NEXT PHASE — NOT STARTED]
- **Scope:** Tenant-scoped patient/customer profiles (`tenants/{tenantId}/customers`), prescribing doctor tracking, append-only `customer_ledger` (`CREDIT_PURCHASE`, `CASH_PAYMENT`, `CREDIT_NOTE`), credit limit enforcement during POS checkout, Khata repayment collection, and WhatsApp statement links.
- **Prerequisites:** Phase 6 completion & Firebase architecture standardization.
- **Security Requirements:** Patient phone numbers masked from unauthorized roles (`helper`); Khata settlements authorized by `customers.khata_settle`.
- **Acceptance Criteria:** Khata balance matches sum of `customer_ledger` debits/credits atomically inside Firestore `runTransaction`.

---

### Phase 8: Suppliers, Purchase Orders & Goods Receipts
- **Scope:** Pharmaceutical distributor directory (`tenants/{tenantId}/suppliers`), wholesale drug license tracking, purchase orders (`purchase_orders`), goods receipts (`goods_receipts`) inwarding batches with PTR/MRP/free quantity, and `supplier_ledger` payables.
- **Prerequisites:** Phase 7 completion.
- **Security Requirements:** Wholesale purchase costs (PTR) and supplier payables restricted to `owner` and `pharmacist` roles (`inventory.ptr_margin`, `suppliers.payables`).

---

### Phase 9: Double-Entry Accounts & Financial Reporting
- **Scope:** Chart of Accounts (`ledger_accounts`), balanced double-entry journal postings (`accounting_journals`, $\sum \text{Debits} == \sum \text{Credits}$ validated inside Firestore transactions), daily cash register closing, operating expenses (`expenses`), P&L derived from Net Revenue $-$ COGS $-$ Expenses, and GSTR-1 outward tax summaries.
- **Prerequisites:** Phase 8 completion.
- **Security Requirements:** Posted accounting journals are immutable; P&L and GST tax filings restricted exclusively to `owner` role.

---

### Phase 10: Multi-Branch & Stock Transfers
- **Scope:** Multi-branch chain administration, workstation branch switcher synced with `X-Branch-ID`, two-phase inter-branch stock transfers (`ISSUED` $\rightarrow$ `IN_TRANSIT` $\rightarrow$ `RECEIVED`) in `tenants/{tenantId}/stock_transfers`, and chain-wide consolidated analytics.
- **Prerequisites:** Phase 9 completion.
- **Security Requirements:** Source batch decremented upon dispatch (`STOCK_TRANSFER_OUT`); destination batch incremented upon verified receipt (`STOCK_TRANSFER_IN`).

---

### Phase 11: Security Hardening & DR Drills
- **Scope:** Google Cloud Secret Manager integration for Cloud Run, Cloud Firestore Point-in-Time Recovery (PITR) verification, scheduled Firestore managed exports to immutable Coldline Cloud Storage buckets, DPDP tenant data export ZIP generation, and Cloud Armor WAF rate limiting.
- **Prerequisites:** Phase 10 completion.
- **Acceptance Criteria:** Recovery Time Objective (RTO) $< 30\text{ minutes}$ verified via staging Firestore restore drill; App Check enforced in production.

---

### Phase 12: Pilot Deployment & Operational Review
- **Scope:** Deploy static SPA to Firebase Hosting (`firebase deploy --only hosting,firestore,storage`) and Express container to Google Cloud Run (`asia-south1` Mumbai). Onboard pilot Indian retail pharmacy for live counter dispensing with 80mm thermal receipt printing and statutory pharmacist/GST verification.
- **Prerequisites:** Phase 11 completion, passing all Quality Release Gates.
- **Acceptance Criteria:** Live store completes full daily operating shifts with uninterrupted POS dispensing, accurate batch reconciliation, and verified GST output reports.

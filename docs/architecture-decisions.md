# PharmaDesk Architecture Decision Records (ADRs)

**Document Version:** 2.0.0 (Firebase-Standardized Architecture)  
**Project:** PharmaDesk — Cloud-Based Pharmacy Management SaaS (India)  
**Standard:** Michael Nygard ADR Format  
**Scope:** Foundational Architecture, Security, Tenancy, Inventory Integrity & Cloud Infrastructure

---

## Index of Architecture Decision Records

* [ADR-001: Firebase-First Architecture with Cloud Firestore as Sole Business Database](#adr-001-firebase-first-architecture-with-cloud-firestore-as-sole-business-database)
* [ADR-002: Tenant & Branch Isolation via Hierarchical Firestore Paths, Middleware, and Security Rules](#adr-002-tenant-and-branch-isolation-via-hierarchical-firestore-paths-middleware-and-security-rules)
* [ADR-003: Decoupled Identity (Firebase Auth) and Live Authoritative RBAC (Cloud Firestore)](#adr-003-decoupled-identity-firebase-auth-and-live-authoritative-rbac-cloud-firestore)
* [ADR-004: Modular Monolith Express API on Google Cloud Run](#adr-004-modular-monolith-express-api-on-google-cloud-run)
* [ADR-005: Online-First POS Architecture with Server-Side Idempotency](#adr-005-online-first-pos-architecture-with-server-side-idempotency)
* [ADR-006: Batch-Level Immutable Stock Movement Ledger](#adr-006-batch-level-immutable-stock-movement-ledger)
* [ADR-007: Firestore ACID Transactions & FEFO Allocation for Billing Concurrency](#adr-007-firestore-acid-transactions--fefo-allocation-for-billing-concurrency)
* [ADR-008: Tenant- and Branch-Isolated File Storage on Firebase Storage](#adr-008-tenant--and-branch-isolated-file-storage-on-firebase-storage)
* [ADR-009: Embedded Branch Authorization Arrays on Membership & Invitation Documents](#adr-009-embedded-branch-authorization-arrays-on-membership--invitation-documents)
* [ADR-010: Target Cloud Deployment Region (Google Cloud `asia-south1` Mumbai)](#adr-010-target-cloud-deployment-region-google-cloud-asia-south1-mumbai)
* [ADR-011: Cloud Firestore Point-in-Time Recovery (PITR) & Backup Strategy](#adr-011-cloud-firestore-point-in-time-recovery-pitr--backup-strategy)
* [ADR-012: Prohibition of Local Browser Persistence for Business Records](#adr-012-prohibition-of-local-browser-persistence-for-business-records)
* [ADR-013: Bun Package Manager & Unified Build Pipeline](#adr-013-bun-package-manager--unified-build-pipeline)

---

## ADR-001: Firebase-First Architecture with Cloud Firestore as Sole Business Database

### Context
PharmaDesk targets independent Indian retail pharmacies and multi-branch medical stores requiring zero idle infrastructure overhead at pilot scale, real-time synchronization across counters, managed mobile/email authentication, integrated document storage, and unified GCP regional residency. Maintaining separate relational database servers, VPC connectors, and dual-database synchronization introduced unnecessary operational complexity, higher baseline fixed costs, and split sources of truth.

### Decision
Standardize **Cloud Firestore** as the **sole and authoritative business database** for PharmaDesk across all domains (tenants, branches, staff memberships, invitations, medicine masters, batch inventory, stock movements, sales invoices, payments, returns, idempotency keys, counters, audit logs, and planned Phase 7–9 customer/supplier/accounting modules).

### Consequences
* **Positive:** Single source of truth eliminates split-brain sync bugs; zero idle instance billing at pilot scale; native ACID multi-document transactions (`runTransaction`); built-in real-time listener support; unified security boundary across Auth, Firestore, Storage, and Hosting.
* **Negative:** Requires strict server-side schema validation (Zod), structured denormalized read patterns (e.g., embedding immutable rate/item snapshots inside `sales_invoices`), and explicit Firestore composite indexes (`firestore.indexes.json`).
* **Mitigation:** All writes flow through validated domain services in `server/src/services/` with strict TypeScript contracts and Firestore Security Rules blocking arbitrary client mutations.

---

## ADR-002: Tenant & Branch Isolation via Hierarchical Firestore Paths, Middleware, and Security Rules

### Context
A shared multi-tenant SaaS pharmacy platform must guarantee mathematically and operationally that Tenant A can never read, update, or reference Tenant B's patients, batches, or invoices, and that branch-restricted staff cannot access unassigned store branches.

### Decision
Enforce three-layer multi-tenant and branch isolation:
1. **Hierarchical Path Partitioning:** All tenant business records live exclusively under `tenants/{tenantId}/<collection>/{docId}`.
2. **Express Middleware Context Enforcement:** `tenantAuthorizationMiddleware` validates the caller's Firebase ID token, checks live membership in `tenants/{tenantId}/memberships/{uid}`, verifies tenant standing, and validates requested `X-Branch-ID` against `assignedBranchIds`.
3. **Firestore & Storage Security Rules:** `firestore.rules` and `storage.rules` enforce `isTenantMember(tenantId)` and `hasBranchAccess(tenantId, branchId)` independently on every direct client access path, while locking immutable ledgers (`stock_movements`, `sales_invoices`, `audit_logs`, `idempotency_keys`) to server-only Admin SDK writes.

### Consequences
* **Positive:** Simple, auditable path isolation; impossible to query across tenants without explicit tenant root; zero reliance on ambient session globals.
* **Negative:** Reporting and inventory queries must remain scoped to `tenants/{tenantId}`.

---

## ADR-003: Decoupled Identity (Firebase Auth) and Live Authoritative RBAC (Cloud Firestore)

### Context
Staff employees frequently switch roles, have custom permission overrides, gain or lose branch assignments, or must be deactivated immediately upon termination. Encoding permissions inside client JWT custom claims allows stale tokens to remain valid for up to 60 minutes.

### Decision
* **Firebase Authentication** acts strictly as the **Identity Provider (IdP)** verifying credentials and issuing RS256 ID tokens (`uid`).
* **Cloud Firestore** (`tenants/{tenantId}/memberships/{uid}`) is the **sole source of truth** for role, `status`, `assignedBranchIds`, and `permissionOverrides`.
* **No Custom Claims Authorization:** Firebase Custom Claims are prohibited as an authorization authority.

### Consequences
* **Positive:** Instantaneous access revocation—updating `status` to `'deactivated'` returns `HTTP 403 ERR_EMPLOYEE_DEACTIVATED` on the user's very next API call. Supports one Firebase user holding distinct roles across multiple pharmacies cleanly.
* **Negative:** Every protected backend request performs one indexed point-read on `tenants/{tenantId}/memberships/{uid}` (~3–8ms inside GCP `asia-south1`).

---

## ADR-004: Modular Monolith Express API on Google Cloud Run

### Context
Splitting pharmacy billing, inventory, staff RBAC, and storage into separate microservices adds network latency, distributed transaction failure modes, and complex deployment overhead.

### Decision
Run PharmaDesk's backend as a **Modular Monolith** in Express + TypeScript (`server/src/`) deployed as a containerized Node.js 22 service (`pharmadesk-api`) on **Google Cloud Run** (`asia-south1`), fronted by **Firebase Hosting** `/api/**` rewrites.

### Consequences
* **Positive:** Clean domain separation (`services/`, `routes/`, `middleware/`, `lib/`), zero inter-service network hops during billing transactions, automatic Cloud Run scaling (0 to N instances), and seamless same-origin `/api/*` routing behind Firebase Hosting.
* **Mitigation:** Strict service boundaries prevent cross-domain direct mutations outside public service methods.

---

## ADR-005: Online-First POS Architecture with Server-Side Idempotency

### Context
Indian pharmacy regulations require continuous sequential invoice numbering and real-time Schedule H/H1/X tracking across counters. Allowing disconnected offline billing creates batch overselling and duplicate invoice sequence collisions.

### Decision
Adopt an **Online-First POS Architecture** backed by mandatory server-side idempotency (`Idempotency-Key` header) stored in `tenants/{tenantId}/idempotency_keys/{key}` using recursive canonical SHA-256 payload hashing.

### Consequences
* **Positive:** Re-submitting an identical checkout request after a flaky network drop replays the committed invoice (`X-Cache: HIT`) without re-decrementing stock; reusing the same key with altered payload raises `HTTP 409 IdempotencyConflictError`.
* **Negative:** Active broadband or 4G/5G connectivity is required to finalize invoices.

---

## ADR-006: Batch-Level Immutable Stock Movement Ledger

### Context
In Indian pharmaceutical retail, stock counts must be tracked per manufacturer batch, expiry date, wholesale PTR, and MRP, with a verifiable audit log of every stock change.

### Decision
Maintain a two-collection inventory model under each tenant:
1. `tenants/{tenantId}/inventory_batches/{batchId}` holding live `currentStock`, `batchNumber`, `expiryDate`, `purchasePrice` (PTR), `mrp`, `sellingPrice`, and `rackLocation`.
2. `tenants/{tenantId}/stock_movements/{movementId}` serving as an **append-only immutable ledger** recording `OPENING_STOCK`, `PURCHASE_RECEIPT`, `SALE`, `SALE_RETURN`, `PURCHASE_RETURN`, `DAMAGE`, `EXPIRY`, `MANUAL_ADJUSTMENT`, `STOCK_TRANSFER_IN`, and `STOCK_TRANSFER_OUT`.

### Consequences
* **Positive:** Full regulatory and financial auditability; `firestore.rules` explicitly forbid client updates or deletes on `stock_movements`.

---

## ADR-007: Firestore ACID Transactions & FEFO Allocation for Billing Concurrency

### Context
Multiple counters billing concurrently must never sell expired stock or drive batch `currentStock` below zero.

### Decision
1. **FEFO Allocation:** `BillingTransactionService.allocateBatchesFEFO` automatically excludes expired batches (`isBatchExpired`) and sorts eligible batches by earliest `expiryDate` first, splitting quantities across multiple batches when necessary.
2. **Firestore Serialized Transactions:** `createSalesInvoice` executes inside `db.runTransaction(...)`, reading batch documents transactionally, verifying `currentStock >= quantity`, decrementing batches, writing `stock_movements`, incrementing `counters/invoice_{BRANCH}_{YEAR}`, writing `sales_invoices` + `payments`, and finalizing `idempotency_keys` atomically.
3. **Hard Invariant Error:** Insufficient stock raises `HTTP 422 InsufficientStockError`—negative stock clamping is strictly prohibited.

---

## ADR-008: Tenant- and Branch-Isolated File Storage on Firebase Storage

### Context
Pharmacies handle sensitive prescription scans, invoice PDFs, supplier bills, product images, and compliance documents.

### Decision
Store all files in **Firebase Storage** using the standardized path format:
`tenants/{tenantId}/branches/{branchId}/{category}/{fileName}`
for categories `invoice_pdfs`, `prescriptions`, `supplier_bills`, `product_images`, and `documents`, enforced by `storage.rules` (active branch membership check, `< 15 MB`, `image/*` or `application/pdf`) and accessed via short-lived V4 signed URLs issued by `StorageService`.

---

## ADR-009: Embedded Branch Authorization Arrays on Membership & Invitation Documents

### Context
Cloud Firestore models one-to-few relationships efficiently when branch IDs assigned to a staff member or invitation are stored directly on the document rather than across separate join collections.

### Decision
Store `assignedBranchIds: string[]` (or `['*']` for Owner) directly on `tenants/{tenantId}/memberships/{userId}` and `tenants/{tenantId}/invitations/{invitationId}`. Validate branch membership server-side and inside `firestore.rules` / `storage.rules` via `'branchId' in membership.assignedBranchIds || '*' in membership.assignedBranchIds`.

### Consequences
* **Positive:** Single document lookup resolves role, status, overrides, and authorized branches in one Firestore read (~1 read unit per API call).

---

## ADR-010: Target Cloud Deployment Region (Google Cloud `asia-south1` Mumbai)

### Context
PharmaDesk serves Indian medical stores requiring low POS latency and compliance with Indian Digital Personal Data Protection (DPDP) data residency expectations.

### Decision
Deploy Cloud Run (`pharmadesk-api`), Cloud Firestore, and Firebase Storage in **`asia-south1` (Mumbai)** and configure `/api/**` rewrites in `firebase.json` pointing to `asia-south1`.

---

## ADR-011: Cloud Firestore Point-in-Time Recovery (PITR) & Backup Strategy

### Context
Pharmacy financial and dispensing records require dependable disaster recovery against accidental corruption or operational error.

### Decision
Enable **Cloud Firestore Point-in-Time Recovery (PITR)** (1-minute granularity within 7 days) alongside scheduled Cloud Firestore managed exports to an immutable Cloud Storage archive bucket in `asia-south1`.

---

## ADR-012: Prohibition of Local Browser Persistence for Business Records

### Context
Early UI prototypes stored mock pharmacy inventories, customers, and bills in `localStorage`. Persisting authoritative business data in browser storage risks data loss when cache clears, cross-workstation drift, and security exposure on shared counter PCs.

### Decision
**Strictly forbid** persisting permanent pharmacy business entities in `localStorage`, `sessionStorage`, or `IndexedDB`. `src/context/PharmacyContext.tsx` operates solely on authenticated React session state backed by Cloud API / Firestore services, with zero `localStorage` business-entity reads or writes.

---

## ADR-013: Bun Package Manager & Unified Build Pipeline

### Context
Consistent dependency resolution and fast TypeScript builds across frontend (`Vite`) and backend (`esbuild` / `tsx` / `Vitest`) reduce CI/CD runtime and lockfile drift.

### Decision
Standardize on **Bun** (`bun.lock`) across local development, CI/CD (`.github/workflows/backend-ci.yml`), and Docker builds (`Dockerfile` using `oven/bun:1-alpine` builder + `node:22-alpine` Cloud Run runtime).

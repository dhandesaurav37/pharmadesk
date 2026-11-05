# PharmaDesk Architecture Decision Records (ADRs)

**Document Version:** 1.0.0  
**Project:** PharmaDesk — Cloud-Based Pharmacy Management SaaS (India)  
**Standard:** Michael Nygard ADR Format  
**Scope:** Foundational Architecture, Security, Tenancy, Financial Integrity & Cloud Infrastructure

---

## Index of Architecture Decision Records

* [ADR-001: Multi-Tenancy Architecture (Shared Database & Shared Schema)](#adr-001-multi-tenancy-architecture-shared-database--shared-schema)
* [ADR-002: Tenant Isolation via Composite Foreign Keys and PostgreSQL Row-Level Security (RLS)](#adr-002-tenant-isolation-via-composite-foreign-keys-and-postgresql-row-level-security-rls)
* [ADR-003: Decoupled Identity (Firebase Auth) and Authoritative Authorization (PostgreSQL)](#adr-003-decoupled-identity-firebase-auth-and-authoritative-authorization-postgresql)
* [ADR-004: Modular Monolith Service Architecture over Microservices](#adr-004-modular-monolith-service-architecture-over-microservices)
* [ADR-005: Online-First Architecture for Initial Pilot Release](#adr-005-online-first-architecture-for-initial-pilot-release)
* [ADR-006: Batch-Level Immutable Stock Movement Ledger](#adr-006-batch-level-immutable-stock-movement-ledger)
* [ADR-007: Pessimistic Row Locking & Database Invariants for Billing Concurrency](#adr-007-pessimistic-row-locking--database-invariants-for-billing-concurrency)
* [ADR-008: Double-Entry Chart of Accounts and Balanced Journal Postings](#adr-008-double-entry-chart-of-accounts-and-balanced-journal-postings)
* [ADR-009: Normalized Relational Junctions for Branch Authorization (No UUID Arrays)](#adr-009-normalized-relational-junctions-for-branch-authorization-no-uuid-arrays)
* [ADR-010: Target Cloud Deployment Region (Google Cloud `asia-south1` Mumbai)](#adr-010-target-cloud-deployment-region-google-cloud-asia-south1-mumbai)
* [ADR-011: Point-in-Time Recovery (PITR) and Automated Restore Drill Strategy](#adr-011-point-in-time-recovery-pitr-and-automated-restore-drill-strategy)
* [ADR-012: Progressive Strangler-Fig Migration from Prototype LocalStorage to Cloud Persistence](#adr-012-progressive-strangler-fig-migration-from-prototype-localstorage-to-cloud-persistence)
* [ADR-013: Firebase as Integrated Managed Services Layer with PostgreSQL as Authoritative Core](#adr-013-firebase-as-integrated-managed-services-layer-with-postgresql-as-authoritative-core)

---

## ADR-001: Multi-Tenancy Architecture (Shared Database & Shared Schema)

### Context
PharmaDesk targets independent retail pharmacies, hospital attached medical stores, and small pharmacy chains in India. The business model requires an accessible subscription fee while supporting thousands of independent pharmacy accounts. Database architecture must provide stringent data isolation without incurring prohibitive baseline hosting costs per tenant.

### Decision
Adopt a **shared database with a shared relational schema**, partitioning data via a mandatory `tenant_id UUID` column across all tenant-owned tables.

### Alternatives Considered
1. **Database-per-tenant:** Creating a dedicated PostgreSQL database for each pharmacy. Rejected due to extreme Cloud SQL fixed cost ($45–$60/month per instance $\times$ 100 pharmacies = $5,000/month), slow provisioning (minutes per tenant), and impossible schema migration maintenance across hundreds of separate databases.
2. **Schema-per-tenant:** Using separate PostgreSQL schemas within one database. Rejected due to connection pool overhead, migration complexity with Drizzle/Prisma, table limit exhaustion on single instances, and high cross-schema reporting friction for platform maintenance.

### Consequences
* **Positive:** Efficient connection pooling; scale-to-zero capabilities during off-peak hours; zero cost per newly registered trial tenant; instantaneous tenant provisioning via SQL insert; unified schema migrations in a single transaction.
* **Negative:** Mandates rigorous defense-in-depth to eliminate cross-tenant data leakage risks.
* **Mitigation:** Enforce composite primary/foreign keys and PostgreSQL Row-Level Security (RLS) as detailed in ADR-002.

### Unresolved Questions
* Threshold at which enterprise pharmacy chains (>50 branches) should be offered an isolated private database instance for custom compliance requirements.

---

## ADR-002: Tenant Isolation via Composite Foreign Keys and PostgreSQL Row-Level Security (RLS)

### Context
In shared-schema multi-tenant systems, software bugs (e.g., missing `WHERE tenant_id = ...` or ID substitution attacks) present catastrophic data leak risks. We require database-engine-level guarantees that prevent cross-tenant referencing and unauthorized row reads.

### Decision
Implement a two-pillar defense-in-depth strategy:
1. **Composite Foreign Keys:** Every tenant-owned table must declare `CONSTRAINT uq_<table>_tenant_id UNIQUE (tenant_id, id)`. All child foreign keys must reference `(tenant_id, <parent>_id)`.
2. **PostgreSQL Row-Level Security (RLS):** Enable and force RLS on all tenant tables with `AS RESTRICTIVE` policies checking `tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID`.

### Alternatives Considered
1. **Application-Only Filtering (ORM `WHERE` clauses):** Relies solely on developer diligence. Rejected as unsafe—a single missing filter in a nested join exposes sensitive health and financial data.
2. **Separate Application Databases per Tenant:** Rejected under ADR-001.

### Consequences
* **Positive:** Mathematical impossibility of cross-tenant references at the relational layer; if an API parameter references an invoice belonging to Tenant B while operating as Tenant A, the foreign key rejects it with an integrity violation. RLS ensures forgotten `WHERE` clauses return empty sets rather than leaked rows.
* **Negative:** Child tables require `tenant_id` columns and slightly larger composite index footprints.
* **Operational Constraint:** The runtime application database role (`pharmadesk_app`) must NOT own tables and must NOT possess `BYPASSRLS`.

### Unresolved Questions
* Performance overhead of RLS on high-frequency composite joins under heavy load (>100 queries/sec per instance); to be benchmarked during Phase 2 load testing.

---

## ADR-003: Decoupled Identity (Firebase Auth) and Authoritative Authorization (PostgreSQL)

### Context
PharmaDesk requires secure user authentication (supporting mobile phone SMS OTP and email/password), credential storage, and session token issuance. However, pharmacy staff have complex multi-tenant memberships, role assignments, branch restrictions, and immediate deactivation requirements.

### Decision
Decouple identity verification from authorization:
* **Firebase Authentication:** Acts purely as the **Identity Provider (IdP)**. It verifies phone OTPs/passwords and issues cryptographically signed JWTs (`firebase_uid`).
* **PostgreSQL:** Acts as the **Sole Authority for Authorization**. Tenant memberships, active/deactivated statuses, assigned branches, roles, and granular permission overrides reside in PostgreSQL and are evaluated server-side on every request.
* **Firebase Custom Claims:** Strictly prohibited as the authoritative source for roles or permissions.

### Alternatives Considered
1. **Encoding Roles in Firebase Custom Claims:** Rejected because Firebase JWTs are cached on clients for up to 60 minutes. If a cashier is fired for theft, they could continue billing for up to an hour until their custom claim token expires.
2. **Custom Self-Hosted Auth (Passport / Argon2 in PostgreSQL):** Rejected for Phase 1 to avoid implementing custom SMS gateways, password reset flows, and MFA compliance from scratch.

### Consequences
* **Positive:** Instantaneous revocation; setting `tenant_memberships.status = 'deactivated'` immediately terminates access on the subsequent API call (sub-millisecond latency). Allows a single user (one Firebase UID) to hold memberships in multiple independent pharmacies without token collisions.
* **Negative:** Every API call incurs a fast indexed lookup against `tenant_memberships` (mitigated by indexed query in Express authentication middleware).

### Unresolved Questions
* Feasibility of introducing a short-lived in-memory Redis cache (TTL 30 seconds) for membership authorization if database lookup latency exceeds 5ms under scale.

---

## ADR-004: Modular Monolith Service Architecture over Microservices

### Context
Early-stage SaaS applications frequently suffer from premature decomposition into microservices, creating high network overhead, distributed transaction failures, complex deployment pipelines, and heavy DevOps burdens.

### Decision
Build PharmaDesk as a **Modular Monolith** using Express and TypeScript in a single deployable unit on Google Cloud Run, organized cleanly by business domains (`billing/`, `inventory/`, `accounting/`, `customers/`).

### Alternatives Considered
1. **Microservices (Billing Service, Inventory Service, Auth Service):** Rejected. Distributed transactions across billing and stock deduction would require complex two-phase commit (2PC) or Saga patterns, drastically increasing failure points and development time without user benefit.
2. **Serverless Functions (Cloud Functions per Route):** Rejected due to cold start latency on critical POS counter transactions and connection pool exhaustion against PostgreSQL.

### Consequences
* **Positive:** Atomic ACID transactions across billing, stock ledger, and accounting journals; zero inter-service network latency; simple single-container CI/CD pipeline on Cloud Run; unified logging.
* **Negative:** All domain modules share the same deployable lifecycle.
* **Mitigation:** Enforce strict domain boundary interfaces and prevent cross-domain direct table mutations outside their respective service modules.

### Unresolved Questions
* At what scale should heavy background reporting (e.g., annual GST audit reports) be offloaded to dedicated Cloud Run worker jobs to prevent CPU starvation on billing APIs.

---

## ADR-005: Online-First Architecture for Initial Pilot Release

### Context
Retail pharmacies require fast billing. Some retail systems attempt offline peer-to-peer sync or local database replicas. However, offline multi-counter retail in pharmacy operations introduces severe regulatory risks (duplicate Schedule H1 registers, conflicting batch stock numbers, and reconciliations).

### Decision
Launch the initial pilot as **Online-First** with resilient optimistic UI caching, robust HTTP idempotency (`Idempotency-Key` header), and clear visual network health indicators. Defer full offline local-first sync to a future phase.

### Alternatives Considered
1. **Offline-First with CRDTs / Local SQLite / PouchDB:** Rejected for Phase 1. Drug sales laws in India mandate strictly non-duplicating serial invoice numbers and real-time Schedule H1 tracking. Conflict resolution when two counters sell the last stock offline creates physical stock deficits that violate drug control regulations.
2. **Desktop Hybrid Electron App:** Rejected to maintain zero-install web distribution and instant cloud updates.

### Consequences
* **Positive:** 100% accurate, real-time stock balances across multiple counter computers; zero offline conflict resolution headaches; complete compliance with continuous invoice numbering sequences.
* **Negative:** Store cannot issue cloud-synced bills during total broadband/cellular outages.
* **Mitigation:** Clear offline warning banner, rapid 4G/5G mobile hotspot fallback recommendation for pharmacy counters, and future Phase 3 local cash register queue design.

### Unresolved Questions
* Establishing exact contractual SLA metrics for counter connectivity requirements in commercial customer agreements.

---

## ADR-006: Batch-Level Immutable Stock Movement Ledger

### Context
In pharmaceutical retail, tracking medicines by item count alone is unlawful and operationally unviable. Every unit belongs to a specific manufacturer batch with an immutable expiry date, purchase price, and printed MRP. Inventory discrepancies must be traceable to exact business events.

### Decision
Model inventory using a **two-tier structure**:
1. `inventory_batches`: Current physical stock level of a specific batch at a specific branch.
2. `stock_movements`: An **immutable, append-only ledger** recording every single unit increment or decrement, tied to its source business event (`GOODS_RECEIPT`, `SALE_DISPENSE`, `CUSTOMER_RETURN`, `SUPPLIER_RETURN`, `AUDIT_ADJUSTMENT`, `TRANSFER_OUT`, `TRANSFER_IN`).
* Modifying past stock movements is strictly prohibited by database permissions.

### Alternatives Considered
1. **Simple Quantity Column on Medicines Table:** Rejected as it completely fails Indian drug laws requiring batch number and expiry date printing on every retail bill.
2. **Ephemeral Inventory Updates without Movement Ledger:** Rejected because unexplained stock losses, physical variances, or theft cannot be audited or reconciled.

### Consequences
* **Positive:** Mathematical auditability: $\text{Current Stock} \equiv \sum \text{quantity\_delta}$. Enables physical stock discrepancy reconciliation via `AUDIT_ADJUSTMENT` entries without erasing history.
* **Negative:** Rapid table growth in high-volume pharmacies (e.g., 500 bills/day $\times$ 3 items = 1,500 movement rows/day).
* **Mitigation:** Table partitioning on `stock_movements` by financial year or quarter will be implemented in Phase 2 scaling.

### Unresolved Questions
* Retention period for historical stock movements before archiving to Cloud Storage Coldline (e.g., 5 years vs 8 years per statutory drug guidelines).

---

## ADR-007: Pessimistic Row Locking & Database Invariants for Billing Concurrency

### Context
In medium and large medical stores, multiple cashiers bill at separate counters simultaneously during evening rush hours. If two cashiers bill the final 2 strips of an antibiotic concurrently, race conditions can cause negative inventory or double dispensing.

### Decision
Enforce concurrency safety at the database engine tier:
1. **Pessimistic Row-Level Locking:** During the billing transaction, batch records are locked using:
   ```sql
   SELECT * FROM inventory_batches WHERE id IN (...) FOR UPDATE;
   ```
2. **Database Engine Trigger:** A `BEFORE UPDATE` trigger (`trg_check_inventory_stock`) rejects any update that causes `current_stock < 0`.
3. **No Silent Clamping:** Application code is strictly forbidden from using `GREATEST(0, stock - qty)`. Insufficient stock must raise an explicit `409 Conflict` error to alert the cashier.

### Alternatives Considered
1. **Optimistic Locking (Version Column):** Rejected. If a cashier spends 45 seconds scanning items and an earlier cashier completes a sale, the entire cart would fail upon checkout, requiring re-scanning and causing angry retail queues.
2. **Application Memory Locks:** Rejected. Fails when Cloud Run scales horizontally to multiple container instances.

### Consequences
* **Positive:** Zero overselling; 100% accurate batch allocation; atomic ACID transactions guaranteeing consistency across invoice, batch deduction, movement ledger, and financial journals.
* **Negative:** Row locks hold connections for the duration of the database transaction (~20–40ms).
* **Mitigation:** Keep transaction boundaries minimal—perform external validation, tax derivation, and customer lookups *before* opening the lock transaction.

### Unresolved Questions
* Batch auto-selection policy (Strict FEFO [First Expiry, First Out] vs Cashier Manual Batch Selection) for barcode scanning workflows.

---

## ADR-008: Double-Entry Chart of Accounts and Balanced Journal Postings

### Context
Pharmacy owners need real-time insight into gross profit, net profit, cash drawer balances, customer Khata debt, and supplier liabilities. Simple "sales minus expenses" math ignores cost of goods sold (COGS), unpaid credit sales, and statutory GST output liabilities.

### Decision
Implement a core **Double-Entry Accounting Subsystem**:
1. Standard Chart of Accounts (Assets, Liabilities, Equity, Revenue, COGS, Expenses).
2. Every financial event generates an `accounting_journals` header and balanced `accounting_journal_entries` lines.
3. Database constraint trigger (`trg_check_journal_balance`) verifies that $\sum \text{Debits} == \sum \text{Credits}$ before committing.
4. Posted journals are immutable. Corrections must be executed via reversal entries or credit/debit notes.

### Alternatives Considered
1. **Single-Entry Cash Tracking:** Rejected. Fails to account for unpaid customer credit (Khata), pending distributor bills, or input tax credit (ITC).
2. **Relying Exclusively on External Software (Tally / Zoho Books):** Rejected. Pharmacists demand immediate daily cash-up, day-end gross profit reports, and customer ledger balances directly inside their POS without double data entry.

### Consequences
* **Positive:** Accurate mathematical separation:
  * $\text{Gross Profit} = \text{Net Revenue} - \text{COGS}$
  * $\text{Net Operating Profit} = \text{Gross Profit} - \text{Operating Expenses}$
  * Accurate GST liability tracking (Output CGST/SGST vs Input ITC).
* **Negative:** Requires strict accounting validation logic on every billing, procurement, and payment endpoint.
* **Mitigation:** Automate standard journal generation behind domain service facades (`BillingService`, `ProcurementService`).

### Unresolved Questions
* Standardizing default automated export formats for external Chartered Accountants (e.g., Tally XML vs Excel GL dump).

---

## ADR-009: Normalized Relational Junctions for Branch Authorization (No UUID Arrays)

### Context
In earlier architectural iterations, authorized branches for staff invitations and memberships were stored as PostgreSQL array columns (`branch_ids UUID[]`). Array columns prevent foreign key enforcement and violate relational normalization.

### Decision
Normalize all branch authorizations into dedicated relational junction tables:
1. `membership_branches`: `(tenant_id, membership_id, branch_id)` with composite foreign keys to both `tenant_memberships(tenant_id, id)` and `branches(tenant_id, id)`.
2. `invitation_branches`: `(tenant_id, invitation_id, branch_id)` with composite foreign keys to both `invitations(tenant_id, id)` and `branches(tenant_id, id)`.
* Completely eliminate all `UUID[]` branch arrays from the database schema.

### Alternatives Considered
1. **PostgreSQL Array Column with Custom Check Trigger:** Rejected. Does not support native `ON DELETE CASCADE/RESTRICT`, creates complex indexing overhead, and complicates SQL join queries for authorization checks.
2. **Single Branch per User (No Multi-Branch Staff):** Rejected. Multi-branch pharmacy owners frequently assign senior pharmacists and stock managers to oversee multiple physical outlets.

### Consequences
* **Positive:** Native database engine foreign key validation; prevents orphaned branch IDs if a branch is archived; enables fast indexed `JOIN` queries for branch-scoped permissions.
* **Negative:** Requires an extra join table insert during employee invitation and onboarding.

### Unresolved Questions
* Whether branch assignment should support branch-specific roles (e.g., Pharmacist at Branch 1, but Cashier at Branch 2) in Phase 3.

---

## ADR-010: Target Cloud Deployment Region (Google Cloud `asia-south1` Mumbai)

### Context
PharmaDesk serves Indian medical stores. Data sovereignty, compliance with the Indian Digital Personal Data Protection (DPDP) Act 2023, and low network latency for POS billing dictate cloud region selection.

### Decision
Deploy all cloud infrastructure components (Cloud Run, Cloud SQL PostgreSQL, Cloud Storage, and Cloud Armor) in **Google Cloud `asia-south1` (Mumbai)**.

### Alternatives Considered
1. **US / European Regions:** Rejected due to high round-trip network latency (180–250ms latency vs 20–35ms within India), which degrades counter checkout speed and introduces data sovereignty non-compliance under Indian healthcare data recommendations.
2. **Multi-Region Active-Active Deployment:** Rejected as premature over-engineering for Phase 1, incurring triple the hosting expenses without revenue justification.

### Consequences
* **Positive:** Sub-35ms round-trip latency to major Indian telecom networks (Jio, Airtel, Vi); 100% in-country data residency for customer health and financial records.
* **Negative:** If `asia-south1` suffers a total GCP facility failure, service remains offline until regional failover is executed.
* **Mitigation:** Daily multi-region backups stored in Google Cloud Storage Dual-Region (`asia1` - Mumbai + Delhi).

### Unresolved Questions
* Provisioning a secondary standby database in `asia-south2` (Delhi) for automated disaster recovery once the platform surpasses 1,000 active pharmacies.

---

## ADR-011: Point-in-Time Recovery (PITR) and Automated Restore Drill Strategy

### Context
A catastrophic database corruption, ransomware attack, or developer mistake could destroy pharmacy operational records. Vague promises of "zero downtime" or "zero data loss" are engineering fallacies. Realistic disaster recovery requires verifiable recovery metrics and automated testing.

### Decision
Establish explicit, verifiable recovery targets:
* **Recovery Point Objective (RPO):** $< 5 \text{ minutes}$ (guaranteed via Cloud SQL automated WAL transaction log archiving and Point-in-Time Recovery enabled for 7 days).
* **Recovery Time Objective (RTO):** $< 30 \text{ minutes}$ (target time to spin up a restored Cloud SQL instance and redirect Cloud Run environment variables).
* **Automated Monthly Restore Drill:** A scheduled Cloud Build workflow restores the latest backup to a transient sandbox instance, executes integrity queries (`SELECT COUNT(*) FROM sales_invoices`), and alerts the DevOps team on failure.

### Alternatives Considered
1. **Daily SQL Dumps Only (`pg_dump`):** Rejected. A crash at 8:00 PM would result in losing 12 hours of retail sales records (RPO = 24 hours), which is unacceptable for a commercial pharmacy.
2. **Synchronous Multi-Zone HA Instance for Pilot:** Deferred to Growth phase to preserve capital during pilot validation ($110/month vs $45/month baseline).

### Consequences
* **Positive:** Verifiable operational resilience; ability to restore the database to any exact second within the last 7 days; automated verification prevents silent backup corruption.
* **Negative:** WAL storage incurs minor Google Cloud Storage billing costs (~$5–$10/month).

### Unresolved Questions
* Defining customer communication protocols during an active RTO recovery window.

---

## ADR-012: Progressive Strangler-Fig Migration from Prototype LocalStorage to Cloud Persistence

### Context
The existing PharmaDesk prototype is an interactive React application running with in-memory/localStorage state (`src/context/PharmacyContext.tsx`) and sample data (`src/lib/sampleData.ts`). Migrating directly in a single "big-bang" pull request risks breaking working user workflows and halting product evaluation.

### Decision
Execute a **7-Stage Strangler-Fig Migration**:
1. Implement a **Dual-Mode Data Adapter** interface (`src/services/api/adapter.ts`) controlled by `VITE_DATA_SOURCE = 'mock' | 'cloud'`.
2. Migrate domains sequentially: Auth $\rightarrow$ Medicines $\rightarrow$ Inventory $\rightarrow$ Customers $\rightarrow$ Suppliers $\rightarrow$ Billing $\rightarrow$ Accounts.
3. Build a client-side Data Export utility allowing trial users to export their prototype `localStorage` data into normalized JSON for automated backend seeding.
4. Maintain the prototype UI fully intact and testable throughout development.

### Alternatives Considered
1. **Big-Bang Cutover:** Deleting `PharmacyContext.tsx` immediately and rewriting all components to call unfinished API endpoints. Rejected as it leaves the frontend in a broken, non-compiling state for weeks.
2. **Maintaining Two Completely Separate Git Repositories:** Rejected due to code divergence, merge conflicts, and loss of UI polish.

### Consequences
* **Positive:** Zero frontend regression; continuous integration and automated builds continue to pass on every commit; developers can switch between mock and cloud persistence instantly using an environment flag.
* **Negative:** Requires maintaining the adapter interface until all 7 stages complete.

### Unresolved Questions
* Automated schema migration tooling for importing unstructured legacy chemist Excel sheets into normalized `medicine_master` and `inventory_batches`.

---

## ADR-013: Firebase as Integrated Managed Services Layer with PostgreSQL as Authoritative Core

### Context
PharmaDesk requires managed identity verification (phone SMS OTP), client device attestation (reCAPTCHA bot defense), push notifications, edge static content delivery, and ephemeral real-time signals (such as live cashier presence at counter workstations). However, healthcare and pharmaceutical regulations in India demand strictly auditable, relational ACID transactions for billing, batch inventory, and financial ledgers.

### Decision
Adopt **Firebase as an integrated managed services layer**, while keeping **PostgreSQL 16 (Google Cloud SQL) as the sole and absolute source of truth** for all business transactions, inventory counts, financial ledgers, tenant memberships, and permissions.
* **Firebase Services Adopted:**
  1. **Firebase Authentication:** Managed identity provider for staff phone OTP and email credentials.
  2. **Firebase Admin SDK:** Server-side token verification in the Express backend.
  3. **Cloud Firestore:** Approved strictly for non-financial real-time operational data (counter workstation presence, draft terminal locks, live in-store alerts).
  4. **Firebase Cloud Messaging (FCM):** Push notifications for low stock, near-expiry alerts, and debt settlement notices.
  5. **Firebase App Check:** Client device attestation (reCAPTCHA Enterprise) against unauthorized bots and scrapers.
  6. **Firebase Analytics:** Anonymized, DPDP-compliant telemetry with zero patient health information (PHI) or drug identifiers.
  7. **Firebase Hosting:** Optional high-speed CDN delivery for static React assets with API rewrites to Cloud Run.
* **Strict Constraints:**
  - Critical transactional records (invoices, inventory stock, customer Khata, journal entries) must **never** be copied into Firestore.
  - Firebase Custom Claims must **never** be used as the authoritative source for pharmacy roles or permissions; PostgreSQL evaluates authorization server-side on every request.

### Alternatives Considered
1. **Full-Stack Firebase (Firestore as Primary Transactional Database):** Rejected. Firestore lacks native relational ACID foreign keys across multiple tables, lacks strict `NUMERIC(12, 2)` monetary precision, lacks PostgreSQL-style check triggers (`trg_check_inventory_stock`), and makes continuous sequential invoice numbering (`AMB-2425-001049`) prone to concurrency collisions and high read/write billing costs.
2. **Zero Firebase (Self-Hosted Auth, WebSockets, Self-Hosted Notifications):** Rejected. Building and maintaining self-hosted SMS OTP verification, WebSocket clustering, and mobile push notification servers increases infrastructure maintenance and baseline cloud costs unnecessarily.

### Consequences
* **Positive:** Combines the best of both architectures—high-reliability, Google-managed edge services (Auth, App Check, FCM, Hosting) with PostgreSQL's relational rigor, composite tenant isolation, and double-entry consistency.
* **Negative:** Developers must respect the service boundary and never attempt to mirror transactional data into Firestore.

### Unresolved Questions
* Establishing real-time presence heartbeat frequency (30s vs 60s) to balance freshness against Firestore write quotas.


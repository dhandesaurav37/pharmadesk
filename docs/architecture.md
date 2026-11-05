# PharmaDesk Cloud Architecture & System Topology

**Document Version:** 1.0.0  
**Target Environment:** Google Cloud Platform (GCP) — Region: `asia-south1` (Mumbai, India)  
**Classification:** Engineering Architecture & Operational Specification  

---

## 1. Executive Architecture Overview

PharmaDesk is a multi-tenant Software-as-a-Service (SaaS) pharmacy management platform designed specifically for independent medical stores, retail pharmacies, and multi-branch pharmacy chains in India. 

The architecture is structured as a **modular monolith** running on Node.js/TypeScript and Express, coupled with a React 19 single-page application (SPA) on Vite and Tailwind CSS. Centralized persistence is delivered by a managed relational PostgreSQL database on Google Cloud SQL, with Firebase Authentication providing tenant-scoped identity management and Google Cloud Storage managing encrypted document artifacts (e.g., digitized prescriptions, tax invoice PDFs, distributor invoices).

```
+-------------------------------------------------------------------------------------------------+
|                                    PHARMADESK CLIENT LAYER                                      |
|   +-----------------------------------------------------------------------------------------+   |
|   | Desktop Workstations / Tablets / POS Counters (Bandra Main Store, Pune Branch, etc.)    |   |
|   | React 19 + TypeScript + Vite + Tailwind CSS (Offline-Resilient Counter POS Cache)       |   |
|   +-----------------------------------------------------------------------------------------+   |
+----------------------------------------------+--------------------------------------------------+
                                               |
                                     HTTPS / WSS / TLS 1.3
                                               |
                                               v
+-------------------------------------------------------------------------------------------------+
|                               GOOGLE CLOUD RUN (asia-south1)                                    |
|   +-----------------------------------------------------------------------------------------+   |
|   | Cloud Run Service (Express + Node.js Modular Monolith)                                  |   |
|   |                                                                                         |   |
|   |   +--------------------+  +----------------------+  +-------------------------------+   |   |
|   |   | Security & CORS    |  | Tenant & Auth Context|  | RBAC & Permission Middleware  |   |   |
|   |   +--------------------+  +----------------------+  +-------------------------------+   |   |
|   |                                                                                         |   |
|   |   +---------------------------------------------------------------------------------+   |   |
|   |   | Domain Modules:                                                                 |   |   |
|   |   | [Billing/POS]  [Inventory/Batches]  [Medicines Master]  [Suppliers]             |   |   |
|   |   | [Customers]    [Purchases/Inward]   [Accounts/Ledger]   [Reports/GST]           |   |   |
|   |   +---------------------------------------------------------------------------------+   |   |
|   +------------------------------------------+----------------------------------------------+   |
+----------------------------------------------+--------------------------------------------------+
                                               |
                +------------------------------+------------------------------+
                | Private VPC Connection                                     | Signed URLs / HTTPS
                v                                                             v
+-----------------------------------------------+             +-----------------------------------+
|       CLOUD SQL POSTGRESQL (asia-south1)      |             |   CLOUD STORAGE (asia-south1)     |
|   +---------------------------------------+   |             |   (Private Encrypted Buckets)     |
|   | Multi-Tenant Relational Schema        |   |             |                                   |
|   | Row-Level Security (RLS)              |   |             |   - Prescription Scans (Rx)       |
|   | Transactional Stock Movements Ledger  |   |             |   - Form 20B/21B Licenses         |
|   | GST Tax Invoices & Customer Khata     |   |             |   - Purchase Order Invoices (PDF) |
|   | Automated Daily Snapshots & PITR WAL  |   |             |   - Thermal Bill Receipts         |
|   +---------------------------------------+   |             +-----------------------------------+
+-----------------------------------------------+
                ^
                | Token Verification / JWKS
+---------------+-------------------------------+
|         FIREBASE AUTHENTICATION               |
|   - Multi-Tenant Staff Credentials            |
|   - Mobile Phone OTP & Email/Password         |
|   - Custom Claims: { tenant_id, role, etc. }  |
+-----------------------------------------------+
```

---

## 2. Core Architectural Principles

1. **Multi-Tenant SaaS with Strict Data Isolation:**
   - Every pharmacy business is an isolated `tenant`.
   - Data isolation is enforced at the application middleware layer and reinforced at the database layer using PostgreSQL Row-Level Security (RLS).
   - Under no circumstance can a query from Tenant A access, mutate, or inspect data belonging to Tenant B.

2. **Branch-Level Granularity:**
   - A single pharmacy tenant can operate multiple retail physical branches (e.g., Main Store, Hospital Branch).
   - Employees are bound to one or more branches. Billing, inventory batches, and cash drawers are tracked on a per-branch basis, while medicine master directories and customer records can be shared across branches within the same tenant.

3. **Data Integrity & Immutability:**
   - **Monetary Precision:** All currency amounts, taxes, discounts, and margins use `NUMERIC(12, 2)` or `NUMERIC(14, 4)` in PostgreSQL. Floating-point numbers (`FLOAT`/`DOUBLE PRECISION`) are prohibited.
   - **Batch-Level Inventory:** Inventory is tracked strictly at the formulation batch level (`batch_number`, `expiry_date`, `pack_size`, `ptr`, `mrp`).
   - **Immutable Sales Invoices:** Once an invoice is generated and issued, it is immutable. Corrections must be handled via formal Sales Returns (`sales_returns`) or Credit Notes with an audit trail.
   - **Stock Movement Ledger:** Physical stock changes are recorded as atomic ledger movements (`stock_movements`), ensuring that physical stock equals the sum of ledger events.
   - **Negative Inventory Prevention:** Transactional checks prevent dispensing stock when inventory is insufficient.

4. **Zero-Trust Administrative Boundary:**
   - Platform Super-Administrators (PharmaDesk DevOps/Support) do not possess blanket access to pharmacy patient health records, customer Khatas, or drug registers without explicit customer consent and audited temporary session access.

---

## 3. Component Responsibilities

### 3.1 Frontend Layer (Single Page Application)
- **Framework:** React 19, TypeScript, Vite, Tailwind CSS 4.
- **Responsibilities:**
  - Fast, responsive user experience optimized for desktop billing counters, tablets, and mobile devices.
  - Keyboard-first POS interface (e.g., `F2` quick search, barcode scanner integration, `Enter` to finalize invoice).
  - Client-side input validation, error messaging, and form handling.
  - Receipt and thermal invoice formatting (80mm thermal rolls and standard A4 tax invoices).
  - Secure storage of session credentials via HTTP-only cookies or memory-stored JWTs.

### 3.2 Backend Layer (Modular Monolith)
- **Framework:** Node.js, TypeScript, Express.
- **Responsibilities:**
  - Authentication token verification (Firebase Admin SDK).
  - Tenant context injection into execution context (AsyncLocalStorage / Request object).
  - Business logic orchestration:
    - Atomically committing POS invoices and decrementing batch stock.
    - Statutory validation for Schedule H / H1 / X drugs (mandatory doctor name, registration number).
    - Supplier purchase inwarding, PTR/MRP margin calculations, and tax credit tracking.
    - Customer Khata balance calculations and payment settlement.
  - Database connection pooling via `pg` (node-postgres) with statement timeouts.
  - Audit logging for regulatory inspections by State Drug Controllers / FDA inspectors.

### 3.3 Database Layer (PostgreSQL on Cloud SQL)
- **Engine:** PostgreSQL 16 on Google Cloud SQL (Enterprise Edition).
- **Responsibilities:**
  - Relational integrity enforced via foreign keys (`ON DELETE RESTRICT` for financial and inventory safety).
  - Transaction isolation (`READ COMMITTED` default, `SERIALIZABLE` or pessimistic locking `SELECT ... FOR UPDATE` during high-velocity checkout).
  - Row-Level Security (RLS) enforcement on all tenant tables using session variables (`SET LOCAL app.current_tenant_id = '...'`).
  - Strict UTC timestamp recording (`TIMESTAMPTZ DEFAULT clock_timestamp()`).

### 3.4 Authentication Layer (Firebase Authentication)
- **Responsibilities:**
  - User identity lifecycle: Phone OTP authentication (crucial for Indian retail pharmacy staff) and email/password authentication.
  - Password hashing and multi-factor authentication (MFA).
  - Custom claims injection (`tenant_id`, `branch_id`, `role`, `user_id`) into ID tokens.
  - Session revocation and token rotation.

### 3.5 Storage Layer (Google Cloud Storage)
- **Responsibilities:**
  - Encrypted, secure storage for digital prescription scans (Rx), supplier purchase invoices (PDF/TIFF), and compliance certificates (Form 20B/21B copies).
  - Access controlled through short-lived signed URLs generated by the backend API.

---

## 4. Request & Response Lifecycle

```
[Workstation Browser / POS Client]
        |
        | 1. HTTPS POST /api/v1/billing/invoices (Bearer JWT + Tenant Header)
        v
[Google Cloud Run Entry Point]
        |
        | 2. Rate Limiter & Security Headers Middleware (Helmet, CORS)
        v
[Authentication Middleware]
        |
        | 3. Verify Firebase ID Token via Admin SDK
        |    Extract uid, tenant_id, role, branch_id
        v
[Tenant & Branch Context Middleware]
        |
        | 4. Validate user membership in tenant_memberships
        |    Attach tenant context: req.context = { tenantId, branchId, userId, permissions }
        v
[RBAC Authorization Middleware]
        |
        | 5. Verify req.context has required permission: "billing:create_invoice"
        v
[Zod Schema Validation Middleware]
        |
        | 6. Validate request payload (items, batch_id, quantities, payment_mode)
        v
[Domain Service: BillingService.createInvoice()]
        |
        | 7. Begin PostgreSQL Transaction
        |    SET LOCAL app.current_tenant_id = req.context.tenantId;
        |    SELECT stock FROM inventory_batches WHERE id IN (...) FOR UPDATE;
        |    Validate non-negative stock and expiration;
        |    INSERT INTO sales_invoices ...;
        |    INSERT INTO sales_invoice_items ...;
        |    INSERT INTO stock_movements (type = 'DISPENSE', ...);
        |    UPDATE inventory_batches SET current_stock = current_stock - quantity;
        |    INSERT INTO customer_ledger (if Khata credit);
        |    INSERT INTO payments ...;
        |    COMMIT Transaction;
        v
[Audit Logger]
        | 8. Emit structured audit log to stdout (Cloud Logging)
        v
[Response Dispatcher]
        | 9. Return HTTP 201 Created with standardized invoice response envelope
        v
[Workstation Client Receives Invoice & Triggers Thermal Print]
```

---

## 5. Pharmacy Tenant Isolation Architecture

### 5.1 Logical Isolation Pattern
PharmaDesk utilizes a **Shared Database, Shared Schema with Row-Level Security** multi-tenant isolation pattern. This approach is optimal for SaaS pharmacy management platforms scaling to tens of thousands of independent stores, avoiding the connection pooling and migration overhead of database-per-tenant or schema-per-tenant architectures while maintaining strict logical boundaries.

### 5.2 Defense-in-Depth Isolation Layers
Data isolation is guaranteed across three independent operational boundaries:

1. **Routing & Context Boundary (Middleware):**
   Every incoming request requires a valid Firebase JWT. The JWT custom claims contain `tenant_id`. The backend checks that the `tenant_id` exists, is active, and matches the URL context.
2. **Repository Boundary (Application Code):**
   All SQL query builders must explicitly include `WHERE tenant_id = $tenantId`. Developers cannot query tables without providing the active tenant identifier.
3. **Database Row-Level Security (PostgreSQL RLS):**
   Even if an application code defect omits a `WHERE tenant_id` clause, PostgreSQL enforces row filtering at the kernel level.
   
```sql
-- PostgreSQL RLS Configuration Example
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON sales_invoices
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);
```

At the beginning of every pooled database transaction, the Express backend executes:
```sql
SET LOCAL app.current_tenant_id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
```
When the transaction terminates, the session setting is cleared.

---

## 6. Branch-Level Access Model

PharmaDesk supports multi-branch operations (e.g., central pharmacy + branch dispensaries):

1. **Tenant-Level Master Data (Shared across branches):**
   - Medicine Master formulary (`medicine_master`)
   - Customer master profiles (`customers`)
   - Supplier master directory (`suppliers`)
   - Global pharmacy settings and licenses (`tenants`)
2. **Branch-Level Operational Data (Isolated per branch):**
   - Inventory batches on racks (`inventory_batches`)
   - Physical rack locations (`rack_location`)
   - Counter sales invoices (`sales_invoices`)
   - Daily cash drawers & shift registers (`accounts`)
   - Goods receipts from stockists (`goods_receipts`)
3. **Staff Branch Assignment:**
   - Employees are granted access to specific branch IDs via `tenant_memberships.branch_ids`.
   - Store owners hold wildcard access (`*`) across all branches.
   - Cashiers and pharmacists are constrained to their active branch terminal session.

---

## 7. Cloud Deployment Topology (GCP `asia-south1`)

```
                          [ Internet Users / Pharmacists ]
                                         |
                                         v
                      [ Cloud Load Balancing (HTTPS / SSL) ]
                                         |
                       +-----------------+-----------------+
                       |                                   |
                       v                                   v
             [ Cloud CDN (Static Assets) ]        [ Google Cloud Run ]
             - index.html, JS, CSS bundles        - Express Backend Monolith
             - Hosted on Cloud Storage bucket     - Min instances: 1 (zero cold start)
                                                  - Max instances: 20 (auto-scaled)
                                                  - Concurrency: 80 per instance
                                                           |
                                      +--------------------+--------------------+
                                      | Serverless VPC Access Connector         |
                                      v                                         v
                         [ Cloud SQL PostgreSQL ]                   [ Private Cloud Storage ]
                         - db-custom-4-16384 (4 vCPU, 16GB)         - Encrypted documents (KMS)
                         - Private IP only (no public IP)           - Multi-regional within India
                         - Automated backups (7-day PITR)           - Pre-signed URL uploads
                         - Dedicated SSD (Auto-expanding)
```

### 7.1 Infrastructure Specifications
- **Cloud Run Service:**
  - CPU: 2 vCPU per container.
  - Memory: 2 GB RAM.
  - Autoscaling: Minimum 1 instance (to prevent cashier latency during morning opening hours), scaling dynamically up to 20 instances during peak evening hours (5:00 PM – 10:00 PM IST).
- **Cloud SQL PostgreSQL:**
  - Machine Type: `db-custom-4-16384` (4 vCPU, 16 GB RAM).
  - Storage: 100 GB SSD with automatic storage increase enabled.
  - High Availability (HA): Regional dual-zone failover within `asia-south1` (Zone A primary, Zone B standby).
  - Network Security: Private IP only attached via Serverless VPC Access Connector. Public internet access is disabled.

---

## 8. Backup & Disaster Recovery Strategy

1. **Automated Cloud SQL Snapshots:**
   - Daily snapshots captured automatically at 02:30 IST (low-traffic window).
   - Retained for 30 rolling days.
2. **Point-In-Time Recovery (PITR):**
   - PostgreSQL Write-Ahead Logging (WAL) archiving enabled with 7-day granularity.
   - Enables restoring the database to any exact second within the prior 7 days in the event of accidental data corruption or logical failure.
3. **Cross-Region Coldline Backups:**
   - Weekly encrypted database dumps (`pg_dump`) exported to an encrypted Cloud Storage Coldline bucket.
   - Immutable Object Locking (WORM) enabled for 1 year to satisfy regulatory audit requirements of the Central Drugs Standard Control Organization (CDSCO) and GST authorities.
4. **Recovery Time Objective (RTO) & Recovery Point Objective (RPO):**
   - **RTO (Target Recovery Time):** $< 30\text{ minutes}$ for failover; $< 2\text{ hours}$ for catastrophic recovery from backup.
   - **RPO (Maximum Data Loss Window):** $< 5\text{ minutes}$ via WAL streaming.

---

## 9. Security Boundaries & Compliance

1. **Transport Security:** All traffic enforces TLS 1.3 with HSTS headers.
2. **Authentication Security:**
   - Passwords managed exclusively by Firebase Auth (bcrypt/scrypt).
   - Rate limiting on authentication and OTP endpoints using Cloud Armor and backend Redis/memory rate-limiters.
3. **Input Sanitization & Injection Prevention:**
   - All client inputs validated via strict Zod schemas before reaching service logic.
   - All SQL operations utilize parameterized queries (`$1, $2, ...`). Dynamic raw string concatenation in SQL is prohibited.
4. **Data Encryption:**
   - In-Transit: TLS 1.3 across all communication channels.
   - At-Rest: Google-managed encryption keys (FIPS 140-2 validated) across Cloud SQL and Cloud Storage disks.
5. **Separation of Platform Superadmin:**
   - Platform administration accounts have no direct access to pharmacy records.
   - Customer support impersonation requires customer-generated one-time support access tokens valid for maximum 60 minutes and logged in immutable security audit logs.

---

## 10. Observability, Logging & Error Handling

1. **Structured JSON Logging:**
   All logs are emitted to standard output in structured JSON matching the Google Cloud Logging schema:
   ```json
   {
     "severity": "INFO",
     "timestamp": "2026-11-05T09:30:00.123Z",
     "tenantId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
     "userId": "usr_99184",
     "route": "/api/v1/billing/invoices",
     "method": "POST",
     "statusCode": 201,
     "durationMs": 48.2,
     "message": "Invoice AMB-2026-1049 generated successfully"
   }
   ```
2. **Error Standards (RFC 7807):**
   All error responses follow the RFC 7807 Problem Details standard:
   ```json
   {
     "type": "https://pharmadesk.in/errors/insufficient-stock",
     "title": "Insufficient Stock Available",
     "status": 409,
     "detail": "Requested 5 units of Augmentin 625 Duo (Batch AG-7102), but only 2 units remain in stock.",
     "instance": "/api/v1/billing/invoices",
     "code": "STOCK_EXHAUSTED",
     "timestamp": "2026-11-05T09:30:00Z"
   }
   ```
3. **Metric Alerts:**
   - HTTP 5xx error rate $> 1\%$ for 5 minutes $\rightarrow$ PagerDuty / SMS alert to on-call engineer.
   - Cloud SQL CPU utilization $> 80\%$ for 10 minutes $\rightarrow$ Auto-scaling advisory alert.
   - Database connection pool exhaustion alerts.

---

## 11. Environment Isolation Strategy

| Dimension | Local Development | Staging (`staging.pharmadesk.in`) | Production (`app.pharmadesk.in`) |
| :--- | :--- | :--- | :--- |
| **GCP Project** | `pharmadesk-dev-local` | `pharmadesk-staging` | `pharmadesk-prod-in` |
| **Cloud SQL** | Local Docker PostgreSQL 16 | db-custom-2-7680 (Single Zone) | db-custom-4-16384 (Regional HA) |
| **Firebase Auth** | Firebase Auth Emulator | Staging Firebase Project | Production Firebase Project |
| **GCS Storage** | Local filesystem / Mock | Staging Cloud Storage Bucket | Dedicated Encrypted Production Buckets |
| **Domain Data** | Seeded test medical store | Anonymized test stores | Live customer pharmacy records |
| **Deployment** | `npm run dev` | Auto-deploy on merge to `main` | Git release tag trigger + Manual approval |

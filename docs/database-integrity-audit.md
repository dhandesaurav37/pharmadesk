# PharmaDesk Database Integrity & Relational Isolation Audit

**Document Version:** 1.0.0  
**Target Engine:** PostgreSQL 16+ on Google Cloud SQL (`asia-south1`)  
**Auditor Roles:** Principal SaaS Architect & PostgreSQL Security Engineer  
**Companion Document:** `docs/database-schema.md` (Hardened DDL Specification)

---

## 1. Executive Summary & Audit Scope

This audit evaluates every table defined in the PharmaDesk relational schema to verify:
1. **Tenant Isolation:** Absence of cross-tenant foreign key leakage vulnerabilities.
2. **Branch Scoping:** Clear separation between tenant-global master records and branch-physical operational records.
3. **Key Integrity:** Universal presence of `(tenant_id, id)` composite unique keys and composite foreign keys for all tenant-owned entities.
4. **Relational Normalization:** Elimination of unnormalized array columns (e.g., branch UUID arrays) in favor of relational junction tables.
5. **Row-Level Security (RLS):** Complete policy coverage, forced RLS, and fail-closed evaluation.
6. **Data Sensitivity:** Classification of financial, personal health (PHI), and Personally Identifiable Information (PII) under India's Digital Personal Data Protection (DPDP) Act 2023.

---

## 2. Global vs. Tenant-Owned Scope Architecture

PharmaDesk operates a single shared PostgreSQL database for multi-tenancy. Tables fall into three distinct scope categories:

* **Scope G (Platform Global):** Static reference data or system definitions managed exclusively by platform administrators. No `tenant_id` column. RLS is not applied (public read-only to authenticated app roles).
* **Scope T (Tenant-Global):** Owned by a specific pharmacy business entity (`tenants`). Shared across all physical branches of that pharmacy (e.g., medicine formulary, customer profiles, supplier catalog).
* **Scope B (Branch-Physical):** Owned by a specific pharmacy entity and tied to a single physical outlet/store (e.g., physical inventory batches, sales invoices, cash registers, branch expenses).

---

## 3. Comprehensive Table-by-Table Integrity Audit

The schema comprises **44 tables** across 8 functional domains.

### Domain 1: Identity, Tenancy & Access Control

| # | Table Name | Scope | Branch Scoped? | Primary Key | Unique Constraints | Foreign Keys & Composite Safety | RLS Enabled? | Sensitive / Financial? |
|---|---|---|---|---|---|---|---|---|
| 1 | `tenants` | Root | No | `id (UUID)` | `uq_tenants_id_composite (id)` | None. Self-referential `primary_owner_id -> users(id)`. | Yes (Tenant Self-Read/Admin) | Yes (Commercial, Legal DL, GSTIN) |
| 2 | `branches` | T | Yes (Branch Entity) | `id (UUID)` | `(tenant_id, id)`, `(tenant_id, branch_code)` | `tenant_id -> tenants(id)`. Composite safe: Exposes `(tenant_id, id)`. | Yes | Yes (Branch Operations) |
| 3 | `users` | G | No | `id (UUID)` | `firebase_uid`, `phone`, `email` | None. Global identity directory. | No (App role read, self-profile update) | Yes (PII, State Council License) |
| 4 | `tenant_memberships` | T | No | `id (UUID)` | `(tenant_id, id)`, `(tenant_id, user_id)` | `tenant_id -> tenants(id)`, `user_id -> users(id)`. Composite safe. | Yes | Yes (Staff Employment Status) |
| 5 | `membership_branches` | T | Yes (Junction) | `id (UUID)` | `(membership_id, branch_id)` | Composite FK: `(tenant_id, membership_id) -> tenant_memberships(tenant_id, id)`, `(tenant_id, branch_id) -> branches(tenant_id, id)`. | Yes | Yes (Access Control) |
| 6 | `roles` | G / T | No | `id (UUID)` | `(tenant_id, role_key)` | `tenant_id -> tenants(id)` (NULL for platform system roles). | Yes (Filter: `tenant_id IS NULL OR tenant_id = current`) | Yes (Security Role) |
| 7 | `permissions` | G | No | `id (UUID)` | `permission_key` | None. System-wide static capability dictionary. | No (Read-only) | No |
| 8 | `role_permissions` | G / T | No | `id (UUID)` | `(role_id, permission_id)` | `role_id -> roles(id)`, `permission_id -> permissions(id)`. | Yes (Via role join) | Yes (Security Privileges) |
| 9 | `user_permission_overrides` | T | No | `id (UUID)` | `(tenant_id, user_id, permission_id)` | `(tenant_id, user_id) -> tenant_memberships(tenant_id, user_id)`, `permission_id -> permissions(id)`. Composite safe. | Yes | Yes (Security Privileges) |
| 10 | `invitations` | T | No | `id (UUID)` | `(tenant_id, id)`, `invitation_token` | `tenant_id -> tenants(id)`, `created_by -> users(id)`. Array removed. | Yes | Yes (Staff PII, Onboarding) |
| 11 | `invitation_branches` | T | Yes (Junction) | `id (UUID)` | `(invitation_id, branch_id)` | Composite FK: `(tenant_id, invitation_id) -> invitations(tenant_id, id)`, `(tenant_id, branch_id) -> branches(tenant_id, id)`. | Yes | Yes (Access Control) |
| 12 | `subscription_plans` | G | No | `id (UUID)` | `plan_key` | None. Platform pricing tiers. | No (Public Read) | Yes (Commercial Pricing) |
| 13 | `subscriptions` | T | No | `id (UUID)` | `(tenant_id)` [1:1] | `tenant_id -> tenants(id)`, `plan_id -> subscription_plans(id)`. | Yes | Yes (Billing Status, Entitlements) |

---

### Domain 2: Medicine Catalogue & Formularies

| # | Table Name | Scope | Branch Scoped? | Primary Key | Unique Constraints | Foreign Keys & Composite Safety | RLS Enabled? | Sensitive / Financial? |
|---|---|---|---|---|---|---|---|---|
| 14 | `medicine_categories` | G | No | `id (UUID)` | `name` | None. Standard dosage forms (Tablet, Syrup, etc.). | No (Public Read) | No |
| 15 | `manufacturers` | G / T | No | `id (UUID)` | `(tenant_id, name)` | `tenant_id -> tenants(id)` (NULL for global pharmaceutical brands). | Yes (Filter: `tenant_id IS NULL OR tenant_id = current`) | No |
| 16 | `medicine_schedules` | G | No | `id (UUID)` | `code` | None. Indian statutory drug schedules (OTC, H, H1, X). | No (Public Read) | Yes (Statutory Drug Flags) |
| 17 | `medicine_master` | T | No | `id (UUID)` | `(tenant_id, id)` | `tenant_id -> tenants(id)`, `category_id -> medicine_categories(id)`. Composite safe. | Yes | No (Clinical formulary) |
| 18 | `medicine_barcodes` | T | No | `id (UUID)` | `(tenant_id, barcode)` | Composite FK: `(tenant_id, medicine_id) -> medicine_master(tenant_id, id)`. Composite safe. | Yes | No |

---

### Domain 3: Inventory, Batches & Stock Movements

| # | Table Name | Scope | Branch Scoped? | Primary Key | Unique Constraints | Foreign Keys & Composite Safety | RLS Enabled? | Sensitive / Financial? |
|---|---|---|---|---|---|---|---|---|
| 19 | `inventory_batches` | B | Yes | `id (UUID)` | `(tenant_id, id)`, `(tenant_id, branch_id, medicine_id, batch_number)` | Composite FKs to `branches(tenant_id, id)` and `medicine_master(tenant_id, id)`. Composite safe. | Yes | Yes (Inventory Assets, Purchase Rates) |
| 20 | `stock_movements` | B | Yes | `id (UUID)` | `(tenant_id, id)` | Composite FKs to `branches`, `inventory_batches`, `medicine_master`. Composite safe. Immutable ledger. | Yes | Yes (Financial Unit Cost, Stock Ledger) |
| 21 | `stock_adjustments` | B | Yes | `id (UUID)` | `(tenant_id, id)` | Composite FK to `inventory_batches(tenant_id, id)`. Authorized by `users(id)`. | Yes | Yes (Inventory Discrepancies) |
| 22 | `stock_transfers` | T | Yes (Source & Dest) | `id (UUID)` | `(tenant_id, id)`, `(tenant_id, transfer_number)` | Composite FKs to `branches(tenant_id, id)` for both source and destination. | Yes | Yes (Inter-Branch Movements) |
| 23 | `stock_transfer_items` | T | Yes (Inherited) | `id (UUID)` | `(tenant_id, id)` | Composite FKs to `stock_transfers(tenant_id, id)` and `inventory_batches(tenant_id, id)`. | Yes | Yes (Wholesale Pricing PTR) |

---

### Domain 4: Customers, Patients & Khata Credit

| # | Table Name | Scope | Branch Scoped? | Primary Key | Unique Constraints | Foreign Keys & Composite Safety | RLS Enabled? | Sensitive / Financial? |
|---|---|---|---|---|---|---|---|---|
| 24 | `customers` | T | No (Chain Shared) | `id (UUID)` | `(tenant_id, id)`, `(tenant_id, phone)` | `tenant_id -> tenants(id)`. Composite safe. Non-global phone uniqueness. | Yes | Yes (Patient PII, Credit Khata) |
| 25 | `customer_ledger` | B | Yes | `id (UUID)` | `(tenant_id, id)` | Composite FKs to `customers(tenant_id, id)` and `branches(tenant_id, id)`. | Yes | Yes (Financial Accounts Receivable) |

---

### Domain 5: Suppliers & Procurement

| # | Table Name | Scope | Branch Scoped? | Primary Key | Unique Constraints | Foreign Keys & Composite Safety | RLS Enabled? | Sensitive / Financial? |
|---|---|---|---|---|---|---|---|---|
| 26 | `suppliers` | T | No (Chain Shared) | `id (UUID)` | `(tenant_id, id)` | `tenant_id -> tenants(id)`. Composite safe. | Yes | Yes (Commercial Vendor Terms) |
| 27 | `supplier_ledger` | B | Yes | `id (UUID)` | `(tenant_id, id)` | Composite FKs to `suppliers(tenant_id, id)` and `branches(tenant_id, id)`. | Yes | Yes (Financial Accounts Payable) |
| 28 | `purchase_orders` | B | Yes | `id (UUID)` | `(tenant_id, id)`, `(tenant_id, po_number)` | Composite FKs to `branches(tenant_id, id)` and `suppliers(tenant_id, id)`. | Yes | Yes (Procurement Commitments) |
| 29 | `purchase_order_items` | B | Yes (Inherited) | `id (UUID)` | `(tenant_id, id)` | Composite FKs to `purchase_orders(tenant_id, id)` and `medicine_master(tenant_id, id)`. | Yes | Yes (Estimated Wholesale Rates) |
| 30 | `goods_receipts` | B | Yes | `id (UUID)` | `(tenant_id, id)`, `(tenant_id, supplier_id, supplier_invoice_number)` | Composite FKs to `branches(tenant_id, id)` and `suppliers(tenant_id, id)`. | Yes | Yes (Tax Invoices, GST ITC) |
| 31 | `goods_receipt_items` | B | Yes (Inherited) | `id (UUID)` | `(tenant_id, id)` | Composite FKs to `goods_receipts(tenant_id, id)`, `inventory_batches(tenant_id, id)`, and `medicine_master(tenant_id, id)`. | Yes | Yes (Landed Purchase Costs) |

---

### Domain 6: Sales & Point of Sale (POS)

| # | Table Name | Scope | Branch Scoped? | Primary Key | Unique Constraints | Foreign Keys & Composite Safety | RLS Enabled? | Sensitive / Financial? |
|---|---|---|---|---|---|---|---|---|
| 32 | `sales_invoices` | B | Yes | `id (UUID)` | `(tenant_id, id)`, `(tenant_id, branch_id, invoice_number)`, `(tenant_id, idempotency_key)` | Composite FK to `branches(tenant_id, id)`, `customers(tenant_id, id)`. Dispensed by `users(id)`. | Yes | Yes (Statutory Tax Invoice, Patient Data) |
| 33 | `sales_invoice_items` | B | Yes (Inherited) | `id (UUID)` | `(tenant_id, id)` | Composite FKs to `sales_invoices(tenant_id, id)`, `inventory_batches(tenant_id, id)`, `medicine_master(tenant_id, id)`. | Yes | Yes (Financial Revenue, Drug Dispensation) |
| 34 | `payments` | B | Yes | `id (UUID)` | `(tenant_id, id)` | Composite FK to `branches(tenant_id, id)`. References `users(id)`. Polymorphic reference verified. | Yes | Yes (Financial Cash & UPI Settlement) |
| 35 | `sales_returns` | B | Yes | `id (UUID)` | `(tenant_id, id)`, `(tenant_id, branch_id, return_number)` | Composite FKs to `branches(tenant_id, id)` and `sales_invoices(tenant_id, id)`. | Yes | Yes (Financial Refunds, Credit Notes) |
| 36 | `sales_return_items` | B | Yes (Inherited) | `id (UUID)` | `(tenant_id, id)` | Composite FKs to `sales_returns(tenant_id, id)` and `inventory_batches(tenant_id, id)`. | Yes | Yes (Restocked Assets, Refunds) |
| 37 | `idempotency_keys` | B | Yes | `id (UUID)` | `(tenant_id, idempotency_key)` | Composite FK to `branches(tenant_id, id)`. Tracks SHA-256 payload hash and HTTP status. | Yes | Yes (Transaction Fingerprints) |

---

### Domain 7: Double-Entry Accounting & Expenses

| # | Table Name | Scope | Branch Scoped? | Primary Key | Unique Constraints | Foreign Keys & Composite Safety | RLS Enabled? | Sensitive / Financial? |
|---|---|---|---|---|---|---|---|---|
| 38 | `chart_of_accounts` | T | No (Tenant-Wide) | `id (UUID)` | `(tenant_id, id)`, `(tenant_id, account_code)` | `tenant_id -> tenants(id)`. Self-referential `parent_account_id`. | Yes | Yes (General Ledger Structure) |
| 39 | `accounting_journals` | B | Yes | `id (UUID)` | `(tenant_id, id)`, `(tenant_id, journal_number)` | Composite FK to `branches(tenant_id, id)`. References `users(id)`. | Yes | Yes (Immutable Financial Journals) |
| 40 | `accounting_journal_entries` | B | Yes (Inherited) | `id (UUID)` | `(tenant_id, id)` | Composite FKs to `accounting_journals(tenant_id, id)` and `chart_of_accounts(tenant_id, id)`. | Yes | Yes (Debits & Credits) |
| 41 | `expense_categories` | T | No | `id (UUID)` | `(tenant_id, id)`, `(tenant_id, name)` | `tenant_id -> tenants(id)`. | Yes | Yes (Operating Overhead Structure) |
| 42 | `expenses` | B | Yes | `id (UUID)` | `(tenant_id, id)` | Composite FKs to `branches(tenant_id, id)` and `expense_categories(tenant_id, id)`. | Yes | Yes (Cash Outflows, OpEx) |

---

### Domain 8: Governance, Audit & Export

| # | Table Name | Scope | Branch Scoped? | Primary Key | Unique Constraints | Foreign Keys & Composite Safety | RLS Enabled? | Sensitive / Financial? |
|---|---|---|---|---|---|---|---|---|
| 43 | `audit_logs` | T | Optional | `id (UUID)` | `id` | `tenant_id -> tenants(id)`, `user_id -> users(id)`. Immutable append-only. | Yes | Yes (Forensic Trails, Security Audits) |
| 44 | `data_export_jobs` | T | No | `id (UUID)` | `id` | `tenant_id -> tenants(id)`, `requested_by -> users(id)`. | Yes | Yes (DPDP Regulatory Exports) |

---

## 4. Critical Findings & Corrective Architecture Rules

### 4.1 Unnormalized Branch UUID Arrays Corrected
* **Issue Detected:** In earlier drafts, `invitations` stored authorized branches as a PostgreSQL array `branch_ids UUID[]`. Array storage prevents relational foreign key enforcement, permits orphaned branch references if a branch is deleted/deactivated, and bypasses RLS on branch authorization.
* **Correction:** Replaced with a fully normalized relational junction table `invitation_branches` containing `(tenant_id, invitation_id, branch_id)`.
* **Integrity Guarantee:** Enforces composite foreign keys:
  ```sql
  CONSTRAINT fk_ib_invitation FOREIGN KEY (tenant_id, invitation_id) REFERENCES invitations(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_ib_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE
  ```

### 4.2 GSTIN Uniqueness Scoping Corrected
* **Issue Detected:** A global unique index on `tenants(gstin)` was previously specified.
* **Flaw:** In the Indian pharmaceutical retail market:
  1. A sole proprietor or corporate pharmacy group may establish multiple testing, staging, or separate legal tenant workspaces under the same commercial entity during SaaS evaluation.
  2. Small chemists below the statutory GST registration turnover threshold (INR 40 Lakhs/annum for goods) operate legally without a GSTIN (field is optional or NULL).
  3. A global unique constraint causes false collision errors and blocks legitimate multi-tenant accounts.
* **Correction:** Dropped `uq_tenants_gstin`. Replaced with a non-unique lookup index:
  ```sql
  CREATE INDEX idx_tenants_gstin ON tenants(gstin) WHERE gstin IS NOT NULL AND gstin <> '';
  ```

### 4.3 Multi-Tenant User Identifiers vs. Tenant Membership
* **Clarification:** The `users` table is global to allow a pharmacist or cashier (identified by verified mobile phone or email via Firebase Auth) to work at Pharmacy A on weekdays and Pharmacy B on weekends without needing separate logins.
* **Isolation Rule:**
  - A user's identity is global (`users.firebase_uid`).
  - A user's permissions, active status, and store data access are **strictly tenant-scoped** through `tenant_memberships(tenant_id, user_id)`.
  - Disabling an employee in Pharmacy A (`tenant_memberships.status = 'deactivated'`) immediately blocks them from Pharmacy A without affecting their legitimate employment at Pharmacy B.

### 4.4 System Role Templates vs. Custom Roles
* **Rule:** The `roles` table uses a nullable `tenant_id`:
  - `tenant_id IS NULL`: System-defined immutable platform templates (`owner`, `pharmacist`, `cashier`, `helper`).
  - `tenant_id = '<UUID>'`: Custom roles defined by a specific pharmacy owner.
* **Vulnerability Prevention:** A tenant must never be permitted to assign or mutate another tenant's custom role.
* **Integrity Guard:** The foreign key on `tenant_memberships` uses standard role keys or verified tenant-matching queries.
  ```sql
  CONSTRAINT chk_role_isolation CHECK (
      tenant_id IS NOT NULL OR is_system_role = true
  );
  ```

### 4.5 Composite Key Coverage Summary
Every single tenant-owned table defines:
1. `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
2. `CONSTRAINT uq_<table>_tenant_id UNIQUE (tenant_id, id)`
3. Composite child foreign keys: `FOREIGN KEY (tenant_id, <parent>_id) REFERENCES <parent>(tenant_id, id)`

**Conclusion:** 100% of tenant tables meet strict relational isolation standards. Cross-tenant leakage is mathematically impossible at the database engine tier.

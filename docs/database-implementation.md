# PharmaDesk PostgreSQL Database & Multi-Tenant Implementation

**Document Version:** 2.0.0 (Phase 2 Completed)  
**Target Engine:** PostgreSQL 16+ on Google Cloud SQL (`asia-south1`)  
**Design Standard:** 3NF Normalized Relational Architecture with Row-Level Security (RLS)  
**Primary Key Standard:** UUID v4 (`gen_random_uuid()`)  
**Monetary Standard:** Strict `NUMERIC(12, 2)` (Floating-point strictly disallowed)  
**Driver:** Node.js `pg` connection pool with SQL-first migrations

---

## 1. Architectural Boundary & Dual-Tier Data Responsibility

PharmaDesk operates a hardened multi-tenant architecture designed specifically for Indian retail medical stores and multi-branch pharmacy chains:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           CLIENT APPLICATIONS                             │
│                  Web POS / Tablet / Mobile Pharmacist PWA                 │
└─────────────────────┬───────────────────────────────┬─────────────────────┘
                      │                               │
        Real-Time Presence / Locks             HTTPS / REST API
                      │                               │
                      ▼                               ▼
     ┌─────────────────────────────────┐   ┌────────────────────────────────┐
     │    FIREBASE INTEGRATION TIER    │   │      EXPRESS BACKEND API       │
     │  - Firebase Auth (Identity)     │   │  - Auth Token Verification     │
     │  - Cloud Firestore:             │   │  - Multi-Tenant RLS Injection   │
     │    * Active counter presence    │   │  - Tax & Drug Law Enforcement  │
     │    * Real-time cart draft locks │   │  - Idempotency & POS Mutation  │
     │  - Firebase Storage:            │   └──────────────┬─────────────────┘
     │    * Scoped prescription images │                  │
     │    * Scoped invoice PDFs        │                  │
     └─────────────────────────────────┘                  │
                                           pg.Pool (SET LOCAL tenant/branch)
                                                          │
                                                          ▼
                                           ┌────────────────────────────────┐
                                           │    POSTGRESQL 16 (CLOUD SQL)   │
                                           │  - SOLE AUTHORITATIVE LEDGER   │
                                           │  - 44 Tables Across 8 Domains  │
                                           │  - Composite (tenant_id, id)   │
                                           │  - Fail-Closed Forced RLS      │
                                           │  - Double-Entry Journal Balance│
                                           │  - Negative Stock Prevention   │
                                           └────────────────────────────────┘
```

### Data Placement Principles:
1. **PostgreSQL 16 (Sole Authoritative Business Data Store):**
   - Issued invoices, line items, and statutory GST data.
   - Batch inventory, purchase rates (PTR), MRP, and stock movements.
   - Customer credit (Khata) receivable ledgers.
   - Supplier payables and distributor invoices.
   - Double-entry accounting journals and general ledgers.
   - Tenant memberships, branch scoping, and RBAC permissions.
2. **Cloud Firestore (Operational Real-Time Tier):**
   - Active counter presence (which terminal is logged in at which counter).
   - Real-time cart drafting and item contention locks.
   - Instant push alerts and counter notifications.
   - Non-authoritative, ephemeral operational states.
3. **Firebase Storage (Unstructured Document Store):**
   - Doctor prescription photos and scanned slips.
   - Scanned distributor purchase bills.
   - Workspaces enforce branch-aware paths: `/tenants/{tenantId}/branches/{branchId}/prescriptions/...`.
   - Authorized storage URLs are stored as relational attributes (`sales_invoices.prescription_doc_url`, `goods_receipts.invoice_document_url`).

---

## 2. Relational Schema Architecture (44 Normalized Tables)

The database schema comprises **44 tables** organized into 8 functional domains:

### Domain 1: Identity, Tenancy & Access Control (13 Tables)
- `tenants`: Multi-tenant pharmacy entity (DL numbers 20B/21B, optional GSTIN, FSSAI, contact details).
- `branches`: Physical retail pharmacy outlets (invoice prefix, thermal printer settings, main branch flag).
- `users`: Global user directory mapped to Firebase Auth (`firebase_uid`, phone, email, pharmacy council reg number).
- `tenant_memberships`: User-to-pharmacy junction (`owner`, `pharmacist`, `cashier`, `helper`).
- `membership_branches`: Normalized branch access junction (replaces unstructured arrays).
- `roles`: Platform default templates (`tenant_id IS NULL`) and tenant-custom roles.
- `permissions`: Granular action capabilities (`billing.create`, `inventory.adjust`, etc.).
- `role_permissions`: Role-to-permission mapping.
- `user_permission_overrides`: Explicit grant/deny overrides per employee.
- `invitations`: Pending staff onboarding tokens with expiration tracking.
- `invitation_branches`: Normalized branch access for pending invitations.
- `subscription_plans`: Platform subscription tiers (`pilot`, `starter`, `growth`, `enterprise`).
- `subscriptions`: Active pharmacy tenant plan, status, and billing cycle.

### Domain 2: Medicine Catalogue & Formularies (5 Tables)
- `medicine_categories`: Dosage forms (`Tablet`, `Capsule`, `Syrup`, `Injection`, `Ointment`, `Drops`, `Powder`, `Inhaler`).
- `manufacturers`: Pharmaceutical manufacturing companies (global Indian brands or tenant-custom).
- `medicine_schedules`: Statutory drug classifications under Drugs & Cosmetics Rules (`OTC`, `Schedule H`, `Schedule H1`, `Schedule X`, `Narcotic`).
- `medicine_master`: Tenant formulary master (salt composition, HSN code, GST slab, pack size, prescription flags).
- `medicine_barcodes`: Multi-barcode index supporting manufacturer barcodes and custom shelf tags.

### Domain 3: Inventory, Batches & Stock Movements (5 Tables)
- `inventory_batches`: Physical inventory located in a specific branch (batch number, expiry date, MRP, PTR, purchase cost, current stock, shelf rack).
- `stock_movements`: Append-only physical stock movement ledger (`GOODS_RECEIPT`, `SALE_DISPENSE`, `CUSTOMER_RETURN`, `SUPPLIER_RETURN`, `AUDIT_ADJUSTMENT`, `TRANSFER_OUT`, `TRANSFER_IN`).
- `stock_adjustments`: Physical inventory variance audit logs.
- `stock_transfers`: Inter-branch inventory transfer records.
- `stock_transfer_items`: Specific batches and quantities transferred across branches.

### Domain 4: Customers, Patients & Khata Credit (2 Tables)
- `customers`: Master patient and customer profiles (phone unique per tenant, doctor details, Khata limit).
- `customer_ledger`: Append-only accounts receivable ledger for store credit and settlements.

### Domain 5: Suppliers & Procurement (6 Tables)
- `suppliers`: Wholesale pharmaceutical stockists and distributors (DL numbers, GSTIN, payment terms).
- `supplier_ledger`: Append-only accounts payable ledger.
- `purchase_orders`: Outward procurement orders to distributors.
- `purchase_order_items`: Ordered medicines, pack sizes, and expected wholesale rates.
- `goods_receipts`: Landed inward purchase invoices with tax breakdowns (CGST, SGST, IGST, ITC eligibility).
- `goods_receipt_items`: Inwarded batches with PTR, MRP, scheme free quantity, and landed costs.

### Domain 6: Sales & Point of Sale (6 Tables)
- `idempotency_keys`: Mutation replay prevention storing request payload SHA-256 hash and response body.
- `sales_invoices`: Statutory GST retail tax bills (subtotal, discounts, taxable value, tax components, payment mode).
- `sales_invoice_items`: Immutable line items with batch snapshots, HSN codes, and drug schedules.
- `payments`: Settlement transactions (cash, UPI, card, bank transfer).
- `sales_returns`: Customer return credit notes with reason and refund method.
- `sales_return_items`: Returned batches with restock flags.

### Domain 7: Double-Entry Accounting & Expenses (5 Tables)
- `chart_of_accounts`: Standard chart of accounts (Assets, Liabilities, Equity, Revenue, Expenses).
- `accounting_journals`: Header of double-entry transactions linked to invoices, receipts, or payments.
- `accounting_journal_entries`: Individual debit and credit legs.
- `expense_categories`: Pharmacy operating overhead categories (`Shop Rent`, `Electricity`, `Staff Salary`).
- `expenses`: Cash and bank operational expenditure records.

### Domain 8: Governance, Audit & Export (2 Tables)
- `audit_logs`: Immutable regulatory and operational forensic log.
- `data_export_jobs`: DPDP Act data portability export requests with checksums.

---

## 3. Multi-Tenant Isolation: Composite Key Architecture

Simple foreign keys (`REFERENCES parent(id)`) allow cross-tenant data corruption if application bugs pass an ID belonging to another pharmacy.

PharmaDesk resolves this by mandating composite unique keys and composite foreign keys:
```sql
-- Pattern applied across all tenant tables:
ALTER TABLE medicine_master ADD CONSTRAINT uq_medicine_master_tenant_id UNIQUE (tenant_id, id);

ALTER TABLE sales_invoice_items ADD CONSTRAINT fk_sii_composite_medicine
    FOREIGN KEY (tenant_id, medicine_id)
    REFERENCES medicine_master (tenant_id, id)
    ON DELETE RESTRICT;
```
Result: It is **impossible** for an invoice belonging to Pharmacy A to reference a medicine or batch belonging to Pharmacy B.

---

## 4. Connection Pooling & Transaction Context Protocol

To maintain connection pooler throughput (PgBouncer/Cloud SQL Auth Proxy) without risking cross-request tenant leakage:

### Why `DISCARD ALL` Is Prohibited
`DISCARD ALL` deallocates all server-side prepared statements, drops temporary tables, and destroys cached query plans. In high-traffic POS environments, this causes massive CPU spikes.

### The `SET LOCAL` Solution
PharmaDesk uses transaction-scoped local parameters:
```typescript
import { withTenantTransaction } from './db/tenantTransaction';

await withTenantTransaction({ tenantId, branchId }, async (client) => {
  // Inside this transaction block:
  // - app.current_tenant_id is set locally
  // - app.current_branch_id is set locally
  const result = await client.query('SELECT * FROM sales_invoices');
  return result.rows;
});
// When COMMIT or ROLLBACK executes, PostgreSQL automatically purges
// the SET LOCAL variables at the kernel level.
// Connection returned to pool is completely clean.
```

### Fail-Closed RLS Policy
```sql
CREATE POLICY tenant_isolation_sales_invoices ON sales_invoices
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);
```
If a query runs without `app.current_tenant_id` set, `NULLIF` produces `NULL`. `tenant_id = NULL` evaluates to `UNKNOWN`, which PostgreSQL RLS treats as `FALSE`. The query safely returns **zero rows**.

---

## 5. Migration System & CLI Commands

PharmaDesk features a custom, zero-dependency migration runner built directly on the Node `pg` driver:

- **Migration Tracking:** Tracked in `schema_migrations` table with SHA-256 checksums.
- **Drift Detection:** Throws fatal errors if any previously applied migration file has been modified on disk.
- **Transactional Safety:** Each migration file executes in an atomic transaction block.

### CLI Commands:
```bash
# Check database connectivity and measure query latency
npm run db:check

# Inspect applied vs pending migrations and verify checksums
npm run db:status

# Apply all pending migrations sequentially
npm run db:migrate
```

---

## 6. Local Development with Docker Compose

A local PostgreSQL 16 instance can be launched with:
```bash
docker-compose up -d
```
The database will be available at `127.0.0.1:5432` with database `pharmadesk`, user `pharmadesk_migrator`, and password `migrator_password`.

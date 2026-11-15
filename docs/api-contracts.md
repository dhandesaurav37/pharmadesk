# PharmaDesk REST API Contract Specification

**Document Version:** 6.0.0 (Firebase-Standardized Production Contracts — Phase 10 Included)  
**Base URL:** `/api/v1` (Served via Firebase Hosting `/api/**` rewrite to Google Cloud Run `pharmadesk-api` in `asia-south1`)  
**Protocol:** HTTPS with TLS 1.3  
**Content-Type:** `application/json`  
**Authentication Header:** `Authorization: Bearer <Firebase_ID_Token>`  
**App Check Header:** `X-Firebase-AppCheck: <AppCheck_Token>` *(When `FIREBASE_APP_CHECK_REQUIRED=true`)*  
**Tenant Context Header:** `X-Tenant-ID: <Tenant_ID>`  
**Branch Context Header:** `X-Branch-ID: <Branch_ID>` *(Required on branch-scoped endpoints)*  
**Tracing Header:** `X-Correlation-ID: <UUID>`  
**Idempotency Header:** `Idempotency-Key` / `X-Idempotency-Key` *(Mandatory on POS checkout, invoice payments, and sales returns; optional on invoice cancellation)*

---

## 1. Global Request & Response Conventions

### 1.1 Success Envelopes
Single Resource:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "correlationId": "019318b2-570a-7e10-94e8-8c1719b673ef",
    "timestamp": "2026-11-05T09:30:00Z"
  }
}
```

Paginated Collection:
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 25,
    "totalCount": 184,
    "totalPages": 8,
    "hasNext": true
  }
}
```

### 1.2 RFC 7807 Standard Error Format
```json
{
  "type": "https://pharmadesk.in/errors/validation-error",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Insufficient non-expired stock for 'Dolo 650'. Available: 4, Requested: 10",
  "instance": "/api/v1/pos/checkout",
  "code": "INSUFFICIENT_STOCK"
}
```

---

## 2. Implemented API Modules (Phases 1–10)

---

### Module 1: Health & Session Identity (`server/src/routes/health.routes.ts`, `auth.routes.ts`)

#### 1.1 `GET /api/v1/health/live` & `GET /api/v1/health/ready`
- **Purpose:** Cloud Run liveness/readiness probes returning service version, region, active Firebase services, and storage status.

#### 1.2 `POST /api/v1/auth/session-sync`
- **Purpose:** Verify Firebase ID token, synchronize `users/{uid}` in Cloud Firestore, and return active tenant memberships and permitted branches.
- **Permission:** Authenticated Firebase user.

---

### Module 2: Pharmacy Onboarding (`server/src/routes/onboarding.routes.ts`)

#### 2.1 `POST /api/v1/onboarding/pharmacy`
- **Purpose:** Atomically create a new `tenants/{tenantId}` workspace, main branch (`branch-main`), and owner membership (`role: 'owner'`, `assignedBranchIds: ['*']`) in Cloud Firestore.
- **Permission:** Authenticated Firebase user.
- **Response (201 Created):** `{ "tenant": { ... }, "branch": { ... }, "membership": { ... } }`

---

### Module 3: Staff Management, RBAC & Invitations (Phase 4 — `employee.routes.ts`)

#### 3.1 `POST /api/v1/tenants/:tenantId/invitations`
- **Purpose:** Issue a 72-hour secure invitation stored in `tenants/{tenantId}/invitations/{id}` with `assignedBranchIds` and optional `permissionOverrides`.
- **Permission:** `employees.invite` (Owner).

#### 3.2 `GET /api/v1/tenants/:tenantId/invitations`
- **Purpose:** List tenant invitations and status/expiry metadata.
- **Permission:** `employees.view`.

#### 3.3 `POST /api/v1/tenants/:tenantId/invitations/:invitationId/resend` & `/cancel`
- **Purpose:** Refresh 72-hour TTL or cancel a pending invitation.
- **Permission:** `employees.invite`.

#### 3.4 `POST /api/v1/invitations/accept`
- **Purpose:** Redeem invitation token atomically in Cloud Firestore and create/activate `tenants/{tenantId}/memberships/{uid}`.
- **Authentication:** Valid Firebase ID token.

#### 3.5 `GET /api/v1/tenants/:tenantId/employees`
- **Purpose:** List pharmacy staff memberships, roles, assigned branches, overrides, and active/deactivated status.
- **Permission:** `employees.view`.

#### 3.6 `PATCH /api/v1/tenants/:tenantId/employees/:userId/role` | `/branches` | `/permissions`
- **Purpose:** Update employee role, `assignedBranchIds`, or `permissionOverrides` (`granted` / `revoked`) in Cloud Firestore.
- **Permission:** `employees.manage` / `branches.manage`.

#### 3.7 `PATCH /api/v1/tenants/:tenantId/employees/:userId/status`
- **Purpose:** Set employee status (`active`, `suspended`, `deactivated`). Setting `deactivated` blocks subsequent API requests immediately with `HTTP 403 ERR_EMPLOYEE_DEACTIVATED`.
- **Permission:** `employees.deactivate`.

---

### Module 4: Firebase Storage Signed URLs (`server/src/routes/storage.routes.ts`)

#### 4.1 `POST /api/v1/storage/upload-url` & `POST /api/v1/storage/download-url`
- **Purpose:** Generate short-lived V4 signed URLs scoped to `tenants/{tenantId}/branches/{branchId}/{category}/{fileName}`.
- **Allowed Categories:** `invoice_pdfs`, `prescriptions`, `supplier_bills`, `product_images`, `documents`.
- **File Rules:** Max 15 MB, allowed MIME types (`image/*`, `application/pdf`).

---

### Module 5: Medicine Catalogue (`server/src/routes/medicine.routes.ts`)

#### 5.1 `GET /api/v1/medicines` & `/tenants/:tenantId/medicines`
- **Purpose:** Search/filter tenant medicine master in `tenants/{tenantId}/medicines` by name, generic salt, manufacturer, barcode, category, schedule, and status (`active` / `archived`).
- **Permission:** `medicines.view`.

#### 5.2 `POST /api/v1/medicines` & `/tenants/:tenantId/medicines`
- **Purpose:** Create a master formulary entry with duplicate checking (`409 Conflict`).
- **Permission:** `medicines.create`.

#### 5.3 `GET / PUT / DELETE /api/v1/medicines/:id` (and `/medicines/:id/archive`)
- **Purpose:** Retrieve, update, or soft-archive a medicine master document without disturbing historical batches or invoices.
- **Permissions:** `medicines.view` | `medicines.edit` | `medicines.delete`.

---

### Module 6: Batch-Level Inventory (`server/src/routes/inventory.routes.ts`)

#### 6.1 `GET /api/v1/inventory/batches`
- **Purpose:** List branch-scoped batches in `tenants/{tenantId}/inventory_batches` filtered by status (`normal`, `low_stock`, `near_expiry`, `expired`, `out_of_stock`). Automatically strips PTR cost fields when caller lacks `inventory.ptr_margin`.
- **Permission:** `inventory.view`.

#### 6.2 `POST /api/v1/inventory/opening-stock`
- **Purpose:** Inward an initial or new batch and append an `OPENING_STOCK` record to `tenants/{tenantId}/stock_movements`.
- **Permission:** `inventory.write` (`inventory.opening_stock`).

#### 6.3 `POST /api/v1/inventory/adjustments`
- **Purpose:** Adjust batch stock inside a Cloud Firestore transaction (`DAMAGE`, `EXPIRY`, `MANUAL_ADJUSTMENT`, etc.), enforcing `currentStock >= 0` (`422 InsufficientStockError`) and appending an immutable `stock_movements` entry.
- **Permission:** `inventory.adjust`.

#### 6.4 `GET /api/v1/inventory/movements` | `/low-stock` | `/expiry` | `/valuation`
- **Purpose:** Query immutable stock movement ledger, reorder alerts, 30/60/90-day expiry risk, and PTR/MRP valuation (`inventory.ptr_margin` required for valuation).

---

### Module 7: POS Billing & Idempotent Transaction Engine (Phase 6 — `server/src/routes/billing.routes.ts`)

#### 7.1 `GET /api/v1/pos/medicines`
- **Purpose:** Search active formulary medicines enriched with branch-scoped non-expired batches sorted in FEFO order (`bestBatch`, `totalStock`, `batches`).
- **Permission:** `billing.view`.

#### 7.2 `GET /api/v1/pos/medicines/:medicineId/batches`
- **Purpose:** Return eligible non-expired batches for a medicine sorted by earliest `expiryDate` first (FEFO).
- **Permission:** `billing.view`.

#### 7.3 `POST /api/v1/pos/checkout` (Aliases: `POST /api/v1/invoices`, `POST /api/v1/:tenantId/invoices`)
- **Purpose:** Atomically allocate FEFO batches (max 50 line items per checkout), compute paise-rounded discounts and intra-state CGST/SGST or inter-state IGST, generate sequential invoice number (`INV-{BRANCH}-{YYYY}-{SEQ}`), decrement `inventory_batches`, append `stock_movements`, write `sales_invoices/{invoiceId}` + `payments` subcollection, and store branch-scoped `idempotency_keys` inside a single read-before-write Cloud Firestore transaction (`db.runTransaction`).
- **Permission:** `billing.create`.
- **Headers:** `X-Branch-ID` (required), `Idempotency-Key` or `X-Idempotency-Key` (min 8 chars, mandatory).
- **Request Body:**
  ```json
  {
    "customerId": "cust_01",
    "customer": {
      "name": "Anand Shrivastav",
      "phone": "+919820112345",
      "doctorName": "Dr. Rajesh Mehta",
      "doctorRegNumber": "MCI-49102"
    },
    "items": [
      {
        "medicineId": "med_dolo_650",
        "quantity": 20,
        "discountPercent": 10
      }
    ],
    "payments": [
      { "mode": "cash", "amount": 20 },
      { "mode": "khata_credit", "amount": 20 }
    ],
    "creditTermsDays": 15,
    "overrideCreditLimit": false,
    "creditOverrideReason": "Approved emergency refill",
    "isInterState": false
  }
  ```
- **Responses:**
  - `201 Created`: Newly committed `InvoiceResult`.
  - `200 OK` + `X-Cache: HIT`: Exact idempotent replay (identical branch + key + canonical payload SHA-256 hash).
  - `400 Bad Request`: Overpayment (`payments` sum exceeds `grandTotal`), missing `Idempotency-Key`, or `items.length > 50`.
  - `409 Conflict`: Same `Idempotency-Key` reused with a modified payload or different branch (`IdempotencyConflictError`).
  - `422 Unprocessable Entity`: Insufficient non-expired stock (`InsufficientStockError`).

#### 7.4 `GET /api/v1/invoices` (Alias: `GET /api/v1/:tenantId/invoices`)
- **Purpose:** List branch/tenant sales invoices with filters (`status`, `paymentStatus`, `dateFrom`, `dateTo`, `search`, `page`, `limit`).
- **Permission:** `billing.view`.

#### 7.5 `GET /api/v1/invoices/:invoiceId`
- **Purpose:** Retrieve full invoice record including line items, split payments, and sales return history (enforces branch access for non-owners).
- **Permission:** `billing.view`.

#### 7.6 `GET /api/v1/invoices/:invoiceId/print`
- **Purpose:** Return formatted receipt snapshot (`invoice`, GST-rate-grouped `taxSummary`, `printTimestamp`) for thermal/A4 printing (enforces branch access for non-owners).
- **Permission:** `billing.view`.

#### 7.7 `POST /api/v1/invoices/:invoiceId/payments` & `GET /api/v1/invoices/:invoiceId/payments`
- **Purpose:** Atomically collect balance-due or split payments (`cash`, `upi`, `card`, `bank_transfer`, `khata_credit`) inside `db.runTransaction`, updating `amountPaid`, `balanceDue`, and `paymentStatus` (`paid` / `partial`) plus `audit_logs`.
- **Idempotency (`POST`):** Mandatory `Idempotency-Key` / `X-Idempotency-Key` (`200 OK + X-Cache: HIT` replay vs `409 Conflict`). Rejects `amount > balanceDue` with `400 Bad Request`.
- **Permissions:** `billing.create` (POST) | `billing.view` (GET).

#### 7.8 `POST /api/v1/invoices/:invoiceId/returns` & `GET /api/v1/invoices/:invoiceId/returns`
- **Purpose:** Atomically process partial or complete sales returns inside `db.runTransaction` with proportional refund calculation, optional `damaged` boolean per line item, quarantined handling for expired/damaged items (`restocked: false`, `nonRestockReason`, zero-delta `EXPIRY`/`DAMAGE` audit movement — never increments sellable batch stock), and status update (`partially_returned` / `returned`).
- **Idempotency (`POST`):** Mandatory `Idempotency-Key` / `X-Idempotency-Key` (`200 OK + X-Cache: HIT` replay vs `409 Conflict`).
- **Permissions:** `billing.return` (POST) | `billing.view` (GET).

#### 7.9 `POST /api/v1/invoices/:invoiceId/cancel`
- **Purpose:** Atomically cancel an issued invoice (Owner-only) inside `db.runTransaction` (supports optional `Idempotency-Key`), reversing only net unreturned non-expired stock with a dedicated `INVOICE_CANCEL_REVERSAL` movement, preserving the invoice with `refundStatus` (`refund_pending` | `not_applicable`) and `refundAmount`, and recording `SALES_INVOICE_CANCELLED` in `audit_logs`.
- **Permission:** `billing.cancel` (Owner).

---

### Module 8: Customers & Khata Credit Ledger (Phase 7 — `server/src/routes/customer.routes.ts`)
*(Mounted at both `/api/v1/customers/*` and `/api/v1/tenants/:tenantId/customers/*`.)*

#### 8.1 `GET /api/v1/customers` & `GET /api/v1/customers/:customerId`
- **Purpose:** Search/paginate customers by name, normalized phone, doctor, status, customerType, or due standing. Masks mobile numbers (`+91 ******2345`) when caller lacks `customers.view_phone` and redacts Khata financial fields (`currentOutstandingBalance`, `creditLimit`, `advanceBalance`, `totalPayments`) when caller lacks `customers.khata_view`.
- **Permission:** `customers.view`.

#### 8.2 `POST /api/v1/customers` & `PUT/PATCH /api/v1/customers/:customerId`
- **Purpose:** Create or update customer profiles with E.164 Indian mobile normalization (`+91XXXXXXXXXX`), duplicate mobile detection (`409 Conflict` unless `confirmSharedPhone: true`), and optional audited `openingBalance` (`OPENING_BALANCE` ledger entry).
- **Permissions:** `customers.create` | `customers.update`.

#### 8.3 `PATCH /api/v1/customers/:customerId/status` | `POST /api/v1/customers/:customerId/archive` | `POST /api/v1/customers/:customerId/unarchive`
- **Purpose:** Transition customer status (`ACTIVE` / `INACTIVE` / `BLOCKED`) or archive/restore customer profiles. Archiving is blocked with `400`/`409` whenever `currentOutstandingBalance > 0` or `advanceBalance > 0`.
- **Permissions:** `customers.update` (status) | `customers.archive` (archive/unarchive).

#### 8.4 `PATCH /api/v1/customers/:customerId/credit-limit`
- **Purpose:** Configure `creditLimit`, `creditEnabled`, and `creditTermsDays` (`0 | 7 | 15 | 30`) with immutable audit trail (`CUSTOMER_CREDIT_LIMIT_UPDATED`).
- **Permission:** `customers.credit_limit_manage` (alias: `customers.credit_limit`).

#### 8.5 `GET /api/v1/customers/:customerId/purchases` | `.../ledger` | `.../payments` | `.../reconcile`
- **Purpose:** Inspect linked invoice purchases (`customers.view_purchase_history`), immutable ledger history (`customers.khata_view`), payment receipts, and server-side paise-exact ledger reconciliation (`opening + debits - credits === closingOutstanding - advance`).

#### 8.6 `POST /api/v1/customers/:customerId/payments`
- **Purpose:** Collect Khata repayments (`cash`, `upi`, `card`, `bank_transfer`) inside `db.runTransaction` with mandatory `Idempotency-Key` (`X-Cache: HIT` / `409 Conflict`). Allocates either FIFO oldest-due invoice first or to a specific `invoiceId`; optional `allowAdvance: true` credits advance balance.
- **Permission:** `customers.khata_collect` (`customers.khata_settle` also required for invoice settlement).

#### 8.7 `POST /api/v1/customers/:customerId/credit-notes` & `POST /api/v1/customers/:customerId/adjustments`
- **Purpose:** Issue audited credit notes (`CREDIT_NOTE`) or manual balance adjustments (`DEBIT_ADJUSTMENT` / `CREDIT_ADJUSTMENT` / `OPENING_BALANCE` / `REFUND`) inside `db.runTransaction` with mandatory `Idempotency-Key`.
- **Permissions:** `customers.credit_note` | `customers.balance_adjust`.

#### 8.8 `GET /api/v1/customers/:customerId/statement` | `POST .../statement/export` | `POST .../statement/whatsapp`
- **Purpose:** Generate period account statements (`openingBalance`, `periodDebits`, `periodCredits`, `closingBalance`), export valid CSV or `%PDF-1.4` files archived to Firebase Storage with signed V4 URLs, and prepare sanitized `wa.me` share messages excluding clinical/PHI fields (`allergies`, `chronicConditions`, `dateOfBirth`).
- **Permissions:** `customers.statement_view` | `customers.statement_export` | `customers.statement_share`.

#### 8.9 `GET /api/v1/customers/reports/summary` | `/reports/outstanding` | `/reports/overdue`
- **Purpose:** Provide Khata KPI overview, branch/tenant outstanding receivables, and overdue aging buckets (`0_7_days`, `8_15_days`, `16_30_days`, `over_30_days`), respecting phone masking rules for callers such as `auditor`.
- **Permission:** `customers.reports_view`.

---

### Module 9: Supplier Directory & Statements (Phase 8 — `server/src/routes/supplier.routes.ts`)
*(Mounted at both `/api/v1/suppliers/*` and `/api/v1/tenants/:tenantId/suppliers/*`.)*

#### 9.1 `GET /api/v1/suppliers` & `GET /api/v1/suppliers/:supplierId`
- **Purpose:** Search/paginate distributor profiles by trade name, legal name, code, GSTIN, phone, type, or outstanding standing. Automatically redacts `bankDetails` (`bankDetailsRedacted: true`) unless caller holds `suppliers.view_bank_details` and redacts financial balances (`financialsRedacted: true`) unless caller holds `suppliers.view_financials`.
- **Permission:** `suppliers.view`.

#### 9.2 `POST /api/v1/suppliers` & `PUT/PATCH /api/v1/suppliers/:supplierId`
- **Purpose:** Create or update pharmaceutical distributors with Indian GSTIN syntax check (note-explicit local validation), PAN validation, Indian phone normalization, duplicate GSTIN/phone conflict guard (`409` unless `confirmDuplicate: true`), and owner/permission check for bank details updates.
- **Permissions:** `suppliers.create` | `suppliers.update`.

#### 9.3 `PATCH /api/v1/suppliers/:supplierId/status` & `POST /api/v1/suppliers/:supplierId/archive`
- **Purpose:** Update distributor status (`ACTIVE` | `INACTIVE` | `BLOCKED` with reason); reactivating `BLOCKED`/`ARCHIVED` requires `owner` role. Archiving rejects whenever `currentOutstandingBalance > 0`.
- **Permissions:** `suppliers.update` | `suppliers.archive`.

#### 9.4 `POST /api/v1/suppliers/:supplierId/attachments`
- **Purpose:** Attach tenant/branch-scoped Firebase Storage metadata (`supplier_bills` or `documents`) to a supplier profile.
- **Permission:** `suppliers.update`.

#### 9.5 `GET /api/v1/suppliers/:supplierId/statement` & `GET /api/v1/suppliers/:supplierId/statement/export`
- **Purpose:** Return chronological supplier statement (`OPENING`, `INVOICE`, `PAYMENT`, `RETURN_CREDIT`) reconciled to payable balance; `?format=csv` or `?format=pdf` exports valid CSV / `%PDF-1.4` statement archives.
- **Permissions:** `suppliers.view` + `suppliers.view_financials` (+ `suppliers.export` for export).

---

### Module 10: Purchase Orders, Goods Receipts, Payables & Returns (Phase 8 — `server/src/routes/procurement.routes.ts`)
*(Mounted at both `/api/v1/*` and `/api/v1/tenants/:tenantId/*`.)*

#### 10.1 Purchase Orders (`/purchase-orders`)
- `GET /api/v1/purchase-orders` & `GET /api/v1/purchase-orders/:poId` (`purchase_orders.view`): List and inspect branch-scoped purchase orders with intra-state CGST+SGST or inter-state IGST computations.
- `POST /api/v1/purchase-orders` (`purchase_orders.create`) & `PATCH /api/v1/purchase-orders/:poId` (`purchase_orders.update`): Create/edit draft POs (excludes `BLOCKED`/`ARCHIVED` suppliers; zero accounting payable created).
- `POST /api/v1/purchase-orders/:poId/submit` (`purchase_orders.submit`), `/approve` (`purchase_orders.approve`), `/cancel` (`purchase_orders.cancel`), `/close` (`purchase_orders.close`), `GET /print` (`purchase_orders.view`): State machine with concurrency lock preventing double approvals (`409 Conflict`) and cancellation blocking after stock receipt (`400 Bad Request`).

#### 10.2 Goods Receipt Notes (`/goods-receipts`)
- `POST /api/v1/goods-receipts` (`goods_receipts.create` + `goods_receipts.post`): Mandatory `Idempotency-Key` / `X-Idempotency-Key`. Receives against `APPROVED`/`PARTIALLY_RECEIVED` PO or direct delivery, supports multi-batch splitting per line, validates `accepted + rejected === received`, rejects expired or invalid `mfgDate > expiryDate` batches, emits short-expiry warnings, excludes rejected stock from `inventory_batches`, appends `PURCHASE_RECEIPT` movements, enforces `goods_receipts.correct` for over-receipt, and updates `purchaseOperations`.
- `GET /api/v1/goods-receipts` | `/:grnId` | `/:grnId/print` (`goods_receipts.view`): List, inspect, and retrieve print payload.
- `POST /api/v1/goods-receipts/:grnId/reverse` (`goods_receipts.correct`): Auditable GRN reversal that restores PO pending quantities and zeroes unconsumed batch stock (blocked with `409 Conflict` if any unit was dispensed or paid).

#### 10.3 Supplier Invoices, Payments, Returns & Procurement Reports
- `GET / POST /api/v1/supplier-invoices` (`supplier_invoices.view` | `supplier_invoices.create`): Single-liability invoice recognition enforcing unique `grnId` (`409` duplicate payable prevention) and unique per-supplier bill numbers.
- `GET / POST /api/v1/supplier-payments` (`supplier_payments.view` | `supplier_payments.create`): Idempotent FIFO oldest-due or explicit invoice allocations with optional `allowAdvance: true`.
- `GET / POST /api/v1/supplier-returns` (`goods_receipts.view` | `supplier_returns.create` + `supplier_returns.approve`): Deducts non-sold batch stock via `PURCHASE_RETURN`, posts credit note against linked invoice/payable balance.
- `GET /api/v1/procurement/reports` (`supplier_reports.view`): Supplier-wise purchases, pending PO quantities, GRNs by date range, overdue bills, short-expiry receipts, rejected stock, and supplier returns.

---

### Module 11: Double-Entry Accounting, Expenses & Financial Reports (Phase 9 — `server/src/routes/accounting.routes.ts` & `expense.routes.ts`)
*(Mounted at `/api/v1/accounting/*`, `/api/v1/expenses/*`, and tenant-prefixed `/api/v1/tenants/:tenantId/accounting/*` & `/expenses/*`.)*

#### 11.1 Overview, Chart of Accounts & Ledger
- `GET /api/v1/accounting/overview` (`accounting.view` / `accounting.reports.view`): Financial KPI snapshot (Net Sales, Gross Profit & Margin %, Net Profit, Cash/Bank, AR 1300, AP 2100, Inventory 1400, Net GST, period counts, reconciliation exceptions).
- `GET / POST /api/v1/accounting/accounts`, `PATCH / DELETE /api/v1/accounting/accounts/:accountId` (`accounting.accounts.view` | `accounting.accounts.manage`): List, create custom accounts, toggle active status, or delete unused non-system accounts.
- `GET /api/v1/accounting/accounts/:accountId/ledger` (`accounting.accounts.view`): Running-balance account ledger drilldown.
- `GET /api/v1/accounting/journal-entries` & `POST /api/v1/accounting/journal-entries/:entryId/reverse` (`accounting.journals.view` | `accounting.journals.reverse`): Search immutable balanced vouchers and post audited equal-and-opposite reversal entries. *(Intentionally exposes no arbitrary public `POST /accounting/journal-entries` endpoint.)*

#### 11.2 Opening Balances, Cash/Bank, Reconciliation & Periods
- `POST /api/v1/accounting/opening-balances` (`accounting.opening_balances.manage`): Balanced historical opening journal with automatic offset to `3200 Opening Balance Equity`.
- `GET /api/v1/accounting/cash-bank` (`accounting.cash_bank.view`), `POST /api/v1/accounting/bank-accounts`, `POST /api/v1/accounting/transfers` (`Idempotency-Key`), `POST /api/v1/accounting/bank-charges` (`accounting.cash_bank.manage`): Manage cash/bank registers, contra transfers, and MDR/bank charges.
- `POST /api/v1/accounting/bank-reconciliations` & `POST .../match` (`accounting.cash_bank.manage`): Import manually exported CSV/JSON bank statement lines and reconcile against posted bank journals.
- `GET /api/v1/accounting/periods` (`accounting.periods.view`), `POST .../close` (`accounting.periods.close`), `POST .../reopen` (`accounting.periods.reopen`): Manage Indian Financial Year (Apr–Mar) monthly period locks and audited reopenings.
- `GET /api/v1/accounting/reconciliation/exceptions` (`accounting.audit.view`) & `POST .../backfill` (`accounting.reconciliation.manage`): Detect GL-vs-subledger variance (AR 1300, AP 2100, Inventory 1400) and run idempotent historical backfill.

#### 11.3 Operating Expenses (`/api/v1/expenses`)
- `GET /api/v1/expenses` (`accounting.expenses.view`), `POST /api/v1/expenses` (`accounting.expenses.create`), `POST .../:expenseId/approve` (`accounting.expenses.approve`), `POST .../:expenseId/pay` (`accounting.expenses.pay`), `POST .../:expenseId/reverse` (`accounting.expenses.approve`): Full accrual/cash expense lifecycle with CGST/SGST/IGST ITC tracking.

#### 11.4 Financial Reports & Exports (`/api/v1/accounting/reports/*`)
- `GET /api/v1/accounting/reports/trial-balance` | `profit-loss` | `branch-pnl` | `balance-sheet` | `cash-flow` | `cash-book` | `bank-book` | `gst-summary` | `expenses` (`accounting.reports.view`). *(GST summary carries explicit CA verification disclaimer and is not direct GSTN filing.)*
- `GET /api/v1/accounting/reports/export?reportType=...&format=csv|pdf` (`accounting.reports.export`): Valid CSV and `%PDF-1.4` exports.

---

### Module 12: Multi-Branch Management, Stock Transfers & Consolidated Reporting (Phase 10 — `branch.routes.ts`, `stockTransfer.routes.ts`, `multiBranchReport.routes.ts`)
*(Mounted at `/api/v1/*` and `/api/v1/tenants/:tenantId/*`.)*

#### 12.1 Branch Directory, Policies & Lifecycle (`/api/v1/branches`)
- `GET /api/v1/branches/authorized`: Returns only branches assigned to the authenticated member (used by workspace switcher).
- `GET / POST /api/v1/branches` & `GET / PATCH /api/v1/branches/:branchId` (`branches.view` | `branches.create` | `branches.update`): Manage pharmacy branches (`branchCode`, `branchType`, drug licenses `20B`/`21B`, `gstin`, `isPrimary`) with duplicate code guard (`409`).
- `PATCH /api/v1/branches/:branchId/settings` (`branches.manage_settings`) & `POST /api/v1/branches/:branchId/set-primary` (`branches.update`): Configure `transferPolicy` (`requireApproval`, `allowSelfApproval`, `approvalThresholdAmount`, `approvalThresholdQty`, `defaultPriceBasis`) and primary branch status.
- `POST /api/v1/branches/:branchId/activate` | `/deactivate` | `/suspend`: Lifecycle transitions; `SUSPENDED`/`INACTIVE`/`CLOSED` branches automatically reject mutating POS, inventory, procurement, and expense operations via `requireActiveBranchMiddleware` while preserving historical `GET` reads.
- `GET /api/v1/branches/:branchId/closure-check` & `POST /api/v1/branches/:branchId/close` (`branches.close`): Scans remaining stock, pending transfers, open POs, draft GRNs, unpaid invoices, and unsettled expenses (`409 Conflict` if blockers remain); permanent `CLOSED` transition cannot be reopened.
- `GET / POST /api/v1/branches/:branchId/employees` & `DELETE .../:targetUserId` (`branches.manage_employees`): Manage branch staff rosters (prevents removing an employee's last assigned branch).
- `GET /api/v1/branches/audit-logs` (`branches.view`) & `GET /api/v1/branches/:branchId/reports/{sales|inventory|financials}` (`reports.branch.view` | `branches.view_financials`).

#### 12.2 Inter-Branch Stock Transfers (`/api/v1/stock-transfers`)
- `GET / POST /api/v1/stock-transfers` & `GET /api/v1/stock-transfers/:transferId` (`stock_transfers.view` | `stock_transfers.create`): Create draft or auto-submitted (`submitImmediately`) transfers from active non-expired batches.
- `POST .../:transferId/{submit|approve|reject|cancel}` (`stock_transfers.submit` | `approve` | `reject` | `cancel`): Enforces branch transfer approval thresholds and blocks self-approval when `allowSelfApproval === false`.
- `POST .../:transferId/dispatch` (`stock_transfers.dispatch`): Idempotent (`X-Idempotency-Key`) source branch stock deduction (`STOCK_TRANSFER_OUT`, sorted branch locks) posting `Dr 1450 Stock in Transit` / `Cr 1400 Inventory` with zero inter-branch revenue, COGS, or GST.
- `POST .../:transferId/receive` (`stock_transfers.receive`): Idempotent destination-only receipt tally (`acceptedQuantity + damagedQuantity + missingQuantity <= pendingDispatched`) requiring `discrepancyReason` on variance, creating destination batches preserving `batchNumber`/`expiryDate`/`PTR`/`MRP` (`STOCK_TRANSFER_IN`), clearing `1450` into destination `1400`, and posting transit shrinkage to `5280`.
- `POST .../:transferId/reconcile` (`stock_transfers.reconcile`): Closes disputed or received transfers with audit resolution notes.

#### 12.3 Consolidated Multi-Branch Reports (`/api/v1/reports/consolidated/*`)
- `GET /api/v1/reports/consolidated/overview` & `/branch-comparison` (`reports.consolidated.view`): Returns branch comparison table, Branch Totals, Inter-Branch Eliminations (`1450 Stock in Transit`, zero internal sales), and Net Consolidated Financials.
- `GET /api/v1/reports/consolidated/export?type=branch-comparison|consolidated-summary&format=csv|pdf` (`reports.consolidated.export`).

---

## 3. Planned Future API Module (Phase 11)

- **Module 13 (Phase 11): Audit & DPDP Export** (`GET /audit/logs`, `POST /settings/export`) — Firebase Storage signed export bundles.

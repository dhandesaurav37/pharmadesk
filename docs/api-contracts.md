# PharmaDesk REST API Contract Specification

**Document Version:** 3.0.0 (Firebase-Standardized Production Contracts)  
**Base URL:** `/api/v1` (Served via Firebase Hosting `/api/**` rewrite to Google Cloud Run `pharmadesk-api` in `asia-south1`)  
**Protocol:** HTTPS with TLS 1.3  
**Content-Type:** `application/json`  
**Authentication Header:** `Authorization: Bearer <Firebase_ID_Token>`  
**App Check Header:** `X-Firebase-AppCheck: <AppCheck_Token>` *(When `FIREBASE_APP_CHECK_REQUIRED=true`)*  
**Tenant Context Header:** `X-Tenant-ID: <Tenant_ID>`  
**Branch Context Header:** `X-Branch-ID: <Branch_ID>` *(Required on branch-scoped endpoints)*  
**Tracing Header:** `X-Correlation-ID: <UUID>`  
**Idempotency Header:** `Idempotency-Key` / `X-Idempotency-Key: <UUID>` *(Mandatory on POS checkout)*

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

## 2. Implemented API Modules (Phases 1–6)

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
- **Purpose:** Atomically allocate FEFO batches, compute paise-rounded discounts and intra-state CGST/SGST or inter-state IGST, generate sequential invoice number (`INV-{BRANCH}-{YYYY}-{SEQ}`), decrement `inventory_batches`, append `stock_movements`, write `sales_invoices/{invoiceId}` + `payments` subcollection, and store `idempotency_keys/{key}` inside a Cloud Firestore transaction (`db.runTransaction`).
- **Permission:** `billing.create`.
- **Header:** `Idempotency-Key` or `X-Idempotency-Key` (min 8 chars, mandatory).
- **Request Body:**
  ```json
  {
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
      { "mode": "upi", "amount": 20, "referenceNumber": "UPI-99102" }
    ],
    "isInterState": false
  }
  ```
- **Responses:**
  - `201 Created`: Newly committed `InvoiceResult`.
  - `200 OK` + `X-Cache: HIT`: Exact idempotent replay (identical key + canonical payload SHA-256 hash).
  - `409 Conflict`: Same `Idempotency-Key` reused with a modified payload (`IdempotencyConflictError`).
  - `422 Unprocessable Entity`: Insufficient non-expired stock (`InsufficientStockError`).

#### 7.4 `GET /api/v1/invoices` (Alias: `GET /api/v1/:tenantId/invoices`)
- **Purpose:** List branch/tenant sales invoices with filters (`status`, `paymentStatus`, `dateFrom`, `dateTo`, `search`, `page`, `limit`).
- **Permission:** `billing.view`.

#### 7.5 `GET /api/v1/invoices/:invoiceId`
- **Purpose:** Retrieve full invoice record including line items, split payments, and sales return history.
- **Permission:** `billing.view`.

#### 7.6 `GET /api/v1/invoices/:invoiceId/print`
- **Purpose:** Return formatted receipt snapshot (`invoice`, GST-rate-grouped `taxSummary`, `printTimestamp`) for thermal/A4 printing.
- **Permission:** `billing.view`.

#### 7.7 `POST /api/v1/invoices/:invoiceId/payments` & `GET /api/v1/invoices/:invoiceId/payments`
- **Purpose:** Collect balance-due or split payments (`cash`, `upi`, `card`, `bank_transfer`, `khata_credit`), updating `amountPaid`, `balanceDue`, and `paymentStatus` (`paid` / `partial`) plus audit log.
- **Permissions:** `billing.create` (POST) | `billing.view` (GET).

#### 7.8 `POST /api/v1/invoices/:invoiceId/returns` & `GET /api/v1/invoices/:invoiceId/returns`
- **Purpose:** Process partial or complete sales returns with proportional refund calculation, optional batch restock (`SALE_RETURN`), and status update (`partially_returned` / `returned`).
- **Permissions:** `billing.return` (POST) | `billing.view` (GET).

#### 7.9 `POST /api/v1/invoices/:invoiceId/cancel`
- **Purpose:** Cancel an issued invoice (Owner-only), reversing unreturned batch stock and recording `SALES_INVOICE_CANCELLED` in `audit_logs`.
- **Permission:** `billing.cancel` (Owner).

---

## 3. Planned Future API Modules (Phases 7–11)

- **Module 8 (Phase 7): Customers & Khata Credit Ledger** (`GET/POST /customers`, `POST /customers/:id/payments`) — Firestore `customers` & `customer_ledger`.
- **Module 9 (Phase 8): Suppliers, POs & Goods Receipts** (`GET/POST /suppliers`, `POST /purchases/goods-receipts`) — Firestore `suppliers`, `purchase_orders`, `goods_receipts`, `supplier_ledger`.
- **Module 10 (Phase 9): Double-Entry Accounts & GST Reports** (`GET /accounts/cash-register`, `POST /accounts/expenses`, `GET /reports/gst/gstr-1`) — Firestore `ledger_accounts`, `accounting_journals`, `expenses`.
- **Module 11 (Phase 10): Multi-Branch Transfers** (`POST /inventory/transfers`) — Firestore `stock_transfers`.
- **Module 12 (Phase 11): Audit & DPDP Export** (`GET /audit/logs`, `POST /settings/export`) — Firebase Storage signed export bundles.

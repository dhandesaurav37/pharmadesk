# PharmaDesk REST API Contract Specification

**Document Version:** 2.0.0 (Hardened Production Contracts)  
**Base URL:** `https://api.pharmadesk.in/api/v1`  
**Protocol:** HTTPS with TLS 1.3  
**Content-Type:** `application/json`  
**Authentication Header:** `Authorization: Bearer <Firebase_ID_Token>`  
**Tenant Context Header:** `X-Tenant-ID: <UUID>`  
**Branch Context Header:** `X-Branch-ID: <UUID>` (Required on branch-scoped endpoints)  
**Tracing Header:** `X-Correlation-ID: <UUID>`  
**Idempotency Header:** `Idempotency-Key: <UUID>` (Mandatory on state-mutating POST/PATCH endpoints)  

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
  },
  "meta": {
    "correlationId": "019318b2-570a-7e10-94e8-8c1719b673ef",
    "timestamp": "2026-11-05T09:30:00Z"
  }
}
```

### 1.2 RFC 7807 Standard Error Format
```json
{
  "type": "https://pharmadesk.in/errors/validation-error",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Doctor registration number is mandatory for Schedule H1 drug Augmentin 625 Duo.",
  "instance": "/api/v1/billing/invoices",
  "code": "SCHEDULE_H1_DOCTOR_REQUIRED",
  "errors": [
    {
      "field": "items[0].doctorRegNumber",
      "message": "Required for Schedule H1 dispensing"
    }
  ]
}
```

---

## 2. API Endpoints by Domain Module

---

### Module 1: Authentication & Identity

#### 1.1 `POST /auth/session-sync`
- **Purpose:** Synchronize Firebase verified UID with the database and return the user's active tenant memberships and branches.
- **Permission:** None (Authenticated Firebase user).
- **Request Body:**
  ```json
  {
    "phone": "+919820144820",
    "fullName": "Suresh Patel",
    "email": "suresh@apexmedicos.com"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "c8a41df2-e9f1-4f9e-8798-25f0a07dbb34",
        "fullName": "Suresh Patel",
        "phone": "+919820144820"
      },
      "memberships": [
        {
          "tenantId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          "tenantName": "Apex Medicos & Healthcare",
          "role": "owner",
          "permittedBranches": [
            { "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", "name": "Bandra West Main Store", "isMain": true }
          ]
        }
      ]
    }
  }
  ```

---

### Module 2: Pharmacy Onboarding

#### 2.1 `POST /onboarding/pharmacy`
- **Purpose:** Create a new pharmacy tenant, main branch, owner membership, and chart of accounts.
- **Permission:** None (Owner initiating onboarding).
- **Request Body:**
  ```json
  {
    "pharmacyName": "Apex Medicos & Healthcare",
    "tradeName": "Apex Medicos",
    "legalEntityType": "Sole Proprietorship",
    "dlNumber20B": "MH-MZ4-194820",
    "dlNumber21B": "MH-MZ4-194821",
    "gstin": "27AABCS1429B1Z8",
    "fssaiNumber": "11522018000412",
    "contactPhone": "+919820144820",
    "contactEmail": "apexmedicos.mumbai@gmail.com",
    "mainBranch": {
      "branchCode": "MAIN",
      "name": "Main Store (Bandra West)",
      "addressLine1": "Shop 4, Hill Road",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400050",
      "phone": "+919820144820",
      "invoicePrefix": "AMB",
      "thermalPrinterEnabled": true,
      "defaultDiscountPercent": 10.00
    }
  }
  ```
- **Response (201 Created):** `{ "tenantId": "UUID", "branchId": "UUID", "status": "active" }`

---

### Module 3: Branch Operations

#### 3.1 `GET /branches`
- **Purpose:** List retail branches under the active tenant.
- **Permission:** `settings.manage` or `inventory.view`.
- **Response (200 OK):** Collection of branch profiles.

#### 3.2 `POST /branches`
- **Purpose:** Create an additional branch.
- **Permission:** `settings.manage`.

---

### Module 4: Employees & Access Control

#### 4.1 `GET /employees`
- **Purpose:** List staff accounts, assigned roles, and permitted branch mappings.
- **Permission:** `employees.invite`.

#### 4.2 `POST /employees/invite`
- **Purpose:** Dispatch staff invitation with role and branch assignments.
- **Permission:** `employees.invite`.
- **Request Body:**
  ```json
  {
    "phone": "+919876521094",
    "fullName": "Pooja Deshmukh",
    "email": "pooja@apexmedicos.com",
    "primaryRole": "pharmacist",
    "pharmacistRegNumber": "MH-PCI-89421",
    "branchIds": ["9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"]
  }
  ```
- **Relational Persistence:** On the backend, `branchIds` is normalized and persisted as separate rows in `invitation_branches(tenant_id, invitation_id, branch_id)` with composite foreign keys. No unnormalized PostgreSQL array columns are used.

#### 4.3 `PUT /employees/:userId/permissions`
- **Purpose:** Set user-specific permission overrides (`is_granted = true/false`).
- **Permission:** `employees.invite`.

#### 4.4 `POST /employees/:userId/deactivate`
- **Purpose:** Deactivate employee and invalidate all active session tokens immediately.
- **Permission:** `employees.deactivate`.

---

### Module 5: Medicines Master Directory

#### 5.1 `GET /medicines`
- **Purpose:** Search catalog formulations by brand, salt, manufacturer, schedule.
- **Permission:** `medicines.view`.
- **Query Params:** `search`, `category`, `scheduleClass`, `page`, `limit`.

#### 5.2 `POST /medicines`
- **Purpose:** Add new formulation to master catalog.
- **Permission:** `medicines.create`.
- **Request Body:** Brand name, salt composition, category, schedule class, HSN, GST slab, pack size.

---

### Module 6: Inventory & Batch Stock

#### 6.1 `GET /inventory/batches`
- **Purpose:** Query live shelf batches for active branch.
- **Scope:** Branch-scoped (`X-Branch-ID`).
- **Permission:** `inventory.view`.
- **Query Params:** `search`, `status` (`normal`, `low_stock`, `near_expiry`, `expired`), `page`, `limit`.

#### 6.2 `POST /inventory/batches/adjust`
- **Purpose:** Record physical stock count audit variance.
- **Scope:** Branch-scoped.
- **Permission:** `inventory.adjust`.
- **Transaction Boundary:**
  - `BEGIN;`
  - Read batch and lock: `SELECT ... FOR UPDATE;`
  - Record `stock_adjustments`.
  - Calculate delta: `quantity_delta = counted_stock - current_stock`.
  - Record `stock_movements (movement_type = 'AUDIT_ADJUSTMENT', ...)`.
  - Update `inventory_batches SET current_stock = counted_stock`.
  - `COMMIT;`

#### 6.3 `POST /inventory/transfers`
- **Purpose:** Issue inter-branch stock transfer from source to destination.
- **Permission:** `inventory.transfer`.
- **Request Body:** `destinationBranchId`, array of `{ batchId, quantity }`.

---

### Module 7: Billing & Invoices (Point of Sale)

#### 7.1 `POST /billing/invoices`
- **Purpose:** Atomically dispense medicines, generate sequential invoice, decrement batch stock, record payments, and post customer Khata.
- **Scope:** Branch-scoped (`X-Branch-ID`).
- **Permission:** `billing.create`.
- **Header:** `Idempotency-Key: <UUID>` (Mandatory).
- **Transaction Boundary:**
  1. `BEGIN TRANSACTION;`
  2. Check idempotency: If `idempotency_key` exists, return existing invoice and commit/exit.
  3. Pessimistic Lock: `SELECT current_stock, expiry_date FROM inventory_batches WHERE id IN (...) FOR UPDATE;`
  4. Validation: Verify each batch has `current_stock >= requested_qty` and `expiry_date > CURRENT_DATE`.
  5. Schedule H1 Validation: If any item is `Schedule H1` or `Schedule X`, verify `doctorName` and `doctorRegNumber` are present.
  6. Generate next branch sequence: `invoice_number = branch.invoice_prefix || '-' || to_char(now(), 'YYYY') || '-' || nextval(...)`.
  7. Insert `sales_invoices`.
  8. Insert `sales_invoice_items` with full rate snapshots (MRP, PTR, discount, GST).
  9. For each item:
     - `UPDATE inventory_batches SET current_stock = current_stock - :qty;`
     - `INSERT INTO stock_movements (movement_type = 'SALE_DISPENSE', ...);`
  10. If `paymentMode == 'khata_credit'`:
      - `INSERT INTO customer_ledger (entry_type = 'CREDIT_PURCHASE', debit = :grandTotal, ...);`
      - `UPDATE customers SET khata_balance = khata_balance + :grandTotal, total_visits = total_visits + 1;`
  11. Insert `payments`.
  12. Post double-entry journal to `accounting_journals` & `accounting_journal_entries`.
  13. `COMMIT TRANSACTION;`
- **Request Body:**
  ```json
  {
    "customerName": "Anand Shrivastav",
    "customerPhone": "+919820112345",
    "doctorName": "Dr. Rajesh Mehta",
    "doctorRegNumber": "MCI-49102",
    "paymentMode": "upi",
    "paymentRefNumber": "UPI/6321094812",
    "items": [
      {
        "batchId": "7f8b9c0d-1122-3344-5566-778899aabbcc",
        "quantity": 2,
        "discountPercent": 10.00
      }
    ]
  }
  ```
- **Response (201 Created):** Full generated invoice including tax breakdown and invoice sequence number.

#### 7.2 `POST /billing/invoices/:id/returns`
- **Purpose:** Process patient sales return with stock restock evaluation and refund/credit note.
- **Permission:** `billing.return`.

---

### Module 8: Customers & Khata

#### 8.1 `GET /customers`
- **Purpose:** Query customer directory and Khata balances.
- **Permission:** `customers.view`.

#### 8.2 `POST /customers/:id/payments`
- **Purpose:** Settle customer Khata credit via Cash, UPI, or Card.
- **Permission:** `customers.khata_settle`.
- **Transaction Boundary:**
  - `BEGIN;`
  - Insert `payments`.
  - Insert `customer_ledger (entry_type = 'CASH_PAYMENT', credit = :amount, ...)`.
  - Update `customers SET khata_balance = khata_balance - :amount`.
  - Post accounting journal.
  - `COMMIT;`

---

### Module 9: Suppliers & Procurement

#### 9.1 `GET /suppliers`
- **Purpose:** List pharmaceutical distributors and accounts payable balances.
- **Permission:** `suppliers.manage`.

#### 9.2 `POST /purchases/goods-receipts`
- **Purpose:** Inward physical stock from distributor tax invoice.
- **Permission:** `purchases.inward`.
- **Transaction Boundary:**
  - `BEGIN;`
  - Insert `goods_receipts`.
  - For each item:
    - Insert or increment `inventory_batches`.
    - Insert `stock_movements (movement_type = 'GOODS_RECEIPT')`.
  - Insert `supplier_ledger (entry_type = 'INVOICE_BILL', credit = :totalAmount)`.
  - Update `suppliers SET outstanding_balance = outstanding_balance + :totalAmount`.
  - Post accounting journal (`Debit: Inventory Asset 1200, Debit: ITC 1310, Credit: Accounts Payable 2010`).
  - `COMMIT;`

---

### Module 10: Accounts & Expenses

#### 10.1 `GET /accounts/cash-register`
- **Purpose:** Daily cash drawer balance, breakdown by payment modes (Cash, UPI, Card, Khata).
- **Permission:** `accounts.view`.

#### 10.2 `POST /accounts/expenses`
- **Purpose:** Record operational expense (Rent, Electricity, Salary).
- **Permission:** `accounts.expense`.

---

### Module 11: Reports & Statutory Filings

#### 11.1 `GET /reports/gst/gstr-1`
- **Purpose:** Export GSTR-1 outward supplies grouped by HSN and GST slab.
- **Permission:** `reports.gst`.

#### 11.2 `GET /reports/statutory/schedule-h1`
- **Purpose:** Export legal Schedule H1 dispense audit register for Drug Inspector review.
- **Permission:** `reports.schedule_h1`.

---

### Module 12: Settings & Data Governance

#### 12.1 `GET /settings/store`
- **Purpose:** Retrieve store profile, Form 20B/21B licenses, and printer settings.
- **Permission:** `settings.manage`.

#### 12.2 `POST /settings/export`
- **Purpose:** Initiate full tenant database export (DPDP Act compliance).
- **Permission:** `settings.manage` (Owner only).

#### 12.3 `GET /audit/logs`
- **Purpose:** Query chronological security and compliance audit trail.
- **Permission:** `audit_logs.view`.

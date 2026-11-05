# PharmaDesk REST API Contract Specification

**API Version:** `v1`  
**Base URL:** `https://api.pharmadesk.in/api/v1`  
**Protocol:** HTTPS with TLS 1.3  
**Content-Type:** `application/json`  
**Authentication:** `Authorization: Bearer <Firebase_ID_Token>`  
**Tenant Context Header:** `X-Tenant-ID: <UUID>`  
**Branch Context Header:** `X-Branch-ID: <UUID>`  

---

## 1. Global Request & Response Conventions

### 1.1 Success Response Envelope
All non-paginated successful responses return HTTP `200 OK` or `201 Created`:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_01j7b9...",
    "timestamp": "2026-11-05T09:30:00Z"
  }
}
```

### 1.2 Paginated List Envelope
Endpoints returning collections support cursor or limit-offset pagination:
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
    "requestId": "req_01j7ba...",
    "timestamp": "2026-11-05T09:30:00Z"
  }
}
```

### 1.3 Standard Error Format (RFC 7807)
Error responses use standard HTTP status codes (`400`, `401`, `403`, `404`, `409`, `422`, `500`) with Problem Details:
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

## 2. API Endpoints by Functional Module

---

### Module 1: Authentication & Users

#### 1.1 `POST /auth/session-sync`
- **Purpose:** Synchronize authenticated Firebase user credentials with the PharmaDesk database and return accessible tenant memberships.
- **Auth Requirement:** Valid Firebase JWT.
- **Permission Required:** None (Public to authenticated Firebase user).
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
        "phone": "+919820144820",
        "email": "suresh@apexmedicos.com"
      },
      "tenants": [
        {
          "tenantId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          "tenantName": "Apex Medicos & Healthcare",
          "role": "owner",
          "branches": [
            { "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", "name": "Bandra West Main Store" }
          ]
        }
      ]
    }
  }
  ```

---

### Module 2: Pharmacy Onboarding

#### 2.1 `POST /onboarding/pharmacy`
- **Purpose:** Register a new pharmacy business entity, initialize primary owner membership, default branch, and default formulary settings.
- **Auth Requirement:** Valid Firebase JWT.
- **Permission Required:** First-time onboarding user.
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
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "tenantId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "branchId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "status": "active"
    }
  }
  ```

---

### Module 3: Branch Management

#### 3.1 `GET /branches`
- **Purpose:** List all retail branches operating under the authenticated tenant.
- **Permission Required:** `settings:manage_store` or `inventory:view_stock`.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "branchCode": "MAIN",
        "name": "Main Store (Bandra West)",
        "city": "Mumbai",
        "isMainBranch": true,
        "invoicePrefix": "AMB"
      }
    ]
  }
  ```

#### 3.2 `POST /branches`
- **Purpose:** Create an additional retail branch under the current tenant.
- **Permission Required:** `settings:manage_store`.
- **Request Body:** Branch profile fields.

---

### Module 4: Employees & Permissions

#### 4.1 `GET /employees`
- **Purpose:** List all staff accounts, roles, and branch assignments for the tenant.
- **Permission Required:** `employees:manage`.
- **Response (200 OK):** Paginated staff directory.

#### 4.2 `POST /employees/invite`
- **Purpose:** Invite an employee (pharmacist, cashier, helper) with mobile number and role assignment.
- **Permission Required:** `employees:manage`.
- **Request Body:**
  ```json
  {
    "phone": "+919876521094",
    "fullName": "Pooja Deshmukh",
    "email": "pooja@apexmedicos.com",
    "primaryRole": "pharmacist",
    "pharmacistRegNumber": "MH-PCI-89421",
    "permittedBranchIds": ["9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"]
  }
  ```

#### 4.3 `PUT /employees/:userId/permissions`
- **Purpose:** Set explicit user-level permission overrides (`is_granted = true/false`).
- **Permission Required:** `employees:manage`.

---

### Module 5: Medicines Master Directory

#### 5.1 `GET /medicines`
- **Purpose:** Search and filter formulations across the tenant catalog.
- **Query Params:** `search`, `category`, `scheduleClass`, `page`, `limit`.
- **Permission Required:** `medicines:view`.

#### 5.2 `POST /medicines`
- **Purpose:** Add a new medicine formulation to the tenant catalog.
- **Permission Required:** `medicines:create`.
- **Request Body:**
  ```json
  {
    "brandName": "Dolo 650 Tablet",
    "saltComposition": "Paracetamol (650mg)",
    "manufacturer": "Micro Labs Ltd",
    "category": "Tablet",
    "scheduleClass": "OTC",
    "hsnCode": "300490",
    "gstSlab": 12.00,
    "packSize": "15 Tablets",
    "prescriptionRequired": false,
    "minStockLevel": 25
  }
  ```

---

### Module 6: Inventory & Batches

#### 6.1 `GET /inventory/batches`
- **Purpose:** Query physical stock batches filtered by branch, expiry date status, or search term.
- **Scope:** Branch-scoped (`X-Branch-ID` mandatory).
- **Permission Required:** `inventory:view_stock`.
- **Response (200 OK):** Batch array with calculated status (`normal`, `low_stock`, `near_expiry`, `expired`).

#### 6.2 `POST /inventory/batches/adjust`
- **Purpose:** Perform a physical count audit adjustment.
- **Transaction Boundary:** Updates `inventory_batches.current_stock` and writes an immutable record to `stock_movements`.
- **Permission Required:** `inventory:audit_adjust`.
- **Request Body:**
  ```json
  {
    "batchId": "a1b2c3d4-...",
    "countedStock": 45,
    "reason": "Physical count mismatch identified during monthly shelf audit"
  }
  ```

---

### Module 7: Billing & Invoices (Point of Sale)

#### 7.1 `POST /billing/invoices`
- **Purpose:** Atomically create an issued retail tax invoice, decrement inventory batches, create payment records, and update customer Khata.
- **Scope:** Branch-scoped (`X-Branch-ID`).
- **Permission Required:** `billing:create_invoice`.
- **Transaction Boundary:**
  - `BEGIN TRANSACTION;`
  - Lock affected batches: `SELECT ... FROM inventory_batches WHERE id IN (...) FOR UPDATE;`
  - Validate: Stock $\ge$ Quantity; Batch is not expired.
  - Insert into `sales_invoices`.
  - Insert all rows into `sales_invoice_items`.
  - For each item:
    - Decrement batch: `UPDATE inventory_batches SET current_stock = current_stock - :qty ...;`
    - Write ledger: `INSERT INTO stock_movements (movement_type = 'SALE_DISPENSE', ...);`
  - If `payment_mode = 'khata_credit'`:
    - Insert into `customer_ledger (entry_type = 'CREDIT_PURCHASE', ...);`
    - Update `customers SET khata_balance = khata_balance + :grandTotal;`
  - Insert into `payments`.
  - `COMMIT;`
- **Request Body:**
  ```json
  {
    "idempotencyKey": "pos-terminal-01-uuid-994184",
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

---

### Module 8: Customers & Khata

#### 8.1 `GET /customers`
- **Purpose:** Query customer directory and outstanding Khata balances.
- **Permission Required:** `customers:view`.

#### 8.2 `POST /customers/:id/payments`
- **Purpose:** Settle customer Khata credit via Cash or UPI.
- **Transaction Boundary:** Records `payments`, updates `customer_ledger`, and decrements `customers.khata_balance`.
- **Permission Required:** `customers:settle_khata`.
- **Request Body:**
  ```json
  {
    "amount": 450.00,
    "paymentMethod": "cash",
    "notes": "Weekly settlement cleared"
  }
  ```

---

### Module 9: Suppliers & Stockists

#### 9.1 `GET /suppliers`
- **Purpose:** List pharmaceutical distributors and outstanding balances.
- **Permission Required:** `suppliers:view`.

#### 9.2 `POST /suppliers`
- **Purpose:** Register a new stockist with Form 20B wholesale license and GSTIN.
- **Permission Required:** `suppliers:create_edit`.

---

### Module 10: Purchases & Inward Goods Receipts

#### 10.1 `POST /purchases/goods-receipts`
- **Purpose:** Inward physical stock from distributor tax invoice.
- **Transaction Boundary:** Creates `goods_receipts`, inserts/increments `inventory_batches`, records `stock_movements`, and credits `supplier_ledger`.
- **Permission Required:** `purchases:inward_receipt`.
- **Request Body:**
  ```json
  {
    "supplierId": "4c5d6e7f-...",
    "supplierInvoiceNumber": "MHL-98201",
    "supplierInvoiceDate": "2026-11-04",
    "items": [
      {
        "medicineId": "med_01...",
        "batchNumber": "DL-9912",
        "expiryDate": "2028-04-30",
        "packSize": "15 Tablets",
        "quantityPacks": 100,
        "ptr": 26.20,
        "mrp": 34.50,
        "gstSlab": 12.00,
        "rackLocation": "Rack A-1"
      }
    ]
  }
  ```

---

### Module 11: Accounts & Daily Cash

#### 11.1 `GET /accounts/cash-register`
- **Purpose:** Retrieve daily cash drawer balance, counter sales breakdown by mode (Cash, UPI, Card, Khata).
- **Permission Required:** `accounts:view_cash_register`.

#### 11.2 `POST /accounts/expenses`
- **Purpose:** Record operational pharmacy expense (Rent, Staff, Electricity).
- **Permission Required:** `accounts:record_expense`.

---

### Module 12: Reports & Statutory Filings

#### 12.1 `GET /reports/gst/gstr-1`
- **Purpose:** Generate GSTR-1 outward supply JSON/Excel report grouped by HSN code and GST tax slabs.
- **Permission Required:** `reports:gst_filing`.

#### 12.2 `GET /reports/statutory/schedule-h1`
- **Purpose:** Export legal Schedule H1 dispense audit register for Drug Inspector review.
- **Permission Required:** `reports:schedule_h1_log`.

---

### Module 13: Store Settings

#### 13.1 `GET /settings/store`
- **Purpose:** Retrieve active pharmacy licenses, invoice sequence prefix, and printer profile.
- **Permission Required:** `settings:manage_store`.

#### 13.2 `PATCH /settings/store`
- **Purpose:** Update store licensing, thermal printer dimensions (80mm vs A4), or default customer discount.
- **Permission Required:** `settings:manage_store`.

---

### Module 14: Audit Logs

#### 14.1 `GET /audit/logs`
- **Purpose:** Query regulatory and security audit events.
- **Permission Required:** `audit:view_logs`.
- **Response (200 OK):** Chronological log of sensitive operational actions.

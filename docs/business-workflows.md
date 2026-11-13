# PharmaDesk End-to-End Pharmacy Business Workflows

**Document Version:** 3.0.0 (Firebase-Standardized Operational Workflows)  
**Scope:** Core Operational Lifecycles & Cloud Firestore ACID Transaction Sequences  
**Standard:** Event-Driven State Machines with `db.runTransaction` Atomicity

---

## 1. Pharmacy Onboarding Workflow (Phase 3)

The onboarding workflow guides a pharmacy owner from Firebase Authentication sign-in to an initialized tenant workspace in Cloud Firestore.

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Pharmacy Owner
    participant App as React Frontend (Firebase Hosting)
    participant Auth as Firebase Auth
    participant API as Express API (Cloud Run)
    participant FS as Cloud Firestore

    Owner->>App: Enter Email / Password or Phone OTP
    App->>Auth: Authenticate Credentials
    Auth-->>App: RS256 Firebase ID Token (JWT)
    Owner->>App: Submit Pharmacy Name, State, DL 20B/21B, Main Branch
    App->>API: POST /api/v1/onboarding/pharmacy (Bearer JWT)
    API->>FS: db.runTransaction()
    API->>FS: Set tenants/{tenantId} (status='active')
    API->>FS: Set tenants/{tenantId}/branches/branch-main (isMain=true)
    API->>FS: Set tenants/{tenantId}/memberships/{uid} (role='owner', assignedBranchIds=['*'])
    API->>FS: Set users/{uid} (lastActiveTenantId=tenantId)
    API->>FS: Commit Transaction & Write audit_logs
    API-->>App: HTTP 201 Created { tenant, branch, membership }
    App-->>Owner: Render Pharmacy Dashboard
```

---

## 2. Employee Lifecycle & Staff RBAC Workflow (Phase 4)

The employee lifecycle manages invitations, branch assignment, permission overrides, and immediate session termination backed by Cloud Firestore.

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Pharmacy Owner
    participant App as React Frontend
    participant API as Express API (Cloud Run)
    participant FS as Cloud Firestore

    Owner->>App: Enter Name, Email, Role, Branches & Overrides
    App->>API: POST /api/v1/tenants/:tenantId/invitations
    API->>FS: Create tenants/{tenantId}/invitations/{invitationId} (72h TTL, status='pending')
    API->>FS: Write tenants/{tenantId}/audit_logs (EMPLOYEE_INVITED)
    API-->>App: HTTP 201 Created { id, token, expiresAt }

    Note over App,API: Invitee signs in with Firebase Auth and redeems token
    actor Invitee as New Employee
    Invitee->>App: Open invite link & authenticate with Firebase Auth
    App->>API: POST /api/v1/invitations/accept { token }
    API->>FS: Verify token, check expiresAt > now(), status == 'pending'
    API->>FS: Atomic Batch: Update invitation (status='accepted')
    API->>FS: Set tenants/{tenantId}/memberships/{uid} (role, assignedBranchIds, permissionOverrides)
    API->>FS: Write tenants/{tenantId}/audit_logs (INVITATION_ACCEPTED)
    API-->>App: HTTP 200 OK { membershipId, role, status='active' }
```

### 2.1 Invitation States
- **`pending`**: Valid for 72 hours (`expiresAt`). Can be resent (`/resend`) or cancelled (`/cancel`).
- **`accepted`**: Token redeemed; token invalidated to prevent replay attacks; membership set to `active`.
- **`expired` / `cancelled` / `revoked`**: Cannot be redeemed (`HTTP 400`/`410`).

### 2.2 Immediate Access Revocation Workflow
1. Owner calls `PATCH /api/v1/tenants/:tenantId/employees/:userId/status` with `{ "status": "deactivated" }`.
2. Firestore `tenants/{tenantId}/memberships/{userId}` is updated to `status: 'deactivated'` and logged in `audit_logs`.
3. Because `tenantAuthorizationMiddleware` reads live membership status on every API call, the deactivated employee receives an immediate **HTTP 403 Forbidden** (`ERR_EMPLOYEE_DEACTIVATED`) on their very next request.

---

## 3. Medicine & Batch Inventory Workflow (Phase 5)

```mermaid
flowchart TD
    AddMed[1. Create Medicine Master in tenants/tenantId/medicines\nBrand, Generic Salt, Schedule, HSN, GST] --> InwardBatch[2. Inward Opening / Received Batch in inventory_batches\nBatch No, Expiry, PTR, MRP, Rack]
    InwardBatch --> AvailableStock[3. Batch Active on Shelf\nStatus auto-computed: normal / low_stock / near_expiry]
    AvailableStock --> Dispense[4. POS FEFO Sale Dispense\nDecrements currentStock Atomically]
    AvailableStock --> NearExpiry[5. Expiry Monitor 30/60/90 Days\nExcludes Expired Batches from POS]
    AvailableStock --> AuditVar[6. Physical Audit Adjustment\nPOST /inventory/adjustments]
    AuditVar --> StockMovement[7. Immutable Log Written to stock_movements]
    Dispense --> StockMovement
```

- **Non-Negative Stock Invariant:** `InventoryService.adjustStock` and `BillingTransactionService.createSalesInvoice` reject any operation that would leave `currentStock < 0` with `HTTP 422 InsufficientStockError`. Silent clamping (`Math.max(0, stock - qty)`) is strictly forbidden.
- **Audit Immutability:** Every stock change appends an immutable document to `tenants/{tenantId}/stock_movements` recording `movementType`, `quantityChange`, `previousQuantity`, `newQuantity`, `performedBy`, `reason`, and `timestamp`.

---

## 4. Retail POS Billing, FEFO & Idempotent Transaction Workflow (Phase 6)

```mermaid
sequenceDiagram
    autonumber
    actor Cashier as Cashier / Pharmacist
    participant POS as Billing Terminal
    participant API as Express API (Cloud Run)
    participant FS as Cloud Firestore

    Cashier->>POS: Search Medicine & Enter Quantity / Payment Modes
    POS->>API: POST /api/v1/pos/checkout (Idempotency-Key + Bearer JWT)
    API->>API: Compute Canonical SHA-256 Payload Hash
    API->>FS: Check tenants/{tenantId}/idempotency_keys/{key}
    alt Completed Key + Matching Payload Hash
        API-->>POS: HTTP 200 OK (X-Cache: HIT, Replayed InvoiceResult)
    else Key Reused with Different Payload
        API-->>POS: HTTP 409 Conflict (IdempotencyConflictError)
    else New Request
        API->>FS: FEFO Allocation (Filter expired/empty batches, sort earliest expiryDate)
        API->>FS: db.runTransaction()
        API->>FS: Transactional Read of Target inventory_batches Docs
        alt Insufficient Non-Expired Stock
            API-->>POS: HTTP 422 Unprocessable Entity (InsufficientStockError)
        else Stock Valid
            API->>FS: Increment tenants/{tenantId}/counters/invoice_{BRANCH}_{YEAR}
            API->>FS: Decrement inventory_batches & Write stock_movements (SALE)
            API->>FS: Write sales_invoices/{invoiceId} & subcollection payments/{paymentId}
            API->>FS: Commit idempotency_keys/{key} (status='completed', result)
            API-->>POS: HTTP 201 Created { invoiceNumber, grandTotal, taxSummary }
        end
    end
```

### 4.1 Automated FEFO & GST Computation
1. **FEFO Allocation:** If `batchId` is omitted, `allocateBatchesFEFO` excludes expired batches (`isBatchExpired`) and zero-stock batches, sorts remaining batches by earliest `expiryDate` ascending, and splits the requested quantity seamlessly across batches when needed.
2. **Authoritative Pricing & GST:** Unit prices default to batch `sellingPrice` / `mrp`, GST rates come from the Medicine Master, line discounts are applied cleanly with paise rounding (`roundPaise`), and taxes split cleanly into intra-state `CGST + SGST` or inter-state `IGST` with automatic `roundOff` to the nearest rupee (`grandTotal`).
3. **Split Payments & Settlements:** Checkout supports single or multi-mode payments (`cash`, `upi`, `card`, `bank_transfer`, `khata_credit`). Remaining `balanceDue` can be settled later via `POST /api/v1/invoices/:invoiceId/payments`.

### 4.2 Sales Returns & Invoice Cancellations
- **Partial / Full Returns (`POST /api/v1/invoices/:id/returns`, permission `billing.return`):** Validates return quantity $\le (\text{sold} - \text{alreadyReturned})$, computes proportional per-unit refund, optionally restocks units (`SALE_RETURN` movement), transitions invoice status to `partially_returned` or `returned`, and logs an audit entry.
- **Invoice Cancellation (`POST /api/v1/invoices/:id/cancel`, permission `billing.cancel` — Owner only):** Reverses unreturned stock (`MANUAL_ADJUSTMENT` restock), marks invoice `cancelled` with `cancellationReason` and `cancelledBy`, and commits an immutable audit trail entry.

---

## 5. Planned Phase 7–9 Workflows (Customers, Procurement & Accounting)

### 5.1 Customer Khata Credit Ledger *(Planned Phase 7)*
- Customer records live in `tenants/{tenantId}/customers` paired with an append-only `customer_ledger` subcollection (`CREDIT_PURCHASE`, `CASH_PAYMENT`, `CREDIT_NOTE`).
- Billing on `khata_credit` debits customer Khata atomically; cash/UPI repayments credit the ledger.

### 5.2 Supplier Procurement & Goods Receipts *(Planned Phase 8)*
- Purchase orders (`purchase_orders`) and distributor tax invoice receipts (`goods_receipts`) create or increment `inventory_batches`, append `PURCHASE_RECEIPT` records to `stock_movements`, and credit `supplier_ledger`.

### 5.3 Double-Entry Financial Accounting & Reports *(Planned Phase 9)*
- Financial events post balanced entries (`accounting_journals`) enforcing $\sum \text{Debits} == \sum \text{Credits}$ inside Firestore transactions:
  $$\text{Net Revenue} = \sum \text{sales\_invoices.taxableAmount}$$
  $$\text{COGS} = \sum (\text{item.quantity} \times \text{item.ptr})$$
  $$\text{Gross Profit} = \text{Net Revenue} - \text{COGS}$$
  $$\text{Net Operating Profit} = \text{Gross Profit} - \sum \text{expenses.amount}$$

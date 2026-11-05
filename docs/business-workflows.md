# PharmaDesk End-to-End Pharmacy Business Workflows

**Document Version:** 1.0.0 (Implementation Blueprint)  
**Scope:** Core Operational Lifecycles & Transactional Sequences  
**Standard:** Event-Driven State Machines with ACID Transaction Boundaries  

---

## 1. Pharmacy Onboarding Workflow

The onboarding workflow guides a pharmacy owner from initial phone verification to their first point-of-sale dispense.

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Pharmacy Owner
    participant App as React Frontend
    participant Auth as Firebase Auth
    participant API as Express API
    participant DB as Cloud SQL PostgreSQL

    Owner->>App: Enter Mobile (+91) & Name
    App->>Auth: Request OTP
    Auth-->>Owner: 6-Digit SMS OTP
    Owner->>App: Submit OTP
    Auth-->>App: Valid Firebase ID Token
    Owner->>App: Enter Pharmacy Name, State, DL 20B/21B, (GSTIN optional)
    App->>API: POST /onboarding/pharmacy (Bearer JWT)
    API->>DB: BEGIN TRANSACTION
    API->>DB: INSERT INTO tenants (...) RETURNING id
    API->>DB: INSERT INTO branches (is_main_branch = true, ...) RETURNING id
    API->>DB: INSERT INTO users (firebase_uid, ...) RETURNING id
    API->>DB: INSERT INTO tenant_memberships (role = 'owner', ...) RETURNING id
    API->>DB: INSERT INTO membership_branches (membership_id, branch_id)
    API->>DB: INSERT INTO chart_of_accounts (Seed standard ledger accounts)
    API->>DB: COMMIT TRANSACTION
    API-->>App: HTTP 201 Created { tenantId, branchId }
    App-->>Owner: Redirect to Dashboard with Onboarded State
```

---

## 2. Employee Lifecycle Workflow

The employee lifecycle manages hiring, branch assignment, daily counter authorization, and immediate revocation.

```mermaid
stateDiagram-v2
    [*] --> Invited: Owner submits name, phone, role & branches
    Invited --> Active: Employee verifies OTP & activates account
    Active --> Suspended: Owner places temporary hold
    Suspended --> Active: Owner reactivates account
    Active --> Deactivated: Owner terminates access
    Deactivated --> [*]: Sessions blacklisted & branch access deleted
```

1. **Invitation:** Owner dispatches `POST /employees/invite` specifying phone, role, and branch IDs. An invitation row is recorded with a 72-hour expiration token.
2. **Acceptance:** Employee receives SMS link, logs in via phone OTP, and verifies their State Pharmacy Council registration number if assigned the `PHARMACIST` role.
3. **Branch Assignment:** Mappings are committed into `membership_branches`.
4. **Session Termination / Deactivation:** When an employee leaves, `DELETE FROM membership_branches` and `UPDATE tenant_memberships SET status = 'deactivated'` occur atomically. The server purges any cached tokens, instantly denying ongoing API requests.

---

## 3. Medicine & Batch Inventory Workflow

```mermaid
flowchart TD
    AddMed[1. Create Medicine Master Record\nBrand, Salt, Category, Schedule, HSN] --> InwardBatch[2. Receive Batch via Goods Receipt\nBatch No, Expiry, Pack Size, PTR, MRP]
    InwardBatch --> AvailableStock[3. Batch Stock Active on Shelf\nAvailable for POS Dispensing]
    AvailableStock --> Dispense[4. Sale Dispense at Counter\nStock Decremented Atomically]
    AvailableStock --> NearExpiry[5. Expiry Monitor < 90 Days\nFlagged for Stockist Return]
    AvailableStock --> AuditVar[6. Shelf Count Audit Variance\nStock Adjustment Recorded]
    NearExpiry --> StockistReturn[7. Debit Note Purchase Return\nStock Removed & Supplier Credited]
    AuditVar --> StockMovement[8. Stock Movements Ledger Updated]
```

- **Safety Check:** The database trigger `trg_check_inventory_stock` blocks any transaction that would produce `current_stock < 0`.

---

## 4. Retail POS Billing Workflow (Concurrent Counter Dispensing)

This is the highest-velocity transaction in a retail medical store.

```mermaid
sequenceDiagram
    autonumber
    actor Cashier as Cashier / Pharmacist
    participant POS as Billing Screen (F2)
    participant API as Express API
    participant DB as PostgreSQL

    Cashier->>POS: Scan Barcode / Search Brand or Salt
    POS->>Cashier: Display Available Batches (Stock, Exp, MRP)
    Cashier->>POS: Select Batch, Enter Quantity & Customer Mobile
    Note over Cashier,POS: If Schedule H1: System prompts for Doctor Name & Reg No
    Cashier->>POS: Select Payment Mode (Cash, UPI QR, Khata) & Press Enter
    POS->>API: POST /billing/invoices (Idempotency-Key: UUID)
    API->>DB: BEGIN TRANSACTION
    API->>DB: SELECT current_stock FROM inventory_batches WHERE id IN (...) FOR UPDATE
    alt Insufficient Stock Available
        DB-->>API: Stock < Requested Qty
        API->>DB: ROLLBACK
        API-->>POS: HTTP 409 Conflict: STOCK_EXHAUSTED
    else Stock Valid
        API->>DB: INSERT INTO sales_invoices (...)
        API->>DB: INSERT INTO sales_invoice_items (...)
        API->>DB: UPDATE inventory_batches SET current_stock = current_stock - qty
        API->>DB: INSERT INTO stock_movements (type = 'SALE_DISPENSE')
        alt Payment Mode == 'khata_credit'
            API->>DB: INSERT INTO customer_ledger (entry_type = 'CREDIT_PURCHASE')
            API->>DB: UPDATE customers SET khata_balance = khata_balance + total
        end
        API->>DB: INSERT INTO payments (...)
        API->>DB: INSERT INTO accounting_journals & entries (Double-entry)
        API->>DB: COMMIT TRANSACTION
        API-->>POS: HTTP 201 Created { invoiceNumber, printPayload }
        POS-->>Cashier: Trigger Thermal Receipt (80mm) Print
    end
```

---

## 5. Customer & Khata Credit Ledger Workflow

```mermaid
flowchart TD
    CustReg[1. Customer Profile Stored Once in customers table\nPhone, Name, Doctor, Credit Limit] --> CounterSale[2. Patient Buys Medicines at POS]
    CounterSale --> Choice{Payment Mode?}
    Choice -->|Cash / UPI / Card| CashSettle[Immediate Payment Recorded in payments table]
    Choice -->|Khata Credit| KhataDebit[Debit Customer Ledger\nIncrease customers.khata_balance]
    KhataDebit --> DueNotice[3. Periodic WhatsApp / SMS Statement\nShowing Detailed Invoices & Outstanding]
    DueNotice --> Repay[4. Customer Pays Cash at Counter]
    Repay --> SettleRec[Credit Customer Ledger\nDecrease customers.khata_balance\nRecord Cash Payment]
```

---

## 6. Supplier Procurement & Goods Receipt Workflow

1. **Purchase Order Creation:** The pharmacist creates a PO (`purchase_orders`) for a stockist specifying medicines and pack quantities.
2. **Delivery & Inward Inspection:** Goods arrive with a physical tax invoice from the stockist.
3. **Goods Receipt Entry (`POST /purchases/goods-receipts`):**
   - The user records invoice number, invoice date, batch numbers, expiry dates, pack sizes, PTR, and MRP.
   - Within an atomic transaction:
     - The batches are inserted or incremented in `inventory_batches`.
     - Inward ledger rows are recorded in `stock_movements`.
     - The supplier's accounts payable balance is credited in `supplier_ledger`.
     - A double-entry accounting journal posts:
       - **Debit:** Inventory Asset (`1200`)
       - **Debit:** Input Tax Credit CGST/SGST (`1310`, `1320`)
       - **Credit:** Accounts Payable Stockist (`2010`)
4. **Supplier Settlement:** When the pharmacy settles the distributor's bill via NEFT/Cheque/Cash, a debit entry is posted to `supplier_ledger` and `accounts_payable`.

---

## 7. Financial & Statutory Report Calculation Matrix

To prevent misleading or fabricated metrics, report formulas are defined with exact database table dependencies:

| Report Name | Definition / Exact Calculation Formula | Source Tables & Criteria |
| :--- | :--- | :--- |
| **Today's Gross Sales** | $\sum (\text{grand\_total}) - \sum (\text{round\_off})$ | `sales_invoices WHERE status = 'completed' AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE` |
| **Gross Margin / Profit** | $\sum (\text{item\_total} - (\text{quantity} \times \text{ptr}))$ | `sales_invoice_items` joined to `sales_invoices` for given date range. |
| **Net Operational Profit** | $\text{Gross Profit} - \sum (\text{expenses.amount})$ | `sales_invoice_items` profit minus `expenses` table for same accounting period. |
| **Inventory Stock Valuation** | $\sum (\text{current\_stock} \times \text{ptr})$ | `inventory_batches WHERE current_stock > 0`. Shows total capital tied up in shelf inventory. |
| **Expiry Loss Potential** | $\sum (\text{current\_stock} \times \text{purchase\_cost})$ | `inventory_batches WHERE expiry_date \le \text{CURRENT\_DATE} + \text{INTERVAL '90 days'}`. |
| **Fast-Moving Formulations** | Ranked by $\sum (\text{sales\_invoice\_items.quantity})$ DESC | `sales_invoice_items` grouped by `medicine_id` over rolling 30 days. |
| **GSTR-1 Tax Summary** | Grouped by `hsn_code` and `gst_slab`: $\sum \text{taxable\_value}$, $\sum \text{cgst}$, $\sum \text{sgst}$ | `sales_invoice_items` for active tax month. |
| **Customer Khata Receivables** | $\sum (\text{khata\_balance})$ | `customers WHERE khata_balance > 0`. Reconciled against `customer_ledger`. |
| **Supplier Payables** | $\sum (\text{outstanding\_balance})$ | `suppliers WHERE outstanding_balance > 0`. Reconciled against `supplier_ledger`. |

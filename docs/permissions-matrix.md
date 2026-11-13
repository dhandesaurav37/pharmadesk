# PharmaDesk Employee Permission & RBAC Model

**Document Version:** 5.0.0 (Firebase-Standardized RBAC Specification — Phase 9 Accounting Permissions)  
**Security Standard:** Role-Based Access Control (RBAC) with User-Level Overrides  
**Enforcement Principle:** Mandatory Server-Side Evaluation against Live Cloud Firestore Memberships

---

## 1. Principles of Authorization & Platform Separation

1. **Server-Side Exclusivity:**
   Frontend permission checks exist exclusively for UI ergonomics (disabling buttons or hiding restricted columns such as wholesale PTR rates). The Express backend independently authorizes every protected endpoint via `tenantAuthorizationMiddleware` and `requirePermission`.
2. **Firestore-Authoritative Membership Identity:**
   **Firebase Authentication** verifies credentials (Email/Password, Phone OTP) and issues RS256 ID tokens (`uid`). **Cloud Firestore** (`tenants/{tenantId}/memberships/{userId}`) is the sole authoritative source for tenant membership, `status`, `role`, `assignedBranchIds`, and `permissionOverrides`. Static Firebase Custom Claims are never trusted as authorization authority.
3. **Strict SaaS Platform Administrator Separation:**
   Platform maintenance roles never bypass pharmacy tenant boundaries or inspect patient health information (PHI) or customer financial ledgers without an explicit, time-limited consent token logged in `tenants/{tenantId}/audit_logs`.

---

## 2. Default System Roles

### 2.1 Role: `owner` (Pharmacy Administrator & License Holder)
- **Target User:** Medical store proprietor, managing partner, or authorized director.
- **Scope:** Full administrative and operational authority (`['*']` permissions and `['*']` branch access) across all branches of the pharmacy tenant.
- **Key Responsibilities:** Invites/deactivates staff, manages Drug Licenses (Form 20B/21B), GSTIN, branch setup, cancels issued invoices, views P&L/GST reports, and inspects audit logs.

### 2.2 Role: `pharmacist` (Registered Pharmacist — B.Pharm / D.Pharm)
- **Target User:** Licensed pharmacist holding valid State Pharmacy Council credentials.
- **Scope:** Clinical dispensing, medicine catalogue administration, batch inventory, and return handling at assigned branches.
- **Key Responsibilities:** Dispenses POS bills (including Schedule H/H1/X), edits master formulations, inwards stock batches (PTR/MRP), adjusts shelf counts, processes sales returns, and views Schedule H1 / stock alerts.

### 2.3 Role: `cashier` (Billing Counter Operator)
- **Target User:** Counter billing clerk or checkout operator.
- **Scope:** High-speed POS billing and payment collection at assigned branches.
- **Key Responsibilities:** Searches POS stock, bills OTC and validated prescriptions, accepts Cash/UPI/Card/Khata payments, collects balance due, and registers walk-in customers.
- **Restrictions:** Cannot view wholesale purchase rates (PTR) or valuation margins, cannot adjust physical inventory, and cannot cancel issued invoices.

### 2.4 Role: `helper` (Stock Assistant & Runner)
- **Target User:** Shelf organizer, runner, or inventory counter.
- **Scope:** Viewing medicine catalogue and physical rack/batch locations (`medicines.view`, `inventory.view`).
- **Restrictions:** Zero access to POS billing checkout, invoice history, financial metrics, customer contacts, or PTR prices.

### 2.5 Role: `auditor` (External / Internal Compliance Auditor)
- **Target User:** Chartered Accountant or compliance reviewer.
- **Scope:** Read-only inspection across catalogue, inventory valuation (`inventory.ptr_margin`), customer Khata balances/ledgers/statements/credit aging reports (`customers.view`, `customers.view_purchase_history`, `customers.khata_view`, `customers.statement_view`, `customers.statement_export`, `customers.reports_view`), supplier financials/POs/GRNs/invoices/payments/procurement reports (`suppliers.view`, `suppliers.view_financials`, `suppliers.export`, `purchase_orders.view`, `goods_receipts.view`, `goods_receipts.export`, `supplier_invoices.view`, `supplier_payments.view`, `supplier_reports.view`), double-entry accounting ledgers, Chart of Accounts, Trial Balance, P&L, Balance Sheet, Cash Flow, GST registers & CSV/PDF exports (`accounting.view`, `accounting.accounts.view`, `accounting.journals.view`, `accounting.reports.view`, `accounting.reports.export`, `accounting.expenses.view`, `accounting.cash_bank.view`, `accounting.periods.view`, `accounting.audit.view`), and `audit_logs`.
- **Restrictions:** Cannot mutate stock, issue bills, modify customers/credit limits, approve POs, record payments, mutate accounts/journals/expenses, close/reopen financial periods, view supplier bank details (`suppliers.view_bank_details` denied) or unmasked patient mobile numbers (`customers.view_phone` denied), or modify employee records.

---

## 3. Standardized Dot-Notated Permissions Matrix

| Permission Code | Description | Module | `owner` | `pharmacist` | `cashier` | `helper` | `auditor` |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `dashboard.view` | Access operational dashboard and metrics | Dashboard | ✓ | ✓ | ✓ | ✗ | ✓ |
| `billing.view` | View POS terminal, invoices, print & payments | Billing | ✓ | ✓ | ✓ | ✗ | ✗ |
| `billing.create` | Checkout POS invoices and record payments | Billing | ✓ | ✓ | ✓ | ✗ | ✗ |
| `billing.schedule_h1` | Dispense controlled Schedule H1/X medicines | Billing | ✓ | ✓ | ✗* | ✗ | ✗ |
| `billing.discount` | Apply custom discounts above default threshold | Billing | ✓ | ✓ | ✗ | ✗ | ✗ |
| `billing.return` | Process patient medicine return & refund | Billing | ✓ | ✓ | ✗ | ✗ | ✗ |
| `billing.cancel` | Void/cancel an issued invoice & reverse stock | Billing | ✓ | ✗ | ✗ | ✗ | ✗ |
| `medicines.view` | View medicine formulary and salt catalog | Medicines | ✓ | ✓ | ✓ | ✓ | ✓ |
| `medicines.create` | Add new formulations to tenant catalog | Medicines | ✓ | ✓ | ✗ | ✗ | ✗ |
| `medicines.edit` | Edit drug salts, category, and HSN codes | Medicines | ✓ | ✓ | ✗ | ✗ | ✗ |
| `medicines.delete` | Soft-archive medicine from master catalog | Medicines | ✓ | ✗ | ✗ | ✗ | ✗ |
| `inventory.view` | View batch quantities, rack locations & expiry | Inventory | ✓ | ✓ | ✓ | ✓ | ✓ |
| `inventory.write` | Inward opening stock and new batches | Inventory | ✓ | ✓ | ✗ | ✗ | ✗ |
| `inventory.adjust` | Perform manual physical count adjustments | Inventory | ✓ | ✓ | ✗ | ✗ | ✗ |
| `inventory.ptr_margin` | View wholesale PTR rates & valuation margins | Inventory | ✓ | ✓ | ✗ | ✗ | ✓ |
| `inventory.transfer` | Issue or receive inter-branch stock transfers | Inventory | ✓ | ✓ | ✗ | ✗ | ✗ |
| `inventory.dispose` | Write off expired/damaged stock batches | Inventory | ✓ | ✓ | ✗ | ✗ | ✗ |
| `customers.view` | View customer directory & account summaries | Customers | ✓ | ✓ | ✓ | ✗ | ✓ |
| `customers.create` | Register new customer / patient | Customers | ✓ | ✓ | ✓ | ✗ | ✗ |
| `customers.update` | Edit customer contact, GST, doctor & status | Customers | ✓ | ✓ | ✗ | ✗ | ✗ |
| `customers.archive` | Archive inactive zero-balance customers | Customers | ✓ | ✗ | ✗ | ✗ | ✗ |
| `customers.view_phone` | View unmasked customer mobile numbers | Customers | ✓ | ✓ | ✓ | ✗ | ✗ |
| `customers.view_purchase_history` | Inspect linked customer invoice history | Customers | ✓ | ✓ | ✓ | ✗ | ✓ |
| `customers.khata_view` | View customer Khata credit balance & ledger | Customers | ✓ | ✓ | ✓ | ✗ | ✓ |
| `customers.khata_collect` | Accept repayments against Khata credit | Customers | ✓ | ✓ | ✓ | ✗ | ✗ |
| `customers.khata_settle` | Settle open Khata credit invoices | Customers | ✓ | ✓ | ✓ | ✗ | ✗ |
| `customers.credit_limit_manage` | Modify customer Khata credit limit & terms | Customers | ✓ | ✗ | ✗ | ✗ | ✗ |
| `customers.credit_override` | Authorize POS credit billing above credit limit | Customers | ✓ | ✗ | ✗ | ✗ | ✗ |
| `customers.credit_note` | Issue sales return or rebate credit notes | Customers | ✓ | ✗ | ✗ | ✗ | ✗ |
| `customers.balance_adjust` | Post audited debit/credit/opening adjustments | Customers | ✓ | ✗ | ✗ | ✗ | ✗ |
| `customers.statement_view` | View period customer Khata statements | Customers | ✓ | ✓ | ✓ | ✗ | ✓ |
| `customers.statement_export` | Export Khata statements to CSV / PDF | Customers | ✓ | ✓ | ✗ | ✗ | ✓ |
| `customers.statement_share` | Generate sanitized WhatsApp share summaries | Customers | ✓ | ✓ | ✗ | ✗ | ✗ |
| `customers.reports_view` | View outstanding & overdue aging reports | Customers | ✓ | ✓ | ✗ | ✗ | ✓ |
| `suppliers.view` | View distributor directory & profiles | Suppliers | ✓ | ✓ | ✗ | ✗ | ✓ |
| `suppliers.create` | Register new pharmaceutical distributors | Suppliers | ✓ | ✓ | ✗ | ✗ | ✗ |
| `suppliers.update` | Edit supplier details & terms | Suppliers | ✓ | ✓ | ✗ | ✗ | ✗ |
| `suppliers.archive` | Archive zero-balance inactive suppliers | Suppliers | ✓ | ✗ | ✗ | ✗ | ✗ |
| `suppliers.view_financials` | View supplier payables, limits & balances | Suppliers | ✓ | ✗ | ✗ | ✗ | ✓ |
| `suppliers.view_bank_details` | View bank account / IFSC / UPI details | Suppliers | ✓ | ✗ | ✗ | ✗ | ✗ |
| `suppliers.export` | Export supplier statements (CSV/PDF) | Suppliers | ✓ | ✗ | ✗ | ✗ | ✓ |
| `suppliers.manage` | Legacy composite supplier management key | Suppliers | ✓ | ✓ | ✗ | ✗ | ✗ |
| `suppliers.payables` | Legacy composite payables view key | Suppliers | ✓ | ✗ | ✗ | ✗ | ✗ |
| `purchases.manage` | Legacy composite procurement management key | Purchases | ✓ | ✓ | ✗ | ✗ | ✗ |
| `purchase_orders.view` | View Purchase Orders | Purchases | ✓ | ✓ | ✗ | ✗ | ✓ |
| `purchase_orders.create` | Create draft Purchase Orders | Purchases | ✓ | ✓ | ✗ | ✗ | ✗ |
| `purchase_orders.update` | Edit draft/pending Purchase Orders | Purchases | ✓ | ✓ | ✗ | ✗ | ✗ |
| `purchase_orders.submit` | Submit PO for approval | Purchases | ✓ | ✓ | ✗ | ✗ | ✗ |
| `purchase_orders.approve` | Approve submitted Purchase Orders | Purchases | ✓ | ✗ | ✗ | ✗ | ✗ |
| `purchase_orders.cancel` | Cancel unreceived Purchase Orders | Purchases | ✓ | ✗ | ✗ | ✗ | ✗ |
| `purchase_orders.close` | Short-close open/partial POs | Purchases | ✓ | ✗ | ✗ | ✗ | ✗ |
| `goods_receipts.view` | View Goods Receipt Notes (GRNs) | Goods Receipts | ✓ | ✓ | ✗ | ✗ | ✓ |
| `goods_receipts.create` | Create GRN batch intake records | Goods Receipts | ✓ | ✓ | ✗ | ✗ | ✗ |
| `goods_receipts.post` | Post GRNs into inventory batches | Goods Receipts | ✓ | ✓ | ✗ | ✗ | ✗ |
| `goods_receipts.correct` | Reverse GRNs & authorize over-receipts | Goods Receipts | ✓ | ✗ | ✗ | ✗ | ✗ |
| `goods_receipts.export` | Print & export GRN documents | Goods Receipts | ✓ | ✓ | ✗ | ✗ | ✓ |
| `supplier_invoices.view` | View supplier purchase invoices | Supplier Billing | ✓ | ✗ | ✗ | ✗ | ✓ |
| `supplier_invoices.create` | Recognize supplier invoices as payable | Supplier Billing | ✓ | ✗ | ✗ | ✗ | ✗ |
| `supplier_payments.view` | View outgoing supplier payment history | Supplier Billing | ✓ | ✗ | ✗ | ✗ | ✓ |
| `supplier_payments.create` | Record supplier payments & advances | Supplier Billing | ✓ | ✗ | ✗ | ✗ | ✗ |
| `supplier_returns.create` | Draft stock returns to suppliers | Supplier Returns | ✓ | ✓ | ✗ | ✗ | ✗ |
| `supplier_returns.approve` | Post stock return & credit note reduction | Supplier Returns | ✓ | ✗ | ✗ | ✗ | ✗ |
| `supplier_reports.view` | View procurement & payable reports | Reports | ✓ | ✓ | ✗ | ✗ | ✓ |
| `employees.view` | View employee directory and assignments | Staff | ✓ | ✗ | ✗ | ✗ | ✗ |
| `employees.invite` | Invite staff and assign roles/branches | Staff | ✓ | ✗ | ✗ | ✗ | ✗ |
| `employees.manage` | Update staff roles, branches & overrides | Staff | ✓ | ✗ | ✗ | ✗ | ✗ |
| `employees.deactivate` | Deactivate employee & block access immediately | Staff | ✓ | ✗ | ✗ | ✗ | ✗ |
| `branches.manage` | Configure pharmacy branches and counters | Branches | ✓ | ✗ | ✗ | ✗ | ✗ |
| `reports.view` | View sales summaries & operational analytics | Reports | ✓ | ✓ | ✓ | ✗ | ✓ |
| `reports.financial` | View P&L, cash register & margin reports | Reports | ✓ | ✗ | ✗ | ✗ | ✓ |
| `reports.gst` | Export GSTR-1 & GSTR-3B tax summaries | Reports | ✓ | ✗ | ✗ | ✗ | ✓ |
| `accounting.view` | View accounting overview & dashboard | Accounting | ✓ | ✗ | ✗ | ✗ | ✓ |
| `accounting.accounts.view` | Inspect Chart of Accounts & Account Ledgers | Accounting | ✓ | ✗ | ✗ | ✗ | ✓ |
| `accounting.accounts.manage` | Create/deactivate/delete custom accounts | Accounting | ✓ | ✗ | ✗ | ✗ | ✗ |
| `accounting.journals.view` | View posted double-entry journal vouchers | Accounting | ✓ | ✗ | ✗ | ✗ | ✓ |
| `accounting.journals.reverse` | Post audited reversal vouchers | Accounting | ✓ | ✗ | ✗ | ✗ | ✗ |
| `accounting.expenses.view` | View operating expense vouchers | Accounting | ✓ | ✓ | ✗ | ✗ | ✓ |
| `accounting.expenses.create` | Submit operating expense vouchers | Accounting | ✓ | ✓ | ✗ | ✗ | ✗ |
| `accounting.expenses.approve` | Approve or reverse operating expenses | Accounting | ✓ | ✗ | ✗ | ✗ | ✗ |
| `accounting.expenses.pay` | Settle approved unpaid expenses | Accounting | ✓ | ✗ | ✗ | ✗ | ✗ |
| `accounting.cash_bank.view` | View cash registers, bank accounts & recon | Accounting | ✓ | ✗ | ✗ | ✗ | ✓ |
| `accounting.cash_bank.manage` | Add banks, post contra transfers & bank charges | Accounting | ✓ | ✗ | ✗ | ✗ | ✗ |
| `accounting.periods.view` | View Indian FY accounting periods | Accounting | ✓ | ✗ | ✗ | ✗ | ✓ |
| `accounting.periods.close` | Lock accounting periods against backdated posts | Accounting | ✓ | ✗ | ✗ | ✗ | ✗ |
| `accounting.periods.reopen` | Audited reopening of closed periods | Accounting | ✓ | ✗ | ✗ | ✗ | ✗ |
| `accounting.opening_balances.manage` | Post opening balance sheet entries (offset `3200`) | Accounting | ✓ | ✗ | ✗ | ✗ | ✗ |
| `accounting.reconciliation.manage` | Execute idempotent historical ledger backfill | Accounting | ✓ | ✗ | ✗ | ✗ | ✗ |
| `accounting.reports.view` | View Trial Balance, P&L, Balance Sheet, Cash Flow, GST | Accounting | ✓ | ✗ | ✗ | ✗ | ✓ |
| `accounting.reports.export` | Download CSV & `%PDF-1.4` financial exports | Accounting | ✓ | ✗ | ✗ | ✗ | ✓ |
| `accounting.audit.view` | View GL vs subledger discrepancy exceptions | Accounting | ✓ | ✗ | ✗ | ✗ | ✓ |
| `accounting.manage` | Legacy composite accounting management key | Accounting | ✓ | ✗ | ✗ | ✗ | ✗ |
| `settings.manage` | Modify store licenses, GSTIN, & printer setup | Settings | ✓ | ✗ | ✗ | ✗ | ✗ |
| `audit.view` | Inspect security and transaction audit logs | Audit | ✓ | ✗ | ✗ | ✗ | ✓ |

*\*Note on Schedule H1 Dispensing: Cashiers may process Schedule H1 items only when prescriber details (`doctorName` / `doctorRegNumber`) are recorded and verified under a supervising registered pharmacist.*

### 3.1 Permission Aliases & Normalization (`server/src/lib/permissions.ts`)

`normalizePermissionKey()` converts colons to dots (`billing:create` $\rightarrow$ `billing.create`) and resolves Phase 5 & Phase 6 compatibility aliases:

| Alias Key | Canonical Registry Key | Phase / Scope |
| :--- | :--- | :--- |
| `medicine.view` | `medicines.view` | Phase 5 Medicines |
| `medicine.create` | `medicines.create` | Phase 5 Medicines |
| `medicine.update` | `medicines.edit` | Phase 5 Medicines |
| `medicine.archive` | `medicines.delete` | Phase 5 Medicines |
| `inventory.opening_stock` | `inventory.write` | Phase 5 Inventory |
| `inventory.view_movements` | `inventory.view` | Phase 5 Inventory |
| `inventory.view_expiry` | `inventory.view` | Phase 5 Inventory |
| `inventory.view_valuation` | `inventory.ptr_margin` | Phase 5 Valuation |
| `billing.collect_payment` | `billing.create` | Phase 6 Payment Collection |
| `billing.view_payment_history` | `billing.view` | Phase 6 Payment History |
| `billing.print_invoice` | `billing.view` | Phase 6 Receipt Snapshot |
| `billing.apply_custom_price` | `billing.discount` | Phase 6 Custom Discount/Price |
| `customers.credit_limit` | `customers.credit_limit_manage` | Phase 7 Credit Limit Compatibility Alias |

---

## 4. User-Level Overrides & Inheritance Logic

```mermaid
flowchart TD
    Start[Check Permission: e.g. billing.discount] --> OwnerCheck{Role == 'owner'?}
    OwnerCheck -->|Yes| AllowOwner[GRANTED via '*' Wildcard]
    OwnerCheck -->|No| RoleAndGrant[Combine DEFAULT_ROLE_PERMISSIONS[role] + overrides.granted]
    RoleAndGrant --> RevokeCheck{In overrides.revoked?}
    RevokeCheck -->|Yes| DenyRevoked[DENIED via Explicit Revocation]
    RevokeCheck -->|No| CheckMatch{Matches key or category.*?}
    CheckMatch -->|Yes| Allow[GRANTED]
    CheckMatch -->|No| Deny[DENIED by Default]
```

### Firestore Membership Document (`tenants/{tenantId}/memberships/{userId}`)
```json
{
  "userId": "usr_123",
  "tenantId": "tenant_001",
  "email": "pharmacist@patelmedicals.in",
  "name": "Dr. Ramesh Gupta",
  "role": "pharmacist",
  "status": "active",
  "assignedBranchIds": ["branch-main", "branch-counter-2"],
  "permissionOverrides": {
    "granted": ["billing.discount"],
    "revoked": ["inventory.ptr_margin"]
  },
  "permissions": ["dashboard.view", "billing.view", "billing.create", "billing.discount"],
  "invitedBy": "owner_usr_01",
  "createdAt": "2026-03-30T10:00:00.000Z",
  "updatedAt": "2026-03-30T10:00:00.000Z"
}
```

---

## 5. Immediate Employee Suspension & Deactivation

When an employee is deactivated (`PATCH /api/v1/tenants/:tenantId/employees/:userId/status` with `status: 'deactivated'`):
1. **Firestore Membership Update:** `tenants/{tenantId}/memberships/{userId}` updates `status` to `'deactivated'`.
2. **Immediate Access Block:** Because `tenantAuthorizationMiddleware` fetches the live membership document on every request, any subsequent API call fails immediately with `HTTP 403 Forbidden` (`ERR_EMPLOYEE_DEACTIVATED`).
3. **Immutable Audit Trail:** `AuditService` records `EMPLOYEE_DEACTIVATED` in `tenants/{tenantId}/audit_logs`.

---

## 6. Clinical Dispensing Authorization & Prescriber Verification

Under the Drugs and Cosmetics Act, 1940 and Rules 1945:
1. **Registered Pharmacist Metadata:** Pharmacist accounts store `pharmacistRegNumber` and registration expiry metadata on `tenants/{tenantId}/memberships/{userId}` and `users/{uid}`.
2. **Prescriber Details on Controlled Invoices:** Schedule H, H1, and X sales invoices capture `customer.doctorName` and `customer.doctorRegNumber` inside `tenants/{tenantId}/sales_invoices/{invoiceId}`.
3. **Store Compliance Policies (`tenants/{tenantId}.settings`):** Stores may enforce prescription scan uploads (stored in Firebase Storage under `tenants/{tenantId}/branches/{branchId}/prescriptions/...`) and supervising pharmacist sign-off metadata (`dispensedBy`).

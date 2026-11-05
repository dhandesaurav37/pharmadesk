# PharmaDesk Employee Permission & RBAC Model

**Document Version:** 1.0.0  
**Security Standard:** Role-Based Access Control (RBAC) with User-Level Overrides  
**Enforcement Boundary:** Mandatory Backend Express Middleware + PostgreSQL RLS Safeguards  

---

## 1. Principles of Authorization in PharmaDesk

1. **Backend as Source of Truth:**
   Frontend checks (`canBill`, `canManageStock`) exist solely for user interface ergonomics (e.g., hiding buttons and tabs). Every API endpoint independently enforces permission checks on the server using validated Firebase claims and tenant memberships.
2. **Strict Pharmacy Ownership & Multi-Tenancy:**
   All permissions are scoped within the user's active `tenant_id` and permitted `branch_ids`. A user holding the `OWNER` role in Store A has zero privileges in Store B.
3. **Platform Administrator Separation:**
   PharmaDesk SaaS operational staff (DevOps, Customer Support) possess platform maintenance roles (`SUPER_ADMIN`, `SUPPORT_AGENT`). Platform administration roles **never** automatically bypass pharmacy tenant boundaries or decrypt patient health information (PHI) or customer financial Khatas. Tenant inspection requires a customer-authorized, time-bound, audited support grant.

---

## 2. Default System Roles

### 2.1 Role: OWNER (Super Admin of Tenant)
- **Target User:** Medical store proprietor, pharmacy partner, or managing director.
- **Scope:** Complete administrative and operational control over their registered pharmacy and all branches.
- **Responsibilities:**
  - Manages employee profiles, state council registration verification, and role assignments.
  - Controls store settings, Drug Licenses (Form 20B/21B), GSTIN, and printer hardware.
  - Accesses confidential financials: profit & loss reports, supplier payables ledger, and banking cash reconciliations.
  - Authorizes audit adjustments and stock write-offs.

### 2.2 Role: PHARMACIST (Licensed B.Pharm / D.Pharm)
- **Target User:** Registered pharmacist holding valid State Pharmacy Council credentials.
- **Scope:** Clinical and inventory operations at assigned branches.
- **Responsibilities:**
  - Full dispensing rights on retail POS.
  - Verification of doctor prescriptions for **Schedule H, Schedule H1, and Schedule X** controlled drugs.
  - Maintenance of the Master Medicine directory (salt composition, contraindications, dosage forms).
  - Receipt of incoming stock batches from distributors (PTR/MRP verification).
  - Inward inventory adjustments and batch expiry reviews.

### 2.3 Role: CASHIER (Billing Counter Operator)
- **Target User:** Checkout counter clerk or retail billing operator.
- **Scope:** Fast-velocity point-of-sale terminal and payment receipt.
- **Responsibilities:**
  - Fast billing (POS) of OTC products and prescription medications (prescribed doctor details must be validated).
  - Collection of payments via Cash, UPI, Card, and Customer Khata Credit.
  - Collection of Khata repayments and generation of cash receipts.
  - Viewing daily shift counter totals.
  - **Restrictions:** Cannot edit medicine salt compositions, view distributor purchase costs (PTR), or access store profit margins.

### 2.4 Role: HELPER (Stock Assistant / Shelf Runner)
- **Target User:** Pharmacy assistant, shelf organizer, or store runner.
- **Scope:** Physical shelf stocking and customer queue assistance.
- **Responsibilities:**
  - Viewing medicine rack and shelf locations (e.g., "Rack A-2", "Cold Storage").
  - Physical counting of stock for periodic inventory audits.
  - Viewing pack sizes and brand names.
  - **Restrictions:** Zero access to billing checkout, financial ledgers, customer contact details, or wholesale purchase prices.

---

## 3. Comprehensive Permissions Matrix

| Permission Key | Description | Module | OWNER | PHARMACIST | CASHIER | HELPER |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **billing:view** | View billing counter and draft bills | Billing | ✓ | ✓ | ✓ | ✗ |
| **billing:create_invoice** | Dispense medicines and issue retail tax invoices | Billing | ✓ | ✓ | ✓ | ✗ |
| **billing:dispense_schedule_h1** | Dispense controlled Schedule H1/X medicines | Billing | ✓ | ✓ | ✗* | ✗ |
| **billing:apply_custom_discount** | Override default discount above store threshold | Billing | ✓ | ✓ | ✗ | ✗ |
| **billing:cancel_invoice** | Cancel or void an issued sales invoice | Billing | ✓ | ✗ | ✗ | ✗ |
| **billing:process_return** | Process patient medicine return and refund | Billing | ✓ | ✓ | ✗ | ✗ |
| **medicines:view** | View medicine formulary and salt catalog | Medicines | ✓ | ✓ | ✓ | ✓ |
| **medicines:create** | Add new medicines to master formulary | Medicines | ✓ | ✓ | ✗ | ✗ |
| **medicines:edit** | Edit drug salts, category, and HSN codes | Medicines | ✓ | ✓ | ✗ | ✗ |
| **medicines:delete** | Deactivate medicine from master catalog | Medicines | ✓ | ✗ | ✗ | ✗ |
| **inventory:view_stock** | View batch stock quantities and rack locations | Inventory | ✓ | ✓ | ✓ | ✓ |
| **inventory:view_ptr_margin** | View wholesale purchase price (PTR) and margins | Inventory | ✓ | ✓ | ✗ | ✗ |
| **inventory:inward_stock** | Inward new batch from stockist with rates | Inventory | ✓ | ✓ | ✗ | ✗ |
| **inventory:audit_adjust** | Perform manual physical count adjustment | Inventory | ✓ | ✓ | ✗ | ✗ |
| **inventory:dispose_expiry** | Record disposal/write-off of expired batches | Inventory | ✓ | ✓ | ✗ | ✗ |
| **customers:view** | View patient directory and visit history | Customers | ✓ | ✓ | ✓ | ✗ |
| **customers:create** | Register new patient / customer | Customers | ✓ | ✓ | ✓ | ✗ |
| **customers:view_khata** | View customer Khata credit ledger | Customers | ✓ | ✓ | ✓ | ✗ |
| **customers:settle_khata** | Accept cash/UPI payment against Khata due | Customers | ✓ | ✓ | ✓ | ✗ |
| **customers:edit_credit_limit** | Modify customer Khata credit limit | Customers | ✓ | ✗ | ✗ | ✗ |
| **suppliers:view** | View distributor list and contact info | Suppliers | ✓ | ✓ | ✗ | ✗ |
| **suppliers:create_edit** | Add or modify stockist profiles and licenses | Suppliers | ✓ | ✓ | ✗ | ✗ |
| **suppliers:view_payables** | View distributor outstanding balance & ledger | Suppliers | ✓ | ✗ | ✗ | ✗ |
| **purchases:view** | View purchase orders and goods receipts | Purchases | ✓ | ✓ | ✗ | ✗ |
| **purchases:create_po** | Create purchase order for distributors | Purchases | ✓ | ✓ | ✗ | ✗ |
| **purchases:inward_receipt** | Commit goods receipt against supplier invoice | Purchases | ✓ | ✓ | ✗ | ✗ |
| **accounts:view_cash_register**| View current day counter cash drawer | Accounts | ✓ | ✓ | ✓ | ✗ |
| **accounts:view_financials** | View P&L, balance sheets, and bank ledgers | Accounts | ✓ | ✗ | ✗ | ✗ |
| **accounts:record_expense** | Record store operating expenses | Accounts | ✓ | ✓ | ✗ | ✗ |
| **employees:manage** | Add, invite, deactivate staff and set roles | Employees | ✓ | ✗ | ✗ | ✗ |
| **employees:view_attendance** | View staff shift records | Employees | ✓ | ✓ | ✗ | ✗ |
| **reports:sales_summary** | View daily sales summaries | Reports | ✓ | ✓ | ✓ | ✗ |
| **reports:gst_filing** | Export GSTR-1, GSTR-3B tax data | Reports | ✓ | ✗ | ✗ | ✗ |
| **reports:schedule_h1_log** | Export Schedule H1 statutory register | Reports | ✓ | ✓ | ✗ | ✗ |
| **settings:manage_store** | Modify store licenses, GSTIN, and printer setup| Settings | ✓ | ✗ | ✗ | ✗ |
| **audit:view_logs** | Inspect security and statutory audit trail | Audit | ✓ | ✗ | ✗ | ✗ |

*\*Note on Schedule H1 Dispensing: In Indian pharmacy operations, cashiers may bill Schedule H1 drugs ONLY if a registered Pharmacist verifies the physical prescription and the doctor's registration number is validated.*

---

## 4. User-Level Permission Overrides

PharmaDesk supports custom operational flexibility without requiring custom roles for every pharmacy:

1. **Grant Override (`is_granted = true`):**
   A Cashier who has earned trust may be granted `billing:apply_custom_discount` or `inventory:inward_stock` on a per-user basis.
2. **Deny Override (`is_granted = false`):**
   A probationary Pharmacist may have `inventory:audit_adjust` revoked until training is completed.

### Resolution Algorithm:
```
Effective Permission =
  IF EXISTS (user_permission_override WHERE user_id = :uid AND permission_id = :pid) THEN
      RETURN override.is_granted
  ELSE IF EXISTS (role_permissions WHERE role_id = user.primary_role_id AND permission_id = :pid) THEN
      RETURN true
  ELSE
      RETURN false
```

---

## 5. Backend Authorization Middleware Pattern

All protected Express routes execute an authorization middleware checking the resolved permission:

```typescript
// Example: src/middleware/authorize.ts
export const requirePermission = (permissionKey: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { tenantId, userId, role } = req.context;

    // 1. Check if user has an explicit override
    const override = await db.query(
      `SELECT is_granted FROM user_permission_overrides 
       WHERE tenant_id = $1 AND user_id = $2 
       AND permission_id = (SELECT id FROM permissions WHERE permission_key = $3)`,
      [tenantId, userId, permissionKey]
    );

    if (override.rows.length > 0) {
      if (override.rows[0].is_granted) return next();
      return res.status(403).json({
        type: 'https://pharmadesk.in/errors/forbidden',
        title: 'Access Denied',
        status: 403,
        detail: `Explicit denial override for permission: ${permissionKey}`,
      });
    }

    // 2. Check role default permissions
    const hasRolePermission = await db.query(
      `SELECT 1 FROM role_permissions rp
       JOIN roles r ON rp.role_id = r.id
       JOIN permissions p ON rp.permission_id = p.id
       WHERE (r.tenant_id = $1 OR r.is_system_role = true)
       AND r.role_key = $2 AND p.permission_key = $3`,
      [tenantId, role, permissionKey]
    );

    if (hasRolePermission.rows.length > 0) {
      return next();
    }

    return res.status(403).json({
      type: 'https://pharmadesk.in/errors/forbidden',
      title: 'Insufficient Permissions',
      status: 403,
      detail: `Role ${role} lacks required permission: ${permissionKey}`,
    });
  };
};
```

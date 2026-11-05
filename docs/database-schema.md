# PharmaDesk Relational Database Schema Specification

**Target Database:** PostgreSQL 16+ on Google Cloud SQL (`asia-south1`)  
**Design Standard:** 3NF Normalized Relational Architecture with Row-Level Security (RLS)  
**Primary Key Convention:** UUID v4 (`gen_random_uuid()`)  
**Monetary Precision Rule:** Strict `NUMERIC(12, 2)` or `NUMERIC(14, 4)` (Floating-point disallowed)  
**Timestamp Standard:** Standardized UTC with `TIMESTAMPTZ DEFAULT clock_timestamp()`  

---

## 1. Schema Design Principles & Conventions

1. **UUID Primary Keys:** All tables use `UUID PRIMARY KEY DEFAULT gen_random_uuid()` to prevent enumeration attacks, simplify client-side ID generation, and support multi-branch synchronization.
2. **Tenant Scoping:** Every operational table contains a non-nullable `tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT`.
3. **Branch Scoping:** Operational and transactional tables contain `branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT`.
4. **Historical Price Snapshotting:** `sales_invoice_items`, `purchase_order_items`, and `stock_movements` preserve the exact financial snapshot (MRP, PTR, Purchase Cost, Tax Slab, Discount) at the exact moment the transaction occurred. Master price changes never retroactively modify completed invoices.
5. **Double-Entry & Immutable Ledgers:** Stock adjustments and financial credit accounts maintain append-only ledgers (`stock_movements`, `customer_ledger`, `supplier_ledger`). Deletion or mutation of ledger rows is prohibited.
6. **Integrity Enforcement:** Database foreign keys use `ON DELETE RESTRICT` to prevent accidental cascades from deleting historic invoices, customers, or batch ledgers.

---

## 2. Complete Entity Relationship Overview

```
[tenants] 
   ├── [branches] 
   │      ├── [inventory_batches] <── [medicine_master]
   │      │      └── [stock_movements]
   │      ├── [sales_invoices]
   │      │      ├── [sales_invoice_items]
   │      │      ├── [payments]
   │      │      └── [sales_returns]
   │      ├── [goods_receipts] <── [purchase_orders]
   │      └── [expenses]
   ├── [users] <── [tenant_memberships] ──> [roles] ──> [role_permissions] ──> [permissions]
   │                                    └── [user_permission_overrides]
   ├── [customers]
   │      ├── [customer_ledger]
   │      └── [customer_sales_history]
   ├── [suppliers]
   │      ├── [supplier_ledger]
   │      └── [purchase_orders]
   ├── [subscriptions] ──> [plan_entitlements]
   └── [audit_logs]
```

---

## 3. Detailed Table Specifications & DDL

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TENANTS / PHARMACIES
-- Core multi-tenant pharmacy entity (business owner).
-- ============================================================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255) NOT NULL,
    legal_entity_type VARCHAR(50) NOT NULL DEFAULT 'Sole Proprietorship', -- Partnership, Private Limited, LLP
    dl_number_20b VARCHAR(100) NOT NULL, -- Retail allopathic drug license Form 20B
    dl_number_21b VARCHAR(100) NOT NULL, -- Retail specific drug license Form 21B
    gstin VARCHAR(15) NOT NULL, -- 15-character Indian GSTIN
    fssai_number VARCHAR(14), -- 14-digit FSSAI registration
    pan_number VARCHAR(10), -- 10-character Permanent Account Number
    contact_phone VARCHAR(20) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    primary_owner_id UUID, -- References users(id) once created
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- active, suspended, pending_verification
    default_timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX uq_tenants_gstin ON tenants(gstin);
CREATE INDEX idx_tenants_status ON tenants(status);

-- ============================================================================
-- 2. BRANCHES
-- Physical retail shops / store locations belonging to a tenant.
-- ============================================================================
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_code VARCHAR(20) NOT NULL, -- e.g., 'BR01', 'BANDRA_MAIN'
    name VARCHAR(255) NOT NULL, -- 'Apex Medicos Bandra West'
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    dl_number_20b VARCHAR(100), -- Branch-specific if distinct from tenant
    dl_number_21b VARCHAR(100),
    invoice_prefix VARCHAR(10) NOT NULL DEFAULT 'INV', -- e.g. 'AMB'
    thermal_printer_enabled BOOLEAN NOT NULL DEFAULT true,
    default_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    is_main_branch BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_branches_tenant_code UNIQUE (tenant_id, branch_code)
);

CREATE INDEX idx_branches_tenant_status ON branches(tenant_id, status);

-- ============================================================================
-- 3. USERS
-- Global user directory mapped to Firebase Authentication UIDs.
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    pharmacist_reg_number VARCHAR(100), -- State Pharmacy Council Registration (e.g. Maharashtra PCI)
    pharmacist_reg_expiry DATE,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- 4. TENANT_MEMBERSHIPS
-- Maps employees/users to specific pharmacy tenants and permitted branches.
-- ============================================================================
CREATE TABLE tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    primary_role VARCHAR(50) NOT NULL, -- 'owner', 'pharmacist', 'cashier', 'helper'
    permitted_branch_ids UUID[] NOT NULL DEFAULT '{}', -- Empty array implies all branches for owner
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- 'active', 'invited', 'deactivated'
    invited_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_tenant_user_membership UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_tenant_memberships_tenant ON tenant_memberships(tenant_id, status);
CREATE INDEX idx_tenant_memberships_user ON tenant_memberships(user_id);

-- ============================================================================
-- 5. ROLES
-- RBAC role definitions (Tenant-customizable or system-default).
-- ============================================================================
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT, -- NULL for system-wide defaults
    role_key VARCHAR(50) NOT NULL, -- 'owner', 'pharmacist', 'cashier', 'helper'
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_roles_tenant_key UNIQUE (tenant_id, role_key)
);

-- ============================================================================
-- 6. PERMISSIONS
-- Fine-grained system action capabilities.
-- ============================================================================
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_key VARCHAR(100) NOT NULL UNIQUE, -- e.g. 'billing:create_invoice'
    module VARCHAR(50) NOT NULL, -- 'billing', 'inventory', 'medicines', 'accounts', etc.
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_permissions_module ON permissions(module);

-- ============================================================================
-- 7. ROLE_PERMISSIONS
-- Connects roles to granted permissions.
-- ============================================================================
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);

-- ============================================================================
-- 8. USER_PERMISSION_OVERRIDES
-- Fine-grained per-employee permission grant/deny overrides.
-- ============================================================================
CREATE TABLE user_permission_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    is_granted BOOLEAN NOT NULL, -- true = explicit grant, false = explicit revoke
    granted_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_user_permission_override UNIQUE (tenant_id, user_id, permission_id)
);

-- ============================================================================
-- 9. MEDICINE_MASTER
-- Master drug dictionary and generic formulations (Tenant-level catalog).
-- ============================================================================
CREATE TABLE medicine_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    brand_name VARCHAR(255) NOT NULL,
    salt_composition TEXT NOT NULL, -- e.g. 'Paracetamol (650mg)'
    manufacturer VARCHAR(255) NOT NULL, -- e.g. 'Micro Labs Ltd'
    category VARCHAR(50) NOT NULL, -- Tablet, Capsule, Syrup, Injection, Ointment, Drops, Inhaler, Powder, Surgical
    schedule_class VARCHAR(30) NOT NULL, -- 'OTC', 'Schedule H', 'Schedule H1', 'Schedule X', 'Narcotic'
    hsn_code VARCHAR(20) NOT NULL DEFAULT '300490', -- Indian GST HSN code
    gst_slab NUMERIC(5, 2) NOT NULL DEFAULT 12.00, -- 0, 5, 12, 18
    pack_size VARCHAR(100) NOT NULL, -- '15 Tablets', '100 ml'
    prescription_required BOOLEAN NOT NULL DEFAULT true,
    min_stock_level INTEGER NOT NULL DEFAULT 15,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_medicine_master_tenant_search ON medicine_master(tenant_id, brand_name, salt_composition);
CREATE INDEX idx_medicine_master_schedule ON medicine_master(tenant_id, schedule_class);

-- ============================================================================
-- 10. INVENTORY_BATCHES
-- Physical formulation batches tracked per branch.
-- ============================================================================
CREATE TABLE inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    medicine_id UUID NOT NULL REFERENCES medicine_master(id) ON DELETE RESTRICT,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL, -- Standardized to last day of month
    pack_size VARCHAR(100) NOT NULL,
    mrp NUMERIC(12, 2) NOT NULL, -- Maximum Retail Price (INR)
    ptr NUMERIC(12, 2) NOT NULL, -- Price To Retailer (INR)
    purchase_cost NUMERIC(12, 2) NOT NULL, -- Net landed cost after trade discount
    current_stock INTEGER NOT NULL DEFAULT 0,
    rack_location VARCHAR(100) NOT NULL DEFAULT 'General Shelf', -- e.g. 'Rack A-2', 'Cold Storage (2-8°C)'
    barcode VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'normal', -- 'normal', 'low_stock', 'near_expiry', 'expired'
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_branch_batch_number UNIQUE (branch_id, medicine_id, batch_number),
    CONSTRAINT chk_non_negative_stock CHECK (current_stock >= 0)
);

CREATE INDEX idx_inventory_batches_search ON inventory_batches(branch_id, batch_number);
CREATE INDEX idx_inventory_batches_expiry ON inventory_batches(branch_id, expiry_date);
CREATE INDEX idx_inventory_batches_status ON inventory_batches(branch_id, status);

-- ============================================================================
-- 11. STOCK_MOVEMENTS
-- Immutable audit ledger recording all physical stock mutations.
-- ============================================================================
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
    medicine_id UUID NOT NULL REFERENCES medicine_master(id) ON DELETE RESTRICT,
    movement_type VARCHAR(50) NOT NULL, -- 'PURCHASE_RECEIPT', 'SALE_DISPENSE', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'INVENTORY_AUDIT_ADJUSTMENT', 'EXPIRY_DISPOSAL', 'BRANCH_TRANSFER'
    quantity_delta INTEGER NOT NULL, -- Positive for inward (+), negative for outward (-)
    balance_after INTEGER NOT NULL,
    unit_cost NUMERIC(12, 2) NOT NULL,
    reference_type VARCHAR(50), -- 'sales_invoices', 'goods_receipts', 'sales_returns', 'audit'
    reference_id UUID,
    notes TEXT,
    performed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_stock_movements_batch ON stock_movements(batch_id, created_at DESC);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);

-- ============================================================================
-- 12. SUPPLIERS
-- Wholesale stockists, distributors, and C&F agents.
-- ============================================================================
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    agency_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    address TEXT,
    dl_number VARCHAR(100) NOT NULL, -- Wholesale Form 20B/21B license
    gstin VARCHAR(15) NOT NULL,
    payment_terms VARCHAR(50) NOT NULL DEFAULT 'Net 21 days', -- 'Net 15 days', 'Net 30 days', 'COD'
    outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_suppliers_tenant_gstin UNIQUE (tenant_id, gstin)
);

CREATE INDEX idx_suppliers_tenant_name ON suppliers(tenant_id, agency_name);

-- ============================================================================
-- 13. PURCHASE_ORDERS
-- Outward purchase intents placed with distributors.
-- ============================================================================
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    po_number VARCHAR(100) NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'draft', -- 'draft', 'issued', 'partially_received', 'completed', 'cancelled'
    total_estimated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_po_tenant_number UNIQUE (tenant_id, po_number)
);

-- ============================================================================
-- 14. PURCHASE_ORDER_ITEMS
-- Formulation line items for a purchase order.
-- ============================================================================
CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES medicine_master(id) ON DELETE RESTRICT,
    requested_pack_size VARCHAR(100) NOT NULL,
    ordered_quantity INTEGER NOT NULL,
    received_quantity INTEGER NOT NULL DEFAULT 0,
    estimated_ptr NUMERIC(12, 2) NOT NULL,
    gst_slab NUMERIC(5, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 15. GOODS_RECEIPTS (Purchase Inwarding)
-- Physical inwarding of medicines against supplier GST tax invoice.
-- ============================================================================
CREATE TABLE goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    supplier_invoice_number VARCHAR(100) NOT NULL,
    supplier_invoice_date DATE NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    trade_discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    taxable_amount NUMERIC(12, 2) NOT NULL,
    cgst_amount NUMERIC(12, 2) NOT NULL,
    sgst_amount NUMERIC(12, 2) NOT NULL,
    igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    round_off NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    total_invoice_amount NUMERIC(12, 2) NOT NULL,
    itc_eligible BOOLEAN NOT NULL DEFAULT true, -- Input Tax Credit eligibility
    invoice_document_url TEXT, -- GCS private document URL
    received_by UUID NOT NULL REFERENCES users(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_supplier_invoice_entry UNIQUE (tenant_id, supplier_id, supplier_invoice_number)
);

CREATE INDEX idx_goods_receipts_supplier ON goods_receipts(supplier_id, received_at DESC);

-- ============================================================================
-- 16. CUSTOMERS
-- Master patient and retail customer directory (Tenant-wide).
-- ============================================================================
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    doctor_name VARCHAR(255), -- Regular consulting physician
    doctor_registration_number VARCHAR(100),
    khata_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Outstanding credit balance (INR)
    khata_credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 5000.00,
    total_visits INTEGER NOT NULL DEFAULT 0,
    total_purchased NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    last_visit_at TIMESTAMPTZ,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_customers_tenant_phone UNIQUE (tenant_id, phone)
);

CREATE INDEX idx_customers_tenant_search ON customers(tenant_id, name, phone);
CREATE INDEX idx_customers_khata_due ON customers(tenant_id, khata_balance) WHERE khata_balance > 0;

-- ============================================================================
-- 17. CUSTOMER_SALES_HISTORY
-- Aggregated patient prescription and therapeutic compliance view.
-- ============================================================================
CREATE TABLE customer_sales_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES medicine_master(id) ON DELETE RESTRICT,
    first_dispensed_at TIMESTAMPTZ NOT NULL,
    last_dispensed_at TIMESTAMPTZ NOT NULL,
    total_units_dispensed INTEGER NOT NULL,
    expected_refill_date DATE, -- Calculated for chronic conditions (e.g. hypertension, diabetes)
    CONSTRAINT uq_customer_medicine_history UNIQUE (customer_id, medicine_id)
);

-- ============================================================================
-- 18. SALES_INVOICES (Point of Sale Bills)
-- Immutable retail tax invoice issued to patients/customers.
-- ============================================================================
CREATE TABLE sales_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    invoice_number VARCHAR(100) NOT NULL, -- Generated sequentially: 'AMB-2026-1049'
    invoice_sequence BIGINT NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE, -- Prevents accidental duplicate billing submissions
    customer_name VARCHAR(255) NOT NULL, -- Stored explicitly to preserve historical receipt even if customer modified
    customer_phone VARCHAR(20),
    doctor_name VARCHAR(255),
    doctor_reg_number VARCHAR(100), -- Mandatory for Schedule H1
    prescription_doc_url TEXT, -- GCS URL for uploaded prescription
    subtotal_mrp NUMERIC(12, 2) NOT NULL,
    total_discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    taxable_amount NUMERIC(12, 2) NOT NULL,
    cgst_amount NUMERIC(12, 2) NOT NULL,
    sgst_amount NUMERIC(12, 2) NOT NULL,
    igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    round_off NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(12, 2) NOT NULL,
    payment_mode VARCHAR(30) NOT NULL, -- 'cash', 'upi', 'card', 'khata_credit', 'split'
    status VARCHAR(30) NOT NULL DEFAULT 'completed', -- 'completed', 'cancelled', 'returned'
    dispensed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_branch_invoice_number UNIQUE (branch_id, invoice_number)
);

CREATE INDEX idx_sales_invoices_branch_date ON sales_invoices(branch_id, created_at DESC);
CREATE INDEX idx_sales_invoices_customer ON sales_invoices(customer_id);

-- ============================================================================
-- 19. SALES_INVOICE_ITEMS
-- Itemized formulations sold in an invoice (Preserves historical rates).
-- ============================================================================
CREATE TABLE sales_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
    medicine_id UUID NOT NULL REFERENCES medicine_master(id) ON DELETE RESTRICT,
    brand_name VARCHAR(255) NOT NULL,
    salt_composition TEXT NOT NULL,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    pack_size VARCHAR(100) NOT NULL,
    hsn_code VARCHAR(20) NOT NULL,
    schedule_class VARCHAR(30) NOT NULL,
    quantity INTEGER NOT NULL,
    mrp NUMERIC(12, 2) NOT NULL,
    ptr NUMERIC(12, 2) NOT NULL,
    discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gst_slab NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
    taxable_value NUMERIC(12, 2) NOT NULL,
    cgst_amount NUMERIC(12, 2) NOT NULL,
    sgst_amount NUMERIC(12, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_sales_invoice_items_invoice ON sales_invoice_items(sales_invoice_id);
CREATE INDEX idx_sales_invoice_items_schedule ON sales_invoice_items(schedule_class) WHERE schedule_class IN ('Schedule H1', 'Schedule X');

-- ============================================================================
-- 20. PAYMENTS
-- Financial transactions recorded for invoices and Khata settlements.
-- ============================================================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    reference_type VARCHAR(50) NOT NULL, -- 'sales_invoice', 'khata_repayment', 'supplier_payment'
    reference_id UUID NOT NULL,
    payment_method VARCHAR(30) NOT NULL, -- 'cash', 'upi', 'card', 'neft_rtgs', 'cheque'
    amount NUMERIC(12, 2) NOT NULL,
    transaction_ref_number VARCHAR(100), -- UPI UTR / Card terminal authorization code
    payer_name VARCHAR(255),
    received_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(30) NOT NULL DEFAULT 'success',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_payments_reference ON payments(reference_type, reference_id);

-- ============================================================================
-- 21. SALES_RETURNS
-- Patient returns / credit note adjustments for issued invoices.
-- ============================================================================
CREATE TABLE sales_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    sales_invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
    return_number VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    refund_amount NUMERIC(12, 2) NOT NULL,
    refund_mode VARCHAR(30) NOT NULL, -- 'cash', 'upi', 'khata_adjustment'
    authorized_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_branch_return_number UNIQUE (branch_id, return_number)
);

-- ============================================================================
-- 22. EXPENSES
-- Operating expenses incurred by a pharmacy branch.
-- ============================================================================
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    category VARCHAR(100) NOT NULL, -- 'Electricity', 'Rent', 'Staff Salary', 'Packaging', 'Software', 'Maintenance'
    amount NUMERIC(12, 2) NOT NULL,
    payment_mode VARCHAR(30) NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    description TEXT,
    receipt_document_url TEXT,
    recorded_by UUID NOT NULL REFERENCES users(id),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 23. SUPPLIER_LEDGER
-- Financial accounts payable statement for stockists.
-- ============================================================================
CREATE TABLE supplier_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    entry_type VARCHAR(30) NOT NULL, -- 'INVOICE_BILL', 'PAYMENT', 'DEBIT_NOTE_RETURN', 'DISCOUNT_CREDIT'
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Increases amount owed to supplier
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,  -- Decreases amount owed to supplier
    running_balance NUMERIC(12, 2) NOT NULL,
    reference_type VARCHAR(50), -- 'goods_receipts', 'payments', 'returns'
    reference_id UUID,
    description TEXT,
    recorded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_supplier_ledger_supplier ON supplier_ledger(supplier_id, created_at DESC);

-- ============================================================================
-- 24. CUSTOMER_LEDGER
-- Financial accounts receivable statement for customer Khata credit accounts.
-- ============================================================================
CREATE TABLE customer_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    entry_type VARCHAR(30) NOT NULL, -- 'CREDIT_PURCHASE', 'CASH_PAYMENT', 'UPI_PAYMENT', 'RETURN_CREDIT'
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,  -- Increases customer debt (purchase)
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Decreases customer debt (repayment)
    running_balance NUMERIC(12, 2) NOT NULL,
    reference_type VARCHAR(50), -- 'sales_invoices', 'payments', 'sales_returns'
    reference_id UUID,
    notes TEXT,
    recorded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_customer_ledger_customer ON customer_ledger(customer_id, created_at DESC);

-- ============================================================================
-- 25. AUDIT_LOGS
-- Comprehensive regulatory and security audit trail.
-- ============================================================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    action VARCHAR(100) NOT NULL, -- 'AUTH_LOGIN', 'DISPENSE_SCHEDULE_H1', 'STOCK_ADJUSTMENT', 'PRICE_OVERRIDE'
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    old_state JSONB,
    new_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_audit_logs_tenant_action ON audit_logs(tenant_id, action, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- ============================================================================
-- 26. SUBSCRIPTIONS AND PLAN_ENTITLEMENTS
-- SaaS billing and plan capacity enforcement.
-- ============================================================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    plan_tier VARCHAR(50) NOT NULL DEFAULT 'standard', -- 'starter', 'standard', 'multi_branch', 'enterprise'
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'annual', -- 'monthly', 'annual'
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- 'trial', 'active', 'past_due', 'cancelled'
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE plan_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    max_branches INTEGER NOT NULL DEFAULT 1,
    max_staff_users INTEGER NOT NULL DEFAULT 5,
    max_invoices_per_month INTEGER NOT NULL DEFAULT 10000,
    sms_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    whatsapp_receipts_enabled BOOLEAN NOT NULL DEFAULT false,
    analytics_export_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 4. PostgreSQL Triggers for Critical Business Invariants

### 4.1 Invariant 1: Prevent Negative Inventory
```sql
CREATE OR REPLACE FUNCTION trg_fn_prevent_negative_inventory()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_stock < 0 THEN
        RAISE EXCEPTION 'Negative inventory disallowed: formulation batch % cannot have stock %',
            NEW.batch_number, NEW.current_stock
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_inventory_stock
BEFORE INSERT OR UPDATE ON inventory_batches
FOR EACH ROW
EXECUTE FUNCTION trg_fn_prevent_negative_inventory();
```

### 4.2 Invariant 2: Immutable Sales Invoices
```sql
CREATE OR REPLACE FUNCTION trg_fn_prevent_invoice_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Only status transitions to 'cancelled' or 'returned' are permitted; financial values cannot change
        IF OLD.subtotal_mrp <> NEW.subtotal_mrp OR
           OLD.total_discount <> NEW.total_discount OR
           OLD.taxable_amount <> NEW.taxable_amount OR
           OLD.grand_total <> NEW.grand_total THEN
            RAISE EXCEPTION 'Financial figures on issued sales invoice % are immutable.', OLD.invoice_number
                USING ERRCODE = 'restrict_violation';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Deletion of issued sales invoice % is strictly prohibited for statutory compliance.', OLD.invoice_number
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_sales_invoices
BEFORE UPDATE OR DELETE ON sales_invoices
FOR EACH ROW
EXECUTE FUNCTION trg_fn_prevent_invoice_mutation();
```

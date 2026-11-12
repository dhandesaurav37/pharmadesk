# PharmaDesk Hardened PostgreSQL Database Schema Specification

**Document Version:** 2.0.0 (Hardened Relational Specification)  
**Target Engine:** PostgreSQL 16+ on Google Cloud SQL (`asia-south1`)  
**Design Standard:** 3NF Normalized Relational Architecture with Row-Level Security (RLS)  
**Primary Key Convention:** UUID v4 (`gen_random_uuid()`)  
**Monetary Precision Rule:** Strict `NUMERIC(12, 2)` or `NUMERIC(14, 4)` (Floating-point disallowed)  
**Timestamp Standard:** Standardized UTC with `TIMESTAMPTZ DEFAULT clock_timestamp()`  
**Business Timezone Setting:** Explicit pharmacy-local timezone stored on `tenants` (`Asia/Kolkata`)  

---

## 1. Relational Integrity & Composite Key Isolation

### 1.1 The Cross-Tenant Reference Vulnerability & Its Resolution
In a shared-database multi-tenant system, relying solely on simple foreign keys (`REFERENCES medicine_master(id)`) creates a dangerous integrity loophole: if an application query mistakenly inserts an ID from Tenant B into Tenant A's invoice, the database accepts it because the ID exists in the foreign table.

**PharmaDesk Hardened Defense:**  
Every tenant-owned table defines a composite unique constraint on `(tenant_id, id)`. All child foreign keys are mandated to be composite foreign keys matching both `tenant_id` and the entity ID:

```sql
-- Pattern applied across all tenant tables:
ALTER TABLE medicine_master ADD CONSTRAINT uq_medicine_master_tenant_id UNIQUE (tenant_id, id);

ALTER TABLE sales_invoice_items ADD CONSTRAINT fk_invoice_items_medicine
    FOREIGN KEY (tenant_id, medicine_id)
    REFERENCES medicine_master (tenant_id, id)
    ON DELETE RESTRICT;
```
Through this rule, it is **mathematically impossible** for a record in Tenant A to reference a medicine, customer, batch, or invoice belonging to Tenant B, even in the event of an application software bug.

---

## 2. Complete Database DDL by Functional Domain

```sql
-- Enable necessary cryptographic and UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- DOMAIN 1: IDENTITY, TENANCY & ACCESS CONTROL
-- ============================================================================

-- 1.1 Tenants (Pharmacy Business Entity)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255) NOT NULL,
    legal_entity_type VARCHAR(50) NOT NULL DEFAULT 'Sole Proprietorship', -- Partnership, Private Limited, LLP
    dl_number_20b VARCHAR(100) NOT NULL, -- Retail allopathic Form 20B
    dl_number_21b VARCHAR(100) NOT NULL, -- Retail specific Form 21B
    gstin VARCHAR(15), -- 15-digit GSTIN (optional if below turnover threshold)
    fssai_number VARCHAR(14), -- 14-digit FSSAI registration
    pan_number VARCHAR(10), -- 10-digit PAN
    contact_phone VARCHAR(20) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    primary_owner_id UUID, -- References users(id) once created
    status VARCHAR(30) NOT NULL DEFAULT 'trial', -- 'trial', 'active', 'suspended', 'archived'
    default_timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_tenants_id_composite UNIQUE (id)
);

-- Note: GSTIN is not globally unique across tenants to accommodate multi-account testing, franchise workspaces, or exempt chemists below turnover limits
CREATE INDEX idx_tenants_gstin ON tenants(gstin) WHERE gstin IS NOT NULL AND gstin <> '';
CREATE INDEX idx_tenants_status ON tenants(status);

-- 1.2 Branches (Physical Retail Outlets)
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_code VARCHAR(20) NOT NULL, -- e.g., 'MAIN', 'BANDRA'
    name VARCHAR(255) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    dl_number_20b VARCHAR(100), -- Branch-specific if distinct from master tenant
    dl_number_21b VARCHAR(100),
    invoice_prefix VARCHAR(10) NOT NULL DEFAULT 'INV',
    thermal_printer_enabled BOOLEAN NOT NULL DEFAULT true,
    default_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    is_main_branch BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- 'active', 'inactive'
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_branches_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_branches_tenant_code UNIQUE (tenant_id, branch_code)
);

CREATE INDEX idx_branches_tenant_status ON branches(tenant_id, status);

-- 1.3 Users (Global User Directory mapped to Firebase Auth)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    pharmacist_reg_number VARCHAR(100), -- State Pharmacy Council Registration (B.Pharm/D.Pharm)
    pharmacist_reg_expiry DATE,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);

-- 1.4 Tenant Memberships (Links User to Pharmacy with Assigned Role)
CREATE TABLE tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    primary_role VARCHAR(50) NOT NULL, -- 'owner', 'pharmacist', 'cashier', 'helper'
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- 'active', 'invited', 'deactivated'
    invited_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_tenant_memberships_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_tenant_user_membership UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_tenant_memberships_lookup ON tenant_memberships(tenant_id, user_id, status);

-- 1.5 Membership Branches (Normalized Branch Access Junction)
CREATE TABLE membership_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    membership_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    assigned_by UUID NOT NULL REFERENCES users(id),
    CONSTRAINT uq_membership_branches UNIQUE (membership_id, branch_id),
    CONSTRAINT fk_mb_membership FOREIGN KEY (tenant_id, membership_id) REFERENCES tenant_memberships(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_mb_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_membership_branches_lookup ON membership_branches(branch_id, membership_id);

-- 1.6 Roles (System Defaults & Tenant Custom Roles)
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT, -- NULL for platform defaults
    role_key VARCHAR(50) NOT NULL, -- 'owner', 'pharmacist', 'cashier', 'helper'
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_roles_tenant_key UNIQUE (tenant_id, role_key)
);

-- 1.7 Permissions (Granular Action Capabilities)
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_key VARCHAR(100) NOT NULL UNIQUE, -- e.g. 'billing.create', 'inventory.view'
    module VARCHAR(50) NOT NULL, -- 'billing', 'inventory', 'medicines', 'customers', etc.
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 1.8 Role Permissions (Maps Roles to Granted Permissions)
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);

-- 1.9 User Permission Overrides (Explicit Grant/Deny Overrides)
CREATE TABLE user_permission_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    is_granted BOOLEAN NOT NULL, -- true = explicit grant, false = explicit deny
    granted_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_user_permission_override UNIQUE (tenant_id, user_id, permission_id),
    -- Guarantees user belongs to tenant before an override can be created:
    CONSTRAINT fk_upo_membership FOREIGN KEY (tenant_id, user_id) REFERENCES tenant_memberships(tenant_id, user_id) ON DELETE CASCADE
);

-- 1.10 Invitations (Pending Staff Onboarding Tokens)
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    invitation_token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_invitations_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX idx_invitations_token ON invitations(invitation_token);
CREATE INDEX idx_invitations_lookup ON invitations(tenant_id, phone, expires_at);

-- 1.11 Invitation Branches (Normalized Branch Assignment for Invitations - Replaces UUID array)
CREATE TABLE invitation_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    invitation_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_invitation_branches UNIQUE (invitation_id, branch_id),
    CONSTRAINT fk_inb_invitation FOREIGN KEY (tenant_id, invitation_id) REFERENCES invitations(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_inb_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_invitation_branches_lookup ON invitation_branches(branch_id, invitation_id);

-- 1.12 Subscriptions & Entitlements (SaaS Billing & Plan Limits)
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_key VARCHAR(50) NOT NULL UNIQUE, -- 'pilot', 'starter', 'growth', 'enterprise'
    name VARCHAR(100) NOT NULL,
    max_branches INTEGER NOT NULL DEFAULT 1,
    max_users INTEGER NOT NULL DEFAULT 5,
    max_invoices_per_month INTEGER NOT NULL DEFAULT 10000,
    price_annual_inr NUMERIC(10, 2) NOT NULL,
    price_monthly_inr NUMERIC(10, 2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'annual', -- 'monthly', 'annual'
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- 'trial', 'active', 'past_due', 'cancelled'
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- DOMAIN 2: MEDICINE CATALOGUE & FORMULARIES
-- ============================================================================

-- 2.1 Medicine Categories (Dosage Forms)
CREATE TABLE medicine_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE, -- 'Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Powder'
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 2.2 Manufacturers (Pharmaceutical Companies)
CREATE TABLE manufacturers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT, -- NULL for global Indian manufacturers
    name VARCHAR(255) NOT NULL, -- 'Micro Labs Ltd', 'Cipla Ltd', 'Sun Pharma'
    country VARCHAR(100) NOT NULL DEFAULT 'India',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_manufacturers_tenant_name UNIQUE (tenant_id, name)
);

-- 2.3 Medicine Schedules (Statutory Classifications)
CREATE TABLE medicine_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) NOT NULL UNIQUE, -- 'OTC', 'Schedule H', 'Schedule H1', 'Schedule X', 'Narcotic'
    display_name VARCHAR(100) NOT NULL,
    requires_prescription BOOLEAN NOT NULL DEFAULT true,
    requires_doctor_reg_number BOOLEAN NOT NULL DEFAULT false,
    requires_statutory_register BOOLEAN NOT NULL DEFAULT false,
    description TEXT
);

-- 2.4 Medicine Master (Formulary Catalog scoped to Tenant)
CREATE TABLE medicine_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    brand_name VARCHAR(255) NOT NULL,
    salt_composition TEXT NOT NULL, -- e.g. 'Paracetamol (650mg)'
    manufacturer_id UUID REFERENCES manufacturers(id) ON DELETE RESTRICT,
    manufacturer_name VARCHAR(255) NOT NULL, -- Cached for high-speed counter lookup
    category_id UUID REFERENCES medicine_categories(id) ON DELETE RESTRICT,
    category_name VARCHAR(50) NOT NULL,
    schedule_class VARCHAR(30) NOT NULL DEFAULT 'Schedule H',
    hsn_code VARCHAR(20) NOT NULL DEFAULT '300490', -- Indian GST HSN code
    gst_slab NUMERIC(5, 2) NOT NULL DEFAULT 12.00, -- 0, 5, 12, 18
    pack_size VARCHAR(100) NOT NULL, -- '15 Tablets', '100 ml'
    prescription_required BOOLEAN NOT NULL DEFAULT true,
    min_stock_level INTEGER NOT NULL DEFAULT 15,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_medicine_master_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX idx_medicine_master_search ON medicine_master(tenant_id, brand_name, salt_composition);
CREATE INDEX idx_medicine_master_schedule ON medicine_master(tenant_id, schedule_class);

-- 2.5 Medicine Barcodes (Multi-barcode support: EAN-13, custom retail tags)
CREATE TABLE medicine_barcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    medicine_id UUID NOT NULL,
    barcode VARCHAR(100) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_medicine_barcodes UNIQUE (tenant_id, barcode),
    CONSTRAINT fk_mb_medicine FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE CASCADE
);

-- ============================================================================
-- DOMAIN 3: INVENTORY, BATCHES & STOCK MOVEMENTS
-- ============================================================================

-- 3.1 Inventory Batches (Physical stock located in specific branch)
CREATE TABLE inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    medicine_id UUID NOT NULL,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    pack_size VARCHAR(100) NOT NULL,
    mrp NUMERIC(12, 2) NOT NULL, -- Maximum Retail Price (INR)
    ptr NUMERIC(12, 2) NOT NULL, -- Price to Retailer (wholesale purchase price)
    purchase_cost NUMERIC(12, 2) NOT NULL, -- Net landed purchase rate after scheme/discount
    current_stock INTEGER NOT NULL DEFAULT 0,
    rack_location VARCHAR(100) NOT NULL DEFAULT 'General Shelf',
    barcode VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'normal', -- 'normal', 'low_stock', 'near_expiry', 'expired'
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_inventory_batches_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_branch_medicine_batch UNIQUE (tenant_id, branch_id, medicine_id, batch_number),
    CONSTRAINT fk_ib_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ib_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_ib_medicine FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_non_negative_stock CHECK (current_stock >= 0)
);

CREATE INDEX idx_inventory_batches_query ON inventory_batches(tenant_id, branch_id, medicine_id, status);
CREATE INDEX idx_inventory_batches_expiry ON inventory_batches(tenant_id, branch_id, expiry_date);

-- 3.2 Stock Movements (Immutable physical stock movement ledger)
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    medicine_id UUID NOT NULL,
    movement_type VARCHAR(50) NOT NULL, -- 'GOODS_RECEIPT', 'SALE_DISPENSE', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'AUDIT_ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'DISPOSAL'
    quantity_delta INTEGER NOT NULL, -- Positive for inward (+), negative for outward (-)
    balance_after INTEGER NOT NULL,
    unit_cost NUMERIC(12, 2) NOT NULL,
    reference_type VARCHAR(50) NOT NULL, -- 'sales_invoices', 'goods_receipts', 'sales_returns', 'stock_adjustments', 'stock_transfers'
    reference_id UUID NOT NULL,
    notes TEXT,
    performed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_sm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sm_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_sm_batch FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_sm_medicine FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_stock_movements_batch ON stock_movements(tenant_id, batch_id, created_at DESC);
CREATE INDEX idx_stock_movements_ref ON stock_movements(tenant_id, reference_type, reference_id);

-- 3.3 Stock Adjustments (Physical count variance records)
CREATE TABLE stock_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    system_stock INTEGER NOT NULL,
    counted_stock INTEGER NOT NULL,
    variance INTEGER NOT NULL, -- counted_stock - system_stock
    reason VARCHAR(100) NOT NULL, -- 'Physical Count Variance', 'Damage', 'Theft', 'Expired Waste'
    authorized_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_stock_adjustments_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_sa_batch FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT
);

-- 3.4 Stock Transfers & Transfer Items (Inter-Branch movements)
CREATE TABLE stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    transfer_number VARCHAR(100) NOT NULL,
    source_branch_id UUID NOT NULL,
    destination_branch_id UUID NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'issued', -- 'issued', 'in_transit', 'received', 'cancelled'
    issued_by UUID NOT NULL REFERENCES users(id),
    received_by UUID REFERENCES users(id),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    received_at TIMESTAMPTZ,
    notes TEXT,
    CONSTRAINT uq_stock_transfers_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_transfer_number UNIQUE (tenant_id, transfer_number),
    CONSTRAINT fk_st_source FOREIGN KEY (tenant_id, source_branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_st_dest FOREIGN KEY (tenant_id, destination_branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    transfer_id UUID NOT NULL,
    source_batch_id UUID NOT NULL,
    destination_batch_id UUID,
    quantity INTEGER NOT NULL,
    ptr NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_sti_transfer FOREIGN KEY (tenant_id, transfer_id) REFERENCES stock_transfers(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_sti_batch FOREIGN KEY (tenant_id, source_batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT
);

-- ============================================================================
-- DOMAIN 4: CUSTOMERS, PATIENTS & KHATA CREDIT
-- ============================================================================

-- 4.1 Customers (Master Patient Directory scoped to Tenant)
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    doctor_name VARCHAR(255),
    doctor_reg_number VARCHAR(100),
    khata_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Current net outstanding debt (INR)
    khata_credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 5000.00,
    total_visits INTEGER NOT NULL DEFAULT 0,
    total_purchased NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    last_visit_at TIMESTAMPTZ,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_customers_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_customers_tenant_phone UNIQUE (tenant_id, phone)
);

CREATE INDEX idx_customers_search ON customers(tenant_id, name, phone);
CREATE INDEX idx_customers_khata_due ON customers(tenant_id, khata_balance) WHERE khata_balance > 0;

-- 4.2 Customer Ledger (Append-only accounts receivable ledger)
CREATE TABLE customer_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    entry_type VARCHAR(30) NOT NULL, -- 'CREDIT_PURCHASE', 'CASH_PAYMENT', 'UPI_PAYMENT', 'RETURN_CREDIT', 'OPENING_BALANCE'
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,  -- Increases customer debt (sale on credit)
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Decreases customer debt (repayment/refund)
    running_balance NUMERIC(12, 2) NOT NULL,
    reference_type VARCHAR(50), -- 'sales_invoices', 'payments', 'sales_returns'
    reference_id UUID,
    notes TEXT,
    recorded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_cl_customer FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_cl_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_customer_ledger_history ON customer_ledger(tenant_id, customer_id, created_at DESC);

-- ============================================================================
-- DOMAIN 5: SUPPLIERS & PROCUREMENT
-- ============================================================================

-- 5.1 Suppliers (Wholesale Distributors & Stockists)
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
    gstin VARCHAR(15),
    payment_terms VARCHAR(50) NOT NULL DEFAULT 'Net 21 days',
    outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_suppliers_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX idx_suppliers_tenant_agency ON suppliers(tenant_id, agency_name);

-- 5.2 Supplier Ledger (Append-only accounts payable ledger)
CREATE TABLE supplier_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    entry_type VARCHAR(30) NOT NULL, -- 'INVOICE_BILL', 'PAYMENT', 'DEBIT_NOTE_RETURN', 'DISCOUNT_CREDIT'
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Increases liability to supplier (purchases)
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,  -- Decreases liability (payments/returns)
    running_balance NUMERIC(12, 2) NOT NULL,
    reference_type VARCHAR(50), -- 'goods_receipts', 'payments', 'purchase_returns'
    reference_id UUID,
    description TEXT,
    recorded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_sl_supplier FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_sl_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_supplier_ledger_history ON supplier_ledger(tenant_id, supplier_id, created_at DESC);

-- 5.3 Purchase Orders
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    po_number VARCHAR(100) NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'issued', -- 'draft', 'issued', 'partially_received', 'completed', 'cancelled'
    total_estimated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_purchase_orders_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_po_number UNIQUE (tenant_id, po_number),
    CONSTRAINT fk_po_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_po_supplier FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    purchase_order_id UUID NOT NULL,
    medicine_id UUID NOT NULL,
    pack_size VARCHAR(100) NOT NULL,
    ordered_quantity INTEGER NOT NULL,
    received_quantity INTEGER NOT NULL DEFAULT 0,
    estimated_ptr NUMERIC(12, 2) NOT NULL,
    gst_slab NUMERIC(5, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_poi_order FOREIGN KEY (tenant_id, purchase_order_id) REFERENCES purchase_orders(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_poi_medicine FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT
);

-- 5.4 Goods Receipts & Items (Physical stock inwarding)
CREATE TABLE goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    purchase_order_id UUID,
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
    itc_eligible BOOLEAN NOT NULL DEFAULT true,
    invoice_document_url TEXT,
    received_by UUID NOT NULL REFERENCES users(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_goods_receipts_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_supplier_invoice_entry UNIQUE (tenant_id, supplier_id, supplier_invoice_number),
    CONSTRAINT fk_gr_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_gr_supplier FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE goods_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    goods_receipt_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    medicine_id UUID NOT NULL,
    quantity_received INTEGER NOT NULL,
    free_quantity INTEGER NOT NULL DEFAULT 0, -- Scheme bonus e.g. 10+1
    ptr NUMERIC(12, 2) NOT NULL,
    mrp NUMERIC(12, 2) NOT NULL,
    gst_slab NUMERIC(5, 2) NOT NULL,
    total_cost NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_gri_receipt FOREIGN KEY (tenant_id, goods_receipt_id) REFERENCES goods_receipts(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_gri_batch FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_gri_medicine FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT
);

-- ============================================================================
-- DOMAIN 6: SALES & POINT OF SALE (POS)
-- ============================================================================

-- 6.0 Idempotency Keys (API Mutation Replay Prevention & State Tracking)
CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    request_path VARCHAR(255) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of JSON request body
    response_code INTEGER,
    response_body JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'processing', -- 'processing', 'completed', 'failed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '24 hours'),
    CONSTRAINT uq_idempotency_lookup UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fk_idem_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_idempotency_lookup ON idempotency_keys(tenant_id, idempotency_key);
CREATE INDEX idx_idempotency_expiry ON idempotency_keys(expires_at);

-- 6.1 Sales Invoices (Immutable Retail Bills)
CREATE TABLE sales_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    customer_id UUID,
    invoice_number VARCHAR(100) NOT NULL, -- e.g. 'AMB-2026-1049'
    invoice_sequence BIGINT NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20),
    doctor_name VARCHAR(255),
    doctor_reg_number VARCHAR(100),
    prescription_doc_url TEXT,
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
    CONSTRAINT uq_sales_invoices_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_branch_invoice_number UNIQUE (tenant_id, branch_id, invoice_number),
    CONSTRAINT uq_invoice_idempotency UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fk_si_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_si_customer FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX idx_sales_invoices_query ON sales_invoices(tenant_id, branch_id, created_at DESC);
CREATE INDEX idx_sales_invoices_customer ON sales_invoices(tenant_id, customer_id);

-- 6.2 Sales Invoice Items (Historical Line Item Snapshots)
CREATE TABLE sales_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    sales_invoice_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    medicine_id UUID NOT NULL,
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_sii_invoice FOREIGN KEY (tenant_id, sales_invoice_id) REFERENCES sales_invoices(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_sii_batch FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_sii_medicine FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_sales_invoice_items_invoice ON sales_invoice_items(tenant_id, sales_invoice_id);
CREATE INDEX idx_sales_invoice_items_h1 ON sales_invoice_items(tenant_id, schedule_class) WHERE schedule_class IN ('Schedule H1', 'Schedule X');

-- 6.3 Payments (Financial settlement transactions)
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    reference_type VARCHAR(50) NOT NULL, -- 'sales_invoice', 'khata_repayment', 'supplier_payment'
    reference_id UUID NOT NULL,
    payment_method VARCHAR(30) NOT NULL, -- 'cash', 'upi', 'card', 'neft_rtgs', 'cheque'
    amount NUMERIC(12, 2) NOT NULL,
    transaction_ref_number VARCHAR(100),
    payer_name VARCHAR(255),
    received_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(30) NOT NULL DEFAULT 'success',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_pay_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pay_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_payments_ref ON payments(tenant_id, reference_type, reference_id);

-- 6.4 Sales Returns & Items
CREATE TABLE sales_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    sales_invoice_id UUID NOT NULL,
    return_number VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    refund_amount NUMERIC(12, 2) NOT NULL,
    refund_mode VARCHAR(30) NOT NULL, -- 'cash', 'upi', 'khata_credit'
    authorized_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_sales_returns_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_return_number UNIQUE (tenant_id, branch_id, return_number),
    CONSTRAINT fk_sr_invoice FOREIGN KEY (tenant_id, sales_invoice_id) REFERENCES sales_invoices(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE sales_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    sales_return_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    quantity INTEGER NOT NULL,
    refund_unit_price NUMERIC(12, 2) NOT NULL,
    is_restocked BOOLEAN NOT NULL DEFAULT true, -- False if damaged/expired
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_sri_return FOREIGN KEY (tenant_id, sales_return_id) REFERENCES sales_returns(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_sri_batch FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT
);

-- ============================================================================
-- DOMAIN 7: DOUBLE-ENTRY ACCOUNTING & EXPENSES
-- ============================================================================

-- 7.1 Chart of Accounts (Standard accounting ledger accounts)
CREATE TABLE chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    account_code VARCHAR(20) NOT NULL, -- '1010' Cash, '1020' Bank, '1100' Debtors, '2000' Creditors, '4000' Sales, '5000' COGS
    name VARCHAR(150) NOT NULL,
    account_type VARCHAR(30) NOT NULL, -- 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
    parent_account_id UUID REFERENCES chart_of_accounts(id),
    is_system_account BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_chart_of_accounts_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_account_code UNIQUE (tenant_id, account_code),
    CONSTRAINT fk_coa_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

-- 7.2 Accounting Journals (Header of double-entry transaction)
CREATE TABLE accounting_journals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    journal_number VARCHAR(100) NOT NULL,
    journal_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_type VARCHAR(50) NOT NULL, -- 'SALES_INVOICE', 'GOODS_RECEIPT', 'CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT', 'EXPENSE', 'SALES_RETURN'
    reference_id UUID NOT NULL,
    description TEXT,
    posted_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_accounting_journals_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_journal_number UNIQUE (tenant_id, journal_number),
    CONSTRAINT fk_aj_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT
);

-- 7.3 Accounting Journal Entries (Debits & Credits)
CREATE TABLE accounting_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    journal_id UUID NOT NULL,
    account_id UUID NOT NULL,
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    narration TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_aje_journal FOREIGN KEY (tenant_id, journal_id) REFERENCES accounting_journals(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_aje_account FOREIGN KEY (tenant_id, account_id) REFERENCES chart_of_accounts(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_positive_debit CHECK (debit >= 0),
    CONSTRAINT chk_positive_credit CHECK (credit >= 0)
);

CREATE INDEX idx_aje_account_history ON accounting_journal_entries(tenant_id, account_id, created_at);

-- 7.4 Expense Categories & Expenses
CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL, -- 'Shop Rent', 'Electricity', 'Staff Salary', 'Packaging', 'Software'
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_expense_categories UNIQUE (tenant_id, name),
    CONSTRAINT fk_ec_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    category_id UUID NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    payment_mode VARCHAR(30) NOT NULL, -- 'cash', 'upi', 'bank_transfer'
    recipient_name VARCHAR(255) NOT NULL,
    description TEXT,
    receipt_document_url TEXT,
    recorded_by UUID NOT NULL REFERENCES users(id),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_exp_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_exp_cat FOREIGN KEY (tenant_id, category_id) REFERENCES expense_categories(tenant_id, id) ON DELETE RESTRICT
);

-- ============================================================================
-- DOMAIN 8: GOVERNANCE, AUDIT & EXPORT
-- ============================================================================

-- 8.1 Audit Logs (Regulatory and operational change audit trail)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    action VARCHAR(100) NOT NULL, -- 'AUTH_LOGIN', 'DISPENSE_SCHEDULE_H1', 'STOCK_ADJUSTMENT', 'PRICE_OVERRIDE', 'EXPORT_DATA'
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    old_state JSONB,
    new_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_audit_logs_tenant_time ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(tenant_id, action);

-- 8.2 Data Export Jobs (DPDP Act Compliance export requests)
CREATE TABLE data_export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    download_url TEXT,
    file_checksum_sha256 VARCHAR(64),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ
);
```

---

## 3. Database Triggers & Invariant Protections

### 3.1 Trigger 1: Negative Inventory Prevention
```sql
CREATE OR REPLACE FUNCTION trg_fn_prevent_negative_inventory()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_stock < 0 THEN
        RAISE EXCEPTION 'Negative inventory disallowed: formulation batch % (ID: %) cannot have stock %',
            NEW.batch_number, NEW.id, NEW.current_stock
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

### 3.2 Trigger 2: Sales Invoice Immutability
```sql
CREATE OR REPLACE FUNCTION trg_fn_prevent_invoice_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Allow status transitions to 'cancelled' or 'returned'; financial values are strictly immutable
        IF OLD.subtotal_mrp <> NEW.subtotal_mrp OR
           OLD.total_discount <> NEW.total_discount OR
           OLD.taxable_amount <> NEW.taxable_amount OR
           OLD.grand_total <> NEW.grand_total THEN
            RAISE EXCEPTION 'Financial figures on issued sales invoice % are immutable.', OLD.invoice_number
                USING ERRCODE = 'restrict_violation';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Deletion of issued sales invoice % is strictly prohibited by statutory tax law.', OLD.invoice_number
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

### 3.3 Trigger 3: Double-Entry Journal Balance Enforcement
```sql
CREATE OR REPLACE FUNCTION trg_fn_verify_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
    total_debit NUMERIC(12, 2);
    total_credit NUMERIC(12, 2);
BEGIN
    SELECT COALESCE(SUM(debit), 0.00), COALESCE(SUM(credit), 0.00)
    INTO total_debit, total_credit
    FROM accounting_journal_entries
    WHERE journal_id = NEW.journal_id;

    IF total_debit <> total_credit THEN
        RAISE EXCEPTION 'Accounting journal % is out of balance. Debits (%) must equal Credits (%).',
            NEW.journal_id, total_debit, total_credit
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_check_journal_balance
AFTER INSERT OR UPDATE ON accounting_journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_fn_verify_journal_balance();
```

---

## 4. PostgreSQL Row-Level Security (RLS) & Connection Safety Architecture

### 4.1 Connection Pool Setup & Safe Session Teardown
In a multi-tenant Node.js connection pool (e.g., `pg.Pool`), sockets are pooled and reused across incoming HTTP requests. To prevent cross-tenant session leakage without degrading connection pool throughput:

#### The Hazard of Casual `DISCARD ALL`
Casual execution of `DISCARD ALL` or `RESET ALL` upon connection return is strictly prohibited in PharmaDesk production pools.
* **Why `DISCARD ALL` is dangerous:** `DISCARD ALL` destroys all server-side prepared statements (`DEALLOCATE ALL`), invalidates cached query execution plans, drops temporary tables, and breaks connection pooler efficiency (such as Cloud SQL Auth Proxy or PgBouncer in transaction-pooling mode). Re-parsing and re-planning high-frequency POS queries on every counter transaction causes severe CPU spikes.

#### Production-Safe Connection Protocol
Instead, PharmaDesk guarantees connection hygiene through a four-tier architecture:

1. **Transaction-Scoped Session Context (`SET LOCAL`):**
   Every tenant operation executes strictly within an explicit transaction block:
   ```typescript
   const client = await pool.connect();
   try {
     await client.query('BEGIN');
     // Set local variables scoped strictly to this transaction:
     await client.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
     await client.query('SET LOCAL app.current_branch_id = $2', [branchId]);
     
     // ... execute application queries ...
     
     await client.query('COMMIT');
   } catch (error) {
     // Explicit rollback guarantees transaction termination:
     await client.query('ROLLBACK');
     throw error;
   } finally {
     // Sockets returned to the pool are guaranteed clean because COMMIT/ROLLBACK
     // purges all SET LOCAL settings automatically at the database engine level.
     client.release();
   }
   ```
2. **Fail-Closed Policy Evaluation:**
   The RLS policy uses `NULLIF(current_setting('app.current_tenant_id', true), '')::UUID`.
   If a query executes outside an active transaction or without setting `app.current_tenant_id`, `current_setting(..., true)` returns `NULL` or empty string. `NULLIF` evaluates to `NULL`.
   Because in SQL `tenant_id = NULL` evaluates to `UNKNOWN` (treated as `FALSE` by RLS), the query returns **zero rows**. It fails completely closed—no data can ever leak across tenants.

3. **Strict Database Role Separation:**
   * **Migration / DDL Role (`pharmadesk_migrator`):**
     * Owns all schema tables, views, and functions.
     * Executes schema migrations (Drizzle/Flyway).
     * Has `BYPASSRLS` attribute.
     * Used exclusively during deployment CI/CD pipelines; never used by the runtime web application.
   * **Application Runtime Role (`pharmadesk_app`):**
     * Used by the Express/Node.js backend.
     * Granted `SELECT, INSERT, UPDATE, DELETE` on operational tables.
     * Owns **zero** tables.
     * Strictly **forbidden** from having `BYPASSRLS` or `SUPERUSER`.
     * Even if raw SQL injection occurs, PostgreSQL enforces RLS at the engine kernel level.

### 4.2 Restrictive RLS Policy Pattern
Row-Level Security is applied and forced across all tenant tables:

```sql
-- Force RLS even for table owners (as an extra safeguard):
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices FORCE ROW LEVEL SECURITY;

-- Tenant Isolation Policy:
CREATE POLICY tenant_isolation_sales_invoices ON sales_invoices
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

-- Branch Scoping Policy (for branch-physical tables when user is restricted to a branch):
CREATE POLICY branch_isolation_sales_invoices ON sales_invoices
    AS RESTRICTIVE
    USING (
        NULLIF(current_setting('app.current_branch_id', true), '') IS NULL
        OR branch_id = NULLIF(current_setting('app.current_branch_id', true), '')::UUID
    );
```

### 4.3 Privileged Background Jobs & Audit Trails
- **System Maintenance:** Automated cron jobs (e.g., nightly batch expiry status updates) run via dedicated service functions under `pharmadesk_app` setting `SET LOCAL app.current_tenant_id` per iteration in an explicit cursor loop.
- **Audit Logging:** Every administrative or cross-tenant operational event is immutably logged in `audit_logs`.

---

## 5. Cloud Firestore Data Architecture — Phase 5 Medicine Catalogue & Batch Inventory

Under the Phase 3+ Firebase-First architecture, Cloud Firestore acts as the sole authoritative business database for medicine masters, batch-level stock, and immutable inventory movement ledgers.

### 5.1 Collection: `tenants/{tenantId}/medicines/{medicineId}`
Authoritative formulary master directory storing product identity, pharmaceutical composition, tax configuration, and regulatory drug schedule classification.

| Field Name | Type | Constraints / Description |
| :--- | :--- | :--- |
| `id` | `string` (UUID) | Unique medicine master identifier |
| `tenantId` | `string` | Tenant pharmacy partition boundary |
| `name` / `brandName` | `string` | Trade/commercial brand name (e.g., "Dolo 650", "Augmentin 625 Duo") |
| `genericName` / `saltComposition` | `string` | Active pharmaceutical ingredients & strength (e.g., "Paracetamol (650mg)") |
| `manufacturer` | `string` | Pharmaceutical manufacturing company (e.g., "Micro Labs Ltd") |
| `category` | `string` | Dosage formulation: `Tablet`, `Capsule`, `Syrup`, `Injection`, `Ointment`, `Drops`, `Inhaler`, `Powder` |
| `schedule` | `string` | Statutory schedule: `OTC`, `Schedule H`, `Schedule H1`, `Schedule X` |
| `hsnCode` | `string` | 6 to 8-digit GST Harmonized System of Nomenclature code (e.g., "300490") |
| `gstSlab` | `number` | GST tax percentage rate (`0`, `5`, `12`, `18`) |
| `packSize` | `string` | Package unit presentation (e.g., "10 Tablets", "100ml Syrup") |
| `rackLocation` | `string` | Default warehouse/shelf placement index (e.g., "Rack A-1") |
| `minStockLevel` | `number` | Minimum safety reorder threshold for branch alerts |
| `prescriptionRequired` | `boolean` | Statutory requirement for doctor prescription (mandatory for H, H1, X) |
| `barcode` | `string` (optional) | Unique GS1/UPC/EAN barcode string |
| `status` | `string` | Lifecycle status: `active` or `archived` (soft-deleted to preserve transaction history) |
| `createdAt` | `string` (ISO 8601) | Document creation timestamp |
| `updatedAt` | `string` (ISO 8601) | Document last modification timestamp |

**Uniqueness & Integrity Invariants:**
- `(tenantId, lower(name), lower(genericName), dosageForm)`: Checked prior to creation to prevent duplicate formulation entries.
- Soft-deletion: Deleting a medicine sets `status = 'archived'`. Historic batches, sales, and movement audit logs maintain foreign referential integrity.

---

### 5.2 Collection: `tenants/{tenantId}/inventory_batches/{batchId}`
Physical batch inventory holding independent expiration dates, pricing tiers, and real-time on-shelf stock counts scoped to specific branches.

| Field Name | Type | Constraints / Description |
| :--- | :--- | :--- |
| `id` | `string` (UUID) | Unique batch instance identifier |
| `tenantId` | `string` | Partition boundary |
| `branchId` | `string` | Branch physical outlet boundary (e.g., "branch-main") |
| `medicineId` | `string` | Foreign reference to `medicines/{medicineId}` |
| `medicineName` | `string` | Denormalized trade name for high-velocity lookups |
| `genericName` | `string` | Denormalized active composition |
| `batchNumber` | `string` | Uppercase manufacturer lot/batch number (e.g., "DL-9821") |
| `expiryDate` | `string` | Expiration date formatted as `YYYY-MM` or `YYYY-MM-DD` |
| `manufacturingDate` | `string` (optional) | Formulation date formatted as `YYYY-MM` or `YYYY-MM-DD` |
| `purchasePrice` / `ptr` | `number` | Wholesale Price To Retailer excluding/including input GST |
| `mrp` | `number` | Maximum Retail Price printed on packaging ($MRP \ge PTR$) |
| `sellingPrice` | `number` | Effective counter retail price before item-level discount |
| `quantityReceived` | `number` | Total units inwarded originally |
| `currentStock` | `number` | Real-time available units on shelf ($\ge 0$, strictly enforced) |
| `freeQuantity` | `number` | Bonus/scheme quantity provided by supplier |
| `packSize` | `string` | Batch packaging form factor |
| `rackLocation` | `string` | Physical rack/bin slot inside branch |
| `supplierId` | `string` (optional) | Registered distributor UUID |
| `status` | `string` | Batch state: `active`, `near_expiry`, `expired_quarantined`, `exhausted` |
| `createdAt` | `string` (ISO 8601) | Inward timestamp |
| `updatedAt` | `string` (ISO 8601) | Last stock adjustment or dispense timestamp |

**Inventory Invariants:**
- **Non-Negative Invariant:** `currentStock >= 0` is strictly verified in every transaction. Reductions causing negative stock are rejected with HTTP 409 Conflict / 422 Unprocessable Entity.
- **FEFO Dispensing Order:** Active batches for a medicine are sorted by `expiryDate ASC` so earliest-expiring stock is dispensed first.

---

### 5.3 Collection: `tenants/{tenantId}/stock_movements/{movementId}`
Append-only, immutable inventory movement ledger capturing every unit alteration across the entire tenant lifecycle.

| Field Name | Type | Constraints / Description |
| :--- | :--- | :--- |
| `id` | `string` (UUID) | Unique ledger sequence identifier |
| `tenantId` | `string` | Tenant partition |
| `branchId` | `string` | Outlets physical branch identifier |
| `batchId` | `string` | Referencing `inventory_batches/{batchId}` |
| `medicineId` | `string` | Referencing `medicines/{medicineId}` |
| `movementType` | `string` | Audit classification enum: `OPENING_STOCK`, `PURCHASE_RECEIPT`, `SALE`, `SALE_RETURN`, `PURCHASE_RETURN`, `DAMAGE`, `EXPIRY`, `MANUAL_ADJUSTMENT`, `STOCK_TRANSFER_IN`, `STOCK_TRANSFER_OUT` |
| `quantityDelta` | `number` | Signed integer change (positive for inwards/returns; negative for sales/disposals) |
| `balanceBefore` | `number` | Available units prior to movement execution |
| `balanceAfter` | `number` | Available units immediately following movement ($\equiv balanceBefore + quantityDelta$) |
| `referenceType` | `string` | Document origin: `opening_balance`, `invoice`, `return_note`, `audit_count`, `transfer` |
| `referenceId` | `string` | External/internal transaction or invoice ID |
| `notes` / `reason` | `string` | Mandatory explanation for manual adjustments or disposals |
| `actorId` | `string` | Authenticated user UID who performed the movement |
| `createdAt` | `string` (ISO 8601) | Immutable timestamp |

**Ledger Integrity Invariant:**
- Documents in `stock_movements` are strictly write-once, read-many (WORM). Neither updates nor deletions are permitted by backend services or security rules.


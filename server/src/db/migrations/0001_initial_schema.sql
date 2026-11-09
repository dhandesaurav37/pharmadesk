-- ============================================================================
-- PHARMADESK DATABASE MIGRATION 0001: INITIAL SCHEMA & REFERENCE DATA
-- Engine: PostgreSQL 16+ on Google Cloud SQL (asia-south1)
-- Standards: 3NF Relational Normalization, UUID v4, Strict NUMERIC Currency
-- ============================================================================

-- 0. Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- DOMAIN 1: IDENTITY, TENANCY & ACCESS CONTROL
-- ============================================================================

-- 1.1 Tenants (Pharmacy Business Entity)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255) NOT NULL,
    legal_entity_type VARCHAR(50) NOT NULL DEFAULT 'Sole Proprietorship',
    dl_number_20b VARCHAR(100) NOT NULL,
    dl_number_21b VARCHAR(100) NOT NULL,
    gstin VARCHAR(15),
    fssai_number VARCHAR(14),
    pan_number VARCHAR(10),
    contact_phone VARCHAR(20) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    primary_owner_id UUID,
    status VARCHAR(30) NOT NULL DEFAULT 'trial',
    default_timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_tenants_gstin ON tenants(gstin) WHERE gstin IS NOT NULL AND gstin <> '';
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- 1.2 Branches (Physical Retail Outlets)
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    dl_number_20b VARCHAR(100),
    dl_number_21b VARCHAR(100),
    invoice_prefix VARCHAR(10) NOT NULL DEFAULT 'INV',
    thermal_printer_enabled BOOLEAN NOT NULL DEFAULT true,
    default_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    is_main_branch BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_branches_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_branches_tenant_code UNIQUE (tenant_id, branch_code)
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant_status ON branches(tenant_id, status);

-- 1.3 Users (Global User Directory mapped to Firebase Auth)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    pharmacist_reg_number VARCHAR(100),
    pharmacist_reg_expiry DATE,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 1.4 Tenant Memberships (Links User to Pharmacy with Assigned Role)
CREATE TABLE IF NOT EXISTS tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    primary_role VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    invited_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_tenant_memberships_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_tenant_user_membership UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_lookup ON tenant_memberships(tenant_id, user_id, status);

-- 1.5 Membership Branches (Normalized Branch Access Junction)
CREATE TABLE IF NOT EXISTS membership_branches (
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

CREATE INDEX IF NOT EXISTS idx_membership_branches_lookup ON membership_branches(branch_id, membership_id);

-- 1.6 Roles (System Defaults & Tenant Custom Roles)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT,
    role_key VARCHAR(50) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_roles_tenant_key UNIQUE (tenant_id, role_key)
);

-- 1.7 Permissions (Granular Action Capabilities)
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_key VARCHAR(100) NOT NULL UNIQUE,
    module VARCHAR(50) NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 1.8 Role Permissions (Maps Roles to Granted Permissions)
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);

-- 1.9 User Permission Overrides (Explicit Grant/Deny Overrides)
CREATE TABLE IF NOT EXISTS user_permission_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    is_granted BOOLEAN NOT NULL,
    granted_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_user_permission_override UNIQUE (tenant_id, user_id, permission_id),
    CONSTRAINT fk_upo_membership FOREIGN KEY (tenant_id, user_id) REFERENCES tenant_memberships(tenant_id, user_id) ON DELETE CASCADE
);

-- 1.10 Invitations (Pending Staff Onboarding Tokens)
CREATE TABLE IF NOT EXISTS invitations (
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

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_invitations_lookup ON invitations(tenant_id, phone, expires_at);

-- 1.11 Invitation Branches (Normalized Branch Assignment for Invitations)
CREATE TABLE IF NOT EXISTS invitation_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    invitation_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_invitation_branches UNIQUE (invitation_id, branch_id),
    CONSTRAINT fk_inb_invitation FOREIGN KEY (tenant_id, invitation_id) REFERENCES invitations(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_inb_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invitation_branches_lookup ON invitation_branches(branch_id, invitation_id);

-- 1.12 Subscriptions & Entitlements (SaaS Billing & Plan Limits)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_key VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    max_branches INTEGER NOT NULL DEFAULT 1,
    max_users INTEGER NOT NULL DEFAULT 5,
    max_invoices_per_month INTEGER NOT NULL DEFAULT 10000,
    price_annual_inr NUMERIC(10, 2) NOT NULL,
    price_monthly_inr NUMERIC(10, 2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'annual',
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_subscriptions_tenant_id UNIQUE (tenant_id, id)
);

-- ============================================================================
-- DOMAIN 2: MEDICINE CATALOGUE & FORMULARIES
-- ============================================================================

-- 2.1 Medicine Categories (Dosage Forms)
CREATE TABLE IF NOT EXISTS medicine_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 2.2 Manufacturers (Pharmaceutical Companies)
CREATE TABLE IF NOT EXISTS manufacturers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'India',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_manufacturers_tenant_name UNIQUE (tenant_id, name)
);

-- 2.3 Medicine Schedules (Statutory Classifications)
CREATE TABLE IF NOT EXISTS medicine_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    requires_prescription BOOLEAN NOT NULL DEFAULT true,
    requires_doctor_reg_number BOOLEAN NOT NULL DEFAULT false,
    requires_statutory_register BOOLEAN NOT NULL DEFAULT false,
    description TEXT
);

-- 2.4 Medicine Master (Formulary Catalog scoped to Tenant)
CREATE TABLE IF NOT EXISTS medicine_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    brand_name VARCHAR(255) NOT NULL,
    salt_composition TEXT NOT NULL,
    manufacturer_id UUID REFERENCES manufacturers(id) ON DELETE RESTRICT,
    manufacturer_name VARCHAR(255) NOT NULL,
    category_id UUID REFERENCES medicine_categories(id) ON DELETE RESTRICT,
    category_name VARCHAR(50) NOT NULL,
    schedule_class VARCHAR(30) NOT NULL DEFAULT 'Schedule H',
    hsn_code VARCHAR(20) NOT NULL DEFAULT '300490',
    gst_slab NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
    pack_size VARCHAR(100) NOT NULL,
    prescription_required BOOLEAN NOT NULL DEFAULT true,
    min_stock_level INTEGER NOT NULL DEFAULT 15,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_medicine_master_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_medicine_master_search ON medicine_master(tenant_id, brand_name, salt_composition);
CREATE INDEX IF NOT EXISTS idx_medicine_master_schedule ON medicine_master(tenant_id, schedule_class);

-- 2.5 Medicine Barcodes
CREATE TABLE IF NOT EXISTS medicine_barcodes (
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
CREATE TABLE IF NOT EXISTS inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    medicine_id UUID NOT NULL,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    pack_size VARCHAR(100) NOT NULL,
    mrp NUMERIC(12, 2) NOT NULL,
    ptr NUMERIC(12, 2) NOT NULL,
    purchase_cost NUMERIC(12, 2) NOT NULL,
    current_stock INTEGER NOT NULL DEFAULT 0,
    rack_location VARCHAR(100) NOT NULL DEFAULT 'General Shelf',
    barcode VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'normal',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_inventory_batches_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_branch_medicine_batch UNIQUE (tenant_id, branch_id, medicine_id, batch_number),
    CONSTRAINT fk_ib_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ib_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_ib_medicine FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_non_negative_stock CHECK (current_stock >= 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_query ON inventory_batches(tenant_id, branch_id, medicine_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry ON inventory_batches(tenant_id, branch_id, expiry_date);

-- 3.2 Stock Movements (Immutable physical stock movement ledger)
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    medicine_id UUID NOT NULL,
    movement_type VARCHAR(50) NOT NULL,
    quantity_delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    unit_cost NUMERIC(12, 2) NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id UUID NOT NULL,
    notes TEXT,
    performed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_stock_movements_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_sm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sm_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_sm_batch FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_sm_medicine FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(tenant_id, batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(tenant_id, reference_type, reference_id);

-- 3.3 Stock Adjustments
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    system_stock INTEGER NOT NULL,
    counted_stock INTEGER NOT NULL,
    variance INTEGER NOT NULL,
    reason VARCHAR(100) NOT NULL,
    authorized_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_stock_adjustments_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_sa_batch FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT
);

-- 3.4 Stock Transfers & Transfer Items
CREATE TABLE IF NOT EXISTS stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    transfer_number VARCHAR(100) NOT NULL,
    source_branch_id UUID NOT NULL,
    destination_branch_id UUID NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'issued',
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

CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    transfer_id UUID NOT NULL,
    source_batch_id UUID NOT NULL,
    destination_batch_id UUID,
    quantity INTEGER NOT NULL,
    ptr NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_stock_transfer_items_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_sti_transfer FOREIGN KEY (tenant_id, transfer_id) REFERENCES stock_transfers(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_sti_batch FOREIGN KEY (tenant_id, source_batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT
);

-- ============================================================================
-- DOMAIN 4: CUSTOMERS, PATIENTS & KHATA CREDIT
-- ============================================================================

-- 4.1 Customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    doctor_name VARCHAR(255),
    doctor_reg_number VARCHAR(100),
    khata_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
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

CREATE INDEX IF NOT EXISTS idx_customers_search ON customers(tenant_id, name, phone);
CREATE INDEX IF NOT EXISTS idx_customers_khata_due ON customers(tenant_id, khata_balance) WHERE khata_balance > 0;

-- 4.2 Customer Ledger (Append-only accounts receivable ledger)
CREATE TABLE IF NOT EXISTS customer_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    entry_type VARCHAR(30) NOT NULL,
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    running_balance NUMERIC(12, 2) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    notes TEXT,
    recorded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_customer_ledger_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_cl_customer FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_cl_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_history ON customer_ledger(tenant_id, customer_id, created_at DESC);

-- ============================================================================
-- DOMAIN 5: SUPPLIERS & PROCUREMENT
-- ============================================================================

-- 5.1 Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    agency_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    address TEXT,
    dl_number VARCHAR(100) NOT NULL,
    gstin VARCHAR(15),
    payment_terms VARCHAR(50) NOT NULL DEFAULT 'Net 21 days',
    outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_suppliers_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_agency ON suppliers(tenant_id, agency_name);

-- 5.2 Supplier Ledger
CREATE TABLE IF NOT EXISTS supplier_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    entry_type VARCHAR(30) NOT NULL,
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    running_balance NUMERIC(12, 2) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    description TEXT,
    recorded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_supplier_ledger_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_sl_supplier FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_sl_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_history ON supplier_ledger(tenant_id, supplier_id, created_at DESC);

-- 5.3 Purchase Orders & Items
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    po_number VARCHAR(100) NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'issued',
    total_estimated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_purchase_orders_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_po_number UNIQUE (tenant_id, po_number),
    CONSTRAINT fk_po_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_po_supplier FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
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
    CONSTRAINT uq_purchase_order_items_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_poi_order FOREIGN KEY (tenant_id, purchase_order_id) REFERENCES purchase_orders(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_poi_medicine FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT
);

-- 5.4 Goods Receipts & Items
CREATE TABLE IF NOT EXISTS goods_receipts (
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

CREATE TABLE IF NOT EXISTS goods_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    goods_receipt_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    medicine_id UUID NOT NULL,
    quantity_received INTEGER NOT NULL,
    free_quantity INTEGER NOT NULL DEFAULT 0,
    ptr NUMERIC(12, 2) NOT NULL,
    mrp NUMERIC(12, 2) NOT NULL,
    gst_slab NUMERIC(5, 2) NOT NULL,
    total_cost NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_goods_receipt_items_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_gri_receipt FOREIGN KEY (tenant_id, goods_receipt_id) REFERENCES goods_receipts(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_gri_batch FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_gri_medicine FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT
);

-- ============================================================================
-- DOMAIN 6: SALES & POINT OF SALE (POS)
-- ============================================================================

-- 6.0 Idempotency Keys (API Mutation Replay Prevention)
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    request_path VARCHAR(255) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    response_code INTEGER,
    response_body JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'processing',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '24 hours'),
    CONSTRAINT uq_idempotency_keys_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_idempotency_lookup UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fk_idem_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_idempotency_lookup ON idempotency_keys(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency_keys(expires_at);

-- 6.1 Sales Invoices (Immutable Retail Bills)
CREATE TABLE IF NOT EXISTS sales_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    customer_id UUID,
    invoice_number VARCHAR(100) NOT NULL,
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
    payment_mode VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'completed',
    dispensed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_sales_invoices_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_branch_invoice_number UNIQUE (tenant_id, branch_id, invoice_number),
    CONSTRAINT uq_invoice_idempotency UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fk_si_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_si_customer FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_query ON sales_invoices(tenant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer ON sales_invoices(tenant_id, customer_id);

-- 6.2 Sales Invoice Items
CREATE TABLE IF NOT EXISTS sales_invoice_items (
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
    CONSTRAINT uq_sales_invoice_items_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_sii_invoice FOREIGN KEY (tenant_id, sales_invoice_id) REFERENCES sales_invoices(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_sii_batch FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_sii_medicine FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice ON sales_invoice_items(tenant_id, sales_invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_h1 ON sales_invoice_items(tenant_id, schedule_class) WHERE schedule_class IN ('Schedule H1', 'Schedule X');

-- 6.3 Payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id UUID NOT NULL,
    payment_method VARCHAR(30) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    transaction_ref_number VARCHAR(100),
    payer_name VARCHAR(255),
    received_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(30) NOT NULL DEFAULT 'success',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_payments_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_pay_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pay_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(tenant_id, reference_type, reference_id);

-- 6.4 Sales Returns & Items
CREATE TABLE IF NOT EXISTS sales_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    sales_invoice_id UUID NOT NULL,
    return_number VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    refund_amount NUMERIC(12, 2) NOT NULL,
    refund_mode VARCHAR(30) NOT NULL,
    authorized_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_sales_returns_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_return_number UNIQUE (tenant_id, branch_id, return_number),
    CONSTRAINT fk_sr_invoice FOREIGN KEY (tenant_id, sales_invoice_id) REFERENCES sales_invoices(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sales_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    sales_return_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    quantity INTEGER NOT NULL,
    refund_unit_price NUMERIC(12, 2) NOT NULL,
    is_restocked BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_sales_return_items_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_sri_return FOREIGN KEY (tenant_id, sales_return_id) REFERENCES sales_returns(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_sri_batch FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT
);

-- ============================================================================
-- DOMAIN 7: DOUBLE-ENTRY ACCOUNTING & EXPENSES
-- ============================================================================

-- 7.1 Chart of Accounts
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    account_code VARCHAR(20) NOT NULL,
    name VARCHAR(150) NOT NULL,
    account_type VARCHAR(30) NOT NULL,
    parent_account_id UUID REFERENCES chart_of_accounts(id),
    is_system_account BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_chart_of_accounts_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_account_code UNIQUE (tenant_id, account_code),
    CONSTRAINT fk_coa_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

-- 7.2 Accounting Journals
CREATE TABLE IF NOT EXISTS accounting_journals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    journal_number VARCHAR(100) NOT NULL,
    journal_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_type VARCHAR(50) NOT NULL,
    reference_id UUID NOT NULL,
    description TEXT,
    posted_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_accounting_journals_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_journal_number UNIQUE (tenant_id, journal_number),
    CONSTRAINT fk_aj_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT
);

-- 7.3 Accounting Journal Entries
CREATE TABLE IF NOT EXISTS accounting_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    journal_id UUID NOT NULL,
    account_id UUID NOT NULL,
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    narration TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_accounting_journal_entries_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_aje_journal FOREIGN KEY (tenant_id, journal_id) REFERENCES accounting_journals(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_aje_account FOREIGN KEY (tenant_id, account_id) REFERENCES chart_of_accounts(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_positive_debit CHECK (debit >= 0),
    CONSTRAINT chk_positive_credit CHECK (credit >= 0)
);

CREATE INDEX IF NOT EXISTS idx_aje_account_history ON accounting_journal_entries(tenant_id, account_id, created_at);

-- 7.4 Expense Categories & Expenses
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_expense_categories_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_expense_categories_name UNIQUE (tenant_id, name),
    CONSTRAINT fk_ec_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    category_id UUID NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    payment_mode VARCHAR(30) NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    description TEXT,
    receipt_document_url TEXT,
    recorded_by UUID NOT NULL REFERENCES users(id),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_expenses_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_exp_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_exp_cat FOREIGN KEY (tenant_id, category_id) REFERENCES expense_categories(tenant_id, id) ON DELETE RESTRICT
);

-- ============================================================================
-- DOMAIN 8: GOVERNANCE, AUDIT & EXPORT
-- ============================================================================

-- 8.1 Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    old_state JSONB,
    new_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(tenant_id, action);

-- 8.2 Data Export Jobs
CREATE TABLE IF NOT EXISTS data_export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    download_url TEXT,
    file_checksum_sha256 VARCHAR(64),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- REFERENCE SEED DATA: PLANS, FORMULARIES, SCHEDULES, ROLES & PERMISSIONS
-- ============================================================================

-- Seed Subscription Plans
INSERT INTO subscription_plans (plan_key, name, max_branches, max_users, max_invoices_per_month, price_annual_inr, price_monthly_inr)
VALUES
    ('pilot', 'Pilot Free Tier', 1, 2, 500, 0.00, 0.00),
    ('starter', 'Single Store Starter', 1, 5, 5000, 7999.00, 799.00),
    ('growth', 'Growth Multi-Branch', 3, 15, 25000, 18999.00, 1899.00),
    ('enterprise', 'Pharmacy Chain Enterprise', 20, 100, 500000, 49999.00, 4999.00)
ON CONFLICT (plan_key) DO NOTHING;

-- Seed Medicine Dosage Form Categories
INSERT INTO medicine_categories (name, description)
VALUES
    ('Tablet', 'Solid oral dosage form compressed or molded'),
    ('Capsule', 'Solid dosage form in hard or soft gelatin shells'),
    ('Syrup', 'Liquid formulation containing high concentration of sucrose or substitutes'),
    ('Suspension', 'Heterogeneous mixture containing solid particles dispersed in liquid medium'),
    ('Injection', 'Sterile liquid formulation for parenteral administration'),
    ('Ointment', 'Semi-solid preparation for external application to skin'),
    ('Drops', 'Concentrated liquid solution for oral, ophthalmic, or otic use'),
    ('Powder', 'Dry, finely divided drug or chemical for internal or external use'),
    ('Inhaler', 'Metered dose delivery system for pulmonary inhalation')
ON CONFLICT (name) DO NOTHING;

-- Seed Indian Drug Regulatory Schedules
INSERT INTO medicine_schedules (code, display_name, requires_prescription, requires_doctor_reg_number, requires_statutory_register, description)
VALUES
    ('OTC', 'Over the Counter', false, false, false, 'Non-prescription general health formulations and supplements'),
    ('Schedule H', 'Schedule H Prescription Drug', true, true, false, 'Substances which should be sold by retail only on and in accordance with the prescription of a Registered Medical Practitioner'),
    ('Schedule H1', 'Schedule H1 Antibiotic / Habit-Forming', true, true, true, 'Specific 3rd/4th gen antibiotics and habit-forming drugs requiring separate statutory register with doctor and patient details'),
    ('Schedule X', 'Schedule X Psychotropic / Narcotic', true, true, true, 'Special narcotics and psychotropic drugs requiring 3-copy prescription and 2-year record retention'),
    ('Narcotic', 'NDPS Act Narcotic Substances', true, true, true, 'Strictly regulated narcotic drugs under Narcotics Drugs and Psychotropic Substances Act')
ON CONFLICT (code) DO NOTHING;

-- Seed Platform System Roles
INSERT INTO roles (tenant_id, role_key, display_name, description, is_system_role)
VALUES
    (NULL, 'owner', 'Pharmacy Owner / Super Admin', 'Full administrative control over pharmacy settings, staff, financials, inventory, and compliance', true),
    (NULL, 'pharmacist', 'Registered Pharmacist', 'Authorised to verify Schedule H/H1 prescriptions, dispense medicines, and inward stock', true),
    (NULL, 'cashier', 'Billing Cashier', 'Point of Sale billing, cash collection, and customer khata payment collection', true),
    (NULL, 'helper', 'Store Helper / Assistant', 'Stock counting, shelf replenishment, and pack picking assistance', true)
ON CONFLICT (tenant_id, role_key) DO NOTHING;

-- Seed Standard Granular Permissions
INSERT INTO permissions (permission_key, module, display_name, description)
VALUES
    ('billing.create', 'billing', 'Create Sales Invoices', 'Dispense medicines and issue retail GST tax invoices'),
    ('billing.discount', 'billing', 'Apply Custom Discounts', 'Override standard store discount percentage at counter'),
    ('billing.return', 'billing', 'Process Sales Returns', 'Issue credit notes and return inventory to batches'),
    ('inventory.view', 'inventory', 'View Stock Balances', 'View batch stock levels, shelf locations, and PTR'),
    ('inventory.adjust', 'inventory', 'Adjust Physical Stock', 'Record stock variance and write off damaged/expired goods'),
    ('procurement.receive', 'procurement', 'Receive Goods Inward', 'Inward stock from supplier tax invoices'),
    ('procurement.order', 'procurement', 'Create Purchase Orders', 'Draft and issue purchase orders to distributors'),
    ('customers.khata', 'customers', 'Manage Khata Ledger', 'Grant store credit and record customer credit settlements'),
    ('finance.reports', 'finance', 'View Financial Reports', 'View revenue, GST reports, profit & loss, and audit logs'),
    ('settings.manage', 'settings', 'Manage Store Settings', 'Manage staff accounts, roles, licenses, and branch configuration')
ON CONFLICT (permission_key) DO NOTHING;

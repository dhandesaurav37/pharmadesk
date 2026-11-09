-- ============================================================================
-- PHARMADESK DATABASE MIGRATION 0003: ROW-LEVEL SECURITY (RLS) POLICIES
-- Engine: PostgreSQL 16+ on Google Cloud SQL (asia-south1)
-- Standards: Fail-Closed RESTRICTIVE Policies & FORCE ROW LEVEL SECURITY
-- ============================================================================

-- Macro helper: Enables RLS and forces RLS on table
-- (Ensures even table owners and migrator sessions evaluate policies unless BYPASSRLS is active)

-- 1. Tenants Root Table RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tenants ON tenants;
CREATE POLICY tenant_isolation_tenants ON tenants
    AS RESTRICTIVE
    USING (id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

-- 2. Hybrid Scope Tables (System Defaults or Tenant Overrides)
-- Roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_roles ON roles;
CREATE POLICY tenant_isolation_roles ON roles
    AS RESTRICTIVE
    USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

-- Manufacturers
ALTER TABLE manufacturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE manufacturers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_manufacturers ON manufacturers;
CREATE POLICY tenant_isolation_manufacturers ON manufacturers
    AS RESTRICTIVE
    USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

-- 3. Tenant-Global Tables (RLS by tenant_id)
DO $$
DECLARE
    tbl text;
    tenant_tables text[] := ARRAY[
        'branches',
        'tenant_memberships',
        'membership_branches',
        'user_permission_overrides',
        'invitations',
        'invitation_branches',
        'subscriptions',
        'medicine_master',
        'medicine_barcodes',
        'stock_transfers',
        'stock_transfer_items',
        'customers',
        'suppliers',
        'chart_of_accounts',
        'expense_categories',
        'audit_logs',
        'data_export_jobs'
    ];
BEGIN
    FOREACH tbl IN ARRAY tenant_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'tenant_isolation_' || tbl, tbl);
        EXECUTE format('
            CREATE POLICY %I ON %I
                AS RESTRICTIVE
                USING (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''信::UUID);
        ', 'tenant_isolation_' || tbl, tbl);
    END LOOP;
END $$;

-- 4. Branch-Physical Tables (Tenant RLS + Optional Branch RLS)
DO $$
DECLARE
    tbl text;
    branch_tables text[] := ARRAY[
        'inventory_batches',
        'stock_movements',
        'stock_adjustments',
        'customer_ledger',
        'supplier_ledger',
        'purchase_orders',
        'purchase_order_items',
        'goods_receipts',
        'goods_receipt_items',
        'idempotency_keys',
        'sales_invoices',
        'sales_invoice_items',
        'payments',
        'sales_returns',
        'sales_return_items',
        'accounting_journals',
        'accounting_journal_entries',
        'expenses'
    ];
BEGIN
    FOREACH tbl IN ARRAY branch_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
        
        -- Tenant isolation policy
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'tenant_isolation_' || tbl, tbl);
        EXECUTE format('
            CREATE POLICY %I ON %I
                AS RESTRICTIVE
                USING (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''信::UUID);
        ', 'tenant_isolation_' || tbl, tbl);

        -- Optional branch isolation policy (active only when app.current_branch_id is set)
        -- Applies to tables with direct branch_id column
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = tbl AND column_name = 'branch_id'
        ) THEN
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'branch_isolation_' || tbl, tbl);
            EXECUTE format('
                CREATE POLICY %I ON %I
                    AS RESTRICTIVE
                    USING (
                        NULLIF(current_setting(''app.current_branch_id'', true), '''信 IS NULL
                        OR branch_id = NULLIF(current_setting(''app.current_branch_id'', true), '''信::UUID
                    );
            ', 'branch_isolation_' || tbl, tbl);
        END IF;
    END LOOP;
END $$;

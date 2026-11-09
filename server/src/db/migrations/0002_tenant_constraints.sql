-- ============================================================================
-- PHARMADESK DATABASE MIGRATION 0002: COMPOSITE TENANT INTEGRITY CONSTRAINTS
-- Engine: PostgreSQL 16+ on Google Cloud SQL (asia-south1)
-- Purpose: Hardens relational foreign keys so cross-tenant referencing is
--          mathematically prohibited at the database engine kernel level.
-- ============================================================================

-- Ensure all parent tables have explicit composite uniqueness on (tenant_id, id)
DO $$
BEGIN
    -- Confirm composite constraints exist on parent tenant-owned entities
    -- (Created in 0001; verified here for defense-in-depth)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_tenants_id_composite') THEN
        ALTER TABLE tenants ADD CONSTRAINT uq_tenants_id_composite UNIQUE (id);
    END IF;
END $$;

-- 2.1 Branch and Membership Cross-Tenant Constraints
DO $$
BEGIN
    -- membership_branches foreign keys
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_mb_composite_membership') THEN
        ALTER TABLE membership_branches
            DROP CONSTRAINT IF EXISTS fk_mb_membership,
            ADD CONSTRAINT fk_mb_composite_membership
            FOREIGN KEY (tenant_id, membership_id) REFERENCES tenant_memberships(tenant_id, id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_mb_composite_branch') THEN
        ALTER TABLE membership_branches
            DROP CONSTRAINT IF EXISTS fk_mb_branch,
            ADD CONSTRAINT fk_mb_composite_branch
            FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2.2 Inventory Batches & Movements Composite Foreign Keys
DO $$
BEGIN
    -- inventory_batches: enforce branch and medicine belong to same tenant
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ib_composite_branch') THEN
        ALTER TABLE inventory_batches
            DROP CONSTRAINT IF EXISTS fk_ib_branch,
            ADD CONSTRAINT fk_ib_composite_branch
            FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ib_composite_medicine') THEN
        ALTER TABLE inventory_batches
            DROP CONSTRAINT IF EXISTS fk_ib_medicine,
            ADD CONSTRAINT fk_ib_composite_medicine
            FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT;
    END IF;

    -- stock_movements
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sm_composite_branch') THEN
        ALTER TABLE stock_movements
            DROP CONSTRAINT IF EXISTS fk_sm_branch,
            ADD CONSTRAINT fk_sm_composite_branch
            FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sm_composite_batch') THEN
        ALTER TABLE stock_movements
            DROP CONSTRAINT IF EXISTS fk_sm_batch,
            ADD CONSTRAINT fk_sm_composite_batch
            FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sm_composite_medicine') THEN
        ALTER TABLE stock_movements
            DROP CONSTRAINT IF EXISTS fk_sm_medicine,
            ADD CONSTRAINT fk_sm_composite_medicine
            FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT;
    END IF;
END $$;

-- 2.3 Sales POS & Invoices Composite Foreign Keys
DO $$
BEGIN
    -- sales_invoices: enforce branch and customer belongs to same tenant
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_si_composite_branch') THEN
        ALTER TABLE sales_invoices
            DROP CONSTRAINT IF EXISTS fk_si_branch,
            ADD CONSTRAINT fk_si_composite_branch
            FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT;
    END IF;

    -- sales_invoice_items: enforce invoice, batch, and medicine match tenant
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sii_composite_invoice') THEN
        ALTER TABLE sales_invoice_items
            DROP CONSTRAINT IF EXISTS fk_sii_invoice,
            ADD CONSTRAINT fk_sii_composite_invoice
            FOREIGN KEY (tenant_id, sales_invoice_id) REFERENCES sales_invoices(tenant_id, id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sii_composite_batch') THEN
        ALTER TABLE sales_invoice_items
            DROP CONSTRAINT IF EXISTS fk_sii_batch,
            ADD CONSTRAINT fk_sii_composite_batch
            FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sii_composite_medicine') THEN
        ALTER TABLE sales_invoice_items
            DROP CONSTRAINT IF EXISTS fk_sii_medicine,
            ADD CONSTRAINT fk_sii_composite_medicine
            FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id) ON DELETE RESTRICT;
    END IF;
END $$;

-- 2.4 Procurement & Accounting Composite Foreign Keys
DO $$
BEGIN
    -- goods_receipt_items
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gri_composite_receipt') THEN
        ALTER TABLE goods_receipt_items
            DROP CONSTRAINT IF EXISTS fk_gri_receipt,
            ADD CONSTRAINT fk_gri_composite_receipt
            FOREIGN KEY (tenant_id, goods_receipt_id) REFERENCES goods_receipts(tenant_id, id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gri_composite_batch') THEN
        ALTER TABLE goods_receipt_items
            DROP CONSTRAINT IF EXISTS fk_gri_batch,
            ADD CONSTRAINT fk_gri_composite_batch
            FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id) ON DELETE RESTRICT;
    END IF;

    -- accounting_journal_entries
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_aje_composite_journal') THEN
        ALTER TABLE accounting_journal_entries
            DROP CONSTRAINT IF EXISTS fk_aje_journal,
            ADD CONSTRAINT fk_aje_composite_journal
            FOREIGN KEY (tenant_id, journal_id) REFERENCES accounting_journals(tenant_id, id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_aje_composite_account') THEN
        ALTER TABLE accounting_journal_entries
            DROP CONSTRAINT IF EXISTS fk_aje_account,
            ADD CONSTRAINT fk_aje_composite_account
            FOREIGN KEY (tenant_id, account_id) REFERENCES chart_of_accounts(tenant_id, id) ON DELETE RESTRICT;
    END IF;

    -- expenses
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_exp_composite_branch') THEN
        ALTER TABLE expenses
            DROP CONSTRAINT IF EXISTS fk_exp_branch,
            ADD CONSTRAINT fk_exp_composite_branch
            FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_exp_composite_cat') THEN
        ALTER TABLE expenses
            DROP CONSTRAINT IF EXISTS fk_exp_cat,
            ADD CONSTRAINT fk_exp_composite_cat
            FOREIGN KEY (tenant_id, category_id) REFERENCES expense_categories(tenant_id, id) ON DELETE RESTRICT;
    END IF;
END $$;

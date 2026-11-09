-- ============================================================================
-- PHARMADESK DATABASE MIGRATION 0004: CORE INTEGRITY & COMPLIANCE TRIGGERS
-- Engine: PostgreSQL 16+ on Google Cloud SQL (asia-south1)
-- Standards: Statutory Invoice Immutability, Negative Stock Protection & Double-Entry Balance
-- ============================================================================

-- 4.1 Trigger 1: Negative Inventory Prevention
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

DROP TRIGGER IF EXISTS trg_check_inventory_stock ON inventory_batches;
CREATE TRIGGER trg_check_inventory_stock
BEFORE INSERT OR UPDATE ON inventory_batches
FOR EACH ROW
EXECUTE FUNCTION trg_fn_prevent_negative_inventory();

-- 4.2 Trigger 2: Sales Invoice Immutability (Tax & Regulatory Compliance)
CREATE OR REPLACE FUNCTION trg_fn_prevent_invoice_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Allow status transitions (e.g., 'completed' -> 'cancelled' or 'returned')
        -- Financial calculations are strictly frozen once issued.
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

DROP TRIGGER IF EXISTS trg_protect_sales_invoices ON sales_invoices;
CREATE TRIGGER trg_protect_sales_invoices
BEFORE UPDATE OR DELETE ON sales_invoices
FOR EACH ROW
EXECUTE FUNCTION trg_fn_prevent_invoice_mutation();

-- 4.3 Trigger 3: Double-Entry Journal Balance Verification (Deferred Constraint Trigger)
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

DROP TRIGGER IF EXISTS trg_check_journal_balance ON accounting_journal_entries;
CREATE CONSTRAINT TRIGGER trg_check_journal_balance
AFTER INSERT OR UPDATE ON accounting_journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_fn_verify_journal_balance();

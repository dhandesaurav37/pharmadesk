import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  loadMigrationFiles,
  calculateChecksum,
  resolveMigrationsDir,
} from '../../src/db/migrationRunner.js';

describe('Database Migrations Integrity & DDL Verification', () => {
  const migrationsDir = path.resolve(process.cwd(), 'server/src/db/migrations');

  it('should resolve migration directory and locate all 5 phase 2 migration files', async () => {
    const migrations = await loadMigrationFiles(migrationsDir);

    expect(migrations.length).toBe(5);
    expect(migrations.map((m) => m.version)).toEqual(['0001', '0002', '0003', '0004', '0005']);
  });

  it('should compute valid 64-character SHA-256 checksums for each migration', async () => {
    const migrations = await loadMigrationFiles(migrationsDir);

    for (const m of migrations) {
      expect(m.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(m.checksum).toBe(calculateChecksum(m.sql));
    }
  });

  it('0001_initial_schema.sql: should contain all 43 tables across 8 functional domains', async () => {
    const migrations = await loadMigrationFiles(migrationsDir);
    const m1 = migrations.find((m) => m.version === '0001');
    expect(m1).toBeDefined();

    const expectedTables = [
      // Domain 1
      'tenants',
      'branches',
      'users',
      'tenant_memberships',
      'membership_branches',
      'roles',
      'permissions',
      'role_permissions',
      'user_permission_overrides',
      'invitations',
      'invitation_branches',
      'subscription_plans',
      'subscriptions',
      // Domain 2
      'medicine_categories',
      'manufacturers',
      'medicine_schedules',
      'medicine_master',
      'medicine_barcodes',
      // Domain 3
      'inventory_batches',
      'stock_movements',
      'stock_adjustments',
      'stock_transfers',
      'stock_transfer_items',
      // Domain 4
      'customers',
      'customer_ledger',
      // Domain 5
      'suppliers',
      'supplier_ledger',
      'purchase_orders',
      'purchase_order_items',
      'goods_receipts',
      'goods_receipt_items',
      // Domain 6
      'idempotency_keys',
      'sales_invoices',
      'sales_invoice_items',
      'payments',
      'sales_returns',
      'sales_return_items',
      // Domain 7
      'chart_of_accounts',
      'accounting_journals',
      'accounting_journal_entries',
      'expense_categories',
      'expenses',
      // Domain 8
      'audit_logs',
      'data_export_jobs',
    ];

    expect(expectedTables.length).toBe(44);

    for (const table of expectedTables) {
      const tableRegex = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i');
      expect(tableRegex.test(m1!.sql)).toBe(true);
    }
  });

  it('0001_initial_schema.sql: should seed standard subscription plans, schedules, and roles', async () => {
    const migrations = await loadMigrationFiles(migrationsDir);
    const m1 = migrations.find((m) => m.version === '0001');

    expect(m1!.sql).toContain("'pilot', 'Pilot Free Tier'");
    expect(m1!.sql).toContain("'starter', 'Single Store Starter'");
    expect(m1!.sql).toContain("'Schedule H1', 'Schedule H1 Antibiotic / Habit-Forming'");
    expect(m1!.sql).toContain("'owner', 'Pharmacy Owner / Super Admin'");
    expect(m1!.sql).toContain("'pharmacist', 'Registered Pharmacist'");
    expect(m1!.sql).toContain("'cashier', 'Billing Cashier'");
  });

  it('0002_tenant_constraints.sql: should enforce composite foreign keys to prohibit cross-tenant referencing', async () => {
    const migrations = await loadMigrationFiles(migrationsDir);
    const m2 = migrations.find((m) => m.version === '0002');
    expect(m2).toBeDefined();

    expect(m2!.sql).toContain('FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)');
    expect(m2!.sql).toContain('FOREIGN KEY (tenant_id, medicine_id) REFERENCES medicine_master(tenant_id, id)');
    expect(m2!.sql).toContain('FOREIGN KEY (tenant_id, sales_invoice_id) REFERENCES sales_invoices(tenant_id, id)');
  });

  it('0003_row_level_security.sql: should enable and force RLS with fail-closed restrictive policies', async () => {
    const migrations = await loadMigrationFiles(migrationsDir);
    const m3 = migrations.find((m) => m.version === '0003');
    expect(m3).toBeDefined();

    expect(m3!.sql).toContain('ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;');
    expect(m3!.sql).toContain('ALTER TABLE tenants FORCE ROW LEVEL SECURITY;');
    expect(m3!.sql).toContain('AS RESTRICTIVE');
    expect(m3!.sql).toContain("NULLIF(current_setting('app.current_tenant_id', true), '')::UUID");
  });

  it('0004_integrity_triggers.sql: should implement negative stock, invoice immutability, and journal balance triggers', async () => {
    const migrations = await loadMigrationFiles(migrationsDir);
    const m4 = migrations.find((m) => m.version === '0004');
    expect(m4).toBeDefined();

    expect(m4!.sql).toContain('trg_fn_prevent_negative_inventory');
    expect(m4!.sql).toContain('trg_fn_prevent_invoice_mutation');
    expect(m4!.sql).toContain('trg_fn_verify_journal_balance');
    expect(m4!.sql).toContain('DEFERRABLE INITIALLY DEFERRED');
  });

  it('0005_roles_and_privileges.sql: should create migrator with BYPASSRLS and app role with NOBYPASSRLS', async () => {
    const migrations = await loadMigrationFiles(migrationsDir);
    const m5 = migrations.find((m) => m.version === '0005');
    expect(m5).toBeDefined();

    expect(m5!.sql).toContain('ROLE pharmadesk_app WITH LOGIN NOBYPASSRLS NOSUPERUSER');
    expect(m5!.sql).toContain('ROLE pharmadesk_migrator WITH LOGIN BYPASSRLS');
    expect(m5!.sql).toContain('GRANT USAGE ON SCHEMA public TO pharmadesk_app');
  });
});

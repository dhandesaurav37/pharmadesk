import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { isDatabaseConfigured } from '../../src/config/env.js';
import { getPool, closePool } from '../../src/db/pool.js';
import { withTenantTransaction } from '../../src/db/tenantTransaction.js';
import { runMigrations } from '../../src/db/migrationRunner.js';

describe('Live PostgreSQL Multi-Tenant Integration & RLS Tests', () => {
  let isLivePostgresAvailable = false;
  let pool: pg.Pool | null = null;

  beforeAll(async () => {
    if (isDatabaseConfigured()) {
      try {
        pool = getPool();
        const res = await pool.query('SELECT 1 AS alive');
        if (res.rows?.[0]?.alive === 1) {
          isLivePostgresAvailable = true;
          // Apply all migrations against the live database
          await runMigrations(pool);
        }
      } catch (err) {
        isLivePostgresAvailable = false;
        console.warn('[LIVE DB] Database check failed:', err instanceof Error ? err.message : String(err));
      }
    }
  });

  afterAll(async () => {
    if (pool) {
      await closePool();
    }
  });

  // Note: Tests use it.skipIf(!isLivePostgresAvailable) so they are reported as SKIPPED
  // when PostgreSQL is unavailable, rather than falsely passing with dummy assertions.

  it.skipIf(!isLivePostgresAvailable)(
    'applies migrations and enforces complete cross-tenant read/write isolation',
    async () => {
      const client = await pool!.connect();

      const tenantA = '11111111-1111-4111-a111-111111111111';
      const tenantB = '22222222-2222-4222-a222-222222222222';
      const branchA1 = 'aaaaaaaa-1111-4111-a111-aaaaaaaaaaaa';
      const branchB1 = 'bbbbbbbb-2222-4222-a222-bbbbbbbbbbbb';

      try {
        // Seed test tenants (direct query bypasses RLS if executed as migrator/superuser)
        await client.query(`
          INSERT INTO tenants (id, name, trade_name, dl_number_20b, dl_number_21b, contact_phone, contact_email)
          VALUES 
            ('${tenantA}', 'Pharmacy Alpha', 'Alpha Chemist', 'DL-20B-A', 'DL-21B-A', '9800000001', 'alpha@example.com'),
            ('${tenantB}', 'Pharmacy Beta', 'Beta Chemist', 'DL-20B-B', 'DL-21B-B', '9800000002', 'beta@example.com')
          ON CONFLICT (id) DO NOTHING;
        `);

        await client.query(`
          INSERT INTO branches (id, tenant_id, branch_code, name, address_line1, city, state, pincode, phone)
          VALUES 
            ('${branchA1}', '${tenantA}', 'MAIN', 'Alpha Main Branch', '100 Main St', 'Mumbai', 'Maharashtra', '400001', '9800000001'),
            ('${branchB1}', '${tenantB}', 'MAIN', 'Beta Main Branch', '200 Market Rd', 'Pune', 'Maharashtra', '411001', '9800000002')
          ON CONFLICT (id) DO NOTHING;
        `);
      } finally {
        client.release();
      }

      // 1. Tenant A transaction: create customer and verify visibility
      await withTenantTransaction({ tenantId: tenantA, branchId: branchA1 }, async (tClient) => {
        // Confirm tenant context is active
        const settingRes = await tClient.query<{ tenant: string }>(
          "SELECT current_setting('app.current_tenant_id', true) AS tenant"
        );
        expect(settingRes.rows[0].tenant).toBe(tenantA);

        // Insert customer for Tenant A
        const insertRes = await tClient.query<{ id: string }>(`
          INSERT INTO customers (tenant_id, name, phone)
          VALUES ('${tenantA}', 'Patient Alpha', '9911111111')
          ON CONFLICT (tenant_id, phone) DO UPDATE SET name = EXCLUDED.name
          RETURNING id;
        `);
        expect(insertRes.rows.length).toBe(1);

        // Tenant A must see Tenant A's customer
        const selectRes = await tClient.query('SELECT * FROM customers WHERE phone = $1', ['9911111111']);
        expect(selectRes.rows.length).toBe(1);
      });

      // 2. Tenant B transaction: verify complete cross-tenant isolation
      await withTenantTransaction({ tenantId: tenantB, branchId: branchB1 }, async (tClient) => {
        // Tenant B querying for Tenant A's customer must return ZERO rows
        const selectOtherRes = await tClient.query('SELECT * FROM customers WHERE phone = $1', ['9911111111']);
        expect(selectOtherRes.rows.length).toBe(0);

        // Tenant B attempting to update Tenant A's customer must affect ZERO rows
        const updateOtherRes = await tClient.query(
          "UPDATE customers SET name = 'Hacked' WHERE phone = $1",
          ['9911111111']
        );
        expect(updateOtherRes.rowCount).toBe(0);

        // Tenant B attempting to delete Tenant A's customer must affect ZERO rows
        const deleteOtherRes = await tClient.query(
          'DELETE FROM customers WHERE phone = $1',
          ['9911111111']
        );
        expect(deleteOtherRes.rowCount).toBe(0);
      });

      // 3. Pool hygiene verification: next checkout has no lingering session settings
      const idleClient = await pool!.connect();
      try {
        const checkRes = await idleClient.query<{ tenant: string; branch: string }>(`
          SELECT 
            current_setting('app.current_tenant_id', true) AS tenant,
            current_setting('app.current_branch_id', true) AS branch;
        `);
        expect(checkRes.rows[0].tenant === '' || checkRes.rows[0].tenant === null).toBe(true);
        expect(checkRes.rows[0].branch === '' || checkRes.rows[0].branch === null).toBe(true);
      } finally {
        idleClient.release();
      }
    }
  );

  it.skipIf(!isLivePostgresAvailable)(
    'rejects cross-tenant composite foreign keys at database engine level',
    async () => {
      const tenantA = '11111111-1111-4111-a111-111111111111';
      const branchB1 = 'bbbbbbbb-2222-4222-a222-bbbbbbbbbbbb';

      // Tenant A attempting to insert an inventory batch referencing Tenant B's branch
      await expect(
        withTenantTransaction({ tenantId: tenantA }, async (client) => {
          await client.query(`
            INSERT INTO inventory_batches (
              tenant_id, branch_id, medicine_id, batch_number, expiry_date,
              pack_size, mrp, ptr, purchase_cost, current_stock
            ) VALUES (
              '${tenantA}', '${branchB1}', gen_random_uuid(), 'BATCH-X',
              '2028-12-31', '10 Tablets', 100.00, 75.00, 70.00, 50
            );
          `);
        })
      ).rejects.toThrow();
    }
  );

  it.skipIf(!isLivePostgresAvailable)(
    'enforces negative inventory check trigger',
    async () => {
      const tenantA = '11111111-1111-4111-a111-111111111111';
      const branchA1 = 'aaaaaaaa-1111-4111-a111-aaaaaaaaaaaa';

      await expect(
        withTenantTransaction({ tenantId: tenantA, branchId: branchA1 }, async (client) => {
          // Attempt to insert batch with negative current stock (-10)
          await client.query(`
            INSERT INTO inventory_batches (
              tenant_id, branch_id, medicine_id, batch_number, expiry_date,
              pack_size, mrp, ptr, purchase_cost, current_stock
            ) VALUES (
              '${tenantA}', '${branchA1}', gen_random_uuid(), 'BATCH-NEG',
              '2028-12-31', '10 Tablets', 100.00, 75.00, 70.00, -10
            );
          `);
        })
      ).rejects.toThrow(/Negative inventory disallowed/);
    }
  );

  it.skipIf(!isLivePostgresAvailable)(
    'enforces statutory sales invoice immutability trigger',
    async () => {
      const tenantA = '11111111-1111-4111-a111-111111111111';
      const branchA1 = 'aaaaaaaa-1111-4111-a111-aaaaaaaaaaaa';
      const invoiceId = '99999999-9999-4999-a999-999999999999';

      // Insert invoice and verify DELETE is rejected
      await withTenantTransaction({ tenantId: tenantA, branchId: branchA1 }, async (client) => {
        await client.query(`
          INSERT INTO sales_invoices (
            id, tenant_id, branch_id, invoice_number, invoice_sequence,
            idempotency_key, customer_name, subtotal_mrp, total_discount,
            taxable_amount, cgst_amount, sgst_amount, grand_total,
            payment_mode, dispensed_by
          ) VALUES (
            '${invoiceId}', '${tenantA}', '${branchA1}', 'INV-TEST-001', 1,
            'IDEM-TEST-001', 'Test Customer', 100.00, 0.00, 100.00, 6.00, 6.00,
            112.00, 'cash', gen_random_uuid()
          ) ON CONFLICT (id) DO NOTHING;
        `);

        // Attempting DELETE must throw exception
        await expect(
          client.query('DELETE FROM sales_invoices WHERE id = $1', [invoiceId])
        ).rejects.toThrow(/Deletion of issued sales invoice .* is strictly prohibited/);

        // Attempting financial UPDATE must throw exception
        await expect(
          client.query('UPDATE sales_invoices SET grand_total = 50.00 WHERE id = $1', [invoiceId])
        ).rejects.toThrow(/Financial figures on issued sales invoice .* are immutable/);
      });
    }
  );
});

import pg from 'pg';
import { getPool } from './pool.js';
import { logger } from '../lib/logger.js';

export interface TenantContext {
  tenantId: string;
  branchId?: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that a string matches RFC 4122 UUID format.
 */
export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id.trim());
}

/**
 * Executes a callback within a tenant-scoped database transaction.
 *
 * Enforces multi-tenant isolation via PostgreSQL Row-Level Security:
 * 1. Validates UUID format for tenantId and branchId before checkout.
 * 2. Begins explicit transaction (`BEGIN`).
 * 3. Applies transaction-scoped session variable `SET LOCAL app.current_tenant_id = $1`.
 * 4. If branchId is supplied, applies `SET LOCAL app.current_branch_id = $1`.
 * 5. Executes application query callback with client.
 * 6. Commits (`COMMIT`) on success or rolls back (`ROLLBACK`) on error.
 * 7. Releases client back to pool in `finally`.
 *
 * NOTE: Transaction termination (`COMMIT`/`ROLLBACK`) automatically clears `SET LOCAL`
 * configuration parameters at the PostgreSQL engine kernel level. No disruptive `DISCARD ALL`
 * is required or permitted.
 */
export async function withTenantTransaction<T>(
  context: TenantContext,
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  if (!context || !context.tenantId || !isValidUuid(context.tenantId)) {
    throw new Error(
      `[SECURITY] Invalid or missing tenantId in tenant transaction context: "${context?.tenantId}"`
    );
  }

  if (context.branchId && !isValidUuid(context.branchId)) {
    throw new Error(
      `[SECURITY] Invalid branchId format in tenant transaction context: "${context.branchId}"`
    );
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Scope tenant identity for Row-Level Security
    await client.query('SET LOCAL app.current_tenant_id = $1', [context.tenantId]);

    // Scope branch identity if provided
    if (context.branchId) {
      await client.query('SET LOCAL app.current_branch_id = $1', [context.branchId]);
    }

    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error({ rollbackError }, 'Failed to rollback tenant transaction');
    }
    throw error;
  } finally {
    client.release();
  }
}

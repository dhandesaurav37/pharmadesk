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
 * Validates that a string strictly matches RFC 4122 UUID format.
 */
export function isValidUuid(id: string | undefined | null): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  return UUID_REGEX.test(id.trim());
}

/**
 * Executes a callback within a tenant-scoped database transaction.
 *
 * Enforces multi-tenant isolation via PostgreSQL Row-Level Security:
 * 1. Validates UUID format for tenantId and branchId before checking out client.
 * 2. Checks out a client from the pool.
 * 3. Begins an explicit transaction block (`BEGIN`).
 * 4. Applies transaction-scoped session variable using PostgreSQL's set_config():
 *    `SELECT set_config('app.current_tenant_id', $1, true)`
 *    (the third parameter `is_local = true` binds the setting strictly to the transaction).
 * 5. Applies branch context `SELECT set_config('app.current_branch_id', $1, true)`.
 *    If no branchId is provided, explicitly sets empty string to avoid any lingering branch context.
 * 6. Executes application query callback with client.
 * 7. Commits (`COMMIT`) on success.
 * 8. On failure, safely rolls back (`ROLLBACK`). If rollback fails, the connection is destroyed
 *    via client.release(rollbackError) to prevent a poisoned client from returning to the pool.
 * 9. Client is always released in the finally block.
 *
 * NOTE: Transaction termination (`COMMIT`/`ROLLBACK`) automatically clears transaction-local
 * settings at the PostgreSQL kernel level.
 */
export async function withTenantTransaction<T>(
  context: TenantContext,
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  if (!context || !isValidUuid(context.tenantId)) {
    throw new Error(
      `[SECURITY] Invalid or missing tenantId in tenant transaction context: "${context?.tenantId}"`
    );
  }

  if (context.branchId !== undefined && context.branchId !== null && !isValidUuid(context.branchId)) {
    throw new Error(
      `[SECURITY] Invalid branchId format in tenant transaction context: "${context.branchId}"`
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  let clientDestroyError: Error | undefined = undefined;

  try {
    await client.query('BEGIN');

    // Scope tenant identity for Row-Level Security using parameterized set_config with is_local=true
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
      context.tenantId.trim(),
    ]);

    // Scope branch identity (or explicitly clear branch scope within this transaction)
    if (context.branchId && context.branchId.trim() !== '') {
      await client.query("SELECT set_config('app.current_branch_id', $1, true)", [
        context.branchId.trim(),
      ]);
    } else {
      await client.query("SELECT set_config('app.current_branch_id', '', true)");
    }

    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      clientDestroyError = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
      logger.error(
        { rollbackError: clientDestroyError, tenantId: context.tenantId },
        'Failed to rollback tenant transaction; connection will be destroyed'
      );
    }
    throw error;
  } finally {
    // If rollback failed or connection was corrupted, pass error to release to destroy the connection
    if (clientDestroyError) {
      client.release(clientDestroyError);
    } else {
      client.release();
    }
  }
}

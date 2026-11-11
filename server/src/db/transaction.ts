import pg from 'pg';
import { getPool } from './pool.js';
import { logger } from '../lib/logger.js';

export type TransactionCallback<T> = (client: pg.PoolClient) => Promise<T>;

/**
 * Executes a callback within a managed database transaction block (BEGIN ... COMMIT / ROLLBACK).
 * Automatically checks out a client from the pool and releases it upon completion.
 * If rollback fails (e.g. connection broken), the connection is destroyed to prevent pool reuse.
 */
export async function withTransaction<T>(callback: TransactionCallback<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  let clientDestroyError: Error | undefined = undefined;

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      clientDestroyError = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
      logger.error({ rollbackError: clientDestroyError }, 'Failed to rollback transaction; connection will be destroyed');
    }
    throw error;
  } finally {
    if (clientDestroyError) {
      client.release(clientDestroyError);
    } else {
      client.release();
    }
  }
}

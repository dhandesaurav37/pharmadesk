import pg from 'pg';
import { getPool } from './pool.js';
import { logger } from '../lib/logger.js';

export type TransactionCallback<T> = (client: pg.PoolClient) => Promise<T>;

/**
 * Executes a callback within a managed database transaction block (BEGIN ... COMMIT / ROLLBACK).
 * Automatically checks out a client from the pool and releases it upon completion.
 */
export async function withTransaction<T>(callback: TransactionCallback<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error({ rollbackError }, 'Failed to rollback transaction');
    }
    throw error;
  } finally {
    client.release();
  }
}

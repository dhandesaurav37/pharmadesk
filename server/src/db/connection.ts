import { getPool } from './pool.js';
import { logger } from '../lib/logger.js';
import { isDatabaseConfigured } from '../config/env.js';

export interface DbHealthResult {
  status: 'healthy' | 'unhealthy' | 'not_configured';
  latencyMs?: number;
  serverTime?: string;
  version?: string;
  error?: string;
}

/**
 * Executes a lightweight heartbeat query to test PostgreSQL connectivity.
 * Measures round-trip query execution latency.
 */
export async function dbCheck(): Promise<DbHealthResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'not_configured',
    };
  }

  const start = Date.now();
  try {
    const pool = getPool();
    const result = await pool.query<{ healthy: number; server_time: string; version: string }>(
      'SELECT 1 AS healthy, NOW() AS server_time, version() AS version'
    );

    const latencyMs = Date.now() - start;
    const row = result.rows[0];

    return {
      status: 'healthy',
      latencyMs,
      serverTime: row?.server_time,
      version: row?.version?.split(' ')?.[0] ?? 'PostgreSQL',
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.warn({ err, latencyMs }, 'PostgreSQL health check ping failed');

    return {
      status: 'unhealthy',
      latencyMs,
      error: errorMessage,
    };
  }
}

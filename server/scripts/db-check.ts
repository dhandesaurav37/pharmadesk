#!/usr/bin/env tsx
import { dbCheck } from '../src/db/connection.js';
import { closePool } from '../src/db/pool.js';
import { logger } from '../src/lib/logger.js';

async function main() {
  logger.info('Performing PostgreSQL database connectivity check...');

  try {
    const result = await dbCheck();
    if (result.status === 'healthy') {
      logger.info(
        {
          status: result.status,
          latencyMs: result.latencyMs,
          serverTime: result.serverTime,
          version: result.version,
        },
        'Database connection is healthy and responsive'
      );
      await closePool();
      process.exit(0);
    } else if (result.status === 'not_configured') {
      logger.warn('PostgreSQL connection is not configured in this environment');
      await closePool();
      process.exit(1);
    } else {
      logger.error(
        { status: result.status, latencyMs: result.latencyMs, error: result.error },
        'Database connection health check failed'
      );
      await closePool();
      process.exit(1);
    }
  } catch (error) {
    logger.error({ error }, 'Fatal error during database health check');
    await closePool();
    process.exit(1);
  }
}

main();

#!/usr/bin/env tsx
import { runMigrations } from '../src/db/migrationRunner.js';
import { closePool } from '../src/db/pool.js';
import { logger } from '../src/lib/logger.js';

async function main() {
  logger.info('Starting PharmaDesk database migration runner...');
  const start = Date.now();

  try {
    const result = await runMigrations();
    logger.info(
      {
        appliedCount: result.appliedCount,
        skippedCount: result.skippedCount,
        totalTimeMs: Date.now() - start,
      },
      'Database migrations completed successfully'
    );
    await closePool();
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Migration process aborted due to fatal error');
    await closePool();
    process.exit(1);
  }
}

main();

#!/usr/bin/env tsx
import { runMigrations } from '../src/db/migrationRunner.js';
import { closePool } from '../src/db/pool.js';
import { logger } from '../src/lib/logger.js';
import { isDatabaseConfigured } from '../src/config/env.js';

async function main() {
  if (!isDatabaseConfigured()) {
    console.error(
      '\n[ERROR] PostgreSQL database is not configured in this environment.\n' +
        'Please supply DATABASE_URL or DB_HOST/DB_NAME/DB_USER in your environment, or run:\n' +
        '  docker-compose up -d\n'
    );
    process.exit(1);
  }

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

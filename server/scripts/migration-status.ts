#!/usr/bin/env tsx
import { getMigrationStatus } from '../src/db/migrationRunner.js';
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

  logger.info('Fetching PharmaDesk schema migration status...');

  try {
    const status = await getMigrationStatus();
    console.log('\n--- PHARMADESK SCHEMA MIGRATIONS STATUS ---');
    console.table(
      status.map((item) => ({
        Version: item.version,
        Name: item.name,
        Applied: item.isApplied ? 'YES' : 'PENDING',
        'Applied At': item.appliedAt ?? 'N/A',
        'Checksum Match': item.checksumMatches ? 'VALID' : 'MISMATCH',
      }))
    );
    console.log('-------------------------------------------\n');

    await closePool();
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve migration status');
    await closePool();
    process.exit(1);
  }
}

main();

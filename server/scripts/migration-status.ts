#!/usr/bin/env tsx
import { getMigrationStatus } from '../src/db/migrationRunner.js';
import { closePool } from '../src/db/pool.js';
import { logger } from '../src/lib/logger.js';

async function main() {
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

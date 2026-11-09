import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { getPool } from './pool.js';
import { logger } from '../lib/logger.js';
import {
  MigrationFile,
  MigrationRecord,
  MigrationResult,
  MigrationStatusItem,
} from './migrationTypes.js';

export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';

/**
 * Computes SHA-256 hash of normalized SQL content.
 * Normalizes CRLF line endings to LF to ensure consistent checksums across platforms.
 */
export function calculateChecksum(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Finds the default migrations directory relative to the repository.
 */
export function resolveMigrationsDir(customDir?: string): string {
  if (customDir) {
    return path.resolve(customDir);
  }
  return path.resolve(process.cwd(), 'server/src/db/migrations');
}

/**
 * Loads and parses all .sql migration files from directory in alphanumeric order.
 */
export async function loadMigrationFiles(customDir?: string): Promise<MigrationFile[]> {
  const dir = resolveMigrationsDir(customDir);
  let files: string[];

  try {
    files = await fs.readdir(dir);
  } catch (error) {
    logger.warn({ dir, error }, 'Could not read migrations directory');
    return [];
  }

  const sqlFiles = files
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const migrations: MigrationFile[] = [];

  for (const filename of sqlFiles) {
    const fullPath = path.join(dir, filename);
    const sql = await fs.readFile(fullPath, 'utf8');
    const checksum = calculateChecksum(sql);

    // Extract version prefix (e.g. "0001_initial_schema.sql" -> version "0001", name "initial_schema")
    const match = filename.match(/^([0-9]+)_(.+)\.sql$/);
    const version = match ? match[1] : filename.replace(/\.sql$/, '');
    const name = match ? match[2] : filename.replace(/\.sql$/, '');

    migrations.push({
      version,
      name,
      filename,
      fullPath,
      sql,
      checksum,
    });
  }

  return migrations;
}

/**
 * Creates the schema_migrations tracking table if it does not exist.
 */
export async function ensureMigrationTable(client: pg.PoolClient): Promise<void> {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      checksum VARCHAR(64) NOT NULL
    );
  `;
  await client.query(createTableSql);
}

/**
 * Fetches all applied migrations ordered by version ascending.
 */
export async function getAppliedMigrations(client: pg.PoolClient): Promise<MigrationRecord[]> {
  await ensureMigrationTable(client);
  const result = await client.query<MigrationRecord>(
    `SELECT version, name, applied_at, checksum FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY version ASC`
  );
  return result.rows;
}

/**
 * Returns complete migration status: applied vs pending, with checksum integrity checks.
 */
export async function getMigrationStatus(
  customPool?: pg.Pool,
  customDir?: string
): Promise<MigrationStatusItem[]> {
  const pool = customPool ?? getPool();
  const client = await pool.connect();

  try {
    const diskMigrations = await loadMigrationFiles(customDir);
    const appliedList = await getAppliedMigrations(client);
    const appliedMap = new Map<string, MigrationRecord>();
    for (const app of appliedList) {
      appliedMap.set(app.version, app);
    }

    const statusItems: MigrationStatusItem[] = [];

    for (const disk of diskMigrations) {
      const applied = appliedMap.get(disk.version);
      const isApplied = Boolean(applied);
      const checksumMatches = isApplied ? applied!.checksum === disk.checksum : true;

      statusItems.push({
        version: disk.version,
        name: disk.name,
        isApplied,
        appliedAt: applied ? applied.applied_at.toISOString() : undefined,
        diskChecksum: disk.checksum,
        dbChecksum: applied?.checksum,
        checksumMatches,
      });
    }

    return statusItems;
  } finally {
    client.release();
  }
}

/**
 * Runs all pending migrations sequentially.
 * Each migration is applied within an isolated database transaction block.
 * Throws if a previously applied migration's checksum differs from disk (drift detection).
 */
export async function runMigrations(
  customPool?: pg.Pool,
  customDir?: string
): Promise<MigrationResult> {
  const pool = customPool ?? getPool();
  const client = await pool.connect();

  try {
    await ensureMigrationTable(client);
    const diskMigrations = await loadMigrationFiles(customDir);
    const appliedList = await getAppliedMigrations(client);
    const appliedMap = new Map<string, MigrationRecord>();
    for (const app of appliedList) {
      appliedMap.set(app.version, app);
    }

    // Verify integrity of already applied migrations
    for (const disk of diskMigrations) {
      const applied = appliedMap.get(disk.version);
      if (applied && applied.checksum !== disk.checksum) {
        throw new Error(
          `[MIGRATION DRIFT DETECTED] Migration ${disk.filename} (version ${disk.version}) was modified after being applied!\n` +
            `Database checksum: ${applied.checksum}\nDisk checksum:     ${disk.checksum}`
        );
      }
    }

    const pending = diskMigrations.filter((m) => !appliedMap.has(m.version));
    const applied: MigrationRecord[] = [];

    logger.info(
      { totalDisk: diskMigrations.length, applied: appliedList.length, pending: pending.length },
      'Evaluating database schema migrations'
    );

    for (const migration of pending) {
      logger.info({ version: migration.version, name: migration.name }, 'Applying migration...');
      const start = Date.now();

      await client.query('BEGIN');
      try {
        // Execute the migration DDL / DML
        await client.query(migration.sql);

        // Record successful execution
        const insertRecordSql = `
          INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (version, name, applied_at, checksum)
          VALUES ($1, $2, clock_timestamp(), $3)
          RETURNING version, name, applied_at, checksum;
        `;
        const res = await client.query<MigrationRecord>(insertRecordSql, [
          migration.version,
          migration.name,
          migration.checksum,
        ]);

        await client.query('COMMIT');

        const record = res.rows[0];
        applied.push(record);
        logger.info(
          { version: migration.version, name: migration.name, elapsedMs: Date.now() - start },
          'Migration successfully applied and committed'
        );
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(
          { version: migration.version, name: migration.name, err },
          'Failed to apply migration; transaction rolled back'
        );
        throw err;
      }
    }

    return {
      appliedCount: applied.length,
      applied,
      skippedCount: diskMigrations.length - applied.length,
    };
  } finally {
    client.release();
  }
}

import pg from 'pg';
import { env, isDatabaseConfigured } from '../config/env.js';
import { logger } from '../lib/logger.js';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;

/**
 * Builds pg.PoolConfig from application environment.
 * Supports DATABASE_URL connection strings as well as discrete parameters.
 */
export function buildPoolConfig(): pg.PoolConfig {
  if (env.DATABASE_URL && env.DATABASE_URL.trim() !== '') {
    return {
      connectionString: env.DATABASE_URL,
      ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
      min: env.DB_POOL_MIN,
      max: env.DB_POOL_MAX,
      connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
    };
  }

  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    min: env.DB_POOL_MIN,
    max: env.DB_POOL_MAX,
    connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  };
}

/**
 * Initializes and returns the singleton pg.Pool instance.
 * Attaches logging for connection lifecycle and errors.
 */
export function getPool(): pg.Pool {
  if (poolInstance) {
    return poolInstance;
  }

  const config = buildPoolConfig();
  const pool = new Pool(config);

  pool.on('connect', (client) => {
    logger.debug('PostgreSQL client socket connected to pool');
  });

  pool.on('acquire', (client) => {
    logger.trace('PostgreSQL client checked out from pool');
  });

  pool.on('remove', (client) => {
    logger.trace('PostgreSQL client removed from pool');
  });

  pool.on('error', (err: Error, client: pg.PoolClient) => {
    logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
  });

  poolInstance = pool;
  logger.info(
    {
      host: config.host ?? 'DATABASE_URL',
      database: config.database,
      poolMin: config.min,
      poolMax: config.max,
    },
    'PostgreSQL connection pool initialized'
  );

  return poolInstance;
}

/**
 * Returns true if the pool singleton is currently created.
 */
export function isPoolInitialized(): boolean {
  return poolInstance !== null;
}

/**
 * Gracefully drains and closes the PostgreSQL connection pool.
 * Typically invoked on server shutdown (SIGINT/SIGTERM).
 */
export async function closePool(): Promise<void> {
  if (!poolInstance) {
    return;
  }

  logger.info('Draining and closing PostgreSQL connection pool...');
  try {
    await poolInstance.end();
    logger.info('PostgreSQL connection pool closed successfully');
  } catch (error) {
    logger.error({ error }, 'Error while closing PostgreSQL connection pool');
    throw error;
  } finally {
    poolInstance = null;
  }
}

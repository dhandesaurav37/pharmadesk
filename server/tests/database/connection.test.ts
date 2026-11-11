import { describe, it, expect } from 'vitest';
import { buildPoolConfig } from '../../src/db/pool.js';
import { dbCheck } from '../../src/db/connection.js';
import { isDatabaseConfigured, validateEnv } from '../../src/config/env.js';

describe('Database Connection & Configuration', () => {
  it('should correctly build pool config from environment', () => {
    const config = buildPoolConfig();

    expect(config).toHaveProperty('host');
    expect(config).toHaveProperty('port', 5432);
    expect(config).toHaveProperty('database', 'pharmadesk');
    expect(config).toHaveProperty('user', 'pharmadesk_app');
    expect(config).toHaveProperty('min', 2);
    expect(config).toHaveProperty('max', 10);
  });

  it('validates that DB_POOL_MIN <= DB_POOL_MAX and rejects invalid configurations', () => {
    expect(() =>
      validateEnv({
        DB_POOL_MIN: '20',
        DB_POOL_MAX: '5',
      })
    ).toThrow(/DB_POOL_MIN must be less than or equal to DB_POOL_MAX/);
  });

  it('accurately identifies when database connection is not explicitly configured', () => {
    // When no DATABASE_URL or explicit host/name are in process.env
    const savedUrl = process.env.DATABASE_URL;
    const savedHost = process.env.DB_HOST;
    try {
      delete process.env.DATABASE_URL;
      delete process.env.DB_HOST;

      expect(isDatabaseConfigured()).toBe(false);
    } finally {
      if (savedUrl) process.env.DATABASE_URL = savedUrl;
      if (savedHost) process.env.DB_HOST = savedHost;
    }
  });

  it('should report not_configured from dbCheck when no database is configured', async () => {
    if (!isDatabaseConfigured()) {
      const result = await dbCheck();
      expect(result.status).toBe('not_configured');
    }
  });
});

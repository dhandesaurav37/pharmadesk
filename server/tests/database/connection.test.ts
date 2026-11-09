import { describe, it, expect } from 'vitest';
import { buildPoolConfig } from '../../src/db/pool.js';
import { dbCheck } from '../../src/db/connection.js';
import { isDatabaseConfigured } from '../../src/config/env.js';

describe('Database Connection & Configuration', () => {
  it('should correctly build pool config from default environment', () => {
    const config = buildPoolConfig();

    expect(config).toHaveProperty('host');
    expect(config).toHaveProperty('port', 5432);
    expect(config).toHaveProperty('database', 'pharmadesk');
    expect(config).toHaveProperty('user', 'pharmadesk_app');
    expect(config).toHaveProperty('min', 2);
    expect(config).toHaveProperty('max', 10);
  });

  it('should report not_configured when no database URL is supplied in test runner', async () => {
    // When DATABASE_URL and DB_HOST are not explicitly configured for live DB
    if (!isDatabaseConfigured()) {
      const result = await dbCheck();
      expect(result.status).toBe('not_configured');
    }
  });
});

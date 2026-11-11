import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env if present (non-fatal if absent)
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('3001')
    .refine((val) => !isNaN(Number(val)) && Number.isInteger(Number(val)), {
      message: 'PORT must be an integer string',
    })
    .transform((val) => Number(val))
    .refine((port) => port >= 1 && port <= 65535, {
      message: 'PORT must be between 1 and 65535',
    }),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://127.0.0.1:3000')
    .transform((val) =>
      val
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
    ),
  API_PREFIX: z
    .string()
    .default('/api/v1')
    .refine((val) => val.startsWith('/'), {
      message: 'API_PREFIX must start with a forward slash',
    }),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('900000') // 15 minutes
    .transform((val) => Number(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'RATE_LIMIT_WINDOW_MS must be a positive number',
    }),
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .default('1000')
    .transform((val) => Number(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'RATE_LIMIT_MAX_REQUESTS must be a positive number',
    }),
  // PostgreSQL Database Configuration (Phase 2)
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z
    .string()
    .default('5432')
    .transform((val) => Number(val))
    .refine((port) => !isNaN(port) && port >= 1 && port <= 65535, {
      message: 'DB_PORT must be between 1 and 65535',
    }),
  DB_NAME: z.string().default('pharmadesk'),
  DB_USER: z.string().default('pharmadesk_app'),
  DB_PASSWORD: z.string().default(''),
  DB_SSL: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === '1'),
  DB_POOL_MIN: z
    .string()
    .default('2')
    .transform((val) => Number(val))
    .refine((val) => !isNaN(val) && val >= 0, {
      message: 'DB_POOL_MIN must be a non-negative number',
    }),
  DB_POOL_MAX: z
    .string()
    .default('10')
    .transform((val) => Number(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'DB_POOL_MAX must be a positive number',
    }),
  DB_CONNECTION_TIMEOUT_MS: z
    .string()
    .default('5000')
    .transform((val) => Number(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'DB_CONNECTION_TIMEOUT_MS must be a positive number',
    }),
  DB_IDLE_TIMEOUT_MS: z
    .string()
    .default('30000')
    .transform((val) => Number(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'DB_IDLE_TIMEOUT_MS must be a positive number',
    }),
}).refine((data) => data.DB_POOL_MIN <= data.DB_POOL_MAX, {
  message: 'DB_POOL_MIN must be less than or equal to DB_POOL_MAX',
  path: ['DB_POOL_MIN'],
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Accurately detects whether database connection parameters were explicitly provided
 * in the execution environment rather than relying on inert defaults.
 */
export function isDatabaseConfigured(cfg: EnvConfig = env): boolean {
  // If DATABASE_URL is explicitly set and non-empty
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
    return true;
  }
  if (cfg.DATABASE_URL && cfg.DATABASE_URL.trim() !== '') {
    return true;
  }

  // If DB_HOST or DB_NAME was explicitly provided in environment
  const hasExplicitHost = Boolean(process.env.DB_HOST && process.env.DB_HOST.trim() !== '');
  const hasExplicitName = Boolean(process.env.DB_NAME && process.env.DB_NAME.trim() !== '');
  const hasExplicitUser = Boolean(process.env.DB_USER && process.env.DB_USER.trim() !== '');

  return hasExplicitHost && hasExplicitName && hasExplicitUser;
}

/**
 * Validates provided environment variables or falls back to process.env.
 * Throws a formatted ZodError if validation fails.
 */
export function validateEnv(customEnv?: Record<string, unknown>): EnvConfig {
  const source = customEnv ?? process.env;
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`[FATAL] Invalid server environment configuration:\n${errorDetails}`);
  }

  return result.data;
}

// Singleton parsed environment configuration
export const env: EnvConfig = validateEnv();

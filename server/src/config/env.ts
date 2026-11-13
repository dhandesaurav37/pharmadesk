import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env if present (non-fatal if absent)
dotenv.config();
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default(
      (process.env.NODE_ENV as any) === 'test' || process.env.VITEST ? 'test' : 'development'
    ),
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
  // Firebase Services Configuration (Phase 3+)
  FIREBASE_PROJECT_ID: z
    .string()
    .trim()
    .min(1, 'FIREBASE_PROJECT_ID is required')
    .default(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'pharmadesk-cloud'),
  FIREBASE_CLIENT_EMAIL: z.string().trim().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_STORAGE_BUCKET: z
    .string()
    .trim()
    .min(1, 'FIREBASE_STORAGE_BUCKET is required')
    .default(
      process.env.FIREBASE_STORAGE_BUCKET ||
      `${process.env.GOOGLE_CLOUD_PROJECT || 'pharmadesk-cloud'}.appspot.com`
    ),
  FIREBASE_APP_CHECK_REQUIRED: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === '1'),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  FIREBASE_STORAGE_EMULATOR_HOST: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

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

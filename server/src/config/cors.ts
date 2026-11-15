import { CorsOptions } from 'cors';
import { env } from './env';

/**
 * Builds CORS configuration options for Express.
 * Rejects disallowed origins without using wildcards with credentials.
 */
export function createCorsOptions(allowedOrigins = env.CORS_ALLOWED_ORIGINS, nodeEnv = env.NODE_ENV): CorsOptions {
  const sanitizedOrigins = allowedOrigins.filter((origin) => origin && origin !== '*');

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, server-to-server, or curl)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin matches allowed origins
      const isAllowed = sanitizedOrigins.some((allowed) => {
        // Direct match
        if (allowed === origin) return true;
        // Allow localhost on any dev port in development mode
        if (nodeEnv === 'development' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return true;
        }
        return false;
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        const error = new Error(`Origin '${origin}' not allowed by PharmaDesk CORS policy`);
        (error as any).status = 403;
        callback(error);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-ID',
      'X-Branch-ID',
      'X-Request-ID',
      'X-Correlation-ID',
      'Idempotency-Key',
      'X-Idempotency-Key',
      'X-Firebase-AppCheck',
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-Correlation-ID',
      'X-Cache',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
      'Retry-After',
    ],
    maxAge: 86400, // 24 hours
  };
}

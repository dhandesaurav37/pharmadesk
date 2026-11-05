import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env, EnvConfig } from './config/env';
import { createCorsOptions } from './config/cors';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import { notFoundMiddleware } from './middleware/notFound';
import { apiRouter } from './routes/index';
import { logger } from './lib/logger';
import { RateLimitError } from './lib/errors';

export interface AppOptions {
  config?: EnvConfig;
  corsAllowedOrigins?: string[];
}

/**
 * Express application factory.
 * Creates and configures the Express application with all security, logging,
 * rate limiting, routing, and error handling middleware.
 * Does NOT start listening on a network port.
 */
export function createApp(options?: AppOptions): Express {
  const currentEnv = options?.config ?? env;
  const app = express();

  // 1. Request ID and Correlation Tracking Middleware
  app.use(requestIdMiddleware);

  // 2. Structured Request / Response Logger Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Log completion on finish
    res.on('finish', () => {
      const durationMs = req.startTime ? Date.now() - req.startTime : 0;
      logger.info(
        {
          requestId: req.id,
          method: req.method,
          path: req.originalUrl || req.path,
          status: res.statusCode,
          durationMs,
        },
        `${req.method} ${req.originalUrl || req.path} ${res.statusCode} in ${durationMs}ms`
      );
    });
    next();
  });

  // 3. Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: currentEnv.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
    })
  );

  // 4. Cross-Origin Resource Sharing (CORS)
  app.use(cors(createCorsOptions(options?.corsAllowedOrigins ?? currentEnv.CORS_ALLOWED_ORIGINS)));

  // 5. JSON Body Parser with 1MB Payload Size Limit
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 6. In-Memory API Rate Limiter
  // Note: Express-rate-limit is an in-memory solution suitable for single-instance or basic defense.
  // In multi-instance Cloud Run scale, edge rate limiting is supplemented by Cloud Armor.
  const limiter = rateLimit({
    windowMs: currentEnv.RATE_LIMIT_WINDOW_MS,
    max: currentEnv.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true, // Return standard RateLimit-* headers
    legacyHeaders: false,
    // Do not throttle health probes needed by container orchestrators
    skip: (req: Request) => req.path.includes('/health/'),
    handler: (req: Request, _res: Response, next: NextFunction) => {
      next(new RateLimitError(`Rate limit exceeded for IP. Maximum ${currentEnv.RATE_LIMIT_MAX_REQUESTS} requests per 15 minutes.`));
    },
  });

  // Apply rate limiter to all API endpoints
  app.use(currentEnv.API_PREFIX, limiter);

  // 7. Mount Versioned API Routes
  app.use(currentEnv.API_PREFIX, apiRouter);

  // Root fallback endpoint
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      name: 'PharmaDesk Server',
      status: 'online',
      apiDocs: `${currentEnv.API_PREFIX}`,
    });
  });

  // 8. 404 Not Found Handler (Must be registered after routes)
  app.use(notFoundMiddleware);

  // 9. Centralized RFC 7807 Error Handler (Must be registered last)
  app.use(errorHandlerMiddleware);

  return app;
}

export default createApp;

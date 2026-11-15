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

  // 0. Configure reverse proxy trust for accurate client IP & rate limiting on Cloud Run
  const rawTrustProxy = (currentEnv as any).TRUST_PROXY;
  if (rawTrustProxy === 'true') {
    app.set('trust proxy', true);
  } else if (rawTrustProxy && rawTrustProxy !== 'false' && !isNaN(Number(rawTrustProxy))) {
    app.set('trust proxy', Number(rawTrustProxy));
  } else if (currentEnv.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

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
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: currentEnv.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    })
  );

  // 4. Cross-Origin Resource Sharing (CORS)
  app.use(
    cors(
      createCorsOptions(
        options?.corsAllowedOrigins ?? currentEnv.CORS_ALLOWED_ORIGINS,
        currentEnv.NODE_ENV
      )
    )
  );

  // 5. Strict No-Store Cache Policy for Sensitive Pharmacy & Patient API Responses
  app.use(currentEnv.API_PREFIX, (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.includes('/health/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  // 6. JSON Body Parser with 1MB Payload Size Limit
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 7. In-Memory API Rate Limiters (supplemented by Cloud Armor at edge)
  const limiter = rateLimit({
    windowMs: currentEnv.RATE_LIMIT_WINDOW_MS,
    max: currentEnv.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true, // Return standard RateLimit-* headers
    legacyHeaders: false,
    // Do not throttle health probes needed by container orchestrators
    skip: (req: Request) => req.path.includes('/health/'),
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(new RateLimitError(`Rate limit exceeded for IP. Maximum ${currentEnv.RATE_LIMIT_MAX_REQUESTS} requests per window.`));
    },
  });

  const sensitiveLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: currentEnv.NODE_ENV === 'test' ? 200 : 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(new RateLimitError('Too many sensitive authentication, export, or security governance requests. Please try again later.'));
    },
  });

  // Apply general & targeted rate limiters
  app.use(currentEnv.API_PREFIX, limiter);
  app.use(`${currentEnv.API_PREFIX}/auth`, sensitiveLimiter);
  app.use(`${currentEnv.API_PREFIX}/invitations`, sensitiveLimiter);
  app.use(`${currentEnv.API_PREFIX}/tenants/:tenantId/invitations`, sensitiveLimiter);
  app.use(`${currentEnv.API_PREFIX}/tenants/:tenantId/security`, sensitiveLimiter);
  app.use(`${currentEnv.API_PREFIX}/security`, sensitiveLimiter);

  // 8. Mount Versioned API Routes
  app.use(currentEnv.API_PREFIX, apiRouter);

  // Root fallback endpoint
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      name: 'PharmaDesk Server',
      status: 'online',
      apiDocs: `${currentEnv.API_PREFIX}`,
    });
  });

  // 9. 404 Not Found Handler (Must be registered after routes)
  app.use(notFoundMiddleware);

  // 10. Centralized RFC 7807 Error Handler (Must be registered last)
  app.use(errorHandlerMiddleware);

  return app;
}

export default createApp;

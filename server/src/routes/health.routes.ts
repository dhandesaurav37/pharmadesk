import { Router, Request, Response } from 'express';
import { dbCheck } from '../db/connection.js';
import { isDatabaseConfigured } from '../config/env.js';

export const healthRouter = Router();

/**
 * Liveness Probe: Verifies process is running.
 * Used by container orchestrators (Google Cloud Run / Kubernetes).
 */
healthRouter.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    checks: {
      process: 'alive',
    },
  });
});

/**
 * Readiness Probe: Verifies application has initialized and can accept traffic.
 * If PostgreSQL is configured, dynamically tests database health and latency.
 * Returns 503 if PostgreSQL is configured but unreachable.
 */
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const isDbConfigured = isDatabaseConfigured();
  let dbStatus: Record<string, unknown> | string = 'not_configured';
  let isReady = true;

  if (isDbConfigured) {
    const health = await dbCheck();
    if (health.status === 'healthy') {
      dbStatus = {
        status: 'connected',
        latencyMs: health.latencyMs,
        serverTime: health.serverTime,
        version: health.version,
      };
    } else {
      isReady = false;
      dbStatus = {
        status: 'unhealthy',
        latencyMs: health.latencyMs,
        error: health.error,
      };
    }
  }

  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    status: isReady ? 'ready' : 'unready',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    dependencies: {
      server: 'initialized',
      postgresql: dbStatus,
      firebaseAuth: 'not_configured (Phase 3 pending)',
    },
  });
});


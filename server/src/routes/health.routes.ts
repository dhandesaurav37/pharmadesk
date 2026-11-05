import { Router, Request, Response } from 'express';

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
 * Readiness Probe: Verifies application has initialized and is accepting traffic.
 * Note: Accurately reports future dependencies as 'not_configured' since
 * PostgreSQL (Phase 2) and Firebase (Phase 3) are not yet integrated.
 */
healthRouter.get('/ready', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    dependencies: {
      server: 'initialized',
      postgresql: 'not_configured (Phase 2 pending)',
      firebaseAuth: 'not_configured (Phase 3 pending)',
    },
  });
});

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { healthRouter } from './health.routes';
import { env } from '../config/env';
import { ValidationError } from '../lib/errors';
import { asyncHandler } from '../lib/asyncHandler';

export const apiRouter = Router();

/**
 * Root API metadata endpoint: GET /api/v1
 */
apiRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    name: 'PharmaDesk Backend API',
    version: '1.0.0',
    phase: 'Phase 1 - Backend Foundation',
    status: 'operational',
    region: 'asia-south1',
    environment: env.NODE_ENV,
    documentation: 'https://github.com/dhandesaurav52/pharmadesk/tree/main/docs',
  });
});

/**
 * Health check endpoints: /api/v1/health/live, /api/v1/health/ready
 */
apiRouter.use('/health', healthRouter);

/**
 * Test endpoints for verifying RFC 7807 error handling in test/dev environments
 */
if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
  // Test route for simulating unexpected 500 errors
  apiRouter.get('/test/unexpected-error', () => {
    throw new Error('Simulated unexpected backend fault for error handler testing');
  });

  // Test route for simulating 422 validation errors
  const testValidationSchema = z.object({
    pharmacyName: z.string().min(3, 'Pharmacy name must be at least 3 characters'),
    pincode: z.string().regex(/^\d{6}$/, 'Pincode must be exactly 6 digits'),
  });

  apiRouter.post(
    '/test/validation',
    asyncHandler(async (req: Request, res: Response) => {
      const result = testValidationSchema.safeParse(req.body);
      if (!result.success) {
        throw result.error; // Caught by errorHandlerMiddleware as ZodError
      }
      res.status(200).json({ success: true, data: result.data });
    })
  );
}

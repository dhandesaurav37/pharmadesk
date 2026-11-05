import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../lib/errors';

/**
 * Catches unhandled routes and forwards an RFC 7807 NotFoundError to the centralized error handler.
 */
export function notFoundMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const error = new NotFoundError(`Endpoint '${req.method} ${req.originalUrl}' does not exist on this server.`);
  next(error);
}

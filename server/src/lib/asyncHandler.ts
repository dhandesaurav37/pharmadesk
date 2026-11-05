import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an asynchronous Express route handler to forward unhandled promise rejections
 * to the centralized error middleware.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

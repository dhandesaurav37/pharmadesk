import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

// Pattern for safe incoming request/correlation ID (alphanumeric, hyphens, underscores, length 1..128)
const SAFE_ID_REGEX = /^[a-zA-Z0-9\-_]{1,128}$/;

/**
 * Middleware that assigns a unique request ID to each incoming HTTP request.
 * Reuses existing valid X-Request-ID or X-Correlation-ID when safe,
 * or generates a fresh cryptographically random UUID v4.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId =
    (req.headers['x-request-id'] as string) ||
    (req.headers['x-correlation-id'] as string);

  const requestId =
    incomingId && SAFE_ID_REGEX.test(incomingId.trim())
      ? incomingId.trim()
      : crypto.randomUUID();

  req.id = requestId;
  req.startTime = Date.now();

  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Correlation-ID', requestId);

  next();
}

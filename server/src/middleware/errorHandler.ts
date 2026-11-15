import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, ProblemDetails } from '../lib/errors';
import { logger } from '../lib/logger';
import { env } from '../config/env';

/**
 * Centralized RFC 7807 Problem Details error handler.
 * Guarantees that internal stack traces and secrets are never leaked to clients,
 * while logging structured diagnostic information with correlation IDs.
 */
export const errorHandlerMiddleware: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // If response headers have already been sent, delegate to default Express handler
  if (res.headersSent) {
    return;
  }

  const requestId = req.id || 'unknown';
  const instance = req.originalUrl || req.url;

  let problem: ProblemDetails;

  // Case 1: Known AppError subclass
  if (err instanceof AppError) {
    problem = err.toProblemDetails(instance, requestId);
  }
  // Case 2: Zod Schema Validation Error
  else if (err instanceof ZodError) {
    const invalidParams = err.issues.map((issue) => ({
      name: issue.path.join('.'),
      reason: issue.message,
    }));
    problem = {
      type: 'https://pharmadesk.in/errors/validation-error',
      title: 'Validation Error',
      status: 422,
      detail: 'The provided request parameters failed validation criteria.',
      instance,
      requestId,
      invalidParams,
    };
  }
  // Case 3: Malformed JSON SyntaxError from body-parser
  else if (err instanceof SyntaxError && 'body' in err && (err as any).status === 400) {
    problem = {
      type: 'https://pharmadesk.in/errors/malformed-json',
      title: 'Malformed JSON Request',
      status: 400,
      detail: 'The request body could not be parsed as valid JSON.',
      instance,
      requestId,
    };
  }
  // Case 4: CORS rejection error
  else if (err.status === 403 && typeof err.message === 'string' && err.message.includes('CORS policy')) {
    problem = {
      type: 'https://pharmadesk.in/errors/cors-forbidden',
      title: 'CORS Forbidden',
      status: 403,
      detail: err.message,
      instance,
      requestId,
    };
  }
  // Case 5: Rate limit exceeded error
  else if (err.status === 429) {
    problem = {
      type: 'https://pharmadesk.in/errors/rate-limit-exceeded',
      title: 'Rate Limit Exceeded',
      status: 429,
      detail: err.message || 'Too many requests. Please retry later.',
      instance,
      requestId,
    };
  }
  // Case 6: Unexpected Internal Server Error (500)
  else {
    problem = {
      type: 'https://pharmadesk.in/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected server error occurred. Our engineering team has been notified.',
      instance,
      requestId,
    };

    // Log the full unexpected error internally
    logger.error(
      {
        err: {
          name: err?.name,
          message: err?.message,
          stack: err?.stack,
        },
        requestId,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
      },
      'Unhandled internal server error'
    );
  }

  // Log 4xx client errors at warn level
  if (problem.status >= 400 && problem.status < 500) {
    logger.warn(
      {
        requestId,
        status: problem.status,
        title: problem.title,
        url: req.originalUrl,
        method: req.method,
      },
      `Client error: ${problem.title}`
    );
  }

  // Set RFC 7807 content type and status code
  res.setHeader('Content-Type', 'application/problem+json');
  res.status(problem.status).json(problem);
};

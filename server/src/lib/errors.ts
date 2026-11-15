/**
 * RFC 7807 Problem Details Compliant Error Definitions for PharmaDesk
 * Standard schema:
 * {
 *   type: string (URI identifying problem type),
 *   title: string (short, human-readable summary),
 *   status: number (HTTP status code),
 *   detail: string (human-readable explanation specific to occurrence),
 *   instance: string (URI reference identifying specific occurrence),
 *   requestId: string (UUID for correlation across logs),
 *   invalidParams?: Array<{ name: string, reason: string }>
 * }
 */

export interface InvalidParam {
  name: string;
  reason: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  requestId?: string;
  invalidParams?: InvalidParam[];
}

export class AppError extends Error {
  public readonly status: number;
  public readonly title: string;
  public readonly type: string;
  public readonly detail: string;
  public readonly invalidParams?: InvalidParam[];

  constructor(options: {
    status: number;
    title: string;
    type?: string;
    detail: string;
    invalidParams?: InvalidParam[];
  }) {
    super(options.detail);
    this.name = this.constructor.name;
    this.status = options.status;
    this.title = options.title;
    this.type = options.type ?? `https://pharmadesk.in/errors/http-${options.status}`;
    this.detail = options.detail;
    this.invalidParams = options.invalidParams;
    Error.captureStackTrace(this, this.constructor);
  }

  public toProblemDetails(instance?: string, requestId?: string): ProblemDetails {
    const details: ProblemDetails = {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
    };

    if (instance) details.instance = instance;
    if (requestId) details.requestId = requestId;
    if (this.invalidParams && this.invalidParams.length > 0) {
      details.invalidParams = this.invalidParams;
    }

    return details;
  }
}

export class BadRequestError extends AppError {
  constructor(detail = 'The request payload is invalid or malformed', invalidParams?: InvalidParam[]) {
    super({
      status: 400,
      title: 'Bad Request',
      type: 'https://pharmadesk.in/errors/bad-request',
      detail,
      invalidParams,
    });
  }
}

export class ValidationError extends AppError {
  constructor(detail = 'One or more fields failed validation criteria', invalidParams?: InvalidParam[]) {
    super({
      status: 422,
      title: 'Validation Error',
      type: 'https://pharmadesk.in/errors/validation-error',
      detail,
      invalidParams,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(detail = 'The requested resource was not found') {
    super({
      status: 404,
      title: 'Not Found',
      type: 'https://pharmadesk.in/errors/not-found',
      detail,
    });
  }
}

export class ConflictError extends AppError {
  constructor(detail = 'The request conflicts with current server state') {
    super({
      status: 409,
      title: 'Conflict',
      type: 'https://pharmadesk.in/errors/conflict',
      detail,
    });
  }
}

export class RateLimitError extends AppError {
  constructor(detail = 'Too many requests. Please retry after some time.') {
    super({
      status: 429,
      title: 'Rate Limit Exceeded',
      type: 'https://pharmadesk.in/errors/rate-limit-exceeded',
      detail,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail = 'Authentication is required and has failed or has not yet been provided') {
    super({
      status: 401,
      title: 'Unauthorized',
      type: 'https://pharmadesk.in/errors/unauthorized',
      detail,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = 'You do not have permission to access this resource or tenant') {
    super({
      status: 403,
      title: 'Forbidden',
      type: 'https://pharmadesk.in/errors/forbidden',
      detail,
    });
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(detail = 'A concurrent or previously processed operation with this idempotency key exists') {
    super({
      status: 409,
      title: 'Idempotency Conflict',
      type: 'https://pharmadesk.in/errors/idempotency-conflict',
      detail,
    });
  }
}

export class InsufficientStockError extends AppError {
  constructor(detail = 'Insufficient inventory batch stock for dispensing requested medicine quantity') {
    super({
      status: 422,
      title: 'Insufficient Stock',
      type: 'https://pharmadesk.in/errors/insufficient-stock',
      detail,
    });
  }
}

export class InternalError extends AppError {
  constructor(detail = 'An unexpected internal server error occurred') {
    super({
      status: 500,
      title: 'Internal Server Error',
      type: 'https://pharmadesk.in/errors/internal-server-error',
      detail,
    });
  }
}

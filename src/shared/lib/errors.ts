/**
 * Typed application errors. Services throw these; the API/action boundary
 * translates them into a stable client contract (see `toErrorResponse`).
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "PAYMENT_FAILED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  PAYMENT_FAILED: 402,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** Safe to surface to end users? Internal errors are masked in production. */
  readonly expose: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: unknown; expose?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = options.details;
    this.expose = options.expose ?? code !== "INTERNAL";
  }
}

export const Errors = {
  badRequest: (msg = "Bad request", details?: unknown) =>
    new AppError("BAD_REQUEST", msg, { details }),
  unauthorized: (msg = "Authentication required") =>
    new AppError("UNAUTHORIZED", msg),
  forbidden: (msg = "You do not have permission to perform this action") =>
    new AppError("FORBIDDEN", msg),
  notFound: (msg = "Resource not found") => new AppError("NOT_FOUND", msg),
  conflict: (msg = "Resource already exists", details?: unknown) =>
    new AppError("CONFLICT", msg, { details }),
  validation: (msg = "Validation failed", details?: unknown) =>
    new AppError("VALIDATION", msg, { details }),
  rateLimited: (msg = "Too many requests") =>
    new AppError("RATE_LIMITED", msg),
  payment: (msg = "Payment could not be processed", details?: unknown) =>
    new AppError("PAYMENT_FAILED", msg, { details }),
  internal: (msg = "Something went wrong", cause?: unknown) =>
    new AppError("INTERNAL", msg, { cause, expose: false }),
};

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

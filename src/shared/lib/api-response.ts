import { NextResponse } from "next/server";
import { AppError, isAppError, type ErrorCode } from "./errors";
import { logger } from "./logger";
import { getServerEnv } from "@/shared/config/env";

/** Stable wire contract returned by every route handler and server action. */
export type ApiSuccess<T> = { ok: true; data: T; meta?: Record<string, unknown> };
export type ApiFailure = {
  ok: false;
  error: { code: ErrorCode; message: string; details?: unknown };
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> {
  return { ok: true, data, ...(meta ? { meta } : {}) };
}

/** Normalize any thrown value into the failure contract, masking internals in prod. */
export function toFailure(err: unknown): ApiFailure {
  const isProd = getServerEnv().NODE_ENV === "production";
  const appErr: AppError = isAppError(err)
    ? err
    : new AppError("INTERNAL", err instanceof Error ? err.message : "Unknown error", {
        cause: err,
        expose: false,
      });

  if (appErr.code === "INTERNAL") {
    logger.error({ err: appErr, cause: appErr.cause }, "Unhandled error at API boundary");
  }

  const message = !appErr.expose && isProd ? "Something went wrong" : appErr.message;
  return {
    ok: false,
    error: { code: appErr.code, message, ...(appErr.details ? { details: appErr.details } : {}) },
  };
}

/** For Route Handlers: serialize a success into a NextResponse with correct status. */
export function json<T>(data: T, init?: { status?: number; meta?: Record<string, unknown> }) {
  return NextResponse.json(ok(data, init?.meta), { status: init?.status ?? 200 });
}

/** For Route Handlers: serialize any error into a NextResponse with mapped status. */
export function jsonError(err: unknown) {
  const failure = toFailure(err);
  const status = isAppError(err) ? err.status : 500;
  return NextResponse.json(failure, { status });
}

/**
 * Wrap a route handler so thrown AppErrors become the standard failure contract.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response> | Response,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      return jsonError(err);
    }
  };
}

/**
 * Shared API error helpers. Gives every route under src/app/api/ a single,
 * consistent JSON error shape:
 *
 *   { "error": { "code": "BAD_REQUEST", "message": "missing fields" } }
 *
 * Success responses are unchanged — this only standardizes the error path
 * (validation failures, not-found, unauthorized, unexpected exceptions).
 *
 * Convention:
 *  - Throw `ApiError` (or `ValidationError` from validate.ts) inside a route and
 *    let `handleApiError` translate it into a `Response`.
 *  - Or call the small named builders (`badRequest`, `notFound`, ...) directly
 *    when an early return reads cleaner than a throw.
 *
 * Dependency-light (only `ValidationError`) so it's safe to import in any route.
 */
import { ValidationError } from "./validate";

/** Machine-readable error codes. Paired 1:1 with an HTTP status below. */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** The JSON body every error response carries. */
export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

/**
 * An error a route can throw to signal a specific HTTP failure. `handleApiError`
 * turns it into the standard JSON response with the matching status code.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

/** Build a JSON error `Response` with the standard shape and status code. */
export function errorResponse(code: ApiErrorCode, message: string): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status: STATUS_BY_CODE[code] });
}

// Small named builders for the common cases — for early returns that read
// cleaner than a throw. Each maps to the matching status.
export const badRequest = (message = "Bad request") => errorResponse("BAD_REQUEST", message);
export const unauthorized = (message = "Unauthorized") => errorResponse("UNAUTHORIZED", message);
export const forbidden = (message = "Forbidden") => errorResponse("FORBIDDEN", message);
export const notFound = (message = "Not found") => errorResponse("NOT_FOUND", message);
export const rateLimited = (message = "Too many requests") => errorResponse("RATE_LIMITED", message);
export const serverError = (message = "Something went wrong") => errorResponse("INTERNAL", message);

/**
 * Translate any thrown value into the standard JSON error response.
 *
 *  - `ApiError`        -> its own code + status
 *  - `ValidationError` -> 400 BAD_REQUEST (preserves the human-readable message)
 *  - anything else     -> 500 INTERNAL with a generic message (no internals
 *                         leaked to the client; the original is logged server-side)
 *
 * Wrap a route body in try/catch and `return handleApiError(err)` from catch.
 */
export function handleApiError(err: unknown): Response {
  if (err instanceof ApiError) {
    return errorResponse(err.code, err.message);
  }
  if (err instanceof ValidationError) {
    return errorResponse("BAD_REQUEST", err.message);
  }
  // Unexpected: log for the server operator, return a safe generic message.
  console.error("[api] unhandled error:", err);
  return serverError();
}

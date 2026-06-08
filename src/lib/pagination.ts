/**
 * Shared pagination helpers for list-returning API endpoints.
 *
 * Every browseable JSON list endpoint should return a BOUNDED page of results
 * plus enough metadata for the frontend to render pager controls. This module
 * centralizes the contract so the shape is identical everywhere:
 *
 *   {
 *     "items": [ ...rows ],
 *     "page": 1,
 *     "pageSize": 50,
 *     "total": 312,
 *     "totalPages": 7,
 *     "hasMore": true
 *   }
 *
 * Convention:
 *  - Routes parse `?page=&pageSize=` with `parsePageParams` (zod-validated,
 *    clamped to a sane max — never trust the client to ask for a bounded size).
 *  - Services translate the parsed params into Prisma `skip`/`take`.
 *  - Routes wrap their rows + total with `buildPage` so the response shape is
 *    consistent across endpoints the frontend consumes.
 *
 * Dependency-light (only zod) so it's safe to import in any route or service.
 */
import { z, ZodError } from "zod";
import { ValidationError } from "./validate";

/** Default page size when the client doesn't ask for one. */
export const DEFAULT_PAGE_SIZE = 50;

/** Hard ceiling on page size — a client asking for more is clamped to this. */
export const MAX_PAGE_SIZE = 100;

/**
 * Validated, clamped pagination input. `page` is 1-based; `pageSize` is already
 * bounded to [1, MAX_PAGE_SIZE]. `skip`/`take` are the derived Prisma offsets.
 */
export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/**
 * Zod schema for raw `?page=&pageSize=` query values.
 *
 *  - Coerces strings to numbers; rejects non-numeric / negative / fractional
 *    junk with a clear message (caller maps to 400 via handleApiError).
 *  - Applies the default page size when omitted.
 *  - Clamps an over-max pageSize DOWN to MAX_PAGE_SIZE rather than erroring, so
 *    an eager client still gets a bounded, usable response.
 */
const pageParamsSchema = z.object({
  page: z.coerce
    .number({ message: "page must be a number." })
    .int("page must be a whole number.")
    .min(1, "page must be >= 1.")
    .default(1),
  pageSize: z.coerce
    .number({ message: "pageSize must be a number." })
    .int("pageSize must be a whole number.")
    .min(1, "pageSize must be >= 1.")
    .default(DEFAULT_PAGE_SIZE)
    // Clamp over-max requests down instead of rejecting them.
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
});

/**
 * Parse + validate pagination params from URL search params (or a plain object).
 *
 * Throws `ValidationError` on malformed input (non-numeric, < 1, fractional) —
 * routes pass that to `handleApiError`, which already maps it to a 400 with the
 * human-readable message. A missing param falls back to its default; an
 * over-max `pageSize` is clamped, not rejected.
 */
export function parsePageParams(
  input: URLSearchParams | Record<string, string | null | undefined>,
): PageParams {
  const raw =
    input instanceof URLSearchParams
      ? { page: input.get("page") ?? undefined, pageSize: input.get("pageSize") ?? undefined }
      : { page: input.page ?? undefined, pageSize: input.pageSize ?? undefined };

  // Drop blank/missing values so the schema defaults kick in (coerce("") -> 0).
  const cleaned: Record<string, string> = {};
  if (raw.page != null && raw.page !== "") cleaned.page = raw.page;
  if (raw.pageSize != null && raw.pageSize !== "") cleaned.pageSize = raw.pageSize;

  let parsed;
  try {
    parsed = pageParamsSchema.parse(cleaned);
  } catch (err) {
    // Re-throw as the app's ValidationError so handleApiError -> 400 with a
    // clean message, matching the rest of the boundary-validation convention.
    if (err instanceof ZodError) {
      throw new ValidationError(err.issues[0]?.message ?? "Invalid pagination parameters.");
    }
    throw err;
  }
  const { page, pageSize } = parsed;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** The frontend-friendly envelope every paginated list endpoint returns. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Wrap a page of rows + the total count into the standard list envelope.
 * `total` is the count across ALL pages (so the FE can render "312 results"
 * and a page count), `hasMore` is the cheap "is there a next page?" flag.
 */
export function buildPage<T>(items: T[], total: number, params: PageParams): Page<T> {
  const { page, pageSize } = params;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

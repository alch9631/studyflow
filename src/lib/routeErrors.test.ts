/**
 * Route-level error-shape audit. Proves every API route's deterministic failure
 * branch returns the shared standard error body — `{ error: { code, message } }`
 * — with the correct HTTP status, instead of a hand-rolled / ad-hoc shape.
 *
 * Complements the existing coverage rather than duplicating it:
 *  - apiError.test.ts  — unit-tests the handleApiError helper + builders.
 *  - pushRoutes.test.ts / rateLimitPolicy.test.ts — lock the push 400/429 paths.
 * This file covers the remaining route-specific branches that were asserted
 * nowhere: the export `?format=` 400 and the calendar-feed token 404s — including
 * that a malformed token and an unknown (well-formed) token return an *identical*
 * 404 body, so the public feed never leaks whether a token maps to a real user.
 *
 * Imports the real route handlers (plain `(Request) => Response` functions) so it
 * exercises the actual wiring, not a re-implementation. Like pushRoutes.test.ts /
 * todayFetch.test.ts it runs against the real SQLite dev DB (the export
 * success-path control and the unknown-token lookup touch Prisma), so it lives
 * as a local script — not in CI, which runs only the DB-free logic tests.
 * Run: DATABASE_URL="file:./dev.db" npx tsx src/lib/routeErrors.test.ts
 */
import { GET as exportGET } from "../app/api/export/route";
import { GET as calendarTokenGET } from "../app/api/calendar/[token]/route";
import type { ApiErrorBody } from "./apiError";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

/** Read a Response as the standard error body + status. */
async function readError(res: Response): Promise<{ status: number; body: ApiErrorBody }> {
  return { status: res.status, body: (await res.json()) as ApiErrorBody };
}

/** True when `body` is exactly the shared `{ error: { code, message } }` shape. */
function isStandardErrorBody(body: ApiErrorBody): boolean {
  return (
    typeof body?.error?.code === "string" &&
    body.error.code.length > 0 &&
    typeof body.error?.message === "string" &&
    body.error.message.length > 0
  );
}

/** Invoke the calendar feed route for a token (App Router passes params async). */
function calendarFeed(token: string): Promise<Response> {
  const req = new Request(`http://localhost/api/calendar/${encodeURIComponent(token)}`);
  return calendarTokenGET(req, { params: Promise.resolve({ token }) });
}

async function main() {
  // --- export: an unsupported ?format= -> 400 BAD_REQUEST, standard shape.
  // (parseExportFormat throws ValidationError before any DB work.)
  {
    const { status, body } = await readError(
      await exportGET(new Request("http://localhost/api/export?format=xml")),
    );
    check("export bad format -> 400", status === 400);
    check("export bad format -> BAD_REQUEST code", body.error?.code === "BAD_REQUEST");
    check("export bad format uses the standard error shape", isStandardErrorBody(body));
    check(
      "export error message carries no raw stack trace",
      !/\n\s+at\s/.test(body.error?.message ?? ""),
    );
  }

  // --- export: a valid request is NOT an error response (positive control).
  {
    const res = await exportGET(new Request("http://localhost/api/export?format=json"));
    check("export valid format -> 200 (not an error response)", res.status === 200);
    check(
      "export valid format -> JSON content type",
      (res.headers.get("Content-Type") ?? "").includes("application/json"),
    );
  }

  // --- calendar feed: empty token -> 404 NOT_FOUND, standard shape (no DB hit).
  {
    const { status, body } = await readError(await calendarFeed(""));
    check("calendar empty token -> 404", status === 404);
    check("calendar empty token -> NOT_FOUND code", body.error?.code === "NOT_FOUND");
    check("calendar empty token uses the standard error shape", isStandardErrorBody(body));
  }

  // --- calendar feed: oversized token (>200 chars) -> 404, short-circuits the DB.
  {
    const { status, body } = await readError(await calendarFeed("x".repeat(201)));
    check("calendar oversized token -> 404", status === 404);
    check("calendar oversized token -> NOT_FOUND code", body.error?.code === "NOT_FOUND");
  }

  // --- calendar feed: an unknown but well-formed token -> identical 404 body.
  // A real DB lookup that misses must look exactly like a malformed token, so the
  // feed never leaks whether a given token corresponds to an existing user.
  {
    const malformed = await readError(await calendarFeed(""));
    const unknown = await readError(await calendarFeed("no-such-calendar-token-1234567890"));
    check("calendar unknown token -> 404", unknown.status === 404);
    check("calendar unknown token -> NOT_FOUND code", unknown.body.error?.code === "NOT_FOUND");
    check(
      "malformed and unknown tokens return an identical 404 body (no row-existence leak)",
      malformed.status === unknown.status &&
        malformed.body.error?.code === unknown.body.error?.code &&
        malformed.body.error?.message === unknown.body.error?.message,
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0));

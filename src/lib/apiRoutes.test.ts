/**
 * Route-handler status-code + validation coverage for the GET API endpoints
 * that weren't yet exercised end-to-end: /api/blocks, /api/calendar (+ the
 * /api/calendar/[token] feed), /api/export, and /api/stats. The push endpoints
 * are already locked by pushRoutes.test.ts; this is the sibling for the rest.
 *
 * It imports the REAL route handlers (plain `(Request) => Response` functions)
 * so it tests the actual wiring — validation, status codes, and the shared
 * `{ error: { code, message } }` body — not a re-implementation. For each route
 * it asserts:
 *   - the happy path returns the right 2xx status + content type (positive control),
 *   - bad/invalid input is rejected with 400 and the standard error shape BEFORE
 *     any business logic runs (blocks pagination, export format),
 *   - missing/unknown records resolve safely (404, no row-existence leak) without
 *     a stack trace reaching the client (calendar feed token).
 *
 * Runs against an isolated throwaway test DB (see ./testDb) so it never touches
 * dev/prod data and is safe to run in CI; getCurrentUserId upserts the dev user
 * into that fresh DB.
 * Run: npx tsx src/lib/apiRoutes.test.ts
 */
import "./testDb"; // MUST be first: points ./db at the test DB before it loads.
import { GET as blocksGET } from "../app/api/blocks/route";
import { GET as calendarGET } from "../app/api/calendar/route";
import { GET as calendarTokenGET } from "../app/api/calendar/[token]/route";
import { GET as exportGET } from "../app/api/export/route";
import { GET as statsGET } from "../app/api/stats/route";
import { getCalendarToken, getCurrentUserId } from "./devUser";
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

/** No raw stack trace ("... at someFn (file:line)") ever reaches the client. */
function hasNoStackTrace(message: string | undefined): boolean {
  return !/\n\s+at\s/.test(message ?? "");
}

function blocksReq(query = ""): Request {
  return new Request(`http://localhost/api/blocks${query}`);
}

/** Invoke the calendar feed route for a token (App Router passes params async). */
function calendarFeed(token: string): Promise<Response> {
  const req = new Request(`http://localhost/api/calendar/${encodeURIComponent(token)}`);
  return calendarTokenGET(req, { params: Promise.resolve({ token }) });
}

async function main() {
  // Resolve/seed the dev user up front so the success-path queries have a user.
  await getCurrentUserId();

  // ---------------------------------------------------------------- /api/blocks
  // Happy path: no params -> 200 with the standard bounded-list envelope.
  {
    const res = await blocksGET(blocksReq());
    check("blocks default -> 200", res.status === 200);
    const page = (await res.json()) as Record<string, unknown>;
    check(
      "blocks default -> standard list envelope",
      Array.isArray(page.items) &&
        typeof page.page === "number" &&
        typeof page.pageSize === "number" &&
        typeof page.total === "number" &&
        typeof page.totalPages === "number" &&
        typeof page.hasMore === "boolean",
    );
    check("blocks default page is 1", page.page === 1);
  }

  // An over-max pageSize is CLAMPED (to 100), not rejected -> still a 200.
  {
    const res = await blocksGET(blocksReq("?pageSize=9999"));
    check("blocks oversized pageSize -> 200 (clamped, not rejected)", res.status === 200);
    const page = (await res.json()) as { pageSize?: number };
    check("blocks oversized pageSize clamped to 100", page.pageSize === 100);
  }

  // Invalid pagination params each reach validation -> 400 BAD_REQUEST, std shape.
  for (const [label, query] of [
    ["page=0", "?page=0"],
    ["page non-numeric", "?page=abc"],
    ["pageSize negative", "?pageSize=-1"],
    ["pageSize fractional", "?pageSize=1.5"],
  ] as const) {
    const { status, body } = await readError(await blocksGET(blocksReq(query)));
    check(`blocks ${label} -> 400`, status === 400);
    check(`blocks ${label} -> BAD_REQUEST code`, body.error?.code === "BAD_REQUEST");
    check(`blocks ${label} uses the standard error shape`, isStandardErrorBody(body));
    check(`blocks ${label} message carries no stack trace`, hasNoStackTrace(body.error?.message));
  }

  // ---------------------------------------------------------------- /api/export
  // Happy paths: default + explicit json -> 200 JSON; csv -> 200 CSV.
  {
    const json = await exportGET(new Request("http://localhost/api/export"));
    check("export default -> 200", json.status === 200);
    check(
      "export default -> JSON content type",
      (json.headers.get("Content-Type") ?? "").includes("application/json"),
    );

    const csv = await exportGET(new Request("http://localhost/api/export?format=csv"));
    check("export csv -> 200", csv.status === 200);
    check(
      "export csv -> CSV content type",
      (csv.headers.get("Content-Type") ?? "").includes("text/csv"),
    );
  }

  // An unsupported ?format= is rejected before any DB work -> 400 BAD_REQUEST.
  {
    const { status, body } = await readError(
      await exportGET(new Request("http://localhost/api/export?format=xml")),
    );
    check("export bad format -> 400", status === 400);
    check("export bad format -> BAD_REQUEST code", body.error?.code === "BAD_REQUEST");
    check("export bad format uses the standard error shape", isStandardErrorBody(body));
    check("export bad format message carries no stack trace", hasNoStackTrace(body.error?.message));
  }

  // ---------------------------------------------------------------- /api/calendar
  // Authenticated (dev-user) export -> 200 ics.
  {
    const res = await calendarGET();
    check("calendar (root) -> 200", res.status === 200);
    check(
      "calendar (root) -> text/calendar content type",
      (res.headers.get("Content-Type") ?? "").includes("text/calendar"),
    );
  }

  // -------------------------------------------------------- /api/calendar/[token]
  // A valid token (the dev user's) -> 200 ics feed.
  {
    const token = await getCalendarToken();
    const res = await calendarFeed(token);
    check("calendar feed valid token -> 200", res.status === 200);
    check(
      "calendar feed valid token -> text/calendar content type",
      (res.headers.get("Content-Type") ?? "").includes("text/calendar"),
    );
  }

  // Empty / oversized / unknown tokens -> 404, and a real DB miss is byte-for-byte
  // identical to a short-circuited reject, so the public feed never leaks whether
  // a token maps to an existing user.
  {
    const empty = await readError(await calendarFeed(""));
    check("calendar feed empty token -> 404", empty.status === 404);
    check("calendar feed empty token -> NOT_FOUND code", empty.body.error?.code === "NOT_FOUND");
    check("calendar feed empty token uses the standard error shape", isStandardErrorBody(empty.body));

    const oversized = await readError(await calendarFeed("x".repeat(201)));
    check("calendar feed oversized token -> 404", oversized.status === 404);

    const unknown = await readError(await calendarFeed("no-such-calendar-token-1234567890"));
    check("calendar feed unknown token -> 404", unknown.status === 404);
    check(
      "calendar feed unknown token -> NOT_FOUND code",
      unknown.body.error?.code === "NOT_FOUND",
    );
    check(
      "malformed and unknown tokens return an identical 404 body (no row-existence leak)",
      empty.status === unknown.status &&
        empty.body.error?.code === unknown.body.error?.code &&
        empty.body.error?.message === unknown.body.error?.message,
    );
  }

  // ----------------------------------------------------------------- /api/stats
  // Happy path: analytics JSON for the dev user -> 200 with a stats-shaped body.
  {
    const res = await statsGET();
    check("stats -> 200", res.status === 200);
    check(
      "stats -> JSON content type",
      (res.headers.get("Content-Type") ?? "").includes("application/json"),
    );
    const stats = (await res.json()) as Record<string, unknown>;
    check("stats -> returns a JSON object body", stats != null && typeof stats === "object");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0));

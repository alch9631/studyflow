/**
 * Tests for the shared API error helpers. Run: npx tsx src/lib/apiError.test.ts
 */
import {
  ApiError,
  errorResponse,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  rateLimited,
  serverError,
  handleApiError,
  type ApiErrorBody,
} from "./apiError";
import { ValidationError } from "./validate";

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

/** Read a Response built by the helpers: its status + parsed JSON body. */
async function read(res: Response): Promise<{ status: number; body: ApiErrorBody }> {
  return { status: res.status, body: (await res.json()) as ApiErrorBody };
}

async function main() {
  // errorResponse: shape + status mapping
  {
    const { status, body } = await read(errorResponse("BAD_REQUEST", "nope"));
    check("errorResponse status maps to code", status === 400);
    check("errorResponse shape is { error: { code, message } }",
      body.error?.code === "BAD_REQUEST" && body.error?.message === "nope");
  }

  // Named builders: each maps to the right status + code, default messages exist
  for (const [fn, code, status] of [
    [badRequest, "BAD_REQUEST", 400],
    [unauthorized, "UNAUTHORIZED", 401],
    [forbidden, "FORBIDDEN", 403],
    [notFound, "NOT_FOUND", 404],
    [rateLimited, "RATE_LIMITED", 429],
    [serverError, "INTERNAL", 500],
  ] as const) {
    const { status: s, body } = await read(fn());
    check(`${code} builder -> ${status}`, s === status && body.error.code === code);
    check(`${code} builder has a default message`, body.error.message.length > 0);
  }

  // Named builder accepts a custom message
  {
    const { body } = await read(notFound("Calendar not found."));
    check("builder accepts custom message", body.error.message === "Calendar not found.");
  }

  // handleApiError: ApiError -> its own code + status
  {
    const { status, body } = await read(handleApiError(new ApiError("FORBIDDEN", "no access")));
    check("handleApiError(ApiError) keeps code", body.error.code === "FORBIDDEN");
    check("handleApiError(ApiError) keeps status", status === 403);
    check("handleApiError(ApiError) keeps message", body.error.message === "no access");
  }

  // handleApiError: ValidationError -> 400 BAD_REQUEST, message preserved
  {
    const { status, body } = await read(handleApiError(new ValidationError("Name is required.")));
    check("handleApiError(ValidationError) -> 400", status === 400);
    check("handleApiError(ValidationError) -> BAD_REQUEST", body.error.code === "BAD_REQUEST");
    check("handleApiError(ValidationError) keeps message", body.error.message === "Name is required.");
  }

  // handleApiError: unexpected error -> 500 INTERNAL, generic message (no leak)
  {
    // Silence the expected console.error for the unexpected-error path.
    const orig = console.error;
    console.error = () => {};
    const { status, body } = await read(handleApiError(new Error("db exploded: secret connection string")));
    console.error = orig;
    check("handleApiError(unknown) -> 500", status === 500);
    check("handleApiError(unknown) -> INTERNAL", body.error.code === "INTERNAL");
    check("handleApiError(unknown) does not leak the original message",
      !body.error.message.includes("secret connection string"));
  }

  // ApiError carries the right status for its code
  check("ApiError(NOT_FOUND).status === 404", new ApiError("NOT_FOUND", "x").status === 404);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();

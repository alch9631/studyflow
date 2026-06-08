/**
 * Unit tests for the shared pagination helpers.
 *
 * Covers: default page size, defaulting page=1, clamping an over-max pageSize
 * DOWN to the ceiling (not erroring), rejecting malformed params (non-numeric,
 * zero/negative, fractional) as ValidationError, skip/take derivation, and the
 * buildPage envelope math (totalPages, hasMore, empty set).
 *
 * Pure / no DB. Run: npx tsx src/lib/pagination.test.ts
 */
import {
  parsePageParams,
  buildPage,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./pagination";
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
/** True when calling `fn` throws a ValidationError. */
function throwsValidation(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof ValidationError;
  }
}
function params(obj: Record<string, string>) {
  return new URLSearchParams(obj);
}

// ── parsePageParams: defaults ───────────────────────────────────────────────
{
  const p = parsePageParams(new URLSearchParams());
  check("default page is 1", p.page === 1);
  check("default pageSize is DEFAULT_PAGE_SIZE", p.pageSize === DEFAULT_PAGE_SIZE);
  check("default skip is 0", p.skip === 0);
  check("default take equals pageSize", p.take === DEFAULT_PAGE_SIZE);
}

// Blank values fall back to defaults (coerce("") would otherwise be 0).
{
  const p = parsePageParams(params({ page: "", pageSize: "" }));
  check("blank params fall back to defaults", p.page === 1 && p.pageSize === DEFAULT_PAGE_SIZE);
}

// Accepts a plain object too (not just URLSearchParams).
{
  const p = parsePageParams({ page: "3", pageSize: "10" });
  check("accepts a plain object input", p.page === 3 && p.pageSize === 10);
}

// ── parsePageParams: valid values + skip/take derivation ────────────────────
{
  const p = parsePageParams(params({ page: "3", pageSize: "20" }));
  check("page parsed", p.page === 3);
  check("pageSize parsed", p.pageSize === 20);
  check("skip = (page-1)*pageSize", p.skip === 40);
  check("take = pageSize", p.take === 20);
}

// ── parsePageParams: clamping over-max pageSize DOWN (not erroring) ──────────
{
  const p = parsePageParams(params({ pageSize: String(MAX_PAGE_SIZE + 5000) }));
  check("over-max pageSize is clamped to MAX_PAGE_SIZE", p.pageSize === MAX_PAGE_SIZE);
  check("clamped take matches MAX_PAGE_SIZE", p.take === MAX_PAGE_SIZE);
}
{
  const p = parsePageParams(params({ pageSize: String(MAX_PAGE_SIZE) }));
  check("exactly-max pageSize is allowed", p.pageSize === MAX_PAGE_SIZE);
}

// ── parsePageParams: rejecting malformed input (400 via ValidationError) ────
check("rejects non-numeric page", throwsValidation(() => parsePageParams(params({ page: "abc" }))));
check("rejects non-numeric pageSize", throwsValidation(() => parsePageParams(params({ pageSize: "lots" }))));
check("rejects page < 1 (zero)", throwsValidation(() => parsePageParams(params({ page: "0" }))));
check("rejects negative page", throwsValidation(() => parsePageParams(params({ page: "-2" }))));
check("rejects pageSize < 1 (zero)", throwsValidation(() => parsePageParams(params({ pageSize: "0" }))));
check("rejects fractional page", throwsValidation(() => parsePageParams(params({ page: "1.5" }))));
check("rejects fractional pageSize", throwsValidation(() => parsePageParams(params({ pageSize: "2.7" }))));

// ── buildPage: envelope math ────────────────────────────────────────────────
{
  const rows = [{ id: "a" }, { id: "b" }];
  const page = buildPage(rows, 312, { page: 1, pageSize: 50, skip: 0, take: 50 });
  check("buildPage carries items", page.items === rows);
  check("buildPage carries page/pageSize", page.page === 1 && page.pageSize === 50);
  check("buildPage total", page.total === 312);
  check("buildPage totalPages = ceil(total/pageSize)", page.totalPages === 7);
  check("buildPage hasMore true on first of many pages", page.hasMore === true);
}
{
  // Last page: page 7 of 7 -> no more.
  const page = buildPage([{ id: "z" }], 312, { page: 7, pageSize: 50, skip: 300, take: 50 });
  check("buildPage hasMore false on last page", page.hasMore === false);
}
{
  // Empty result set: 0 total -> 0 pages, no more.
  const page = buildPage([], 0, { page: 1, pageSize: 50, skip: 0, take: 50 });
  check("buildPage empty -> totalPages 0", page.totalPages === 0);
  check("buildPage empty -> hasMore false", page.hasMore === false);
  check("buildPage empty -> items []", page.items.length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

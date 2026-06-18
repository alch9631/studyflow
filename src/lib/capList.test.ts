/**
 * Unit tests for the capList perf-budget helper.
 *
 * Covers: the no-op case (list shorter than the cap returns the SAME array,
 * capped=false), the trimming case (only the first N kept, correct hidden
 * count), the exact-fit boundary, max=0 ("show none"), negative/fractional caps
 * being clamped, and the empty-list case.
 *
 * Pure / no DB. Run: npx tsx src/lib/capList.test.ts
 */
import { capList } from "./capList";

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

// ── No-op: list already within the cap ──────────────────────────────────────
{
  const src = [1, 2, 3];
  const r = capList(src, 10);
  check("under cap keeps all items", r.items.length === 3);
  check("under cap hidden is 0", r.hidden === 0);
  check("under cap capped is false", r.capped === false);
  check("under cap returns same array reference (no copy)", r.items === src);
}

// ── Trimming: list longer than the cap ──────────────────────────────────────
{
  const src = [10, 20, 30, 40, 50];
  const r = capList(src, 3);
  check("over cap keeps only first N", r.items.length === 3);
  check("over cap keeps the FIRST items in order", r.items[0] === 10 && r.items[2] === 30);
  check("over cap hidden = length - max", r.hidden === 2);
  check("over cap capped is true", r.capped === true);
  check("over cap does not mutate source", src.length === 5);
}

// ── Exact-fit boundary: length === max ──────────────────────────────────────
{
  const src = [1, 2, 3];
  const r = capList(src, 3);
  check("exact fit keeps all items", r.items.length === 3);
  check("exact fit hidden is 0", r.hidden === 0);
  check("exact fit capped is false", r.capped === false);
  check("exact fit returns same array reference", r.items === src);
}

// ── max = 0 → show none, everything hidden ──────────────────────────────────
{
  const r = capList([1, 2, 3], 0);
  check("max 0 shows nothing", r.items.length === 0);
  check("max 0 hides everything", r.hidden === 3);
  check("max 0 capped is true", r.capped === true);
}

// ── Negative cap is clamped to 0 (not slice(0, -n) tail behaviour) ──────────
{
  const r = capList([1, 2, 3], -2);
  check("negative cap shows nothing", r.items.length === 0);
  check("negative cap hides everything", r.hidden === 3);
  check("negative cap capped is true", r.capped === true);
}

// ── Fractional cap is floored ───────────────────────────────────────────────
{
  const r = capList([1, 2, 3, 4], 2.9);
  check("fractional cap is floored to 2", r.items.length === 2);
  check("fractional cap hidden is 2", r.hidden === 2);
}

// ── Empty list ──────────────────────────────────────────────────────────────
{
  const r = capList([], 5);
  check("empty list -> empty items", r.items.length === 0);
  check("empty list -> hidden 0", r.hidden === 0);
  check("empty list -> capped false", r.capped === false);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

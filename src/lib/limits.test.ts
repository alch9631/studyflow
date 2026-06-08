/**
 * Tests for the defensive count-limit guards. Run: npx tsx src/lib/limits.test.ts
 */
import { ValidationError } from "./validate";
import { LIMITS, guardCount, guardCountBy } from "./limits";

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
/** True if `fn` throws a ValidationError. */
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof ValidationError;
  }
}

// LIMITS shape: every cap is a positive integer.
check(
  "all limits are positive integers",
  Object.values(LIMITS).every((v) => Number.isInteger(v) && v > 0),
);
check("courses cap is sane", LIMITS.MAX_COURSES_PER_USER >= 1);
check("body byte cap is set", LIMITS.MAX_REQUEST_BODY_BYTES >= 1);

// guardCount — rejects at/over the cap, allows below it.
check("guardCount allows below cap", !throws(() => guardCount(0, 5, "courses")));
check("guardCount allows just below cap", !throws(() => guardCount(4, 5, "courses")));
check("guardCount rejects at cap", throws(() => guardCount(5, 5, "courses")));
check("guardCount rejects over cap", throws(() => guardCount(99, 5, "courses")));
check(
  "guardCount message names the cap + label",
  (() => {
    try {
      guardCount(5, 5, "courses");
      return false;
    } catch (e) {
      return e instanceof ValidationError && e.message.includes("5") && e.message.includes("courses");
    }
  })(),
);

// guardCountBy — rejects when current+adding exceeds cap.
check("guardCountBy allows fitting batch", !throws(() => guardCountBy(2, 3, 5, "courses")));
check("guardCountBy allows exact fit", !throws(() => guardCountBy(0, 5, 5, "courses")));
check("guardCountBy rejects overflow", throws(() => guardCountBy(3, 3, 5, "courses")));
check("guardCountBy rejects when already full", throws(() => guardCountBy(5, 1, 5, "courses")));
check("guardCountBy allows adding zero at cap", !throws(() => guardCountBy(5, 0, 5, "courses")));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

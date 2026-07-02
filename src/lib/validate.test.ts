/**
 * Tests for the shared input-validation helpers. Run: npx tsx src/lib/validate.test.ts
 */
import {
  ValidationError,
  str,
  requireText,
  optionalText,
  longText,
  requireId,
  optionalId,
  isValidISODate,
  requireDate,
  optionalDate,
  toUTCDate,
  parseTimeToMinutes,
  requireWeekday,
  sanitizeStudyDays,
  clampInt,
  parseGrade,
  guardContentLength,
  guardTextSize,
  readJsonBody,
  requireBodyString,
} from "./validate";

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

const TODAY = "2026-06-07";

// str
check("str trims", str("  hi  ") === "hi");
check("str of non-string = ''", str(null) === "" && str(undefined) === "");

// requireText
check("requireText returns trimmed", requireText("  Algebra ", "Name") === "Algebra");
check("requireText rejects empty", throws(() => requireText("   ", "Name")));
check("requireText rejects too long", throws(() => requireText("x".repeat(5), "Name", 4)));

// optionalText
check("optionalText blank = null", optionalText("") === null);
check("optionalText value", optionalText(" room 5 ") === "room 5");
check("optionalText rejects too long", throws(() => optionalText("xx", 1)));

// longText
check("longText keeps content", longText("a\nb") === "a\nb");
check("longText blank = ''", longText("") === "");
check("longText rejects huge", throws(() => longText("x".repeat(200_001))));

// requireId / optionalId
check("requireId returns id", requireId("abc123", "Course") === "abc123");
check("requireId rejects empty", throws(() => requireId("", "Course")));
check("requireId rejects too long", throws(() => requireId("x".repeat(201))));
check("optionalId blank = null", optionalId("") === null);
check("optionalId value", optionalId("xyz") === "xyz");

// isValidISODate
check("valid iso date", isValidISODate("2026-06-07"));
check("rejects garbage", !isValidISODate("not-a-date"));
check("rejects wrong shape", !isValidISODate("2026/06/07"));
check("rejects impossible date", !isValidISODate("2026-13-40"));
// Rolled-over days: Date parses 2025-02-30 as Mar 2 — must be rejected, not rolled.
check("rejects rolled-over Feb 30", !isValidISODate("2025-02-30"));
check("rejects rolled-over Jun 31", !isValidISODate("2025-06-31"));
check("accepts real leap day", isValidISODate("2024-02-29"));
check("rejects Feb 29 in non-leap year", !isValidISODate("2025-02-29"));

// requireDate (the date-reject pattern)
check("requireDate valid future", requireDate("2026-12-01", "Exam date", TODAY) === "2026-12-01");
check("requireDate today is ok", requireDate(TODAY, "Exam date", TODAY) === TODAY);
check("requireDate rejects past", throws(() => requireDate("2026-01-01", "Exam date", TODAY)));
check("requireDate rejects empty", throws(() => requireDate("", "Exam date", TODAY)));
check("requireDate rejects invalid", throws(() => requireDate("nope", "Exam date", TODAY)));
check(
  "requireDate allowPast lets past through",
  requireDate("2020-01-01", "Due date", TODAY, { allowPast: true }) === "2020-01-01",
);
// Upper bound: ~2 years ahead. Unbounded dates (9999-12-31) would trigger
// massive date enumeration in the scheduler.
check(
  "requireDate accepts the +2y boundary",
  requireDate("2028-06-07", "Exam date", TODAY) === "2028-06-07",
);
check("requireDate rejects just past +2y", throws(() => requireDate("2028-06-08", "Exam date", TODAY)));
check("requireDate rejects far future", throws(() => requireDate("9999-12-31", "Exam date", TODAY)));
check(
  "requireDate far-future rejected even with allowPast",
  throws(() => requireDate("9999-12-31", "Due date", TODAY, { allowPast: true })),
);

// optionalDate
check("optionalDate blank = null", optionalDate("", "Exam date", TODAY) === null);
check("optionalDate validates when present", throws(() => optionalDate("2026-01-01", "Exam date", TODAY)));

// toUTCDate
check("toUTCDate is UTC midnight", toUTCDate("2026-06-07").toISOString() === "2026-06-07T00:00:00.000Z");

// parseTimeToMinutes
check("10:30 = 630", parseTimeToMinutes("10:30") === 630);
check("00:00 = 0", parseTimeToMinutes("00:00") === 0);
check("rejects 24:00", parseTimeToMinutes("24:00") === null);
check("rejects 10:60", parseTimeToMinutes("10:60") === null);
check("rejects garbage", parseTimeToMinutes("abc") === null);

// requireWeekday
check("weekday 0 ok", requireWeekday("0") === 0);
check("weekday 6 ok", requireWeekday("6") === 6);
check("weekday rejects 7", throws(() => requireWeekday("7")));
check("weekday rejects empty", throws(() => requireWeekday("")));

// sanitizeStudyDays
check("dedupes + sorts", sanitizeStudyDays(["3", "1", "1", "5"]) === "1,3,5");
check("splits csv entries", sanitizeStudyDays(["1,2,3"]) === "1,2,3");
check("drops out-of-range", sanitizeStudyDays(["1", "9", "-1"]) === "1");
check("empty -> fallback", sanitizeStudyDays([]) === "1,2,3,4,5");
check("custom fallback", sanitizeStudyDays(["x"], "0,6") === "0,6");

// clampInt
check("clamps high", clampInt("1000", 1, 600, 25) === 600);
check("clamps low", clampInt("-5", 1, 600, 25) === 1);
check("default on NaN", clampInt("", 1, 600, 25) === 25);
check("passes valid", clampInt("42", 1, 600, 25) === 42);

// parseGrade — blank clears (null); an invalid value throws instead of
// silently wiping the stored grade.
check("valid grade", parseGrade("1.7") === 1.7);
check("comma decimal", parseGrade("2,3") === 2.3);
check("blank = null", parseGrade("") === null);
check("out of range throws", throws(() => parseGrade("6")));
check("below range throws", throws(() => parseGrade("0.5")));
check("garbage throws", throws(() => parseGrade("abc")));

// ── payload size guards ──────────────────────────────────────────────────────

/** True if `fn` throws a ValidationError (async-aware). */
async function throwsAsync(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof ValidationError;
  }
}

// guardContentLength — header-based early reject.
check(
  "guardContentLength allows small body",
  !throws(() =>
    guardContentLength(new Request("http://x", { headers: { "content-length": "10" } }), 100),
  ),
);
check(
  "guardContentLength rejects oversized header",
  throws(() =>
    guardContentLength(new Request("http://x", { headers: { "content-length": "999" } }), 100),
  ),
);
check(
  "guardContentLength tolerates missing header",
  !throws(() => guardContentLength(new Request("http://x"), 100)),
);

// guardTextSize — decoded byte length.
check("guardTextSize allows under cap", !throws(() => guardTextSize("hello", 100)));
check("guardTextSize rejects over cap", throws(() => guardTextSize("x".repeat(101), 100)));
check(
  "guardTextSize counts utf-8 bytes not chars",
  throws(() => guardTextSize("é".repeat(3), 5)), // 'é' = 2 bytes -> 6 > 5
);

// requireBodyString — JSON-body counterpart to requireText.
check("requireBodyString returns value", requireBodyString("Algebra", "Name", 100) === "Algebra");
check("requireBodyString rejects empty", throws(() => requireBodyString("", "Name", 100)));
check("requireBodyString rejects non-string", throws(() => requireBodyString(42, "Name", 100)));
check("requireBodyString rejects too long", throws(() => requireBodyString("xx", "Name", 1)));

// Async tests run last; they own the final summary so the process exits correctly.
(async () => {
  // readJsonBody — parses valid JSON, rejects oversized + malformed.
  const okBody = await readJsonBody<{ a: number }>(
    new Request("http://x", { method: "POST", body: JSON.stringify({ a: 1 }) }),
    1000,
  );
  check("readJsonBody parses valid JSON", okBody.a === 1);
  check(
    "readJsonBody rejects oversized body",
    await throwsAsync(() =>
      readJsonBody(
        new Request("http://x", { method: "POST", body: "x".repeat(101) }),
        100,
      ),
    ),
  );
  check(
    "readJsonBody rejects malformed JSON",
    await throwsAsync(() =>
      readJsonBody(new Request("http://x", { method: "POST", body: "{not json" }), 1000),
    ),
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();

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

// parseGrade
check("valid grade", parseGrade("1.7") === 1.7);
check("comma decimal", parseGrade("2,3") === 2.3);
check("blank = null", parseGrade("") === null);
check("out of range = null", parseGrade("6") === null);
check("below range = null", parseGrade("0.5") === null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

/**
 * Tests for the .ics calendar builder. Run: npx tsx src/lib/ics.test.ts
 */
import { buildCalendar, type CalendarBlock } from "./ics";

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

const block = (over: Partial<CalendarBlock> = {}): CalendarBlock => ({
  date: new Date("2026-06-08T00:00:00Z"),
  minutes: 30,
  topicTitle: "Graphs",
  kind: "study",
  course: { name: "Algorithms" },
  ...over,
});

const empty = buildCalendar([]);
check("empty wraps in VCALENDAR", empty.startsWith("BEGIN:VCALENDAR") && empty.includes("END:VCALENDAR"));
check("empty has no events", !empty.includes("BEGIN:VEVENT"));

const one = buildCalendar([block()]);
check("one block → one event", (one.match(/BEGIN:VEVENT/g) || []).length === 1);
check("study summary has topic + course", one.includes("📚 Graphs (Algorithms)"));
check("starts at 09:00", one.includes("DTSTART:20260608T090000"));
check("uses CRLF line endings", one.includes("\r\n"));

const review = buildCalendar([block({ kind: "review", topicTitle: "Sorting" })]);
check("review summary prefixed", review.includes("🔁 Review: Sorting"));

// escaping (commas/semicolons in names)
const esc = buildCalendar([block({ course: { name: "A, B; C" } })]);
check("escapes comma + semicolon", esc.includes("A\\, B\\; C"));

// two blocks same day lay back-to-back
const two = buildCalendar([block(), block({ topicTitle: "DP" })]);
check("two same-day events", (two.match(/BEGIN:VEVENT/g) || []).length === 2);
check("second starts where first ends", two.includes("DTSTART:20260608T093000"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

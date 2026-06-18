/**
 * Tests for the date helpers. Run: npx tsx src/lib/dates.test.ts
 *
 * These are timezone/day-boundary correctness tests. `daysUntil` does pure UTC
 * calendar-date arithmetic (it never reads the machine clock or TZ), so every
 * case here is deterministic regardless of the process timezone. The few
 * timezone-sensitive cases derive "today" from a fixed instant via Intl with an
 * explicit timeZone, which is driven by the tz database — not `process.env.TZ` —
 * so they stay deterministic on any machine.
 */
import { daysUntil, examCountdownLabel, dueLabel, formatFriendlyDate } from "./dates";

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

// A UTC-midnight Date for a calendar date — how the app persists exam/due dates.
const d = (iso: string) => new Date(iso + "T00:00:00Z");
// A Date at an arbitrary instant on a given UTC day (to probe day boundaries).
const at = (iso: string) => new Date(iso);
// The app's "today" rule: the Europe/Berlin calendar date for a fixed instant.
// Mirrors planService.todayISO without reading the wall clock.
const berlinDate = (instant: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(instant));

// ── daysUntil: basic offsets ────────────────────────────────────────────────
check("same day = 0", daysUntil(d("2026-06-07"), "2026-06-07") === 0);
check("tomorrow = 1", daysUntil(d("2026-06-08"), "2026-06-07") === 1);
check("yesterday = -1", daysUntil(d("2026-06-06"), "2026-06-07") === -1);
check("a week = 7", daysUntil(d("2026-06-14"), "2026-06-07") === 7);
check("across month boundary", daysUntil(d("2026-07-01"), "2026-06-29") === 2);

// ── daysUntil: month / year rollover ─────────────────────────────────────────
check("month rollover Jan→Feb", daysUntil(d("2026-02-01"), "2026-01-31") === 1);
check("31-day month length", daysUntil(d("2026-02-01"), "2026-01-01") === 31);
check("30-day month length", daysUntil(d("2026-05-01"), "2026-04-01") === 30);
check("year rollover", daysUntil(d("2027-01-01"), "2026-12-31") === 1);
check("year rollover backwards", daysUntil(d("2026-12-31"), "2027-01-01") === -1);
check("full common year = 365", daysUntil(d("2027-06-08"), "2026-06-08") === 365);
check("full leap year = 366", daysUntil(d("2025-01-01"), "2024-01-01") === 366);

// ── daysUntil: leap day ──────────────────────────────────────────────────────
check("leap: Feb 28 → Mar 1 spans Feb 29 (=2)", daysUntil(d("2024-03-01"), "2024-02-28") === 2);
check("non-leap: Feb 28 → Mar 1 (=1)", daysUntil(d("2026-03-01"), "2026-02-28") === 1);
check("lands on leap day", daysUntil(d("2024-02-29"), "2024-02-28") === 1);
check("century non-leap 1900", daysUntil(d("1900-03-01"), "1900-02-28") === 1);
check("century leap 2000", daysUntil(d("2000-03-01"), "2000-02-28") === 2);

// ── daysUntil: day-boundary inclusivity (UTC) ────────────────────────────────
// Any instant within a UTC day collapses to that day's calendar date.
check("start-of-day instant = today", daysUntil(at("2026-06-07T00:00:00.000Z"), "2026-06-07") === 0);
check("end-of-day instant still = today", daysUntil(at("2026-06-07T23:59:59.999Z"), "2026-06-07") === 0);
check("noon instant = today", daysUntil(at("2026-06-07T12:00:00Z"), "2026-06-07") === 0);
check(
  "one ms past UTC midnight rolls to next day",
  daysUntil(at("2026-06-08T00:00:00.000Z"), "2026-06-07") === 1,
);
check(
  "one ms before UTC midnight is still prior day",
  daysUntil(at("2026-06-07T23:59:59.999Z"), "2026-06-08") === -1,
);

// ── daysUntil: DST immunity ──────────────────────────────────────────────────
// Europe/Berlin springs forward 2026-03-29 (23h local day) and falls back
// 2026-10-25 (25h local day). Calendar-day counts must ignore those entirely.
check("span spring-forward day = 2", daysUntil(d("2026-03-30"), "2026-03-28") === 2);
check("onto spring-forward day = 1", daysUntil(d("2026-03-29"), "2026-03-28") === 1);
check("span fall-back day = 2", daysUntil(d("2026-10-26"), "2026-10-24") === 2);
check("onto fall-back day = 1", daysUntil(d("2026-10-25"), "2026-10-24") === 1);
check("week spanning spring DST = 7", daysUntil(d("2026-04-01"), "2026-03-25") === 7);
check("week spanning fall DST = 7", daysUntil(d("2026-10-28"), "2026-10-21") === 7);

// ── daysUntil: timezone-sensitive "is today / is past due" ───────────────────
// At 23:30 UTC it is already the next calendar day in Berlin (UTC+2 in summer).
// A due date stored for that Berlin day must read "due today", not "tomorrow" —
// this is exactly why the app anchors "today" to Berlin, not UTC.
check(
  "late-night UTC, due tomorrow-in-UTC reads due today in Berlin",
  daysUntil(d("2026-06-09"), berlinDate("2026-06-08T23:30:00Z")) === 0,
);
check(
  "early-evening UTC still same Berlin day → due tomorrow",
  daysUntil(d("2026-06-09"), berlinDate("2026-06-08T21:30:00Z")) === 1,
);
check(
  "just after Berlin midnight: prior day's deadline is overdue",
  daysUntil(d("2026-06-08"), berlinDate("2026-06-08T22:30:00Z")) === -1,
);
// Winter (UTC+1): the day flips at 23:00 UTC.
check(
  "winter pre-Berlin-midnight stays same day",
  daysUntil(d("2026-01-02"), berlinDate("2026-01-01T22:30:00Z")) === 1,
);
check(
  "winter post-Berlin-midnight crosses the boundary",
  daysUntil(d("2026-01-02"), berlinDate("2026-01-01T23:30:00Z")) === 0,
);
// Year boundary in Berlin: 23:30 UTC on Dec 31 is already New Year locally.
check(
  "new year in Berlin while still Dec 31 in UTC",
  daysUntil(d("2027-01-01"), berlinDate("2026-12-31T23:30:00Z")) === 0,
);
// DST-transition day: the calendar date is stable across the clock change.
check(
  "Berlin date stable through spring-forward",
  daysUntil(d("2026-03-29"), berlinDate("2026-03-29T01:30:00Z")) === 0,
);
check(
  "Berlin date stable through fall-back",
  daysUntil(d("2026-10-25"), berlinDate("2026-10-25T23:30:00Z")) === -1,
);

// ── daysUntil: robustness ────────────────────────────────────────────────────
check("invalid Date → NaN (no throw)", Number.isNaN(daysUntil(new Date("nope"), "2026-06-07")));
check("malformed todayISO → NaN (no throw)", Number.isNaN(daysUntil(d("2026-06-07"), "not-a-date")));
check("large future range", daysUntil(d("2126-06-07"), "2026-06-07") > 36_000);

// ── examCountdownLabel ───────────────────────────────────────────────────────
check("exam passed", examCountdownLabel(-1) === "exam passed");
check("exam today", examCountdownLabel(0) === "exam today");
check("exam tomorrow", examCountdownLabel(1) === "exam tomorrow");
check("days to exam", examCountdownLabel(5) === "5 days to exam");
check("days-to-exam upper edge (30)", examCountdownLabel(30) === "30 days to exam");
check("weeks-to-exam lower edge (31)", examCountdownLabel(31) === "4 weeks to exam");
check("weeks to exam", examCountdownLabel(42) === "6 weeks to exam");

// ── dueLabel ─────────────────────────────────────────────────────────────────
check("overdue", dueLabel(-3) === "overdue");
check("due today", dueLabel(0) === "due today");
check("due tomorrow", dueLabel(1) === "due tomorrow");
check("days left", dueLabel(5) === "5 days left");
check("days-left upper edge (14)", dueLabel(14) === "14 days left");
check("weeks-left lower edge (15)", dueLabel(15) === "2 weeks left");
check("weeks left", dueLabel(21) === "3 weeks left");

// ── formatFriendlyDate ───────────────────────────────────────────────────────
// Read as a UTC calendar date and formatted in UTC, so the day never shifts.
check("friendly en short label", formatFriendlyDate("2026-06-21", "en") === "Sun, Jun 21");
check("friendly de short label", formatFriendlyDate("2026-06-21", "de") === "So., 21. Juni");
check(
  "friendly tolerates a full ISO instant (date part only)",
  formatFriendlyDate("2026-06-21T00:00:00.000Z", "en") === "Sun, Jun 21",
);
check(
  "friendly is UTC-stable (no off-by-one from local tz)",
  formatFriendlyDate("2026-01-01", "en") === "Thu, Jan 1",
);
check("friendly leap day", formatFriendlyDate("2024-02-29", "en") === "Thu, Feb 29");
check("friendly invalid input degrades to raw string", formatFriendlyDate("not-a-date", "en") === "not-a-date");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

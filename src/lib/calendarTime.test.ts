/**
 * Tests for the calendar time helpers. Run: npx tsx src/lib/calendarTime.test.ts
 *
 * These are timezone/DST correctness tests. Every conversion is anchored to an
 * explicit tz (Europe/Berlin), driven by the tz database — not `process.env.TZ`
 * — so the cases stay deterministic on any machine. We cover DST-safe
 * local↔UTC round-trips (incl. the spring-forward / fall-back days), overlap
 * true/false, and the cross-midnight guard.
 */
import {
  DEFAULT_TZ,
  MINUTES_PER_DAY,
  dayMinutesToInstant,
  instantToDayISO,
  instantToDayMinutes,
  instantToHHMM,
  minutesToHHMM,
  hhmmToMinutes,
  rangesOverlap,
  checkBlockTimes,
  clampToDay,
} from "./calendarTime";

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

// ── minutes-of-day formatting ────────────────────────────────────────────────
check("minutesToHHMM midnight", minutesToHHMM(0) === "00:00");
check("minutesToHHMM 06:30", minutesToHHMM(390) === "06:30");
check("minutesToHHMM 23:59", minutesToHHMM(1439) === "23:59");
check("hhmmToMinutes 06:30", hhmmToMinutes("06:30") === 390);
check("hhmmToMinutes pads ok", hhmmToMinutes("6:05") === 365);
check("hhmmToMinutes rejects junk", hhmmToMinutes("nope") === null);
check("hhmmToMinutes rejects 24:00", hhmmToMinutes("24:00") === null);
check("hhmmToMinutes rejects 12:60", hhmmToMinutes("12:60") === null);

// ── local↔UTC round-trip (summer, UTC+2) ─────────────────────────────────────
// 10:00 Berlin on a summer day is 08:00 UTC.
{
  const inst = dayMinutesToInstant("2026-06-15", 600, DEFAULT_TZ);
  check("summer 10:00 Berlin = 08:00Z", inst.toISOString() === "2026-06-15T08:00:00.000Z");
  check("summer round-trip minutes", instantToDayMinutes(inst, DEFAULT_TZ) === 600);
  check("summer round-trip day", instantToDayISO(inst, DEFAULT_TZ) === "2026-06-15");
  check("summer HH:MM label", instantToHHMM(inst, DEFAULT_TZ) === "10:00");
}

// ── local↔UTC round-trip (winter, UTC+1) ─────────────────────────────────────
// 10:00 Berlin on a winter day is 09:00 UTC.
{
  const inst = dayMinutesToInstant("2026-01-15", 600, DEFAULT_TZ);
  check("winter 10:00 Berlin = 09:00Z", inst.toISOString() === "2026-01-15T09:00:00.000Z");
  check("winter round-trip minutes", instantToDayMinutes(inst, DEFAULT_TZ) === 600);
  check("winter round-trip day", instantToDayISO(inst, DEFAULT_TZ) === "2026-01-15");
}

// ── DST: spring-forward day (2026-03-29, clocks 02:00→03:00 local) ────────────
// A 06:00 local block on the DST day still round-trips cleanly (it's past the
// gap). 06:00 Berlin on that day is 04:00 UTC (already on summer time).
{
  const inst = dayMinutesToInstant("2026-03-29", 360, DEFAULT_TZ);
  check("spring-forward 06:00 round-trips", instantToDayMinutes(inst, DEFAULT_TZ) === 360);
  check("spring-forward day stable", instantToDayISO(inst, DEFAULT_TZ) === "2026-03-29");
  check("spring-forward 06:00 Berlin = 04:00Z", inst.toISOString() === "2026-03-29T04:00:00.000Z");
}

// ── DST: fall-back day (2026-10-25, clocks 03:00→02:00 local) ─────────────────
// A 06:00 local block on the fall-back day round-trips; 06:00 Berlin is 05:00 UTC
// (winter time after the change).
{
  const inst = dayMinutesToInstant("2026-10-25", 360, DEFAULT_TZ);
  check("fall-back 06:00 round-trips", instantToDayMinutes(inst, DEFAULT_TZ) === 360);
  check("fall-back day stable", instantToDayISO(inst, DEFAULT_TZ) === "2026-10-25");
  check("fall-back 06:00 Berlin = 05:00Z", inst.toISOString() === "2026-10-25T05:00:00.000Z");
}

// ── tz override (a different anchor) ──────────────────────────────────────────
{
  // 10:00 UTC, displayed in UTC, is 10:00 / 600 min — no offset.
  const inst = dayMinutesToInstant("2026-06-15", 600, "UTC");
  check("UTC anchor no offset", inst.toISOString() === "2026-06-15T10:00:00.000Z");
  check("UTC anchor round-trip", instantToDayMinutes(inst, "UTC") === 600);
}

// ── exclusive end at local midnight (minute 1440) rolls to next day ───────────
// A block ending at 24:00 (study window end / resize to bottom of day) must map
// to next-day local midnight, NOT "24:00 same day" (which lands a day early).
{
  const start = dayMinutesToInstant("2026-06-15", 1380, DEFAULT_TZ); // 23:00 Berlin = 21:00Z
  const end = dayMinutesToInstant("2026-06-15", MINUTES_PER_DAY, DEFAULT_TZ); // 24:00 → next midnight
  check("midnight end = next-day 00:00 Berlin (22:00Z summer)", end.toISOString() === "2026-06-15T22:00:00.000Z");
  check("midnight end is after a same-day start", end.getTime() > start.getTime());
}

// ── overlap detection ─────────────────────────────────────────────────────────
check("overlap: clear overlap true", rangesOverlap(600, 660, 630, 690) === true);
check("overlap: identical true", rangesOverlap(600, 660, 600, 660) === true);
check("overlap: contained true", rangesOverlap(600, 720, 630, 660) === true);
check("overlap: disjoint false", rangesOverlap(600, 660, 700, 760) === false);
check("overlap: touching edge false", rangesOverlap(600, 660, 660, 720) === false);
check("overlap: touching edge (reversed) false", rangesOverlap(660, 720, 600, 660) === false);

// ── cross-midnight guard ──────────────────────────────────────────────────────
check("check: valid same-day block ok", checkBlockTimes(600, 660).ok === true);
{
  const r = checkBlockTimes(600, 660);
  check("check: returns the minutes", r.ok && r.startMin === 600 && r.endMin === 660);
}
{
  const r = checkBlockTimes(660, 600);
  check("check: end before start rejected", !r.ok && r.reason === "end-before-start");
}
{
  const r = checkBlockTimes(600, 600);
  check("check: zero-length rejected", !r.ok && r.reason === "end-before-start");
}
{
  const r = checkBlockTimes(1380, MINUTES_PER_DAY + 60); // 23:00 → 01:00 next day
  check("check: cross-midnight rejected", !r.ok && r.reason === "cross-midnight");
}
check("check: exactly-midnight end ok", checkBlockTimes(1380, MINUTES_PER_DAY).ok === true);

// ── clampToDay ────────────────────────────────────────────────────────────────
{
  const c = clampToDay(1380, MINUTES_PER_DAY + 120); // 23:00 → 02:00 → trimmed
  check("clamp: trims to midnight", c !== null && c.endMin === MINUTES_PER_DAY && c.startMin === 1380);
}
{
  const c = clampToDay(600, 660);
  check("clamp: same-day untouched", c !== null && c.startMin === 600 && c.endMin === 660);
}
check("clamp: start past midnight unschedulable", clampToDay(MINUTES_PER_DAY, MINUTES_PER_DAY + 60) === null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

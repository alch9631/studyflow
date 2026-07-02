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

// ── DST: the SKIPPED hour itself (02:00–02:59 doesn't exist on 2026-03-29) ────
// A skipped wall time has no instant; it must be pushed FORWARD past the gap by
// its width (02:30 → 03:30), never mapped to an earlier instant — date-fns-tz's
// raw resolution lands one hour BEFORE the jump (02:30 read back as 01:30),
// which could put a block's end before its start.
{
  const gapStart = dayMinutesToInstant("2026-03-29", 120, DEFAULT_TZ); // 02:00 → 03:00
  check("skipped 02:00 snaps to 03:00 (01:00Z)", gapStart.toISOString() === "2026-03-29T01:00:00.000Z");
  check("skipped 02:00 reads back as 03:00", instantToDayMinutes(gapStart, DEFAULT_TZ) === 180);
  const gapMid = dayMinutesToInstant("2026-03-29", 150, DEFAULT_TZ); // 02:30 → 03:30
  check("skipped 02:30 pushed to 03:30 (01:30Z)", gapMid.toISOString() === "2026-03-29T01:30:00.000Z");
  check("skipped 02:30 reads back at/after input", instantToDayMinutes(gapMid, DEFAULT_TZ) === 210);
  check("skipped 02:30 day stable", instantToDayISO(gapMid, DEFAULT_TZ) === "2026-03-29");
  // Ordering survives the gap: an 01:59 start stays strictly before a 02:30 end.
  const preGap = dayMinutesToInstant("2026-03-29", 119, DEFAULT_TZ);
  check("skipped hour keeps ordering", gapMid.getTime() > preGap.getTime());
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

// ── exactly-midnight end (minutes === 1440 → next day 00:00, not this day 24:00) ─
// checkBlockTimes/clampToDay bless a 1440 end as valid; dayMinutesToInstant must
// map it to the NEXT day's midnight (the true end-of-day), never this day's start.
{
  const startOfDay = dayMinutesToInstant("2026-06-15", 0, DEFAULT_TZ);
  const endAtMidnight = dayMinutesToInstant("2026-06-15", MINUTES_PER_DAY, DEFAULT_TZ);
  check("midnight end = next day 00:00", endAtMidnight.toISOString() === "2026-06-15T22:00:00.000Z");
  check("midnight end is 24h after day start", endAtMidnight.getTime() - startOfDay.getTime() === 24 * 60 * 60 * 1000);
  check("midnight end lands on next calendar day", instantToDayISO(endAtMidnight, DEFAULT_TZ) === "2026-06-16");
  // A 23:30 → 24:00 block: end must be strictly after start (was a 23.5h-early bug).
  const start2330 = dayMinutesToInstant("2026-06-15", 1410, DEFAULT_TZ);
  check("23:30→midnight end after start", endAtMidnight.getTime() > start2330.getTime());
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

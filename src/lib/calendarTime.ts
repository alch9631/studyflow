/**
 * Pure date/time helpers for the calendar's time-of-day scheduling (M3).
 *
 * A StudyBlock can carry an optional `startTime`/`endTime` (UTC instants). The
 * calendar shows them in the student's local zone (Europe/Berlin by default), so
 * we need DST-safe conversions between "a wall-clock minute on a calendar day"
 * and the absolute instant we persist. All helpers are pure (no wall clock, no
 * process TZ) and anchor to an explicit `tz` so they're deterministic and
 * testable. Time math is DST-aware via date-fns-tz.
 */
import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";

/** The app's default scheduling timezone (matches planService's "today" rule). */
export const DEFAULT_TZ = "Europe/Berlin";

/** Minutes in a day — the cross-midnight ceiling. */
export const MINUTES_PER_DAY = 24 * 60;

/**
 * The absolute UTC instant for a wall-clock minute-of-day on a calendar date, as
 * seen in `tz`. Round-trips with {@link instantToDayMinutes} for every wall-clock
 * time that exists. DST-safe: a time inside the spring-forward gap (which has no
 * instant — Berlin 02:00→03:00) resolves to the first wall time that DOES exist
 * at or after it (02:00…02:59 all → 03:00), so the result is always a real wall
 * time at/after the requested one.
 *
 * The mapping is non-decreasing across a day: for m1 < m2 the instant for m1 is
 * never later than the instant for m2. The calendar depends on that — overlap
 * checks, drag placement and end-after-start all assume a later minute means a
 * later instant.
 *
 * @param dayISO  YYYY-MM-DD (the calendar day in `tz`)
 * @param minutes minutes from local midnight (0…1439)
 */
export function dayMinutesToInstant(dayISO: string, minutes: number, tz = DEFAULT_TZ): Date {
  // An exactly-midnight end (minutes === 1440, blessed as valid by checkBlockTimes
  // / clampToDay) is the NEXT day's 00:00, not this day's hour "24" — the latter is
  // parsed by date-fns-tz as this day's 00:00 (the day's START), which would store
  // an end 24h before the start. Roll any full-day overflow into the date so the
  // instant is the true end-of-day.
  const dayCarry = Math.floor(minutes / MINUTES_PER_DAY);
  const mins = minutes - dayCarry * MINUTES_PER_DAY;
  const iso = dayCarry > 0 ? addDaysISO(dayISO, dayCarry) : dayISO;
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  // Interpret "this wall-clock time, in tz" → the UTC instant.
  const instant = fromZonedTime(`${iso}T${h}:${m}:00`, tz);
  if (roundTrips(instant, iso, mins, tz)) return instant;

  // The requested wall time does not exist — it fell in a spring-forward gap
  // (Berlin 02:00→03:00). Map it to the FIRST wall time that does exist at or
  // after it, i.e. the instant the clocks jump to.
  //
  // Letting date-fns-tz resolve it instead is what used to happen, and it is
  // subtly wrong: it returns the requested time shifted by the gap width, so
  // 02:30 became 03:30 — the same instant a directly-requested 03:30 maps to.
  // Two different requested times collided on one instant, and the sequence ran
  // backwards at 03:00 (02:55 → 01:55Z, then 03:00 → 01:00Z). A calendar day
  // whose minute→instant mapping is not monotonic can order a block's end
  // before its start and make dragged blocks land on top of each other.
  //
  // Scanning forward finds the gap's far edge without hardcoding its width, so
  // this stays correct for zones with 30-minute or two-hour transitions. The
  // loop only runs for times inside a gap (≤ once a year, bounded by the day).
  for (let probe = mins + 1; probe < MINUTES_PER_DAY; probe++) {
    const candidate = fromZonedTime(
      `${iso}T${String(Math.floor(probe / 60)).padStart(2, "0")}:${String(probe % 60).padStart(2, "0")}:00`,
      tz,
    );
    if (roundTrips(candidate, iso, probe, tz)) return candidate;
  }
  return instant;
}

/** Does this instant read back as exactly the wall time it was built from? */
function roundTrips(instant: Date, dayISO: string, minutes: number, tz: string): boolean {
  return instantToDayMinutes(instant, tz) === minutes && instantToDayISO(instant, tz) === dayISO;
}

/** Advance a YYYY-MM-DD calendar date by `n` days (pure, tz-free UTC math). */
function addDaysISO(dayISO: string, n: number): string {
  const [y, mo, d] = dayISO.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

/** The calendar day (YYYY-MM-DD) an instant falls on, in `tz`. */
export function instantToDayISO(instant: Date, tz = DEFAULT_TZ): string {
  return formatInTimeZone(instant, tz, "yyyy-MM-dd");
}

/** Minutes-from-local-midnight an instant maps to, in `tz` (0…1439). */
export function instantToDayMinutes(instant: Date, tz = DEFAULT_TZ): number {
  const z = toZonedTime(instant, tz);
  return z.getHours() * 60 + z.getMinutes();
}

/** "HH:MM" (24h) for an instant in `tz` — convenience for labels. */
export function instantToHHMM(instant: Date, tz = DEFAULT_TZ): string {
  return formatInTimeZone(instant, tz, "HH:mm");
}

/** Format minutes-of-day as "HH:MM" (24h). Pure, no tz needed. */
export function minutesToHHMM(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** "HH:MM" → minutes-from-midnight, or null if malformed / out of range. */
export function hhmmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Do two half-open minute ranges [startA,endA) / [startB,endB) overlap? Touching
 * edges (one ends exactly when the other starts) do NOT overlap.
 */
export function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
}

/**
 * Result of validating a proposed timed block on a single calendar day.
 *  - ok:false, reason "end-before-start" — end ≤ start (zero/negative length)
 *  - ok:false, reason "cross-midnight"  — end runs past local midnight
 *  - ok:true — a valid same-day block
 */
export type BlockTimeCheck =
  | { ok: true; startMin: number; endMin: number }
  | { ok: false; reason: "end-before-start" | "cross-midnight" };

/**
 * Guard a proposed start/end (minutes-of-day) for a single-day block. Rejects a
 * block that crosses into the next day — the calendar is day-columned, so a block
 * must begin and end on the same local day. Also rejects end ≤ start.
 */
export function checkBlockTimes(startMin: number, endMin: number): BlockTimeCheck {
  if (endMin <= startMin) return { ok: false, reason: "end-before-start" };
  if (endMin > MINUTES_PER_DAY) return { ok: false, reason: "cross-midnight" };
  return { ok: true, startMin, endMin };
}

/**
 * Clamp a proposed block so it never crosses local midnight: a block whose end
 * would spill past midnight is trimmed to end at midnight (preserving start). If
 * start is already at/after midnight the block is unschedulable → null.
 */
export function clampToDay(startMin: number, endMin: number): { startMin: number; endMin: number } | null {
  if (startMin >= MINUTES_PER_DAY) return null;
  return { startMin, endMin: Math.min(endMin, MINUTES_PER_DAY) };
}

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
 * seen in `tz`. Round-trips with {@link instantToDayMinutes}. DST-safe: e.g. on a
 * spring-forward day the skipped local hour still maps to a real instant.
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
  return fromZonedTime(`${iso}T${h}:${m}:00`, tz);
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

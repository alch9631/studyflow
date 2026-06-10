// Study-time aggregation + streak helpers. Pure functions over already-fetched
// StudyBlocks so every metric is deterministic and unit-testable. Like stats.ts,
// dates are handled in UTC and "today" is always passed in as a YYYY-MM-DD string
// so day boundaries are consistent regardless of the server's local timezone.
//
// These complement (do NOT duplicate) stats.ts: where stats.ts exposes a fixed
// 7-day completed-minute series and Set<string>-based streaks, this module builds
// the active-day set straight from blocks and offers arbitrary-period grouping
// (per day / per ISO week / per course) over a configurable minute metric.

import { dayKey } from "./stats";

const DAY_MS = 86_400_000;

// ---- Input shape ------------------------------------------------------------

/** Minimal block shape these helpers need (subset of stats.ts `StatsBlock`). */
export type TimeBlock = {
  date: Date;
  minutes: number;
  completed: boolean;
  actualMinutes: number | null;
  courseId: string;
};

/**
 * Which minutes to count when aggregating:
 *  - "completed": planned minutes of blocks marked done (effort actually put in
 *    against the plan).
 *  - "logged": real Pomodoro/focus minutes (`actualMinutes`), the truest measure
 *    of time-on-task.
 *  - "planned": all planned minutes regardless of completion.
 */
export type MinuteMetric = "completed" | "logged" | "planned";

/** Minutes contributed by a single block under a given metric. */
export function blockMinutes(b: TimeBlock, metric: MinuteMetric): number {
  switch (metric) {
    case "planned":
      return b.minutes;
    case "completed":
      return b.completed ? b.minutes : 0;
    case "logged":
      return b.actualMinutes && b.actualMinutes > 0 ? b.actualMinutes : 0;
  }
}

// ---- Day helpers ------------------------------------------------------------

/** Parse a YYYY-MM-DD string to its UTC midnight Date. */
function isoToDate(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

/**
 * The set of day keys (YYYY-MM-DD) on which the student was "active" — i.e. has
 * at least one block that counts under `metric` with non-zero minutes. Defaults
 * to "completed" so a day counts only once a study block is actually done.
 */
export function activeDayKeys(
  blocks: TimeBlock[],
  metric: MinuteMetric = "completed",
): Set<string> {
  const days = new Set<string>();
  for (const b of blocks) {
    if (blockMinutes(b, metric) > 0) days.add(dayKey(b.date));
  }
  return days;
}

// ---- Streaks ----------------------------------------------------------------

export type StreakSummary = {
  /**
   * Consecutive active days ending today — or yesterday if today isn't active
   * yet, so the streak isn't reported as broken mid-day. 0 if the most recent
   * activity is older than yesterday.
   */
  current: number;
  /** Longest run of consecutive active days anywhere in the history. */
  longest: number;
  /** Total distinct active days (handy denominator for consistency metrics). */
  totalActiveDays: number;
  /** Most recent active day key, or null if there is none. */
  lastActiveDay: string | null;
};

/**
 * Compute current + longest streak (and a couple of extras) from raw blocks in a
 * single helper. Builds the active-day set internally via `activeDayKeys`, so
 * callers don't have to pre-bucket by day. Day boundaries follow the UTC
 * `dayKey`, matching stats.ts and dates.ts.
 */
export function streakSummary(
  blocks: TimeBlock[],
  todayISO: string,
  metric: MinuteMetric = "completed",
): StreakSummary {
  const days = activeDayKeys(blocks, metric);
  return streakSummaryFromKeys(days, todayISO);
}

/** Streak summary from a pre-built set of active day keys. */
export function streakSummaryFromKeys(
  days: Set<string>,
  todayISO: string,
): StreakSummary {
  if (days.size === 0) {
    return { current: 0, longest: 0, totalActiveDays: 0, lastActiveDay: null };
  }

  const sorted = [...days].sort(); // YYYY-MM-DD sorts lexicographically = chronologically

  // ---- longest run ----
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = isoToDate(sorted[i - 1]).getTime();
    const cur = isoToDate(sorted[i]).getTime();
    if (cur - prev === DAY_MS) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  // ---- current run (ending today, with a one-day grace) ----
  let current = 0;
  const cursor = isoToDate(todayISO);
  if (!days.has(dayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (days.has(dayKey(cursor))) {
    current++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return {
    current,
    longest,
    totalActiveDays: days.size,
    lastActiveDay: sorted[sorted.length - 1],
  };
}

// ---- Total study time -------------------------------------------------------

/** Sum of minutes across all blocks under the given metric (default completed). */
export function totalMinutes(
  blocks: TimeBlock[],
  metric: MinuteMetric = "completed",
): number {
  let sum = 0;
  for (const b of blocks) sum += blockMinutes(b, metric);
  return sum;
}

// ---- Generic per-key aggregation -------------------------------------------

export type Bucket = { key: string; minutes: number };

/**
 * Group blocks by an arbitrary key function and sum minutes under `metric`.
 * Buckets are returned sorted by key ascending. Zero-minute contributions are
 * still bucketed (so e.g. a course with only uncompleted blocks shows up with 0
 * under the "completed" metric) — except keys with no blocks at all are absent.
 */
export function aggregateBy(
  blocks: TimeBlock[],
  keyOf: (b: TimeBlock) => string,
  metric: MinuteMetric = "completed",
): Bucket[] {
  const map = new Map<string, number>();
  for (const b of blocks) {
    const k = keyOf(b);
    map.set(k, (map.get(k) ?? 0) + blockMinutes(b, metric));
  }
  return [...map.entries()]
    .map(([key, minutes]) => ({ key, minutes }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// ---- Per-day ----------------------------------------------------------------

/**
 * Minutes per UTC calendar day, sorted oldest → newest. Days with no blocks are
 * omitted; use `minutesPerDayRange` for a gap-filled, fixed-window series.
 */
export function minutesPerDay(
  blocks: TimeBlock[],
  metric: MinuteMetric = "completed",
): Bucket[] {
  return aggregateBy(blocks, (b) => dayKey(b.date), metric);
}

/**
 * Gap-filled per-day series over an inclusive [fromISO, toISO] window, oldest →
 * newest. Every day in the range is present (0 when no activity), so the result
 * is chart-ready. Throws nothing for an inverted range — it just returns [].
 */
export function minutesPerDayRange(
  blocks: TimeBlock[],
  fromISO: string,
  toISO: string,
  metric: MinuteMetric = "completed",
): Bucket[] {
  const start = isoToDate(fromISO).getTime();
  const end = isoToDate(toISO).getTime();
  if (end < start) return [];

  // One pass to tally, then fill the window so gaps render as zeros.
  const tally = new Map<string, number>();
  for (const b of blocks) {
    const k = dayKey(b.date);
    tally.set(k, (tally.get(k) ?? 0) + blockMinutes(b, metric));
  }

  const out: Bucket[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const k = dayKey(new Date(t));
    out.push({ key: k, minutes: tally.get(k) ?? 0 });
  }
  return out;
}

// ---- Per-week (ISO, Monday-based) ------------------------------------------

/**
 * The Monday (UTC) that starts the ISO week containing `d`, as a YYYY-MM-DD key.
 * Matches computeStats' Monday-based week math in stats.ts.
 */
export function weekStartKey(d: Date): string {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = day.getUTCDay(); // 0=Sun..6=Sat
  const monday = new Date(day.getTime() - ((dow + 6) % 7) * DAY_MS);
  return dayKey(monday);
}

/**
 * Minutes per ISO week, keyed by the week's Monday (YYYY-MM-DD), sorted oldest →
 * newest. Weeks with no blocks are omitted.
 */
export function minutesPerWeek(
  blocks: TimeBlock[],
  metric: MinuteMetric = "completed",
): Bucket[] {
  return aggregateBy(blocks, (b) => weekStartKey(b.date), metric);
}

// ---- Per-course -------------------------------------------------------------

/**
 * Minutes per courseId, sorted by courseId. For human-friendly output, callers
 * can join against course names; this stays name-agnostic so it's pure and
 * dependency-free.
 */
export function minutesPerCourse(
  blocks: TimeBlock[],
  metric: MinuteMetric = "completed",
): Bucket[] {
  return aggregateBy(blocks, (b) => b.courseId, metric);
}

// ---- Convenience bundle -----------------------------------------------------

export type StudyTimeSummary = {
  total: number;
  perDay: Bucket[];
  perWeek: Bucket[];
  perCourse: Bucket[];
  streak: StreakSummary;
};

/**
 * One-call bundle: total + per-day/week/course breakdowns + streak, all under a
 * single chosen `metric`. `todayISO` anchors the streak's "today". Note the
 * streak always uses "completed" activity (a day only counts once a block is
 * actually done) independent of the aggregation metric, since that's the
 * meaningful definition of a study streak.
 */
export function studyTimeSummary(
  blocks: TimeBlock[],
  todayISO: string,
  metric: MinuteMetric = "completed",
): StudyTimeSummary {
  return {
    total: totalMinutes(blocks, metric),
    perDay: minutesPerDay(blocks, metric),
    perWeek: minutesPerWeek(blocks, metric),
    perCourse: minutesPerCourse(blocks, metric),
    streak: streakSummary(blocks, todayISO, "completed"),
  };
}

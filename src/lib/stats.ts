// Analytics engine for the Insights page. Pure functions that take already-
// fetched StudyBlocks/Courses as input (DB queries live in the thin `gatherStats`
// wrapper below), so every metric is deterministic and unit-testable. Dates are
// handled in UTC and "today" is always passed in as a YYYY-MM-DD string.

import { daysUntil } from "./dates";
import { appleFor, type Apple } from "./apple";

const DAY_MS = 86_400_000;

// ---- Input shapes (mirror the prisma `select`s on the Insights page) --------

export type StatsBlock = {
  date: Date;
  minutes: number;
  completed: boolean;
  actualMinutes: number | null;
  kind: string; // "study" | "review"
  courseId: string;
};

export type StatsCourse = {
  id: string;
  name: string;
  grade: number | null;
  ects: number | null;
  examDate: Date;
  intense: boolean;
  topics: { done: boolean }[];
};

// ---- Small date helpers -----------------------------------------------------

/** UTC day key (YYYY-MM-DD) for a Date. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a YYYY-MM-DD string to its UTC midnight Date. */
function isoToDate(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

// ---- Streaks ----------------------------------------------------------------

/**
 * Current streak: consecutive days (ending today, or yesterday if today isn't
 * studied yet) that have ≥1 completed block. Matches the page's prior behaviour.
 */
export function currentStreak(completedDays: Set<string>, todayISO: string): number {
  let streak = 0;
  const cursor = isoToDate(todayISO);
  // If today isn't studied yet, count from yesterday so the streak isn't reset
  // mid-day; if neither today nor yesterday is active the streak is 0.
  if (!completedDays.has(dayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (completedDays.has(dayKey(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Longest run of consecutive active days anywhere in the history. */
export function longestStreak(completedDays: Set<string>): number {
  if (completedDays.size === 0) return 0;
  const days = [...completedDays].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = isoToDate(days[i - 1]).getTime();
    const cur = isoToDate(days[i]).getTime();
    if (cur - prev === DAY_MS) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }
  return longest;
}

// ---- Daily load series ------------------------------------------------------

export type DayLoad = { key: string; label: string; min: number };

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Completed study minutes per day for the last `days` days (oldest → today),
 * for a small activity chart.
 */
export function dailyLoadSeries(
  blocks: StatsBlock[],
  todayISO: string,
  days = 7,
): DayLoad[] {
  const today = isoToDate(todayISO);
  const series: DayLoad[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getTime() - (days - 1 - i) * DAY_MS);
    return { key: dayKey(d), label: DOW[d.getUTCDay()], min: 0 };
  });
  const byKey = new Map(series.map((x) => [x.key, x]));
  for (const b of blocks) {
    if (!b.completed) continue;
    const slot = byKey.get(dayKey(b.date));
    if (slot) slot.min += b.minutes;
  }
  return series;
}

// ---- Calibration ------------------------------------------------------------

/**
 * Planning-fallacy calibration: how the student's *logged* (Pomodoro) time
 * compares to the estimate. >1 = they take longer than planned, <1 = faster.
 * Returns 1 (neutral) until there are at least 3 logged sessions; clamped to a
 * sane range. Mirrors the scheduler's `calibrationFromHistory`.
 */
export function calibrationFactor(
  blocks: { minutes: number; actualMinutes: number | null }[],
): number {
  const logged = blocks.filter((b) => b.actualMinutes && b.actualMinutes > 0);
  if (logged.length < 3) return 1;
  const planned = logged.reduce((s, b) => s + b.minutes, 0);
  const actual = logged.reduce((s, b) => s + (b.actualMinutes ?? 0), 0);
  if (planned <= 0) return 1;
  return Math.min(2.5, Math.max(0.5, actual / planned));
}

// ---- Grades -----------------------------------------------------------------

/** LP (ECTS credit points) for a course; defaults to 6 when unknown. */
export function lpOf(c: { ects: number | null }): number {
  return c.ects ?? 6;
}

export type GradeSummary = {
  gradedCount: number;
  /** LP-weighted German Notenschnitt (1.0 best … 5.0), or null if none graded. */
  gpa: number | null;
  /** LP earned = LP of graded courses with a passing grade (≤ 4.0). */
  lpEarned: number;
};

export function gradeSummary(courses: StatsCourse[]): GradeSummary {
  const graded = courses.filter((c) => c.grade != null);
  const gradedLp = graded.reduce((s, c) => s + lpOf(c), 0);
  const gpa = gradedLp
    ? graded.reduce((s, c) => s + (c.grade as number) * lpOf(c), 0) / gradedLp
    : null;
  const lpEarned = graded
    .filter((c) => (c.grade as number) <= 4.0)
    .reduce((s, c) => s + lpOf(c), 0);
  return { gradedCount: graded.length, gpa, lpEarned };
}

// ---- Per-course stats -------------------------------------------------------

export type CourseStats = {
  id: string;
  name: string;
  grade: number | null;
  ects: number | null;
  examDate: Date;
  intense: boolean;
  topicsTotal: number;
  topicsDone: number;
  /** Topic completion %, 0–100. */
  progressPct: number;
  /** All planned study+review minutes for the course. */
  plannedMinutes: number;
  /** Planned minutes already checked off. */
  completedMinutes: number;
  /** Logged (Pomodoro) minutes. */
  actualMinutes: number;
  /** Uncompleted "study" minutes still on the plan. */
  remainingStudyMinutes: number;
  /** Whole days until the exam (negative if past). */
  daysToExam: number;
  /** Remaining study minutes spread over the days left — exam pressure. */
  pressurePerDay: number;
};

export function perCourseStats(
  courses: StatsCourse[],
  blocks: StatsBlock[],
  todayISO: string,
): CourseStats[] {
  // Pre-aggregate block tallies per course in one pass.
  type Tally = {
    planned: number;
    completed: number;
    actual: number;
    remainingStudy: number;
  };
  const tally = new Map<string, Tally>();
  const get = (id: string): Tally => {
    let t = tally.get(id);
    if (!t) {
      t = { planned: 0, completed: 0, actual: 0, remainingStudy: 0 };
      tally.set(id, t);
    }
    return t;
  };
  for (const b of blocks) {
    const t = get(b.courseId);
    t.planned += b.minutes;
    if (b.completed) t.completed += b.minutes;
    if (b.actualMinutes) t.actual += b.actualMinutes;
    if (!b.completed && b.kind === "study") t.remainingStudy += b.minutes;
  }

  return courses.map((c) => {
    const t = tally.get(c.id) ?? { planned: 0, completed: 0, actual: 0, remainingStudy: 0 };
    const topicsTotal = c.topics.length;
    const topicsDone = c.topics.filter((x) => x.done).length;
    const daysToExam = daysUntil(c.examDate, todayISO);
    const pressurePerDay =
      t.remainingStudy === 0 ? 0 : t.remainingStudy / Math.max(1, daysToExam);
    return {
      id: c.id,
      name: c.name,
      grade: c.grade,
      ects: c.ects,
      examDate: c.examDate,
      intense: c.intense,
      topicsTotal,
      topicsDone,
      progressPct: topicsTotal ? Math.round((topicsDone / topicsTotal) * 100) : 0,
      plannedMinutes: t.planned,
      completedMinutes: t.completed,
      actualMinutes: t.actual,
      remainingStudyMinutes: t.remainingStudy,
      daysToExam,
      pressurePerDay: Math.round(pressurePerDay),
    };
  });
}

// ---- "Needs attention" ------------------------------------------------------

export type AttentionItem = {
  id: string;
  name: string;
  topicsTotal: number;
  topicsDone: number;
  apple: Apple;
  days: number;
};

const APPLE_RANK: Record<string, number> = { High: 0, Medium: 1, "On track": 2 };

/**
 * Unfinished, not-yet-past courses sorted by urgency (apple priority, then exam
 * proximity). Uses `appleFor`, which reads wall-clock time — same as before.
 */
export function attentionList(
  perCourse: CourseStats[],
  todayISO: string,
  limit = 3,
): AttentionItem[] {
  return perCourse
    .map((c) => ({
      id: c.id,
      name: c.name,
      topicsTotal: c.topicsTotal,
      topicsDone: c.topicsDone,
      days: daysUntil(c.examDate, todayISO),
      apple: appleFor({
        examDate: c.examDate,
        intense: c.intense,
        remainingMinutes: c.remainingStudyMinutes,
      }),
    }))
    .filter((x) => x.topicsTotal === 0 || x.topicsDone < x.topicsTotal) // unfinished
    .filter((x) => x.days >= 0) // exam not past
    .sort(
      (a, b) =>
        (APPLE_RANK[a.apple.label] ?? 3) - (APPLE_RANK[b.apple.label] ?? 3) ||
        a.days - b.days,
    )
    .slice(0, limit);
}

// ---- Top-level aggregate ----------------------------------------------------

export type Stats = {
  hasData: boolean;
  // Headline metrics
  currentStreak: number;
  longestStreak: number;
  /** Total logged (Pomodoro) minutes across all blocks. */
  loggedMinutes: number;
  /** Total planned study+review minutes. */
  totalPlannedMinutes: number;
  /** Planned minutes already checked off. */
  totalCompletedMinutes: number;
  // This week (Monday-based, UTC)
  weekPlanned: number;
  weekDone: number;
  weekPct: number;
  // "Done when due" — scheduled on/before today
  dueTotal: number;
  dueDone: number;
  duePct: number;
  /** Overall completion rate (alias of duePct, as a fraction 0–1). */
  completionRate: number;
  // Activity / consistency
  dailyLoad: DayLoad[];
  consistency: number; // % of last 14 days active
  activeDays: number; // active days within the last 14
  // Forward-looking
  upcomingWorkload: number; // uncompleted study/review minutes in next 7 days
  calibration: number;
  completedModules: number;
  // Grades
  grades: GradeSummary;
  // Per-course + attention
  courses: CourseStats[];
  attention: AttentionItem[];
};

/**
 * Compute the full analytics bundle from already-fetched data. Pure: same input
 * + same `todayISO` always yields the same output (except `attention`'s apple
 * labels, which read wall-clock time via `appleFor`).
 */
export function computeStats(
  blocks: StatsBlock[],
  courses: StatsCourse[],
  todayISO: string,
): Stats {
  const today = isoToDate(todayISO);
  const dow = today.getUTCDay(); // 0=Sun..6=Sat
  const weekStart = new Date(today.getTime() - ((dow + 6) % 7) * DAY_MS); // Monday
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
  const weekAhead = new Date(today.getTime() + 7 * DAY_MS);

  let weekPlanned = 0;
  let weekDone = 0;
  let dueTotal = 0;
  let dueDone = 0;
  let loggedMinutes = 0;
  let totalPlannedMinutes = 0;
  let totalCompletedMinutes = 0;
  let upcomingWorkload = 0;
  const completedDays = new Set<string>();

  for (const b of blocks) {
    totalPlannedMinutes += b.minutes;
    if (b.completed) totalCompletedMinutes += b.minutes;
    if (b.actualMinutes) loggedMinutes += b.actualMinutes;
    if (b.date >= weekStart && b.date < weekEnd) {
      weekPlanned += b.minutes;
      if (b.completed) weekDone += b.minutes;
    }
    if (b.date <= today) {
      dueTotal += b.minutes;
      if (b.completed) dueDone += b.minutes;
    }
    if (!b.completed && b.date >= today && b.date < weekAhead) {
      upcomingWorkload += b.minutes;
    }
    if (b.completed) completedDays.add(dayKey(b.date));
  }

  // Consistency — share of the last 14 days with ≥1 completed block.
  let activeDays = 0;
  for (let i = 0; i < 14; i++) {
    if (completedDays.has(dayKey(new Date(today.getTime() - i * DAY_MS)))) activeDays++;
  }

  const courseStats = perCourseStats(courses, blocks, todayISO);
  const weekPct = weekPlanned ? Math.round((weekDone / weekPlanned) * 100) : 0;
  const duePct = dueTotal ? Math.round((dueDone / dueTotal) * 100) : 0;

  return {
    hasData: blocks.length > 0,
    currentStreak: currentStreak(completedDays, todayISO),
    longestStreak: longestStreak(completedDays),
    loggedMinutes,
    totalPlannedMinutes,
    totalCompletedMinutes,
    weekPlanned,
    weekDone,
    weekPct,
    dueTotal,
    dueDone,
    duePct,
    completionRate: dueTotal ? dueDone / dueTotal : 0,
    dailyLoad: dailyLoadSeries(blocks, todayISO, 7),
    consistency: Math.round((activeDays / 14) * 100),
    activeDays,
    upcomingWorkload,
    calibration: calibrationFactor(blocks),
    completedModules: courses.filter(
      (c) => c.topics.length > 0 && c.topics.every((t) => t.done),
    ).length,
    grades: gradeSummary(courses),
    courses: courseStats,
    attention: attentionList(courseStats, todayISO),
  };
}

// ---- Thin DB wrapper --------------------------------------------------------

/** Fetch a user's blocks+courses and compute their analytics. */
export async function gatherStats(userId: string, todayISO: string): Promise<Stats> {
  // Imported lazily so the pure functions above stay importable in any context
  // (tests, edge) without pulling in Prisma.
  const { prisma } = await import("./db");
  const [blocks, courses] = await Promise.all([
    prisma.studyBlock.findMany({
      where: { course: { userId } },
      select: {
        date: true,
        minutes: true,
        completed: true,
        actualMinutes: true,
        kind: true,
        courseId: true,
      },
    }),
    prisma.course.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        grade: true,
        ects: true,
        examDate: true,
        intense: true,
        topics: { select: { done: true } },
      },
      orderBy: { examDate: "asc" },
    }),
  ]);
  return computeStats(blocks, courses, todayISO);
}

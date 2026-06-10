import { prisma } from "./db";

/**
 * Recovery assessment — the "you fell behind, that's fine" detector.
 *
 * Overdue work = study blocks scheduled before today that were never completed.
 * The global scheduler already knows how to absorb them (a rebuild re-pools the
 * unfinished effort and respreads it across the days before each exam); this
 * module only decides WHEN to proactively offer that rebuild, and gives the UI
 * honest numbers to show ("X sessions, ~Yh from past days").
 */
export type RecoveryAssessment = {
  /** Scheduled-but-never-completed sessions from days before `today`. */
  overdueSessions: number;
  /** Their total planned minutes. */
  overdueMinutes: number;
  /** How many distinct courses the overdue work belongs to. */
  courseCount: number;
};

/** Don't nag over a single skipped half-hour — recovery kicks in past these. */
export const RECOVERY_MIN_SESSIONS = 2;
export const RECOVERY_MIN_MINUTES = 60;

export async function assessRecovery(
  userId: string,
  todayIso: string,
): Promise<RecoveryAssessment> {
  const start = new Date(todayIso + "T00:00:00Z");
  const overdue = await prisma.studyBlock.findMany({
    where: { completed: false, date: { lt: start }, course: { userId } },
    select: { minutes: true, courseId: true },
  });
  return {
    overdueSessions: overdue.length,
    overdueMinutes: overdue.reduce((s, b) => s + b.minutes, 0),
    courseCount: new Set(overdue.map((b) => b.courseId)).size,
  };
}

/** Should /today proactively offer a one-tap plan rebuild? */
export function needsRecovery(a: RecoveryAssessment): boolean {
  return a.overdueSessions >= RECOVERY_MIN_SESSIONS || a.overdueMinutes >= RECOVERY_MIN_MINUTES;
}

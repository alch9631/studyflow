/**
 * Is this course PASSED — i.e. the student is done with it for good?
 *
 * Two ways to pass a German module:
 *   • a passing final grade (1.0 … 4.0; 5.0 is a fail and means a retake), or
 *   • "Modul bestanden (ohne Note)" — unbenotete Module are pass/fail with no
 *     numeric mark at all, recorded via the `passed` flag.
 *
 * One shared predicate so every consumer (scheduler, exam countdowns, stats,
 * course cards) agrees on what "passed" means. A failed attempt (grade 5.0,
 * passed=false) is intentionally NOT passed — the course keeps its plan and its
 * exam countdown, because a retake is coming.
 */

/** German passing threshold: 4.0 ("ausreichend") passes, anything above fails. */
export const PASSING_GRADE_MAX = 4.0;

export function coursePassed(course: {
  grade: number | null | undefined;
  passed: boolean | null | undefined;
}): boolean {
  if (course.passed === true) return true;
  const g = course.grade;
  return typeof g === "number" && Number.isFinite(g) && g <= PASSING_GRADE_MAX;
}

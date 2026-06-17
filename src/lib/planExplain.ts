/**
 * Explain-my-plan — pure, deterministic reasoning behind Today's plan.
 *
 * The planner (lib/planService) is fully deterministic: it paces each course to
 * its exam, processes NEARER exams first so they win contested minutes, and
 * weights work by topic effort. The Today queue then shows incomplete blocks in
 * plan order (study before review, longer first) split into capacity lanes.
 *
 * This module turns those SAME signals into honest, human reasons — never an LLM
 * guess and never fabricated exam content. Everything here is a pure function of
 * its inputs (no DB, no React, no clock), so the "Why this plan?" drawer says
 * exactly what the scheduler actually did, and it's unit-testable in isolation.
 */

/** A course represented by the signals that actually order the plan. */
export type ExplainCourse = {
  id: string;
  name: string;
  /** Whole days until this course's exam (negative = past — filtered by caller). */
  examDays: number;
  /** Remaining (incomplete) planned study minutes for this course today. */
  remainingMin: number;
};

/** The capacity picture for today (mirrors cockpit.Capacity's shape). */
export type ExplainCapacity = {
  /** Remaining (incomplete) planned study minutes across all courses today. */
  remainingMin: number;
  /** Realistic focus minutes left today (window minus lectures, discounted). */
  availableMin: number;
  /** remaining - available, floored at 0. */
  overMin: number;
  /** available - remaining, floored at 0. */
  freeMin: number;
  /** True once the remaining work fits the available focus time. */
  onTrack: boolean;
};

/** Why the day holds this much work — derived from capacity vs. remaining. */
export type CapacityReason =
  | { kind: "clear" } // nothing left to study today
  | { kind: "over"; remainingMin: number; availableMin: number; overMin: number }
  | { kind: "tight"; remainingMin: number; availableMin: number; freeMin: number }
  | { kind: "ontrack"; remainingMin: number; availableMin: number; freeMin: number };

/**
 * "Why this much today?" — a truthful read of the capacity math the cockpit
 * already computes (remaining planned work vs. realistic focus time left). No new
 * heuristics: this only NAMES what computeCapacity/riskVerdict already decided.
 */
export function explainCapacity(cap: ExplainCapacity): CapacityReason {
  if (cap.remainingMin <= 0) return { kind: "clear" };
  if (!cap.onTrack) {
    return {
      kind: "over",
      remainingMin: cap.remainingMin,
      availableMin: cap.availableMin,
      overMin: cap.overMin,
    };
  }
  // "Tight" mirrors riskVerdict: fits, but the leftover slack is small relative
  // to capacity (<= 20% of available is free).
  if (cap.availableMin > 0 && cap.freeMin <= cap.availableMin * 0.2) {
    return {
      kind: "tight",
      remainingMin: cap.remainingMin,
      availableMin: cap.availableMin,
      freeMin: cap.freeMin,
    };
  }
  return {
    kind: "ontrack",
    remainingMin: cap.remainingMin,
    availableMin: cap.availableMin,
    freeMin: cap.freeMin,
  };
}

/** Why course A is scheduled before course B — the deterministic tiebreak chain. */
export type OrderReason =
  | { kind: "sooner-exam"; before: string; after: string; beforeDays: number; afterDays: number }
  | { kind: "more-effort"; before: string; after: string; beforeMin: number; afterMin: number }
  | { kind: "tie"; before: string; after: string };

/**
 * Compare two courses by the SAME priority the scheduler uses, in order:
 *   1. Sooner exam wins (the scheduler processes nearer exams first).
 *   2. On an exam-date tie, the course with more remaining work today leads
 *      (heavier load surfaces higher in the queue).
 *   3. Otherwise it's a genuine tie (stable plan order decides).
 * Returns the reason A precedes B; the caller orders A,B so A is the earlier one.
 */
export function explainOrder(a: ExplainCourse, b: ExplainCourse): OrderReason {
  if (a.examDays !== b.examDays) {
    // The earlier exam is the reason — present whichever is sooner as "before".
    const [before, after] = a.examDays < b.examDays ? [a, b] : [b, a];
    return {
      kind: "sooner-exam",
      before: before.name,
      after: after.name,
      beforeDays: before.examDays,
      afterDays: after.examDays,
    };
  }
  if (a.remainingMin !== b.remainingMin) {
    const [before, after] = a.remainingMin > b.remainingMin ? [a, b] : [b, a];
    return {
      kind: "more-effort",
      before: before.name,
      after: after.name,
      beforeMin: before.remainingMin,
      afterMin: after.remainingMin,
    };
  }
  return { kind: "tie", before: a.name, after: b.name };
}

/**
 * The single most relevant ordering reason for the drawer: between the two
 * highest-priority courses with remaining work today, why does the leader lead?
 * Courses are sorted by the deterministic priority (sooner exam, then more work);
 * if fewer than two courses have remaining work, there's nothing to compare.
 */
export function topOrderReason(courses: ExplainCourse[]): OrderReason | null {
  const active = courses
    .filter((c) => c.remainingMin > 0 && Number.isFinite(c.examDays))
    .sort((x, y) => x.examDays - y.examDays || y.remainingMin - x.remainingMin);
  if (active.length < 2) return null;
  return explainOrder(active[0], active[1]);
}

/** The full explanation bundle the drawer renders. */
export type PlanExplanation = {
  capacity: CapacityReason;
  order: OrderReason | null;
};

/** Build the complete, deterministic explanation for Today's plan. */
export function explainPlan(
  cap: ExplainCapacity,
  courses: ExplainCourse[],
): PlanExplanation {
  return { capacity: explainCapacity(cap), order: topOrderReason(courses) };
}

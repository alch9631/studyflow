/**
 * Pure cockpit logic for the Today page — capacity/risk math and the study-queue
 * lane grouping. Kept dependency-free (no React, no DB, no wall clock) so it can
 * run on the server (page.tsx computes the lanes once) and be unit-reasoned about
 * in isolation. The page passes the already-computed lanes + risk down to the
 * client island, so the client never re-derives them.
 */

/** A serializable Today study block — the shape the cockpit UI consumes. */
export type CockpitBlock = {
  id: string;
  topicTitle: string;
  minutes: number;
  completed: boolean;
  kind: string;
  actualMinutes: number | null;
  course: { name: string; id: string };
};

/** The four study-queue lanes, answering "what now / what can wait". */
export type Lane = "now" | "next" | "later" | "slide";

/**
 * Conservative daily study ceiling, in minutes. A real student does NOT focus for
 * 60% of an 08:00–22:00 window; assuming they do manufactures phantom "must-do"
 * loads (the old model could surface 11 essentials). The realistic ceiling for
 * today is the SMALLER of the window math and this baseline budget, so today is
 * never asked to hold more than one sane sitting's worth of focused study.
 */
export const DAILY_STUDY_BUDGET_MIN = 120;

/** At most this many must-do sessions show directly; the rest are protected. */
export const MAX_VISIBLE_ESSENTIALS = 4;

/**
 * The realistic study ceiling for today: the smaller of the window-derived focus
 * time and the conservative {@link DAILY_STUDY_BUDGET_MIN} baseline. This is the
 * denominator for "does today fit", deliberately conservative so the system errs
 * toward protecting the student rather than overloading them.
 */
export function studyBudget(windowAvailableMin: number): number {
  return Math.min(Math.max(0, windowAvailableMin), DAILY_STUDY_BUDGET_MIN);
}

/** "1h 20m" / "45m" / "0m" — shared duration formatter (no i18n; numbers only). */
export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

/**
 * Today's capacity picture, computed from the planned study minutes vs. the
 * realistic focus time left in the study window (after the day's lectures). This
 * is the input to the one-line risk verdict.
 */
export type Capacity = {
  /** Remaining (incomplete) planned study minutes today. */
  remainingMin: number;
  /** Realistic focus minutes left today (window minus lectures, focus-discounted). */
  availableMin: number;
  /** remaining - available, floored at 0 (how much we're over). */
  overMin: number;
  /** available - remaining, floored at 0 (slack/free time). */
  freeMin: number;
  /** True once remaining work fits in the available focus time. */
  onTrack: boolean;
};

/**
 * Compute today's capacity. `availableMin` is the window's realistic focus time
 * left (the page derives it from prefs' study window, the day's lectures, and a
 * focus ratio, the same spirit as the old header math). Everything here is pure
 * arithmetic so the verdict is deterministic given its inputs.
 */
export function computeCapacity(remainingMin: number, availableMin: number): Capacity {
  const rem = Math.max(0, remainingMin);
  const avail = Math.max(0, availableMin);
  const overMin = Math.max(0, rem - avail);
  const freeMin = Math.max(0, avail - rem);
  return { remainingMin: rem, availableMin: avail, overMin, freeMin, onTrack: rem <= avail };
}

/**
 * Risk verdict variant for the calm one-line risk line. Mapped to copy in the UI:
 *   - "over"     → "You're {time} over capacity today"
 *   - "tight"    → fits, but little slack (<= 20% of available free)
 *   - "ontrack"  → comfortable free time
 *   - "clear"    → nothing left to study today
 */
export type RiskVerdict = "over" | "tight" | "ontrack" | "clear";

export function riskVerdict(cap: Capacity): RiskVerdict {
  if (cap.remainingMin === 0) return "clear";
  if (!cap.onTrack) return "over";
  // "Tight" when it fits but the leftover slack is small relative to capacity.
  if (cap.availableMin > 0 && cap.freeMin <= cap.availableMin * 0.2) return "tight";
  return "ontrack";
}

/**
 * The three truthful Today states — never false calm. Exactly one is shown:
 *
 *   - "protected"   — the system reduced today to a viable load (remaining must-do
 *                     study fits the budget). Calm: "You're set for today."
 *   - "needs_choice"— more must-do study than the budget allows. Honest nudge to
 *                     the single recovery entry: "Today is heavier than one
 *                     sitting. Want me to make it lighter?"
 *   - "doesnt_fit"  — even a minimal day can't make the nearest exam (not enough
 *                     days left for the work that must happen before it). Honest,
 *                     calm, with the real next step.
 *
 * "doesnt_fit" dominates: a missable exam is the gravest truth, so it is reported
 * even when today itself would otherwise look protected.
 */
export type CockpitStatus = "protected" | "needs_choice" | "doesnt_fit";

/**
 * Feasibility input for the nearest upcoming exam: how many days are left before
 * it, and the total still-incomplete study minutes (today + future) that must
 * land before it. Past/overdue work is surfaced separately (recovery), never here.
 */
export type ExamFeasibility = {
  /** Whole days until the nearest exam (0 = exam is today). Omit if no exam. */
  daysUntil: number;
  /** Total remaining study minutes that must happen before that exam. */
  remainingMin: number;
};

/**
 * Decide the single honest Today status from the capacity verdict and (optionally)
 * the nearest exam's feasibility. Pure: same inputs → same state.
 *
 *   - If a minimal-but-realistic day (the study budget per remaining day) still
 *     can't clear the exam's remaining work in time → "doesnt_fit".
 *   - Else if today's remaining must-do study exceeds the budget → "needs_choice".
 *   - Else → "protected".
 *
 * `mustDoMin` is the minutes the day genuinely needs (must-do study only, NOT
 * reviews/overdue); `budgetMin` is {@link studyBudget}. We compare against the
 * budget, not the raw window, so the verdict matches the conservative model.
 */
export function cockpitStatus(
  mustDoMin: number,
  budgetMin: number,
  exam?: ExamFeasibility,
): CockpitStatus {
  if (exam && budgetMin > 0) {
    // Days available to study before the exam: today plus each remaining day.
    // (Exam today → only today.) Conservatively assume the budget is the most
    // that can be done per day; if even that can't clear it, the exam can't be made.
    const studyDays = Math.max(1, exam.daysUntil + 1);
    const reachableMin = studyDays * budgetMin;
    if (exam.remainingMin > reachableMin) return "doesnt_fit";
  }
  if (mustDoMin > budgetMin) return "needs_choice";
  return "protected";
}

/**
 * Split today's INCOMPLETE blocks into the four queue lanes.
 *
 * `blocks` arrives already in the page's plan order (study before review, longest
 * first). We honour that order so "Now" is genuinely the top of the plan.
 *
 *   - Can-slide: review-kind blocks always; PLUS, when over capacity, the lowest-
 *     priority study blocks (the shortest ones at the tail of the plan) until the
 *     remaining non-slide work fits the available focus time. This is the literal
 *     "what can wait" answer — push these to tomorrow first.
 *   - Of the work that must happen today: the first is "Now", the next is "Next",
 *     the rest are "Later".
 *
 * Completed blocks are excluded from lanes entirely (they're history, shown
 * collapsed elsewhere). Returns a per-block lane map keyed by id.
 */
export function assignLanes(
  blocks: CockpitBlock[],
  cap: Capacity,
): Map<string, Lane> {
  const lanes = new Map<string, Lane>();
  const open = blocks.filter((b) => !b.completed);

  // 1) Reviews always slide first (lowest priority — the "what can wait" answer).
  const reviews = open.filter((b) => b.kind === "review");
  const study = open.filter((b) => b.kind !== "review");
  for (const r of reviews) lanes.set(r.id, "slide");

  // 2) If still over capacity after sliding reviews, slide the lowest-priority
  //    study blocks too — shortest first, from the tail of the plan order — until
  //    the remaining must-do study fits the available focus time.
  let mustDo = [...study];
  if (cap.overMin > 0) {
    // Tail of plan order = lowest priority; shortest-first among equals so we shed
    // the least valuable minutes. Stable: keep plan order as the tiebreaker.
    const byLowestPriority = study
      .map((b, i) => ({ b, i }))
      .sort((a, z) => a.b.minutes - z.b.minutes || z.i - a.i);
    let studyMin = study.reduce((s, b) => s + b.minutes, 0);
    const slid = new Set<string>();
    for (const { b } of byLowestPriority) {
      if (studyMin <= cap.availableMin) break;
      slid.add(b.id);
      lanes.set(b.id, "slide");
      studyMin -= b.minutes;
    }
    mustDo = study.filter((b) => !slid.has(b.id));
  }

  // 3) The work that must happen today → Now / Next / Later by plan order.
  mustDo.forEach((b, i) => {
    lanes.set(b.id, i === 0 ? "now" : i === 1 ? "next" : "later");
  });

  return lanes;
}

/** The first "now"/"next"/"later" (must-do) block — the hero's next action. */
export function pickHero(
  blocks: CockpitBlock[],
  lanes: Map<string, Lane>,
): CockpitBlock | null {
  for (const lane of ["now", "next", "later"] as const) {
    const hit = blocks.find((b) => !b.completed && lanes.get(b.id) === lane);
    if (hit) return hit;
  }
  // Everything left is slide-able → still offer the first slide block as hero so
  // the user always has a "start something" affordance.
  const slide = blocks.find((b) => !b.completed && lanes.get(b.id) === "slide");
  return slide ?? null;
}

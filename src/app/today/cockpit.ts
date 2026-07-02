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

/**
 * Whether the nearest exam can still be fully made after an action runs. Honest:
 *   - "possible"  — the remaining work that lands before the exam still fits a
 *                   budget-paced run-up to it.
 *   - "atRisk"    — it fits, but only by using nearly every budget minute left
 *                   (little slack — true but tight).
 *   - "notFully"  — even a budget-paced run-up can't clear the work in time.
 *   - "none"      — there is no upcoming exam to reason about.
 */
export type ExamReach = "possible" | "atRisk" | "notFully" | "none";

/**
 * Classify exam reachability from the work that must land before it and the days
 * left. `budgetMin` is the conservative {@link studyBudget}. Pure arithmetic so
 * the preview's honesty is unit-testable. Mirrors {@link cockpitStatus}'s
 * "doesnt_fit" maths (studyDays = today + each remaining day, paced at the budget).
 */
export function examReach(
  exam: ExamFeasibility | undefined,
  budgetMin: number,
): ExamReach {
  if (!exam || budgetMin <= 0) return "none";
  const studyDays = Math.max(1, exam.daysUntil + 1);
  const reachableMin = studyDays * budgetMin;
  if (exam.remainingMin > reachableMin) return "notFully";
  // Fits, but flag honestly when it leans on almost all the run-up's capacity.
  if (exam.remainingMin > reachableMin * 0.85) return "atRisk";
  return "possible";
}

/**
 * A before→after preview of ONE recovery action, computed from real planner data
 * WITHOUT committing it. Each action only re-dates today's open blocks (or, for
 * the respread, paces everything to each exam), so the preview simulates that
 * shift and reports the honest resulting shape of today + whether the nearest
 * exam is still reachable afterwards.
 */
export type RecoveryActionPreview = {
  /** Open sessions on today BEFORE the action. */
  beforeCount: number;
  /** Essential (first-pass study) sessions left on today AFTER the action. */
  afterEssentials: number;
  /** How many of today's sessions this action moves off today. */
  moved: number;
  /** New realistic pace for what remains today, in minutes (0 if it clears today). */
  afterPaceMin: number;
  /** Honest exam reachability after the action runs. */
  examReach: ExamReach;
};

/**
 * Whether a block may legally move to tomorrow. Mirrors the real action's
 * exam-eve clamp (today/actions.ts shiftBlocksToTomorrow): work never lands on
 * or past its course's exam day, so a block moves only while tomorrow is still
 * STRICTLY before the exam. Both timestamps are UTC midnights, so a plain
 * millisecond compare is exact. A block with no exam context can always move.
 */
export function canMoveBlockToTomorrow(
  blockDateMs: number,
  examDateMs: number | null | undefined,
): boolean {
  if (examDateMs == null) return true;
  return blockDateMs + 86400_000 < examDateMs;
}

/**
 * Inputs the preview needs, all derived from real planner reads (no wall clock,
 * no DB here — the server wrapper fetches these and calls this pure function).
 */
export type RecoveryPreviewInput = {
  /** Today's open study (first-pass) minutes. */
  todayStudyMin: number;
  /** Today's open review minutes. */
  todayReviewMin: number;
  /** Count of today's open study sessions. */
  todayStudyCount: number;
  /** Count of today's open review sessions. */
  todayReviewCount: number;
  /**
   * Count of today's open study sessions that can LEGALLY move to tomorrow
   * (see {@link canMoveBlockToTomorrow} — the real action skips blocks whose
   * next day would land on/past the exam). Defaults to todayStudyCount so
   * callers without exam context keep the old optimistic behaviour.
   */
  movableStudyCount?: number;
  /** Same as {@link RecoveryPreviewInput.movableStudyCount}, for reviews. */
  movableReviewCount?: number;
  /** Minutes of today's open sessions that CANNOT move (they stay on today). */
  immovableMin?: number;
  /** The conservative daily study budget (studyBudget(window)). */
  budgetMin: number;
  /** Nearest exam feasibility (work due before it + days left), if any. */
  exam?: ExamFeasibility;
};

/**
 * Simulate all three recovery actions and return an honest before→after for each:
 *
 *   - protect → moves only today's reviews to tomorrow (essentials stay).
 *   - move    → moves ALL of today's open sessions to tomorrow (today clears).
 *   - lighter → respreads everything across the days before each exam, so today
 *               drops to the budget-paced share and the exam is recomputed as if
 *               the work were evenly spread (the best case the planner can offer).
 *
 * Exam reachability: protect/move only shift TODAY's load by a day, which doesn't
 * change the total work that must land before the exam — so the exam verdict is
 * the same as the current one. The respread is the only action that can change
 * feasibility, and even then it can only make the exam if the work fundamentally
 * fits; if it can't, we say so (never false hope).
 */
export function recoveryActionPreviews(input: RecoveryPreviewInput): {
  protect: RecoveryActionPreview;
  move: RecoveryActionPreview;
  lighter: RecoveryActionPreview;
} {
  const beforeCount = input.todayStudyCount + input.todayReviewCount;
  const baseReach = examReach(input.exam, input.budgetMin);
  // Only blocks the real action can legally move count as "moved" — the action
  // skips anything whose next day would land on/past its course's exam day, so
  // the preview must never promise moves the commit won't deliver.
  const movableStudy = input.movableStudyCount ?? input.todayStudyCount;
  const movableReview = input.movableReviewCount ?? input.todayReviewCount;
  const immovableMin = input.immovableMin ?? 0;

  // Protect: keep essentials, move only the reviews that can legally move.
  // (An exam-pinned review stays on today; the pace line keeps its honest
  // study-minutes floor either way.)
  const protectPaceMin = Math.min(input.todayStudyMin, input.budgetMin);
  const protect: RecoveryActionPreview = {
    beforeCount,
    afterEssentials: input.todayStudyCount,
    moved: movableReview,
    afterPaceMin: protectPaceMin,
    examReach: baseReach,
  };

  // Move: everything MOVABLE goes to tomorrow; exam-pinned blocks stay on today
  // (the action's clamp), so today only clears when nothing is pinned.
  const move: RecoveryActionPreview = {
    beforeCount,
    afterEssentials: input.todayStudyCount - movableStudy,
    moved: movableStudy + movableReview,
    afterPaceMin: Math.min(immovableMin, input.budgetMin),
    examReach: baseReach,
  };

  // Lighter plan: respread paces today down to (at most) the budget share. The
  // exam reachability is the honest best case — examReach already encodes whether
  // a budget-paced run-up can clear the work; the respread achieves exactly that.
  const lighterPaceMin = Math.min(
    input.todayStudyMin + input.todayReviewMin,
    input.budgetMin,
  );
  const lighter: RecoveryActionPreview = {
    beforeCount,
    afterEssentials: input.todayStudyCount,
    moved: Math.max(0, beforeCount - input.todayStudyCount),
    afterPaceMin: lighterPaceMin,
    examReach: baseReach,
  };

  return { protect, move, lighter };
}

/**
 * A credible smallest-useful day, assembled from the user's REAL open blocks (it
 * never invents work). When today is "Needs a choice" or "Doesn't fit", an anxiety
 * list of everything is the wrong answer; this is the decisive, calm alternative:
 * the one move that still pushes you forward.
 *
 *   - core      — the single highest-priority unfinished STUDY block for the
 *                 nearest exam (or, lacking exam context, the top of the plan).
 *   - retrieval — one review/retrieval block (spaced recall), if any exists.
 *   - optional  — one more block the student MAY do if they have energy, drawn
 *                 from the remaining study (next in plan order), never duplicated.
 *
 * Every slot is optional in the sense that the day adapts to what really exists:
 * a plan with no reviews simply has no retrieval slot. We pick from `blocks` in
 * the plan order the page already established (study before review, longest
 * first), so "core" is genuinely the most important sitting.
 */
export type MinimumViableDay = {
  core: CockpitBlock | null;
  retrieval: CockpitBlock | null;
  optional: CockpitBlock | null;
  /** Total minutes of the selected slots — the honest size of the smallest day. */
  totalMin: number;
  /** The selected blocks in order (core, retrieval, optional), nulls dropped. */
  blocks: CockpitBlock[];
};

/**
 * Build the {@link MinimumViableDay} from today's incomplete blocks.
 *
 * `nearestExamCourseId`, when given, biases "core" toward the course whose exam
 * is soonest: the highest-priority open study block FOR THAT COURSE leads. If no
 * block matches (or no exam context), we fall back to the top study block in plan
 * order — still real, never fabricated. Pure: same inputs → same day.
 */
export function minimumViableDay(
  blocks: CockpitBlock[],
  nearestExamCourseId?: string | null,
): MinimumViableDay {
  const open = blocks.filter((b) => !b.completed);
  const study = open.filter((b) => b.kind !== "review");
  const reviews = open.filter((b) => b.kind === "review");

  // Core: the highest-priority open study block. Prefer the nearest exam's course
  // (the work that matters most right now); else the top of the plan order, which
  // already leads with the longest first-pass study session.
  const core =
    (nearestExamCourseId
      ? study.find((b) => b.course.id === nearestExamCourseId)
      : undefined) ??
    study[0] ??
    null;

  // Retrieval: one review/retrieval block (spaced recall), if the plan has any.
  const retrieval = reviews[0] ?? null;

  // Optional: one more study block beyond the core (next in plan order), so the
  // student can do a little extra if they have the energy. Never the core again.
  const optional = study.find((b) => b.id !== core?.id) ?? null;

  const picked = [core, retrieval, optional].filter(
    (b): b is CockpitBlock => b != null,
  );
  const totalMin = picked.reduce((s, b) => s + b.minutes, 0);
  return { core, retrieval, optional, totalMin, blocks: picked };
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

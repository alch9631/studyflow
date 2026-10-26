/**
 * Pure cockpit logic for the Today page — capacity/risk math and the study-queue
 * lane grouping. Kept dependency-free (no React, no DB, no wall clock) so it can
 * run on the server (page.tsx computes the lanes once) and be unit-reasoned about
 * in isolation. The page passes the already-computed lanes + risk down to the
 * client island, so the client never re-derives them.
 */

import type { StudyTask, StudyProgress } from "@/lib/studyTask";

/** A serializable Today study block — the shape the cockpit UI consumes. */
export type CockpitBlock = {
  id: string;
  topicTitle: string;
  minutes: number;
  completed: boolean;
  kind: string;
  actualMinutes: number | null;
  course: { name: string; id: string };
  /** The owning topic's existing note body, if any. The quick-note editor MUST
   *  open pre-filled with it — saving from an empty box overwrites Note.body,
   *  which used to silently destroy the student's course-page note. */
  note?: string | null;
  topicId?: string;
  task?: StudyTask | null;
  progress?: StudyProgress | null;
  examDays?: number;
  confidence?: string | null;
  topicOrder?: number;
  overdueDays?: number;
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
export function studyBudget(windowAvailableMin: number, dailyBudgetMin = DAILY_STUDY_BUDGET_MIN): number {
  return Math.min(Math.max(0, windowAvailableMin), Math.max(0, dailyBudgetMin));
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

/** Today fits, Today needs adjusting, or the full scheduler reports exam overload. */
export type CockpitStatus = "protected" | "needs_choice" | "doesnt_fit";

/** The nearest exam's result from the shared, full-runway scheduler. */
export type ExamFeasibility = { isOverloaded: boolean };

/** Today's comfort budget and the exam's feasibility are separate decisions. */
export function cockpitStatus(
  mustDoMin: number,
  budgetMin: number,
  exam?: ExamFeasibility,
): CockpitStatus {
  if (exam?.isOverloaded) return "doesnt_fit";
  if (mustDoMin > budgetMin) return "needs_choice";
  return "protected";
}

/** Fit the highest-value open sessions into today's capacity; keep overflow visible. */
export function assignLanes(
  blocks: CockpitBlock[],
  cap: Capacity,
): Map<string, Lane> {
  const lanes = new Map<string, Lane>();
  const open = prioritizeBlocks(blocks.filter((b) => !b.completed));
  let used = 0;
  let essential = 0;
  for (const block of open) {
    if (used + block.minutes <= cap.availableMin) {
      lanes.set(block.id, essential === 0 ? "now" : essential === 1 ? "next" : "later");
      essential++;
      used += block.minutes;
    } else lanes.set(block.id, "slide");
  }
  return lanes;
}

/** Explainable task ordering; duration is never a proxy for learning value. */
export function priorityReason(block: CockpitBlock): "resume" | "weakReview" | "exam" | "review" | "foundation" {
  if (block.progress) return "resume";
  if (block.kind === "review" && block.confidence === "struggling") return "weakReview";
  if ((block.examDays ?? Infinity) <= 7) return "exam";
  return block.kind === "review" ? "review" : "foundation";
}

export function prioritizeBlocks(blocks: CockpitBlock[]): CockpitBlock[] {
  const score = (b: CockpitBlock) => {
    const days = Math.max(0, b.examDays ?? 365);
    return (days <= 3 ? 100 : days <= 7 ? 65 : days <= 14 ? 30 : 0)
      + (b.kind === "review" ? 35 : 0)
      + (b.confidence === "struggling" ? 40 : b.confidence === "practice" ? 15 : 0)
      + Math.min(30, (b.overdueDays ?? 0) * 10);
  };
  return blocks.map((block, index) => ({ block, index })).sort((a, b) =>
    score(b.block) - score(a.block) || (a.block.topicOrder ?? a.index) - (b.block.topicOrder ?? b.index) || a.index - b.index,
  ).map(({ block }) => block);
}

export function todayStatusKey(status: CockpitStatus, allDone: boolean) {
  if (status === "doesnt_fit") return "today.statusDoesntFit" as const;
  if (status === "needs_choice") return "today.statusNeedsChoice" as const;
  return allDone ? "today.calmAllDone" as const : "today.statusProtected" as const;
}

export type ExamReach = "possible" | "notFully" | "none";

/** Use the real scheduler, never extrapolate today's shrinking time to every day. */
export function examReach(exam: ExamFeasibility | undefined): ExamReach {
  if (!exam) return "none";
  return exam.isOverloaded ? "notFully" : "possible";
}

export type RecoveryActionPreview = {
  beforeCount: number;
  afterCount: number;
  moved: number;
  /** Exact unfinished minutes left today, including pinned reviews. */
  afterPaceMin: number;
  examReach: ExamReach;
  days?: { date: string; minutes: number; capacity: number }[];
};

export function canDeferReview(block: Pick<CockpitBlock, "kind" | "confidence" | "examDays">): boolean {
  return block.kind === "review" && block.confidence !== "struggling" && (block.examDays ?? Infinity) > 3;
}

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

/** Actual row totals for shifts and the read-only shared scheduler's proposal. */
export type RecoveryPreviewInput = {
  todayStudyMin: number;
  todayReviewMin: number;
  todayStudyCount: number;
  todayReviewCount: number;
  movableStudyCount: number;
  allMovableReviewCount?: number;
  movableReviewCount: number;
  movableReviewMin: number;
  immovableMin: number;
  rebuilt: { count: number; minutes: number };
  exam?: ExamFeasibility;
};

export function recoveryActionPreviews(input: RecoveryPreviewInput): {
  protect: RecoveryActionPreview;
  move: RecoveryActionPreview;
  lighter: RecoveryActionPreview;
} {
  const beforeCount = input.todayStudyCount + input.todayReviewCount;
  const moved = input.movableStudyCount + (input.allMovableReviewCount ?? input.movableReviewCount);
  return {
    protect: {
      beforeCount,
      afterCount: beforeCount - input.movableReviewCount,
      moved: input.movableReviewCount,
      afterPaceMin: input.todayStudyMin + input.todayReviewMin - input.movableReviewMin,
      // A date shift is not a simulation of the whole future plan.
      examReach: "none",
    },
    move: {
      beforeCount,
      afterCount: beforeCount - moved,
      moved,
      afterPaceMin: input.immovableMin,
      examReach: "none",
    },
    lighter: {
      beforeCount,
      afterCount: input.rebuilt.count,
      moved: 0,
      afterPaceMin: input.rebuilt.minutes,
      examReach: examReach(input.exam),
    },
  };
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
  const resumable = blocks.filter((b) => !b.completed && b.progress).sort((a, b) => b.progress!.updatedAt.localeCompare(a.progress!.updatedAt))[0];
  if (resumable) return resumable;
  for (const lane of ["now", "next", "later"] as const) {
    const hit = blocks.find((b) => !b.completed && lanes.get(b.id) === lane);
    if (hit) return hit;
  }
  // Everything left is slide-able → still offer the first slide block as hero so
  // the user always has a "start something" affordance.
  const slide = blocks.find((b) => !b.completed && lanes.get(b.id) === "slide");
  return slide ?? null;
}

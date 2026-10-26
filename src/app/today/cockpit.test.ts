/**
 * Pure-logic tests for the Today cockpit's "make every state true" math:
 *   - the conservative capacity model (studyBudget caps the window optimism),
 *   - the three truthful states (cockpitStatus: protected / needs_choice /
 *     doesnt_fit) and exactly when each shows,
 *   - and that lane assignment sheds work down to the conservative budget.
 *
 * No DB, no React, no wall clock — everything here is deterministic given its
 * inputs, so we can assert the verdicts directly.
 * Run: npx tsx src/app/today/cockpit.test.ts
 */
import {
  assignLanes,
  canMoveBlockToTomorrow,
  cockpitStatus,
  computeCapacity,
  DAILY_STUDY_BUDGET_MIN,
  examReach,
  minimumViableDay,
  recoveryActionPreviews,
  studyBudget,
  type CockpitBlock,
} from "./cockpit";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

function study(id: string, minutes: number): CockpitBlock {
  return {
    id,
    topicTitle: id,
    minutes,
    completed: false,
    kind: "study",
    actualMinutes: null,
    course: { name: "C", id: "c" },
  };
}
function review(id: string, minutes: number): CockpitBlock {
  return { ...study(id, minutes), kind: "review" };
}

// ── Conservative capacity model ──────────────────────────────────────────────
// studyBudget = min(window math, fixed 120 baseline). It must clamp an
// optimistic window down to the budget, and never go negative.
check("budget caps an optimistic window at the 120 baseline", studyBudget(500) === DAILY_STUDY_BUDGET_MIN);
check("budget defers to a small window when the window is the tighter ceiling", studyBudget(45) === 45);
check("budget floors at 0 for a negative window", studyBudget(-30) === 0);
check("baseline constant is 120", DAILY_STUDY_BUDGET_MIN === 120);

// With a conservative 120 budget, a pile of small study blocks no longer
// manufactures a wall of must-do: capacity is over and lanes shed the excess.
const heavyDay = Array.from({ length: 11 }, (_, i) => study(`s${i}`, 30)); // 330 min
const heavyCap = computeCapacity(330, studyBudget(800));
check("heavy day is over the conservative budget (not magically on track)", heavyCap.onTrack === false);
check("over-amount is measured against the 120 budget", heavyCap.overMin === 330 - 120);

// Lanes must shed study until the remaining must-do fits the 120 budget.
const heavyLanes = assignLanes(heavyDay, heavyCap);
const heavyMustDo = heavyDay.filter((b) => heavyLanes.get(b.id) !== "slide");
const heavyMustDoMin = heavyMustDo.reduce((s, b) => s + b.minutes, 0);
check("lanes shed work down to within the budget", heavyMustDoMin <= 120);
check("the old optimistic model would have shown all 11 — now it does not", heavyMustDo.length < 11);

// ── Three truthful states ────────────────────────────────────────────────────
const budget = DAILY_STUDY_BUDGET_MIN; // 120

// Protected: must-do study fits the budget and the exam is reachable.
check(
  "protected when must-do fits the budget and the exam is reachable",
  cockpitStatus(90, budget, { isOverloaded: false }) === "protected",
);
check("protected with no exam ahead when must-do fits", cockpitStatus(90, budget) === "protected");

// Needs a choice: more must-do study than the budget allows (but exam reachable).
check(
  "needs_choice when must-do study exceeds the budget",
  cockpitStatus(180, budget, { isOverloaded: false }) === "needs_choice",
);
check("needs_choice with no exam when must-do exceeds budget", cockpitStatus(200, budget) === "needs_choice");

// Doesn't fit: even a budget-paced run-up can't clear the exam's remaining work.
// The scheduler has already checked the full runway and flagged overload.
check(
  "doesnt_fit when the full scheduler reports exam overload",
  cockpitStatus(60, budget, { isOverloaded: true }) === "doesnt_fit",
);
check(
  "doesnt_fit dominates even when today alone would look protected",
  cockpitStatus(30, budget, { isOverloaded: true }) === "doesnt_fit",
);
// A feasible exam must not override a fitting Today load.
check(
  "a feasible exam does not override a fitting Today load",
  cockpitStatus(60, budget, { isOverloaded: false }) === "protected",
);

// Honest, never false-calm: a heavy day with a near exam is never "protected".
const verdict = cockpitStatus(180, budget, { isOverloaded: true });
check("a heavy day with an unreachable exam is never protected", verdict !== "protected");

// ── Reviews still slide first (capacity unchanged on that front) ──────────────
const withReviews = [study("a", 100), review("r", 60)];
const rCap = computeCapacity(160, studyBudget(160));
const rLanes = assignLanes(withReviews, rCap);
check("review slides before study", rLanes.get("r") === "slide");
check("the fitting study stays must-do", rLanes.get("a") !== "slide");

// ── Minimum Viable Day ───────────────────────────────────────────────────────
// The smallest-useful day is assembled from REAL blocks: one core study, one
// retrieval/review, one optional study. Never invents work.
function inCourse(b: CockpitBlock, courseId: string): CockpitBlock {
  return { ...b, course: { name: courseId, id: courseId } };
}

// A heavy day with study + reviews → core is the top study, retrieval is a review,
// optional is the next study; total is the sum of just those three.
const mvdBlocks = [study("s1", 45), study("s2", 30), study("s3", 25), review("r1", 20), review("r2", 15)];
const mvd = minimumViableDay(mvdBlocks);
check("MVD core is the highest-priority (plan-order top) study block", mvd.core?.id === "s1");
check("MVD retrieval is a review block", mvd.retrieval?.id === "r1" && mvd.retrieval?.kind === "review");
check("MVD optional is the next study block, never the core", mvd.optional?.id === "s2");
check("MVD total is just the three selected slots", mvd.totalMin === 45 + 20 + 30);
check("MVD selects exactly 3 real blocks here", mvd.blocks.length === 3);
check("MVD never invents work — every picked block is from the input", mvd.blocks.every((b) => mvdBlocks.includes(b)));

// Exam bias: core prefers the nearest exam's course when one is given.
const examBlocks = [
  inCourse(study("a", 45), "algo"),
  inCourse(study("o", 30), "os"),
  inCourse(study("o2", 25), "os"),
];
const mvdExam = minimumViableDay(examBlocks, "os");
check("MVD core prefers the nearest exam's course", mvdExam.core?.id === "o");
check("MVD optional skips the chosen core even under exam bias", mvdExam.optional?.id !== "o");

// No reviews → no retrieval slot, but the day is still credible (core + optional).
const noReviews = [study("x", 40), study("y", 20)];
const mvdNoRev = minimumViableDay(noReviews);
check("MVD has no retrieval when the plan has no reviews", mvdNoRev.retrieval === null);
check("MVD still offers core + optional without reviews", mvdNoRev.core?.id === "x" && mvdNoRev.optional?.id === "y");

// A single open block → core only, no optional/retrieval, total = that block.
const lone = minimumViableDay([study("only", 50)]);
check("MVD with one block is just that core block", lone.core?.id === "only" && lone.optional === null && lone.totalMin === 50);

// Completed blocks are excluded from selection.
const withDone = [{ ...study("done", 60), completed: true }, study("live", 30)];
const mvdDone = minimumViableDay(withDone);
check("MVD ignores completed blocks", mvdDone.core?.id === "live");

// Exam feasibility comes from the full scheduler, independently of the clock.
check("no exam has no reachability claim", examReach(undefined) === "none");
check("a feasible scheduler result is possible", examReach({ isOverloaded: false }) === "possible");
check("an overloaded scheduler result stays at risk", examReach({ isOverloaded: true }) === "notFully");
check("late today does not make a feasible exam impossible", cockpitStatus(30, 10, { isOverloaded: false }) === "needs_choice");
check("midnight does not hide a genuinely overloaded exam", cockpitStatus(0, 0, { isOverloaded: true }) === "doesnt_fit");

const prev = recoveryActionPreviews({
  todayStudyMin: 150, todayReviewMin: 90,
  todayStudyCount: 5, todayReviewCount: 6,
  movableStudyCount: 5, movableReviewCount: 6, movableReviewMin: 90,
  immovableMin: 0,
  rebuilt: { count: 9, minutes: 243 },
  exam: { isOverloaded: false },
});
check("before count includes both study and review", prev.protect.beforeCount === 11);
check("protect moves reviews and leaves all five study sessions", prev.protect.afterCount === 5 && prev.protect.moved === 6);
check("protect reports all 150 remaining minutes, without a 120m cap", prev.protect.afterPaceMin === 150);
check("moving all movable work clears today", prev.move.afterCount === 0 && prev.move.moved === 11 && prev.move.afterPaceMin === 0);
check("rebuild reports the actual candidate session count", prev.lighter.afterCount === 9);
check("rebuild reports 243m even when that is over the comfort budget", prev.lighter.afterPaceMin === 243);
check("only the simulated rebuild makes a future-exam claim", prev.protect.examReach === "none" && prev.move.examReach === "none" && prev.lighter.examReach === "possible");

const DAY = 86400_000;
const d0 = Date.UTC(2026, 6, 2);
check("work can move when the exam is two days away", canMoveBlockToTomorrow(d0, d0 + 2 * DAY));
check("work cannot move onto exam day", !canMoveBlockToTomorrow(d0, d0 + DAY));
check("work cannot move after exam day", !canMoveBlockToTomorrow(d0, d0));
check("work without an exam clamp can move", canMoveBlockToTomorrow(d0, null));

const pinned = recoveryActionPreviews({
  todayStudyMin: 150, todayReviewMin: 90,
  todayStudyCount: 5, todayReviewCount: 6,
  movableStudyCount: 0, movableReviewCount: 0, movableReviewMin: 0,
  immovableMin: 240,
  rebuilt: { count: 12, minutes: 300 },
  exam: { isOverloaded: true },
});
check("exam-eve options promise zero moves", pinned.protect.moved === 0 && pinned.move.moved === 0);
check("pinned study AND reviews remain in protect's count and minutes", pinned.protect.afterCount === 11 && pinned.protect.afterPaceMin === 240);
check("move does not promise an empty day when work is pinned", pinned.move.afterCount === 11 && pinned.move.afterPaceMin === 240);
check("rebuild does not hide overload", pinned.lighter.examReach === "notFully" && pinned.lighter.afterPaceMin === 300);

const partial = recoveryActionPreviews({
  todayStudyMin: 150, todayReviewMin: 90,
  todayStudyCount: 5, todayReviewCount: 6,
  movableStudyCount: 3, movableReviewCount: 4, movableReviewMin: 50,
  immovableMin: 100,
  rebuilt: { count: 0, minutes: 0 },
});
check("protect leaves pinned reviews in its count", partial.protect.afterCount === 7);
check("protect subtracts only the review minutes actually moved", partial.protect.afterPaceMin === 190);
check("partial move leaves four pinned sessions and their real duration", partial.move.afterCount === 4 && partial.move.afterPaceMin === 100 && partial.move.moved === 7);
check("a rebuild with no work today correctly previews zero", partial.lighter.afterCount === 0 && partial.lighter.afterPaceMin === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

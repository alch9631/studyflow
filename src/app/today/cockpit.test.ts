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
  cockpitStatus(90, budget, { daysUntil: 5, remainingMin: 300 }) === "protected",
);
check("protected with no exam ahead when must-do fits", cockpitStatus(90, budget) === "protected");

// Needs a choice: more must-do study than the budget allows (but exam reachable).
check(
  "needs_choice when must-do study exceeds the budget",
  cockpitStatus(180, budget, { daysUntil: 10, remainingMin: 400 }) === "needs_choice",
);
check("needs_choice with no exam when must-do exceeds budget", cockpitStatus(200, budget) === "needs_choice");

// Doesn't fit: even a budget-paced run-up can't clear the exam's remaining work.
// 2 days (today + tomorrow) * 120 = 240 reachable; 600 required → can't make it.
check(
  "doesnt_fit when even a budget-paced day can't reach the exam",
  cockpitStatus(60, budget, { daysUntil: 1, remainingMin: 600 }) === "doesnt_fit",
);
check(
  "doesnt_fit dominates even when today alone would look protected",
  cockpitStatus(30, budget, { daysUntil: 0, remainingMin: 500 }) === "doesnt_fit",
);
// Boundary: required exactly equals reachable → still makes it (protected).
check(
  "exactly reachable exam load is NOT doesnt_fit",
  cockpitStatus(60, budget, { daysUntil: 2, remainingMin: 3 * budget }) === "protected",
);

// Honest, never false-calm: a heavy day with a near exam is never "protected".
const verdict = cockpitStatus(180, budget, { daysUntil: 1, remainingMin: 600 });
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

// ── Exam reachability (honest preview) ───────────────────────────────────────
check("examReach is 'none' without an exam", examReach(undefined, budget) === "none");
check("examReach is 'none' with a zero budget", examReach({ daysUntil: 5, remainingMin: 100 }, 0) === "none");
// 6 days (today+5) * 120 = 720 reachable. 300 << 720 → comfortably possible.
check("examReach is 'possible' when work fits comfortably", examReach({ daysUntil: 5, remainingMin: 300 }, budget) === "possible");
// 2 days * 120 = 240 reachable; 230 is >85% of 240 → at risk but still fits.
check("examReach is 'atRisk' when it fits only by a sliver", examReach({ daysUntil: 1, remainingMin: 230 }, budget) === "atRisk");
// 1 day * 120 = 120 reachable; 600 required → cannot be made.
check("examReach is 'notFully' when even a budget run-up can't clear it", examReach({ daysUntil: 0, remainingMin: 600 }, budget) === "notFully");

// ── Recovery action previews (before → after, no commit) ─────────────────────
// Today: 5 study (150m) + 6 reviews (90m) = 11 open, exam comfortably reachable.
const prev = recoveryActionPreviews({
  todayStudyMin: 150,
  todayReviewMin: 90,
  todayStudyCount: 5,
  todayReviewCount: 6,
  budgetMin: budget,
  exam: { daysUntil: 8, remainingMin: 400 },
});
check("preview beforeCount counts all open today sessions", prev.protect.beforeCount === 11);
check("protect keeps essentials, moves the reviews", prev.protect.afterEssentials === 5 && prev.protect.moved === 6);
check("protect pace is study capped at the budget", prev.protect.afterPaceMin === Math.min(150, budget));
check("move clears today entirely", prev.move.afterEssentials === 0 && prev.move.moved === 11 && prev.move.afterPaceMin === 0);
check("lighter keeps essentials and paces to the budget", prev.lighter.afterEssentials === 5 && prev.lighter.afterPaceMin === budget);
check("all previews agree the exam is still possible", prev.protect.examReach === "possible" && prev.move.examReach === "possible" && prev.lighter.examReach === "possible");

// Honest: an unreachable exam stays "notFully" across every option (no false hope).
const prevHard = recoveryActionPreviews({
  todayStudyMin: 150,
  todayReviewMin: 90,
  todayStudyCount: 5,
  todayReviewCount: 6,
  budgetMin: budget,
  exam: { daysUntil: 1, remainingMin: 600 },
});
check("an unreachable exam is reported as notFully on every option", prevHard.protect.examReach === "notFully" && prevHard.move.examReach === "notFully" && prevHard.lighter.examReach === "notFully");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

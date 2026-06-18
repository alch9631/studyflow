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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

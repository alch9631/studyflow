/**
 * Quick sanity tests for the plan engine. Run with: npx tsx src/lib/planner.test.ts
 * (No test runner yet — keep it dependency-free for day one.)
 */
import {
  applyCompletedWork,
  generatePlan,
  healPlan,
  planForDeadline,
  studyDatesBetween,
  type Course,
} from "./planner";

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

const course: Course = {
  id: "c1",
  name: "Algorithms",
  examDate: "2026-06-20",
  studyDays: [1, 2, 3, 4, 5], // Mon–Fri
  minutesPerDay: 120,
  topics: [
    { id: "t1", title: "Sorting", effort: 1, done: false },
    { id: "t2", title: "Graphs", effort: 2, done: false },
    { id: "t3", title: "DP", effort: 1, done: false },
  ],
};

// studyDatesBetween only returns allowed weekdays.
const dates = studyDatesBetween("2026-06-06", "2026-06-20", course.studyDays);
check("only weekdays returned", dates.every((d) => {
  const day = new Date(d + "T00:00:00Z").getUTCDay();
  return day >= 1 && day <= 5;
}));

// A fresh plan covers every pending topic.
const plan = generatePlan(course, "2026-06-06");
const covered = new Set(plan.map((b) => b.topicId));
check("every pending topic appears in plan", ["t1", "t2", "t3"].every((id) => covered.has(id)));
check("no block exceeds daily minutes", plan.every((b) => b.minutes <= course.minutesPerDay));

// Done topics are excluded.
const partlyDone: Course = {
  ...course,
  topics: course.topics.map((t) => (t.id === "t1" ? { ...t, done: true } : t)),
};
const plan2 = generatePlan(partlyDone, "2026-06-06");
check("done topics are dropped", !plan2.some((b) => b.topicId === "t1"));

// Healing close to the exam flags overload.
const { isOverloaded } = healPlan(course, "2026-06-19"); // ~1 day left, lots of work
check("overload flagged when too little time", isOverloaded === true);

// Healing with plenty of time is not overloaded.
const healthy = healPlan(course, "2026-06-06");
check("not overloaded with full runway", healthy.isOverloaded === false);

// Folding completed sessions: a fully-done topic drops out of the next plan.
const foldedAllDone = applyCompletedWork(
  course,
  { t1: 120 }, // all of t1's planned minutes done
  { t1: 120 },
);
check(
  "fully-completed topic is marked done after fold",
  foldedAllDone.topics.find((t) => t.id === "t1")?.done === true,
);
const planAfterFold = generatePlan(foldedAllDone, "2026-06-06");
check("folded-done topic is dropped from plan", !planAfterFold.some((b) => b.topicId === "t1"));

// Partial completion carries reduced effort (not the full topic) into heal.
const foldedPartial = applyCompletedWork(course, { t2: 90 }, { t2: 120 });
const t2 = foldedPartial.topics.find((t) => t.id === "t2");
check("half-done topic keeps reduced effort", t2 !== undefined && t2.effort === 2 * 0.25);
check("partial fold does not mark topic done", t2?.done === false);

// No completion data leaves the course untouched.
const foldedNone = applyCompletedWork(course, {}, {});
check(
  "no completion -> effort unchanged",
  foldedNone.topics.every((t, i) => t.effort === course.topics[i].effort),
);

// planForDeadline DECIDES the pace: a nearer exam → more minutes/day.
const far = planForDeadline(course, "2026-05-01"); // ~7 weeks of weekdays
const near = planForDeadline(course, "2026-06-15"); // ~1 week left
check("computes a daily pace", near.minutesPerDay > 0 && far.minutesPerDay > 0);
check("nearer exam needs more minutes/day", near.minutesPerDay > far.minutesPerDay);
check("comfortable runway is not intense", far.intense === false);
check("plan covers all topics at computed pace", new Set(near.blocks.map((b) => b.topicId)).size === 3);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

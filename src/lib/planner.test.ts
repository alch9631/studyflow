/**
 * Quick sanity tests for the plan engine. Run with: npx tsx src/lib/planner.test.ts
 * (No test runner yet — keep it dependency-free for day one.)
 */
import { generatePlan, healPlan, studyDatesBetween, type Course } from "./planner";

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

// Completed minutes per topic are subtracted from what heal redistributes.
const minutesFor = (blocks: { topicId: string; minutes: number }[], id: string) =>
  blocks.filter((b) => b.topicId === id).reduce((s, b) => s + b.minutes, 0);
const baseline = healPlan(course, "2026-06-06");
const partial = healPlan(course, "2026-06-06", { t2: 200 });
check(
  "heal schedules less of a topic once minutes are studied",
  minutesFor(partial.blocks, "t2") < minutesFor(baseline.blocks, "t2"),
);

// A topic whose share is fully covered gets no new blocks.
const fullyDone = healPlan(course, "2026-06-06", { t2: 100_000 });
check(
  "fully-studied topic drops out of the redistribution",
  !fullyDone.blocks.some((b) => b.topicId === "t2"),
);

// Crediting studied minutes against the floor can relieve overload.
const stillTight = healPlan(course, "2026-06-19"); // 1 day, lots of work
const relieved = healPlan(course, "2026-06-19", { t1: 45, t2: 90, t3: 45 });
check(
  "studied work relieves overload",
  stillTight.isOverloaded === true && relieved.isOverloaded === false,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

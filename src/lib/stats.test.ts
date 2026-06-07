/**
 * Unit tests for the analytics engine. Run: npx tsx src/lib/stats.test.ts
 * (Dependency-free, same style as planner/planService/dates/ics tests.)
 */
import {
  computeStats,
  currentStreak,
  longestStreak,
  dailyLoadSeries,
  calibrationFactor,
  gradeSummary,
  perCourseStats,
  lpOf,
  dayKey,
  type StatsBlock,
  type StatsCourse,
} from "./stats";

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

const TODAY = "2026-06-07";
const d = (iso: string) => new Date(iso + "T00:00:00Z");

const block = (over: Partial<StatsBlock> = {}): StatsBlock => ({
  date: d("2026-06-07"),
  minutes: 60,
  completed: false,
  actualMinutes: null,
  kind: "study",
  courseId: "c1",
  ...over,
});

const course = (over: Partial<StatsCourse> = {}): StatsCourse => ({
  id: "c1",
  name: "Algorithms",
  grade: null,
  ects: 6,
  examDate: d("2026-06-20"),
  intense: false,
  topics: [],
  ...over,
});

// ---- dayKey ----------------------------------------------------------------
check("dayKey strips time", dayKey(d("2026-06-07")) === "2026-06-07");

// ---- currentStreak ---------------------------------------------------------
check("empty streak = 0", currentStreak(new Set(), TODAY) === 0);
check(
  "studied today only = 1",
  currentStreak(new Set(["2026-06-07"]), TODAY) === 1,
);
check(
  "today not studied but yesterday was = 1 (grace)",
  currentStreak(new Set(["2026-06-06"]), TODAY) === 1,
);
check(
  "three consecutive ending today = 3",
  currentStreak(new Set(["2026-06-05", "2026-06-06", "2026-06-07"]), TODAY) === 3,
);
check(
  "gap breaks the streak",
  currentStreak(new Set(["2026-06-04", "2026-06-06", "2026-06-07"]), TODAY) === 2,
);
check(
  "stale activity (2+ days ago) = 0",
  currentStreak(new Set(["2026-06-05"]), TODAY) === 0,
);

// ---- longestStreak ---------------------------------------------------------
check("longest of empty = 0", longestStreak(new Set()) === 0);
check("longest of single = 1", longestStreak(new Set(["2026-06-01"])) === 1);
check(
  "longest run found among gaps",
  longestStreak(
    new Set([
      "2026-06-01", // run of 1
      "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06", // run of 4
      "2026-06-10", "2026-06-11", // run of 2
    ]),
  ) === 4,
);
check(
  "longest handles month boundary",
  longestStreak(new Set(["2026-05-31", "2026-06-01", "2026-06-02"])) === 3,
);

// ---- dailyLoadSeries -------------------------------------------------------
const series = dailyLoadSeries(
  [
    block({ date: d("2026-06-07"), minutes: 30, completed: true }),
    block({ date: d("2026-06-07"), minutes: 45, completed: true }),
    block({ date: d("2026-06-05"), minutes: 60, completed: true }),
    block({ date: d("2026-06-05"), minutes: 20, completed: false }), // not completed → ignored
    block({ date: d("2026-05-01"), minutes: 99, completed: true }), // out of window → ignored
  ],
  TODAY,
  7,
);
check("series has 7 days", series.length === 7);
check("series ends today", series[6].key === "2026-06-07");
check("series starts 6 days ago", series[0].key === "2026-06-01");
check("today sums completed only (30+45)", series[6].min === 75);
check("two days ago = 60", series[4].min === 60);
check("uncompleted not counted", series[4].min === 60);
check("days with no activity = 0", series[5].min === 0);

// ---- calibrationFactor -----------------------------------------------------
check("calibration neutral with <3 logged", calibrationFactor([
  block({ minutes: 60, actualMinutes: 90 }),
  block({ minutes: 60, actualMinutes: 90 }),
]) === 1);
check(
  "calibration > 1 when slower than planned",
  calibrationFactor([
    block({ minutes: 60, actualMinutes: 90 }),
    block({ minutes: 60, actualMinutes: 90 }),
    block({ minutes: 60, actualMinutes: 90 }),
  ]) === 1.5,
);
check(
  "calibration < 1 when faster than planned",
  calibrationFactor([
    block({ minutes: 60, actualMinutes: 30 }),
    block({ minutes: 60, actualMinutes: 30 }),
    block({ minutes: 60, actualMinutes: 30 }),
  ]) === 0.5,
);
check(
  "calibration clamped to 2.5 max",
  calibrationFactor([
    block({ minutes: 10, actualMinutes: 100 }),
    block({ minutes: 10, actualMinutes: 100 }),
    block({ minutes: 10, actualMinutes: 100 }),
  ]) === 2.5,
);
check(
  "calibration clamped to 0.5 min",
  calibrationFactor([
    block({ minutes: 100, actualMinutes: 1 }),
    block({ minutes: 100, actualMinutes: 1 }),
    block({ minutes: 100, actualMinutes: 1 }),
  ]) === 0.5,
);
check("calibration ignores zero/blank actuals", calibrationFactor([
  block({ minutes: 60, actualMinutes: 0 }),
  block({ minutes: 60, actualMinutes: null }),
]) === 1);

// ---- gradeSummary / lpOf ---------------------------------------------------
check("lpOf uses ects", lpOf({ ects: 9 }) === 9);
check("lpOf defaults to 6", lpOf({ ects: null }) === 6);

const gs = gradeSummary([
  course({ id: "a", grade: 1.0, ects: 6 }),
  course({ id: "b", grade: 2.0, ects: 6 }),
  course({ id: "c", grade: null, ects: 6 }), // ungraded → ignored
]);
check("gradeSummary counts only graded", gs.gradedCount === 2);
check("gpa is LP-weighted mean (1.0,2.0)→1.5", gs.gpa === 1.5);
check("lpEarned counts passing grades (≤4.0)", gs.lpEarned === 12);

const gsFail = gradeSummary([
  course({ id: "a", grade: 1.0, ects: 6 }),
  course({ id: "b", grade: 5.0, ects: 6 }), // failed → no LP
]);
check("failed grade earns no LP", gsFail.lpEarned === 6);
check("weighted gpa with failure (1.0,5.0)→3.0", gsFail.gpa === 3.0);

const gsWeighted = gradeSummary([
  course({ id: "a", grade: 1.0, ects: 9 }),
  course({ id: "b", grade: 4.0, ects: 3 }),
]);
// (1.0*9 + 4.0*3) / 12 = 21/12 = 1.75
check("gpa respects LP weights", gsWeighted.gpa === 1.75);

const gsEmpty = gradeSummary([course({ grade: null })]);
check("gpa null when nothing graded", gsEmpty.gpa === null && gsEmpty.lpEarned === 0);

// ---- perCourseStats --------------------------------------------------------
const pcCourses = [
  course({
    id: "c1",
    name: "Algo",
    examDate: d("2026-06-17"), // 10 days out
    topics: [{ done: true }, { done: false }, { done: false }, { done: false }],
  }),
];
const pcBlocks = [
  block({ courseId: "c1", minutes: 60, completed: true, actualMinutes: 75, kind: "study" }),
  block({ courseId: "c1", minutes: 60, completed: false, kind: "study" }),
  block({ courseId: "c1", minutes: 40, completed: false, kind: "review" }), // review, not study
];
const pc = perCourseStats(pcCourses, pcBlocks, TODAY)[0];
check("per-course planned minutes summed", pc.plannedMinutes === 160);
check("per-course completed minutes", pc.completedMinutes === 60);
check("per-course actual (logged) minutes", pc.actualMinutes === 75);
check("per-course remaining STUDY only (excludes review)", pc.remainingStudyMinutes === 60);
check("per-course progress % (1/4)", pc.progressPct === 25);
check("per-course topics done/total", pc.topicsDone === 1 && pc.topicsTotal === 4);
check("per-course daysToExam", pc.daysToExam === 10);
check("per-course pressure = remaining/days (60/10)", pc.pressurePerDay === 6);

const pcNoBlocks = perCourseStats([course({ id: "z", topics: [] })], [], TODAY)[0];
check("per-course with no blocks → zeros", pcNoBlocks.plannedMinutes === 0 && pcNoBlocks.pressurePerDay === 0);
check("per-course empty topics → 0% progress", pcNoBlocks.progressPct === 0);

// ---- computeStats (integration) --------------------------------------------
const emptyStats = computeStats([], [], TODAY);
check("empty: hasData false", emptyStats.hasData === false);
check("empty: streak 0", emptyStats.currentStreak === 0);
check("empty: completionRate 0", emptyStats.completionRate === 0);
check("empty: gpa null", emptyStats.grades.gpa === null);
check("empty: no attention", emptyStats.attention.length === 0);
check("empty: dailyLoad still 7 days", emptyStats.dailyLoad.length === 7);

// Mixed dataset: this-week + due + future blocks.
const blocks: StatsBlock[] = [
  // This week (Mon 2026-06-01 .. today Sun 06-07). Today is Sunday.
  block({ date: d("2026-06-05"), minutes: 60, completed: true }), // due+done, this week
  block({ date: d("2026-06-06"), minutes: 60, completed: true }), // due+done, this week
  block({ date: d("2026-06-07"), minutes: 60, completed: false }), // due, not done, today
  // Future (next 7 days) — upcoming workload, not due.
  block({ date: d("2026-06-09"), minutes: 90, completed: false }),
  block({ date: d("2026-06-12"), minutes: 30, completed: false }),
];
const courses: StatsCourse[] = [
  course({
    id: "c1",
    examDate: d("2026-06-20"),
    topics: [{ done: true }, { done: false }],
  }),
];
const s = computeStats(blocks, courses, TODAY);

check("hasData true", s.hasData === true);
check("totalPlannedMinutes = 300", s.totalPlannedMinutes === 300);
check("totalCompletedMinutes = 120", s.totalCompletedMinutes === 120);
check("dueTotal (on/before today) = 180", s.dueTotal === 180);
check("dueDone = 120", s.dueDone === 120);
check("duePct = round(120/180) = 67", s.duePct === 67);
check("completionRate ≈ 0.6667", Math.abs(s.completionRate - 120 / 180) < 1e-9);
check("weekPlanned = 180 (all three this-week blocks)", s.weekPlanned === 180);
check("weekDone = 120", s.weekDone === 120);
check("weekPct = 67", s.weekPct === 67);
// next-7-days window is [today, today+7): today's uncompleted (60) + 06-09 (90) + 06-12 (30).
check("upcomingWorkload (uncompleted, today→+7d) = 180", s.upcomingWorkload === 180);
check("streak: 06-05 & 06-06 done, today not → 2", s.currentStreak === 2);
check("longestStreak = 2", s.longestStreak === 2);
check("activeDays in last 14 = 2", s.activeDays === 2);
check("consistency = round(2/14*100) = 14", s.consistency === 14);
check("completedModules = 0 (course has an undone topic)", s.completedModules === 0);
check("courses array present", s.courses.length === 1);
check("attention surfaces the unfinished course", s.attention.length === 1 && s.attention[0].id === "c1");

// completedModules counts only all-topics-done courses.
const sMod = computeStats(
  [block({ courseId: "cm", date: d("2026-06-07"), completed: true })],
  [course({ id: "cm", topics: [{ done: true }, { done: true }] })],
  TODAY,
);
check("completedModules = 1 when every topic done", sMod.completedModules === 1);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

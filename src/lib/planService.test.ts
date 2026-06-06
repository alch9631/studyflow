/**
 * Unit tests for the pure mapping/folding logic in planService.ts.
 * Run with: npx tsx src/lib/planService.test.ts
 * (Dependency-free, same style as planner.test.ts.)
 */
import { toEngineCourse, foldCompletedSessions, blockKey } from "./planService";

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

// ---- toEngineCourse -------------------------------------------------------

const dbCourse = {
  id: "c1",
  name: "Algorithms",
  examDate: new Date("2026-06-20T00:00:00Z"),
  studyDays: "1,2,3,4,5",
  minutesPerDay: 120,
  topics: [
    { id: "t1", title: "Sorting", effort: 1, done: false },
    { id: "t2", title: "Graphs", effort: 2, done: true },
  ],
};

const engine = toEngineCourse(dbCourse);

check("examDate Date -> YYYY-MM-DD string", engine.examDate === "2026-06-20");
check("id and name carried over", engine.id === "c1" && engine.name === "Algorithms");
check("minutesPerDay carried over", engine.minutesPerDay === 120);
check(
  "studyDays comma string -> number[]",
  Array.isArray(engine.studyDays) &&
    engine.studyDays.length === 5 &&
    engine.studyDays.every((n) => typeof n === "number") &&
    JSON.stringify(engine.studyDays) === JSON.stringify([1, 2, 3, 4, 5]),
);
check(
  "topics carried over (id/title/effort/done)",
  engine.topics.length === 2 &&
    engine.topics[0].id === "t1" &&
    engine.topics[0].title === "Sorting" &&
    engine.topics[0].effort === 1 &&
    engine.topics[0].done === false &&
    engine.topics[1].done === true,
);

// Bad/empty studyDays entries are filtered out (NaN dropped).
const messyDays = toEngineCourse({
  ...dbCourse,
  studyDays: "1, ,3,, foo ,5",
});
check(
  "bad/empty studyDays entries filtered out",
  JSON.stringify(messyDays.studyDays) === JSON.stringify([1, 3, 5]),
);

const emptyDays = toEngineCourse({ ...dbCourse, studyDays: "" });
check("empty studyDays -> []", JSON.stringify(emptyDays.studyDays) === JSON.stringify([]));

// ---- blockKey -------------------------------------------------------------

check(
  "blockKey is topicTitle|YYYY-MM-DD",
  blockKey("Sorting", new Date("2026-06-20T00:00:00Z")) === "Sorting|2026-06-20",
);
check(
  "blockKey ignores time-of-day component",
  blockKey("Graphs", new Date("2026-06-20T23:59:59Z")) === "Graphs|2026-06-20",
);
check(
  "blockKey is stable for same title+date",
  blockKey("DP", new Date("2026-06-07T00:00:00Z")) ===
    blockKey("DP", new Date("2026-06-07T00:00:00Z")),
);

// ---- foldCompletedSessions ------------------------------------------------
// Fixture: 1 course, 2 topics with equal base effort.
//  - t1 ("Sorting") has 2 blocks (120 + 120 = 240 planned), one completed (120).
//  - t2 ("Graphs") has 2 blocks (120 + 120 = 240 planned), none completed.
// Completed work should NOT be redistributed: t1's effort should shrink to
// reflect the remaining fraction (1 - 120/240 = 0.5), while t2 is untouched.
const foldCourse = {
  id: "c2",
  name: "Folding",
  examDate: new Date("2026-06-20T00:00:00Z"),
  studyDays: "1,2,3,4,5",
  minutesPerDay: 120,
  topics: [
    { id: "t1", title: "Sorting", effort: 4, done: false },
    { id: "t2", title: "Graphs", effort: 4, done: false },
  ],
  blocks: [
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-08T00:00:00Z"), minutes: 120, completed: true },
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-09T00:00:00Z"), minutes: 120, completed: false },
    { topicId: "t2", topicTitle: "Graphs", date: new Date("2026-06-10T00:00:00Z"), minutes: 120, completed: false },
    { topicId: "t2", topicTitle: "Graphs", date: new Date("2026-06-11T00:00:00Z"), minutes: 120, completed: false },
  ],
};

const folded = foldCompletedSessions(foldCourse);
const ft1 = folded.topics.find((t) => t.id === "t1")!;
const ft2 = folded.topics.find((t) => t.id === "t2")!;

// t1: planned=240, done=120 -> remainingFraction=0.5 -> effort 4 * 0.5 = 2.
check("completed topic effort reduced (4 -> 2)", ft1.effort === 2);
// t2: nothing completed -> effort unchanged at 4.
check("untouched topic keeps full effort (4)", ft2.effort === 4);
check(
  "completed topic carries less remaining effort than untouched one",
  ft1.effort < ft2.effort,
);
check("partial completion does not mark topic done", ft1.done === false);

// A fully-completed topic drops out entirely (marked done).
const allDoneCourse = {
  ...foldCourse,
  blocks: [
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-08T00:00:00Z"), minutes: 120, completed: true },
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-09T00:00:00Z"), minutes: 120, completed: true },
    { topicId: "t2", topicTitle: "Graphs", date: new Date("2026-06-10T00:00:00Z"), minutes: 120, completed: false },
  ],
};
const allDone = foldCompletedSessions(allDoneCourse);
check(
  "fully-completed topic marked done after fold",
  allDone.topics.find((t) => t.id === "t1")?.done === true,
);

// No completed blocks -> all efforts unchanged.
const noneCompleted = foldCompletedSessions({
  ...foldCourse,
  blocks: foldCourse.blocks.map((b) => ({ ...b, completed: false })),
});
check(
  "no completed blocks -> efforts unchanged",
  noneCompleted.topics.every((t, i) => t.effort === foldCourse.topics[i].effort),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

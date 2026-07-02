/**
 * Unit tests for the pure mapping/folding logic in planService.ts.
 * Run with: npx tsx src/lib/planService.test.ts
 * (Dependency-free, same style as planner.test.ts.)
 */
import {
  toEngineCourse,
  foldCompletedSessions,
  blockKey,
  reviewDifficultyByTopic,
  dailyStudyCeiling,
  MIN_DAILY_AFTER_LECTURES,
  GLOBAL_DAILY_MINUTES,
} from "./planService";

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
  "blockKey is topicId|YYYY-MM-DD|kind",
  blockKey("t1", new Date("2026-06-20T00:00:00Z"), "study") === "t1|2026-06-20|study",
);
check(
  "blockKey ignores time-of-day component",
  blockKey("t2", new Date("2026-06-20T23:59:59Z"), "study") === "t2|2026-06-20|study",
);
check(
  "blockKey is stable for same topic+date+kind",
  blockKey("t3", new Date("2026-06-07T00:00:00Z"), "study") ===
    blockKey("t3", new Date("2026-06-07T00:00:00Z"), "study"),
);
// Regression (replan dropping a review): a scheduled "review" and a completed
// "study" on the SAME topic+date are DISTINCT keys, so persistBlocks no longer
// treats the freshly-planned review as "already covered" by the done study
// block and drops it.
check(
  "blockKey separates kinds on the same topic+date",
  blockKey("t3", new Date("2026-06-07T00:00:00Z"), "study") !==
    blockKey("t3", new Date("2026-06-07T00:00:00Z"), "review"),
);
// Regression (same-titled topics colliding): the key is the topic's ID, so two
// topics that happen to share a title get DISTINCT keys — a completed block on
// one can no longer suppress the other's freshly-planned minutes.
check(
  "blockKey separates same-titled topics (keyed by id, not title)",
  blockKey("t-a", new Date("2026-06-07T00:00:00Z"), "study") !==
    blockKey("t-b", new Date("2026-06-07T00:00:00Z"), "study"),
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

// ---- Regression: review blocks must not count as study effort ---------------
// A topic with ALL study done but reviews still pending previously looked
// part-unstudied (pending reviews inflated `planned` without matching `done`),
// so heal/rebuild re-scheduled ~45% of its study from scratch. Reviews are
// recall sessions layered ON TOP of study — they carry no study effort.
const reviewsPending = foldCompletedSessions({
  ...foldCourse,
  blocks: [
    // t1: all study completed (240/240) + three pending 25-min reviews.
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-08T00:00:00Z"), minutes: 120, completed: true, kind: "study" },
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-09T00:00:00Z"), minutes: 120, completed: true, kind: "study" },
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-10T00:00:00Z"), minutes: 25, completed: false, kind: "review" },
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-12T00:00:00Z"), minutes: 25, completed: false, kind: "review" },
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-16T00:00:00Z"), minutes: 25, completed: false, kind: "review" },
    // t2: untouched.
    { topicId: "t2", topicTitle: "Graphs", date: new Date("2026-06-10T00:00:00Z"), minutes: 120, completed: false, kind: "study" },
  ],
});
check(
  "fold: all study done + pending reviews -> topic fully done (no study re-scheduled)",
  reviewsPending.topics.find((t) => t.id === "t1")?.done === true,
);
check(
  "fold: pending reviews don't shrink another topic's effort",
  reviewsPending.topics.find((t) => t.id === "t2")?.effort === 4,
);

// The converse: a COMPLETED review must not count as done STUDY minutes (it
// would otherwise shrink the topic's remaining study effort).
const reviewDone = foldCompletedSessions({
  ...foldCourse,
  blocks: [
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-08T00:00:00Z"), minutes: 120, completed: false, kind: "study" },
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-10T00:00:00Z"), minutes: 25, completed: true, kind: "review" },
  ],
});
check(
  "fold: a completed review leaves study effort untouched",
  reviewDone.topics.find((t) => t.id === "t1")?.effort === 4 &&
    reviewDone.topics.find((t) => t.id === "t1")?.done === false,
);

// Drift-tolerance: a block with NO kind at all (legacy row) folds as "study",
// matching the schema default — the pre-kind behavior is preserved.
const kindlessFold = foldCompletedSessions({
  ...foldCourse,
  blocks: [
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-08T00:00:00Z"), minutes: 120, completed: true },
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-09T00:00:00Z"), minutes: 120, completed: false },
  ],
});
check(
  "fold: kind-less legacy blocks still fold as study (effort 4 -> 2)",
  kindlessFold.topics.find((t) => t.id === "t1")?.effort === 2,
);

// ===========================================================================
// EDGE CASES — the pure mapping/folding layer under adversarial inputs:
// overlapping/zero-day exam windows and very large course/topic loads. These
// functions feed the global scheduler, so they must stay total (never throw),
// finite, and bounded no matter what the DB hands them. Behaviour-only.
// ===========================================================================

type DbCourse = typeof dbCourse;
type DbFoldCourse = typeof foldCourse;

// ---- toEngineCourse: zero-day / past exam windows -------------------------
// toEngineCourse just maps shapes; an exam in the past or today is mapped
// faithfully (the engine, not the mapper, decides it's unschedulable).
const pastExam = toEngineCourse({ ...dbCourse, examDate: new Date("2020-01-01T00:00:00Z") });
check("toEngineCourse: past exam date maps faithfully", pastExam.examDate === "2020-01-01");
const examTodayMap = toEngineCourse({ ...dbCourse, examDate: new Date("2026-06-08T00:00:00Z") });
check("toEngineCourse: exam-today date maps faithfully", examTodayMap.examDate === "2026-06-08");

// Non-midnight DB timestamps still map to the correct calendar day (no TZ slip
// in the mapping itself — examDate is sliced from the ISO string).
const lateTs = toEngineCourse({ ...dbCourse, examDate: new Date("2026-06-20T23:30:00Z") });
check("toEngineCourse: late-in-day UTC timestamp keeps its calendar date", lateTs.examDate === "2026-06-20");

// ---- foldCompletedSessions: zero-day window with completed work -----------
// Even when the exam is in the past, folding completion is purely arithmetic and
// must still behave (drop fully-done topics, shrink partials) without throwing.
const pastCourseFold = foldCompletedSessions({
  ...foldCourse,
  examDate: new Date("2020-01-01T00:00:00Z"),
});
check(
  "fold: past-exam course still folds without throwing",
  pastCourseFold.topics.find((t) => t.id === "t1")!.effort === 2,
);

// ---- foldCompletedSessions: over-completion / zero-planned guards ----------
// A topic logged for more minutes than were ever planned must drop out (done),
// never carry negative effort. A topic with completed minutes but ZERO planned
// (shouldn't happen, but DB drift is real) must be left untouched, not NaN.
const weirdFold = foldCompletedSessions({
  ...foldCourse,
  blocks: [
    // t1: 60 planned but 300 completed -> over-completed -> done.
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-08T00:00:00Z"), minutes: 60, completed: true },
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-09T00:00:00Z"), minutes: 240, completed: true },
    // t2: a completed block with 0 minutes -> planned 0 from this block, no fold.
    { topicId: "t2", topicTitle: "Graphs", date: new Date("2026-06-10T00:00:00Z"), minutes: 0, completed: true },
  ],
});
const wf1 = weirdFold.topics.find((t) => t.id === "t1")!;
const wf2 = weirdFold.topics.find((t) => t.id === "t2")!;
check("fold: over-completed topic marked done", wf1.done === true);
check("fold: no topic ends with negative effort", weirdFold.topics.every((t) => t.effort >= 0));
check("fold: zero-planned topic keeps full effort", wf2.effort === 4 && wf2.done === false);
check("fold: all efforts stay finite", weirdFold.topics.every((t) => Number.isFinite(t.effort)));

// ---- Overlapping exam windows across many courses (mapping layer) ---------
// A batch of courses whose windows overlap (exam season) is mapped one-by-one.
// Mapping is per-course and stateless, so a shared/overlapping exam date causes
// no cross-talk: each maps to exactly its own shape.
const SHARED = new Date("2026-07-31T00:00:00Z");
const overlappingDb: DbCourse[] = Array.from({ length: 15 }, (_, i) => ({
  ...dbCourse,
  id: `oc${i}`,
  name: `Overlap ${i}`,
  examDate: SHARED,
  topics: [
    { id: `oc${i}-a`, title: `A${i}`, effort: 1 + (i % 3), done: false },
    { id: `oc${i}-b`, title: `B${i}`, effort: 2, done: i % 2 === 0 },
  ],
}));
let overlapMapOk = true;
let overlapMappedRight = true;
try {
  for (let i = 0; i < overlappingDb.length; i++) {
    const e = toEngineCourse(overlappingDb[i]);
    if (e.id !== `oc${i}` || e.examDate !== "2026-07-31" || e.topics.length !== 2) overlapMappedRight = false;
  }
} catch {
  overlapMapOk = false;
}
check("overlapping exams: mapping a batch does not throw", overlapMapOk);
check("overlapping exams: each course maps to its own shape (no cross-talk)", overlapMappedRight);

// ---- Very large course/topic load (mapping + folding) ---------------------
// A heavy student: one course with 1,000 topics, each with two completed-ish
// blocks. Mapping and folding must finish quickly and stay well-formed.
const BIG_TOPICS = 1000;
const bigDbTopics = Array.from({ length: BIG_TOPICS }, (_, i) => ({
  id: `bt${i}`,
  title: `Big Topic ${i}`,
  effort: 1 + (i % 4),
  done: false,
}));
const bigDbCourse: DbFoldCourse = {
  ...foldCourse,
  id: "big",
  topics: bigDbTopics,
  blocks: bigDbTopics.flatMap((t, i) => [
    // half of each topic done -> effort should roughly halve for every topic.
    { topicId: t.id, topicTitle: t.title, date: new Date("2026-06-08T00:00:00Z"), minutes: 60, completed: i % 3 !== 0 },
    { topicId: t.id, topicTitle: t.title, date: new Date("2026-06-09T00:00:00Z"), minutes: 60, completed: false },
  ]),
};
const tBig = Date.now();
let bigFoldOk = true;
let bigFolded = { topics: [] as { id: string; effort: number; done: boolean }[] };
try {
  bigFolded = foldCompletedSessions(bigDbCourse) as typeof bigFolded;
} catch {
  bigFoldOk = false;
}
const bigElapsed = Date.now() - tBig;
check("large load: mapping the course also works", toEngineCourse(bigDbCourse).topics.length === BIG_TOPICS);
check("large load: folding 1000 topics does not throw", bigFoldOk);
check("large load: every topic survives the fold", bigFolded.topics.length === BIG_TOPICS);
check("large load: all folded efforts finite and non-negative", bigFolded.topics.every((t) => Number.isFinite(t.effort) && t.effort >= 0));
check(`large load: folding completes promptly (${bigElapsed}ms < 5000ms)`, bigElapsed < 5000);

// ===========================================================================
// NULL / UNDEFINED DEFENSIVE HANDLING — the Prisma columns are typed non-null,
// but legacy rows, partial migrations and hand-edited data are real. The DB
// boundary (toEngineCourse / foldCompletedSessions) must sanitize so the pure
// engine never receives null collections or NaN-inducing fields. We cast past
// the static types here to simulate that drift. Behaviour-only.
// ===========================================================================

/** Cast helper: feed a deliberately malformed value past the static types. */
const bad = <T>(v: unknown): T => v as T;

// ---- toEngineCourse: null/undefined columns -------------------------------
let teNullOk = true;
let teNull = bad<ReturnType<typeof toEngineCourse>>(null);
try {
  teNull = toEngineCourse(bad({
    id: "x",
    name: null,
    examDate: null,
    studyDays: null,
    minutesPerDay: null,
    topics: null,
  }));
} catch {
  teNullOk = false;
}
check("toEngineCourse(all-null columns) does not throw", teNullOk);
check("toEngineCourse(null name) -> empty string", teNull.name === "");
check("toEngineCourse(null examDate) -> empty string", teNull.examDate === "");
check("toEngineCourse(null minutesPerDay) -> 0", teNull.minutesPerDay === 0);
check("toEngineCourse(null studyDays) -> []", Array.isArray(teNull.studyDays) && teNull.studyDays.length === 0);
check("toEngineCourse(null topics) -> []", Array.isArray(teNull.topics) && teNull.topics.length === 0);

// Per-topic null/undefined fields are coerced to safe defaults.
const teTopics = toEngineCourse(bad({
  ...dbCourse,
  topics: [
    { id: "a", title: null, effort: null, done: null },
    { id: "b", title: "B", effort: undefined, done: undefined },
    { id: "c", title: "C", effort: NaN, done: 1 },
  ],
}));
check("toEngineCourse(null topic.title) -> empty string", teTopics.topics[0].title === "");
check(
  "toEngineCourse(null/undefined/NaN topic.effort) -> 0",
  teTopics.topics.every((t) => Number.isFinite(t.effort) && t.effort === 0),
);
check(
  "toEngineCourse(non-boolean topic.done) -> strict boolean",
  teTopics.topics[0].done === false &&
    teTopics.topics[1].done === false &&
    teTopics.topics[2].done === false,
);

// ---- foldCompletedSessions: null blocks / null minutes --------------------
let foldNullBlocksOk = true;
let foldNullBlocks = bad<ReturnType<typeof foldCompletedSessions>>(null);
try {
  foldNullBlocks = foldCompletedSessions(bad({ ...foldCourse, blocks: null }));
} catch {
  foldNullBlocksOk = false;
}
check("foldCompletedSessions(null blocks) does not throw", foldNullBlocksOk);
check(
  "foldCompletedSessions(null blocks) leaves efforts unchanged",
  foldNullBlocks.topics.every((t, i) => t.effort === foldCourse.topics[i].effort),
);

// A block with null/NaN minutes must not poison the topic's planned/done totals
// (which would otherwise yield a NaN folded effort).
const foldNullMinutes = foldCompletedSessions(bad({
  ...foldCourse,
  blocks: [
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-08T00:00:00Z"), minutes: null, completed: true },
    { topicId: "t1", topicTitle: "Sorting", date: new Date("2026-06-09T00:00:00Z"), minutes: 120, completed: true },
    { topicId: "t2", topicTitle: "Graphs", date: new Date("2026-06-10T00:00:00Z"), minutes: NaN, completed: false },
  ],
}));
check(
  "foldCompletedSessions(null/NaN minutes) keeps every effort finite",
  foldNullMinutes.topics.every((t) => Number.isFinite(t.effort) && t.effort >= 0),
);

// ---- reviewDifficultyByTopic (per-topic confidence → review difficulty) ----

const conf1 = reviewDifficultyByTopic([
  { id: "t1", confidence: "struggling" },
  { id: "t2", confidence: "practice" },
  { id: "t3", confidence: "solid" },
]);
check("confidence struggling → hard (more reviews)", conf1.t1 === "hard");
check("confidence practice → medium", conf1.t2 === "medium");
check("confidence solid → easy (fewer reviews)", conf1.t3 === "easy");

const conf2 = reviewDifficultyByTopic([
  { id: "t1", confidence: null },
  { id: "t2", confidence: "bogus" },
]);
check("unrated topic omitted (baseline spacing)", conf2.t1 === undefined);
check("junk confidence omitted", conf2.t2 === undefined);
check("reviewDifficultyByTopic([]) is empty", Object.keys(reviewDifficultyByTopic([])).length === 0);

// ---- dailyStudyCeiling (timetable awareness — "lectures respected") --------
// The scheduler subtracts a day's lecture minutes from the global cap so a
// class-heavy day can't be over-booked with study. These invariants pin that
// contract: free days keep the full ceiling, busy days shrink it proportionally,
// and a fully-booked day still leaves a protected minimum — never zero/negative.
check("ceiling: a free day keeps the full global cap", dailyStudyCeiling(0) === GLOBAL_DAILY_MINUTES);
check(
  "ceiling: lectures subtract from the day's study budget",
  dailyStudyCeiling(120) === GLOBAL_DAILY_MINUTES - 120,
);
check(
  "ceiling: more lectures never give MORE study room (monotonic)",
  dailyStudyCeiling(60) >= dailyStudyCeiling(180),
);
check(
  "ceiling: a fully-booked day still allows the protected minimum",
  dailyStudyCeiling(GLOBAL_DAILY_MINUTES + 999) === MIN_DAILY_AFTER_LECTURES,
);
check(
  "ceiling: never drops below the protected minimum",
  [0, 100, 300, 360, 10_000].every((m) => dailyStudyCeiling(m) >= MIN_DAILY_AFTER_LECTURES),
);
check(
  "ceiling: never exceeds the global cap",
  [0, 100, 300, 360, 10_000].every((m) => dailyStudyCeiling(m) <= GLOBAL_DAILY_MINUTES),
);
// Drift (null / NaN / negative lecture minutes) coerces to a free day, not junk.
check("ceiling: null lecture minutes → full cap", dailyStudyCeiling(null) === GLOBAL_DAILY_MINUTES);
check("ceiling: undefined lecture minutes → full cap", dailyStudyCeiling(undefined) === GLOBAL_DAILY_MINUTES);
check("ceiling: NaN lecture minutes → full cap", dailyStudyCeiling(NaN) === GLOBAL_DAILY_MINUTES);
check("ceiling: negative lecture minutes → full cap (no inflation)", dailyStudyCeiling(-200) === GLOBAL_DAILY_MINUTES);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

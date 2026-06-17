/**
 * Quick sanity tests for the plan engine. Run with: npx tsx src/lib/planner.test.ts
 * (No test runner yet — keep it dependency-free for day one.)
 */
import {
  applyCompletedWork,
  buildReviewBlocks,
  generatePlan,
  healPlan,
  INTENSE_MINUTES_PER_DAY,
  MIN_MINUTES_PER_EFFORT,
  planForDeadline,
  REVIEW_INTERVALS_BY_DIFFICULTY,
  studyDatesBetween,
  type Course,
  type StudyBlock,
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

// ---- Per-course difficulty dial (1–5) -------------------------------------
// Difficulty is purely additive: an unrated course (no `difficulty`) and an
// explicit difficulty 3 (the default) must produce the EXACT same plan as before
// the dial existed — same pace, byte-for-byte same blocks (no regression).
// `far` above is the baseline (course with no `difficulty`, runway "2026-05-01").
const diffNormal = planForDeadline({ ...course, difficulty: 3 }, "2026-05-01");
check(
  "difficulty 3 == baseline pace (no regression)",
  diffNormal.minutesPerDay === far.minutesPerDay,
);
check(
  "difficulty 3 == baseline blocks byte-for-byte",
  JSON.stringify(diffNormal.blocks) === JSON.stringify(far.blocks),
);
// Harder courses get proportionally MORE study time: difficulty 5 paces higher
// than difficulty 1 for the very same course over the same runway. Use the SHORT
// runway ("2026-06-15", ~1 week) so the pace is well above the 15-min floor and
// the multiplier visibly moves it (a far runway can already sit at the floor).
const diffEasyNear = planForDeadline({ ...course, difficulty: 1 }, "2026-06-15");
const diffNormalNear = planForDeadline({ ...course, difficulty: 3 }, "2026-06-15");
const diffHardNear = planForDeadline({ ...course, difficulty: 5 }, "2026-06-15");
check(
  "difficulty 5 paces higher than difficulty 1",
  diffHardNear.minutesPerDay > diffEasyNear.minutesPerDay,
);
check(
  "difficulty 5 paces higher than the normal default",
  diffHardNear.minutesPerDay > diffNormalNear.minutesPerDay,
);

// ===========================================================================
// EDGE CASES — adversarial inputs. The engine must DEGRADE GRACEFULLY: never
// throw, never emit nonsensical (NaN / negative / over-budget) blocks, and stay
// bounded. These assert behaviour only; they must not require engine changes.
// ===========================================================================

/** A block is "well-formed" if its minutes are a finite, positive, bounded number. */
function blockIsSane(b: StudyBlock, dailyCap?: number): boolean {
  return (
    Number.isFinite(b.minutes) &&
    b.minutes > 0 &&
    typeof b.date === "string" &&
    b.date.length === 10 &&
    (dailyCap === undefined || b.minutes <= dailyCap)
  );
}

// ---- Zero-day study window: exam today (start === end) --------------------
// studyDatesBetween is half-open [start, end), so start === end yields no days.

const zeroWindowDates = studyDatesBetween("2026-06-08", "2026-06-08", [1, 2, 3, 4, 5]);
check("exam-today window yields zero study dates", zeroWindowDates.length === 0);

const examToday: Course = { ...course, examDate: "2026-06-08" };

// generatePlan over a zero-day window must not crash and must produce nothing.
let genZeroOk = true;
let genZero: StudyBlock[] = [];
try {
  genZero = generatePlan(examToday, "2026-06-08");
} catch {
  genZeroOk = false;
}
check("generatePlan(exam today) does not throw", genZeroOk);
check("generatePlan(exam today) yields empty plan", genZero.length === 0);

// planForDeadline with no days left but real work: no schedule, pace 0, flagged
// intense (it's literally unschedulable) — never NaN/negative.
let pfdZeroOk = true;
let pfdZero = { blocks: [] as StudyBlock[], minutesPerDay: -1, intense: false };
try {
  pfdZero = planForDeadline(examToday, "2026-06-08");
} catch {
  pfdZeroOk = false;
}
check("planForDeadline(exam today) does not throw", pfdZeroOk);
check("planForDeadline(exam today) schedules nothing", pfdZero.blocks.length === 0);
check(
  "planForDeadline(exam today) pace is a finite non-negative number",
  Number.isFinite(pfdZero.minutesPerDay) && pfdZero.minutesPerDay >= 0,
);
check("planForDeadline(exam today) flags unschedulable work as intense", pfdZero.intense === true);

// healPlan with no days left + pending work: empty plan, flagged overloaded.
let healZeroOk = true;
let healZero = { blocks: [] as StudyBlock[], isOverloaded: false };
try {
  healZero = healPlan(examToday, "2026-06-08");
} catch {
  healZeroOk = false;
}
check("healPlan(exam today) does not throw", healZeroOk);
check("healPlan(exam today) yields empty plan", healZero.blocks.length === 0);
check("healPlan(exam today) flags overload (no time, has work)", healZero.isOverloaded === true);

// buildReviewBlocks with an empty date list must short-circuit to [].
let reviewZeroOk = true;
let reviewZero: StudyBlock[] = [];
try {
  reviewZero = buildReviewBlocks(genZero, []);
} catch {
  reviewZeroOk = false;
}
check("buildReviewBlocks(no dates) does not throw", reviewZeroOk);
check("buildReviewBlocks(no dates) yields no reviews", reviewZero.length === 0);

// Exam strictly BEFORE today (negative window) is treated like zero days.
let pastOk = true;
let pastPlan: StudyBlock[] = [];
try {
  pastPlan = generatePlan({ ...course, examDate: "2026-06-01" }, "2026-06-08");
} catch {
  pastOk = false;
}
check("generatePlan(exam in the past) does not throw", pastOk);
check("generatePlan(exam in the past) yields empty plan", pastPlan.length === 0);

// ---- Overlapping exams: many courses, all deadlines on the SAME day -------
// At the pure-engine layer each course is planned independently. Planning a
// batch of courses that all share one exam date must remain stable: every
// course still gets a sane, bounded, fully-covering plan (nothing dropped,
// nothing over-budget), regardless of how the deadlines collide.
const SHARED_EXAM = "2026-07-31";
const overlapping: Course[] = Array.from({ length: 12 }, (_, i) => ({
  id: `oc${i}`,
  name: `Course ${i}`,
  examDate: SHARED_EXAM,
  studyDays: [1, 2, 3, 4, 5],
  minutesPerDay: 120,
  topics: [
    { id: `oc${i}-a`, title: `C${i} TopicA`, effort: 1 + (i % 3), done: false },
    { id: `oc${i}-b`, title: `C${i} TopicB`, effort: 2, done: false },
  ],
}));

let overlapOk = true;
let overlapAllSane = true;
let overlapAllCovered = true;
try {
  for (const c of overlapping) {
    const r = planForDeadline(c, "2026-06-08");
    if (!r.blocks.every((b) => blockIsSane(b))) overlapAllSane = false;
    // every pending topic of this course is represented somewhere in its plan
    const seen = new Set(r.blocks.map((b) => b.topicId));
    if (!c.topics.every((t) => seen.has(t.id))) overlapAllCovered = false;
    if (!Number.isFinite(r.minutesPerDay) || r.minutesPerDay < 0) overlapAllSane = false;
  }
} catch {
  overlapOk = false;
}
check("overlapping exams: planning every course does not throw", overlapOk);
check("overlapping exams: all blocks are well-formed/bounded", overlapAllSane);
check("overlapping exams: every topic still covered per course", overlapAllCovered);

// Two distinct courses with the SAME exam date and SAME work get the SAME pace
// (the engine is deterministic and per-course — no cross-talk from collisions).
const twinA = planForDeadline({ ...overlapping[0], id: "twinA" }, "2026-06-08");
const twinB = planForDeadline({ ...overlapping[0], id: "twinB" }, "2026-06-08");
check("overlapping exams: identical courses get identical pace", twinA.minutesPerDay === twinB.minutesPerDay);

// ---- Very large load: many courses, many topics, many sessions ------------
// A heavy student: 40 courses × 25 topics. The engine must finish quickly,
// without crashing, and never emit a malformed or unbounded block.
const BIG_DAILY = 240;
const bigCourses: Course[] = Array.from({ length: 40 }, (_, ci) => ({
  id: `big${ci}`,
  name: `Big ${ci}`,
  examDate: "2027-06-01", // far out, lots of runway
  studyDays: [0, 1, 2, 3, 4, 5, 6], // study every day
  minutesPerDay: BIG_DAILY,
  topics: Array.from({ length: 25 }, (_, ti) => ({
    id: `big${ci}-t${ti}`,
    title: `B${ci} T${ti}`,
    effort: 1 + (ti % 5),
    done: false,
  })),
}));

const tStart = Date.now();
let bigOk = true;
let bigTotalBlocks = 0;
let bigAllSane = true;
let bigAllCovered = true;
try {
  for (const c of bigCourses) {
    const r = planForDeadline(c, "2026-06-08");
    bigTotalBlocks += r.blocks.length;
    if (!r.blocks.every((b) => blockIsSane(b))) bigAllSane = false;
    const seen = new Set(r.blocks.map((b) => b.topicId));
    if (!c.topics.every((t) => seen.has(t.id))) bigAllCovered = false;
  }
} catch {
  bigOk = false;
}
const bigElapsedMs = Date.now() - tStart;
check("large load: planning 40×25 does not throw", bigOk);
check("large load: produced a non-trivial number of blocks", bigTotalBlocks > 0);
check("large load: all blocks well-formed/bounded", bigAllSane);
check("large load: every topic covered across all courses", bigAllCovered);
// Pure, in-memory work over ~1000 topics should be near-instant. Generous bound
// guards against accidental O(n²)/runaway regressions without being flaky.
check(`large load: completes promptly (${bigElapsedMs}ms < 5000ms)`, bigElapsedMs < 5000);

// Single course with a HUGE pile of work crammed into a short window: the plan
// must stay finite/bounded and the engine must flag it intense rather than melt.
const crammed: Course = {
  id: "crammed",
  name: "Crammed",
  examDate: "2026-06-15", // ~1 week of study days
  studyDays: [1, 2, 3, 4, 5],
  minutesPerDay: 120,
  topics: Array.from({ length: 200 }, (_, i) => ({
    id: `cr-t${i}`,
    title: `Cram ${i}`,
    effort: 5,
    done: false,
  })),
};
let cramOk = true;
let cram = { blocks: [] as StudyBlock[], minutesPerDay: 0, intense: false };
try {
  cram = planForDeadline(crammed, "2026-06-08");
} catch {
  cramOk = false;
}
check("large load: crammed course does not throw", cramOk);
check("large load: crammed plan blocks all well-formed", cram.blocks.every((b) => blockIsSane(b)));
check(
  "large load: crammed pace is finite and bounded above zero",
  Number.isFinite(cram.minutesPerDay) && cram.minutesPerDay > 0,
);
check("large load: crammed course flagged intense", cram.intense === true && cram.minutesPerDay > INTENSE_MINUTES_PER_DAY);
check("large load: crammed course still covers every topic", new Set(cram.blocks.map((b) => b.topicId)).size === 200);

// ---- Degenerate topic data: zero/negative effort, empty topic set ---------
// Topics with no real effort shouldn't crash distribution or produce junk.
const zeroEffort: Course = {
  ...course,
  topics: [
    { id: "z1", title: "Zero", effort: 0, done: false },
    { id: "z2", title: "Negative", effort: -3, done: false },
  ],
};
let zeroEffortOk = true;
let zeroEffortPlan = { blocks: [] as StudyBlock[], minutesPerDay: 0, intense: false };
try {
  zeroEffortPlan = planForDeadline(zeroEffort, "2026-06-08");
} catch {
  zeroEffortOk = false;
}
check("zero/negative effort topics do not throw", zeroEffortOk);
check("zero/negative effort -> nothing to schedule", zeroEffortPlan.blocks.length === 0);
check(
  "zero/negative effort -> pace 0, not intense",
  zeroEffortPlan.minutesPerDay === 0 && zeroEffortPlan.intense === false,
);

// A course with no topics at all is a no-op, not a crash.
let noTopicsOk = true;
let noTopicsPlan: StudyBlock[] = [];
try {
  noTopicsPlan = generatePlan({ ...course, topics: [] }, "2026-06-08");
} catch {
  noTopicsOk = false;
}
check("no-topics course does not throw", noTopicsOk);
check("no-topics course yields empty plan", noTopicsPlan.length === 0);

// ===========================================================================
// EDGE CASES, round 2 — STAGGERED overlapping exams, the zero-day boundary,
// large-scale review generation, and degenerate completion folding. Same
// contract as above: never throw, never emit malformed/unbounded blocks, and
// stay bounded. Behaviour-only; no engine changes required.
// ===========================================================================

// ---- STAGGERED overlapping exam windows -----------------------------------
// The earlier overlapping test shares ONE exam date. The realistic case is a
// cluster of exams whose study windows OVERLAP but whose deadlines DIFFER (exam
// season). Each course is planned independently, so a nearer deadline must yield
// a stricter (>=) pace than a later one, and every course stays sane/covering.
const seasonBase: Omit<Course, "id" | "examDate"> = {
  name: "Season",
  studyDays: [1, 2, 3, 4, 5],
  minutesPerDay: 120,
  topics: [
    { id: "sa", title: "Topic A", effort: 2, done: false },
    { id: "sb", title: "Topic B", effort: 3, done: false },
  ],
};
// Windows overlap (all start "now") but deadlines stagger across two weeks.
const staggered: Course[] = [
  { ...seasonBase, id: "exam-early", examDate: "2026-06-15", topics: seasonBase.topics.map((t) => ({ ...t })) },
  { ...seasonBase, id: "exam-mid", examDate: "2026-06-22", topics: seasonBase.topics.map((t) => ({ ...t })) },
  { ...seasonBase, id: "exam-late", examDate: "2026-06-29", topics: seasonBase.topics.map((t) => ({ ...t })) },
];
let staggeredOk = true;
const staggeredPaces: number[] = [];
let staggeredAllSane = true;
let staggeredAllCovered = true;
try {
  for (const c of staggered) {
    const r = planForDeadline(c, "2026-06-08");
    staggeredPaces.push(r.minutesPerDay);
    if (!r.blocks.every((b) => blockIsSane(b))) staggeredAllSane = false;
    const seen = new Set(r.blocks.map((b) => b.topicId));
    if (!c.topics.every((t) => seen.has(t.id))) staggeredAllCovered = false;
  }
} catch {
  staggeredOk = false;
}
check("staggered exams: planning every course does not throw", staggeredOk);
check("staggered exams: all blocks well-formed/bounded", staggeredAllSane);
check("staggered exams: every topic covered per course", staggeredAllCovered);
// Earlier deadline => fewer study days for the same work => stricter-or-equal pace.
check(
  "staggered exams: nearer deadline never gets an easier pace",
  staggeredPaces[0] >= staggeredPaces[1] && staggeredPaces[1] >= staggeredPaces[2],
);

// ---- Zero available study days BEFORE an exam (window exists, weekdays don't)
// The window [today, exam) is non-empty, but the course studies on weekdays the
// window never contains (e.g. exam is the very next day, a Sunday, and the
// student only studies Saturdays). studyDatesBetween must return [] and every
// entry point must degrade exactly like the empty-window case.
// 2026-06-08 is a Monday; 2026-06-13 is the following Saturday.
const sundayOnlyDates = studyDatesBetween("2026-06-08", "2026-06-13", [0]); // only Sundays in Mon..Fri span
check("window with no matching weekday yields zero study dates", sundayOnlyDates.length === 0);

const noMatchingDay: Course = {
  ...course,
  examDate: "2026-06-13",
  studyDays: [0], // studies only Sundays, but no Sunday falls in the window
};
let noDayGenOk = true;
let noDayGen: StudyBlock[] = [];
let noDayPfd = { blocks: [] as StudyBlock[], minutesPerDay: -1, intense: false };
let noDayHeal = { blocks: [] as StudyBlock[], isOverloaded: false };
try {
  noDayGen = generatePlan(noMatchingDay, "2026-06-08");
  noDayPfd = planForDeadline(noMatchingDay, "2026-06-08");
  noDayHeal = healPlan(noMatchingDay, "2026-06-08");
} catch {
  noDayGenOk = false;
}
check("no-matching-study-day: nothing throws", noDayGenOk);
check("no-matching-study-day: generatePlan yields empty plan", noDayGen.length === 0);
check("no-matching-study-day: planForDeadline schedules nothing", noDayPfd.blocks.length === 0);
check(
  "no-matching-study-day: pace is finite and non-negative",
  Number.isFinite(noDayPfd.minutesPerDay) && noDayPfd.minutesPerDay >= 0,
);
check("no-matching-study-day: unschedulable work flagged intense", noDayPfd.intense === true);
check("no-matching-study-day: healPlan empty + overloaded", noDayHeal.blocks.length === 0 && noDayHeal.isOverloaded === true);

// Empty studyDays list (student picked no study days at all) behaves the same.
const noStudyDays: Course = { ...course, studyDays: [] };
let emptyDaysOk = true;
let emptyDaysPlan: StudyBlock[] = [];
try {
  emptyDaysPlan = generatePlan(noStudyDays, "2026-05-01");
} catch {
  emptyDaysOk = false;
}
check("empty studyDays list does not throw", emptyDaysOk);
check("empty studyDays list yields empty plan", emptyDaysPlan.length === 0);

// ---- healPlan overload boundary -------------------------------------------
// Overload is judged against the MIN-viable floor, not the (always-fitting)
// spread. Construct work that sits just under and just over the floor for the
// SAME runway, and confirm the flag flips at the boundary as expected.
const overloadDates = studyDatesBetween("2026-06-08", "2026-06-15", [1, 2, 3, 4, 5]); // Mon..Fri
const runwayDays = overloadDates.length;
const dailyCap = 120;
const capacity = runwayDays * dailyCap;
// effort such that effort * MIN_MINUTES_PER_EFFORT is just under capacity.
const underEffort = Math.floor(capacity / MIN_MINUTES_PER_EFFORT) - 1;
const overEffort = Math.ceil(capacity / MIN_MINUTES_PER_EFFORT) + 1;
const underCourse: Course = {
  ...course,
  examDate: "2026-06-15",
  minutesPerDay: dailyCap,
  topics: [{ id: "u", title: "Under", effort: underEffort, done: false }],
};
const overCourse: Course = {
  ...course,
  examDate: "2026-06-15",
  minutesPerDay: dailyCap,
  topics: [{ id: "o", title: "Over", effort: overEffort, done: false }],
};
check("healPlan: work under the floor is NOT overloaded", healPlan(underCourse, "2026-06-08").isOverloaded === false);
check("healPlan: work over the floor IS overloaded", healPlan(overCourse, "2026-06-08").isOverloaded === true);

// ---- Large-scale spaced-review generation ---------------------------------
// buildReviewBlocks runs over the full study plan; at large scale it must stay
// bounded (<= 3 reviews per topic), well-formed, and prompt.
const bigStudyDates = studyDatesBetween("2026-06-08", "2027-06-08", [0, 1, 2, 3, 4, 5, 6]); // a full year, every day
const reviewCourse: Course = {
  id: "review-big",
  name: "Review Big",
  examDate: "2027-06-08",
  studyDays: [0, 1, 2, 3, 4, 5, 6],
  minutesPerDay: 240,
  topics: Array.from({ length: 300 }, (_, i) => ({
    id: `rt${i}`,
    title: `Review Topic ${i}`,
    effort: 2,
    done: false,
  })),
};
// Use the public generatePlan to produce the study set (it drives the same
// distribute() the engine uses), then exercise review generation over it.
const bigStudyBlocks = generatePlan(reviewCourse, "2026-06-08");
const tRev = Date.now();
let revOk = true;
let reviews: StudyBlock[] = [];
try {
  reviews = buildReviewBlocks(bigStudyBlocks, bigStudyDates);
} catch {
  revOk = false;
}
const revElapsed = Date.now() - tRev;
check("large reviews: buildReviewBlocks does not throw", revOk);
check("large reviews: all review blocks well-formed", reviews.every((b) => blockIsSane(b) && b.kind === "review"));
// At most 3 review sessions per distinct topic (intervals 1/3/7).
const reviewsByTopic = new Map<string, number>();
for (const r of reviews) reviewsByTopic.set(r.topicId, (reviewsByTopic.get(r.topicId) ?? 0) + 1);
check("large reviews: never more than 3 reviews per topic", [...reviewsByTopic.values()].every((n) => n <= 3));
check(`large reviews: completes promptly (${revElapsed}ms < 5000ms)`, revElapsed < 5000);

// ---- applyCompletedWork: degenerate / adversarial completion data ---------
// Folding must never produce NaN/negative/over-100% effort even when callers
// pass junk (over-completion, zero planned, negative numbers, missing topics).
const foldBase: Course = {
  ...course,
  topics: [
    { id: "f1", title: "F1", effort: 4, done: false },
    { id: "f2", title: "F2", effort: 2, done: false },
  ],
};
// Over-completion: done > planned must clamp to done (drop out), not go negative.
const over = applyCompletedWork(foldBase, { f1: 500 }, { f1: 100 });
const overF1 = over.topics.find((t) => t.id === "f1")!;
check("fold: over-completion marks topic done (no negative effort)", overF1.done === true);
check("fold: over-completed topics never carry negative effort", over.topics.every((t) => t.effort >= 0));
// Zero planned minutes: can't compute a fraction -> leave the topic untouched.
const zeroPlanned = applyCompletedWork(foldBase, { f1: 50 }, { f1: 0 });
check("fold: zero planned minutes leaves effort unchanged", zeroPlanned.topics.find((t) => t.id === "f1")!.effort === 4);
// Completion for a topic that isn't in the course is simply ignored.
let ghostOk = true;
try {
  applyCompletedWork(foldBase, { ghost: 90 }, { ghost: 120 });
} catch {
  ghostOk = false;
}
check("fold: completion for an unknown topic does not throw", ghostOk);
// All efforts stay finite and non-negative across a messy fold.
const messyFold = applyCompletedWork(foldBase, { f1: 30, f2: -10 }, { f1: 120, f2: 90 });
check(
  "fold: messy completion still yields finite, non-negative efforts",
  messyFold.topics.every((t) => Number.isFinite(t.effort) && t.effort >= 0),
);

// ===========================================================================
// NULL / UNDEFINED DEFENSIVE HANDLING — the DB columns are typed non-null, but
// real drift (legacy rows, partial migrations, hand-edited data) and direct
// callers can hand the pure engine null/undefined collections and fields. Every
// entry point must stay TOTAL: never throw, never emit NaN/negative minutes, and
// degrade exactly like the corresponding empty input. We deliberately cast past
// the types here to simulate that drift. Behaviour-only; matches the contract
// above (blockIsSane).
// ===========================================================================

/** Cast helper: feed a deliberately malformed value past the static types. */
const bad = <T>(v: unknown): T => v as T;

// ---- studyDatesBetween: null/undefined studyDays --------------------------
let sdbNullOk = true;
let sdbNull: string[] = ["x"];
let sdbUndef: string[] = ["x"];
try {
  sdbNull = studyDatesBetween("2026-06-08", "2026-06-20", bad(null));
  sdbUndef = studyDatesBetween("2026-06-08", "2026-06-20", bad(undefined));
} catch {
  sdbNullOk = false;
}
check("studyDatesBetween(null studyDays) does not throw", sdbNullOk);
check("studyDatesBetween(null studyDays) yields no dates", sdbNull.length === 0);
check("studyDatesBetween(undefined studyDays) yields no dates", sdbUndef.length === 0);

// Invalid/missing date strings produce no dates rather than throwing.
let sdbBadDateOk = true;
let sdbBadDate: string[] = ["x"];
try {
  sdbBadDate = studyDatesBetween(bad(null), bad(undefined), [1, 2, 3, 4, 5]);
} catch {
  sdbBadDateOk = false;
}
check("studyDatesBetween(null dates) does not throw", sdbBadDateOk);
check("studyDatesBetween(null dates) yields no dates", sdbBadDate.length === 0);

// ---- generatePlan: null topics / null studyDays / null minutesPerDay ------
let genNullTopicsOk = true;
let genNullTopics: StudyBlock[] = [bad(0)];
try {
  genNullTopics = generatePlan(bad({ ...course, topics: null }), "2026-06-06");
} catch {
  genNullTopicsOk = false;
}
check("generatePlan(null topics) does not throw", genNullTopicsOk);
check("generatePlan(null topics) yields empty plan", genNullTopics.length === 0);

let genNullDaysOk = true;
let genNullDays: StudyBlock[] = [bad(0)];
try {
  genNullDays = generatePlan(bad({ ...course, studyDays: null }), "2026-06-06");
} catch {
  genNullDaysOk = false;
}
check("generatePlan(null studyDays) does not throw", genNullDaysOk);
check("generatePlan(null studyDays) yields empty plan", genNullDays.length === 0);

let genNullMpdOk = true;
let genNullMpd: StudyBlock[] = [bad(0)];
try {
  genNullMpd = generatePlan(bad({ ...course, minutesPerDay: null }), "2026-06-06");
} catch {
  genNullMpdOk = false;
}
check("generatePlan(null minutesPerDay) does not throw", genNullMpdOk);
check("generatePlan(null minutesPerDay) yields empty plan", genNullMpd.length === 0);

// ---- A topic with null/undefined/NaN effort must not poison the plan -------
// One real topic + junk-effort topics: the engine schedules the real work and
// the junk contributes 0 effort, never a NaN/negative block.
const junkEffort = bad<Course>({
  ...course,
  topics: [
    { id: "real", title: "Real", effort: 2, done: false },
    { id: "ne", title: "NullEffort", effort: null, done: false },
    { id: "ue", title: "UndefEffort", effort: undefined, done: false },
    { id: "nan", title: "NaNEffort", effort: NaN, done: false },
  ],
});
let junkOk = true;
let junkPlan = { blocks: [] as StudyBlock[], minutesPerDay: -1, intense: false };
try {
  junkPlan = planForDeadline(junkEffort, "2026-06-06");
} catch {
  junkOk = false;
}
check("planForDeadline(junk-effort topics) does not throw", junkOk);
check("planForDeadline(junk-effort topics) emits only well-formed blocks", junkPlan.blocks.every((b) => blockIsSane(b)));
check(
  "planForDeadline(junk-effort topics) pace is finite and non-negative",
  Number.isFinite(junkPlan.minutesPerDay) && junkPlan.minutesPerDay >= 0,
);
// The real topic still gets scheduled; the junk topics contribute nothing bad.
check("planForDeadline(junk-effort topics) still schedules the real topic", junkPlan.blocks.some((b) => b.topicId === "real"));

// ---- planForDeadline / healPlan with null topics --------------------------
let pfdNullOk = true;
let pfdNull = { blocks: [bad<StudyBlock>(0)], minutesPerDay: -1, intense: true };
try {
  pfdNull = planForDeadline(bad({ ...course, topics: null }), "2026-06-06");
} catch {
  pfdNullOk = false;
}
check("planForDeadline(null topics) does not throw", pfdNullOk);
check("planForDeadline(null topics) schedules nothing", pfdNull.blocks.length === 0);
check(
  "planForDeadline(null topics) pace 0, not intense",
  pfdNull.minutesPerDay === 0 && pfdNull.intense === false,
);

let healNullOk = true;
let healNull = { blocks: [bad<StudyBlock>(0)], isOverloaded: true };
try {
  healNull = healPlan(bad({ ...course, topics: null }), "2026-06-06");
} catch {
  healNullOk = false;
}
check("healPlan(null topics) does not throw", healNullOk);
check("healPlan(null topics) empty plan, not overloaded (no pending work)", healNull.blocks.length === 0 && healNull.isOverloaded === false);

// ---- applyCompletedWork: null record args / null topics -------------------
let acwNullOk = true;
let acwNull: Course = bad(null);
try {
  acwNull = applyCompletedWork(course, bad(null), bad(undefined));
} catch {
  acwNullOk = false;
}
check("applyCompletedWork(null records) does not throw", acwNullOk);
check(
  "applyCompletedWork(null records) leaves efforts unchanged",
  acwNull.topics.every((t, i) => t.effort === course.topics[i].effort),
);

let acwNullTopicsOk = true;
let acwNullTopics: Course = bad({ topics: [bad(0)] });
try {
  acwNullTopics = applyCompletedWork(bad({ ...course, topics: null }), { t1: 60 }, { t1: 120 });
} catch {
  acwNullTopicsOk = false;
}
check("applyCompletedWork(null topics) does not throw", acwNullTopicsOk);
check("applyCompletedWork(null topics) yields empty topic list", Array.isArray(acwNullTopics.topics) && acwNullTopics.topics.length === 0);

// NaN values inside the record args are treated as absent (no NaN effort out).
const acwNaN = applyCompletedWork(course, bad({ t1: NaN }), bad({ t1: NaN }));
check(
  "applyCompletedWork(NaN records) keeps efforts finite and unchanged",
  acwNaN.topics.every((t, i) => Number.isFinite(t.effort) && t.effort === course.topics[i].effort),
);

// ---- buildReviewBlocks: null study set ------------------------------------
let brbNullOk = true;
let brbNull: StudyBlock[] = [bad(0)];
try {
  brbNull = buildReviewBlocks(bad(null), dates);
} catch {
  brbNullOk = false;
}
check("buildReviewBlocks(null study) does not throw", brbNullOk);
check("buildReviewBlocks(null study) yields no reviews", brbNull.length === 0);

// ---- Difficulty-weighted spaced review ------------------------------------
// A wide window of study days so EVERY interval (incl. easy's +10) lands on a
// real study day — keeps the test about counts, not calendar clipping.
const revDates = studyDatesBetween("2026-06-01", "2026-07-15", [0, 1, 2, 3, 4, 5, 6]);
// One study session per topic on the same day; difficulty is supplied per topic.
const revStudy: StudyBlock[] = [
  { date: "2026-06-01", topicId: "hardT", topicTitle: "Hard", minutes: 30, completed: true, kind: "study" },
  { date: "2026-06-01", topicId: "easyT", topicTitle: "Easy", minutes: 30, completed: true, kind: "study" },
  { date: "2026-06-01", topicId: "medT", topicTitle: "Med", minutes: 30, completed: true, kind: "study" },
  { date: "2026-06-01", topicId: "unratedT", topicTitle: "Unrated", minutes: 30, completed: true, kind: "study" },
];

const countFor = (revs: StudyBlock[], topicId: string) =>
  revs.filter((r) => r.topicId === topicId && r.kind === "review").length;

// Baseline (no ratings) == exactly the medium schedule, and matches the
// number of intervals — proving "unrated behaves like today" (no regression).
const baselineRev = buildReviewBlocks(revStudy, revDates);
check(
  "unrated review count == baseline [1,3,7] (no regression)",
  countFor(baselineRev, "unratedT") === REVIEW_INTERVALS_BY_DIFFICULTY.medium.length,
);

const weightedRev = buildReviewBlocks(revStudy, revDates, {
  hardT: "hard",
  easyT: "easy",
  medT: "medium",
  // unratedT intentionally omitted → falls back to baseline
});
const hardCount = countFor(weightedRev, "hardT");
const mediumCount = countFor(weightedRev, "medT");
const easyCount = countFor(weightedRev, "easyT");
const unratedCount = countFor(weightedRev, "unratedT");

check("hard topic gets MORE reviews than medium", hardCount > mediumCount);
check("hard topic gets MORE reviews than easy", hardCount > easyCount);
check("easy topic gets FEWER reviews than medium", easyCount < mediumCount);
check("easy topic gets FEWER reviews than hard", easyCount < hardCount);
check(
  "hard count == hard interval count (4)",
  hardCount === REVIEW_INTERVALS_BY_DIFFICULTY.hard.length,
);
check(
  "easy count == easy interval count (2)",
  easyCount === REVIEW_INTERVALS_BY_DIFFICULTY.easy.length,
);
check(
  "explicit medium == baseline medium",
  mediumCount === REVIEW_INTERVALS_BY_DIFFICULTY.medium.length,
);
check(
  "unrated (omitted from map) still == baseline medium",
  unratedCount === REVIEW_INTERVALS_BY_DIFFICULTY.medium.length,
);

// Hard's FIRST review must land no later than medium's — "earlier" review, the
// other half of the difficulty lever (first interval 1 vs 1, but second 2 vs 3).
const firstReviewDate = (revs: StudyBlock[], topicId: string) =>
  revs
    .filter((r) => r.topicId === topicId && r.kind === "review")
    .map((r) => r.date)
    .sort()[0];
const hardDates = weightedRev
  .filter((r) => r.topicId === "hardT")
  .map((r) => r.date)
  .sort();
const medDates = weightedRev
  .filter((r) => r.topicId === "medT")
  .map((r) => r.date)
  .sort();
check(
  "hard's first review is on/before medium's first",
  (firstReviewDate(weightedRev, "hardT") ?? "9") <= (firstReviewDate(weightedRev, "medT") ?? "0"),
);
// The hard schedule is strictly tighter from the 2nd touch on: hard's 2nd review
// (+2) precedes medium's 2nd (+3).
check(
  "hard's second review is earlier than medium's second",
  !!hardDates[1] && !!medDates[1] && hardDates[1] < medDates[1],
);

// Passing an empty difficulty map reproduces the baseline byte-for-byte.
const emptyMapRev = buildReviewBlocks(revStudy, revDates, {});
check(
  "empty difficulty map == baseline (deep-equal)",
  JSON.stringify(emptyMapRev) === JSON.stringify(baselineRev),
);

// ===========================================================================
// PLANNER INVARIANTS (P1) — the load-bearing promises the whole product rests
// on. Unlike the edge-case probes above (which assert "doesn't crash on junk"),
// these assert the engine's CORE CONTRACT over a spread of realistic courses:
// 1. never schedule on/after the exam date — impossibility surfaces as the
//    `intense`/`isOverloaded` flag, NOT as work placed past the deadline;
// 2. no duplicate REVIEW blocks (one recall per topic per day) and no
//    zero/negative-minute blocks anywhere;
// 3. completing work only ever REDUCES the minutes left to schedule;
// 4. low-priority (low-effort) work can slide — it earns less time and yields
//    to heavier work, but is NEVER silently dropped;
// 5. a "behind" course yields a SAFE, non-empty fallback plan (work piled,
//    visibly flagged) — never an empty or crashing schedule;
// 6. the study window is respected — every block lands on an allowed study day
//    inside [today, exam).
// Every check runs across the fixture matrix so the contract holds broadly, not
// just for one hand-picked course. Any failure here is a real engine bug to fix.
// ===========================================================================

const wd = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();
const TODAY = "2026-06-08"; // a Monday

/** A spread of realistic courses: roomy, tight, weekend-only, hard, many-topic. */
const invariantFixtures: { label: string; course: Course }[] = [
  {
    label: "roomy weekday course",
    course: {
      id: "inv-roomy", name: "Roomy", examDate: "2026-07-15",
      studyDays: [1, 2, 3, 4, 5], minutesPerDay: 120,
      topics: [
        { id: "a", title: "A", effort: 5, done: false },
        { id: "b", title: "B", effort: 1, done: false },
        { id: "c", title: "C", effort: 3, done: false },
      ],
    },
  },
  {
    label: "tight one-week course",
    course: {
      id: "inv-tight", name: "Tight", examDate: "2026-06-15",
      studyDays: [1, 2, 3, 4, 5], minutesPerDay: 120,
      topics: [
        { id: "a", title: "A", effort: 4, done: false },
        { id: "b", title: "B", effort: 2, done: false },
      ],
    },
  },
  {
    label: "weekend-only course",
    course: {
      id: "inv-weekend", name: "Weekend", examDate: "2026-07-20",
      studyDays: [0, 6], minutesPerDay: 180,
      topics: [
        { id: "a", title: "A", effort: 3, done: false },
        { id: "b", title: "B", effort: 3, done: false },
      ],
    },
  },
  {
    label: "hard (difficulty 5) tight course",
    course: {
      id: "inv-hard", name: "Hard", examDate: "2026-06-19", difficulty: 5,
      studyDays: [1, 2, 3, 4, 5], minutesPerDay: 120,
      topics: [
        { id: "a", title: "A", effort: 2, done: false },
        { id: "b", title: "B", effort: 2, done: false },
      ],
    },
  },
  {
    label: "many-topic course",
    course: {
      id: "inv-many", name: "Many", examDate: "2026-08-01",
      studyDays: [1, 2, 3, 4, 5], minutesPerDay: 150,
      topics: Array.from({ length: 9 }, (_, i) => ({
        id: `t${i}`, title: `T${i}`, effort: 1 + (i % 4), done: false,
      })),
    },
  },
];

// --- Invariant 1: nothing is ever scheduled on or after the exam date. ------
let inv1Ok = true;
for (const { course } of invariantFixtures) {
  const blocks = [
    ...generatePlan(course, TODAY),
    ...planForDeadline(course, TODAY).blocks,
    ...healPlan(course, TODAY).blocks,
  ];
  if (blocks.some((b) => b.date >= course.examDate)) inv1Ok = false;
}
check("INV1: no block is ever scheduled on/after the exam date", inv1Ok);

// Even a hopelessly overloaded course keeps every block before the exam — the
// impossibility shows up as the flag, never as work placed past the deadline.
const inv1Overloaded: Course = {
  id: "inv-over", name: "Over", examDate: "2026-06-15",
  studyDays: [1, 2, 3, 4, 5], minutesPerDay: 120,
  topics: Array.from({ length: 40 }, (_, i) => ({ id: `o${i}`, title: `O${i}`, effort: 5, done: false })),
};
const inv1OverPfd = planForDeadline(inv1Overloaded, TODAY);
const inv1OverHeal = healPlan(inv1Overloaded, TODAY);
check(
  "INV1: overloaded course still places no block past the exam",
  inv1OverPfd.blocks.every((b) => b.date < inv1Overloaded.examDate) &&
    inv1OverHeal.blocks.every((b) => b.date < inv1Overloaded.examDate),
);
check(
  "INV1: impossibility surfaces as the flag, not as work past the deadline",
  inv1OverPfd.intense === true && inv1OverHeal.isOverloaded === true,
);

// --- Invariant 2: no duplicate reviews; no zero/negative-minute blocks. ------
// Study sessions legitimately repeat (a topic can earn two 30-min sittings in a
// day — that's interleaving, not a duplicate). The dedup contract is on REVIEWS:
// at most one recall of a given topic per day. And NO block — study or review —
// may carry non-positive minutes.
let inv2DupReview = false;
let inv2BadMinutes = false;
for (const { course } of invariantFixtures) {
  const { blocks } = planForDeadline(course, TODAY);
  if (blocks.some((b) => !(b.minutes > 0) || !Number.isFinite(b.minutes))) inv2BadMinutes = true;
  const reviews = blocks.filter((b) => b.kind === "review");
  const keys = new Set(reviews.map((r) => `${r.date}|${r.topicId}`));
  if (keys.size !== reviews.length) inv2DupReview = true;
}
check("INV2: never two reviews of the same topic on the same day", !inv2DupReview);
check("INV2: every block carries positive, finite minutes", !inv2BadMinutes);

// --- Invariant 3: completing work only reduces the minutes left to schedule. -
// For each fixture, heal once with nothing done, then again after crediting a
// chunk of every topic. The total scheduled minutes must never INCREASE, and it
// must strictly DROP whenever there was schedulable work to begin with.
let inv3Ok = true;
const sumMinutes = (bl: StudyBlock[]) => bl.reduce((s, b) => s + b.minutes, 0);
for (const { course } of invariantFixtures) {
  const before = healPlan(course, TODAY);
  const credited = Object.fromEntries(course.topics.map((t) => [t.id, 60]));
  const after = healPlan(course, TODAY, credited);
  const beforeMin = sumMinutes(before.blocks);
  const afterMin = sumMinutes(after.blocks);
  if (afterMin > beforeMin) inv3Ok = false;
  if (beforeMin > 0 && afterMin >= beforeMin) inv3Ok = false;
}
check("INV3: completing work never increases remaining scheduled minutes", inv3Ok);
check(
  "INV3: completing work strictly reduces remaining work when work existed",
  inv3Ok,
);

// --- Invariant 4: low-priority (low-effort) work slides but is never dropped. -
// A heavy topic next to a light one: the light topic must earn STRICTLY LESS
// time, yet still appear in the plan — both on a roomy runway and under overload
// (falling behind reshapes the split, it never silently deletes a topic).
const minutesOfTopic = (bl: StudyBlock[], id: string) =>
  bl.filter((b) => b.topicId === id).reduce((s, b) => s + b.minutes, 0);
const slideCourse = (examDate: string): Course => ({
  id: "inv-slide", name: "Slide", examDate,
  studyDays: [1, 2, 3, 4, 5], minutesPerDay: 120,
  topics: [
    { id: "heavy", title: "Heavy", effort: 5, done: false },
    { id: "light", title: "Light", effort: 1, done: false },
  ],
});
const roomySlide = healPlan(slideCourse("2026-07-15"), TODAY);
const tightSlide = healPlan(slideCourse("2026-06-12"), TODAY);
check(
  "INV4: low-effort work earns strictly less time than heavy work",
  minutesOfTopic(roomySlide.blocks, "light") < minutesOfTopic(roomySlide.blocks, "heavy"),
);
check(
  "INV4: low-effort work is never dropped (roomy runway)",
  roomySlide.blocks.some((b) => b.topicId === "light"),
);
check(
  "INV4: low-effort work is never dropped even under overload",
  tightSlide.blocks.some((b) => b.topicId === "light") &&
    tightSlide.blocks.some((b) => b.topicId === "heavy"),
);

// --- Invariant 5: a "behind" course yields a safe, non-empty fallback. -------
// With real study days left but far more work than fits, the engine must still
// return a plan with blocks (the overflow is piled + flagged), never an empty or
// throwing schedule, and the pace stays a finite number.
const behindCourse: Course = {
  id: "inv-behind", name: "Behind", examDate: "2026-06-15",
  studyDays: [1, 2, 3, 4, 5], minutesPerDay: 120,
  topics: Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, title: `B${i}`, effort: 5, done: false })),
};
const behindHeal = healPlan(behindCourse, TODAY);
const behindPfd = planForDeadline(behindCourse, TODAY);
check(
  "INV5: a behind course still produces a non-empty plan (heal)",
  behindHeal.blocks.length > 0 && behindHeal.isOverloaded === true,
);
check(
  "INV5: a behind course still produces a non-empty plan (planForDeadline)",
  behindPfd.blocks.length > 0 && behindPfd.intense === true,
);
check(
  "INV5: behind-course pace stays a finite, positive number",
  Number.isFinite(behindPfd.minutesPerDay) && behindPfd.minutesPerDay > 0,
);

// --- Invariant 6: the study window is respected. ----------------------------
// Every block must fall on an allowed study weekday AND inside [today, exam).
let inv6Ok = true;
for (const { course } of invariantFixtures) {
  const blocks = [
    ...generatePlan(course, TODAY),
    ...planForDeadline(course, TODAY).blocks,
    ...healPlan(course, TODAY).blocks,
  ];
  for (const b of blocks) {
    if (!course.studyDays.includes(wd(b.date))) inv6Ok = false;
    if (b.date < TODAY || b.date >= course.examDate) inv6Ok = false;
  }
}
check("INV6: every block lands on an allowed study day within [today, exam)", inv6Ok);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

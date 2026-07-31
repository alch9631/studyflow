/**
 * "Modul bestanden" — a passed course must actually BE done.
 *
 * Passing a module (an ungraded "bestanden", or a passing grade ≤ 4.0) has to
 * mean: no more scheduled work, no exam countdown pressure, no overload
 * nagging, LP counted as earned — while the study history stays. And it must be
 * reversible: clearing the result (or recording a failed 5.0 attempt) brings
 * the remaining work back, because a retake is coming.
 *
 * Runs the REAL scheduler against a throwaway test DB.
 * Run: npx tsx src/lib/passedCourse.test.ts
 */
import "./testDb"; // MUST be first: points ./db at the test DB before it loads.
import { prisma } from "./db";
import { rebuildSchedule, courseOverloadInfo, todayISO } from "./planService";
import { coursePassed, PASSING_GRADE_MAX } from "./coursePassed";
import { attentionList, gradeSummary, type CourseStats } from "./stats";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function dayFromToday(n: number): Date {
  const d = new Date(todayISO() + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

async function openMinutes(courseId: string) {
  const blocks = await prisma.studyBlock.findMany({
    where: { courseId, completed: false },
    select: { minutes: true },
  });
  return blocks.reduce((s, b) => s + b.minutes, 0);
}

async function main() {
  console.log("\n=== coursePassed (pure) ===\n");
  check("bestanden without a grade passes", coursePassed({ grade: null, passed: true }));
  check("a passing grade passes", coursePassed({ grade: 2.3, passed: false }));
  check("the 4.0 boundary passes", coursePassed({ grade: PASSING_GRADE_MAX, passed: false }));
  check("a failed attempt (5.0) does NOT pass", !coursePassed({ grade: 5.0, passed: false }));
  check("no result does not pass", !coursePassed({ grade: null, passed: false }));
  check("bestanden overrides a failing grade on record", coursePassed({ grade: 5.0, passed: true }));
  check("NaN grade does not pass", !coursePassed({ grade: NaN, passed: false }));
  check("null-ish flags do not pass", !coursePassed({ grade: null, passed: null }));

  console.log("\n=== scheduler behaviour ===\n");

  const user = await prisma.user.create({
    data: { email: `pass+${Date.now()}@studyflow.local`, name: "Passer" },
  });
  const course = await prisma.course.create({
    data: {
      name: "Unbenotet",
      userId: user.id,
      examDate: dayFromToday(21),
      studyDays: "0,1,2,3,4,5,6",
      topics: {
        create: [
          { title: "A", effort: 2, order: 0 },
          { title: "B", effort: 2, order: 1 },
        ],
      },
    },
    include: { topics: true },
  });
  // A second, untouched course to prove passing one never disturbs the other.
  const other = await prisma.course.create({
    data: {
      name: "Weiter",
      userId: user.id,
      examDate: dayFromToday(28),
      studyDays: "0,1,2,3,4,5,6",
      topics: { create: [{ title: "X", effort: 2, order: 0 }] },
    },
  });

  await rebuildSchedule(user.id);
  const before = await openMinutes(course.id);
  check("un-passed course gets a plan", before > 0, `open=${before}`);

  // Student completes one session, then passes the module (bestanden).
  const one = await prisma.studyBlock.findFirst({
    where: { courseId: course.id, completed: false },
    orderBy: { date: "asc" },
  });
  if (one) await prisma.studyBlock.update({ where: { id: one.id }, data: { completed: true } });
  await prisma.course.update({ where: { id: course.id }, data: { passed: true } });
  await rebuildSchedule(user.id);

  check("passed course has NO open work left", (await openMinutes(course.id)) === 0);
  check(
    "the completed session survives as history",
    (await prisma.studyBlock.count({ where: { courseId: course.id, completed: true } })) === 1,
  );
  const row = await prisma.course.findUnique({
    where: { id: course.id },
    select: { intense: true },
  });
  check("a passed course is never flagged intense", row?.intense === false);
  const info = await courseOverloadInfo(course.id);
  check(
    "courseOverloadInfo reports nothing to fit for a passed course",
    info.overloaded === false && info.remainingMinutes === 0,
    JSON.stringify(info),
  );
  check("the other course keeps its plan", (await openMinutes(other.id)) > 0);

  // Reversal: result cleared (or a failed retake attempt) → the work comes back.
  await prisma.course.update({ where: { id: course.id }, data: { passed: false } });
  await rebuildSchedule(user.id);
  const revived = await openMinutes(course.id);
  check("clearing the result brings the remaining work back", revived > 0, `open=${revived}`);

  // A passing GRADE must behave exactly like bestanden.
  await prisma.course.update({ where: { id: course.id }, data: { grade: 3.7 } });
  await rebuildSchedule(user.id);
  check("a passing grade also empties the plan", (await openMinutes(course.id)) === 0);

  // A FAILED attempt (5.0) is not passed — the retake keeps its plan.
  await prisma.course.update({ where: { id: course.id }, data: { grade: 5.0 } });
  await rebuildSchedule(user.id);
  check("a 5.0 (failed attempt) keeps the course scheduled", (await openMinutes(course.id)) > 0);

  console.log("\n=== stats: LP earned ===\n");
  const statsCourses = [
    { id: "g", name: "Graded", grade: 1.7, passed: false, ects: 6, examDate: new Date(), intense: false, topics: [] },
    { id: "u", name: "Unbenotet", grade: null, passed: true, ects: 3, examDate: new Date(), intense: false, topics: [] },
    { id: "f", name: "Failed", grade: 5.0, passed: false, ects: 6, examDate: new Date(), intense: false, topics: [] },
    { id: "o", name: "Open", grade: null, passed: false, ects: 9, examDate: new Date(), intense: false, topics: [] },
  ];
  const g = gradeSummary(statsCourses);
  check("LP earned counts the graded pass AND the ungraded bestanden", g.lpEarned === 9, `lpEarned=${g.lpEarned}`);
  check("bestanden does not enter the Notenschnitt", g.gradedCount === 2 && g.gpa !== null && Math.abs(g.gpa - (1.7 * 6 + 5.0 * 6) / 12) < 1e-9);

  // ── "bestanden" and the exam grade are INDEPENDENT ────────────────────────
  // Completing a module is its own action: saving/clearing an exam grade must
  // never touch the flag, and marking a module complete must never touch the
  // grade. (They only share meaning via coursePassed: a passing grade counts.)
  {
    const u = await prisma.user.create({
      data: { email: `indep+${Date.now()}@studyflow.local`, name: "Indep" },
    });
    const c = await prisma.course.create({
      data: {
        name: "Unbenotet+Note",
        userId: u.id,
        examDate: dayFromToday(14),
        studyDays: "0,1,2,3,4,5,6",
        topics: { create: [{ title: "T", effort: 2, order: 0 }] },
      },
    });

    // Complete the module by hand (no grade anywhere).
    await prisma.course.update({ where: { id: c.id }, data: { passed: true } });
    let row = await prisma.course.findUniqueOrThrow({
      where: { id: c.id },
      select: { grade: true, passed: true },
    });
    check("marking complete leaves the grade untouched (null)", row.grade === null && row.passed === true);

    // Now record an exam grade — the completion flag must survive it.
    await prisma.course.update({ where: { id: c.id }, data: { grade: 2.3 } });
    row = await prisma.course.findUniqueOrThrow({
      where: { id: c.id },
      select: { grade: true, passed: true },
    });
    check("saving a grade does not clear the bestanden flag", row.passed === true && row.grade === 2.3);

    // And clearing the grade must NOT un-complete a hand-completed module.
    await prisma.course.update({ where: { id: c.id }, data: { grade: null } });
    row = await prisma.course.findUniqueOrThrow({
      where: { id: c.id },
      select: { grade: true, passed: true },
    });
    check("clearing the grade leaves the module complete", row.passed === true);
    check("a hand-completed module with no grade still counts as passed", coursePassed(row));

    await prisma.user.deleteMany({ where: { id: u.id } });
  }

  console.log("\n=== stats: needs-attention ===\n");
  // A passed module with unfinished-looking topics and a near exam must never be
  // nagged about — the student is done with it.
  const soon = dayFromToday(3);
  const courseStat = (over: Partial<CourseStats>): CourseStats => ({
    id: "c",
    name: "C",
    grade: null,
    passed: false,
    ects: 6,
    examDate: soon,
    intense: false,
    topicsTotal: 10,
    topicsDone: 2,
    progressPct: 20,
    plannedMinutes: 600,
    completedMinutes: 120,
    actualMinutes: 0,
    remainingStudyMinutes: 480,
    daysToExam: 3,
    pressurePerDay: 160,
    ...over,
  });
  const t0 = todayISO();
  check(
    "an open course with a near exam IS listed",
    attentionList([courseStat({ id: "open" })], t0).some((x) => x.id === "open"),
  );
  check(
    "a bestanden course is NOT listed",
    !attentionList([courseStat({ id: "p", passed: true })], t0).some((x) => x.id === "p"),
  );
  check(
    "a passing-grade course is NOT listed",
    !attentionList([courseStat({ id: "g", grade: 2.0 })], t0).some((x) => x.id === "g"),
  );
  check(
    "a failed attempt (5.0) IS still listed (retake ahead)",
    attentionList([courseStat({ id: "f", grade: 5.0 })], t0).some((x) => x.id === "f"),
  );

  await prisma.user.deleteMany({ where: { id: user.id } });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

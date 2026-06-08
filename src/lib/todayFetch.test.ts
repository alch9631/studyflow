/**
 * Behavior-equivalence test for the /today data-fetching refactor.
 *
 * The /today page used to issue four independent reads (today's study blocks,
 * the next exam, today's lectures, and upcoming deadlines) as a serial waterfall
 * of separate `await`s. The refactor collapses them into a single concurrent
 * `Promise.all` batch. This test proves the batched fetch returns byte-for-byte
 * the same data as the original sequential fetch against a seeded dataset, so the
 * page render is unchanged — only the wall-clock timing improves.
 *
 * Runs against the real SQLite dev DB (same style as scripts/smoke.ts).
 * Run: DATABASE_URL="file:./dev.db" npx tsx src/lib/todayFetch.test.ts
 */
import { prisma } from "./db";

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

// The exact query shapes the page uses. `seqFetch` mirrors the OLD code path
// (sequential awaits); `batchFetch` mirrors the NEW code path (Promise.all).
function blocksQuery(userId: string, start: Date, end: Date) {
  return prisma.studyBlock.findMany({
    where: { date: { gte: start, lt: end }, course: { userId } },
    include: { course: { select: { name: true, id: true } } },
    orderBy: [{ kind: "asc" }, { minutes: "desc" }],
  });
}
function examQuery(userId: string, start: Date) {
  return prisma.course.findFirst({
    where: { userId, examDate: { gte: start } },
    orderBy: { examDate: "asc" },
    select: { id: true, name: true, examDate: true },
  });
}
function lecturesQuery(userId: string, weekday: number) {
  return prisma.lecture.findMany({
    where: { userId, weekday },
    orderBy: { startMin: "asc" },
  });
}
function deadlinesQuery(userId: string, start: Date) {
  return prisma.assignment.findMany({
    where: {
      done: false,
      course: { userId },
      dueDate: { lt: new Date(start.getTime() + 14 * 86400_000) },
    },
    orderBy: { dueDate: "asc" },
    take: 6,
    include: { course: { select: { name: true, id: true } } },
  });
}

async function seqFetch(userId: string, start: Date, end: Date, weekday: number) {
  const blocks = await blocksQuery(userId, start, end);
  const nextExam = await examQuery(userId, start);
  const todaysLectures = await lecturesQuery(userId, weekday);
  const upcomingDeadlines = await deadlinesQuery(userId, start);
  return { blocks, nextExam, todaysLectures, upcomingDeadlines };
}

async function batchFetch(userId: string, start: Date, end: Date, weekday: number) {
  const [blocks, nextExam, todaysLectures, upcomingDeadlines] = await Promise.all([
    blocksQuery(userId, start, end),
    examQuery(userId, start),
    lecturesQuery(userId, weekday),
    deadlinesQuery(userId, start),
  ]);
  return { blocks, nextExam, todaysLectures, upcomingDeadlines };
}

async function main() {
  // Isolated user so the assertion is independent of whatever else is in dev.db.
  const user = await prisma.user.create({
    data: { email: `today-fetch-test+${Date.now()}@studyflow.local`, name: "FetchTest" },
  });
  const userId = user.id;

  const today = "2026-06-08"; // a Monday (weekday 1)
  const start = new Date(today + "T00:00:00Z");
  const end = new Date(start.getTime() + 86400_000);
  const weekday = start.getUTCDay();

  // Seed two courses, today's blocks (mixed kinds/minutes to exercise ordering),
  // an upcoming exam, today's lectures, and an open near-term deadline.
  const courseA = await prisma.course.create({
    data: {
      name: "Course A", userId,
      examDate: new Date("2026-06-15T00:00:00Z"),
      topics: { create: [{ title: "T1", order: 0 }] },
    },
    include: { topics: true },
  });
  const courseB = await prisma.course.create({
    data: {
      name: "Course B", userId,
      examDate: new Date("2026-06-25T00:00:00Z"),
      topics: { create: [{ title: "T2", order: 0 }] },
    },
    include: { topics: true },
  });

  await prisma.studyBlock.createMany({
    data: [
      { date: start, topicTitle: "Review B", minutes: 30, kind: "review", courseId: courseB.id, topicId: courseB.topics[0].id },
      { date: start, topicTitle: "Study A long", minutes: 90, kind: "study", courseId: courseA.id, topicId: courseA.topics[0].id },
      { date: start, topicTitle: "Study B short", minutes: 25, kind: "study", courseId: courseB.id, topicId: courseB.topics[0].id },
    ],
  });
  await prisma.lecture.createMany({
    data: [
      { title: "Late Lecture", userId, weekday, startMin: 600, endMin: 690 },
      { title: "Early Lecture", userId, weekday, startMin: 540, endMin: 600 },
    ],
  });
  await prisma.assignment.create({
    data: { title: "Sheet 1", dueDate: new Date("2026-06-12T00:00:00Z"), courseId: courseA.id },
  });

  try {
    const seq = await seqFetch(userId, start, end, weekday);
    const batch = await batchFetch(userId, start, end, weekday);

    // Sanity: the seeded data actually populated each query (so we're not just
    // comparing two empty results).
    check("blocks fetched (3 today)", seq.blocks.length === 3);
    check("next exam fetched", seq.nextExam?.name === "Course A"); // soonest exam
    check("today's lectures fetched (2)", seq.todaysLectures.length === 2);
    check("lectures ordered by startMin", seq.todaysLectures[0].title === "Early Lecture");
    // orderBy [{ kind: "asc" }, { minutes: "desc" }]: kind asc puts "review"
    // before "study" alphabetically, then minutes desc within each kind.
    check("blocks ordered by kind asc, then minutes desc",
      seq.blocks[0].topicTitle === "Review B" &&
      seq.blocks[1].topicTitle === "Study A long" &&
      seq.blocks[2].topicTitle === "Study B short");
    check("upcoming deadline fetched", seq.upcomingDeadlines.length === 1);

    // Core assertion: batched fetch === sequential fetch.
    check("batched fetch is identical to sequential fetch",
      JSON.stringify(batch) === JSON.stringify(seq));
  } finally {
    // Cleanup (cascades delete courses' topics/blocks/assignments + lectures).
    await prisma.user.delete({ where: { id: userId } });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

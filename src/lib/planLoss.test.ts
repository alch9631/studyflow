/**
 * Plan-conservation tests — the invariant that protects a student's workload.
 *
 * The scheduler is allowed to MOVE minutes (that's the whole point of healing),
 * but it must never DESTROY them. Every rebuild has to conserve, per topic:
 *
 *     minutes still owed  +  minutes already studied  ≈  the topic's real size
 *
 * Two ways that invariant used to break, both ending with study time silently
 * vanishing from the plan while the UI kept claiming the topic was pending:
 *
 *   1. Exam-eve pile-on. The leftover-minutes pile-on picks the latest runway day
 *      WITHOUT a completed session of that topic, because persistBlocks drops a
 *      fresh block that collides with a durable completed one. When EVERY runway
 *      day is blocked (short runway + a ticked-off session) there is no such day,
 *      and the pile-on landed on the blocked day anyway — so persistBlocks ate it.
 *
 *   2. Wiped-plan fold. applyCompletedWork derived "how big is this topic" from
 *      the study blocks that still exist. Any path that removes a topic's
 *      UNFINISHED blocks while keeping its COMPLETED ones (e.g. INV1 wiping a
 *      course whose exam has arrived) made planned == done, so the topic folded
 *      to done=true and was never scheduled again — even after the exam moved.
 *
 * Run: npx tsx src/lib/planLoss.test.ts
 */
import "./testDb"; // MUST be first: points ./db at the test DB before it loads.
import { prisma } from "./db";
import { rebuildSchedule, todayISO } from "./planService";
import { MINUTES_PER_EFFORT } from "./planner";

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

/** 90 minutes of study per point of effort. */
const PER_EFFORT = MINUTES_PER_EFFORT;

function dayFromToday(n: number): Date {
  const d = new Date(todayISO() + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/** Open (still to do) and completed STUDY minutes for one topic. */
async function studyMinutes(topicId: string) {
  const blocks = await prisma.studyBlock.findMany({
    where: { topicId, kind: "study" },
    select: { minutes: true, completed: true },
  });
  let open = 0;
  let done = 0;
  for (const b of blocks) {
    if (b.completed) done += b.minutes;
    else open += b.minutes;
  }
  return { open, done, total: open + done };
}

async function main() {
  console.log("\n=== plan conservation ===\n");

  // ── 1. Exam tomorrow, one session ticked off → remainder must survive ──────
  //
  // Runway is a single day (today), so every runway day carries a completed
  // session of the topic the moment the student ticks one off. The remaining
  // minutes have nowhere "free" to go — they must still be persisted, not eaten.
  const u1 = await prisma.user.create({
    data: { email: `loss-a+${Date.now()}@studyflow.local`, name: "Loss A" },
  });
  const c1 = await prisma.course.create({
    data: {
      name: "Exam Tomorrow",
      userId: u1.id,
      examDate: dayFromToday(1),
      studyDays: "0,1,2,3,4,5,6",
      topics: { create: [{ title: "Everything", effort: 4, order: 0 }] },
    },
    include: { topics: true },
  });
  const t1 = c1.topics[0];
  const size1 = 4 * PER_EFFORT; // 360 minutes of real work

  await rebuildSchedule(u1.id);
  const initial = await studyMinutes(t1.id);
  check(
    "initial plan holds the topic's full size",
    initial.total === size1,
    `expected ${size1}, got ${initial.total}`,
  );

  // Student finishes their first short session of the day.
  const first = await prisma.studyBlock.findFirst({
    where: { topicId: t1.id, kind: "study", completed: false },
    orderBy: { minutes: "asc" },
  });
  check("there is a session to complete", first !== null);
  if (first) {
    await prisma.studyBlock.update({ where: { id: first.id }, data: { completed: true } });
  }

  // Any later rebuild (a confidence tap, "lighter plan", adding a course…).
  await rebuildSchedule(u1.id);
  const after = await studyMinutes(t1.id);
  check(
    "a rebuild on exam eve does not destroy the unfinished remainder",
    after.total === size1,
    `expected ${size1} total (open+done), got ${after.total} (open=${after.open} done=${after.done})`,
  );
  check(
    "the studied session is still recorded as done",
    after.done === (first?.minutes ?? 0),
    `expected done=${first?.minutes}, got ${after.done}`,
  );

  // ── 2. A wiped plan must not mark a barely-started topic "finished" ────────
  //
  // INV1 wipes a course's unfinished plan once its exam date arrives. The
  // completed sessions stay. If the topic's size is then read off the surviving
  // rows, planned == done and the topic folds to done=true forever — so when the
  // student books a retake and moves the exam, the unstudied minutes never
  // come back.
  const u2 = await prisma.user.create({
    data: { email: `loss-b+${Date.now()}@studyflow.local`, name: "Loss B" },
  });
  const c2 = await prisma.course.create({
    data: {
      name: "Retake",
      userId: u2.id,
      examDate: dayFromToday(10),
      studyDays: "0,1,2,3,4,5,6",
      topics: {
        create: [
          { title: "A", effort: 4, order: 0 },
          { title: "B", effort: 4, order: 1 },
        ],
      },
    },
    include: { topics: true },
  });
  const [tA, tB] = c2.topics;
  const sizeA = 4 * PER_EFFORT;

  await rebuildSchedule(u2.id);
  // Student studies one session of A, then the exam arrives.
  const oneA = await prisma.studyBlock.findFirst({
    where: { topicId: tA.id, kind: "study", completed: false },
    orderBy: { date: "asc" },
  });
  check("topic A was scheduled", oneA !== null);
  if (oneA) {
    await prisma.studyBlock.update({ where: { id: oneA.id }, data: { completed: true } });
  }
  const studiedA = oneA?.minutes ?? 0;

  // Exam day arrives → INV1 wipes the unfinished plan for this course.
  await prisma.course.update({ where: { id: c2.id }, data: { examDate: dayFromToday(0) } });
  await rebuildSchedule(u2.id);
  const wiped = await studyMinutes(tA.id);
  check(
    "once the exam arrives only the studied session remains",
    wiped.open === 0 && wiped.done === studiedA,
    `open=${wiped.open} done=${wiped.done}`,
  );

  // Student books the retake 30 days out. The unstudied minutes must come back.
  await prisma.course.update({ where: { id: c2.id }, data: { examDate: dayFromToday(30) } });
  await rebuildSchedule(u2.id);
  const revived = await studyMinutes(tA.id);
  check(
    "a postponed exam re-schedules the minutes that were never studied",
    revived.open > 0,
    `topic A got open=${revived.open} (expected ≈ ${sizeA - studiedA})`,
  );
  check(
    "the revived topic is sized by what is left, not re-planned from scratch",
    revived.total <= size1 && revived.open <= sizeA - studiedA + PER_EFFORT,
    `open=${revived.open} done=${revived.done}`,
  );
  const bMinutes = await studyMinutes(tB.id);
  check(
    "the untouched topic B is unaffected",
    bMinutes.open > 0,
    `topic B open=${bMinutes.open}`,
  );

  // ── 3. Ticking a topic done and then un-ticking it must give the work back ─
  //
  // The everyday version of the same trap, and the one students actually hit:
  // marking a topic done wipes its unfinished blocks, so if the size of the
  // topic is read back off the surviving rows it looks finished forever. The
  // student un-ticks it because it wasn't really done — and it never returns to
  // the plan, while the course page keeps listing it.
  const u3 = await prisma.user.create({
    data: { email: `loss-c+${Date.now()}@studyflow.local`, name: "Loss C" },
  });
  const c3 = await prisma.course.create({
    data: {
      name: "Toggle",
      userId: u3.id,
      examDate: dayFromToday(21),
      studyDays: "0,1,2,3,4,5,6",
      topics: { create: [{ title: "A", effort: 4, order: 0 }] },
    },
    include: { topics: true },
  });
  const tT = c3.topics[0];

  await rebuildSchedule(u3.id);
  const oneT = await prisma.studyBlock.findFirst({
    where: { topicId: tT.id, kind: "study", completed: false },
    orderBy: { date: "asc" },
  });
  if (oneT) {
    await prisma.studyBlock.update({ where: { id: oneT.id }, data: { completed: true } });
  }
  const studiedT = oneT?.minutes ?? 0;

  // Tick it done (this is what toggleTopicDone persists), then rebuild.
  await prisma.topic.update({ where: { id: tT.id }, data: { done: true } });
  await rebuildSchedule(u3.id);
  // Change of heart: it wasn't finished after all.
  await prisma.topic.update({ where: { id: tT.id }, data: { done: false } });
  await rebuildSchedule(u3.id);

  const restored = await studyMinutes(tT.id);
  check(
    "un-ticking a topic brings its unstudied minutes back",
    restored.open > 0,
    `open=${restored.open} done=${restored.done} (expected ≈ ${4 * PER_EFFORT - studiedT} open)`,
  );
  check(
    "the work already done is still credited, not re-planned",
    restored.open <= 4 * PER_EFFORT - studiedT,
    `open=${restored.open}, cap ${4 * PER_EFFORT - studiedT}`,
  );

  // ── 4. A finished EASY course stays finished ──────────────────────────────
  //
  // The size floor is scaled by the course's difficulty multiplier, not raw
  // effort. Using raw effort would leave an easy course (×0.7) holding ~30% of
  // its effort forever, re-scheduling work the student genuinely completed.
  const u4 = await prisma.user.create({
    data: { email: `loss-d+${Date.now()}@studyflow.local`, name: "Loss D" },
  });
  const c4 = await prisma.course.create({
    data: {
      name: "Easy",
      userId: u4.id,
      examDate: dayFromToday(21),
      studyDays: "0,1,2,3,4,5,6",
      difficulty: 1, // easiest → study minutes scaled below the nominal effort
      topics: { create: [{ title: "Solo", effort: 2, order: 0 }] },
    },
    include: { topics: true },
  });
  const tE = c4.topics[0];
  await rebuildSchedule(u4.id);
  // The student completes every minute the plan asked of them.
  await prisma.studyBlock.updateMany({
    where: { topicId: tE.id, kind: "study" },
    data: { completed: true },
  });
  await rebuildSchedule(u4.id);
  const easy = await studyMinutes(tE.id);
  check(
    "a fully-studied easy course is not re-scheduled by the size floor",
    easy.open === 0,
    `open=${easy.open} done=${easy.done}`,
  );

  // Cleanup (cascades remove courses/topics/blocks).
  await prisma.user.deleteMany({ where: { id: { in: [u1.id, u2.id, u3.id, u4.id] } } });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Integration tests for the GLOBAL scheduler's EVEN-SPREAD behavior
 * (planService.rebuildSchedule). These assert the *intended* shape of a plan —
 * the product-facing contract the user asked for — rather than the pure-engine
 * arithmetic covered by planner.test.ts.
 *
 * The change under test: the old allocator FRONT-PACKED each course into the
 * earliest days at a fixed daily budget, finishing weeks early and leaving the
 * run-up to the exam empty. The new allocator PACES each course evenly to its
 * exam (≈ remainingWork / remainingStudyDays), so a subject is present across its
 * whole runway, each topic spans several days, and the days near the exam still
 * carry study + spaced review. Overload (work that can't fit) still piles onto
 * the last study day and flags the course `intense` — nothing is ever dropped.
 *
 * Runs against an isolated throwaway test DB (see ./testDb), never dev/prod.
 * Run: npx tsx src/lib/planSpread.test.ts
 */
import "./testDb"; // MUST be first: points ./db at the test DB before it loads.
import { prisma } from "./db";
import { rebuildSchedule, todayISO } from "./planService";

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

const iso = (d: Date) => d.toISOString().slice(0, 10);
function daysFromToday(today: string, n: number): Date {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

type SeedTopic = { title: string; effort: number };
type SeedCourse = { name: string; daysOut: number; studyDays?: string; topics: SeedTopic[] };

/** Create a fresh user with the given courses, run a full rebuild, return ids. */
async function seed(courses: SeedCourse[]) {
  const today = todayISO();
  const user = await prisma.user.create({
    data: { email: `spread-${Math.random().toString(36).slice(2)}@studyflow.local`, name: "Spread" },
  });
  const ids: { id: string; exam: string }[] = [];
  for (const c of courses) {
    const examDate = daysFromToday(today, c.daysOut);
    const course = await prisma.course.create({
      data: {
        name: c.name,
        userId: user.id,
        examDate,
        studyDays: c.studyDays ?? "1,2,3,4,5",
        topics: { create: c.topics.map((t, i) => ({ title: t.title, effort: t.effort, order: i })) },
      },
    });
    ids.push({ id: course.id, exam: iso(examDate) });
  }
  await rebuildSchedule(user.id);
  return { userId: user.id, ids, today };
}

async function blocksFor(courseId: string) {
  const rows = await prisma.studyBlock.findMany({ where: { courseId }, orderBy: { date: "asc" } });
  return rows.map((b) => ({ ...b, day: iso(b.date) }));
}

async function main() {
  // ===========================================================================
  // 1) LIGHT course over a LONG runway is SPREAD across many days — NOT finished
  //    in the first few. This is the central "spread to the exam, don't front
  //    pack" guarantee. ~8 weeks of weekdays (~40 study days) of light work.
  // ===========================================================================
  const light = await seed([
    { name: "Light", daysOut: 56, topics: [
      { title: "T1", effort: 2 },
      { title: "T2", effort: 2 },
      { title: "T3", effort: 1 },
    ] },
  ]);
  {
    const blocks = await blocksFor(light.ids[0].id);
    const study = blocks.filter((b) => b.kind === "study");
    const studyDays = [...new Set(study.map((b) => b.day))].sort();
    const firstDay = studyDays[0];
    const lastDay = studyDays[studyDays.length - 1];
    const examMinus1 = iso(daysFromToday(light.ids[0].exam, -1));

    // Spread, not front-pack: a light load over ~40 study days should occupy MANY
    // days. The OLD front-packer would have finished this in a handful of days.
    check("light course spreads across many days (> 10)", studyDays.length > 10);

    // The plan reaches deep into the runway — the last study day is in the final
    // stretch before the exam, not weeks early with an empty tail.
    const runwayStart = new Date(firstDay + "T00:00:00Z").getTime();
    const runwayEnd = new Date(examMinus1 + "T00:00:00Z").getTime();
    const lastT = new Date(lastDay + "T00:00:00Z").getTime();
    const reach = (lastT - runwayStart) / (runwayEnd - runwayStart);
    check("study reaches into the final third of the runway (no empty tail)", reach >= 0.66);

    // A substantial topic is TOUCHED ON MULTIPLE DAYS — progressing over time,
    // not a single-day cram. (The old allocator collapsed a module to ~1 day.)
    const t1Days = new Set(study.filter((b) => b.topicId && b.topicTitle === "T1").map((b) => b.day));
    check("a topic appears on multiple days (multi-day, not single-day cram)", t1Days.size >= 3);

    // Near-exam days still carry study and/or spaced review (the run-up isn't
    // empty). Look at the last 14 calendar days before the exam.
    const window = iso(daysFromToday(light.ids[0].exam, -14));
    const nearExam = blocks.filter((b) => b.day >= window && b.day < light.ids[0].exam);
    check("near-exam days still have study or review blocks", nearExam.length > 0);
    check("spaced review blocks exist", blocks.some((b) => b.kind === "review"));
  }

  // ===========================================================================
  // 2) Foundational topics LEAD, later topics FOLLOW (course order), with overlap
  //    — the subject progresses over the weeks rather than all-at-once.
  // ===========================================================================
  const ordered = await seed([
    { name: "Ordered", daysOut: 40, topics: [
      { title: "Foundations", effort: 3 },
      { title: "Middle", effort: 3 },
      { title: "Advanced", effort: 3 },
    ] },
  ]);
  {
    const study = (await blocksFor(ordered.ids[0].id)).filter((b) => b.kind === "study");
    const firstDayOf = (title: string) =>
      study.filter((b) => b.topicTitle === title).map((b) => b.day).sort()[0];
    const f = firstDayOf("Foundations");
    const m = firstDayOf("Middle");
    const a = firstDayOf("Advanced");
    // Earlier topics START no later than later ones (foundational first).
    check("foundational topic starts on/before later topics", !!f && !!a && f <= a && f <= m);
    // ...but they OVERLAP across the runway (each spans several days), so it's not
    // strictly one-topic-then-the-next.
    const span = (title: string) => new Set(study.filter((b) => b.topicTitle === title).map((b) => b.day)).size;
    check("each topic spans several days (overlapping, interleaved)",
      span("Foundations") >= 2 && span("Middle") >= 2 && span("Advanced") >= 2);
  }

  // ===========================================================================
  // 3) OVERLOAD still piles the remainder onto the LAST study day and flags the
  //    course `intense` — nothing dropped (preserved behavior).
  // ===========================================================================
  const cram = await seed([
    { name: "Cram", daysOut: 7, topics: Array.from({ length: 8 }, (_, i) => ({ title: `C${i}`, effort: 5 })) },
  ]);
  {
    const course = await prisma.course.findUnique({
      where: { id: cram.ids[0].id },
      select: { intense: true },
    });
    const study = (await blocksFor(cram.ids[0].id)).filter((b) => b.kind === "study");
    const studyDays = [...new Set(study.map((b) => b.day))].sort();
    const lastDay = studyDays[studyDays.length - 1];
    const lastDayMinutes = study.filter((b) => b.day === lastDay).reduce((s, b) => s + b.minutes, 0);
    const totalScheduled = study.reduce((s, b) => s + b.minutes, 0);

    check("overload flags course intense", course?.intense === true);
    // The pile-on shows up as a heavy last day (the remainder dumped there).
    check("overload piles a heavy remainder onto the last study day",
      lastDayMinutes > 360);
    // Nothing dropped: every topic is still represented somewhere in the plan.
    const covered = new Set(study.map((b) => b.topicTitle));
    check("overload drops no topics (all 8 still scheduled)", covered.size === 8);
    check("overload schedules a non-trivial total", totalScheduled > 0);
  }

  // ===========================================================================
  // 4) COMPLETED work is not re-scheduled (folding) AND its durable block
  //    survives the rebuild — the spread covers only what's LEFT.
  // ===========================================================================
  const prog = await seed([
    { name: "Progress", daysOut: 30, topics: [{ title: "Done", effort: 4 }, { title: "Todo", effort: 4 }] },
  ]);
  {
    // Mark a chunk of "Done" complete by hand-seeding a completed block, then
    // mark the topic done, and rebuild. The folded topic should drop out.
    const doneTopic = await prisma.topic.findFirst({
      where: { courseId: prog.ids[0].id, title: "Done" },
    });
    await prisma.studyBlock.create({
      data: {
        courseId: prog.ids[0].id,
        topicId: doneTopic!.id,
        topicTitle: "Done",
        date: daysFromToday(prog.today, 0),
        minutes: 90,
        completed: true,
        kind: "study",
      },
    });
    await prisma.topic.update({ where: { id: doneTopic!.id }, data: { done: true } });
    await rebuildSchedule(prog.userId);

    const blocks = await blocksFor(prog.ids[0].id);
    const freshDoneStudy = blocks.filter((b) => b.topicTitle === "Done" && b.kind === "study" && !b.completed);
    check("completed/done topic is not re-scheduled (folded out)", freshDoneStudy.length === 0);
    check("the durable completed block survived the rebuild",
      blocks.some((b) => b.topicTitle === "Done" && b.completed));
    check("remaining topic is still spread across multiple days",
      new Set(blocks.filter((b) => b.topicTitle === "Todo" && b.kind === "study").map((b) => b.day)).size >= 3);
  }

  // ===========================================================================
  // 4b) Regression (review-fold): a topic with ALL study COMPLETED but reviews
  //     still pending must NOT get study re-scheduled on rebuild. Pending
  //     reviews used to inflate the topic's "planned" study minutes (reviews
  //     counted as study effort), making a finished topic look part-unstudied
  //     and re-spreading ~45% of its study from scratch on heal/rebuild.
  // ===========================================================================
  const rf = await seed([
    { name: "ReviewFold", daysOut: 30, topics: [{ title: "Mastered", effort: 2 }, { title: "Open", effort: 2 }] },
  ]);
  {
    // Complete EVERY study block of "Mastered"; its spaced reviews stay pending.
    await prisma.studyBlock.updateMany({
      where: { courseId: rf.ids[0].id, topicTitle: "Mastered", kind: "study" },
      data: { completed: true },
    });
    await rebuildSchedule(rf.userId);

    const blocks = await blocksFor(rf.ids[0].id);
    const freshMasteredStudy = blocks.filter(
      (b) => b.topicTitle === "Mastered" && b.kind === "study" && !b.completed,
    );
    check(
      "all-study-done topic gets NO fresh study on rebuild (reviews pending)",
      freshMasteredStudy.length === 0,
    );
    check(
      "its completed study history survives the rebuild",
      blocks.some((b) => b.topicTitle === "Mastered" && b.kind === "study" && b.completed),
    );
    check(
      "the untouched topic still has study scheduled",
      blocks.some((b) => b.topicTitle === "Open" && b.kind === "study" && !b.completed),
    );
  }

  // ===========================================================================
  // 5) NEVER schedules past the exam; never emits a non-positive block.
  // ===========================================================================
  const sane = await seed([
    { name: "Sane", daysOut: 21, topics: [{ title: "A", effort: 2 }, { title: "B", effort: 3 }] },
  ]);
  {
    const blocks = await blocksFor(sane.ids[0].id);
    check("no block is scheduled on/after the exam date",
      blocks.every((b) => b.day < sane.ids[0].exam));
    check("every block has positive, finite minutes",
      blocks.every((b) => Number.isFinite(b.minutes) && b.minutes > 0));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

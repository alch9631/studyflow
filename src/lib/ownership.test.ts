/**
 * Cross-user data isolation tests — the highest-value safety net.
 *
 * Seeds two independent students (A and B), each owning a course with topics,
 * study blocks and an assignment, then proves the ownership-scoping invariant
 * the whole app depends on: **user B can never read, mutate, or delete user A's
 * rows.** A non-owner's id must resolve to not-found / no-op, never another
 * user's data — and a planService rebuild for one user must never touch the
 * other's persisted plan.
 *
 * Covers:
 *   • ownership.ts accessors (course/topic/block/assignment) used by the
 *     course/topic/progress server actions — owner sees the row, non-owner sees
 *     null/false; scoped update/delete only ever hit the owner's row.
 *   • planService: rebuildSchedule(userId) and regeneratePlan/healCoursePlan/
 *     isCourseOverloaded(courseId) operate strictly on the owning user's data —
 *     no cross-user bleed in either direction.
 *
 * Runs against an isolated throwaway test DB (see ./testDb), never dev/prod.
 * Run: npx tsx src/lib/ownership.test.ts
 */
import "./testDb"; // MUST be first: points ./db at the test DB before it loads.
import { prisma } from "./db";
import {
  ownsCourse,
  findOwnedCourse,
  updateOwnedCourse,
  deleteOwnedCourse,
  findOwnedTopic,
  findOwnedBlock,
  findOwnedAssignment,
  deleteOwnedAssignment,
} from "./ownership";
import {
  rebuildSchedule,
  regeneratePlan,
  healCoursePlan,
  isCourseOverloaded,
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

const FUTURE_EXAM = new Date("2026-12-01T00:00:00Z");

/** Create a user with one course (topics + a block + an assignment) and return ids. */
async function seedUser(tag: string) {
  const user = await prisma.user.create({
    data: { email: `iso-${tag}+${Date.now()}@studyflow.local`, name: `User ${tag}` },
  });
  const course = await prisma.course.create({
    data: {
      name: `${tag} Course`,
      userId: user.id,
      examDate: FUTURE_EXAM,
      studyDays: "1,2,3,4,5",
      topics: {
        create: [
          { title: `${tag} Topic 1`, effort: 2, order: 0 },
          { title: `${tag} Topic 2`, effort: 1, order: 1 },
        ],
      },
    },
    include: { topics: true },
  });
  // A durable, hand-seeded block with a recognizable marker (so a foreign rebuild
  // that wrongly touched it would be detectable). completed=true => never wiped.
  const block = await prisma.studyBlock.create({
    data: {
      courseId: course.id,
      topicId: course.topics[0].id,
      topicTitle: `${tag} MARKER`,
      date: new Date("2026-06-10T00:00:00Z"),
      minutes: 42,
      completed: true,
      kind: "study",
    },
  });
  const assignment = await prisma.assignment.create({
    data: { courseId: course.id, title: `${tag} Assignment`, dueDate: FUTURE_EXAM },
  });
  return {
    userId: user.id,
    courseId: course.id,
    topicId: course.topics[0].id,
    blockId: block.id,
    assignmentId: assignment.id,
  };
}

async function main() {
  const A = await seedUser("A");
  const B = await seedUser("B");

  try {
    // ── ownsCourse / findOwnedCourse ────────────────────────────────────────
    check("owner sees own course", (await ownsCourse(A.userId, A.courseId)) === true);
    check("non-owner cannot see other's course", (await ownsCourse(B.userId, A.courseId)) === false);
    check("missing course id -> not owned", (await ownsCourse(A.userId, "does-not-exist")) === false);
    check("findOwnedCourse returns row for owner", (await findOwnedCourse(A.userId, A.courseId))?.id === A.courseId);
    check("findOwnedCourse returns null for non-owner", (await findOwnedCourse(B.userId, A.courseId)) === null);

    // ── updateOwnedCourse: only the owner's row is ever changed ──────────────
    const foreignUpdate = await updateOwnedCourse(B.userId, A.courseId, { name: "HACKED" });
    check("non-owner update is a no-op (false)", foreignUpdate === false);
    const aCourseAfter = await prisma.course.findUnique({ where: { id: A.courseId }, select: { name: true } });
    check("A's course name unchanged after B's update attempt", aCourseAfter?.name === "A Course");

    const ownUpdate = await updateOwnedCourse(A.userId, A.courseId, { name: "A Renamed" });
    check("owner update succeeds (true)", ownUpdate === true);
    check("owner update actually applied",
      (await prisma.course.findUnique({ where: { id: A.courseId }, select: { name: true } }))?.name === "A Renamed");

    // ── findOwnedTopic / Block / Assignment: scoped through the parent course ─
    check("owner sees own topic", (await findOwnedTopic(A.userId, A.topicId))?.id === A.topicId);
    check("non-owner cannot see other's topic", (await findOwnedTopic(B.userId, A.topicId)) === null);
    check("owner sees own block", (await findOwnedBlock(A.userId, A.blockId))?.id === A.blockId);
    check("non-owner cannot see other's block", (await findOwnedBlock(B.userId, A.blockId)) === null);
    check("owner sees own assignment", (await findOwnedAssignment(A.userId, A.assignmentId))?.id === A.assignmentId);
    check("non-owner cannot see other's assignment", (await findOwnedAssignment(B.userId, A.assignmentId)) === null);

    // ── deleteOwnedAssignment: a non-owner can't delete A's assignment ───────
    const foreignDelAssign = await deleteOwnedAssignment(B.userId, A.assignmentId);
    check("non-owner assignment delete is a no-op (false)", foreignDelAssign === false);
    check("A's assignment still exists after B's delete attempt",
      (await prisma.assignment.count({ where: { id: A.assignmentId } })) === 1);
    check("owner can delete own assignment", (await deleteOwnedAssignment(A.userId, A.assignmentId)) === true);
    check("A's assignment is gone after owner delete",
      (await prisma.assignment.count({ where: { id: A.assignmentId } })) === 0);

    // ── planService: rebuildSchedule(userId) only touches that user ──────────
    // Snapshot B's pre-rebuild state, rebuild A's whole schedule, assert B intact.
    const bCourseBefore = await prisma.course.findUnique({
      where: { id: B.courseId },
      select: { minutesPerDay: true, intense: true },
    });
    const bBlocksBefore = await prisma.studyBlock.count({ where: { courseId: B.courseId } });

    const resultsForA = await rebuildSchedule(A.userId);
    check("rebuildSchedule(A) returns a result for A's course", resultsForA.has(A.courseId));
    check("rebuildSchedule(A) does NOT plan B's course", !resultsForA.has(B.courseId));
    check("A's course now has freshly planned blocks",
      (await prisma.studyBlock.count({ where: { courseId: A.courseId, completed: false } })) > 0);
    check("A's hand-seeded completed MARKER block survived the rebuild",
      (await prisma.studyBlock.count({ where: { courseId: A.courseId, topicTitle: "A MARKER" } })) === 1);

    const bCourseAfterA = await prisma.course.findUnique({
      where: { id: B.courseId },
      select: { minutesPerDay: true, intense: true },
    });
    const bBlocksAfterA = await prisma.studyBlock.count({ where: { courseId: B.courseId } });
    check("rebuild for A left B's course row untouched",
      bCourseAfterA?.minutesPerDay === bCourseBefore?.minutesPerDay &&
        bCourseAfterA?.intense === bCourseBefore?.intense);
    check("rebuild for A left B's blocks untouched", bBlocksAfterA === bBlocksBefore);
    check("B's MARKER block is exactly its hand-seeded value",
      (await prisma.studyBlock.count({ where: { courseId: B.courseId, topicTitle: "B MARKER", minutes: 42 } })) === 1);

    // ── regeneratePlan(courseId) rebuilds only the OWNING user's plan ────────
    // It resolves the owner internally; passing A's course must never replan B.
    const aBlocksBeforeRegen = await prisma.studyBlock.count({ where: { courseId: A.courseId } });
    const bBlocksBeforeRegen = await prisma.studyBlock.count({ where: { courseId: B.courseId } });
    await regeneratePlan(A.courseId);
    check("regeneratePlan(A) leaves B's block count unchanged",
      (await prisma.studyBlock.count({ where: { courseId: B.courseId } })) === bBlocksBeforeRegen);
    check("regeneratePlan(A) keeps A's plan present",
      (await prisma.studyBlock.count({ where: { courseId: A.courseId } })) > 0 && aBlocksBeforeRegen >= 0);

    // ── healCoursePlan(courseId) is likewise owner-scoped ───────────────────
    const bBlocksBeforeHeal = await prisma.studyBlock.count({ where: { courseId: B.courseId } });
    await healCoursePlan(B.courseId);
    check("healCoursePlan(B) leaves A's MARKER intact",
      (await prisma.studyBlock.count({ where: { courseId: A.courseId, topicTitle: "A MARKER" } })) === 1);
    check("healCoursePlan(B) produced B a plan, didn't drop B's completed block",
      (await prisma.studyBlock.count({ where: { courseId: B.courseId, topicTitle: "B MARKER" } })) === 1 &&
        (await prisma.studyBlock.count({ where: { courseId: B.courseId } })) >= bBlocksBeforeHeal);

    // ── isCourseOverloaded reads the per-course flag (no cross-course bleed) ─
    check("isCourseOverloaded(A) is a boolean", typeof (await isCourseOverloaded(A.courseId)) === "boolean");
    check("isCourseOverloaded on a missing course defaults to false",
      (await isCourseOverloaded("does-not-exist")) === false);

    // ── deleteOwnedCourse: B cannot delete A's course; A can ────────────────
    const foreignDelCourse = await deleteOwnedCourse(B.userId, A.courseId);
    check("non-owner course delete is a no-op (false)", foreignDelCourse === false);
    check("A's course still exists after B's delete attempt",
      (await prisma.course.count({ where: { id: A.courseId } })) === 1);
    check("owner can delete own course", (await deleteOwnedCourse(A.userId, A.courseId)) === true);
    check("A's course (and its cascade) is gone",
      (await prisma.course.count({ where: { id: A.courseId } })) === 0);
    check("deleting A's course did NOT touch B's course",
      (await prisma.course.count({ where: { id: B.courseId } })) === 1);
  } finally {
    // Cascades clean up courses/topics/blocks/assignments owned by each user.
    await prisma.user.deleteMany({ where: { id: { in: [A.userId, B.userId] } } });
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

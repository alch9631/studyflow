/**
 * Recovery-assessment tests: the proactive "you fell behind" detector counts
 * exactly the scheduled-but-never-completed sessions from days BEFORE today —
 * completed history, today's plan, and future blocks must not trigger it, and
 * another user's overdue work must never bleed in.
 *
 * Runs against the isolated throwaway test DB (see ./testDb).
 * Run: npx tsx src/lib/recovery.test.ts
 */
import "./testDb"; // MUST be first: points ./db at the test DB before it loads.
import { prisma } from "./db";
import {
  assessRecovery,
  needsRecovery,
  RECOVERY_MIN_SESSIONS,
  RECOVERY_MIN_MINUTES,
} from "./recovery";

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

const TODAY = "2026-06-10";
const d = (iso: string) => new Date(iso + "T00:00:00Z");

async function main() {
  const user = await prisma.user.create({
    data: { email: `recovery-test+${Date.now()}@studyflow.local`, name: "RecoveryTest" },
  });
  const other = await prisma.user.create({
    data: { email: `recovery-other+${Date.now()}@studyflow.local`, name: "Other" },
  });

  const mkCourse = (userId: string, name: string) =>
    prisma.course.create({
      data: { userId, name, examDate: d("2026-07-15"), studyDays: "1,2,3,4,5" },
    });
  const courseA = await mkCourse(user.id, "Thermo");
  const courseB = await mkCourse(user.id, "Mathe IV");
  const courseX = await mkCourse(other.id, "Foreign");

  const mkBlock = (courseId: string, date: string, minutes: number, completed: boolean) =>
    prisma.studyBlock.create({
      data: { courseId, topicId: "t1", topicTitle: "T", date: d(date), minutes, completed, kind: "study" },
    });

  // Overdue (counted): two unfinished past sessions across two courses.
  await mkBlock(courseA.id, "2026-06-08", 45, false);
  await mkBlock(courseB.id, "2026-06-09", 30, false);
  // Not counted: completed past, today's plan, future plan, other user's overdue.
  await mkBlock(courseA.id, "2026-06-07", 60, true);
  await mkBlock(courseA.id, TODAY, 45, false);
  await mkBlock(courseB.id, "2026-06-12", 45, false);
  await mkBlock(courseX.id, "2026-06-01", 240, false);

  const a = await assessRecovery(user.id, TODAY);
  check("counts only past, unfinished sessions", a.overdueSessions === 2);
  check("sums their planned minutes", a.overdueMinutes === 75);
  check("tracks distinct courses", a.courseCount === 2);
  check("no cross-user bleed", (await assessRecovery(other.id, TODAY)).overdueMinutes === 240);

  const clean = await assessRecovery(user.id, "2026-06-07");
  check("nothing overdue before the missed days", clean.overdueSessions === 0);
  check("clean state does not trigger recovery", !needsRecovery(clean));

  check("session threshold triggers", needsRecovery({
    overdueSessions: RECOVERY_MIN_SESSIONS, overdueMinutes: 0, courseCount: 1,
  }));
  check("minutes threshold triggers", needsRecovery({
    overdueSessions: 1, overdueMinutes: RECOVERY_MIN_MINUTES, courseCount: 1,
  }));
  check("a single short miss does not nag", !needsRecovery({
    overdueSessions: 1, overdueMinutes: 30, courseCount: 1,
  }));

  // Cleanup (test DB only, but keep it tidy for other suites in the same run).
  await prisma.studyBlock.deleteMany({
    where: { courseId: { in: [courseA.id, courseB.id, courseX.id] } },
  });
  await prisma.course.deleteMany({ where: { id: { in: [courseA.id, courseB.id, courseX.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

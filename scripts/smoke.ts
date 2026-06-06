/**
 * End-to-end smoke test against the real SQLite dev DB:
 * create a course → plan generates → heal → overload detection.
 * Run: DATABASE_URL="file:./dev.db" npx tsx scripts/smoke.ts
 */
import { prisma } from "../src/lib/db";
import { getCurrentUserId } from "../src/lib/devUser";
import { regeneratePlan, healCoursePlan } from "../src/lib/planService";

async function main() {
  const userId = await getCurrentUserId();

  // Exam ~3 weeks out so there's real runway.
  const exam = new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10);
  const course = await prisma.course.create({
    data: {
      name: "SMOKE_TEST",
      examDate: new Date(exam + "T00:00:00Z"),
      minutesPerDay: 120,
      studyDays: "1,2,3,4,5",
      userId,
      topics: {
        create: [
          { title: "Sorting", order: 0 },
          { title: "Graphs", order: 1 },
          { title: "DP", order: 2 },
        ],
      },
    },
  });

  await regeneratePlan(course.id);
  const blocks = await prisma.studyBlock.findMany({ where: { courseId: course.id } });
  console.log(`generated ${blocks.length} study blocks`);
  if (blocks.length === 0) throw new Error("FAIL: no blocks generated");

  const topicsCovered = new Set(blocks.map((b) => b.topicTitle));
  if (topicsCovered.size !== 3) throw new Error("FAIL: not all topics scheduled");
  console.log(`✓ all ${topicsCovered.size} topics scheduled across days`);

  const heal = await healCoursePlan(course.id);
  console.log(`✓ heal ran; overloaded (3wk runway) = ${heal.isOverloaded}`);
  if (heal.isOverloaded) throw new Error("FAIL: should not be overloaded with 3 weeks");

  // cleanup
  await prisma.course.delete({ where: { id: course.id } });
  console.log("✓ cleaned up\n✅ SMOKE PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

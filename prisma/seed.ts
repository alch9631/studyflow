/**
 * Seed the local dev DB with demo courses so the app is testable immediately.
 * Run: DATABASE_URL="file:./dev.db" npx tsx prisma/seed.ts   (or: npm run db:seed)
 *
 * Idempotent: wipes the dev user's existing courses first, then reseeds.
 */
import { prisma } from "../src/lib/db";
import { getCurrentUserId } from "../src/lib/devUser";
import { regeneratePlan } from "../src/lib/planService";

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86400_000);
}

async function main() {
  const userId = await getCurrentUserId();

  // Clean slate for the dev user.
  await prisma.course.deleteMany({ where: { userId } });

  // 1) A healthy course — comfortable runway before the exam.
  const algo = await prisma.course.create({
    data: {
      name: "Algorithms",
      examDate: daysFromNow(24),
      minutesPerDay: 120,
      studyDays: "1,2,3,4,5",
      userId,
      topics: {
        create: [
          { title: "Sorting & complexity", effort: 1, order: 0 },
          { title: "Graphs (BFS/DFS)", effort: 2, order: 1 },
          { title: "Shortest paths", effort: 2, order: 2 },
          { title: "Dynamic programming", effort: 2, order: 3 },
          { title: "Greedy algorithms", effort: 1, order: 4 },
        ],
      },
    },
  });
  await regeneratePlan(algo.id);

  // 2) A crunch course — exam soon + lots of work, to show the overload banner
  //    and the "I fell behind" replan in action.
  const os = await prisma.course.create({
    data: {
      name: "Operating Systems",
      examDate: daysFromNow(4),
      minutesPerDay: 90,
      studyDays: "1,2,3,4,5,6,0",
      userId,
      topics: {
        create: [
          { title: "Processes & threads", effort: 2, order: 0 },
          { title: "Scheduling", effort: 2, order: 1 },
          { title: "Memory & paging", effort: 2, order: 2 },
          { title: "File systems", effort: 1, order: 3 },
          { title: "Concurrency & deadlock", effort: 2, order: 4 },
        ],
      },
    },
  });
  await regeneratePlan(os.id);

  const courses = await prisma.course.count({ where: { userId } });
  const blocks = await prisma.studyBlock.count();
  console.log(`✅ Seeded ${courses} courses, ${blocks} study blocks for the dev user.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

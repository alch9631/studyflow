import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { appleFor } from "@/lib/apple";
import CourseCard from "@/components/CourseCard";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const userId = await getCurrentUserId();
  const courses = await prisma.course.findMany({
    where: { userId },
    orderBy: { examDate: "asc" },
    include: { topics: true, blocks: true },
  });

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Your courses</h1>
        <Link
          href="/courses/new"
          className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + New course
        </Link>
      </div>

      {courses.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          No courses yet. Add one and StudyFlow builds the plan for you.
        </p>
      ) : (
        <ul className="space-y-3">
          {courses.map((c) => {
            const done = c.topics.filter((t) => t.done).length;
            const remainingMinutes = c.blocks
              .filter((b) => !b.completed && b.kind === "study")
              .reduce((s, b) => s + b.minutes, 0);
            const apple = appleFor({
              examDate: c.examDate,
              intense: c.intense,
              remainingMinutes,
            });
            return (
              <li key={c.id}>
                <CourseCard
                  course={{
                    id: c.id,
                    name: c.name,
                    examDate: c.examDate.toISOString().slice(0, 10),
                    studyDays: c.studyDays,
                    done,
                    total: c.topics.length,
                    apple: { emoji: apple.emoji, label: apple.label, cls: apple.cls },
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      {/* Explanation moved to the bottom */}
      <details className="mt-8 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
        <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-200">
          ℹ️ How StudyFlow plans your studying
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Add your modules (manually, from the{" "}
            <Link href="/catalog" className="text-brand hover:underline">TUHH catalog</Link>, or by{" "}
            <Link href="/courses/import" className="text-brand hover:underline">uploading a syllabus/script</Link>).
          </li>
          <li>AI reads the content → topics, difficulty, and how long each takes.</li>
          <li>
            It works backward from your exam dates and spreads the work across all your
            courses within a realistic <strong>~3 h/day</strong> — never cramming one day.
          </li>
          <li>
            It adds <strong>spaced reviews</strong> and <strong>self-test questions</strong> for
            active recall — the proven ways to remember.
          </li>
          <li>
            Each day, open <Link href="/today" className="text-brand hover:underline">Today</Link> for
            exactly what to study; tell it your progress and it re-plans around you.
          </li>
        </ol>
        <p className="mt-3 border-t border-gray-200 dark:border-gray-800 pt-2">
          <strong>🍎 Apple priority:</strong> each course is rated by urgency (exam soon) and
          workload — <span className="font-medium text-green-700">🍏 On track</span>,
          <span className="font-medium text-yellow-800"> 🟡 Medium</span>,
          <span className="font-medium text-red-700"> 🍎 High</span>. Red = focus here first.
        </p>
      </details>
    </main>
  );
}

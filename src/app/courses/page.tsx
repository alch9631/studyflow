import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { appleFor } from "@/lib/apple";
import CourseEditor from "@/components/CourseEditor";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const userId = await getCurrentUserId();
  const courses = await prisma.course.findMany({
    where: { userId },
    orderBy: { examDate: "asc" },
    include: { topics: true, blocks: true },
  });

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your courses</h1>
        <Link
          href="/courses/new"
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + New course
        </Link>
      </div>

      <details className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        <summary className="cursor-pointer font-medium text-gray-700">
          ℹ️ How StudyFlow plans your studying
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Add your modules (manually, from the <Link href="/catalog" className="text-brand hover:underline">TUHH catalog</Link>,
            or by <Link href="/courses/import" className="text-brand hover:underline">uploading a syllabus/script</Link>).
          </li>
          <li>AI reads the content → topics, difficulty, and how long each takes.</li>
          <li>
            It works backward from your exam dates and spreads the work across all
            your courses within a realistic <strong>~3 h/day</strong> — never cramming one day.
          </li>
          <li>
            It adds <strong>spaced reviews</strong> (the proven way to remember) and
            <strong> self-test questions</strong> for active recall.
          </li>
          <li>
            Each day, open <Link href="/today" className="text-brand hover:underline">Today</Link> for exactly
            what to study; tell it your progress and it re-plans around you.
          </li>
        </ol>
        <p className="mt-3 border-t border-gray-200 pt-2">
          <strong>🍎 Apple priority:</strong> each course is rated by urgency
          (exam soon) and workload — <span className="font-medium text-green-700">🍏 On track</span>,
          <span className="font-medium text-yellow-800"> 🟡 Medium</span>,
          <span className="font-medium text-red-700"> 🍎 High</span>. Red means focus
          here first; the plan already gives it more time.
        </p>
      </details>

      {courses.length === 0 ? (
        <p className="text-gray-500">
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
                <Link
                  href={`/courses/${c.id}`}
                  className="block rounded-xl border border-gray-200 p-4 hover:border-gray-400"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        title={`${apple.label} priority`}
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${apple.cls}`}
                      >
                        {apple.emoji} {apple.label}
                      </span>
                      {c.name}
                    </span>
                    <span className="text-sm text-gray-500">
                      exam {c.examDate.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{
                        width: `${
                          c.topics.length
                            ? Math.round((done / c.topics.length) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    {done}/{c.topics.length} topics done
                  </div>
                </Link>
                <CourseEditor
                  course={{
                    id: c.id,
                    name: c.name,
                    examDate: c.examDate.toISOString().slice(0, 10),
                    studyDays: c.studyDays,
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

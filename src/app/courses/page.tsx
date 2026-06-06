import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import CourseEditor from "@/components/CourseEditor";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const userId = await getCurrentUserId();
  const courses = await prisma.course.findMany({
    where: { userId },
    orderBy: { examDate: "asc" },
    include: { topics: true },
  });

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your courses</h1>
        <div className="flex items-center gap-3">
          <Link href="/today" className="text-sm font-medium text-gray-600 hover:underline">
            Today
          </Link>
          <Link href="/catalog" className="text-sm font-medium text-gray-600 hover:underline">
            🎓 TUHH
          </Link>
          <Link href="/courses/import" className="text-sm font-medium text-gray-600 hover:underline">
            ✨ Import
          </Link>
          <Link
            href="/courses/new"
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + New course
          </Link>
        </div>
      </div>

      {courses.length === 0 ? (
        <p className="text-gray-500">
          No courses yet. Add one and StudyFlow builds the plan for you.
        </p>
      ) : (
        <ul className="space-y-3">
          {courses.map((c) => {
            const done = c.topics.filter((t) => t.done).length;
            return (
              <li key={c.id}>
                <Link
                  href={`/courses/${c.id}`}
                  className="block rounded-xl border border-gray-200 p-4 hover:border-gray-400"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.name}</span>
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

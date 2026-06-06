import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isCourseOverloaded } from "@/lib/planService";
import { healCourse, toggleTopic, updateCourse } from "../actions";

export const dynamic = "force-dynamic";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_OPTS = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 0, label: "Sun" },
];

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      topics: { orderBy: { order: "asc" } },
      blocks: { orderBy: { date: "asc" } },
    },
  });
  if (!course) notFound();

  const overloaded = await isCourseOverloaded(course.id);
  const doneCount = course.topics.filter((t) => t.done).length;

  // Group study blocks by date for the weekly view.
  const byDate = new Map<string, typeof course.blocks>();
  for (const b of course.blocks) {
    const key = b.date.toISOString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(b);
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/courses" className="text-sm text-gray-500 hover:underline">
        ← All courses
      </Link>

      <div className="mb-6 mt-2 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">{course.name}</h1>
          <p className="text-sm text-gray-500">
            Exam {course.examDate.toISOString().slice(0, 10)} ·{" "}
            {course.minutesPerDay} min/day · {doneCount}/{course.topics.length}{" "}
            topics done
          </p>
        </div>
        <form action={healCourse}>
          <input type="hidden" name="courseId" value={course.id} />
          <button
            type="submit"
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            😵‍💫 I fell behind — replan
          </button>
        </form>
      </div>

      <details className="mb-6 rounded-xl border border-gray-200 p-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">
          ⚙️ Course settings (exam date, study time)
        </summary>
        <form action={updateCourse} className="mt-4 space-y-4">
          <input type="hidden" name="courseId" value={course.id} />
          <div className="flex flex-wrap gap-4">
            <label className="text-sm">
              <span className="block font-medium">Exam date</span>
              <input
                type="date"
                name="examDate"
                defaultValue={course.examDate.toISOString().slice(0, 10)}
                className="mt-1 rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block font-medium">Minutes / day</span>
              <input
                type="number"
                name="minutesPerDay"
                defaultValue={course.minutesPerDay}
                min={15}
                step={15}
                className="mt-1 w-28 rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
          </div>
          <div>
            <span className="block text-sm font-medium">Study days</span>
            <div className="mt-2 flex flex-wrap gap-3">
              {DAY_OPTS.map((d) => (
                <label key={d.v} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="studyDays"
                    value={d.v}
                    defaultChecked={course.studyDays.split(",").includes(String(d.v))}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Save & rebuild plan
          </button>
        </form>
      </details>

      {overloaded && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          ⚠️ There's more work than time left before the exam. The plan packs
          the remaining days as full as possible — consider trimming topics or
          adding study days.
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Topics</h2>
        <ul className="space-y-2">
          {course.topics.map((t) => (
            <li key={t.id}>
              <form action={toggleTopic} className="flex items-center gap-2">
                <input type="hidden" name="topicId" value={t.id} />
                <input type="hidden" name="courseId" value={course.id} />
                <button
                  type="submit"
                  className={`flex h-5 w-5 items-center justify-center rounded border ${
                    t.done
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-gray-300"
                  }`}
                  aria-label={t.done ? "Mark not done" : "Mark done"}
                >
                  {t.done ? "✓" : ""}
                </button>
                <span className={t.done ? "text-gray-400 line-through" : ""}>
                  {t.title}
                </span>
              </form>
            </li>
          ))}
          {course.topics.length === 0 && (
            <li className="text-sm text-gray-500">No topics added.</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Study plan</h2>
        {byDate.size === 0 ? (
          <p className="text-sm text-gray-500">
            Nothing scheduled — all topics done, or no study days before the
            exam. 🎉
          </p>
        ) : (
          <div className="space-y-4">
            {[...byDate.entries()].map(([date, blocks]) => {
              const d = new Date(date + "T00:00:00Z");
              return (
                <div key={date} className="rounded-xl border border-gray-200 p-4">
                  <div className="mb-2 text-sm font-medium text-gray-700">
                    {WEEKDAY[d.getUTCDay()]} · {date}
                  </div>
                  <ul className="space-y-1">
                    {blocks.map((b) => (
                      <li
                        key={b.id}
                        className="flex justify-between text-sm text-gray-600"
                      >
                        <span>{b.topicTitle}</span>
                        <span className="text-gray-400">{b.minutes} min</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

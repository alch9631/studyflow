import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isCourseOverloaded } from "@/lib/planService";
import { isSyllabusAIEnabled } from "@/lib/syllabus";
import {
  healCourse,
  toggleTopic,
  updateCourse,
  applyProgress,
  deleteCourse,
} from "../actions";

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

const BANNERS: Record<string, string> = {
  healed: "✓ Plan rebuilt around the days you have left.",
  "healed-over": "✓ Plan rebuilt — but there's more work than time. Trim topics or add study days.",
  saved: "✓ Course updated and plan rebuilt.",
  progress: "✓ Progress applied — your plan adjusted.",
  "progress-none": "No matching topics found in that update — try naming them as they appear below.",
  "progress-error": "Couldn't reach the AI to read that. Check your API key, then try again.",
};

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { id } = await params;
  const { msg } = await searchParams;
  const banner = msg ? BANNERS[msg] : undefined;
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

      {banner && (
        <div
          className={`mt-3 rounded-lg border p-3 text-sm ${
            msg?.startsWith("progress-") && msg !== "progress"
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {banner}
        </div>
      )}

      <div className="mb-6 mt-2 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">{course.name}</h1>
          <p className="text-sm text-gray-500">
            Exam {course.examDate.toISOString().slice(0, 10)} · ~
            {course.minutesPerDay} min/day to finish · {doneCount}/
            {course.topics.length} topics done
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
            <p className="self-end text-xs text-gray-400">
              Daily pace is computed automatically (~{course.minutesPerDay} min/day).
            </p>
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
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Save & rebuild plan
          </button>
        </form>

        <form action={deleteCourse} className="mt-4 border-t border-gray-100 pt-4">
          <input type="hidden" name="courseId" value={course.id} />
          <button
            type="submit"
            className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            🗑 Delete this course
          </button>
        </form>
      </details>

      {overloaded ? (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          ⏰ To finish everything in time you&apos;d need about{" "}
          {(course.minutesPerDay / 60).toFixed(1)} h/day — that&apos;s intense.
          You can still do it; starting earlier or adding study days makes it
          easier.
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          📅 StudyFlow scheduled about {course.minutesPerDay} min/day so you
          finish all topics before the exam.
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">📣 Update your progress</h2>
        {isSyllabusAIEnabled() ? (
          <form action={applyProgress} className="space-y-2">
            <input type="hidden" name="courseId" value={course.id} />
            <textarea
              name="status"
              rows={2}
              required
              placeholder="In your own words — e.g. 'done with sorting and graphs, still shaky on dynamic programming'"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              ✨ Apply & rebuild plan
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-400">
            Set <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> to
            update progress in plain language. For now, tick topics below.
          </p>
        )}
      </section>

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

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
  reoptimizeCourse,
  analyzeModuleUpload,
} from "../actions";
import FilePicker from "@/components/FilePicker";

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
  "healed-over": "✓ Plan rebuilt — it's tight, though. Adding study days or starting earlier will help it all fit.",
  saved: "✓ Course updated and plan rebuilt.",
  progress: "✓ Progress applied — your plan adjusted.",
  "progress-none": "No matching topics found in that update — try naming them as they appear below.",
  "progress-error": "Couldn't reach the AI to read that. Check your API key, then try again.",
  optimized: "✨ AI re-optimized your plan — difficulty, order, and review sessions updated.",
  "optimize-failed": "Couldn't optimize with AI (no key, or the call failed). Plan is unchanged.",
  analyzed: "✨ Analyzed your file and rebuilt the topics + plan from its actual content.",
  "analyze-error": "Couldn't analyze that file (unreadable, or AI error). Try another file.",
  "analyze-unsupported": "PPTX isn't supported yet — export the slides to PDF and upload that.",
  "analyze-nofile": "Choose a file first.",
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
      files: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!course) notFound();

  const latestFile = course.files[0];
  let fileAnalysis: { summary?: string; concepts?: string[]; prerequisites?: string[] } | null = null;
  try {
    fileAnalysis = latestFile?.analysis ? JSON.parse(latestFile.analysis) : null;
  } catch {}

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
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <Link href="/courses" className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
        ← My Courses
      </Link>

      {banner && (
        <div
          className={`mt-3 rounded-lg border p-3 text-sm ${
            ["progress-none", "progress-error", "optimize-failed", "healed-over", "analyze-error", "analyze-unsupported", "analyze-nofile"].includes(msg ?? "")
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
          }`}
        >
          {banner}
        </div>
      )}

      <div className="mb-6 mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">
            {course.name}
            {course.aiOptimized && (
              <span className="ml-2 align-middle rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-brand dark:bg-blue-950/50">
                ✨ AI-optimized
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Exam {course.examDate.toISOString().slice(0, 10)} · ~
            {course.minutesPerDay} min/day to finish · {doneCount}/
            {course.topics.length} topics done
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
          {isSyllabusAIEnabled() && (
            <form action={reoptimizeCourse}>
              <input type="hidden" name="courseId" value={course.id} />
              <button
                type="submit"
                className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
              >
                ✨ Optimize with AI
              </button>
            </form>
          )}
          <form action={healCourse}>
            <input type="hidden" name="courseId" value={course.id} />
            <button
              type="submit"
              className="rounded-full border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              😵‍💫 I fell behind — replan
            </button>
          </form>
        </div>
      </div>

      <details className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200">
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
                className="mt-1 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2"
              />
            </label>
            <p className="self-end text-xs text-gray-400 dark:text-gray-500">
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

        <form action={deleteCourse} className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
          <input type="hidden" name="courseId" value={course.id} />
          <button
            type="submit"
            className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            🗑 Delete this course
          </button>
        </form>
      </details>

      {overloaded ? (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          ⏰ Even at a realistic ~3 h/day across all your courses, there isn&apos;t
          quite enough time to finish this one before the exam. Starting earlier,
          adding study days, or easing your other modules will help.
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          📅 Planned at about {course.minutesPerDay} min/day for this course —
          balanced within your ~3 h/day total across all modules.
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
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              ✨ Apply & rebuild plan
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Set <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> to
            update progress in plain language. For now, tick topics below.
          </p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">📎 Module files</h2>
        {isSyllabusAIEnabled() ? (
          <form action={analyzeModuleUpload} className="space-y-3">
            <input type="hidden" name="courseId" value={course.id} />
            <FilePicker />
            <button
              type="submit"
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              ✨ Analyze file &amp; rebuild plan from its content
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Set <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> to analyze
            uploaded materials.
          </p>
        )}
        {latestFile && (
          <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm">
            <div className="font-medium">📄 {latestFile.filename}</div>
            {fileAnalysis?.summary && (
              <p className="mt-1 text-gray-600 dark:text-gray-300">{fileAnalysis.summary}</p>
            )}
            {fileAnalysis?.concepts && fileAnalysis.concepts.length > 0 && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Concepts: {fileAnalysis.concepts.slice(0, 8).join(", ")}
              </p>
            )}
            {fileAnalysis?.prerequisites && fileAnalysis.prerequisites.length > 0 && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Prerequisites: {fileAnalysis.prerequisites.join(", ")}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Topics</h2>
        <ul className="space-y-2">
          {course.topics.map((t) => {
            let questions: string[] = [];
            try {
              questions = t.questions ? (JSON.parse(t.questions) as string[]) : [];
            } catch {}
            return (
              <li key={t.id}>
                <form action={toggleTopic} className="flex items-center gap-2">
                  <input type="hidden" name="topicId" value={t.id} />
                  <input type="hidden" name="courseId" value={course.id} />
                  <button
                    type="submit"
                    className={`flex h-5 w-5 items-center justify-center rounded border ${
                      t.done
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-gray-300 dark:border-gray-700"
                    }`}
                    aria-label={t.done ? "Mark not done" : "Mark done"}
                  >
                    {t.done ? "✓" : ""}
                  </button>
                  <span className={t.done ? "text-gray-400 dark:text-gray-500 line-through" : ""}>
                    {t.title}
                  </span>
                </form>
                {questions.length > 0 && (
                  <details className="ml-7 mt-1">
                    <summary className="cursor-pointer text-xs text-brand">
                      🧠 Self-test ({questions.length})
                    </summary>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
                      {questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
          {course.topics.length === 0 && (
            <li className="text-sm text-gray-500 dark:text-gray-400">No topics added.</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Study plan</h2>
        {byDate.size === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nothing scheduled — all topics done, or no study days before the
            exam. 🎉
          </p>
        ) : (
          <div className="space-y-4">
            {[...byDate.entries()].map(([date, blocks]) => {
              const d = new Date(date + "T00:00:00Z");
              return (
                <div key={date} className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                  <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    {WEEKDAY[d.getUTCDay()]} · {date}
                  </div>
                  <ul className="space-y-1">
                    {blocks.map((b) => (
                      <li
                        key={b.id}
                        className="flex justify-between text-sm text-gray-600 dark:text-gray-300"
                      >
                        <span>{b.topicTitle}</span>
                        <span className="text-gray-400 dark:text-gray-500">{b.minutes} min</span>
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

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isCourseOverloaded, todayISO } from "@/lib/planService";
import { isSyllabusAIEnabled } from "@/lib/syllabus";
import { daysUntil, examCountdownLabel, dueLabel } from "@/lib/dates";
import {
  healCourse,
  toggleTopic,
  updateCourse,
  deleteCourse,
  reoptimizeCourse,
  analyzeModuleUpload,
  toggleAssignment,
  deleteAssignment,
  setGrade,
} from "../actions";
import FilePicker from "@/components/FilePicker";
import ToastForm from "@/components/ToastForm";
import OptimisticToggleForm from "@/components/OptimisticToggleForm";
import SubmitButton from "@/components/SubmitButton";
import ConfirmDialog from "@/components/ConfirmDialog";
import { iconButtonClass } from "@/components/ui";
import ProgressForm from "./ProgressForm";
import AddDeadlineForm from "./AddDeadlineForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const course = await prisma.course.findUnique({ where: { id }, select: { name: true } });
  return {
    title: course?.name ?? "Course",
    description: course
      ? `Study plan, topics, and deadlines for ${course.name}.`
      : "Course study plan, topics, and deadlines.",
  };
}

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
  graded: "✓ Grade saved.",
  "past-exam": "Exam date can't be in the past — not saved.",
  "rate-limited": "You're doing that a lot — give it a minute and try again.",
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
    select: {
      id: true,
      name: true,
      examDate: true,
      studyDays: true,
      minutesPerDay: true,
      aiOptimized: true,
      grade: true,
      topics: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, done: true, questions: true },
      },
      blocks: {
        orderBy: { date: "asc" },
        select: { id: true, date: true, topicTitle: true, minutes: true },
      },
      files: {
        orderBy: { createdAt: "desc" },
        select: { filename: true, analysis: true },
      },
      assignments: {
        orderBy: { dueDate: "asc" },
        select: { id: true, title: true, dueDate: true, done: true },
      },
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
  const examInDays = daysUntil(course.examDate, todayISO());

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
          aria-live="polite"
          className={`mt-3 rounded-lg border p-3 text-sm ${
            ["progress-none", "progress-error", "optimize-failed", "healed-over", "analyze-error", "analyze-unsupported", "analyze-nofile", "past-exam", "rate-limited"].includes(msg ?? "")
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
          }`}
        >
          {banner}
        </div>
      )}

      <div className="mb-6 mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">
            {course.name}
            {course.aiOptimized && (
              <span className="ml-2 align-middle rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-brand dark:bg-blue-950/50">
                ✨ AI-optimized
              </span>
            )}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                examInDays < 0
                  ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  : examInDays <= 7
                    ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                    : examInDays <= 21
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                      : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
              }`}
            >
              ⏳ {examCountdownLabel(examInDays)}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Exam {course.examDate.toISOString().slice(0, 10)} · ~{course.minutesPerDay} min/day · {doneCount}/
              {course.topics.length} topics done
            </span>
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
          {isSyllabusAIEnabled() && (
            <form action={reoptimizeCourse} className="w-full sm:w-auto">
              <input type="hidden" name="courseId" value={course.id} />
              <SubmitButton
                variant="primary"
                size="md"
                className="w-full sm:w-auto"
                pendingLabel="Optimizing…"
              >
                ✨ Optimize with AI
              </SubmitButton>
            </form>
          )}
          <form action={healCourse} className="w-full sm:w-auto">
            <input type="hidden" name="courseId" value={course.id} />
            <SubmitButton
              variant="secondary"
              size="md"
              className="w-full sm:w-auto"
              pendingLabel="Replanning…"
            >
              😵‍💫 I fell behind — replan
            </SubmitButton>
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
            <div className="text-sm">
              <label htmlFor="settings-examDate" className="block font-medium">
                Exam date
              </label>
              <input
                id="settings-examDate"
                type="date"
                name="examDate"
                defaultValue={course.examDate.toISOString().slice(0, 10)}
                className="mt-1 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2"
              />
            </div>
            <p className="self-end text-xs text-gray-500 dark:text-gray-400">
              Daily pace is computed automatically (~{course.minutesPerDay} min/day).
            </p>
          </div>
          <fieldset>
            <legend className="block text-sm font-medium">Study days</legend>
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
          </fieldset>
          <SubmitButton
            variant="primary"
            size="md"
            className="w-full sm:w-auto"
            pendingLabel="Saving…"
          >
            Save & rebuild plan
          </SubmitButton>
        </form>

        <form action={setGrade} className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
          <input type="hidden" name="courseId" value={course.id} />
          <div className="text-sm">
            <label htmlFor="settings-grade" className="block font-medium">
              Final grade (1.0–5.0)
            </label>
            <input
              id="settings-grade"
              type="number"
              name="grade"
              step="0.1"
              min="1"
              max="5"
              defaultValue={course.grade ?? ""}
              placeholder="e.g. 1.7"
              className="mt-1 w-28 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700"
            />
          </div>
          <SubmitButton variant="secondary" size="md" pendingLabel="Saving…">
            Save grade
          </SubmitButton>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Leave empty to clear. Counts toward your Notenschnitt in Insights.
          </span>
        </form>

        <ConfirmDialog
          action={deleteCourse}
          fields={{ courseId: course.id }}
          className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800"
          triggerLabel="🗑 Delete this course"
          triggerVariant="danger"
          triggerSize="md"
          title="Delete this course?"
          message={
            <>
              Deleting <strong>{course.name}</strong> also removes its topics,
              deadlines, files, and study plan. This can&apos;t be undone.
            </>
          }
          confirmLabel="Delete course"
          errorMessage="Couldn't delete that course — please try again."
        />
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
          <ProgressForm courseId={course.id} />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
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
            <SubmitButton
              variant="primary"
              size="md"
              className="w-full sm:w-auto"
              pendingLabel="Analyzing…"
            >
              ✨ Analyze file &amp; rebuild plan from its content
            </SubmitButton>
          </form>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
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
        <h2 className="mb-2 text-lg font-semibold">📝 Deadlines</h2>
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
          Homework, lab reports, hand-ins — anything due before the exam.
        </p>
        <AddDeadlineForm courseId={course.id} />
        {course.assignments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No deadlines yet.</p>
        ) : (
          <ul className="space-y-2">
            {course.assignments.map((a) => {
              const days = daysUntil(a.dueDate, todayISO());
              const due = a.dueDate.toISOString().slice(0, 10);
              const urgent = !a.done && days <= 3;
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
                >
                  <ToastForm
                    action={toggleAssignment}
                    successMessage={a.done ? "Deadline marked not done." : "Deadline done. ✓"}
                    errorMessage="Couldn't update that deadline — please try again."
                  >
                    <input type="hidden" name="assignmentId" value={a.id} />
                    <input type="hidden" name="revalidate" value={`/courses/${course.id}`} />
                    <SubmitButton
                      aria-label={a.done ? "Mark not done" : "Mark done"}
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        a.done
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-gray-300 dark:border-gray-700"
                      }`}
                    >
                      {a.done ? "✓" : ""}
                    </SubmitButton>
                  </ToastForm>
                  <span className="min-w-0 flex-1">
                    <span className={`break-words ${a.done ? "text-gray-500 line-through dark:text-gray-400" : "font-medium"}`}>
                      {a.title}
                    </span>
                    <span
                      className={`ml-2 text-xs ${
                        a.done
                          ? "text-gray-500 dark:text-gray-400"
                          : urgent
                            ? "font-medium text-red-600 dark:text-red-400"
                            : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      due {due}
                      {!a.done && ` · ${dueLabel(days)}`}
                    </span>
                  </span>
                  <ConfirmDialog
                    action={deleteAssignment}
                    fields={{ assignmentId: a.id, courseId: course.id }}
                    successMessage="Deadline removed."
                    errorMessage="Couldn't remove that deadline — please try again."
                    className="shrink-0"
                    triggerLabel="✕"
                    triggerAriaLabel={`Delete deadline: ${a.title}`}
                    triggerClassName={iconButtonClass(
                      "inline-flex text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-800",
                    )}
                    title="Delete this deadline?"
                    message={
                      <>
                        Remove <strong>{a.title}</strong> from this course? This
                        can&apos;t be undone.
                      </>
                    }
                    confirmLabel="Delete deadline"
                    pendingLabel="Removing…"
                  />
                </li>
              );
            })}
          </ul>
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
                <OptimisticToggleForm
                  action={toggleTopic}
                  done={t.done}
                  doneMessage="Topic done — plan updated. ✓"
                  undoneMessage="Topic reopened — plan updated."
                  errorMessage="Couldn't update that topic — please try again."
                  className="flex items-start gap-2"
                >
                  {(done) => (
                    <>
                      <input type="hidden" name="topicId" value={t.id} />
                      <input type="hidden" name="courseId" value={course.id} />
                      <button
                        type="submit"
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                          done
                            ? "border-green-500 bg-green-500 text-white"
                            : "border-gray-300 dark:border-gray-700"
                        }`}
                        aria-pressed={done}
                        aria-label={done ? "Mark not done" : "Mark done"}
                      >
                        {done ? "✓" : ""}
                      </button>
                      <span className={`min-w-0 break-words ${done ? "text-gray-500 dark:text-gray-400 line-through" : ""}`}>
                        {t.title}
                      </span>
                    </>
                  )}
                </OptimisticToggleForm>
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
                        className="flex justify-between gap-3 text-sm text-gray-600 dark:text-gray-300"
                      >
                        <span className="min-w-0 break-words">{b.topicTitle}</span>
                        <span className="shrink-0 whitespace-nowrap text-gray-500 dark:text-gray-400">{b.minutes} min</span>
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

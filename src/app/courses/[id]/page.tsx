import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isCourseOverloaded, todayISO } from "@/lib/planService";
import { isSyllabusAIEnabled } from "@/lib/syllabus";
import { daysUntil } from "@/lib/dates";
import { getT } from "@/components/i18n/server";
import { examCountdownLabel, dueLabel, type MessageKey } from "@/components/i18n/messages";
import {
  healCourse,
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
import TopicToggle from "./TopicToggle";
import NoteEditor from "./NoteEditor";
import SubmitButton from "@/components/SubmitButton";
import ConfirmDialog from "@/components/ConfirmDialog";
import { iconButtonClass } from "@/components/ui";
import { Input } from "@/components/ui/input";
import ProgressForm from "./ProgressForm";
import AddDeadlineForm from "./AddDeadlineForm";
import CourseOptionsSheet from "./CourseOptionsSheet";
import PageToast from "./PageToast";
import { AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedList";

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

// Map weekday index → the charts.weekdays short-key, so the labels localize.
const WEEKDAY_KEY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_OPTS = [
  { v: 1, key: "Mo" },
  { v: 2, key: "Tu" },
  { v: 3, key: "We" },
  { v: 4, key: "Th" },
  { v: 5, key: "Fr" },
  { v: 6, key: "Sa" },
  { v: 0, key: "Su" },
] as const;

const BANNER_KEYS = new Set([
  "healed",
  "healed-over",
  "saved",
  "progress",
  "progress-none",
  "progress-error",
  "optimized",
  "optimize-failed",
  "ai-unconfigured",
  "ai-offline",
  "heal-failed",
  "analyzed",
  "analyze-error",
  "analyze-unsupported",
  "analyze-nofile",
  "graded",
  "past-exam",
  "rate-limited",
]);

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { id } = await params;
  const { msg } = await searchParams;
  const t = await getT();
  const banner = msg && BANNER_KEYS.has(msg) ? t(`courseDetail.banners.${msg}` as MessageKey) : undefined;
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
        select: {
          id: true,
          title: true,
          done: true,
          questions: true,
          note: { select: { body: true } },
        },
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
      <div className="mb-2 flex items-center justify-between gap-2">
      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <span aria-hidden="true">←</span> {t("courseDetail.back")}
      </Link>
          <CourseOptionsSheet>
            <form action={updateCourse} className="space-y-4">
              <input type="hidden" name="courseId" value={course.id} />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {t("courseDetail.settingsSummary")}
              </h3>
              <div className="flex flex-wrap gap-4">
                <div className="text-sm">
                  <label htmlFor="settings-examDate" className="block font-medium">
                    {t("courseDetail.examDate")}
                  </label>
                  <Input
                    id="settings-examDate"
                    type="date"
                    name="examDate"
                    defaultValue={course.examDate.toISOString().slice(0, 10)}
                    className="mt-1"
                  />
                </div>
                <p className="self-end text-xs text-gray-500 dark:text-gray-400">
                  {t("courseDetail.dailyPaceHint", { minutes: course.minutesPerDay })}
                </p>
              </div>
              <fieldset>
                <legend className="block text-sm font-medium">{t("courseDetail.studyDays")}</legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {DAY_OPTS.map((d) => (
                    <label key={d.v} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        name="studyDays"
                        value={d.v}
                        defaultChecked={course.studyDays.split(",").includes(String(d.v))}
                      />
                      {t(`charts.weekdaysShort.${d.key}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <SubmitButton
                variant="primary"
                size="md"
                className="w-full sm:w-auto"
                pendingLabel={t("common.saving")}
              >
                {t("courseDetail.saveRebuild")}
              </SubmitButton>
            </form>

            <form action={setGrade} className="mt-6 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-6 dark:border-gray-800">
              <input type="hidden" name="courseId" value={course.id} />
              <div className="text-sm">
                <label htmlFor="settings-grade" className="block font-medium">
                  {t("courseDetail.finalGrade")}
                </label>
                <Input
                  id="settings-grade"
                  type="number"
                  name="grade"
                  step="0.1"
                  min="1"
                  max="5"
                  defaultValue={course.grade ?? ""}
                  placeholder={t("courseDetail.gradePlaceholder")}
                  className="mt-1 w-28"
                />
              </div>
              <SubmitButton variant="secondary" size="md" pendingLabel={t("common.saving")}>
                {t("courseDetail.saveGrade")}
              </SubmitButton>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t("courseDetail.gradeHint")}
              </span>
            </form>

            <section className="mt-6 border-t border-gray-100 pt-6 dark:border-gray-800">
              <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                {t("courseDetail.deadlinesHeading")}
              </h3>
              <AddDeadlineForm courseId={course.id} />
              {course.assignments.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("courseDetail.noDeadlines")}</p>
              ) : (
                <AnimatedList className="space-y-2">
                  {course.assignments.map((a) => {
                    const days = daysUntil(a.dueDate, todayISO());
                    const due = a.dueDate.toISOString().slice(0, 10);
                    const urgent = !a.done && days <= 3;
                    return (
                      <AnimatedListItem
                        key={a.id}
                        id={`deadline-${a.id}`}
                        className="flex scroll-mt-24 items-center gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800 [&:target]:border-brand [&:target]:ring-2 [&:target]:ring-brand"
                      >
                        <ToastForm
                          action={toggleAssignment}
                          successMessage={a.done ? t("courseDetail.deadlineNotDone") : t("courseDetail.deadlineDone")}
                          errorMessage={t("courseDetail.deadlineUpdateError")}
                        >
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <input type="hidden" name="revalidate" value={`/courses/${course.id}`} />
                          <SubmitButton
                            aria-label={a.done ? t("block.markNotDone") : t("block.markDone")}
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
                            {t("courseDetail.due", { date: due })}
                            {!a.done && ` · ${dueLabel(t, days)}`}
                          </span>
                        </span>
                        <ConfirmDialog
                          action={deleteAssignment}
                          fields={{ assignmentId: a.id, courseId: course.id }}
                          successMessage={t("courseDetail.deadlineRemoved")}
                          errorMessage={t("courseDetail.deadlineRemoveError")}
                          className="shrink-0"
                          triggerLabel="✕"
                          triggerAriaLabel={t("courseDetail.deleteDeadlineAria", { title: a.title })}
                          triggerClassName={iconButtonClass(
                            "inline-flex text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-800",
                          )}
                          title={t("courseDetail.deleteDeadlineTitle")}
                          message={
                            <>
                              {t("courseDetail.deleteDeadlineMsgPre")} <strong>{a.title}</strong>{" "}
                              {t("courseDetail.deleteDeadlineMsgPost")}
                            </>
                          }
                          confirmLabel={t("courseDetail.deleteDeadlineConfirm")}
                          pendingLabel={t("courseDetail.removing")}
                        />
                      </AnimatedListItem>
                    );
                  })}
                </AnimatedList>
              )}
            </section>

            <ConfirmDialog
              action={deleteCourse}
              fields={{ courseId: course.id }}
              className="mt-6 border-t border-gray-100 pt-6 dark:border-gray-800"
              triggerLabel={t("courseDetail.deleteCourse")}
              triggerVariant="danger"
              triggerSize="md"
              title={t("courseDetail.deleteTitle")}
              message={
                <>
                  {t("courseDetail.deleteMsgPre")} <strong>{course.name}</strong>{" "}
                  {t("courseDetail.deleteMsgPost")}
                </>
              }
              confirmLabel={t("courseDetail.deleteConfirm")}
              errorMessage={t("courseDetail.deleteError")}
            />
          </CourseOptionsSheet>
      </div>

      {banner && (
        <PageToast
          message={banner}
          variant={
            ["progress-none", "progress-error", "optimize-failed", "ai-unconfigured", "ai-offline", "heal-failed", "healed-over", "analyze-error", "analyze-unsupported", "analyze-nofile", "past-exam", "rate-limited"].includes(msg ?? "")
              ? "error"
              : "success"
          }
        />
      )}

      <div className="mb-6 mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{course.name}</h1>
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
              ⏳ {examCountdownLabel(t, examInDays)}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t("courseDetail.examOn", {
                date: course.examDate.toISOString().slice(0, 10),
                minutes: course.minutesPerDay,
                done: doneCount,
                total: course.topics.length,
              })}
            </span>
          </div>
        </div>
        <div className="flex w-full shrink-0 items-stretch gap-2 sm:w-auto sm:items-end">
          {isSyllabusAIEnabled() && (
            <form action={reoptimizeCourse} className="min-w-0 flex-1 sm:flex-none">
              <input type="hidden" name="courseId" value={course.id} />
              <SubmitButton
                variant="primary"
                size="md"
                className="w-full sm:w-auto"
                pendingLabel={t("courseDetail.optimizing")}
              >
                {t("courseDetail.optimizeWithAI")}
              </SubmitButton>
            </form>
          )}
          <form action={healCourse} className="min-w-0 flex-1 sm:flex-none">
            <input type="hidden" name="courseId" value={course.id} />
            <SubmitButton
              variant="secondary"
              size="md"
              className="w-full sm:w-auto"
              pendingLabel={t("courseDetail.replanning")}
            >
              {t("courseDetail.fellBehind")}
            </SubmitButton>
          </form>
        </div>
      </div>

      {overloaded && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {t("courseDetail.overloaded")}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">{t("courseDetail.moduleFiles")}</h2>
        {isSyllabusAIEnabled() ? (
          <form action={analyzeModuleUpload} className="space-y-3">
            <input type="hidden" name="courseId" value={course.id} />
            <FilePicker />
            <SubmitButton
              variant="primary"
              size="md"
              className="w-full sm:w-auto"
              pendingLabel={t("courseDetail.analyzing")}
            >
              {t("courseDetail.analyzeFile")}
            </SubmitButton>
          </form>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("courseDetail.apiKeyFiles")}
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
                {t("courseDetail.concepts", { list: fileAnalysis.concepts.slice(0, 8).join(", ") })}
              </p>
            )}
            {fileAnalysis?.prerequisites && fileAnalysis.prerequisites.length > 0 && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {t("courseDetail.prerequisites", { list: fileAnalysis.prerequisites.join(", ") })}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">{t("courseDetail.topics")}</h2>
        <AnimatedList className="space-y-2">
          {course.topics.map((topic) => {
            let questions: string[] = [];
            try {
              questions = topic.questions ? (JSON.parse(topic.questions) as string[]) : [];
            } catch {}
            return (
              <AnimatedListItem
                key={topic.id}
                id={`topic-${topic.id}`}
                className="relative scroll-mt-24 rounded-xl border border-gray-200 p-3 pr-9 dark:border-gray-800 [&:target]:ring-2 [&:target]:ring-brand [&:target]:ring-offset-2 [&:target]:ring-offset-white dark:[&:target]:ring-offset-gray-950"
              >
                <TopicToggle
                  topicId={topic.id}
                  courseId={course.id}
                  title={topic.title}
                  done={topic.done}
                />
                <NoteEditor
                  topicId={topic.id}
                  topicTitle={topic.title}
                  initialBody={topic.note?.body ?? ""}
                />
                {questions.length > 0 && (
                  <details className="ml-7 mt-1">
                    <summary className="cursor-pointer text-xs text-brand-ink">
                      {t("courseDetail.selfTest", { count: questions.length })}
                    </summary>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
                      {questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </AnimatedListItem>
            );
          })}
          {course.topics.length === 0 && (
            <AnimatedListItem key="empty" className="text-sm text-gray-500 dark:text-gray-400">
              {t("courseDetail.noTopics")}
            </AnimatedListItem>
          )}
        </AnimatedList>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">{t("courseDetail.studyPlan")}</h2>
        {byDate.size === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("courseDetail.nothingScheduled")}
          </p>
        ) : (
          <div className="space-y-2">
            {[...byDate.entries()].map(([date, blocks], i) => {
              const d = new Date(date + "T00:00:00Z");
              const totalMin = blocks.reduce((s, b) => s + b.minutes, 0);
              return (
                <details key={date} open={i === 0} className="group rounded-xl border border-gray-200 dark:border-gray-800">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-gray-400 transition-transform group-open:rotate-90">›</span>
                      {t(`charts.weekdaysShort.${WEEKDAY_KEY[d.getUTCDay()]}` as MessageKey)} · {date}
                    </span>
                    <span className="shrink-0 text-xs font-normal text-gray-500 dark:text-gray-400">
                      {t.n("courseDetail.blockCount", blocks.length, { min: totalMin })}
                    </span>
                  </summary>
                  <ul className="space-y-1 px-4 pb-4">
                    {blocks.map((b) => (
                      <li
                        key={b.id}
                        className="flex justify-between gap-3 text-sm text-gray-600 dark:text-gray-300"
                      >
                        <span className="min-w-0 break-words">{b.topicTitle}</span>
                        <span className="shrink-0 whitespace-nowrap text-gray-500 dark:text-gray-400">{b.minutes} {t("common.min")}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t("courseDetail.updateProgressHeading")}</h2>
        {isSyllabusAIEnabled() ? (
          <ProgressForm courseId={course.id} />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("courseDetail.apiKeyProgress")}
          </p>
        )}
      </section>
    </main>
  );
}

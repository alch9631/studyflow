import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { X, Trash2, Check, AlertTriangle, Hourglass, FileText, ArrowLeft, Sparkles, Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { courseOverloadInfo, todayISO } from "@/lib/planService";
import { coursePassed } from "@/lib/coursePassed";
import { isSyllabusAIEnabled } from "@/lib/syllabus";
import { daysUntil, formatFriendlyDate } from "@/lib/dates";
import { getT } from "@/components/i18n/server";
import { examCountdownLabel, dueLabel, type MessageKey, type Translator } from "@/components/i18n/messages";
import {
  updateCourse,
  deleteCourse,
  refreshPlan,
  deleteModuleFile,
  toggleAssignment,
  deleteAssignment,
  setGrade,
  setCoursePassed,
} from "../actions";
import ModuleUploadForm from "@/components/ModuleUploadForm";
import StudyTaskForm from "@/components/StudyTaskForm";
import { readStudyTask, taskSourceHref } from "@/lib/studyTask";
import { availableMaterialIds } from "@/lib/materials";
import MaterialStudyActions from "@/components/MaterialStudyActions";
import ToastForm from "@/components/ToastForm";
import TopicToggle from "./TopicToggle";
import TopicMeta from "./TopicMeta";
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
  // Ownership-scoped so a non-owner can't read another user's course name via the
  // page <title> / meta description (the page body itself is scoped below).
  const userId = await getCurrentUserId();
  const course = await prisma.course.findFirst({ where: { id, userId }, select: { name: true } });
  return {
    title: course?.name ?? "Course",
    description: course
      ? `Study plan, topics, and deadlines for ${course.name}.`
      : "Course study plan, topics, and deadlines.",
  };
}

const DAY_OPTS = [
  { v: 1, key: "Mo" },
  { v: 2, key: "Tu" },
  { v: 3, key: "We" },
  { v: 4, key: "Th" },
  { v: 5, key: "Fr" },
  { v: 6, key: "Sa" },
  { v: 0, key: "Su" },
] as const;

/**
 * Calm, localized "about N h/day" / "about N min/day" from a minutes/day figure.
 * Avoids the alarmist precision of a raw "203 min/day": rounds to a friendly
 * half-hour once we're past an hour, and keeps it in minutes only when small.
 * The banner uses this so the required pace reads like a human estimate, not a
 * stopwatch — and stays consistent with the page's other pace copy.
 */
function hoursLabel(t: Translator, minutesPerDay: number): string {
  const min = Math.max(0, Math.round(minutesPerDay));
  if (min < 60) return t("courseDetail.overload.minPerDay", { min });
  const hours = Math.round((min / 60) * 2) / 2; // nearest half hour
  // Drop a trailing ".0" and localize the decimal separator (de uses a comma).
  const text = Number.isInteger(hours)
    ? String(hours)
    : hours.toLocaleString(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return t("courseDetail.overload.hoursPerDay", { hours: text });
}

const BANNER_KEYS = new Set([
  "saved",
  "progress",
  "progress-none",
  "progress-error",
  "plan-refreshed",
  "plan-tuned",
  "ai-unconfigured",
  "ai-offline",
  "heal-failed",
  "analyzed",
  "analyze-error",
  "analyze-notopics",
  "analyze-unsupported",
  "analyze-nofile",
  "imported-basic",
  "graded",
  "grade-invalid",
  "passed",
  "passed-cleared",
  "past-exam",
  "exam-too-far",
  "limit-assignments",
  "rate-limited",
]);

/**
 * Which banners get the "error" toast treatment. That variant isn't only for
 * failures — it's the one that lingers long enough to actually be read, so
 * caveats that need acting on (a plan that barely fits, an import that couldn't
 * be optimized, a file that yielded no topics) belong here too. Everything else
 * is a quick success flash.
 */
const ERROR_BANNERS = new Set([
  "progress-none",
  "progress-error",
  "ai-unconfigured",
  "ai-offline",
  "heal-failed",
  "analyze-error",
  "analyze-notopics",
  "analyze-unsupported",
  "analyze-nofile",
  "imported-basic",
  "past-exam",
  "exam-too-far",
  "limit-assignments",
  "rate-limited",
]);

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ materials?: string; msg?: string; prepare?: string }>;
}) {
  const { id } = await params;
  const { msg, prepare } = await searchParams;
  const t = await getT();
  const userId = await getCurrentUserId();
  const banner = msg && BANNER_KEYS.has(msg) ? t(`courseDetail.banners.${msg}` as MessageKey) : undefined;
  // Ownership-scoped: a course id the current user doesn't own is treated as
  // not-found, never rendered — otherwise any signed-in user could read another
  // user's topics, notes, grades and uploaded-file analyses by guessing the id.
  const course = await prisma.course.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      examDate: true,
      studyDays: true,
      minutesPerDay: true,
      difficulty: true,
      aiOptimized: true,
      grade: true,
      passed: true,
      topics: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          done: true,
          questions: true,
          studyTask: true,
          parentTopicId: true,
          confidence: true,
          note: { select: { body: true } },
        },
      },
      blocks: {
        orderBy: { date: "asc" },
        select: { id: true, date: true, topicTitle: true, minutes: true, completed: true },
      },
      files: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          filename: true,
          analysis: true,
          studyDrafts: true,
        },
      },
      assignments: {
        orderBy: { dueDate: "asc" },
        select: { id: true, title: true, dueDate: true, done: true },
      },
    },
  });
  if (!course) notFound();

  const originalIds = new Set((await availableMaterialIds(userId, course.id)).map((file) => file.id));
  const taskMaterials = course.files.filter((file) => originalIds.has(file.id)).map(({ id, filename }) => ({ id, filename }));

  const overload = await courseOverloadInfo(course.id);
  const rootTopics = course.topics.filter((topic) => !topic.parentTopicId);
  const doneCount = rootTopics.filter((topic) => topic.done).length;
  const today = todayISO();
  const examInDays = daysUntil(course.examDate, today);
  // Passed (bestanden / passing grade): the header swaps countdown-and-plan
  // actions for a calm done state with an undo.
  const passed = coursePassed(course);

  // Delete guardrail: real progress (completed study sessions + done topics) that
  // would be lost. Surfaced as a stronger warning line in the delete confirm so a
  // course with history isn't dropped on a careless tap.
  const completedSessions = course.blocks.filter((b) => b.completed).length;
  const progressCount = completedSessions + doneCount;
  const deleteProgressWarning =
    progressCount > 0
      ? t.locale === "de"
        ? `Dieser Kurs hat ${completedSessions} abgeschlossene Lernsession(s) und ${doneCount} erledigte Themen. Das Löschen ist endgültig.`
        : `This course has ${completedSessions} completed sessions and ${doneCount} done topics. Deleting is permanent.`
      : null;

  // Split study blocks into the FORWARD plan (today onward) and MISSED sessions
  // (past dates whose work was never completed). Past unfinished blocks are not
  // the active plan — surfacing them as "today's plan" is a lie, so they go in
  // their own "Missed" group and the recovery (heal) flow is the real next step.
  // Past blocks that WERE completed are durable history, not missed — drop them
  // from this forward-looking list entirely.
  const byDate = new Map<string, typeof course.blocks>();
  const missed: typeof course.blocks = [];
  for (const b of course.blocks) {
    const key = b.date.toISOString().slice(0, 10);
    if (key < today) {
      if (!b.completed) missed.push(b);
      continue;
    }
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(b);
  }
  const missedMinutes = missed.reduce((s, b) => s + b.minutes, 0);

  // Whether AI Practice Mode has anything to show: at least one topic carries a
  // non-empty `questions` JSON array. Gates the "Practice" entry point so it
  // never leads into an empty state.
  const hasPracticeQuestions = course.topics.some((topic) => {
    if (readStudyTask(topic.studyTask)?.checkQuestion) return true;
    if (!topic.questions) return false;
    try {
      const parsed = JSON.parse(topic.questions);
      return Array.isArray(parsed) && parsed.some((q) => typeof q === "string" && q.trim().length > 0);
    } catch {
      return false;
    }
  });

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="mb-2 flex items-center justify-between gap-2">
      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("courseDetail.back")}
      </Link>
          <CourseOptionsSheet>
            <section className="mb-6">
        <div className="flex w-full shrink-0 items-stretch gap-2 sm:w-auto sm:items-end">
          {passed ? (
            // Undo is only offered when the pass came from the FLAG — a pass
            // recorded as a grade (≤ 4.0) is undone by editing the grade in the
            // course options, not by this toggle.
            course.passed && (
              <form action={setCoursePassed} className="min-w-0 flex-1 sm:flex-none">
                <input type="hidden" name="courseId" value={course.id} />
                <input type="hidden" name="passed" value="0" />
                <SubmitButton
                  variant="secondary"
                  size="md"
                  className="w-full sm:w-auto"
                  pendingLabel={t("common.saving")}
                >
                  {t("courseDetail.unmarkPassed")}
                </SubmitButton>
              </form>
            )
          ) : (
            <>
              {/* The one-tap "I'm done with this module" — wipes its pending
                  sessions from the plan and stops all countdowns/nagging. */}
              <form action={setCoursePassed} className="min-w-0 flex-1 sm:flex-none">
                <input type="hidden" name="courseId" value={course.id} />
                <input type="hidden" name="passed" value="1" />
                <SubmitButton
                  variant="secondary"
                  size="md"
                  className="w-full sm:w-auto"
                  pendingLabel={t("common.saving")}
                >
                  {t("courseDetail.markPassed")}
                </SubmitButton>
              </form>
              <form action={refreshPlan} className="min-w-0 flex-1 sm:flex-none">
                <input type="hidden" name="courseId" value={course.id} />
                <SubmitButton
                  variant="primary"
                  size="md"
                  className="w-full sm:w-auto"
                  pendingLabel={t("courseDetail.refreshingPlan")}
                >
                  {t("courseDetail.refreshPlan")}
                </SubmitButton>
              </form>
            </>
          )}
        </div>
            </section>
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
                    // Mirror the server's requireDate bounds (not past, ≤ 2 years
                    // out) so bad dates are blocked before the round-trip.
                    min={todayISO()}
                    max={`${Number(todayISO().slice(0, 4)) + 2}${todayISO().slice(4)}`}
                    className="mt-1"
                  />
                </div>
                <div className="text-sm">
                  <label htmlFor="settings-difficulty" className="block font-medium">
                    {t("courseDetail.difficulty")}
                  </label>
                  <select
                    id="settings-difficulty"
                    name="difficulty"
                    defaultValue={String(course.difficulty)}
                    className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("courseDetail.difficultyHint")}
              </p>
              <fieldset>
                <legend className="block text-sm font-medium">{t("courseDetail.studyDays")}</legend>
                <div className="mt-2 grid grid-cols-4 gap-1 sm:flex sm:flex-wrap sm:gap-3">
                  {DAY_OPTS.map((d) => (
                    <label key={d.v} className="flex min-h-11 items-center gap-1.5 text-sm">
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
                {/* Text + decimal keypad, not type="number": German users type
                    "1,7" and number inputs swallow the comma; parseGrade
                    normalizes it. */}
                <Input
                  id="settings-grade"
                  type="text"
                  inputMode="decimal"
                  name="grade"
                  maxLength={4}
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
                    const due = formatFriendlyDate(a.dueDate.toISOString(), t.locale);
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
                            {a.done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
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
                                  ? "font-medium text-amber-700 dark:text-amber-400"
                                  : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {t("courseDetail.due", { date: due })}
                            {!a.done && ` · ${dueLabel(t, days)}`}
                          </span>
                        </span>
                        <ConfirmDialog
                          nested
                          action={deleteAssignment}
                          fields={{ assignmentId: a.id, courseId: course.id }}
                          successMessage={t("courseDetail.deadlineRemoved")}
                          errorMessage={t("courseDetail.deadlineRemoveError")}
                          className="shrink-0"
                          triggerLabel={<X className="h-4 w-4" aria-hidden="true" />}
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

            {/* Export — moved here from the old course-card ⋯ menu: the sheet is
                the one home for per-course housekeeping. A plain download link,
                no form needed. */}
            <section className="mt-6 border-t border-gray-100 pt-6 dark:border-gray-800">
              <a
                href={`/api/export?format=json&courseId=${encodeURIComponent(course.id)}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:underline dark:text-gray-200"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {t("courseDetail.exportCourse")}
              </a>
            </section>

            <ConfirmDialog
              nested
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
                  {deleteProgressWarning && (
                    <span className="mt-2 flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {deleteProgressWarning}
                    </span>
                  )}
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
          variant={ERROR_BANNERS.has(msg ?? "") ? "error" : "success"}
        />
      )}

      <div className="mb-6 mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 title={course.name} className="line-clamp-2 break-words text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">{course.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {passed ? (
              // Passed: no countdown to an exam the student is done with — one
              // quiet, positive badge instead (same treatment as the card).
              <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                {t("courses.passedBadge")}
              </span>
            ) : (
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                examInDays < 0
                  ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  : examInDays <= 7
                    // Amber, not red. The app keeps exactly ONE red mark (the
                    // nearest-exam chip on Today); a second one here would put a
                    // student inside an exam period in front of red on every
                    // screen, which reads as alarm rather than information.
                    ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
                    : examInDays <= 21
                      ? "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                      : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
              }`}
            >
              <Hourglass className="mr-1 inline-block h-3 w-3 align-[-1px]" aria-hidden="true" />
              {examCountdownLabel(t, examInDays)}
            </span>
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t("minimal.exam", { date: formatFriendlyDate(course.examDate.toISOString(), t.locale) })}
            </span>
          </div>
        </div>

      </div>

      {overload.overloaded && (
        <details className="mb-6 text-sm text-muted-foreground"><summary className="min-h-11 cursor-pointer py-3">{t("minimal.planAttention")}</summary>
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {/* Truthful, plan-derived headline: the REAL required pace + days
                  left, phrased calmly (rounded to ~h/day to match the page). */}
              {overload.cause === "few-days"
                ? t("study.crowded", { hours: hoursLabel(t, overload.requiredPerDay), days: overload.daysLeft })
                : overload.cause === "no-runway"
                ? t("courseDetail.overload.headlineNoRunway", {
                    hours: hoursLabel(t, overload.requiredPerDay),
                  })
                : t.n("courseDetail.overload.headline", overload.daysLeft, {
                    hours: hoursLabel(t, overload.requiredPerDay),
                    ceiling: hoursLabel(t, overload.ceilingPerDay),
                  })}{" "}
              {/* The actual cause, then a real next step (add study days /
                  open the recovery flow) instead of the useless "start earlier". */}
              {t(`courseDetail.overload.cause.${overload.cause}` as MessageKey)}{" "}
              {t(`courseDetail.overload.next.${overload.cause}` as MessageKey)}
            </span>
          </p>
        </details>
      )}

      <section className="mb-8" id="materials">
          <h2 className="mb-3 text-lg font-semibold">{t("courseDetail.materials")}</h2>
            <ModuleUploadForm courseId={course.id} />
            {course.files.length > 0 && <ul data-material-list className="mt-3 divide-y divide-border">
              {course.files.map((file) => <li key={file.id} className="py-2">
                <div data-material-row className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    {originalIds.has(file.id) ? <>
                      <a href={`/api/materials/${file.id}`} target="_blank" rel="noopener noreferrer" title={file.filename} className="flex min-h-11 min-w-0 items-start gap-2 py-3 text-sm font-medium underline-offset-4 hover:underline"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="block min-w-0 [overflow-wrap:anywhere]">{file.filename.split(/(?<=[_-])/).map((part, index) => <Fragment key={index}>{part}<wbr /></Fragment>)}</span></a>
                    </> : <><p className="py-3 text-sm font-medium [overflow-wrap:anywhere]">{file.filename}</p><p className="text-xs text-muted-foreground">{t("study.originalUnavailable")}</p></>}
                  </div>
                  <div className="flex shrink-0 items-start">
                  {originalIds.has(file.id) && <MaterialStudyActions compact fileId={file.id} courseId={course.id} filename={file.filename} stored={file.studyDrafts} analysis={file.analysis} autoOpen={prepare === file.id} />}
                  <ConfirmDialog action={deleteModuleFile} fields={{ moduleFileId: file.id }}
                    successMessage={t("courseDetail.fileRemoved")} errorMessage={t("courseDetail.fileRemoveError")}
                    className="shrink-0" triggerLabel={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                    triggerAriaLabel={t("courseDetail.deleteFileAria", { filename: file.filename })}
                    triggerClassName={iconButtonClass("inline-flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-destructive")}
                    title={t("courseDetail.deleteFileTitle")}
                    message={<>{t("courseDetail.deleteFileMsgPre")} <strong>{file.filename}</strong>{" "}{t("courseDetail.deleteFileMsgPost")}</>}
                    confirmLabel={t("courseDetail.deleteFileConfirm")} pendingLabel={t("courseDetail.removing")} />
                  </div>
                </div>
              </li>)}
            </ul>}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("courseDetail.topics")}</h2>
          {/* Practice entry point: a calm link into active-recall mode, shown only
              when at least one topic actually has AI-generated self-test questions
              (so it never leads to an empty state). Course-scoped via courseId. */}
          {hasPracticeQuestions && (
            <Link
              href={`/practice?courseId=${course.id}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" /> {t("courseDetail.practice")}
            </Link>
          )}
        </div>
        <AnimatedList className="space-y-2">
          {course.topics.map((topic) => {
            const task = readStudyTask(topic.studyTask);
            const sourceHref = task && taskSourceHref(task, !!task.sourceFileId && originalIds.has(task.sourceFileId));
            let questions: string[] = [];
            try {
              questions = topic.questions ? (JSON.parse(topic.questions) as string[]) : [];
            } catch {}
            return (
              <AnimatedListItem
                key={topic.id}
                id={`topic-${topic.id}`}
                className="relative scroll-mt-24 rounded-xl border border-gray-200 p-3 dark:border-gray-800 [&:target]:ring-2 [&:target]:ring-brand [&:target]:ring-offset-2 [&:target]:ring-offset-white dark:[&:target]:ring-offset-gray-950"
              >
                <div className="min-h-11 min-w-0 pr-11">
                <TopicToggle
                  topicId={topic.id}
                  courseId={course.id}
                  title={topic.title}
                  done={topic.done}
                />
                <TopicMeta
                  topicId={topic.id}
                  topicTitle={topic.title}
                  showConfidence={topic.done}
                  initialConfidence={
                    topic.confidence === "solid" ||
                    topic.confidence === "practice" ||
                    topic.confidence === "struggling"
                      ? topic.confidence
                      : null
                  }
                  initialNote={topic.note?.body ?? ""}
                >
                {topic.parentTopicId && <p className="text-sm text-muted-foreground">{t("study.partOf", { topic: course.topics.find((parent) => parent.id === topic.parentTopicId)?.title ?? course.name })}</p>}
                {task && <StudyTaskForm courseId={course.id} topicId={topic.id} title={topic.title} task={task} materials={taskMaterials} />}
                {sourceHref && <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-ink underline underline-offset-4">{t("study.openMaterial")}</a>}
                {questions.length > 0 && (
                  <section>
                    <p className="text-sm font-medium">
                      {t("courseDetail.selfTest", { count: questions.length })}
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
                      {questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </section>
                )}
                </TopicMeta>
                </div>
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

      <details className="mb-5">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-muted-foreground">{t("courseDetail.studyPlan")}</summary>

        {/* MISSED: past sessions whose work was never completed. These are NOT the
            current plan — shown separately, with the recovery (heal) flow as the
            real way to fold them back in rather than leaving stale past dates in
            the forward list. */}
        {missed.length > 0 && (
          <details className="group mb-4 rounded-xl border border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100/60 dark:text-amber-300 dark:hover:bg-amber-950/50">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="text-amber-500 transition-transform group-open:rotate-90">›</span>
                {t("courseDetail.missedHeading")}
              </span>
              <span className="shrink-0 text-xs font-normal text-amber-700 dark:text-amber-400">
                {t.n("courseDetail.blockCount", missed.length, { min: missedMinutes })}
              </span>
            </summary>
            <div className="border-t border-amber-200 px-4 pb-4 pt-3 dark:border-amber-900/60">
              <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">{t("courseDetail.missedHint")}</p>
              <ul className="space-y-1">
                {missed.map((b) => (
                  <li
                    key={b.id}
                    className="flex justify-between gap-3 text-sm text-amber-800 dark:text-amber-300"
                  >
                    <span className="min-w-0 break-words">
                      {formatFriendlyDate(b.date.toISOString(), t.locale)} · {b.topicTitle}
                    </span>
                    <span className="shrink-0 whitespace-nowrap">{b.minutes} {t("common.min")}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}

        {byDate.size === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {missed.length > 0 ? t("courseDetail.missedOnly") : t("courseDetail.nothingScheduled")}
          </p>
        ) : (
          <div className="space-y-2">
            {[...byDate.entries()].map(([date, blocks], i) => {
              const totalMin = blocks.reduce((s, b) => s + b.minutes, 0);
              return (
                <details key={date} open={i === 0} className="group rounded-xl border border-gray-200 dark:border-gray-800">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-gray-400 transition-transform group-open:rotate-90">›</span>
                      {formatFriendlyDate(date, t.locale)}
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
      </details>

      {isSyllabusAIEnabled() && <details><summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">{t("courseDetail.updateProgressHeading")}</summary><ProgressForm courseId={course.id} /></details>}
    </main>
  );
}

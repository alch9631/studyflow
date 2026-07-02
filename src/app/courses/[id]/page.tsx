import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { X, Trash2, Check, AlertTriangle, Hourglass, FileText, ArrowLeft, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { courseOverloadInfo, todayISO } from "@/lib/planService";
import { isSyllabusAIEnabled } from "@/lib/syllabus";
import { daysUntil, formatFriendlyDate } from "@/lib/dates";
import { getT } from "@/components/i18n/server";
import { examCountdownLabel, dueLabel, type MessageKey, type Translator } from "@/components/i18n/messages";
import { FILE_CATEGORIES, isFileCategory, type FileCategory } from "@/lib/fileCategory";
import {
  healCourse,
  updateCourse,
  deleteCourse,
  reoptimizeCourse,
  deleteModuleFile,
  toggleAssignment,
  deleteAssignment,
  setGrade,
} from "../actions";
import ModuleUploadForm from "@/components/ModuleUploadForm";
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

/** Human-readable file size (e.g. "0 B", "12 KB", "3.4 MB"). Locale-agnostic. */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  // No decimals for plain bytes; one decimal (no trailing .0) for KB and up.
  const rounded = i === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[i]}`;
}

/**
 * A short, friendly type label from a MIME type / filename — PDF, Word, Text…
 * Falls back to the uppercased file extension, then a generic "File".
 */
function fileTypeHint(filename: string, mimeType: string | null): string {
  const mt = (mimeType ?? "").toLowerCase();
  if (mt.includes("pdf")) return "PDF";
  if (mt.includes("word") || mt.includes("officedocument.wordprocessingml")) return "Word";
  if (mt.includes("markdown")) return "Markdown";
  if (mt.startsWith("text/")) return "Text";
  const ext = filename.includes(".") ? filename.split(".").pop()! : "";
  if (ext) return ext.slice(0, 8).toUpperCase();
  return "File";
}

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

/** Shape of the stored analysis JSON; every field is optional/defensive. */
type FileAnalysis = {
  summary?: string;
  concepts?: string[];
  prerequisites?: string[];
  topics?: Array<string | { title?: string }>;
};

/** Parse the stored analysis JSON, guarding against null / malformed strings. */
function parseAnalysis(raw: string | null): FileAnalysis | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as FileAnalysis) : null;
  } catch {
    return null;
  }
}

/** Normalize an analysis topic entry (string or {title}) to a display string. */
function topicLabel(entry: string | { title?: string }): string {
  return typeof entry === "string" ? entry : (entry.title ?? "");
}

/**
 * Display order for the auto-classified file categories (#5). Uncategorized
 * (legacy / unrecognized) sorts last. `FILE_CATEGORIES` is the source of truth
 * for the set; this just fixes a sensible reading order for the grouped list.
 */
const CATEGORY_ORDER: (FileCategory | "uncategorized")[] = [
  "skript",
  "slides",
  "uebung",
  "altklausur",
  "mockexam",
  "sonstiges",
  "uncategorized",
];

/** Per-category badge colours — mirrors the topic-confidence badge palette. */
const CATEGORY_BADGE: Record<FileCategory | "uncategorized", string> = {
  skript:
    "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300",
  slides:
    "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300",
  uebung:
    "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
  altklausur:
    "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300",
  mockexam:
    "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  sonstiges:
    "border-gray-300 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300",
  uncategorized:
    "border-gray-300 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

// Compile-time guard: every known category has display order + a badge tone.
void (FILE_CATEGORIES satisfies readonly FileCategory[]);

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
  "grade-invalid",
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
  searchParams: Promise<{ msg?: string }>;
}) {
  const { id } = await params;
  const { msg } = await searchParams;
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
      topics: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          done: true,
          questions: true,
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
          mimeType: true,
          sizeBytes: true,
          extractedChars: true,
          analysis: true,
          category: true,
          createdAt: true,
        },
      },
      assignments: {
        orderBy: { dueDate: "asc" },
        select: { id: true, title: true, dueDate: true, done: true },
      },
    },
  });
  if (!course) notFound();

  const overload = await courseOverloadInfo(course.id);
  const doneCount = course.topics.filter((t) => t.done).length;
  const today = todayISO();
  const examInDays = daysUntil(course.examDate, today);

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

  // #5 — Group uploaded files by auto-classified category, then render the
  // groups in CATEGORY_ORDER. Files keep their newest-first order within a
  // group (the query already sorts by createdAt desc). Legacy/unknown rows fall
  // into "uncategorized".
  type CourseFile = (typeof course.files)[number];
  const filesByCategory = new Map<FileCategory | "uncategorized", CourseFile[]>();
  for (const f of course.files) {
    const key = isFileCategory(f.category) ? f.category : "uncategorized";
    if (!filesByCategory.has(key)) filesByCategory.set(key, []);
    filesByCategory.get(key)!.push(f);
  }
  const fileGroups = CATEGORY_ORDER.filter((c) => filesByCategory.has(c)).map(
    (c) => [c, filesByCategory.get(c)!] as const,
  );

  // Whether AI Practice Mode has anything to show: at least one topic carries a
  // non-empty `questions` JSON array. Gates the "Practice" entry point so it
  // never leads into an empty state.
  const hasPracticeQuestions = course.topics.some((topic) => {
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
                                  ? "font-medium text-red-600 dark:text-red-400"
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
          variant={
            ["progress-none", "progress-error", "optimize-failed", "ai-unconfigured", "ai-offline", "heal-failed", "healed-over", "analyze-error", "analyze-unsupported", "analyze-nofile", "past-exam", "exam-too-far", "limit-assignments", "rate-limited"].includes(msg ?? "")
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
              <Hourglass className="mr-1 inline-block h-3 w-3 align-[-1px]" aria-hidden="true" />
              {examCountdownLabel(t, examInDays)}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t("courseDetail.examOn", {
                date: formatFriendlyDate(course.examDate.toISOString(), t.locale),
                pace: hoursLabel(t, course.minutesPerDay),
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

      {overload.overloaded && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {/* Truthful, plan-derived headline: the REAL required pace + days
                  left, phrased calmly (rounded to ~h/day to match the page). */}
              {overload.cause === "no-runway"
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
        </div>
      )}

      <section className="mb-8">
        <details className="group rounded-xl border border-gray-200 dark:border-gray-800">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl p-4 text-lg font-semibold transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="text-gray-400 transition-transform group-open:rotate-90"
              >
                ›
              </span>
              {t("courseDetail.materials")}
            </span>
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-normal text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {course.files.length}
            </span>
          </summary>

          <div className="space-y-4 border-t border-gray-100 px-4 pb-4 pt-4 dark:border-gray-800">
            {isSyllabusAIEnabled() ? (
              <ModuleUploadForm courseId={course.id} collapsible />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("courseDetail.apiKeyFiles")}
              </p>
            )}

            {course.files.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {t("courseDetail.noFiles")}
              </p>
            ) : (
              <div className="space-y-4">
                {fileGroups.map(([category, files]) => (
              <div key={category}>
                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium normal-case tracking-normal ${CATEGORY_BADGE[category]}`}
                  >
                    {t(`courseDetail.fileCategory.${category}` as MessageKey)}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500">({files.length})</span>
                </h4>
                <AnimatedList className="space-y-2">
                  {files.map((file) => {
                    const analysis = parseAnalysis(file.analysis);
                    const typeHint = fileTypeHint(file.filename, file.mimeType);
                    const uploaded = file.createdAt.toISOString().slice(0, 10);
                    const concepts = analysis?.concepts?.filter(Boolean) ?? [];
                    const prerequisites = analysis?.prerequisites?.filter(Boolean) ?? [];
                    const topics = (analysis?.topics ?? []).map(topicLabel).filter(Boolean);
                    const hasAnalysis =
                      Boolean(analysis?.summary) ||
                      concepts.length > 0 ||
                      prerequisites.length > 0 ||
                      topics.length > 0;
                    return (
                      <AnimatedListItem
                        key={file.id}
                        className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
                      >
                        <div className="flex items-start gap-3">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <div className="break-words font-medium">{file.filename}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${CATEGORY_BADGE[category]}`}
                              >
                                {t(`courseDetail.fileCategory.${category}` as MessageKey)}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                {typeHint}
                              </span>
                              <span>{formatBytes(file.sizeBytes)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{t("courseDetail.fileUploaded", { date: uploaded })}</span>
                              {file.extractedChars > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    {t("courseDetail.fileChars", {
                                      count: file.extractedChars.toLocaleString(t.locale),
                                    })}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <ConfirmDialog
                            action={deleteModuleFile}
                            fields={{ moduleFileId: file.id }}
                            successMessage={t("courseDetail.fileRemoved")}
                            errorMessage={t("courseDetail.fileRemoveError")}
                            className="shrink-0"
                            triggerLabel={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                            triggerAriaLabel={t("courseDetail.deleteFileAria", { filename: file.filename })}
                            triggerClassName={iconButtonClass(
                              "inline-flex text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-800",
                            )}
                            title={t("courseDetail.deleteFileTitle")}
                            message={
                              <>
                                {t("courseDetail.deleteFileMsgPre")} <strong>{file.filename}</strong>{" "}
                                {t("courseDetail.deleteFileMsgPost")}
                              </>
                            }
                            confirmLabel={t("courseDetail.deleteFileConfirm")}
                            pendingLabel={t("courseDetail.removing")}
                          />
                        </div>

                        {hasAnalysis ? (
                          <details className="group mt-2">
                            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-brand-ink">
                              <span
                                aria-hidden="true"
                                className="transition-transform group-open:rotate-90"
                              >
                                ›
                              </span>
                              {t("courseDetail.fileShowAnalysis")}
                            </summary>
                            <div className="mt-2 space-y-2 border-t border-gray-100 pt-2 text-sm dark:border-gray-800">
                              {analysis?.summary && (
                                <p className="text-gray-600 dark:text-gray-300">{analysis.summary}</p>
                              )}
                              {concepts.length > 0 && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {t("courseDetail.concepts", { list: concepts.slice(0, 12).join(", ") })}
                                </p>
                              )}
                              {prerequisites.length > 0 && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {t("courseDetail.prerequisites", { list: prerequisites.join(", ") })}
                                </p>
                              )}
                              {topics.length > 0 && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {t("courseDetail.detectedTopics", { list: topics.slice(0, 12).join(", ") })}
                                </p>
                              )}
                            </div>
                          </details>
                        ) : (
                          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                            {t("courseDetail.fileNoAnalysis")}
                          </p>
                        )}
                      </AnimatedListItem>
                    );
                  })}
                </AnimatedList>
              </div>
            ))}
              </div>
            )}
          </div>
        </details>
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

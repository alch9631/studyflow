"use client";

import { useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { previewExamDates, rebuildAfterExamSync, syncExamDates } from "@/app/settings/examActions";
import { TUHH_EXAM_URL, type ExamDateChange, type ExamSyncError, type ExamSyncPreview } from "@/lib/examSyncTypes";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { useT } from "./i18n/I18nProvider";

export default function ExamDateSync() {
  const t = useT();
  const id = useId();
  const previewHeading = useRef<HTMLParagraphElement>(null);
  const [busy, startTransition] = useTransition();
  const [preview, setPreview] = useState<ExamSyncPreview | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [error, setError] = useState<ExamSyncError | null>(null);
  const [updated, setUpdated] = useState<number | null>(null);
  const [needsRebuild, setNeedsRebuild] = useState(false);
  const dateFormatter = new Intl.DateTimeFormat(t.locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const formatDate = (date: string) => dateFormatter.format(new Date(`${date}T00:00:00Z`));

  const examsByKey = new Map(preview?.exams.map((exam) => [exam.key, exam]));
  const changes: ExamDateChange[] = (preview?.courses ?? []).flatMap((course) => {
    const key = selection[course.id] ?? "";
    const exam = examsByKey.get(key);
    return exam?.date && exam.date !== course.currentDate
      ? [{ courseId: course.id, expectedDate: course.currentDate, examKey: key }] : [];
  });

  function refresh() {
    setError(null);
    if (!needsRebuild) setUpdated(null);
    startTransition(async () => {
      try {
        const result = await previewExamDates();
        if (!result.ok) { setError(result.reason); return; }
        setPreview(result.preview);
        setSelection(Object.fromEntries(result.preview.courses.map((course) => [course.id, course.suggestedKey])));
        requestAnimationFrame(() => previewHeading.current?.focus());
      } catch {
        setError("source-unavailable");
      }
    });
  }

  function apply() {
    if (!preview || !changes.length) return;
    setError(null);
    setUpdated(null);
    startTransition(async () => {
      try {
        const result = await syncExamDates(changes);
        if (!result.ok) { setError(result.reason); return; }
        const newDates = new Map(changes.map((change) => [change.courseId, examsByKey.get(change.examKey)!.date!]));
        setPreview({ ...preview, checkedAt: result.checkedAt, courses: preview.courses.map((course) => {
          const date = newDates.get(course.id);
          return date ? { ...course, currentDate: date, suggestedKey: "", hint: "matched" } : course;
        }) });
        setSelection({});
        setUpdated(result.updated);
        setNeedsRebuild(!result.planRebuilt);
      } catch {
        // A lost response may follow a successful save; refresh before retrying.
        setError("conflict");
      }
    });
  }

  function retryRebuild() {
    startTransition(async () => {
      try {
        if (await rebuildAfterExamSync()) { setNeedsRebuild(false); setError(null); }
        else setError("save-error");
      } catch {
        setError("save-error");
      }
    });
  }

  return (
    <div className="mt-3 space-y-4" aria-busy={busy}>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={busy} onClick={refresh}>
          {busy ? t("examSync.working") : preview ? t("examSync.refresh") : t("examSync.check")}
        </Button>
        <a href={TUHH_EXAM_URL} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4">
          {t("examSync.source")}
        </a>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {updated !== null && <p className="text-sm">{t.n(needsRebuild ? "examSync.savedWithoutPlan" : "examSync.saved", updated)}</p>}
        {needsRebuild && <Button type="button" className="mt-2" variant="secondary" disabled={busy} onClick={retryRebuild}>{t("examSync.retryPlan")}</Button>}
      </div>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{t(`examSync.errors.${error}`)}</p>}

      {preview && (
        <div>
          <p ref={previewHeading} tabIndex={-1} className="text-sm font-medium">
            {preview.semester}
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              {t("examSync.checked", { date: new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(preview.checkedAt)) })}
            </span>
          </p>
          {preview.courses.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("examSync.noCourses")}</p>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); apply(); }}>
              <p className="mt-3 text-sm text-muted-foreground">{t("examSync.reviewHint")}</p>
              {preview.exams.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{t("examSync.noDates")}</p>}
              <ul className="mt-3 divide-y divide-border">
                {preview.courses.map((course) => {
                  const key = selection[course.id] ?? "";
                  const exam = examsByKey.get(key);
                  const hintId = `${id}-${course.id}-hint`;
                  return (
                    <li key={course.id} className="min-w-0 space-y-2 py-4">
                      <p className="break-words text-sm font-semibold">{course.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("examSync.currentDate", { date: formatDate(course.currentDate) })}
                      </p>
                      <p id={hintId} className="text-xs text-muted-foreground">
                        {t(course.hint === "matched" && !course.suggestedKey ? "examSync.upToDate" : `examSync.hints.${course.hint}`)}
                      </p>
                      {course.hint === "individual" && (
                        <Link href={`/courses/${course.id}`} className="inline-block text-sm underline underline-offset-4">{t("examSync.openCourse")}</Link>
                      )}
                      {course.hint !== "individual" && preview.exams.length > 0 && (
                        <>
                          <label htmlFor={`${id}-${course.id}`} className="sr-only">{t("examSync.chooseDate", { course: course.name })}</label>
                          <Select id={`${id}-${course.id}`} className="w-full min-w-0" value={key} disabled={busy} aria-describedby={hintId}
                            onChange={(event) => setSelection((current) => ({ ...current, [course.id]: event.target.value }))}>
                            <option value="">{t("examSync.keepDate")}</option>
                            {preview.exams.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.title} · {formatDate(option.date!)}{option.time ? ` · ${option.time}` : ""}
                              </option>
                            ))}
                          </Select>
                        </>
                      )}
                      {exam?.date && exam.date !== course.currentDate && (
                        <div className="space-y-1 text-sm">
                          <p className="font-medium">{t("examSync.newDate", { date: formatDate(exam.date) })}</p>
                          {exam.location && <p className="break-words text-muted-foreground">{exam.location}</p>}
                          {exam.note && <p className="break-words text-muted-foreground">{exam.note}</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={busy || !changes.length || !!error || needsRebuild}>
                  {busy ? t("examSync.working") : t.n("examSync.apply", changes.length)}
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => { setPreview(null); setSelection({}); setError(null); }}>
                  {t("common.close")}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

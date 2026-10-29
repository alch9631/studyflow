"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { ExternalLink, Pencil, RefreshCw } from "lucide-react";
import { useT } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { iconButtonClass } from "@/components/ui";
import { rebuildAfterExamSync, syncExamDates } from "@/app/settings/examActions";
import { TUHH_EXAM_URL, type ExamOptionsResult, type ExamsPageData, type ExamSyncError, type RemainingExam } from "@/lib/examSyncTypes";
import { getExamOptions, refreshExamDates } from "./actions";
import { examColorMap } from "@/lib/examOverview";
import ExamOverview, { ExamColorKey } from "./ExamOverview";

type ExamOption = Extract<ExamOptionsResult, { ok: true }>["exams"][number];
const searchName = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");

export default function ExamsList({ data }: { data: ExamsPageData }) {
  const t = useT();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<ExamSyncError | null>(null);
  const [updated, setUpdated] = useState<number | null>(null);
  const [needsRebuild, setNeedsRebuild] = useState(false);
  const [matching, setMatching] = useState<RemainingExam | null>(null);
  const [options, setOptions] = useState<ExamOption[] | null>(null);
  const [matchError, setMatchError] = useState<ExamSyncError | null>(null);
  const [query, setQuery] = useState("");
  const matchTrigger = useRef<HTMLButtonElement | null>(null);
  const optionRequest = useRef(0);
  const colors = examColorMap(data.courses);
  const dateFormatter = new Intl.DateTimeFormat(t.locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const formatDate = (date: string) => dateFormatter.format(new Date(`${date}T00:00:00Z`));
  const matches = options?.filter((exam) => query.trim().split(/\s+/).every((word) => searchName(exam.title).includes(searchName(word)))) ?? [];

  function selectDate(date: string) {
    const course = data.courses.find((entry) => entry.currentDate === date);
    if (!course) return;
    const row = document.getElementById(`exam-row-${course.id}`);
    row?.querySelector<HTMLAnchorElement>("[data-exam-link]")?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function refresh() {
    setError(null);
    setUpdated(null);
    startTransition(async () => {
      try {
        const result = await refreshExamDates();
        if (!result.ok) { setError(result.reason); return; }
        setUpdated(result.updated);
        // A previous failed rebuild still needs retrying after a date-only check.
        setNeedsRebuild((previous) => !result.planRebuilt || (previous && result.updated === 0));
      } catch { setError("save-error"); }
    });
  }

  async function openMatcher(course: RemainingExam, trigger: HTMLButtonElement | null) {
    const request = ++optionRequest.current;
    matchTrigger.current = trigger;
    setMatching(course);
    setOptions(null);
    setMatchError(null);
    setQuery("");
    try {
      const result = await getExamOptions(course.id);
      if (request !== optionRequest.current) return;
      if (result.ok) setOptions(result.exams);
      else setMatchError(result.reason);
    } catch { if (request === optionRequest.current) setMatchError("save-error"); }
  }

  function closeMatcher() {
    optionRequest.current++;
    setMatching(null);
  }

  function chooseExam(exam: ExamOption) {
    if (!matching || busy) return;
    setMatchError(null);
    startTransition(async () => {
      try {
        const result = await syncExamDates([{ courseId: matching.id, expectedDate: matching.currentDate, examKey: exam.key }]);
        if (!result.ok) { setMatchError(result.reason); return; }
        setUpdated(result.updated);
        setError(null);
        setNeedsRebuild((previous) => !result.planRebuilt || (previous && result.updated === 0));
        closeMatcher();
      } catch { setMatchError("conflict"); }
    });
  }

  function retryPlan() {
    startTransition(async () => {
      try {
        if (await rebuildAfterExamSync()) { setNeedsRebuild(false); setError(null); }
        else setError("save-error");
      } catch { setError("save-error"); }
    });
  }

  function examRows(courses: RemainingExam[]) {
    return <ul className="divide-y divide-border">
      {courses.map((course, index) => {
        const verified = course.published?.date === course.currentDate;
        const startsOldDates = course.currentDate < data.today && (index === 0 || courses[index - 1].currentDate >= data.today);
        return <li key={course.id} id={`exam-row-${course.id}`} data-exam-row className="min-w-0 scroll-mt-24 py-4">
          {startsOldDates && <h2 key="check-heading" className="mb-3 mt-4 text-sm font-medium text-muted-foreground">{t("exams.checkDates")}</h2>}
          <div key="exam-content" className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link href={`/courses/${course.id}`} data-exam-link className="inline-flex min-h-11 max-w-full items-center gap-2 py-2 text-base font-medium hover:underline [overflow-wrap:anywhere]"><ExamColorKey color={colors.get(course.id)!} /><span className="min-w-0 [overflow-wrap:anywhere]">{course.name}</span></Link>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <time dateTime={course.currentDate} className="tabular-nums">{formatDate(course.currentDate)}</time>
              {verified && course.published?.time && <span>{course.published.time}</span>}
              {verified && <span className="text-muted-foreground">TUHH</span>}
            </p>
            {!verified && data.checkedAt && <p className="mt-1 text-sm text-muted-foreground">
              {course.published?.date
                ? t("exams.publishedDate", { date: formatDate(course.published.date) }) : t(`exams.hints.${course.hint}`)}
            </p>}
          </div>
          {data.checkedAt && <button type="button" aria-disabled={busy} onClick={(event) => { if (!busy) void openMatcher(course, event.currentTarget); }}
            aria-label={t("exams.chooseFor", { course: course.name })} title={t("exams.choose")}
            className={iconButtonClass("inline-flex shrink-0 items-center justify-center text-muted-foreground hover:bg-accent aria-disabled:opacity-50")}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>}
          </div>
        </li>;
      })}
    </ul>;
  }

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{t("exams.title")}</h1>
      <Button type="button" variant="secondary" disabled={busy} onClick={refresh} aria-busy={busy}>
        <RefreshCw className={`h-4 w-4 shrink-0 ${busy ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />
        {busy ? t("exams.refreshing") : t("exams.refresh")}
      </Button>
    </div>
    <div role="status" aria-atomic="true" className="text-sm">
      {updated !== null && !needsRebuild && <p className="mt-3">{updated ? t.n("exams.updated", updated) : t("exams.checkedNow")}</p>}
      {needsRebuild && <div className="mt-3">
        <p>{t("exams.planPending")}</p>
        <Button type="button" variant="secondary" className="mt-2" disabled={busy} onClick={retryPlan}>{t("examSync.retryPlan")}</Button>
      </div>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{t(`exams.errors.${error}`)}</p>}

    <ExamOverview courses={data.courses} today={data.today} colors={colors} onSelectDate={selectDate} />

    {data.courses.length === 0 ? <div className="py-14 text-center">
      <p className="text-muted-foreground">{t("exams.empty")}</p>
      <Button asChild variant="secondary" className="mt-4"><Link href="/courses">{t("nav.courses")}</Link></Button>
    </div> : <div className="mt-2">
      {examRows(data.courses)}
    </div>}

    <footer className="mt-6 border-t border-border pt-3 text-sm text-muted-foreground">
      <p className="mb-1 [overflow-wrap:anywhere]">{data.checkedAt ? t("exams.checked", { date: new Intl.DateTimeFormat(t.locale, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(data.checkedAt)) }) : t("exams.savedDate")}</p>
      {data.semester && <p className="mb-1">{data.semester}</p>}
      <a href={TUHH_EXAM_URL} target="_blank" rel="noopener noreferrer" aria-label={t("examSync.source")}
        className="inline-flex min-h-11 items-center gap-1.5 py-2 underline underline-offset-4">
        {t("exams.source")}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </footer>

    <Dialog open={!!matching} onOpenChange={(open) => { if (!open && !busy) closeMatcher(); }}>
      <DialogContent mobileSheet showCloseButton={!busy} onCloseAutoFocus={(event) => { event.preventDefault(); matchTrigger.current?.focus(); }}>
        <DialogTitle>{t("exams.choose")}</DialogTitle>
        <DialogDescription className="[overflow-wrap:anywhere]">{matching?.name}</DialogDescription>
        {matchError ? <div className="mt-4">
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">{t(`exams.errors.${matchError}`)}</p>
          <Button type="button" className="mt-3" variant="secondary" onClick={() => { closeMatcher(); refresh(); }}>{t("exams.refresh")}</Button>
        </div> : options === null ? <p role="status" className="mt-4 text-sm text-muted-foreground">{t("exams.loading")}</p> : <>
          <label className="mt-4 block">
            <span className="sr-only">{t("exams.search")}</span>
            <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("exams.search")} className="w-full text-base" disabled={busy} />
          </label>
          <div aria-busy={busy} className="mt-3">
            {busy && <p role="status" className="mb-2 text-sm">{t("common.saving")}</p>}
            {matches.length === 0 ? <p role="status" className="py-4 text-sm text-muted-foreground">{t("exams.noMatches")}</p> : <ul className="divide-y divide-border">
              {matches.slice(0, 20).map((exam) => <li key={exam.key}>
                <button type="button" className="min-h-11 w-full py-3 text-left hover:bg-accent [overflow-wrap:anywhere] disabled:opacity-50" disabled={busy} onClick={() => chooseExam(exam)}>
                  <span className="block text-base font-medium">{exam.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{formatDate(exam.date!)}{exam.time && ` · ${exam.time}`}</span>
                </button>
              </li>)}
            </ul>}
            {matches.length > 20 && <p className="mt-3 text-sm text-muted-foreground">{t("exams.refineSearch")}</p>}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
